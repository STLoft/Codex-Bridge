'use strict';
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Engine } = require('./engine.cjs');
const { Store } = require('./store.cjs');
const { parseChat, StopFilter, completionMeta } = require('./protocol.cjs');
const VERSION = require('./package.json').version;
function errorText(e) { return String(e?.message || '알 수 없는 오류').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 1600); }
function sendJson(res, status, value) { if (res.destroyed || res.writableEnded) return; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function problem(res, error, status = error.status || 503) { sendJson(res, status, { error: { message: errorText(error), type: 'codex_bridge_error', code: status } }); }

class Bridge {
    constructor({ root = __dirname, env = process.env, engine, store, port } = {}) {
        this.root = root; this.env = env; this.engine = engine; this.store = store;
        this.port = port ?? Number(env.ST_CODEX_CHAT_PORT || 7861); this.active = 0; this.controllers = new Set(); this.statusCache = null;
        this.modelCache = []; this.modelsUpdatedAt = null; this.modelsError = ''; this.modelsPending = null;
    }
    async start() {
        if (!Number.isInteger(this.port) || this.port < 0 || this.port > 65535) throw new Error('ST_CODEX_CHAT_PORT 값이 올바르지 않습니다.');
        const workspace = path.join(this.root, 'workspace'); await fs.mkdir(workspace, { recursive: true });
        this.store ||= await new Store(path.join(this.root, 'data')).init(); this.engine ||= new Engine(workspace, this.env);
        if (this.engine.transport === 'exec') this.modelCache = [{ id: 'codex-default', name: 'Codex CLI 기본 모델', isDefault: true, efforts: [] }];
        this.server = http.createServer((req, res) => { this.handle(req, res).catch(e => problem(res, e)); });
        this.server.requestTimeout = 30000; this.server.headersTimeout = 15000;
        await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, '127.0.0.1', resolve); });
        this.port = this.server.address().port; this.apiUrl = `http://127.0.0.1:${this.port}/v1`;
        // Exactly one automatic catalog query per server start. A failed startup
        // query is retried only by the user's explicit refresh action.
        await this.refreshModels();
        return this;
    }
    async status(force = false) {
        if (!force && this.statusCache && Date.now() - this.statusCache.at < 30000) return { ...this.statusCache.value, active: this.active };
        let value;
        try { value = { ok: true, ...await this.engine.status() }; }
        catch (e) { value = { ok: true, available: false, loggedIn: false, limits: null, error: errorText(e), transport: this.engine.transport }; }
        value = { ...value, capabilities: { profileReasoning: true }, versionBridge: VERSION, apiUrl: this.apiUrl, settings: this.store.settings, checkedAt: new Date().toISOString() };
        this.statusCache = { at: Date.now(), value }; return { ...value, active: this.active };
    }
    async models() { return this.modelCache; }
    modelSnapshot() { return { models: this.modelCache, modelsUpdatedAt: this.modelsUpdatedAt, modelsError: this.modelsError }; }
    async refreshModels() {
        if (this.modelsPending) return this.modelsPending;
        this.modelsPending = (async () => {
            try {
                const models = await this.engine.models();
                if (!Array.isArray(models) || !models.length) throw new Error('CLI가 빈 모델 목록을 반환했습니다. 기존 목록을 유지합니다.');
                this.modelCache = models; this.modelsUpdatedAt = new Date().toISOString(); this.modelsError = '';
            } catch (e) { this.modelsError = errorText(e); }
            return this.modelSnapshot();
        })();
        try { return await this.modelsPending; } finally { this.modelsPending = null; }
    }
    async handle(req, res) {
        // ST's backend fetch has no Origin. Reject all browser-origin traffic,
        // non-loopback callers and rebinding Host names. No CORS is enabled.
        const remote = req.socket.remoteAddress;
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) || req.headers.origin || req.headers['sec-fetch-site'] ||
            !new Set([`127.0.0.1:${this.port}`, `localhost:${this.port}`]).has(req.headers.host)) return sendJson(res, 403, { error: { message: '서버 내부 연결만 허용됩니다.' } });
        const url = new URL(req.url, this.apiUrl);
        if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, bridge: 'ST-Codex-Bridge', version: VERSION });
        if (req.method === 'GET' && url.pathname === '/v1/models') {
            const models = await this.models(); return sendJson(res, 200, { object: 'list', data: models.map(m => ({ id: m.id, object: 'model', created: 0, owned_by: 'codex-cli' })) });
        }
        if (req.method !== 'POST' || url.pathname !== '/v1/chat/completions') return sendJson(res, 404, { error: { message: '경로를 찾지 못했습니다.' } });
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return sendJson(res, 415, { error: { message: 'application/json 요청이 필요합니다.' } });
        if (this.active >= 3) return sendJson(res, 429, { error: { message: '진행 중인 요청이 많습니다. 잠시 후 다시 시도하세요.' } });
        const chunks = []; let length = 0;
        for await (const chunk of req) {
            length += chunk.length; if (length > 5 * 1024 * 1024) return sendJson(res, 413, { error: { message: '요청이 너무 큽니다.' } }); chunks.push(chunk);
        }
        let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return sendJson(res, 400, { error: { message: 'JSON 형식이 올바르지 않습니다.' } }); }
        const chat = parseChat(body);
        const supported = this.modelCache.find(m => m.id === chat.model)?.efforts;
        if (chat.effort && supported?.length && !supported.includes(chat.effort)) return sendJson(res, 400, { error: { message: '선택한 모델이 지원하는 추론 단계를 확인하세요.' } });
        if (this.active >= 3) return sendJson(res, 429, { error: { message: '진행 중인 요청이 많습니다.' } });
        await this.complete(chat, req, res);
    }
    async complete(chat, req, res) {
        const meta = completionMeta(chat.model), started = Date.now();
        const controller = new AbortController(), filter = new StopFilter(chat.stops);
        this.controllers.add(controller); this.active++;
        let text = '', usage = null, state = 'failed';
        const closed = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close', closed);
        const sse = payload => { if (!res.destroyed && !res.writableEnded) res.write(`data: ${typeof payload === 'string' ? payload : JSON.stringify(payload)}\n\n`); };
        let heartbeat;
        if (chat.stream) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
            sse({ ...meta, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
            heartbeat = setInterval(() => { if (!res.destroyed) res.write(': keepalive\n\n'); }, 15000);
        }
        const emit = delta => { if (!delta) return; text += delta; if (text.length > 4000000) { controller.abort(); throw new Error('답변이 너무 깁니다.'); }
            if (chat.stream) sse({ ...meta, object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: delta }, finish_reason: null }] }); };
        try {
            const result = await this.engine.generate(chat, { signal: controller.signal, effort: chat.effort ?? this.store.settings.effort, onDelta: delta => emit(filter.push(delta)) });
            usage = result.usage; emit(filter.end());
            if (controller.signal.aborted) throw new Error('요청이 취소되었습니다.');
            if (!text) throw new Error('Codex CLI가 빈 답변을 반환했습니다.');
            state = 'completed';
            if (chat.stream) {
                sse({ ...meta, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], ...(usage ? { usage } : {}) }); sse('[DONE]'); res.end();
            } else sendJson(res, 200, { ...meta, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], ...(usage ? { usage } : {}) });
        } catch (e) {
            if (controller.signal.aborted) state = 'cancelled';
            if (chat.stream) { sse({ error: { message: errorText(e), type: 'codex_bridge_error' } }); res.end(); }
            else problem(res, e);
        } finally {
            clearInterval(heartbeat); res.off('close', closed); this.controllers.delete(controller); this.active--;
            try { await this.store.add({ id: meta.id, at: new Date(started).toISOString(), model: chat.model, state, durationMs: Date.now() - started, usage }); }
            catch (e) { console.error('[Codex Bridge] 사용 기록 저장 실패:', errorText(e)); }
            this.statusCache = null;
        }
    }
    async close() {
        for (const controller of this.controllers) controller.abort(); await this.engine?.close();
        if (this.server?.listening) await new Promise(resolve => { this.server.close(resolve); this.server.closeAllConnections(); });
        await this.store?.queue;
    }
}
module.exports = { Bridge, errorText, VERSION };

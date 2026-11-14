'use strict';
const { Rpc } = require('./rpc.cjs');
const { resolveCli, isTermux, runCli } = require('./cli.cjs');
const { usageFrom, RP_INSTRUCTIONS } = require('./protocol.cjs');

const DISABLED_FEATURES = ['shell_tool', 'unified_exec', 'apps', 'plugins', 'remote_plugin', 'hooks', 'multi_agent', 'multi_agent_v2', 'image_generation', 'view_image', 'computer_use', 'browser_use', 'in_app_browser', 'code_mode', 'code_mode_host', 'skill_search'];
const SAFE_CONFIG = Object.fromEntries([
    ...DISABLED_FEATURES.map(name => [`features.${name}`, false]),
    ['agents.enabled', false], ['web_search', 'disabled'], ['skills.include_instructions', false],
    ['skills.bundled.enabled', false], ['memories.generate_memories', false], ['memories.use_memories', false],
    ['project_doc_max_bytes', 0], ['apps._default.enabled', false],
]);

function safeArgs() {
    return Object.entries(SAFE_CONFIG).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]);
}

class Engine {
    constructor(cwd, env = process.env) {
        Object.assign(this, { cwd, env, active: new Set(), control: null, starting: null, closed: false });
        this.transport = env.ST_CODEX_CHAT_TRANSPORT || (isTermux(env) ? 'exec' : 'app-server');
        if (!['exec', 'app-server'].includes(this.transport)) throw new Error('ST_CODEX_CHAT_TRANSPORT는 app-server 또는 exec여야 합니다.');
    }
    async createRpc() {
        if (this.closed) throw new Error('브리지가 종료되었습니다.');
        const cli = await resolveCli(this.env);
        const rpc = new Rpc(cli, this.cwd, this.env);
        // Process-wide overrides take effect before project settings are resolved.
        const original = rpc.cli;
        rpc.cli = { command: original.command, prefix: [...original.prefix, ...safeArgs()] };
        this.active.add(rpc);
        rpc.once('closed', () => { this.active.delete(rpc); if (this.control === rpc) this.control = null; });
        try { return await rpc.start(); } catch (e) { await rpc.close(); this.active.delete(rpc); throw e; }
    }
    async getControl() {
        if (this.control && !this.control.closed) return this.control;
        if (!this.starting) this.starting = this.createRpc().then(rpc => (this.control = rpc)).finally(() => { this.starting = null; });
        return this.starting;
    }
    async status() {
        const cli = await resolveCli(this.env);
        const version = await runCli(cli, ['--version'], { cwd: this.cwd, env: this.env, timeout: 15000 });
        if (version.code !== 0) throw new Error('Codex CLI 실행에 실패했습니다.');
        if (this.transport === 'exec') {
            const login = await runCli(cli, ['login', 'status'], { cwd: this.cwd, env: this.env, timeout: 15000 });
            return { available: true, version: version.stdout.trim(), transport: this.transport, loggedIn: login.code === 0 && /ChatGPT/i.test(login.stdout + login.stderr),
                planType: null, limits: null, quotaError: 'exec 모드에서는 공식 잔량 조회를 지원하지 않습니다. 토큰 기록은 대화 후 표시됩니다.' };
        }
        const rpc = await this.getControl();
        const account = await rpc.request('account/read', { refreshToken: false });
        let limits = null, quotaError = '';
        if (account.account?.type === 'chatgpt') {
            try { limits = await rpc.request('account/rateLimits/read'); } catch (e) { quotaError = e.message; }
        } else quotaError = account.account ? '공식 잔량은 ChatGPT 로그인에서만 조회됩니다.' : '서버 터미널에서 codex login을 실행하세요.';
        return { available: true, version: version.stdout.trim(), transport: this.transport, loggedIn: account.account?.type === 'chatgpt',
            planType: account.account?.planType || account.account?.type || null, limits, quotaError };
    }
    async models() {
        if (this.transport === 'exec') return [{ id: 'codex-default', name: 'Codex CLI 기본 모델', isDefault: true, efforts: [] }];
        const rpc = await this.getControl();
        const result = new Map(), seen = new Set(); let cursor;
        do {
            const page = await rpc.request('model/list', { limit: 100, ...(cursor ? { cursor } : {}) });
            if (!Array.isArray(page?.data)) throw new Error('모델 목록 응답을 읽지 못했습니다.');
            for (const m of page.data) if (!m.hidden && typeof m.model === 'string') {
                result.set(m.model, { id: m.model, name: m.displayName || m.model, isDefault: !!m.isDefault,
                    efforts: (m.supportedReasoningEfforts || []).map(x => x.reasoningEffort), defaultEffort: m.defaultReasoningEffort });
            }
            cursor = page.nextCursor;
            if (cursor && seen.has(cursor)) throw new Error('모델 목록 페이지가 반복됩니다.');
            if (cursor) seen.add(cursor);
        } while (cursor);
        return [...result.values()];
    }
    async generate(chat, { signal, onDelta, effort = 'medium', timeout = 180000 }) {
        return this.transport === 'exec' ? this.generateExec(chat, { signal, onDelta, effort, timeout }) : this.generateRpc(chat, { signal, onDelta, effort, timeout });
    }
    async generateRpc(chat, { signal, onDelta, effort, timeout }) {
        if (signal?.aborted) throw new Error('요청이 취소되었습니다.');
        const rpc = await this.createRpc();
        const abortRpc = () => rpc.close();
        signal?.addEventListener('abort', abortRpc, { once: true });
        let cancelWait;
        try {
            if (signal?.aborted) throw new Error('요청이 취소되었습니다.');
            // Disable inherited MCP entries individually: an empty TOML table can
            // merge with the user's table instead of replacing it.
            const cfg = await rpc.request('config/read', { includeLayers: true, cwd: this.cwd });
            const account = await rpc.request('account/read', { refreshToken: false });
            if (account.account?.type !== 'chatgpt') throw new Error('ChatGPT 로그인으로 연결하세요. 서버 터미널에서 codex login을 실행하세요.');
            const config = { ...SAFE_CONFIG };
            for (const name of Object.keys(cfg.config?.mcp_servers || {})) config[`mcp_servers.${name}.enabled`] = false;
            for (const layer of cfg.layers || []) {
                for (const name of Object.keys(layer.config?.mcp_servers || {})) config[`mcp_servers.${name}.enabled`] = false;
            }
            const thread = await rpc.request('thread/start', {
                model: chat.model, cwd: this.cwd, approvalPolicy: 'never', sandbox: 'read-only',
                ephemeral: true, personality: 'none', baseInstructions: chat.instructions,
                developerInstructions: 'This is text-only roleplay. No tool operations are permitted.', config,
            });
            const threadId = thread.thread?.id;
            if (!threadId) throw new Error('CLI가 대화 ID를 반환하지 않았습니다.');
            let usage = null;
            const phases = new Map(), texts = new Map();
            const wait = new Promise((resolve, reject) => {
                let settled = false;
                const cleanup = () => { clearTimeout(timer); rpc.off('notification', notice); rpc.off('closed', close); signal?.removeEventListener('abort', abort); };
                const finish = (error) => { if (settled) return; settled = true; cleanup(); error ? reject(error) : resolve({ usage }); };
                const close = () => finish(new Error('Codex CLI 연결이 응답 도중 종료되었습니다.'));
                const abort = () => finish(new Error('요청이 취소되었습니다.'));
                const timer = setTimeout(() => finish(new Error('Codex 대화 응답 시간이 초과되었습니다.')), timeout);
                const notice = (method, params) => {
                    try {
                    if (params.threadId && params.threadId !== threadId) return;
                    if (method === 'thread/tokenUsage/updated') usage = usageFrom(params.tokenUsage?.total);
                    if (method === 'item/started' && params.item?.type === 'agentMessage') phases.set(params.item.id, params.item.phase);
                    if (method === 'item/agentMessage/delta' && phases.get(params.itemId) !== 'commentary') {
                        texts.set(params.itemId, (texts.get(params.itemId) || '') + params.delta); onDelta(params.delta);
                    }
                    if (method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.phase !== 'commentary') {
                        const item = params.item; if (!texts.has(item.id) && item.text) { texts.set(item.id, item.text); onDelta(item.text); }
                    }
                    if (method === 'turn/completed') finish(params.turn?.status === 'completed' ? null : new Error(params.turn?.error?.message || `Codex 대화가 ${params.turn?.status || '실패'} 상태로 끝났습니다.`));
                    } catch (e) { finish(e); }
                };
                rpc.on('notification', notice); rpc.once('closed', close); signal?.addEventListener('abort', abort, { once: true });
                cancelWait = finish;
            });
            // Notifications can arrive before the turn/start response.
            wait.catch(() => {});
            try {
                await rpc.request('turn/start', { threadId, input: [{ type: 'text', text: chat.input, text_elements: [] }], effort }, 60000);
                return await wait;
            } catch (e) { cancelWait(e); throw e; }
        } finally {
            signal?.removeEventListener('abort', abortRpc); await rpc.close(); this.active.delete(rpc);
        }
    }
    async generateExec(chat, { signal, onDelta, effort, timeout }) {
        const cli = await resolveCli(this.env);
        const login = await runCli(cli, ['login', 'status'], { cwd: this.cwd, env: this.env, timeout: 15000, signal });
        if (login.code !== 0 || !/ChatGPT/i.test(login.stdout + login.stderr)) throw new Error('ChatGPT 로그인으로 연결하세요. 서버 터미널에서 codex login을 실행하세요.');
        const args = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--sandbox', 'read-only',
            ...safeArgs(), '-c', 'approval_policy="never"', '-c', `model_reasoning_effort=${JSON.stringify(effort)}`,
            '-c', `base_instructions=${JSON.stringify(RP_INSTRUCTIONS)}`, '--cd', this.cwd];
        if (chat.model !== 'codex-default') args.push('--model', chat.model);
        args.push('-');
        let usage = null, completed = false, failure;
        const result = await runCli(cli, args, { cwd: this.cwd, env: this.env, input: chat.instructions + '\n\n' + chat.input, signal, timeout, onLine(line) {
            let msg; try { msg = JSON.parse(line); } catch { return; }
            if (msg.type === 'item.completed' && msg.item?.type === 'agent_message' && msg.item.phase !== 'commentary') onDelta(msg.item.text || '');
            if (msg.type === 'turn.completed') { completed = true; usage = usageFrom(msg.usage); }
            if (msg.type === 'turn.failed' || msg.type === 'error') failure = msg.error?.message || msg.message || 'Codex 대화 실패';
        } });
        if (result.code !== 0 || !completed || failure) throw new Error(failure || 'Codex CLI 대화에 실패했습니다. CLI 버전·로그인과 터먹스 빌드 지원을 확인하세요.');
        return { usage };
    }
    async close() { this.closed = true; await Promise.all([...this.active].map(rpc => rpc.close())); this.active.clear(); this.control = null; }
}
module.exports = { Engine, SAFE_CONFIG, safeArgs };

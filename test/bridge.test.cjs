'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Bridge } = require('../server.cjs');
const { Engine } = require('../engine.cjs');
const { Store } = require('../store.cjs');
const { parseChat } = require('../protocol.cjs');
const env = { ...process.env, ST_CODEX_CHAT_BIN: path.join(__dirname, 'fake-cli.cjs') };
const body = (text = '안녕', stream = false) => ({ model: 'test-model', messages: [{ role: 'system', content: '한국어로 고성의 문지기를 연기한다.' }, { role: 'user', name: '손님', content: text }], stream, stop: ['\nSTOP'] });
async function setup(t, transport = 'app-server') {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-rp-test-'));
    const engine = new Engine(root, { ...env, ST_CODEX_CHAT_TRANSPORT: transport });
    const bridge = await new Bridge({ root, env, engine, port: 0 }).start();
    t.after(async () => { await bridge.close(); await fs.rm(root, { recursive: true, force: true }); });
    return bridge;
}
async function post(bridge, value) { return fetch(bridge.apiUrl + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }); }
test('roleplay keeps character, names, order, unicode and assistant continuation', () => {
    const value = body(); value.messages.push({ role: 'assistant', name: '문지기', content: '"이곳은' });
    const parsed = parseChat(value);
    assert.match(parsed.instructions, /한국어로 고성/); assert.match(parsed.input, /"name":"손님"/); assert.match(parsed.input, /Return only the continuation/);
    assert.ok(parsed.input.indexOf('"name":"손님"') < parsed.input.indexOf('"name":"문지기"'));
});
test('reject unsupported images/tools and malformed request parameters', () => {
    assert.throws(() => parseChat({ ...body(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }] }), /텍스트/);
    assert.throws(() => parseChat({ ...body(), tools: [{}] }), /전용/);
    assert.throws(() => parseChat({ ...body(), stop: [123] }), /stop/);
});
test('RPC metadata, isolated prompt, race-safe completion, split stop and real token accounting', async t => {
    const b = await setup(t);
    const status = await b.status(); assert.equal(status.loggedIn, true); assert.equal(status.limits.rateLimits.primary.usedPercent, 25);
    assert.equal((await b.models())[0].id, 'test-model');
    const res = await post(b, body()); const data = await res.json();
    assert.equal(res.status, 200); assert.equal(data.choices[0].message.content, '문을 열었다.'); assert.equal(data.usage.total_tokens, 120);
    assert.equal(data.usage.completion_tokens_details.reasoning_tokens, 5);
    await b.store.queue; assert.equal(b.store.usage().all.tokens, 120);
    const saved = await fs.readFile(b.store.file, 'utf8'); assert.ok(!saved.includes('한국어로 고성')); assert.ok(!saved.includes('손님'));
});
test('SSE hides commentary and ends correctly with a finish reason and DONE', async t => {
    const b = await setup(t); const res = await post(b, body('안녕', true)); const raw = await res.text();
    assert.match(res.headers.get('content-type'), /event-stream/);
    assert.ok(!raw.includes('HIDDEN PROGRESS')); assert.ok(!raw.includes('STOP')); assert.match(raw, /\[DONE\]/);
    const chunks = raw.split('\n').filter(x => x.startsWith('data: {')).map(x => JSON.parse(x.slice(6)));
    assert.equal(chunks.map(c => c.choices?.[0]?.delta?.content || '').join(''), '문을 열었다.');
    assert.equal(chunks.at(-1).choices[0].finish_reason, 'stop');
});
test('CLI failures and clean premature exit cannot produce successful completion', async t => {
    const b = await setup(t);
    for (const marker of ['[FAIL]', '[CLOSE]']) {
        const res = await post(b, body(marker)); assert.equal(res.status, 503); assert.ok((await res.json()).error.message);
    }
    const res = await post(b, body('[FAIL]', true)); const stream = await res.text(); assert.match(stream, /mock failure/); assert.ok(!stream.includes('[DONE]'));
});
test('cancellation tears down CLI and releases its resources', async t => {
    const b = await setup(t); const controller = new AbortController(); const idle = b.engine.active.size;
    const pending = b.engine.generate(parseChat(body('[HANG]')), { signal: controller.signal, onDelta() {}, timeout: 2000 });
    setTimeout(() => controller.abort(), 150); await assert.rejects(pending); assert.equal(b.engine.active.size, idle);
});

test('catalog is queried once at startup; reads never refresh; explicit refresh coalesces and retains cache on failure', async t => {
    let calls = 0, fail = false;
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-model-test-'));
    const engine = { transport: 'app-server', async models() { calls++; await new Promise(r => setTimeout(r, 20)); if (fail) throw new Error('offline'); return [{ id: 'm' + calls }]; }, async status() { return {}; }, async close() {} };
    const b = await new Bridge({ root, engine, port: 0 }).start();
    t.after(async () => { await b.close(); await fs.rm(root, { recursive: true, force: true }); });
    assert.equal(calls, 1); assert.equal((await b.models())[0].id, 'm1');
    await b.store.saveSettings({ defaultModel: 'keep-me' });
    await Promise.all([b.models(), b.status(true), fetch(b.apiUrl + '/models'), b.models()]);
    assert.equal(calls, 1);
    await Promise.all([b.refreshModels(), b.refreshModels()]); assert.equal(calls, 2);
    assert.equal((await b.models())[0].id, 'm2'); assert.equal(b.store.settings.defaultModel, 'keep-me');
    const stamp = b.modelsUpdatedAt; fail = true; await b.refreshModels();
    assert.equal(b.modelsUpdatedAt, stamp); assert.equal((await b.models())[0].id, 'm2'); assert.match(b.modelsError, /offline/);
});

test('failed startup catalog stays empty until explicit refresh, without implicit retries', async t => {
    let calls = 0;
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-model-fail-'));
    const engine = { async models() { calls++; throw new Error('not logged in'); }, async close() {} };
    const b = await new Bridge({ root, engine, port: 0 }).start();
    t.after(async () => { await b.close(); await fs.rm(root, { recursive: true, force: true }); });
    assert.deepEqual(await b.models(), []); await fetch(b.apiUrl + '/models'); assert.equal(calls, 1);
    assert.equal(b.modelsUpdatedAt, null); assert.match(b.modelsError, /not logged in/);
    await b.refreshModels(); assert.equal(calls, 2);
});
test('loopback endpoint blocks browser origins, DNS rebinding and non-JSON bodies', async t => {
    const b = await setup(t);
    const origin = await fetch(b.apiUrl + '/models', { headers: { Origin: 'https://evil.example' } }); assert.equal(origin.status, 403);
    const type = await fetch(b.apiUrl + '/chat/completions', { method: 'POST', body: JSON.stringify(body()) }); assert.equal(type.status, 415);
    const status = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${b.port}/health`, { headers: { Host: 'evil.example' } }, r => { r.resume(); resolve(r.statusCode); }).once('error', reject);
    }); assert.equal(status, 403);
    assert.equal((await post(b, { ...body(), messages: [] })).status, 400);
});
test('Termux exec stdin adapter returns output and exposes unavailable quota honestly', async t => {
    const b = await setup(t, 'exec'); const status = await b.status(); assert.equal(status.limits, null); assert.match(status.quotaError, /지원하지/);
    const res = await post(b, body()); const data = await res.json(); assert.equal(data.choices[0].message.content, '문을 열었다.'); assert.equal(data.usage.total_tokens, 120);
});
test('serialized persistence survives concurrent records and restarts without storing chat', async t => {
    const b = await setup(t);
    await Promise.all(Array.from({ length: 10 }, (_, i) => b.store.add({ id: String(i), at: new Date().toISOString(), model: 'm', state: 'completed', usage: i % 2 ? { total_tokens: 10 } : null })));
    const reopened = await new Store(path.join(b.root, 'data')).init(); assert.equal(reopened.usage().all.requests, 10); assert.equal(reopened.usage().all.tokens, 50); assert.equal(reopened.usage().all.unknown, 5);
});

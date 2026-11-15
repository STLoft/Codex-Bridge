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
const { runCli, resolveCli } = require('../cli.cjs');
const env = { ...process.env, ST_CODEX_CHAT_BIN: path.join(__dirname, 'fake-cli.cjs') };
const body = (text = '안녕', stream = false) => ({ model: 'test-model', messages: [{ role: 'system', content: '한국어로 고성의 문지기를 연기한다.' }, { role: 'user', name: '손님', content: text }], stream, stop: ['\nSTOP'] });
async function setup(t, transport = 'app-server', extraEnv = {}) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-rp-test-'));
    const engineEnv = { ...env, ST_CODEX_TEST_TRACE: path.join(root, 'cli-calls.txt'), ...extraEnv, ST_CODEX_CHAT_TRANSPORT: transport };
    if (transport === null) delete engineEnv.ST_CODEX_CHAT_TRANSPORT;
    const engine = new Engine(root, engineEnv);
    const bridge = await new Bridge({ root, env: engineEnv, engine, port: 0 }).start();
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

test('profile effort travels per request without changing server defaults or crossing concurrent chats', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-profile-effort-'));
    const calls = [];
    const engine = { transport: 'app-server', async models() { return [{ id: 'test-model', efforts: ['low', 'medium', 'high'] }]; },
        async status() { return { available: true, loggedIn: true }; }, async close() {},
        async generate(chat, opts) { await new Promise(r => setTimeout(r, opts.effort === 'high' ? 20 : 1)); calls.push(opts.effort); opts.onDelta(opts.effort); return { usage: null }; } };
    const b = await new Bridge({ root, engine, port: 0 }).start();
    t.after(async () => { await b.close(); await fs.rm(root, { recursive: true, force: true }); });
    await b.store.saveSettings({ defaultModel: 'keep', effort: 'medium' });
    const settingsBefore = await fs.readFile(b.store.settingsFile, 'utf8');
    assert.equal((await b.status()).capabilities.profileReasoning, true);
    const results = await Promise.all(['high', 'low', null].map(effort => post(b, { ...body(), ...(effort ? { codex_bridge: { effort } } : {}) }).then(r => r.json())));
    assert.deepEqual(results.map(r => r.choices[0].message.content), ['high', 'low', 'medium']);
    assert.equal((await (await post(b, { ...body(), reasoning_effort: 'low' })).json()).choices[0].message.content, 'low');
    for (const extra of [{ codex_bridge: [] }, { codex_bridge: { effort: 'max' } }, { codex_bridge: { effort: 'xhigh' } }]) {
        assert.equal((await post(b, { ...body(), ...extra })).status, 400);
    }
    assert.equal(calls.length, 4); assert.equal(await fs.readFile(b.store.settingsFile, 'utf8'), settingsBefore);
});
test('reject unsupported images/tools and malformed request parameters', () => {
    assert.throws(() => parseChat({ ...body(), messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'x' } }] }] }), /텍스트/);
    assert.throws(() => parseChat({ ...body(), tools: [{}] }), /전용/);
    assert.throws(() => parseChat({ ...body(), stop: [123] }), /stop/);
});

test('desktop and Termux default to app-server; failure never silently switches to exec', async t => {
    for (const termux of [false, true]) {
        const b = await setup(t, null, termux ? { TERMUX_VERSION: '0.118.3', PREFIX: '/data/data/com.termux/files/usr' } : {});
        assert.equal(b.engine.transport, 'app-server');
        assert.equal((await post(b, body())).status, 200);
        const calls = await fs.readFile(path.join(b.root, 'cli-calls.txt'), 'utf8');
        assert.match(calls, /model\/list/); assert.match(calls, /thread\/start/);
        assert.ok(!calls.split('\n').includes('exec')); assert.ok(!calls.includes('debug models'));
    }
    const alias = await setup(t, null, { TERMUX_VERSION: '0.118.3', ST_CODEX_TEST_DEFAULT_MODEL: '1' });
    assert.equal((await post(alias, { ...body(), model: 'codex-default' })).status, 200);
    const failed = await setup(t, null, { TERMUX_VERSION: '0.118.3', ST_CODEX_TEST_NO_APP_SERVER: '1' });
    assert.equal((await post(failed, body())).status, 503);
    const calls = await fs.readFile(path.join(failed.root, 'cli-calls.txt'), 'utf8');
    assert.ok(!calls.split('\n').includes('exec')); assert.ok(!calls.includes('debug models'));
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
test('exec chat stays on stdin while CLI catalog and separate official quota queries succeed', async t => {
    const b = await setup(t, 'exec'); const status = await b.status(); assert.equal(status.limits.rateLimits.primary.usedPercent, 25); assert.equal(status.quotaError, '');
    const models = await b.models(); assert.deepEqual(models.map(m => m.id), ['test-model']); assert.deepEqual(models[0].efforts, ['low', 'medium']);
    const res = await post(b, body()); const data = await res.json(); assert.equal(data.choices[0].message.content, '문을 열었다.'); assert.equal(data.usage.total_tokens, 120);
    await b.models(); await b.status(true);
    const calls = (await fs.readFile(path.join(b.root, 'cli-calls.txt'), 'utf8')).trim().split('\n');
    assert.equal(calls.filter(c => c === 'debug models').length, 1); assert.ok(calls.includes('exec')); assert.ok(!calls.includes('thread/start'));
});

test('unsupported app-server leaves exec chat and independently queried models available', async t => {
    const b = await setup(t, 'exec', { ST_CODEX_TEST_NO_APP_SERVER: '1' });
    const status = await b.status(); assert.equal(status.available, true); assert.equal(status.loggedIn, true); assert.equal(status.limits, null); assert.match(status.quotaError, /조회 실패/);
    assert.equal((await b.models())[0].id, 'test-model');
    assert.equal((await post(b, body())).status, 200);
});

test('unavailable or malformed CLI catalog falls back to app-server models', async t => {
    for (const flag of ['ST_CODEX_TEST_NO_CATALOG', 'ST_CODEX_TEST_BAD_CATALOG']) {
        const b = await setup(t, 'exec', { [flag]: '1' });
        assert.equal((await b.models())[0].id, 'test-model'); assert.equal(b.modelsError, '');
        const calls = await fs.readFile(path.join(b.root, 'cli-calls.txt'), 'utf8'); assert.match(calls, /debug models/); assert.match(calls, /model\/list/);
    }
});

test('both unavailable model paths retain default fallback and report failure without blocking exec', async t => {
    const b = await setup(t, 'exec', { ST_CODEX_TEST_NO_CATALOG: '1', ST_CODEX_TEST_NO_APP_SERVER: '1' });
    assert.equal((await b.models())[0].id, 'codex-default'); assert.equal(b.modelsUpdatedAt, null); assert.match(b.modelsError, /모델 목록 조회 실패/);
    await b.refreshModels(); assert.equal((await b.models())[0].id, 'codex-default'); assert.equal((await post(b, body())).status, 200);
});

test('quota API failure or timeout is isolated from CLI login, models and exec chat', async t => {
    for (const flag of ['ST_CODEX_TEST_NO_QUOTA', 'ST_CODEX_TEST_HANG_QUOTA']) {
        const b = await setup(t, 'exec', { [flag]: '1' });
        await b.engine.getControl(); b.engine.metadataTimeout = 100;
        const status = await b.status(); assert.equal(status.loggedIn, true); assert.equal(status.available, true); assert.equal(status.limits, null); assert.match(status.quotaError, /조회 실패/);
        assert.equal((await post(b, body())).status, 200);
    }
});

test('oversized JSON command output fails explicitly instead of being silently truncated', async t => {
    const b = await setup(t, 'exec'); const cli = await resolveCli(b.env);
    await assert.rejects(runCli(cli, ['debug', 'models'], { cwd: b.root, env: b.env, stdoutLimit: 100, failOnStdoutLimit: true }), /크기 제한/);
});
test('serialized persistence survives concurrent records and restarts without storing chat', async t => {
    const b = await setup(t);
    await Promise.all(Array.from({ length: 10 }, (_, i) => b.store.add({ id: String(i), at: new Date().toISOString(), model: 'm', state: 'completed', usage: i % 2 ? { total_tokens: 10 } : null })));
    const reopened = await new Store(path.join(b.root, 'data')).init(); assert.equal(reopened.usage().all.requests, 10); assert.equal(reopened.usage().all.tokens, 50); assert.equal(reopened.usage().all.unknown, 5);
});

test('usage reset serializes with records, persists zero totals and preserves settings', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-reset-test-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = await new Store(root).init();
    await store.saveSettings({ defaultModel: 'keep-model', effort: 'high' });
    const settingsBefore = await fs.readFile(store.settingsFile, 'utf8');
    const record = id => ({ id, at: new Date().toISOString(), model: 'm', state: 'completed', usage: { total_tokens: 120 } });
    await store.add(record('old'));
    const before = Date.now();
    await Promise.all([store.add(record('before-reset')), store.reset(), store.add({ ...record('after-reset'), usage: null })]);
    assert.deepEqual(store.usage().all, { requests: 1, tokens: 0, unknown: 1 });
    assert.equal(store.usage().records[0].id, 'after-reset');
    assert.ok(Date.parse(store.state.since) >= before);
    let reopened = await new Store(root).init();
    assert.equal(reopened.state.requests, 1);
    await reopened.reset();
    reopened = await new Store(root).init();
    assert.deepEqual(reopened.usage().all, { requests: 0, tokens: 0, unknown: 0 });
    assert.deepEqual(reopened.usage().fiveHours, { requests: 0, tokens: 0, unknown: 0 });
    assert.deepEqual(reopened.usage().sevenDays, { requests: 0, tokens: 0, unknown: 0 });
    assert.equal(reopened.state.knownRequests, 0); assert.deepEqual(reopened.usage().records, []);
    assert.equal(await fs.readFile(store.settingsFile, 'utf8'), settingsBefore);
    assert.deepEqual(reopened.settings, { defaultModel: 'keep-model', effort: 'high' });
});

test('failed usage reset leaves memory and disk intact and the write queue can recover', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-reset-failure-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = await new Store(root).init();
    const record = { id: 'keep', at: new Date().toISOString(), model: 'm', state: 'completed', usage: { total_tokens: 10 } };
    await store.add(record); const stateBefore = store.state, diskBefore = await fs.readFile(store.file, 'utf8');
    const atomic = store.atomic; store.atomic = async () => { throw new Error('simulated disk failure'); };
    await assert.rejects(store.reset(), /disk failure/);
    assert.equal(store.state, stateBefore); assert.equal(await fs.readFile(store.file, 'utf8'), diskBefore);
    store.atomic = atomic; await store.add({ ...record, id: 'new' });
    assert.equal((await new Store(root).init()).usage().all.requests, 2);
});

test('plugin usage reset enforces admin, returns fresh totals and never queries CLI limits', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-reset-route-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const store = await new Store(root).init();
    await store.saveSettings({ defaultModel: 'keep-model', effort: 'high' });
    const settingsBefore = await fs.readFile(store.settingsFile, 'utf8');
    const vm = require('node:vm'), mod = { exports: {} }, routes = new Map();
    const actual = require('../server.cjs');
    class TestBridge {
        constructor() { this.store = store; }
        async start() { return this; }
        async status() { throw new Error('reset must not query the CLI'); }
        async close() {}
    }
    vm.runInNewContext(await fs.readFile(path.join(__dirname, '../index.js'), 'utf8'), {
        module: mod, require(name) { assert.equal(name, './server.cjs'); return { ...actual, Bridge: TestBridge }; },
        console: { log() {}, error() {} },
    });
    await mod.exports.init({ get(name, fn) { routes.set('GET ' + name, fn); }, post(name, fn) { routes.set('POST ' + name, fn); } });
    t.after(() => mod.exports.exit());
    const handler = routes.get('POST /usage/reset'); assert.equal(typeof handler, 'function');
    const call = async req => { const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } }; await handler(req, res); return res; };
    const seed = () => store.add({ id: 'keep', at: new Date().toISOString(), model: 'm', state: 'completed', usage: { total_tokens: 10 } });
    await seed(); const diskBefore = await fs.readFile(store.file, 'utf8');
    for (const user of [{ profile: { admin: false } }, {}, { profile: { admin: 'true' } }]) {
        const res = await call({ user }); assert.equal(res.code, 403);
        assert.equal(res.value.error, 'SillyTavern admin 계정만 사용 기록을 초기화할 수 있습니다.');
        assert.equal(await fs.readFile(store.file, 'utf8'), diskBefore);
    }
    for (const req of [{ user: { profile: { admin: true } } }, {}]) {
        await seed(); const res = await call(req); assert.equal(res.code, 200); assert.equal(res.value.ok, true);
        assert.deepEqual(res.value.all, { requests: 0, tokens: 0, unknown: 0 }); assert.equal(res.value.records.length, 0);
        assert.equal(await fs.readFile(store.settingsFile, 'utf8'), settingsBefore);
    }
    await seed(); const stateBefore = store.state;
    store.atomic = async () => { throw new Error('simulated disk failure'); };
    const failure = await call({ user: { profile: { admin: true } } });
    assert.equal(failure.code, 503); assert.match(failure.value.error, /disk failure/); assert.equal(store.state, stateBefore);
});

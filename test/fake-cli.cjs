'use strict';
const assert = require('node:assert/strict');
const args = process.argv.slice(2);
const trace = name => { if (process.env.ST_CODEX_TEST_TRACE) require('node:fs').appendFileSync(process.env.ST_CODEX_TEST_TRACE, name + '\n'); };
if (args.includes('--version')) { console.log('codex-cli 0.mock'); process.exit(0); }
if (args.includes('login')) { console.log('Logged in using ChatGPT'); process.exit(0); }
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
if (args.includes('debug') && args.includes('models')) {
    trace('debug models');
    if (process.env.ST_CODEX_TEST_NO_CATALOG) { console.error('Unknown command: debug models'); process.exit(2); }
    if (process.env.ST_CODEX_TEST_BAD_CATALOG) { console.log('{invalid JSON'); process.exit(0); }
    send({ models: [{ slug: 'test-model', display_name: 'Test Model', visibility: 'list',
        description: 'x'.repeat(100000), default_reasoning_level: 'medium', supported_reasoning_levels: [{ effort: 'low' }, { effort: 'medium' }, { effort: 'max' }] },
        { slug: 'hidden-model', visibility: 'hide' }] });
} else if (args.includes('exec')) {
    trace('exec');
    assert.ok(args.includes('--ignore-user-config')); assert.ok(args.includes('--ignore-rules'));
    assert.ok(args.includes('read-only'));
    assert.ok(!args.join(' ').includes('한국어로 고성'));
    assert.equal(args.at(-1), '-');
    let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', s => input += s);
    process.stdin.on('end', () => {
        assert.match(input, /한국어로 고성/); assert.match(input, /"name":"손님"/);
        if (input.includes('[FAIL]')) { send({ type: 'turn.failed', error: { message: 'mock failure' } }); process.exitCode = 1; return; }
        send({ type: 'item.completed', item: { type: 'agent_message', text: '문을 열었다.\nSTOP이후' } });
        send({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20, cached_input_tokens: 40 } });
    });
} else if (args.includes('app-server')) {
    trace('app-server');
    if (process.env.ST_CODEX_TEST_NO_APP_SERVER) { console.error('app-server unavailable'); process.exit(2); }
    const rl = require('node:readline').createInterface({ input: process.stdin });
    rl.on('line', line => {
        const m = JSON.parse(line); if (!Object.hasOwn(m, 'id')) return;
        trace(m.method);
        const reply = result => send({ id: m.id, result });
        if (m.method === 'initialize') return reply({});
        if (m.method === 'config/read') return reply({ config: { mcp_servers: { merged: { command: 'DO_NOT_RUN' } } }, layers: [{ config: { mcp_servers: { inherited: { command: 'DO_NOT_RUN' } } } }] });
        if (m.method === 'account/read') return reply({ account: { type: 'chatgpt', planType: 'plus' } });
        if (m.method === 'account/rateLimits/read') {
            if (process.env.ST_CODEX_TEST_NO_QUOTA) return send({ id: m.id, error: { code: -32601, message: 'quota unavailable' } });
            if (process.env.ST_CODEX_TEST_HANG_QUOTA) return;
            return reply({ rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 1800000000 }, secondary: { usedPercent: 12, windowDurationMins: 10080, resetsAt: 1800400000 } } });
        }
        if (m.method === 'model/list') return reply({ data: [{ model: 'test-model', displayName: 'Test Model', isDefault: true, supportedReasoningEfforts: ['low', 'medium', 'high'].map(reasoningEffort => ({ reasoningEffort })), defaultReasoningEffort: 'medium' }], nextCursor: null });
        if (m.method === 'thread/start') {
            if (process.env.ST_CODEX_TEST_DEFAULT_MODEL) assert.ok(!Object.hasOwn(m.params, 'model'));
            else assert.equal(m.params.model, 'test-model');
            assert.equal(m.params.sandbox, 'read-only'); assert.equal(m.params.ephemeral, true);
            assert.equal(m.params.config['mcp_servers.inherited.enabled'], false);
            assert.equal(m.params.config['mcp_servers.merged.enabled'], false);
            assert.equal(m.params.config['features.shell_tool'], false);
            assert.equal(m.params.config['features.hooks'], false);
            return reply({ thread: { id: 'thread-test' } });
        }
        if (m.method === 'turn/start') {
            const input = m.params.input[0].text;
            if (input.includes('[CLOSE]')) return process.exit(0);
            if (input.includes('[HANG]')) return reply({ turn: { id: 'turn-test' } });
            const notify = (method, params) => send({ method, params: { threadId: 'thread-test', turnId: 'turn-test', ...params } });
            notify('item/started', { item: { type: 'agentMessage', id: 'comment', phase: 'commentary' } });
            notify('item/agentMessage/delta', { itemId: 'comment', delta: 'HIDDEN PROGRESS' });
            notify('item/completed', { item: { type: 'agentMessage', id: 'comment', phase: 'commentary', text: 'HIDDEN PROGRESS' } });
            notify('item/started', { item: { type: 'agentMessage', id: 'a', phase: 'final_answer' } });
            for (const delta of (input.includes('[ECHO_EFFORT]') ? [m.params.effort] : ['문을 ', '열었다.\nST', 'OP이후'])) notify('item/agentMessage/delta', { itemId: 'a', delta });
            notify('item/completed', { item: { type: 'agentMessage', id: 'a', phase: 'final_answer', text: '문을 열었다.\nSTOP이후' } });
            notify('thread/tokenUsage/updated', { tokenUsage: { total: { inputTokens: 100, outputTokens: 20, cachedInputTokens: 40, reasoningOutputTokens: 5 } } });
            notify('turn/completed', { turn: { id: 'turn-test', status: input.includes('[FAIL]') ? 'failed' : 'completed', error: { message: 'mock failure' } } });
            // Deliberately reply after the terminal notification to exercise races.
            return reply({ turn: { id: 'turn-test' } });
        }
        send({ id: m.id, error: { code: -32601, message: 'Unknown method ' + m.method } });
    });
}

'use strict';
const { EventEmitter } = require('node:events');
const { createInterface } = require('node:readline');
const { launch } = require('./cli.cjs');

class Rpc extends EventEmitter {
    constructor(cli, cwd, env = process.env) {
        super(); Object.assign(this, { cli, cwd, env, next: 1, pending: new Map(), closed: false });
    }
    async start() {
        this.child = launch(this.cli, ['app-server'], { cwd: this.cwd, env: this.env });
        this.stderr = '';
        this.child.stderr.setEncoding('utf8');
        this.child.stderr.on('data', s => { this.stderr = (this.stderr + s).slice(-4096); });
        this.child.stdin.on('error', e => this.fail(e));
        this.child.once('error', e => this.fail(e));
        this.child.once('close', code => { this.closed = true; this.fail(new Error(`Codex CLI 연결이 종료되었습니다 (${code}).`)); this.emit('closed'); });
        this.reader = createInterface({ input: this.child.stdout });
        this.reader.on('line', line => {
            let msg; try { msg = JSON.parse(line); } catch { return; }
            if (msg.method && Object.hasOwn(msg, 'id')) {
                // A roleplay bridge does not approve agent tool operations.
                if (/requestApproval$/i.test(msg.method)) this.write({ id: msg.id, result: { decision: 'decline' } });
                else this.write({ id: msg.id, error: { code: -32601, message: 'Tools are unavailable in this chat bridge.' } });
            } else if (msg.method) this.emit('notification', msg.method, msg.params || {});
            else if (Object.hasOwn(msg, 'id')) {
                const pending = this.pending.get(msg.id); if (!pending) return;
                this.pending.delete(msg.id); clearTimeout(pending.timer);
                if (msg.error) pending.reject(new Error(msg.error.message || 'CLI RPC 오류'));
                else pending.resolve(msg.result);
            }
        });
        try {
            await this.request('initialize', { clientInfo: { name: 'st_codex_roleplay', title: 'SillyTavern Codex Bridge', version: '0.1.0' } });
            this.write({ method: 'initialized', params: {} });
        } catch (e) { await this.close(); throw e; }
        return this;
    }
    write(message) { if (this.closed || !this.child?.stdin?.writable) throw new Error('Codex CLI 연결이 닫혔습니다.'); this.child.stdin.write(JSON.stringify(message) + '\n'); }
    request(method, params = {}, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const id = this.next++;
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: 응답 시간 초과`)); }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            try { this.write({ id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
        });
    }
    fail(error) { for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear(); }
    async close() {
        this.closed = true; this.fail(new Error('Codex CLI 연결을 종료했습니다.')); this.reader?.close();
        const child = this.child;
        if (!child || child.exitCode !== null || child.signalCode !== null) return;
        if (!this.closing) this.closing = new Promise(resolve => {
            child.once('close', resolve); child.stdin?.end(); child.kill();
        });
        await this.closing;
    }
}
module.exports = { Rpc };

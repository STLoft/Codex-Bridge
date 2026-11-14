'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
class Store {
    constructor(directory) { this.directory = directory; this.file = path.join(directory, 'usage.json'); this.settingsFile = path.join(directory, 'settings.json'); this.queue = Promise.resolve(); }
    async init() {
        await fs.mkdir(this.directory, { recursive: true });
        this.state = { since: new Date().toISOString(), requests: 0, knownRequests: 0, tokens: 0, records: [] };
        this.settings = { defaultModel: '', effort: 'medium' };
        for (const [file, key] of [[this.file, 'state'], [this.settingsFile, 'settings']]) {
            try { this[key] = { ...this[key], ...JSON.parse(await fs.readFile(file, 'utf8')) }; }
            catch (e) { if (e.code !== 'ENOENT') throw new Error(`설정 또는 기록 파일을 읽을 수 없습니다: ${path.basename(file)}`); }
        }
        if (!Array.isArray(this.state.records)) throw new Error('사용 기록 형식이 올바르지 않습니다.');
        return this;
    }
    async atomic(file, value) {
        const temporary = file + '.tmp';
        await fs.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 }); await fs.rename(temporary, file);
    }
    enqueue(fn) { const operation = this.queue.then(fn); this.queue = operation.catch(() => {}); return operation; }
    add(record) {
        return this.enqueue(async () => {
            const next = { ...this.state, requests: this.state.requests + 1, knownRequests: this.state.knownRequests + (record.usage ? 1 : 0),
                tokens: this.state.tokens + (record.usage?.total_tokens || 0), records: [record, ...this.state.records].slice(0, 1000) };
            await this.atomic(this.file, next); this.state = next;
        });
    }
    saveSettings(value) {
        return this.enqueue(async () => { const next = { ...this.settings, ...value }; await this.atomic(this.settingsFile, next); this.settings = next; });
    }
    usage() {
        const now = Date.now();
        const summary = hours => {
            const records = this.state.records.filter(r => now - Date.parse(r.at) <= hours * 3600000);
            return { requests: records.length, tokens: records.reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0), unknown: records.filter(r => !r.usage).length };
        };
        return { since: this.state.since, all: { requests: this.state.requests, tokens: this.state.tokens, unknown: this.state.requests - this.state.knownRequests },
            fiveHours: summary(5), sevenDays: summary(168), retained: this.state.records.length, records: this.state.records.slice(0, 200) };
    }
}
module.exports = { Store };

'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { findCodex } = require('./cli-resolver.cjs');

// Like Chatelier, respect PATH order and keep prompts on stdin. Resolve npm's
// Windows wrapper to its JS entry instead of passing any arguments to cmd.exe.
async function resolveCli(env = process.env) {
    const binary = String(env.ST_CODEX_CHAT_BIN || env.ST_CODEX_BIN || '').trim() || await findCodex({ env });
    if (!binary) throw new Error('Codex CLI를 찾지 못했습니다. 서버 터미널에서 codex --version과 codex login status를 확인하세요.');
    if (/\.(cmd|bat|ps1)$/i.test(binary)) {
        const entry = path.join(path.dirname(binary), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
        try { await fs.access(entry); } catch { throw new Error('CLI 실행 경로를 확인하지 못했습니다. ST_CODEX_CHAT_BIN에 codex 실행파일 또는 codex.js 경로를 지정하세요.'); }
        return { command: process.execPath, prefix: [entry] };
    }
    if (/\.[cm]?js$/i.test(binary)) return { command: process.execPath, prefix: [binary] };
    return { command: binary, prefix: [] };
}

function launch(cli, args, options = {}) {
    return spawn(cli.command, [...cli.prefix, ...args], { ...options, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
}

async function runCli(cli, args, { cwd, input = '', signal, timeout = 180000, env = process.env, onLine = () => {}, stdoutLimit = 65536, failOnStdoutLimit = false } = {}) {
    if (signal?.aborted) throw new Error('요청이 취소되었습니다.');
    return new Promise((resolve, reject) => {
        const child = launch(cli, args, { cwd, env });
        let stdout = '', stderr = '', buffer = '', failure;
        const stop = () => { failure = new Error('요청이 취소되었습니다.'); child.kill(); };
        const timer = setTimeout(() => { failure = new Error('Codex CLI 응답 시간이 초과되었습니다.'); child.kill(); }, timeout);
        signal?.addEventListener('abort', stop, { once: true });
        const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', stop); };
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
            stdout += chunk;
            if (stdout.length > stdoutLimit) {
                if (failOnStdoutLimit) { failure = new Error('CLI 응답 크기 제한을 초과했습니다.'); child.kill(); }
                stdout = stdout.slice(-stdoutLimit);
            }
            buffer += chunk;
            const lines = buffer.split(/\r?\n/); buffer = lines.pop();
            for (const line of lines) { try { onLine(line); } catch (e) { failure = e; child.kill(); } }
        });
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
        child.once('error', error => { clean(); reject(error); });
        child.once('close', code => { clean(); if (buffer) { try { onLine(buffer); } catch (e) { failure = e; } } failure ? reject(failure) : resolve({ code, stdout, stderr }); });
        child.stdin.on('error', () => {});
        child.stdin.end(input);
        if (signal?.aborted) stop();
    });
}
module.exports = { resolveCli, launch, runCli };

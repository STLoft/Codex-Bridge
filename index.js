'use strict';
const { Bridge, errorText, VERSION } = require('./server.cjs');
let bridge, startupError = '';
const guard = (fn, requireBridge = true) => async (req, res) => {
    try { if (requireBridge && !bridge) throw new Error(startupError || '브리지를 시작하는 중입니다.'); await fn(req, res); }
    catch (e) { res.status(503).json({ ok: false, error: errorText(e) }); }
};
const isAdmin = req => !req.user || req.user.profile?.admin === true;
module.exports = {
    info: { id: 'codex-bridge', name: 'Codex Bridge', description: 'SillyTavern roleplay chat using the locally signed-in Codex CLI.' },
    async init(router) {
        try { bridge = await new Bridge().start(); console.log(`[Codex Bridge] v${VERSION} ${bridge.apiUrl}`); }
        catch (e) { startupError = errorText(e); bridge = null; console.error('[Codex Bridge]', startupError); }
        router.get('/status', guard(async (req, res) => {
            if (!bridge) return res.json({ ok: true, available: false, loggedIn: false, versionBridge: VERSION, error: startupError });
            res.json({ ...await bridge.status(req.query.refresh === '1'), canManage: isAdmin(req) });
        }, false));
        router.get('/usage', guard(async (_req, res) => res.json({ ok: true, ...bridge.store.usage() })));
        router.get('/models', guard(async (_req, res) => res.json({ ok: true, ...bridge.modelSnapshot() })));
        router.post('/models/refresh', guard(async (_req, res) => res.json({ ok: true, ...await bridge.refreshModels() })));
        router.post('/settings', guard(async (req, res) => {
            if (!isAdmin(req)) return res.status(403).json({ ok: false, error: '서버 관리자만 연결 설정을 바꿀 수 있습니다.' });
            const { defaultModel = '', effort = 'medium' } = req.body || {};
            if (typeof defaultModel !== 'string' || defaultModel.length > 200 || defaultModel.trim().startsWith('-') || !['none', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(effort)) return res.status(400).json({ ok: false, error: '모델 또는 추론 단계 값이 올바르지 않습니다.' });
            await bridge.store.saveSettings({ defaultModel: defaultModel.trim(), effort }); bridge.statusCache = null; res.json({ ok: true });
        }));
    },
    async exit() { await bridge?.close(); },
};

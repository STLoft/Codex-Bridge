'use strict';
const { Bridge } = require('./server.cjs');
(async () => {
    const bridge = await new Bridge().start();
    console.log(`Codex Bridge: ${bridge.apiUrl}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await bridge.close(); process.exit(0); });
})().catch(e => { console.error(e.message); process.exitCode = 1; });

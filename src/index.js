import http from 'node:http';
import { botState, startBot } from './bot.js';

const PORT = Number(process.env.PORT) || 3000;

// HTTP server for Render port binding, UptimeRobot pinging, and Web QR display
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/health' || url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        bot: botState.status,
        uptime: Math.floor(process.uptime()),
      }),
    );
    return;
  }

  if (url.pathname === '/qr') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    const qrHtml =
      botState.status === 'connected'
        ? '<h2 style="color: #16a34a;">✅ Connected to WhatsApp!</h2><p>Your sticker bot is active and running.</p>'
        : botState.qr
          ? `<h2>Scan this QR code with WhatsApp:</h2>
             <img src="https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(botState.qr)}" alt="WhatsApp QR Code" style="margin: 20px auto; display: block; border: 1px solid #ddd; padding: 12px; border-radius: 8px; background: #fff;" />
             <p style="color: #64748b; font-size: 14px;">Open WhatsApp &rarr; Linked Devices &rarr; Link a Device. This page refreshes automatically.</p>`
          : botState.status === 'disconnected'
            ? '<h2>Disconnected</h2><p>The stored session was invalid. A new QR code will appear here automatically in a few seconds.</p>'
            : '<h2>Starting up...</h2><p>The QR code will appear here automatically in a few seconds.</p>';

    const refreshTag =
      botState.status === 'connected'
        ? ''
        : '<meta http-equiv="refresh" content="5">';

    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${refreshTag}
  <title>WhatsApp Sticker Bot</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 40px 20px; background: #f8fafc; color: #1e293b; }
    .card { max-width: 480px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 WhatsApp Sticker Bot</h1>
    ${qrHtml}
  </div>
</body>
</html>`);
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        name: 'whatsapp-sticker-bot',
        status: 'ok',
        bot: botState.status,
        uptime: Math.floor(process.uptime()),
        endpoints: {
          health: '/health',
          qr: '/qr',
        },
      }),
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[StickerBot] HTTP keep-alive server listening on port ${PORT}`);
});

startBot().catch((err) => {
  console.error('[StickerBot] Fatal error on startup:', err);
  process.exit(1);
});

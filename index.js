"use strict";

const { addLog, getLogs } = require("./logger");
const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");
const http = require("http");
const https = require("https");

// ============================================================
// EXPRESS SERVER - Keep Render/Aternos alive
// ============================================================
const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

// Bot state tracking
let botState = {
  connected: false,
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false,
};

let bot = null;

// Botu başlatma ve Keep-Alive / Timeout optimizasyonları
function createBot() {
  if (bot) return;
  
  addLog("[control] Bot başlatılıyor...", "control");
  botState.reconnectAttempts++;

  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: config.name,
    version: config.version || false,
    checkTimeoutInterval: 60000 
  });

  bot.loadPlugin(pathfinder);

  // Keep-Alive paketlerini yakalayıp anında geri yansıtma (Aternos kick önleyici)
  bot._client.on('packet', (data, metadata) => {
    if (metadata.name === 'keep_alive' || metadata.name === 'keepAlive') {
      bot._client.write(metadata.name, data);
    }
  });

  bot.on('spawn', () => {
    botState.connected = true;
    botState.startTime = Date.now();
    botState.reconnectAttempts = 0;
    addLog(`[success] Bot oyuna katıldı ve spawn oldu! Konum: ${JSON.stringify(bot.entity?.position)}`, "success");
  });

  bot.on('end', (reason) => {
    botState.connected = false;
    addLog(`[warn] Bot sunucudan ayrıldı. Sebep: ${reason}`, "warn");
    bot = null;
    setTimeout(() => {
      if (!bot) createBot();
    }, 10000);
  });

  bot.on('error', (err) => {
    botState.connected = false;
    addLog(`[error] Bot hatası: ${err.message}`, "error");
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    addLog(`[chat] <${username}> ${message}`, "default");
  });
}

// Health check endpoint for monitoring
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" media="print" onload="this.media='all'"
              href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117; color: #e6edf3;
            display: flex; justify-content: center; align-items: center;
            min-height: 100vh; margin: 0; padding: 24px;
          }
          main { width: 100%; max-width: 400px; }
          header { margin-bottom: 28px; }
          header h1 { font-size: 26px; font-weight: 700; color: #f0f6fc; margin: 0; line-height: 1.2; }
          header p { font-size: 14px; color: #8b949e; margin: 6px 0 0; line-height: 1.5; }
          .status-section {
            border-radius: 12px; padding: 20px 24px; margin-bottom: 16px;
            display: flex; align-items: center; gap: 16px;
            transition: background 0.3s, border-color 0.3s;
          }
          .status-section.online  { background: #0d2218; border: 2px solid #238636; }
          .status-section.offline { background: #200d0d; border: 2px solid #da3633; }
          .status-icon {
            width: 44px; height: 44px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 20px; flex-shrink: 0;
          }
          .status-icon.online  { background: #238636; }
          .status-icon.offline { background: #da3633; }
          .status-label { font-size: 18px; font-weight: 700; line-height: 1.2; }
          .status-label.online  { color: #3fb950; }
          .status-label.offline { color: #f85149; }
          .status-detail { font-size: 13px; color: #8b949e; margin-top: 3px; }
          dl { margin: 0; }
          .stat-card {
            background: #161b22; border: 1px solid #21262d;
            border-radius: 10px; padding: 16px 20px; margin-bottom: 10px;
          }
          dt { font-size: 12px; color: #8b949e; font-weight: 600; margin-bottom: 4px; }
          dd { margin: 0; font-size: 17px; font-weight: 600; color: #e6edf3; line-height: 1.3; }
          .stat-detail { margin: 4px 0 0; font-size: 11px; color: #6e7681; }
          .controls { margin-top: 8px; }
          .btn-grid { display: grid; gap: 10px; margin-bottom: 10px; }
          .btn-grid-2 { grid-template-columns: 1fr 1fr; }
          .btn-primary {
            min-height: 52px; border-radius: 10px; font-size: 15px; font-weight: 700;
            cursor: pointer; letter-spacing: 0.3px; font-family: inherit;
            transition: filter 0.2s;
          }
          .btn-primary:hover { filter: brightness(1.1); }
          .btn-start { border: 2px solid #238636; background: #0d2218; color: #3fb950; }
          .btn-stop  { border: 2px solid #da3633; background: #200d0d; color: #f85149; }
          .btn-secondary {
            min-height: 44px; border-radius: 10px; border: 1px solid #21262d;
            background: #161b22; color: #8b949e; font-size: 13px; font-weight: 500;
            text-decoration: none; display: flex; align-items: center; justify-content: center;
            font-family: inherit; cursor: pointer; transition: background 0.2s, color 0.2s;
          }
          .btn-secondary:hover { background: #21262d; color: #c9d1d9; }
          footer { margin-top: 20px; text-align: center; }
          footer p { font-size: 12px; color: #484f58; margin: 0; }
        </style>
      </head>
      <body>
        <main role="main">
          <header>
            <h1>AFK Bot Dashboard</h1>
            <p>Minecraft server bot &middot; Live status</p>
          </header>
          <section id="status-section" class="status-section offline">
            <div id="status-icon" class="status-icon offline">&#x2717;</div>
            <div>
              <div id="status-label" class="status-label offline">Connecting…</div>
              <div id="status-detail" class="status-detail">Establishing connection</div>
            </div>
          </section>
          <section>
            <dl>
              <div class="stat-card">
                <dt>Uptime</dt>
                <dd id="uptime-text">—</dd>
                <p class="stat-detail">Time since last connection</p>
              </div>
              <div class="stat-card">
                <dt>Coordinates</dt>
                <dd id="coords-text">Searching…</dd>
                <p class="stat-detail">Bot's current in-game position</p>
              </div>
              <div class="stat-card">
                <dt>Server address</dt>
                <dd>${config.server.ip}</dd>
                <p class="stat-detail">Minecraft server hostname</p>
              </div>
            </dl>
          </section>
          <section class="controls">
            <div class="btn-grid btn-grid-2">
              <button class="btn-primary btn-start" onclick="startBot()">Start bot</button>
              <button class="btn-primary btn-stop" onclick="stopBot()">Stop bot</button>
            </div>
            <div class="btn-grid btn-grid-2">
              <a href="/tutorial" class="btn-secondary">Setup guide</a>
              <a href="/logs" class="btn-secondary">View logs</a>
            </div>
          </section>
          <footer>
            <p>Status updates every 5 seconds</p>
          </footer>
        </main>
        <script>
          function formatUptime(s) {
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = s % 60;
            if (h > 0) return h + 'h ' + m + 'm ' + sec + 's';
            if (m > 0) return m + 'm ' + sec + 's';
            return sec + ' seconds';
          }
          async function update() {
            try {
              const r = await fetch('/health');
              const data = await r.json();
              const online = data.status === 'connected';
              const section = document.getElementById('status-section');
              const icon    = document.getElementById('status-icon');
              const label   = document.getElementById('status-label');
              const detail  = document.getElementById('status-detail');

              section.className = 'status-section ' + (online ? 'online' : 'offline');
              icon.className    = 'status-icon '    + (online ? 'online' : 'offline');
              icon.textContent  = online ? '✓' : '✗';
              label.className   = 'status-label '   + (online ? 'online' : 'offline');
              label.textContent = online ? 'Connected' : 'Disconnected';
              detail.textContent = online ? 'Bot is active on the server' : 'Attempting to reconnect';
              document.getElementById('uptime-text').textContent = formatUptime(data.uptime);

              if (data.coords) {
                document.getElementById('coords-text').textContent = 'X ' + Math.floor(data.coords.x) + ', Y ' + Math.floor(data.coords.y) + ', Z ' + Math.floor(data.coords.z);
              } else {
                document.getElementById('coords-text').textContent = 'Searching…';
              }
            } catch (e) {
              const label = document.getElementById('status-label');
              label.className = 'status-label offline';
              label.textContent = 'Unreachable';
            }
          }
          async function startBot() {
            const r = await fetch('/start', { method: 'POST' });
            const data = await r.json();
            alert(data.success ? 'Bot started!' : data.msg);
            update();
          }
          async function stopBot() {
            const r = await fetch('/stop', { method: 'POST' });
            const data = await r.json();
            alert(data.success ? 'Bot stopped!' : data.msg);
            update();
          }
          setInterval(update, 5000);
          update();
        </script>
      </body>
    </html>
  `);
});

app

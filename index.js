"use strict";

const { addLog, getLogs } = require("./logger");
const mineflayer = require("mineflayer");
const { Movements, pathfinder, goals } = require("mineflayer-pathfinder");
const { GoalBlock } = goals;
const config = require("./settings.json");
const express = require("express");
const http = require("http");

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
};

// Health check endpoint for monitoring dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <title>${config.name} Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body {
            font-family: 'Inter', -apple-system, sans-serif;
            background: #0d1117;
            color: #e6edf3;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 24px;
          }
          main { width: 100%; max-width: 400px; background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 24px; }
          header h1 { font-size: 22px; color: #f0f6fc; margin: 0 0 8px; }
          header p { font-size: 13px; color: #8b949e; margin: 0 0 20px; }
          .status { font-weight: 600; padding: 10px; border-radius: 8px; text-align: center; margin-bottom: 16px; }
          .status.online { background: #0d2218; color: #3fb950; border: 1px solid #238636; }
          .status.offline { background: #200d0d; color: #f85149; border: 1px solid #da3633; }
        </style>
      </head>
      <body>
        <main>
          <header>
            <h1>🤖 ${config.name}</h1>
            <p>Target Server: ${config.server.ip}</p>
          </header>
          <div class="status ${botState.connected ? 'online' : 'offline'}">
            Status: ${botState.connected ? 'ONLINE (Connected)' : 'OFFLINE (Disconnected)'}
          </div>
          <div>Uptime: ${Math.floor((Date.now() - botState.startTime) / 1000)}s</div>
        </main>
      </body>
    </html>
  `);
});

const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[Express] Web dashboard running on port ${PORT}`);
});

// ============================================================
// MINEFLAYER BOT CREATION & LOGIC
// ============================================================
let bot;

function createBot() {
  console.log(`[Bot] Connecting to ${config.server.ip}:${config.server.port} as ${config.bot-account.username}...`);

  // Host ve Portu ayırıyoruz (Aternos port desteği için)
  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: config.bot-account.username,
    version: config.server.version,
    auth: config.bot-account.type // offline
  });

  bot.loadPlugin(pathfinder);

  bot.once('spawn', () => {
    console.log(`[Bot] Successfully spawned in the world!`);
    botState.connected = true;
    botState.reconnectAttempts = 0;

    // Anti-AFK ve Mesaj döngülerini başlat
    startAutomation();
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[Chat] <${username}> ${message}`);
  });

  bot.on('kicked', (reason) => {
    console.log(`[Bot] Kicked from server: ${reason}`);
    botState.connected = false;
  });

  bot.on('error', (err) => {
    console.error(`[Bot Error]:`, err);
    botState.errors.push(err.message);
  });

  bot.on('end', () => {
    console.log(`[Bot] Connection lost. Reconnecting in ${config.utils['auto-reconnect-delay'] || 2000}ms...`);
    botState.connected = false;

    if (config.utils['auto-reconnect']) {
      botState.reconnectAttempts++;
      setTimeout(createBot, config.utils['auto-reconnect-delay'] || 2000);
    }
  });
}

function startAutomation() {
  // Rastgele mesaj gönderme döngüsü
  if (config.utils['chat-messages'].enabled && config.utils['chat-messages'].messages.length > 0) {
    const msgs = config.utils['chat-messages'].messages;
    const delay = (config.utils['chat-messages']['repeat-delay'] || 180) * 1000;

    setInterval(() => {
      if (!botState.connected) return;
      const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
      bot.chat(randomMsg);
      console.log(`[Chat Sent]: ${randomMsg}`);
    }, delay);
  }

  // Anti-AFK hareketleri (Zıplama / Bakış / Eğilme)
  if (config.utils['anti-afk'].enabled) {
    setInterval(() => {
      if (!botState.connected) return;
      if (config.utils['anti-afk'].sneak) {
        bot.setControlState('sneak', true);
        setTimeout(() => bot.setControlState('sneak', false), 1000);
      }
      if (config.movement['random-jump'] && config.movement['random-jump'].enabled) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
    }, 15000);
  }
}

// Botu ilk kez başlat
createBot();
        

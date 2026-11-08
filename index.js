"use strict";

const { addLog, getLogs } = require("./logger");
const mineflayer = require("mineflayer");
const { pathfinder } = require("mineflayer-pathfinder");
const config = require("./settings.json");
const express = require("express");
const http = require("http");

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 5000;

let botState = {
  connected: false,
  startTime: Date.now(),
  reconnectAttempts: 0
};

let bot = null;

// ============================================================
// MINEFLAYER BOT CREATION & ATERNOS KEEPALIVE FIX
// ============================================================
function createBot() {
  if (bot) return;

  addLog("[control] Bot başlatılıyor...", "control");
  botState.reconnectAttempts++;

  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: config.name,
    version: config.version || false,
    // Aternos'un anlık lag/TPS düşüşlerinde hemen kick atmaması için zaman aşımı 60 sn
    checkTimeoutInterval: 60000
  });

  bot.loadPlugin(pathfinder);

  // ATERNOS KEEP-ALIVE KICK ÖNLEYİCİ:
  // Sunucudan keep_alive paketi geldiği an sıraya almadan anında pong yansıtır.
  bot._client.on("packet", (data, metadata) => {
    if (metadata.name === "keep_alive" || metadata.name === "keepAlive") {
      try {
        bot._client.write(metadata.name, data);
      } catch (err) {
        // Hata durumunda sessizce geç
      }
    }
  });

  bot.on("spawn", () => {
    botState.connected = true;
    botState.startTime = Date.now();
    botState.reconnectAttempts = 0;
    addLog("[success] Bot sunucuya katıldı ve spawn oldu!", "success");
  });

  bot.on("end", (reason) => {
    botState.connected = false;
    addLog("[warn] Bot sunucudan ayrıldı. Sebep: " + reason, "warn");
    bot = null;
    // Otomatik Yeniden Bağlanma (10 saniye sonra)
    setTimeout(() => {
      if (!bot) createBot();
    }, 10000);
  });

  bot.on("error", (err) => {
    botState.connected = false;
    addLog("[error] Bot hatası: " + err.message, "error");
  });

  bot.on("chat", (username, message) => {
    if (username === bot.username) return;
    addLog("[chat] <" + username + "> " + message, "default");
  });
}

// ============================================================
// WEB SERVER ENDPOINTS (DASHBOARD & LOGS)
// ============================================================

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>AFK Bot Panel</title>
        <meta charset="utf-8">
        <style>
          body { font-family: sans-serif; background: #0d1117; color: #e6edf3; padding: 20px; text-align: center; }
          .card { background: #161b22; border: 1px solid #30363d; border-radius: 10px; padding: 20px; max-width: 400px; margin: 20px auto; }
          .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin: 5px; }
          .btn-start { background: #238636; color: white; }
          .btn-stop { background: #da3633; color: white; }
          a { color: #58a6ff; text-decoration: none; }
        </style>
      </head>
      <body>
        <h1>AFK Bot Dashboard</h1>
        <div class="card">
          <h3>Sunucu: ${config.server.ip}</h3>
          <p>Durum: <b id="status">Yükleniyor...</b></p>
          <button class="btn btn-start" onclick="fetch('/start',{method:'POST'}).then(()=>location.reload())">Başlat</button>
          <button class="btn btn-stop" onclick="fetch('/stop',{method:'POST'}).then(()=>location.reload())">Durdur</button>
          <br><br>
          <a href="/logs">Logları Görüntüle</a>
        </div>
        <script>
          fetch('/health').then(r=>r.json()).then(d=>{
            document.getElementById('status').innerText = d.status === 'connected' ? 'Bağlı (Online)' : 'Bağlı Değil (Offline)';
            document.getElementById('status').style.color = d.status === 'connected' ? '#3fb950' : '#f85149';
          });
        </script>
      </body>
    </html>
  `);
});

app.get("/health", (req, res) => {
  res.json({
    status: botState.connected ? "connected" : "disconnected",
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: bot && bot.entity ? bot.entity.position : null,
  });
});

app.get("/logs", (req, res) => {
  const logs = getLogs();
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Bot Log

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
  lastActivity: Date.now(),
  reconnectAttempts: 0,
  startTime: Date.now(),
  errors: [],
  wasThrottled: false,
};

let bot = null;

function createBot() {
  if (bot) return;
  
  addLog("[control] Bot baslatiliyor...", "control");
  botState.reconnectAttempts++;

  bot = mineflayer.createBot({
    host: config.server.ip,
    port: config.server.port,
    username: config.name,
    version: config.version || false,
    checkTimeoutInterval: 60000 
  });

  bot.loadPlugin(pathfinder);

  bot._client.on('packet', (data, metadata) => {
    if (metadata.name === 'keep_alive' || metadata.name === 'keepAlive') {
      bot._client.write(metadata.name, data);
    }
  });

  bot.on('spawn', () => {
    botState.connected = true;
    botState.startTime = Date.now();
    botState.reconnectAttempts = 0;
    addLog("[success] Bot oyuna katildi ve spawn oldu!", "success");
  });

  bot.on('end', (reason) => {
    botState.connected = false;
    addLog("[warn] Bot sunucudan ayrildi. Sebep: " + reason, "warn");
    bot = null;
    setTimeout(() => {
      if (!bot) createBot();
    }, 10000);
  });

  bot.on('error', (err) => {
    botState.connected = false;
    addLog("[error] Bot hatasi: " + err.message, "error");
  });
}

app.get('/', (req, res) => {
  res.send("Bot Aktif ve Calisiyor!");
});

app.get("/health", (req, res) => {
  res.json({
    status: botState.connected ? "connected" : "disconnected",
    uptime: Math.floor((Date.now() - botState.startTime) / 1000),
    coords: bot && bot.entity ? bot.entity.position : null,
  });
});

app.post("/start", (req, res) => {
  if (bot) return res.json({ success: false, msg: "Bot zaten calisiyor!" });
  createBot();
  res.json({ success: true });
});

app.post("/stop", (req, res) => {
  if (!bot) return res.json({ success: false, msg: "Bot zaten durdurulmus!" });
  bot.quit();
  bot = null;
  botState.connected = false;
  res.json({ success: true });
});

http.createServer(app).listen(PORT, () => {
  console.log("Web paneli " + PORT + " portunda calisiyor.");
  createBot();
});

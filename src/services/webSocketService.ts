// webSocketService.ts - responsável por conectar ao WebSocket e enviar candles fechados para o strategyService

import WebSocket from "ws";
import { processKlineData, fetchInitialCandles } from "./strategyService";

let wsBinance: WebSocket;
let lastMessageTime: number = Date.now();

export async function connectToBinance() {
  const priceHistory = await fetchInitialCandles();
  console.log("✅ Histórico carregado. Iniciando conexão com WebSocket...");

  const pair = process.env.SYMBOL?.toLowerCase();
  const url = `${process.env.STREAM_URL}/${pair}@kline_15m`;
  wsBinance = new WebSocket(url);

  wsBinance.on("open", () => {
    console.log("🔌 Conectado ao WebSocket da Binance.");
    startWatchdog();
  });

  wsBinance.on("message", (data) => {
    lastMessageTime = Date.now();
    try {
      const message = JSON.parse(data.toString());
      const kline = message.k;

      if (kline && kline.x) {
        const closePrice = parseFloat(kline.c);
        console.log(`📦 Candle fechado | Close: ${closePrice} | Time: ${new Date(kline.T).toLocaleString()}`);
        processKlineData(closePrice);
      }
    } catch (err) {
      console.error("❌ Erro ao processar mensagem:", err);
    }
  });

  wsBinance.on("ping", (data) => {
    console.clear();
    console.log("📡 Ping recebido da Binance, enviando Pong...");
    wsBinance.pong(data);
  });

  wsBinance.on("close", () => {
    console.error("⚠️ Conexão com a Binance fechada! Tentando reconectar...");
    setTimeout(connectToBinance, 5000);
  });

  wsBinance.on("error", (err) => {
    console.error("❌ Erro na conexão com a Binance:", err);
    wsBinance.close();
  });
}

function startWatchdog() {
  setInterval(() => {
    const now = Date.now();
    const diff = (now - lastMessageTime) / 1000;
    if (diff > 60) {
      console.warn("🐶 Watchdog: Nenhuma mensagem recebida em 60s. Reiniciando conexão...");
      wsBinance.terminate();
      connectToBinance();
    }
  }, 15000);
}
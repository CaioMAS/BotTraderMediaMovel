// strategyService.ts - processa candles + inicia trading conectando à Binance

import { newOrder } from "./orderService";
import { calculateEMA, calculateVolatility, calculateGradient } from "../utils/indicators";
import { appendToJSONFile, logOperation } from "../utils/fileHandler";
import { connectToBinance } from "./webSocketService";
import axios from "axios";

let isBought = false;
let buyPrice = 0;
const tradeQuantity = parseFloat(process.env.TRADE_QUANTITY || '0.001')
let priceHistory: number[] = [];
let prevDiff = 0;
const symbol = process.env.SYMBOL || 'SYMBOL_NOT_SET';

export async function fetchInitialCandles(): Promise<number[]> {
  const axios = await import("axios");
  try {
    const response = await axios.default.get("https://api.binance.com/api/v3/klines", {
      params: {
        symbol: symbol,
        interval: "15m",
        limit: 100,
      },
    });
    return response.data.map((candle: any) => parseFloat(candle[4]));
  } catch (error) {
    console.error("❌ Erro ao buscar candles iniciais:", error);
    return [];
  }
}

export async function startTrading() {
  console.log("🔁 Iniciando processo de trading...");
  priceHistory = await fetchInitialCandles();
  await connectToBinance();
  setInterval(async () => {
    try {
      const { data } = await axios.get(`https://api.binance.com/api/v3/ticker/price`, {
        params: { symbol }
      });
  
      const precoAtual = parseFloat(data.price);
  
      console.clear();
      console.log(`🩺 BOT VIVO | ${symbol}`);
      console.log(`💰 Preço atual: ${precoAtual}`);
      console.log(`📦 Histórico: ${priceHistory.length} candles`);
      console.log(`📊 Status: ${isBought ? `🟢 COMPRADO a ${buyPrice}` : '🔴 LIVRE'}`);
    } catch (err) {
      console.error("Erro ao buscar preço atual:", err);
    }
  }, 5000);
}

export function processKlineData(close: number) {
  console.log("📥 Novo candle recebido. Analisando indicadores...");

  priceHistory.push(close);
  if (priceHistory.length > 100) priceHistory.shift();

  if (priceHistory.length >= 41) {
    const ema7 = calculateEMA(priceHistory, 7);
    const ema40 = calculateEMA(priceHistory, 40);
    const ema7Prev = calculateEMA(priceHistory.slice(0, -1), 7);
    const ema40Prev = calculateEMA(priceHistory.slice(0, -1), 40);

    const diff = ema7 - ema40;
    const volatility = calculateVolatility(priceHistory, 10);
    const grad7 = calculateGradient(ema7, ema7Prev);
    const grad40 = calculateGradient(ema40, ema40Prev);
    const threshold = volatility * 0.1;

    console.log(`📊 EMA7: ${ema7.toFixed(6)} | EMA40: ${ema40.toFixed(6)} | Dif: ${diff.toFixed(6)} | Vol: ${volatility.toFixed(6)}`);
    console.log(`📈 Grad EMA7: ${grad7.toFixed(6)} | Grad EMA40: ${grad40.toFixed(6)} | Thres: ${threshold.toFixed(6)}`);

    // 💚 Compra antecipada
    if (!isBought && Math.abs(diff) < threshold && grad7 > 0 && grad7 > grad40) {
      console.log("💚 Antecipação de cruzamento para CIMA → COMPRA");
      executeTrade("BUY", close, { ema7, ema40 });
    }

    // ❤️ Venda antecipada
    if (isBought && Math.abs(diff) < threshold && grad7 < 0 && grad7 < grad40) {
      console.log("❤️ Antecipação de cruzamento para BAIXO → VENDA");
      executeTrade("SELL", close);
    }

    prevDiff = diff;
  }

 
}

async function executeTrade(action: "BUY" | "SELL", price: number, indicators?: any) {
  if (action === "BUY") {
    console.log(`🟢 COMPRA executada a ${price.toFixed(6)} USD`);
    const result = await newOrder(tradeQuantity.toString(), "BUY");
    if (!result || result.status !== "FILLED") return;

    buyPrice = price;
    isBought = true;

    appendToJSONFile("purchases", {
      date: new Date().toISOString(),
      symbol: result.symbol,
      price: parseFloat(price.toFixed(6)),
      quantity: parseFloat(result.executedQty),
    });

    logOperation(`📥 COMPRA | ${result.symbol} | Preço: ${price.toFixed(4)} | Qtd: ${result.executedQty}`);

  } else {
    console.log(`🔴 VENDA executada a ${price.toFixed(6)} USD`);
    const result = await newOrder(tradeQuantity.toString(), "SELL");
    if (!result || result.status !== "FILLED") return;

    const profit = (price - buyPrice) * tradeQuantity;
    isBought = false;
    buyPrice = 0; // Limpa o preço de compra

    appendToJSONFile("sales", {
      date: new Date().toISOString(),
      symbol: result.symbol,
      price: parseFloat(price.toFixed(6)),
      quantity: parseFloat(result.executedQty),
      profit: parseFloat(profit.toFixed(6)),
    });

    logOperation(`📤 VENDA | ${result.symbol} | Preço: ${price.toFixed(4)} | Lucro: ${profit.toFixed(2)}`);
  }
}

// ✅ Funções novas para o Front

export function getCurrentStatus() {
  return {
    isBought,
    buyPrice,
    tradeQuantity,
    symbol,
  };
}

export async function forceSellNow() {
  if (!isBought) {
    // Não quebra a aplicação, mas permite log e controle no front
    return { status: 'warning', message: 'Nenhuma operação aberta para vender.' };
  }

  const precoAtual = priceHistory[priceHistory.length - 1] || buyPrice;

  console.log(`🔴 VENDA MANUAL executada a ${precoAtual.toFixed(6)} USD`);
  const result = await newOrder(tradeQuantity.toString(), "SELL");

  if (!result || result.status !== "FILLED") {
    return { status: 'error', message: 'Erro ao executar venda manual.' };
  }

  const profit = (precoAtual - buyPrice) * tradeQuantity;

  appendToJSONFile("sales", {
    date: new Date().toISOString(),
    symbol: result.symbol,
    price: parseFloat(precoAtual.toFixed(6)),
    quantity: parseFloat(result.executedQty),
    profit: parseFloat(profit.toFixed(6)),
  });

  logOperation(`📤 VENDA MANUAL | ${result.symbol} | Preço: ${precoAtual.toFixed(4)} | Lucro: ${profit.toFixed(2)}`);

  isBought = false;
  buyPrice = 0;

  return { status: 'success', result };
}



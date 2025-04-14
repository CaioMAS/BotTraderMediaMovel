import sqlite3 from "sqlite3";
import path from "path";

// Caminho para seu banco de dados
const dbPath = path.resolve(__dirname, "../BotTradeNewImpla/trades.db");
const db = new sqlite3.Database(dbPath);

// Testar inserção
function inserirTradeTeste() {
  const now = new Date().toISOString();

  const query = `
    INSERT INTO trades (
      buyTime, buyPrice, buyTotal,
      sma20, ema20, ema100, rsi14, adx, macd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const valores = [
    now,                 // buyTime
    1.2345,              // buyPrice
    123.45,              // buyTotal
    0.1,                 // sma20
    0.2,                 // ema20
    0.3,                 // ema100
    55.5,                // rsi14
    20.0,                // adx
    0.005                // macd
  ];

  db.run(query, valores, function (err) {
    if (err) {
      console.error("❌ Erro ao inserir trade de teste:", err.message);
    } else {
      console.log("✅ Trade de teste inserido com ID:", this.lastID);
    }
  });
}

// Testar leitura
function listarUltimosTrades() {
  db.all("SELECT * FROM trades ORDER BY id DESC LIMIT 5", (err, rows) => {
    if (err) {
      console.error("❌ Erro ao buscar trades:", err.message);
    } else {
      console.log("📄 Últimos registros:");
      console.table(rows);
    }
  });
}

// Executar
inserirTradeTeste();
setTimeout(listarUltimosTrades, 1000); // Espera 1s para garantir que a inserção ocorra primeiro

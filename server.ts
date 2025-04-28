import express from 'express';
import cors from 'cors'; // <--- Importado aqui
import { startTrading, getCurrentStatus, forceSellNow } from './src/services/strategyService';
import { config } from './src/config/dotenv';

const app = express();

app.use(cors()); // <--- Middleware ativado aqui
app.use(express.json()); // Permite ler JSON

// ✅ Rota básica inicial
app.get('/', (req, res) => {
  res.send('Trading bot is running.');
});

// ✅ Rota /status (GET)
app.get('/status', (req, res) => {
  try {
    const status = getCurrentStatus();
    res.json(status);
  } catch (error) {
    console.error('Erro ao buscar status:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar status.' });
  }
});

// ✅ Rota /sell-now (POST)
app.post('/sell-now', async (req, res) => {
  try {
    const result = await forceSellNow();
    res.json({ status: 'success', message: 'Venda forçada executada.' });
  } catch (error) {
    console.error('Erro ao vender:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao tentar vender.' });
  }
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  startTrading();
});

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { startTrading, getCurrentStatus, forceSellNow } from './src/services/strategyService';
import { config } from './src/config/dotenv';

const app = express();
const jwtSecret = process.env.JWT_SECRET || 'senhaMuitoSecretaPadrao';

app.use(cors({
  origin: 'http://localhost:3000', // ajustar se necessário
  credentials: true,
}));

app.use(express.json());

// 🛡️ Middleware de autenticação com Bearer Token
function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ status: 'error', message: 'Token não fornecido.' });
    return;
  }

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      res.status(403).json({ status: 'error', message: 'Token inválido.' });
      return;
    }

    (req as any).user = user;
    next(); // 👍 Só next(), nada de retorno
  });
}

// ✅ Rota pública (raiz)
app.get('/', (req: Request, res: Response) => {
  res.send('Trading bot is running.');
});

// ✅ Rota pública (/login)
app.post('/login', (req: Request, res: Response): void => {
  try {
    const { password } = req.body;
    if (password === process.env.PAINEL_PASSWORD) {
      const token = jwt.sign({ user: 'admin' }, jwtSecret, { expiresIn: '8h' });
      res.json({ token });
    } else {
      res.status(401).json({ status: 'error', message: 'Senha incorreta.' });
    }
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ status: 'error', message: 'Erro interno no login.' });
  }
});

// 🔒 /status
app.get('/status', authenticateToken, (req: Request, res: Response): void => {
  try {
    const status = getCurrentStatus();
    res.json(status); // ✅ sem return
  } catch (error) {
    console.error('Erro ao buscar status:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar status.' });
  }
});

// 🔒 /sell-now
app.post('/sell-now', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await forceSellNow();

    if (result?.status === 'warning') {
      res.status(400).json(result);
      return;
    }

    res.json({ status: 'success', message: 'Venda forçada executada com sucesso.', result });
  } catch (error: any) {
    const msg = typeof error.message === 'string' ? error.message : 'Erro inesperado ao vender.';
    const code = msg.includes('Nenhuma operação') ? 400 : 500;
    console.error('Erro ao vender:', error);
    res.status(code).json({ status: 'error', message: msg });
  }
});

app.listen(config.PORT, () => {
  console.log(`✅ Server running on port ${config.PORT}`);
  startTrading();
});

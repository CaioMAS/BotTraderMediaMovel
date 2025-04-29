import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { startTrading, getCurrentStatus, forceSellNow } from './src/services/strategyService';
import { config } from './src/config/dotenv';

const app = express();
const jwtSecret = process.env.JWT_SECRET || 'senhaMuitoSecretaPadrao';

const allowedOrigins = [
  'http://localhost:3000', // front-end
];
app.use(cors({
  origin: function (origin, callback) {
    // permite chamadas do próprio server (como postman) e da lista
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// 🛡️ Middleware de autenticação com Bearer Token
function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Token não fornecido' });
    return; // <-- resolve o erro!
  }

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      res.status(403).json({ message: 'Token inválido' });
      return; // <-- resolve o erro!
    }

    (req as any).user = user;
    next();
  });
}

// ✅ Rota pública (raiz)
app.get('/', (req: Request, res: Response) => {
  res.send('Trading bot is running.');
});

// ✅ Rota pública (/login) para gerar token
app.post('/login', (req: Request, res: Response): void => {
  const { password } = req.body;

  if (password === process.env.PAINEL_PASSWORD) {
    const token = jwt.sign({ user: 'admin' }, jwtSecret, { expiresIn: '8h' });
    res.json({ token });
    return;
  } else {
    res.status(401).json({ message: 'Senha incorreta' });
    return;
  }
});

// 🔒 Rotas protegidas com JWT
app.get('/status', authenticateToken, (req: Request, res: Response) => {
  try {
    const status = getCurrentStatus();
    res.json(status);
  } catch (error) {
    console.error('Erro ao buscar status:', error);
    res.status(500).json({ status: 'error', message: 'Erro ao buscar status.' });
  }
});

app.post('/sell-now', authenticateToken, async (req: Request, res: Response) => {
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

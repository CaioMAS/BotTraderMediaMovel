import { newOrder } from './src/services/orderService';

async function testBuyOrder() {
  const quantity = '250'; // ou ajuste se quiser testar outra quantidade
  const side = 'SELL';

  console.log('🧪 Testando envio de ordem para Binance...');
  console.log(`🔢 Quantidade: ${quantity}`);
  console.log(`📘 Tipo: ${side}`);

  await newOrder(quantity, side);
}

testBuyOrder();

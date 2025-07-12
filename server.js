import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('🚀 Backend AbacatePay está rodando!');
});

// Rota para criar pagamento (se necessário futuramente)
app.post('/abacatepay', async (req, res) => {
  try {
    const response = await fetch('https://api.abacatepay.com/v1/pixQrCode/create', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    const result = await response.json();
    res.status(response.status).json(result);
  } catch (err) {
    console.error('Erro ao chamar AbacatePay:', err);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

// ✅ Rota para checar status do PIX
app.get('/abacatepay/v1/pixQrCode/check', async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'ID da transação não informado' });
  }

  try {
    const response = await fetch(`https://api.abacatepay.com/v1/pixQrCode/check?id=${id}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();
    res.status(response.status).json(result);
  } catch (err) {
    console.error('Erro ao checar status na AbacatePay:', err);
    res.status(500).json({ error: 'Erro ao checar status do pagamento' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend rodando em http://localhost:${PORT}`);
});

// backend/index.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch'); // ou axios
const cors = require('cors');

const app = express();

// Configurar CORS para liberar o frontend local (ajuste a URL se necessário)
app.use(cors({
  origin: 'http://127.0.0.1:5500' 
}));

app.use(express.json());

const ABACATEPAY_API_URL = 'https://api.abacatepay.com/v1/pixQrCode/create';
const ABACATEPAY_API_KEY = process.env.ABACATEPAY_TOKEN; // sua chave secreta

// Endpoint para criar cobrança Pix
app.post('/criar-pix', async (req, res) => {
  console.log('Recebido no backend:', req.body);

  try {
    const { amount, expiresIn, description, customer } = req.body;

    // Validação simples:
    if (!amount || amount < 2000 || amount > 120000) {
      return res.status(400).json({ error: 'Valor inválido. Deve estar entre 20,00 e 1.200,00 reais.' });
    }

    if (customer) {
      const { name, cellphone, email, taxId } = customer;
      if (!name || !cellphone || !email || !taxId) {
        return res.status(400).json({ error: 'Todos os campos do cliente são obrigatórios.' });
      }
    }

    const payload = { amount, expiresIn: expiresIn || 3600, description, customer: customer || undefined };

    console.log('Payload para AbacatePay:', JSON.stringify(payload));

    const response = await fetch('https://api.abacatepay.com/v1/pixQrCode/create', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('Resposta AbacatePay:', data);

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Erro ao criar Pix' });
    }

    return res.json(data);
  } catch (err) {
    console.error('Erro no backend:', err);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
});

// Webhook para notificações (configurar URL no painel AbacatePay)
app.post('/webhook', (req, res) => {
  const event = req.body;
  console.log('Webhook recebido:', event);

  // Aqui você pode atualizar seu banco, enviar email, etc.
  // Exemplo: se event.status === 'PAID' -> marca doação como paga

  res.status(200).send('ok');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend rodando na porta ${PORT}`));

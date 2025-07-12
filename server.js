require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ABACATEPAY_TOKEN = process.env.ABACATEPAY_TOKEN;

app.post('/create-pix', async (req, res) => {
  const { amount, description, customer } = req.body;

  if (!amount || amount < 20) {
    return res.status(400).json({ error: 'Valor mínimo de R$20,00 (2000 centavos)' });
  }

  try {
    const response = await axios.post('https://api.abacatepay.com/v1/pixQrCode/create', {
      amount,
      description: description || 'Doação Ajude Ana',
      customer,
      expiresIn: 3600,
    }, {
      headers: {
        Authorization: `Bearer ${ABACATEPAY_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    return res.json({ data: response.data.data });
  } catch (error) {
    console.error('Erro na AbacatePay:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Erro ao gerar PIX' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando na porta ${PORT}`);
});

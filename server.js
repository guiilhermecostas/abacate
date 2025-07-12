require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/gerar-pix', async (req, res) => {
  const { nome, email, telefone, valor } = req.body;

  try {
    const response = await axios.post(
      'https://api.abacatepay.com/billing/create',
      {
        amount: valor,
        customer: {
          name: nome,
          email,
          cellphone: telefone,
          taxId: '20873372760' // CPF opcional ou fictício para testes
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ABACATEPAY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { pix } = response.data;

    res.json({
      qr_code_base64: pix.qr_code_base64,
      pix_copia_cola: pix.qr_code
    });

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ erro: 'Erro ao gerar Pix' });
  }
});

app.listen(3000, () => {
  console.log('Servidor rodando em http://localhost:3000');
});

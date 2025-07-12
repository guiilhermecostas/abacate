require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/gerar-pix', async (req, res) => {
  const { nome, email, telefone, valor } = req.body;

  try {
    const response = await axios.post(
      'https://api.abacatepay.com/v1/pixQrCode/create',
      {
        amount: valor,
        expiresIn: 3600, // expira em 1 hora
        description: 'Ajude a Ana 🙏',
        customer: {
          name: nome,
          cellphone: telefone,
          email: email,
          taxId: '00000000000' // ou CPF real
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.ABACATEPAY_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = response.data.data;

    res.json({
      qr_code_base64: data.brCodeBase64,
      pix_copia_cola: data.brCode
    });

  } catch (err) {
    console.error('Erro ao gerar Pix:', err.response?.data || err.message);
    res.status(500).json({ erro: 'Erro ao gerar Pix' });
  }
});

app.listen(3000, () => {
  console.log('✅ Backend rodando em http://localhost:3000');
});

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
console.log('STRIPE_SECRET_KEY =', process.env.STRIPE_SECRET_KEY);
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors'); // ➕ สำคัญสำหรับ frontend

const app = express();
app.use(cors());  
app.use(bodyParser.json());

let users = [];
let orders = [];

app.post('/api/checkout', async (req, res) => {
  const { cart } = req.body;

  if (!Array.isArray(cart) || cart.length === 0)
    return res.status(400).json({ error: 'ไม่มีสินค้าในตะกร้า' });

  try {
    const line_items = cart.map(item => ({
      price_data: {
        currency: 'thb',
        product_data: {
          name: item.name,
        },
        unit_amount: item.price * 100, // THB * 100 = satang
      },
      quantity: 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items,
      mode: 'payment',
      success_url: 'http://localhost:3000/success.html',
      cancel_url: 'http://localhost:3000/cancel.html',
    });

    orders.push({ cart, sessionId: session.id, date: new Date() });
    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ไม่สามารถสร้าง session การชำระเงิน' });
  }
});

app.listen(3001, () => console.log('Backend running on port 3001'));

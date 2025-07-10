let users = [];
let orders = [];
let verificationTokens = {};

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'phoomdet.phetsuwan.mail@gmail.com',         
    pass: 'YOUR_APP_PASSWORD'             
  }
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;

  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'อีเมลนี้มีในระบบแล้ว' });
  }

  const token = uuidv4();
  verificationTokens[token] = email;

  users.push({ username, email, password, verified: false });

  const verifyLink = `http://localhost:3001/api/verify-email?token=${token}`;
  const mailOptions = {
    from: '"Red & Black Shop" <phoomdet.phetsuwan.mail@gmail.com>',  // 🔁 แก้เป็นอีเมลคุณ
    to: email,
    subject: 'ยืนยันอีเมลของคุณ',
    html: `<p>สวัสดีคุณ ${username},</p>
           <p>กรุณาคลิกที่ลิงก์เพื่อยืนยันอีเมล:</p>
           <a href="${verifyLink}">${verifyLink}</a>`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('ส่งอีเมลล้มเหลว:', error);
      return res.status(500).json({ error: 'ส่งอีเมลล้มเหลว' });
    }
    res.json({ success: true, message: 'สมัครสำเร็จ กรุณายืนยันอีเมล' });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });

  if (!user.verified) {
    return res.status(403).json({ error: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ' });
  }

  res.json({ success: true, username: user.username });
});

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

app.get('/api/verify-email', (req, res) => {
  const { token } = req.query;
  const email = verificationTokens[token];

  if (!email) {
    return res.status(400).send('ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ');
  }

  const user = users.find(u => u.email === email);
  if (!user) return res.status(404).send('ไม่พบผู้ใช้');

  user.verified = true;
  delete verificationTokens[token];

  res.send('✅ ยืนยันอีเมลเรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบได้');
});


app.listen(3001, () => console.log('Backend running on port 3001'));

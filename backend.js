const bcrypt = require('bcrypt');

// ✅ load dotenv ก่อนทุกอย่าง
require('dotenv').config();

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://red-black-shop.firebaseio.com'
});

const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

const db = admin.firestore();
const usersCollection = db.collection('users');

const express = require('express');
const bodyParser = require('body-parser');
console.log('STRIPE_SECRET_KEY =', process.env.STRIPE_SECRET_KEY);
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors'); // ➕ สำคัญสำหรับ frontend

const app = express();
const path = require('path');
app.use(express.static(path.join(__dirname, '.')));
app.use(cors());  
app.use(bodyParser.json());

let users = [];
let orders = [];
const verificationTokens = {};
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  const email = verificationTokens[token];
  if (!email) return res.status(400).send('ลิงก์ไม่ถูกต้องหรือหมดอายุ');

  const snapshot = await usersCollection.where('email', '==', email).get();
  if (snapshot.empty) return res.status(404).send('ไม่พบผู้ใช้');

  const doc = snapshot.docs[0];
  await usersCollection.doc(doc.id).update({ verified: true });

  delete verificationTokens[token];
  res.send('✅ ยืนยันอีเมลเรียบร้อยแล้ว คุณสามารถเข้าสู่ระบบได้');
});

app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;

  const snapshot = await usersCollection.where('email', '==', email).get();
  if (!snapshot.empty) {
    return res.status(400).json({ error: 'อีเมลนี้มีในระบบแล้ว' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const token = uuidv4();
  verificationTokens[token] = email;

  await usersCollection.add({
    username,
    email,
    password: hashedPassword,
    verified: false,
    createdAt: new Date().toISOString()
  });

  const verifyLink = `https://red-black-shop.onrender.com/api/verify-email?token=${token}`;

  const mailOptions = {
    from: '"Red & Black Shop" <phoomdet.phetsuwan.mail@gmail.com>',
    to: email,
    subject: 'ยืนยันอีเมลของคุณ',
    html: `<p>สวัสดีคุณ ${username},</p>
           <p>กรุณาคลิกที่ลิงก์เพื่อยืนยัน:</p>
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


app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  const snapshot = await usersCollection.where('email', '==', email).get();

  if (snapshot.empty)
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });

  const userDoc = snapshot.docs[0];
  const user = userDoc.data();

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }

  if (!user.verified)
    return res.status(403).json({ error: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ' });

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
      success_url: 'https://red-black-shop.onrender.com/success.html',
      cancel_url: 'https://red-black-shop.onrender.com/cancel.html',
    });

    orders.push({ cart, sessionId: session.id, date: new Date() });
    res.json({ url: session.url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'ไม่สามารถสร้าง session การชำระเงิน' });
  }
});

app.listen(3001, () => console.log('Backend running on port 3001'));

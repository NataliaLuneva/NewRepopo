const express = require('express');
const app = express();

const PORT = process.env.PORT || 3000;
const NIMI = process.env.MY_NAME || "Tester Bob";


// ✅ Stripe checkout
app.get('/', (req, res) =>{
  res.send(`
    <h1>DB is working!</h1>
    <p>Hi, ${NIMI}!</p>
    <p>Status: <b>ONLINE</b></p>
  `);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`============================`);
  console.log(`Niminal server is UP!`);
  console.log(`PORT: ${PORT}`);
  console.log(`============================`);
});

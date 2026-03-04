const express = require('express');
const path = require('path');
const Stripe = require('stripe');

const app = express();
const PORT = process.env.PORT || 3000;

const stripe = new Stripe(process.env.VITE_CLERK_PUBLISHABLE_KEY);

app.use(express.json());

// ✅ Stripe checkout
app.post('/create-checkout-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Pro Subscription',
            },
            unit_amount: 1000, // 10€
          },
          quantity: 1,
        },
      ],
      success_url: `${req.headers.origin}/success`,
      cancel_url: `${req.headers.origin}/cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Stripe error' });
  }
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime()
  });
});

// ✅ Отдаём React build
app.use(express.static(path.join(__dirname, 'clerk-react/dist')));

// ✅ React Router fallback (ВСЕГДА В КОНЦЕ)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'clerk-react/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
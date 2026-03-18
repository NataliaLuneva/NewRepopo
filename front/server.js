const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8'); // ЗАМЕНИ НА СВОЙ

const app = express();
const PORT = 3000;
const WEBHOOK_SECRET = 'whsec_xRRpYTPLJtV67ZZnPwrkw1rnbY2xBDjH'; // Для проверки оплат

// Для вебхука Stripe нужен сырой body (raw)
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- ЛОГИКА ПОКУПКИ ЧЕРЕЗ STRIPE ---
app.post('/purchase', async (req, res) => {
    try {
        const item = await pb.collection('inventory').getOne(req.body.id);
        
        // Создаем сессию оплаты Stripe
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: item.device },
                    unit_amount: Math.round(item.price * 100), // Цена в центах
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `http://localhost:${PORT}/?status=success`,
            cancel_url: `http://localhost:${PORT}/?status=cancel`,
            metadata: { itemId: item.id } // Передаем ID товара, чтобы найти его потом
        });

        res.redirect(303, session.url);
    } catch (e) { res.send("Ошибка Stripe: " + e.message); }
});

// --- WEBHOOK (Слушает ответ от Stripe) ---
app.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }

    // Если оплата прошла успешно
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const itemId = session.metadata.itemId;

        // ВОТ ЗДЕСЬ МЕНЯЕМ СТАТУС В БАЗЕ
        await pb.collection('inventory').update(itemId, { work: 'sold' });
        console.log(`Товар ${itemId} успешно оплачен и переведен в SOLD`);
    }

    res.json({ received: true });
});

// --- ГЛАВНАЯ СТРАНИЦА (ВСЕ СТАРЫЕ ФИШКИ ТУТ) ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');
    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
    const isWorker = me.role === 'worker';
    const isUser = me.role === 'user';

    try {
        const availableItems = await pb.collection('inventory').getFullList({ filter: 'work != "sold"', sort: '-created' });
        let soldItems = (isAdmin || isWorker) ? await pb.collection('inventory').getFullList({ filter: 'work = "sold"', sort: '-updated' }) : [];
        const users = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        // Уведомление об успехе
        const msg = req.query.status === 'success' ? '<div style="background:green;color:white;padding:10px;">Оплата прошла! Товар скоро исчезнет из списка.</div>' : '';

        let html = `
        <style>
            body { font-family: sans-serif; background: #f0f2f5; padding: 20px; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 20px; }
            .btn-buy { background: #6772e5; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
        </style>
        <div style="max-width:900px; margin:0 auto;">
            ${msg}
            <div class="card">
                <h2>Личный кабинет: ${me.email} (${me.role})</h2>
                <a href="/logout">Выйти</a>
            </div>

            <div class="card">
                <h3>🛍 Магазин</h3>
                <table>
                    ${availableItems.map(i => `
                    <tr>
                        <td><b>${i.device}</b></td>
                        <td style="color:green; font-weight:bold;">${i.price} $</td>
                        <td>
                            ${isUser ? `
                                <form method="POST" action="/purchase">
                                    <input type="hidden" name="id" value="${i.id}">
                                    <button type="submit" class="btn-buy">Оплатить через Stripe</button>
                                </form>
                            ` : `<span style="color:gray">${i.work}</span>`}
                        </td>
                    </tr>`).join('')}
                </table>
            </div>

            ${(isAdmin || isWorker) ? `
            <div class="card" style="border-left: 5px solid red;">
                <h3>🔴 ИСТОРИЯ ПРОДАЖ (SOLD)</h3>
                <table>
                    ${soldItems.map(s => `<tr><td><del>${s.device}</del></td><td>${s.price} $</td><td>${new Date(s.updated).toLocaleString()}</td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            ${isAdmin ? `
            <div class="card">
                <h3>⚙️ Админ: Добавить товар</h3>
                <form method="POST" action="/add-inventory">
                    <input name="device" placeholder="Название">
                    <input name="price" type="number" placeholder="Цена">
                    <button type="submit">Добавить</button>
                </form>
            </div>
            ` : ''}
        </div>`;
        res.send(html);
    } catch (e) { res.send(e.message); }
});

// Стандартные роуты (админка, логин и т.д.) остались такими же...
app.post('/add-inventory', async (req, res) => {
    await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working' });
    res.redirect('/');
});
app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.status(400).send('Ошибка'); }
});
app.get('/login', (req, res) => res.send('<form method="POST"><h2>Вход</h2><input name="email"><br><input name="password" type="password"><br><button>Login</button></form>'));
app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`Server with Stripe: http://localhost:${PORT}`));

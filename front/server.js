const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');
const stripe = require('stripe')('sk_test_ТВОЙ_КЛЮЧ'); // ЗАМЕНИ КЛЮЧ

const app = express();
const PORT = 3000;

// Это нужно для Stripe Webhook (обязательно перед bodyParser)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    // Тут логика подтверждения оплаты (как я писал раньше)
    res.json({ received: true });
});

app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- СТАРАЯ ФУНКЦИЯ АВАТАРОК ---
function getAvatarUrl(user) {
    if (!user || !user.avatar) return `https://via.placeholder.com/100?text=${user?.email?.split('@')[0] || 'U'}`;
    return `${PB_URL}api/files/_pb_users_auth_/${user.id}/${user.avatar}`;
}

// --- ЛОГИКА ПОКУПКИ (STRIPE) ---
app.post('/purchase', async (req, res) => {
    try {
        const item = await pb.collection('inventory').getOne(req.body.id);
        const protocol = req.protocol;
        const host = req.get('http://q4vrdaww4pxl853s04ou3wty.176.112.158.3.sslip.io/');
        const baseUrl = `${protocol}://${host}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: item.device },
                    unit_amount: Math.round(item.price * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${baseUrl}/?status=success`,
            cancel_url: `${baseUrl}/?status=cancel`,
            metadata: { itemId: item.id }
        });
        res.redirect(303, session.url);
    } catch (e) {
        res.status(500).send("Ошибка Stripe: " + e.message);
    }
});

// --- ГЛАВНАЯ СТРАНИЦА (ВСЕ ФИШКИ ТУТ) ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');
    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
    const isWorker = me.role === 'worker';
    const isUser = me.role === 'user';

    try {
        const availableItems = await pb.collection('inventory').getFullList({ filter: 'work != "sold"', sort: '-created' });
        let soldItems = (isAdmin || isWorker) ? await pb.collection('inventory').getFullList({ filter: 'work = "sold"', sort: '-updated' }) : [];

        let html = `
        <style>
            body { font-family: sans-serif; background: #f0f2f5; padding: 20px; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 20px; }
            .btn-buy { background: #6772e5; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
            table { width: 100%; border-collapse: collapse; }
            td, th { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
        </style>
        <div style="max-width:1000px; margin:0 auto;">
            <div class="card">
                <img src="${getAvatarUrl(me)}" style="width:40px; border-radius:50%; vertical-align:middle;">
                <b>${me.email}</b> (${me.role}) | <a href="/logout">Выйти</a>
            </div>

            <div class="card">
                <h3>🛍 Магазин (В наличии)</h3>
                <table>
                    ${availableItems.map(i => `
                    <tr>
                        <td><b>${i.device}</b></td>
                        <td style="color:green;">${i.price} $</td>
                        <td>
                            ${isUser ? `
                                <form method="POST" action="/purchase">
                                    <input type="hidden" name="id" value="${i.id}">
                                    <button type="submit" class="btn-buy">КУПИТЬ (Stripe)</button>
                                </form>
                            ` : `<span style="color:gray">${i.work}</span>`}
                        </td>
                    </tr>`).join('')}
                </table>
            </div>

            ${(isAdmin || isWorker) ? `
            <div class="card" style="border-left:5px solid red;">
                <h3 style="color:red;">🔴 ИСТОРИЯ ПРОДАЖ (SOLD)</h3>
                <table>
                    ${soldItems.map(s => `<tr><td><del>${s.device}</del></td><td>${s.price} $</td><td>${new Date(s.updated).toLocaleString()}</td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            ${isAdmin ? `
            <div class="card">
                <h3>⚙️ Админ: Добавить товар</h3>
                <form method="POST" action="/add-inventory">
                    <input name="device" placeholder="Название" required>
                    <input name="price" type="number" placeholder="Цена" required>
                    <button type="submit">Добавить</button>
                </form>
            </div>
            ` : ''}
        </div>`;
        res.send(html);
    } catch (e) { res.send(e.message); }
});

// --- СТАНДАРТНЫЕ ОБРАБОТЧИКИ ---
app.post('/add-inventory', async (req, res) => {
    try {
        await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working' });
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

app.post('/toggle-status', async (req, res) => {
    const next = req.body.current === 'working' ? 'not working' : 'working';
    await pb.collection('inventory').update(req.body.id, { work: next });
    res.redirect('/');
});

app.get('/login', (req, res) => res.send('<form method="POST" style="padding:50px;"><h2>Вход</h2><input name="email"><br><br><input name="password" type="password"><br><br><button>Login</button></form>'));
app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.status(400).send('Ошибка'); }
});
app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`Сервер запущен: http://localhost:${PORT}`));

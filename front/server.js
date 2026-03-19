const express = require('express');
const PocketBase = require('pocketbase/cjs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_51TCHF...'); // Лучше через env
const session = require('express-session'); // Добавим для корзины

const app = express();
const PORT = process.env.PORT || 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// Настройка сессий для корзины
app.use(session({
    secret: 'coolify-secret-key',
    resave: false,
    saveUninitialized: true
}));

// --- ВЕБХУК (Должен быть ДО body-parser) ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_xRRp...'; 
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }

    if (event.type === 'checkout.session.completed') {
        const itemIds = event.data.object.metadata.itemIds.split(',');
        try {
            // Помечаем все купленные товары как sold
            for (const id of itemIds) {
                await pb.collection('inventory').update(id, { status: 'sold' });
            }
        } catch (e) { console.error("Stripe Update Error:", e.message); }
    }
    res.json({ received: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- МИДДЛВАР ДЛЯ КОРЗИНЫ ---
app.use((req, res, next) => {
    if (!req.session.cart) req.session.cart = [];
    next();
});

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');
    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
    const isWorker = me.role === 'worker';
    const isUser = me.role === 'user';

    try {
        const availableItems = await pb.collection('inventory').getFullList({ filter: 'status != "sold"', sort: '-created' });
        const soldItems = (isAdmin || isWorker) ? await pb.collection('inventory').getFullList({ filter: 'status = "sold"', sort: '-updated' }) : [];
        const allUsers = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];
        
        // Получаем объекты товаров в корзине
        const cartItems = availableItems.filter(i => req.session.cart.includes(i.id));
        const cartTotal = cartItems.reduce((sum, i) => sum + i.price, 0);

        let html = `
        <style>
            :root { --p-color: #6366f1; --s-color: #10b981; --bg: #f8fafc; }
            body { font-family: 'Inter', system-ui, sans-serif; background: var(--bg); margin: 0; padding: 20px; color: #1e293b; }
            .container { max-width: 1100px; margin: 0 auto; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; border: 1px solid #e2e8f0; }
            .flex-header { display: flex; justify-content: space-between; align-items: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { text-align: left; color: #64748b; font-size: 0.85rem; text-transform: uppercase; padding: 10px; border-bottom: 2px solid #f1f5f9; }
            td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
            .btn { padding: 8px 16px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; text-decoration: none; transition: 0.2s; font-size: 0.9rem; }
            .btn-primary { background: var(--p-color); color: white; }
            .btn-cart { background: var(--s-color); color: white; }
            .btn-danger { background: #fee2e2; color: #ef4444; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; background: #e2e8f0; }
            .cart-box { position: sticky; top: 20px; background: #1e293b; color: white; }
        </style>

        <div class="container">
            <div class="card flex-header">
                <div>
                    <span class="badge" style="background:var(--p-color); color:white;">${me.role.toUpperCase()}</span>
                    <strong style="margin-left:10px;">${me.email}</strong>
                </div>
                <a href="/logout" class="btn btn-danger">Выйти</a>
            </div>

            <div style="display: grid; grid-template-columns: ${isUser ? '2fr 1fr' : '1fr'}; gap: 20px;">
                
                <div class="main-content">
                    <div class="card">
                        <h3>📦 Доступные товары</h3>
                        ${isAdmin ? `
                        <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:15px;">
                            <input name="device" placeholder="Название" required style="flex:2; padding:8px; border-radius:6px; border:1px solid #ddd;">
                            <input name="price" type="number" placeholder="Цена" required style="flex:1; padding:8px; border-radius:6px; border:1px solid #ddd;">
                            <button class="btn btn-primary">+ Добавить</button>
                        </form>` : ''}
                        
                        <table>
                            <thead><tr><th>Товар</th><th>Цена</th>${!isUser ? '<th>Работа</th>' : ''}<th>Действие</th></tr></thead>
                            ${availableItems.map(i => `
                            <tr>
                                <td><b>${i.device}</b></td>
                                <td style="color:var(--s-color); font-weight:700;">$${i.price}</td>
                                ${!isUser ? `<td><span class="badge">${i.work}</span></td>` : ''}
                                <td>
                                    ${isUser ? `
                                        <a href="/add-to-cart/${i.id}" class="btn btn-cart">В корзину</a>
                                    ` : `
                                        <div style="display:flex; gap:5px;">
                                            <form method="POST" action="/toggle-status"><input type="hidden" name="id" value="${i.id}"><input type="hidden" name="current" value="${i.work}"><button class="btn" style="background:#f1f5f9;">⚙️</button></form>
                                            ${isAdmin ? `<a href="/del-item/${i.id}" class="btn btn-danger">🗑️</a>` : ''}
                                        </div>
                                    `}
                                </td>
                            </tr>`).join('')}
                        </table>
                    </div>

                    ${(isAdmin || isWorker) ? `
                    <div class="card">
                        <h3 style="color:var(--s-color);">✅ История продаж</h3>
                        <table>
                            ${soldItems.map(s => `<tr><td><del>${s.device}</del></td><td><b>$${s.price}</b></td><td style="font-size:0.8rem; color:gray;">${new Date(s.updated).toLocaleDateString()}</td></tr>`).join('')}
                        </table>
                    </div>` : ''}
                </div>

                ${isUser ? `
                <div class="sidebar">
                    <div class="card cart-box">
                        <h3>🛒 Корзина</h3>
                        ${cartItems.length === 0 ? '<p>Пусто</p>' : `
                            <ul style="list-style:none; padding:0; font-size:0.9rem;">
                                ${cartItems.map(c => `<li style="display:flex; justify-content:space-between; margin-bottom:8px;">
                                    <span>${c.device}</span>
                                    <span><b>$${c.price}</b> <a href="/remove-from-cart/${c.id}" style="color:#ef4444; text-decoration:none;">✕</a></span>
                                </li>`).join('')}
                            </ul>
                            <hr style="border:0; border-top:1px solid #334155;">
                            <div class="flex-header" style="margin-bottom:15px;">
                                <span>Итого:</span>
                                <span style="font-size:1.2rem; color:var(--s-color); font-weight:bold;">$${cartTotal}</span>
                            </div>
                            <form method="POST" action="/checkout">
                                <button class="btn btn-primary" style="width:100%; padding:12px; background:var(--s-color);">ОПЛАТИТЬ</button>
                            </form>
                            <a href="/clear-cart" style="display:block; text-align:center; color:#94a3b8; font-size:0.8rem; margin-top:10px; text-decoration:none;">Очистить всё</a>
                        `}
                    </div>
                </div>` : ''}

            </div>
        </div>`;
        res.send(html);
    } catch (e) { res.send("Ошибка: " + e.message); }
});

// --- ЛОГИКА КОРЗИНЫ ---
app.get('/add-to-cart/:id', (req, res) => {
    if (!req.session.cart.includes(req.params.id)) req.session.cart.push(req.params.id);
    res.redirect('/');
});

app.get('/remove-from-cart/:id', (req, res) => {
    req.session.cart = req.session.cart.filter(id => id !== req.params.id);
    res.redirect('/');
});

app.get('/clear-cart', (req, res) => {
    req.session.cart = [];
    res.redirect('/');
});

// --- СТРАЙП ОПЛАТА КОРЗИНЫ ---
app.post('/checkout', async (req, res) => {
    try {
        const items = await pb.collection('inventory').getFullList({ filter: req.session.cart.map(id => `id="${id}"`).join('||') });
        
        const lineItems = items.map(i => ({
            price_data: {
                currency: 'usd',
                product_data: { name: i.device },
                unit_amount: Math.round(i.price * 100),
            },
            quantity: 1,
        }));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/?status=success`,
            cancel_url: `${req.protocol}://${req.get('host')}/?status=cancel`,
            metadata: { itemIds: items.map(i => i.id).join(',') }
        });

        req.session.cart = []; // Чистим корзину после создания сессии
        res.redirect(303, session.url);
    } catch (e) { res.send("Stripe Error: " + e.message); }
});


app.get('/register', (req, res) => {
    res.send(`<style>body{margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:white;}.card{background:#1e293b;padding:40px;border-radius:20px;width:350px;text-align:center;}input{width:100%;padding:12px;margin:10px 0;border-radius:8px;border:none;background:#334155;color:white;box-sizing:border-box;}button{width:100%;padding:12px;background:#10b981;border:none;color:white;border-radius:8px;font-weight:bold;cursor:pointer;margin-top:10px;}a{color:#94a3b8;text-decoration:none;font-size:0.9em;display:block;margin-top:15px;}</style>
    <div class="card"><h2>Регистрация</h2><form method="POST" action="/register"><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Пароль (8+ симв.)" required><button>Создать аккаунт</button></form><a href="/login">Войти</a></div>`);
});

app.post('/register', async (req, res) => {
    try {
        await pb.collection('users').create({ "email": req.body.email, "password": req.body.password, "passwordConfirm": req.body.password, "role": "user", "emailVisibility": true });
        await pb.collection('users').authWithPassword(req.body.email, req.body.password);
        res.redirect('/');
    } catch (e) { res.status(400).send("Ошибка: " + e.message); }
});

app.get('/login', (req, res) => {
    res.send(`<style>body{margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:white;}.card{background:#1e293b;padding:40px;border-radius:20px;width:350px;text-align:center;}input{width:100%;padding:12px;margin:10px 0;border-radius:8px;border:none;background:#334155;color:white;box-sizing:border-box;}button{width:100%;padding:12px;background:#6366f1;border:none;color:white;border-radius:8px;font-weight:bold;cursor:pointer;}a{color:#94a3b8;text-decoration:none;font-size:0.9em;display:block;margin-top:15px;}</style>
    <div class="card"><h2>Вход</h2><form method="POST" action="/login"><input name="email" placeholder="Email" required><input name="password" type="password" placeholder="Пароль" required><button>Войти</button></form><a href="/register">Регистрация</a></div>`);
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.status(400).send('Ошибка входа'); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.post('/add-user', async (req, res) => {
    try { await pb.collection('users').create({ email: req.body.email, password: req.body.password, passwordConfirm: req.body.password, role: req.body.role, emailVisibility: true }); res.redirect('/'); } catch (e) { res.send(e.message); }
});

app.get('/del-user/:id', async (req, res) => {
    try { await pb.collection('users').delete(req.params.id); res.redirect('/'); } catch (e) { res.send(e.message); }
});

app.post('/purchase', async (req, res) => {
    try {
        const item = await pb.collection('inventory').getOne(req.body.id);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price_data: { currency: 'usd', product_data: { name: item.device }, unit_amount: Math.round(item.price * 100) }, quantity: 1 }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/?status=success`,
            cancel_url: `${req.protocol}://${req.get('host')}/?status=cancel`,
            metadata: { itemId: item.id }
        });
        res.redirect(303, session.url);
    } catch (e) { res.send(e.message); }
});

app.post('/toggle-status', async (req, res) => {
    const next = req.body.current === 'working' ? 'not working' : 'working';
    await pb.collection('inventory').update(req.body.id, { work: next });
    res.redirect('/');
});

app.post('/add-inventory', async (req, res) => {
    await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working', status: '' });
    res.redirect('/');
});

app.get('/del-item/:id', async (req, res) => {
    await pb.collection('inventory').delete(req.params.id);
    res.redirect('/');
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Coolify Server on port ${PORT}`));

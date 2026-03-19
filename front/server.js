const express = require('express');
const PocketBase = require('pocketbase/cjs');
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');

const app = express();
const PORT = process.env.PORT || 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- 1. ВЕБХУК (Всегда первым!) ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = 'whsec_xRRpYTPLJtV67ZZnPwrkw1rnbY2xBDjH'; 
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) { 
        return res.status(400).send(`Webhook Error: ${err.message}`); 
    }

    if (event.type === 'checkout.session.completed') {
        const itemIds = event.data.object.metadata.itemIds.split(',');
        try {
            for (const id of itemIds) {
                await pb.collection('inventory').update(id, { status: 'sold' });
            }
        } catch (e) { console.error("PB Update Error:", e.message); }
    }
    res.json({ received: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- 2. ГЛАВНАЯ СТРАНИЦА ---
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

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: white; margin: 0; padding: 20px; }
            .card { background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; border-bottom: 1px solid #334155; text-align: left; }
            .btn { padding: 8px 15px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; text-decoration: none; color: white; display: inline-block; }
            .btn-buy { background: #10b981; width: 100%; margin-top: 20px; padding: 15px; font-size: 1.1em; }
            .price { color: #10b981; font-weight: bold; }
            input, select { padding: 8px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: white; }
        </style>

        <div style="max-width: 1000px; margin: 0 auto;">
            <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                <div><strong>${me.email}</strong> <span style="color:#6366f1;">(${me.role})</span></div>
                <a href="/logout" style="color:#f43f5e; font-weight:bold; text-decoration:none;">Выйти</a>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Пользователи</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input name="email" type="email" placeholder="Email" required>
                    <input name="password" type="password" placeholder="Пароль" required>
                    <select name="role"><option value="user">User</option><option value="worker">Worker</option><option value="admin">Admin</option></select>
                    <button class="btn" style="background:#6366f1;">Создать</button>
                </form>
                <table>
                    ${allUsers.map(u => `<tr><td>${u.email}</td><td>${u.role}</td><td><a href="/del-user/${u.id}" style="color:#f43f5e;">Удалить</a></td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            <div class="card">
                <h3>📦 Доступные товары</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:20px;">
                    <input name="device" placeholder="Название" required style="flex:2;">
                    <input name="price" type="number" placeholder="Цена" required style="flex:1;">
                    <button class="btn" style="background:#6366f1;">Добавить</button>
                </form>` : ''}

                <form method="POST" action="/purchase">
                    <table>
                        <thead>
                            <tr>
                                ${isUser ? '<th>🛒</th>' : ''}
                                <th>Название</th><th>Цена</th>
                                ${!isUser ? '<th>Работа</th><th>Действие</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${availableItems.map(i => `
                            <tr>
                                ${isUser ? `<td><input type="checkbox" name="ids" value="${i.id}"></td>` : ''}
                                <td><b>${i.device}</b></td>
                                <td class="price">$${i.price}</td>
                                ${!isUser ? `
                                    <td>${i.work}</td>
                                    <td><a href="/toggle-status/${i.id}/${i.work}" class="btn" style="background:#475569; font-size:0.8em;">Статус</a></td>
                                ` : ''}
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${isUser && availableItems.length > 0 ? `<button type="submit" class="btn btn-buy">КУПИТЬ ВЫБРАННОЕ</button>` : ''}
                </form>
            </div>
        </div>`;
        res.send(html);
    } catch (e) { res.send("Ошибка: " + e.message); }
});

// --- 3. ОБРАБОТЧИК ОПЛАТЫ (ЭТОТ РОУТ ЗАМЕНЯЕТ /checkout) ---
app.post('/purchase', async (req, res) => {
    try {
        let ids = req.body.ids;
        if (!ids) return res.send("Выберите товар! <a href='/'>Назад</a>");
        if (!Array.isArray(ids)) ids = [ids];

        const itemsToBuy = [];
        for (const id of ids) {
            const item = await pb.collection('inventory').getOne(id);
            if (item.status !== 'sold') itemsToBuy.push(item);
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: itemsToBuy.map(i => ({
                price_data: { currency: 'usd', product_data: { name: i.device }, unit_amount: Math.round(i.price * 100) },
                quantity: 1,
            })),
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/?status=success`,
            cancel_url: `${req.protocol}://${req.get('host')}/?status=cancel`,
            metadata: { itemIds: ids.join(',') }
        });
        res.redirect(303, session.url);
    } catch (e) { res.status(500).send("Ошибка Stripe: " + e.message); }
});

// --- ОСТАЛЬНЫЕ РОУТЫ ---
app.post('/add-inventory', async (req, res) => {
    await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working', status: 'available' });
    res.redirect('/');
});

app.get('/toggle-status/:id/:current', async (req, res) => {
    const next = req.params.current === 'working' ? 'not working' : 'working';
    await pb.collection('inventory').update(req.params.id, { work: next });
    res.redirect('/');
});

app.post('/add-user', async (req, res) => {
    try {
        await pb.collection('users').create({ email: req.body.email, password: req.body.password, passwordConfirm: req.body.password, role: req.body.role, emailVisibility: true });
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

app.get('/login', (req, res) => {
    res.send(`<div style="background:#0f172a; height:100vh; display:flex; justify-content:center; align-items:center; color:white; font-family:sans-serif;">
    <form method="POST" action="/login" style="background:#1e293b; padding:40px; border-radius:15px; width:300px;">
        <h2>Вход</h2>
        <input name="email" placeholder="Email" style="width:100%; padding:10px; margin:10px 0; border-radius:5px; border:none;">
        <input name="password" type="password" placeholder="Пароль" style="width:100%; padding:10px; margin:10px 0; border-radius:5px; border:none;">
        <button style="width:100%; padding:10px; background:#6366f1; color:white; border:none; border-radius:5px; cursor:pointer;">Войти</button>
        <br><br><a href="/register" style="color:#94a3b8; text-decoration:none; font-size:0.8em;">Нет аккаунта? Регистрация</a>
    </form></div>`);
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.send('Ошибка входа'); }
});

app.get('/register', (req, res) => {
    res.send(`<div style="background:#0f172a; height:100vh; display:flex; justify-content:center; align-items:center; color:white; font-family:sans-serif;">
    <form method="POST" action="/register" style="background:#1e293b; padding:40px; border-radius:15px; width:300px;">
        <h2>Регистрация</h2>
        <input name="email" type="email" placeholder="Email" style="width:100%; padding:10px; margin:10px 0; border-radius:5px; border:none;">
        <input name="password" type="password" placeholder="Пароль" style="width:100%; padding:10px; margin:10px 0; border-radius:5px; border:none;">
        <button style="width:100%; padding:10px; background:#10b981; color:white; border:none; border-radius:5px; cursor:pointer;">Создать</button>
    </form></div>`);
});

app.post('/register', async (req, res) => {
    try {
        await pb.collection('users').create({ email: req.body.email, password: req.body.password, passwordConfirm: req.body.password, role: "user", emailVisibility: true });
        await pb.collection('users').authWithPassword(req.body.email, req.body.password);
        res.redirect('/');
    } catch (e) { res.send("Ошибка: " + e.message); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 ONLINE`));

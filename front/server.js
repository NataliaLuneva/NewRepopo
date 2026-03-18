const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');

const app = express();
const PORT = 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// 1. ВЕБХУК ДЛЯ stripe (ОБЯЗАТЕЛЬНО ПЕРЕД bodyParser)
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
        const session = event.data.object;
        const itemId = session.metadata.itemId;
        
        // ВОТ ТУТ ОНО ОБНОВЛЯЕТ СТАТУС, ЧТОБЫ ТОВАР УШЕЛ В ИСТОРИЮ
        try {
            await pb.collection('inventory').update(itemId, { work: 'sold' });
            console.log(`Товар ${itemId} продан!`);
        } catch (e) {
            console.error("Ошибка обновления PB:", e);
        }
    }
    res.json({ received: true });
});

app.use(bodyParser.urlencoded({ extended: true }));

function getAvatarUrl(user) {
    if (!user || !user.avatar) return `https://via.placeholder.com/100?text=${user?.email?.split('@')[0] || 'U'}`;
    return `${PB_URL}api/files/_pb_users_auth_/${user.id}/${user.avatar}`;
}

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');
    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
    const isWorker = me.role === 'worker';
    const isUser = me.role === 'user';

    try {
        const availableItems = await pb.collection('inventory').getFullList({ filter: 'work != "sold"', sort: '-created' });
        const soldItems = (isAdmin || isWorker) ? await pb.collection('inventory').getFullList({ filter: 'work = "sold"', sort: '-updated' }) : [];
        const allUsers = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: sans-serif; background: #f0f2f5; padding: 20px; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 10px; border-bottom: 1px solid #eee; text-align: left; }
            .btn { border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; font-weight: bold; text-decoration: none; }
            .btn-buy { background: #6772e5; color: white; }
            .btn-del { background: #ff4757; color: white; font-size: 10px; }
            .price { color: #2ecc71; font-weight: bold; }
        </style>

        <div style="max-width:1100px; margin:0 auto;">
            <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                <div><b>${me.email}</b> (${me.role})</div>
                <a href="/logout" style="color:red; font-weight:bold;">ВЫХОД</a>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Юзеры (Админ)</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:10px;">
                    <input name="email" placeholder="Email" required>
                    <input name="password" type="password" placeholder="Пароль" required>
                    <select name="role"><option value="user">User</option><option value="worker">Worker</option><option value="admin">Admin</option></select>
                    <button type="submit" class="btn" style="background:#2ecc71; color:white;">Создать</button>
                </form>
                <table>
                    ${allUsers.map(u => `<tr><td>${u.email}</td><td>${u.role}</td><td><a href="/del-user/${u.id}" style="color:red;">Удалить</a></td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            <div class="card">
                <h3>🛍 Склад / Витрина</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input name="device" placeholder="Товар" required>
                    <input name="price" type="number" placeholder="Цена" required>
                    <button type="submit" class="btn" style="background:#2f3542; color:white;">Добавить</button>
                </form>
                ` : ''}
                <table>
                    <thead><tr><th>Товар</th><th>Цена</th>${!isUser ? '<th>Статус</th>' : ''}<th>Действие</th></tr></thead>
                    <tbody>
                        ${availableItems.map(i => `
                        <tr>
                            <td><b>${i.device}</b></td>
                            <td class="price">${i.price} $</td>
                            ${!isUser ? `<td>${i.work}</td>` : ''}
                            <td>
                                ${isUser ? `
                                    <form method="POST" action="/purchase"><input type="hidden" name="id" value="${i.id}"><button type="submit" class="btn btn-buy">КУПИТЬ</button></form>
                                ` : `
                                    <div style="display:flex; gap:5px;">
                                        <form method="POST" action="/toggle-status"><input type="hidden" name="id" value="${i.id}"><input type="hidden" name="current" value="${i.work}"><button type="submit" class="btn">Статус</button></form>
                                        ${isAdmin ? `<a href="/del-item/${i.id}" class="btn btn-del">DEL</a>` : ''}
                                    </div>
                                `}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            ${(isAdmin || isWorker) ? `
            <div class="card" style="border-top: 5px solid red;">
                <h3 style="color:red;">🔴 ИСТОРИЯ ПРОДАЖ (SOLD)</h3>
                <table>
                    ${soldItems.map(s => `<tr><td><del>${s.device}</del></td><td>${s.price} $</td><td>${new Date(s.updated).toLocaleString()}</td></tr>`).join('')}
                </table>
            </div>
            ` : ''}
        </div>`;
        res.send(html);
    } catch (e) { res.send(e.message); }
});

// --- РОУТЫ ---

app.post('/purchase', async (req, res) => {
    try {
        const item = await pb.collection('inventory').getOne(req.body.id);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{ price_data: { currency: 'usd', product_data: { name: item.device }, unit_amount: Math.round(item.price * 100) }, quantity: 1 }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/?status=success`,
            cancel_url: `${req.protocol}://${req.get('host')}/?status=cancel`,
            metadata: { itemId: item.id } // КРИТИЧНО ДЛЯ ВЕБХУКА
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
    await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working' });
    res.redirect('/');
});

app.get('/del-item/:id', async (req, res) => {
    await pb.collection('inventory').delete(req.params.id);
    res.redirect('/');
});

app.post('/add-user', async (req, res) => {
    await pb.collection('users').create({ email: req.body.email, password: req.body.password, passwordConfirm: req.body.password, role: req.body.role, emailVisibility: true });
    res.redirect('/');
});

app.get('/del-user/:id', async (req, res) => {
    await pb.collection('users').delete(req.params.id);
    res.redirect('/');
});

// --- СТАРЫЙ ДИЗАЙН ВХОДА ---
app.get('/login', (req, res) => {
    res.send('<body style="font-family:sans-serif; display:flex; justify-content:center; padding-top:100px;"><form method="POST" style="border:1px solid #ccc; padding:30px; border-radius:10px;"><h2>Вход</h2><input name="email" placeholder="Email"><br><br><input name="password" type="password" placeholder="Пароль"><br><br><button style="width:100%">Войти</button></form></body>');
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.status(400).send('Ошибка входа'); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`Слушаю на http://localhost:${PORT}`));

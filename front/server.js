const express = require('express');
const PocketBase = require('pocketbase/cjs');
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');

const app = express();
const PORT = 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// 1. ВЕБХУК (ПИШЕТ В КОЛОНКУ 'sold')
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = 'whsec_xRRpYTPLJtV67ZZnPwrkw1rnbY2xBDjH'; 
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.log(`❌ Webhook Signature Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const itemId = session.metadata.itemId;
        
        try {
            // ОБНОВЛЯЕМ ИМЕННО ПОЛЕ 'sold'
            await pb.collection('inventory').update(itemId, { sold: 'sold' });
            console.log(`✅ ТОВАР ${itemId} УСПЕШНО ПРОДАН`);
        } catch (e) {
            console.error("❌ Ошибка PocketBase в вебхуке:", e.message);
        }
    }
    res.json({ received: true });
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');
    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
    const isWorker = me.role === 'worker';
    const isUser = me.role === 'user';

    try {
        // Доступные товары (где sold НЕ равен "sold")
        const availableItems = await pb.collection('inventory').getFullList({ 
            filter: 'sold != "sold"', 
            sort: '-created' 
        });

        // Проданные товары (только для админа и воркера)
        const soldItems = (isAdmin || isWorker) ? await pb.collection('inventory').getFullList({ 
            filter: 'sold = "sold"', 
            sort: '-updated' 
        }) : [];

        const allUsers = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f4f7f6; margin: 0; padding: 20px; }
            .card { background: white; padding: 25px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin-bottom: 25px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 15px; border-bottom: 1px solid #eee; text-align: left; }
            .btn { border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-weight: 600; text-decoration: none; transition: 0.2s; display: inline-block; }
            .btn-buy { background: #6366f1; color: white; }
            .price { color: #10b981; font-weight: bold; font-size: 1.1em; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .badge { padding: 4px 8px; border-radius: 6px; font-size: 0.8em; font-weight: bold; }
            .badge-work { background: #dcfce7; color: #166534; }
            .badge-not { background: #fee2e2; color: #991b1b; }
        </style>

        <div style="max-width:1200px; margin:0 auto;">
            <div class="header card">
                <div>
                    <strong style="font-size: 1.2em;">${me.email}</strong> 
                    <span style="color:#6366f1; margin-left:10px;">● ${me.role.toUpperCase()}</span>
                </div>
                <a href="/logout" style="color:#ef4444; font-weight:bold; text-decoration:none;">ВЫЙТИ</a>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Управление пользователями</h3>
                <form method="POST" action="/add-user" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap:10px;">
                    <input name="email" placeholder="Email" required style="padding:10px; border-radius:8px; border:1px solid #ddd;">
                    <input name="password" type="password" placeholder="Пароль" required style="padding:10px; border-radius:8px; border:1px solid #ddd;">
                    <select name="role" style="padding:10px; border-radius:8px; border:1px solid #ddd;">
                        <option value="user">User</option><option value="worker">Worker</option><option value="admin">Admin</option>
                    </select>
                    <button type="submit" class="btn" style="background:#10b981; color:white;">Создать</button>
                </form>
                <table style="margin-top:20px;">
                    ${allUsers.map(u => `<tr><td>${u.email}</td><td><b>${u.role}</b></td><td><a href="/del-user/${u.id}" style="color:#ef4444;">Удалить</a></td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            <div class="card">
                <h3>📦 ${isUser ? 'Доступные товары' : 'Склад (В наличии)'}</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:grid; grid-template-columns: 3fr 1fr 1fr; gap:10px; margin-bottom:20px;">
                    <input name="device" placeholder="Название товара" required style="padding:10px; border-radius:8px; border:1px solid #ddd;">
                    <input name="price" type="number" placeholder="Цена" required style="padding:10px; border-radius:8px; border:1px solid #ddd;">
                    <button type="submit" class="btn" style="background:#1e293b; color:white;">Добавить</button>
                </form>
                ` : ''}
                <table>
                    <thead><tr><th>Название</th><th>Цена</th>${!isUser ? '<th>Состояние</th>' : ''}<th>Действие</th></tr></thead>
                    ${availableItems.map(i => `
                    <tr>
                        <td><b>${i.device}</b></td>
                        <td class="price">${i.price} $</td>
                        ${!isUser ? `<td><span class="badge ${i.work === 'working' ? 'badge-work' : 'badge-not'}">${i.work}</span></td>` : ''}
                        <td>
                            ${isUser ? `
                                <form method="POST" action="/purchase"><input type="hidden" name="id" value="${i.id}"><button class="btn btn-buy">КУПИТЬ</button></form>
                            ` : `
                                <div style="display:flex; gap:10px;">
                                    <form method="POST" action="/toggle-status"><input type="hidden" name="id" value="${i.id}"><input type="hidden" name="current" value="${i.work}"><button class="btn" style="background:#e2e8f0;">Тех. состояние</button></form>
                                    ${isAdmin ? `<a href="/del-item/${i.id}" class="btn" style="background:#fee2e2; color:#ef4444;">Удалить</a>` : ''}
                                </div>
                            `}
                        </td>
                    </tr>`).join('')}
                </table>
            </div>

            ${(isAdmin || isWorker) ? `
            <div class="card" style="border-left: 6px solid #10b981;">
                <h3 style="color:#059669;">✅ ИСТОРИЯ ПРОДАЖ (SOLD)</h3>
                <table>
                    <thead><tr><th>Товар</th><th>Цена</th><th>Дата продажи</th></tr></thead>
                    ${soldItems.map(s => `<tr><td><del>${s.device}</del></td><td>${s.price} $</td><td style="color:gray;">${new Date(s.updated).toLocaleString()}</td></tr>`).join('')}
                </table>
            </div>
            ` : ''}
        </div>`;
        res.send(html);
    } catch (e) { res.send("Ошибка загрузки данных: " + e.message); }
});

// --- РОУТЫ УПРАВЛЕНИЯ ---
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
    // При создании нового товара поле 'sold' пустое по умолчанию
    await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working', sold: '' });
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

app.get('/login', (req, res) => {
    res.send(`
    <style>
        body { margin:0; background: #0f172a; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; }
        .login-card { background: #1e293b; padding: 40px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); width: 350px; text-align: center; color: white; }
        input { width: 100%; padding: 12px; margin: 10px 0; border-radius: 8px; border: none; background: #334155; color: white; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #6366f1; border: none; color: white; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
    </style>
    <div class="login-card">
        <h2>System Login</h2>
        <form method="POST">
            <input name="email" placeholder="Email" required>
            <input name="password" type="password" placeholder="Пароль" required>
            <button>Войти</button>
        </form>
    </div>`);
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.status(400).send('Ошибка входа: неверные данные'); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`SERVER RUNNING ON PORT ${PORT}`));

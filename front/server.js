const express = require('express');
const PocketBase = require('pocketbase/cjs');
// Твои ключи вшиты напрямую
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');

const app = express();
const PORT = process.env.PORT || 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- 1. ВЕБХУК (Должен быть ПЕРВЫМ, обрабатывает сырой JSON от Stripe) ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = 'whsec_xRRpYTPLJtV67ZZnPwrkw1rnbY2xBDjH'; 
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) { 
        console.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`); 
    }

    if (event.type === 'checkout.session.completed') {
        const itemIds = event.data.object.metadata.itemIds.split(',');
        try {
            for (const id of itemIds) {
                await pb.collection('inventory').update(id, { status: 'sold' });
            }
            console.log(`✅ Успешная оплата. Товары ${itemIds} помечены как sold.`);
        } catch (e) { console.error("Ошибка PocketBase в вебхуке:", e.message); }
    }
    res.json({ received: true });
});

// Настройки парсинга для обычных форм и JSON
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
            .container { max-width: 1000px; margin: 0 auto; }
            .card { background: #1e293b; padding: 20px; border-radius: 15px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; border-bottom: 1px solid #334155; text-align: left; }
            .btn { padding: 8px 16px; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; text-decoration: none; display: inline-block; transition: 0.2s; }
            .btn-primary { background: #6366f1; color: white; }
            .btn-danger { background: #f43f5e; color: white; }
            .btn-buy { background: #10b981; color: white; width: 100%; margin-top: 20px; font-size: 1.1em; padding: 15px; }
            .price { color: #10b981; font-weight: bold; }
            input, select { padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; background: #475569; }
        </style>

        <div class="container">
            <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                <div><strong>${me.email}</strong> <span class="badge" style="background:#6366f1;">${me.role}</span></div>
                <a href="/logout" class="btn btn-danger">Выйти</a>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Управление пользователями</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input name="email" type="email" placeholder="Email" required>
                    <input name="password" type="password" placeholder="Пароль" required>
                    <select name="role"><option value="user">User</option><option value="worker">Worker</option><option value="admin">Admin</option></select>
                    <button class="btn btn-primary">Создать</button>
                </form>
                <table>
                    ${allUsers.map(u => `<tr><td>${u.email}</td><td><span class="badge">${u.role}</span></td><td><a href="/del-user/${u.id}" style="color:#f43f5e;">Удалить</a></td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            <div class="card">
                <h3>📦 Склад товаров</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:20px;">
                    <input name="device" placeholder="Название" required style="flex:2;">
                    <input name="price" type="number" placeholder="Цена" required style="flex:1;">
                    <button class="btn btn-primary">Добавить</button>
                </form>` : ''}

                <form method="POST" action="/purchase">
                    <table>
                        <thead>
                            <tr>
                                ${isUser ? '<th>🛒</th>' : ''}
                                <th>Название</th><th>Цена</th>
                                ${!isUser ? '<th>Статус</th><th>Действие</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${availableItems.map(i => `
                            <tr>
                                ${isUser ? `<td><input type="checkbox" name="ids" value="${i.id}"></td>` : ''}
                                <td><b>${i.device}</b></td>
                                <td class="price">$${i.price}</td>
                                ${!isUser ? `
                                    <td><span class="badge">${i.work}</span></td>
                                    <td>
                                        <div style="display:flex; gap:10px;">
                                            <a href="/toggle-status/${i.id}/${i.work}" class="btn" style="background:#475569; color:white; font-size:0.8em;">Статус</a>
                                            ${isAdmin ? `<a href="/del-item/${i.id}" style="color:#f43f5e;">🗑️</a>` : ''}
                                        </div>
                                    </td>
                                ` : ''}
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${isUser && availableItems.length > 0 ? `<button type="submit" class="btn btn-buy">ОПЛАТИТЬ ВЫБРАННОЕ</button>` : ''}
                </form>
            </div>

            ${(isAdmin || isWorker) ? `
            <div class="card">
                <h3 style="color:#10b981;">✅ ИСТОРИЯ ПРОДАЖ</h3>
                <table>
                    ${soldItems.map(s => `<tr><td><del>${s.device}</del></td><td>$${s.price}</td><td style="color:#64748b; font-size:0.8em;">${new Date(s.updated).toLocaleString()}</td></tr>`).join('')}
                </table>
            </div>` : ''}
        </div>`;
        res.send(html);
    } catch (e) { res.send("Ошибка загрузки данных: " + e.message); }
});

// --- 3. ЛОГИКА ОПЛАТЫ (ОБРАБАТЫВАЕТ /purchase) ---
app.post('/purchase', async (req, res) => {
    try {
        let ids = req.body.ids;
        if (!ids) return res.send("<h3>Выберите хотя бы один товар!</h3><a href='/'>Назад</a>");
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
    } catch (e) { res.status(500).send("Stripe Error: " + e.message); }
});

// --- 4. ВСПОМОГАТЕЛЬНЫЕ РОУТЫ (ИНВЕНТАРЬ / ЮЗЕРЫ) ---
app.post('/add-inventory', async (req, res) => {
    await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working', status: 'available' });
    res.redirect('/');
});

app.get('/toggle-status/:id/:current', async (req, res) => {
    const next = req.params.current === 'working' ? 'not working' : 'working';
    await pb.collection('inventory').update(req.params.id, { work: next });
    res.redirect('/');
});

app.get('/del-item/:id', async (req, res) => {
    await pb.collection('inventory').delete(req.params.id);
    res.redirect('/');
});

app.post('/add-user', async (req, res) => {
    try {
        await pb.collection('users').create({ email: req.body.email, password: req.body.password, passwordConfirm: req.body.password, role: req.body.role, emailVisibility: true });
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

app.get('/del-user/:id', async (req, res) => {
    await pb.collection('users').delete(req.params.id);
    res.redirect('/');
});

// --- 5. АВТОРИЗАЦИЯ (LOGIN / REGISTER) ---
app.get('/login', (req, res) => {
    res.send(`<style>body{margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:white;}.card{background:#1e293b;padding:40px;border-radius:20px;width:300px;text-align:center;}input{width:100%;padding:12px;margin:10px 0;border-radius:8px;border:none;background:#334155;color:white;box-sizing:border-box;}button{width:100%;padding:12px;background:#6366f1;border:none;color:white;border-radius:8px;font-weight:bold;cursor:pointer;}a{color:#94a3b8;text-decoration:none;font-size:0.8em;display:block;margin-top:15px;}</style>
    <div class="card"><h2>KURSANDI</h2><form method="POST" action="/login"><input name="email" placeholder="Email" required><input name="password" type="password" placeholder="Пароль" required><button>ВОЙТИ</button></form><a href="/register">Регистрация</a></div>`);
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.send('Ошибка входа. Проверьте данные.'); }
});

app.get('/register', (req, res) => {
    res.send(`<style>body{margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:white;}.card{background:#1e293b;padding:40px;border-radius:20px;width:300px;text-align:center;}input{width:100%;padding:12px;margin:10px 0;border-radius:8px;border:none;background:#334155;color:white;box-sizing:border-box;}button{width:100%;padding:12px;background:#10b981;border:none;color:white;border-radius:8px;font-weight:bold;cursor:pointer;}</style>
    <div class="card"><h2>Регистрация</h2><form method="POST" action="/register"><input name="email" type="email" placeholder="Email" required><input name="password" type="password" placeholder="Пароль (8+ симв.)" required><button>Создать аккаунт</button></form><br><a href="/login" style="color:#94a3b8; text-decoration:none;">Уже есть аккаунт? Войти</a></div>`);
});

app.post('/register', async (req, res) => {
    try {
        await pb.collection('users').create({ email: req.body.email, password: req.body.password, passwordConfirm: req.body.password, role: "user", emailVisibility: true });
        await pb.collection('users').authWithPassword(req.body.email, req.body.password);
        res.redirect('/');
    } catch (e) { res.send("Ошибка регистрации: " + e.message); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SYSTEM ONLINE ON PORT ${PORT}`));

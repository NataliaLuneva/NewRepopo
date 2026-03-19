const express = require('express');
const PocketBase = require('pocketbase/cjs');
// Твой секретный ключ Stripe
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');

const app = express();
const PORT = process.env.PORT || 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- ВЕБХУК (Должен быть ПЕРВЫМ до body-parser) ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    // Твой секрет вебхука
    const endpointSecret = 'whsec_xRRpYTPLJtV67ZZnPwrkw1rnbY2xBDjH'; 
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) { 
        console.error(`❌ Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`); 
    }

    if (event.type === 'checkout.session.completed') {
        const itemIds = event.data.object.metadata.itemIds.split(',');
        try {
            for (const id of itemIds) {
                await pb.collection('inventory').update(id, { status: 'sold' });
            }
            console.log(`✅ Товары [${itemIds}] успешно проданы!`);
        } catch (e) { 
            console.error("Ошибка обновления PocketBase:", e.message); 
        }
    }
    res.json({ received: true });
});

// Обычные миддлвары для остальных роутов
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
        const availableItems = await pb.collection('inventory').getFullList({ filter: 'status != "sold"', sort: '-created' });
        const soldItems = (isAdmin || isWorker) ? await pb.collection('inventory').getFullList({ filter: 'status = "sold"', sort: '-updated' }) : [];

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #0f172a; margin: 0; padding: 20px; color: white; }
            .card { background: #1e293b; padding: 25px; border-radius: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); margin-bottom: 25px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; border-bottom: 1px solid #334155; text-align: left; }
            .btn { border: none; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-weight: 600; text-decoration: none; transition: 0.2s; display: inline-block; }
            .btn-buy { background: #6366f1; color: white; width: 100%; margin-top: 15px; font-size: 1.1em; }
            .btn-buy:hover { background: #4f46e5; }
            .price { color: #10b981; font-weight: bold; }
            input[type="checkbox"] { width: 20px; height: 20px; cursor: pointer; accent-color: #6366f1; }
            a { color: #94a3b8; text-decoration: none; }
        </style>

        <div style="max-width:900px; margin:0 auto;">
            <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                <div><strong>${me.email}</strong> <span style="color:#6366f1;">● ${me.role}</span></div>
                <a href="/logout" style="color:#fb7185; font-weight:bold;">ВЫЙТИ</a>
            </div>

            <div class="card">
                <h3>📦 Доступные товары</h3>
                <form method="POST" action="/purchase">
                    <table>
                        <thead>
                            <tr>
                                ${isUser ? '<th>🛒</th>' : ''}
                                <th>Название</th>
                                <th>Цена</th>
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
                                    <td><span style="font-size:0.8em; background:#334155; padding:4px 8px; border-radius:4px;">${i.work}</span></td>
                                    <td>
                                        <div style="display:flex; gap:10px; align-items:center;">
                                            <form method="POST" action="/toggle-status" style="margin:0;">
                                                <input type="hidden" name="id" value="${i.id}">
                                                <input type="hidden" name="current" value="${i.work}">
                                                <button class="btn" style="background:#475569; color:white; padding:5px 10px;">⚙️</button>
                                            </form>
                                            ${isAdmin ? `<a href="/del-item/${i.id}" style="color:#fb7185;">🗑️</a>` : ''}
                                        </div>
                                    </td>
                                ` : ''}
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${isUser && availableItems.length > 0 ? `<button type="submit" class="btn btn-buy">КУПИТЬ ВЫБРАННОЕ</button>` : ''}
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
    } catch (e) { res.send("Ошибка загрузки: " + e.message); }
});

// --- ОПЛАТА ВЫБРАННЫХ ТОВАРОВ ---
app.post('/purchase', async (req, res) => {
    try {
        let ids = req.body.ids;
        if (!ids) return res.send("<h3>Ошибка: Выберите хотя бы один товар!</h3><a href='/'>Назад</a>");
        if (!Array.isArray(ids)) ids = [ids];

        const itemsToBuy = [];
        for (const id of ids) {
            const item = await pb.collection('inventory').getOne(id);
            if (item.status !== 'sold') itemsToBuy.push(item);
        }

        if (itemsToBuy.length === 0) return res.send("Все товары уже раскупили!");

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: itemsToBuy.map(item => ({
                price_data: {
                    currency: 'usd',
                    product_data: { name: item.device },
                    unit_amount: Math.round(item.price * 100),
                },
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

// --- АДМИН-ФУНКЦИИ ---
app.post('/toggle-status', async (req, res) => {
    const next = req.body.current === 'working' ? 'not working' : 'working';
    await pb.collection('inventory').update(req.body.id, { work: next });
    res.redirect('/');
});

app.get('/del-item/:id', async (req, res) => {
    await pb.collection('inventory').delete(req.params.id);
    res.redirect('/');
});

// --- АВТОРИЗАЦИЯ ---
app.get('/login', (req, res) => {
    res.send(`<style>body{margin:0;background:#0f172a;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;color:white;}.card{background:#1e293b;padding:40px;border-radius:20px;width:300px;text-align:center;}input{width:100%;padding:12px;margin:10px 0;border-radius:8px;border:none;background:#334155;color:white;box-sizing:border-box;}button{width:100%;padding:12px;background:#6366f1;border:none;color:white;border-radius:8px;font-weight:bold;cursor:pointer;}</style>
    <div class="card"><h2>KURSANDI</h2><form method="POST"><input name="email" placeholder="Email" required><input name="password" type="password" placeholder="Password" required><button>ВОЙТИ</button></form></div>`);
});

app.post('/login', async (req, res) => {
    try { 
        await pb.collection('users').authWithPassword(req.body.email, req.body.password); 
        res.redirect('/'); 
    } catch(e) { res.send('Ошибка входа. Проверьте данные.'); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SYSTEM ONLINE ON PORT ${PORT}`));

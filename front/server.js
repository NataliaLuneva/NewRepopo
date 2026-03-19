const express = require('express');
const PocketBase = require('pocketbase/cjs');
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');

const app = express();
const PORT = process.env.PORT || 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- 1. ВЕБХУК STRIPE ---
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = 'whsec_xRRpYTPLJtV67ZZnPwrkw1rnbY2xBDjH'; 
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }

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
        const allUsers = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: white; margin: 0; padding: 20px; }
            .container { max-width: 1100px; margin: 0 auto; }
            .card { background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 12px; border-bottom: 1px solid #334155; text-align: left; }
            .btn { padding: 8px 15px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; text-decoration: none; color: white; display: inline-block; transition: 0.2s; }
            .btn:hover { opacity: 0.8; }
            .btn-primary { background: #6366f1; }
            .btn-danger { background: #f43f5e; }
            .btn-success { background: #10b981; }
            .price { color: #10b981; font-weight: bold; }
            input, select { padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; outline: none; }
            #searchInput { width: 100%; margin-bottom: 20px; font-size: 1.1em; border: 2px solid #6366f1; box-sizing: border-box; }
            #editModal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.85); justify-content: center; align-items: center; z-index: 100; }
            .modal-content { background: #1e293b; padding: 30px; border-radius: 15px; width: 400px; border: 1px solid #334155; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; background: #475569; text-transform: uppercase; }
        </style>

        <div class="container">
            <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                <div><strong>${me.email}</strong> <span class="badge" style="background:#6366f1;">${me.role}</span></div>
                <a href="/logout" class="btn btn-danger">ВЫЙТИ</a>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Пользователи системы</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input name="email" type="email" placeholder="Email" required style="flex:2;">
                    <input name="password" type="password" placeholder="Пароль" required style="flex:2;">
                    <select name="role" style="flex:1;"><option value="user">User</option><option value="worker">Worker</option><option value="admin">Admin</option></select>
                    <button class="btn btn-primary">Создать</button>
                </form>
                <table>
                    ${allUsers.map(u => `<tr><td>${u.email}</td><td><span class="badge">${u.role}</span></td><td style="text-align:right;"><a href="/del-user/${u.id}" style="color:#f43f5e; text-decoration:none;">❌ Удалить</a></td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            <div class="card">
                <h3>📦 Склад товаров</h3>
                <input type="text" id="searchInput" onkeyup="filterTable()" placeholder="🔍 Быстрый поиск по названию...">

                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:20px; border-bottom: 1px solid #334155; padding-bottom: 20px;">
                    <input name="device" placeholder="Название устройства" required style="flex:3;">
                    <input name="price" type="number" step="0.01" placeholder="Цена ($)" required style="flex:1;">
                    <button class="btn btn-success">+ Добавить на склад</button>
                </form>` : ''}

                <form method="POST" action="/purchase">
                    <table id="inventoryTable">
                        <thead>
                            <tr>
                                ${isUser ? '<th style="width:40px;">🛒</th>' : ''}
                                <th>Название</th>
                                <th>Цена</th>
                                ${!isUser ? '<th>Работоспособность</th><th>Действия</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${availableItems.map(i => `
                            <tr class="item-row">
                                ${isUser ? `<td><input type="checkbox" name="ids" value="${i.id}"></td>` : ''}
                                <td class="device-name"><b>${i.device}</b></td>
                                <td class="price">$${i.price}</td>
                                ${!isUser ? `
                                    <td><span class="badge" style="background:${i.work === 'working' ? '#065f46' : '#991b1b'}">${i.work}</span></td>
                                    <td>
                                        <div style="display:flex; gap:15px; align-items:center;">
                                            <a href="/toggle-status/${i.id}/${i.work}" class="btn" style="background:#475569; font-size:0.75em;">Переключить</a>
                                            ${isAdmin ? `
                                                <button type="button" onclick="openEditModal('${i.id}', '${i.device}', '${i.price}', '${i.work}')" style="background:none; border:none; cursor:pointer; font-size:1.2em;">✏️</button>
                                                <a href="/del-item/${i.id}" onclick="return confirm('Удалить?')" style="text-decoration:none; font-size:1.2em;">🗑️</a>
                                            ` : ''}
                                        </div>
                                    </td>
                                ` : ''}
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${isUser && availableItems.length > 0 ? `<button type="submit" class="btn btn-success" style="width:100%; margin-top:20px; padding:15px; font-size:1.1em;">КУПИТЬ ВЫБРАННЫЕ ТОВАРЫ</button>` : ''}
                </form>
            </div>
        </div>

        <div id="editModal">
            <div class="modal-content">
                <h3 style="margin-top:0;">Редактировать товар</h3>
                <form id="editForm" method="POST">
                    <label style="font-size:0.8em; color:#94a3b8;">Название:</label><br>
                    <input name="device" id="editDevice" style="width:100%; margin:5px 0 15px 0;" required><br>
                    <label style="font-size:0.8em; color:#94a3b8;">Цена ($):</label><br>
                    <input name="price" type="number" step="0.01" id="editPrice" style="width:100%; margin:5px 0 15px 0;" required><br>
                    <label style="font-size:0.8em; color:#94a3b8;">Статус:</label><br>
                    <select name="work" id="editWork" style="width:100%; margin:5px 0 20px 0;">
                        <option value="working">Working</option>
                        <option value="not working">Not working</option>
                    </select>
                    <div style="display:flex; gap:10px;">
                        <button type="submit" class="btn btn-primary" style="flex:1;">Сохранить</button>
                        <button type="button" onclick="closeModal()" class="btn btn-danger" style="flex:1;">Отмена</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            function filterTable() {
                let input = document.getElementById("searchInput").value.toUpperCase();
                document.querySelectorAll(".item-row").forEach(row => {
                    let name = row.querySelector(".device-name").innerText;
                    row.style.display = name.toUpperCase().includes(input) ? "" : "none";
                });
            }
            function openEditModal(id, device, price, work) {
                document.getElementById('editForm').action = '/edit-inventory/' + id;
                document.getElementById('editDevice').value = device;
                document.getElementById('editPrice').value = price;
                document.getElementById('editWork').value = work;
                document.getElementById('editModal').style.display = 'flex';
            }
            function closeModal() { document.getElementById('editModal').style.display = 'none'; }
        </script>
        `;
        res.send(html);
    } catch (e) { res.send("Ошибка загрузки данных: " + e.message); }
});

// --- 3. РОУТЫ ДЕЙСТВИЙ ---

// Добавление товара
app.post('/add-inventory', async (req, res) => {
    try {
        const { device, price } = req.body;

        // Шлем только те поля, которые реально нужны
        const data = {
            "device": device,
            "price": Number(price) || 0,
            "work": "working" // Берем значение из твоего списка в PB
        };

        console.log("Отправка в БД (без статуса):", data);

        await pb.collection('inventory').create(data);
        res.redirect('/');
    } catch (e) {
        console.error("ОШИБКА ДОБАВЛЕНИЯ:", e.data); // Самый важный лог
        res.status(500).send(`Ошибка базы: ${e.message}. Проверь логи сервера.`);
    }
});

// Редактирование товара
app.post('/edit-inventory/:id', async (req, res) => {
    try {
        await pb.collection('inventory').update(req.params.id, {
            device: req.body.device,
            price: Number(req.body.price),
            work: req.body.work
        });
        res.redirect('/');
    } catch (e) { res.status(500).send("Ошибка обновления: " + e.message); }
});

// Удаление товара
app.get('/del-item/:id', async (req, res) => {
    try {
        await pb.collection('inventory').delete(req.params.id);
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

// Переключение рабочего состояния (working/not working)
app.get('/toggle-status/:id/:current', async (req, res) => {
    try {
        const next = req.params.current === 'working' ? 'not working' : 'working';
        await pb.collection('inventory').update(req.params.id, { work: next });
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

// --- 4. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ---
app.post('/add-user', async (req, res) => {
    try {
        await pb.collection('users').create({
            email: req.body.email,
            password: req.body.password,
            passwordConfirm: req.body.password,
            role: req.body.role,
            emailVisibility: true
        });
        res.redirect('/');
    } catch (e) { res.send("Ошибка создания юзера: " + e.message); }
});

app.get('/del-user/:id', async (req, res) => {
    try {
        await pb.collection('users').delete(req.params.id);
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

// --- 5. ОПЛАТА STRIPE ---
app.post('/purchase', async (req, res) => {
    try {
        let ids = req.body.ids;
        if (!ids) return res.send("Выберите хотя бы один товар!");
        if (!Array.isArray(ids)) ids = [ids];

        const items = [];
        for (const id of ids) {
            const item = await pb.collection('inventory').getOne(id);
            if (item.status !== 'sold') items.push(item);
        }

        if (items.length === 0) return res.send("Выбранные товары уже проданы!");

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: items.map(i => ({
                price_data: { 
                    currency: 'usd', 
                    product_data: { name: i.device }, 
                    unit_amount: Math.round(i.price * 100) 
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

// --- 6. АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ ---
app.get('/login', (req, res) => {
    res.send(`<body style="background:#0f172a; color:white; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; margin:0;">
    <form method="POST" style="background:#1e293b; padding:40px; border-radius:15px; width:320px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="text-align:center; margin-bottom:25px; color:#6366f1;">ВХОД В СИСТЕМУ</h2>
        <input name="email" placeholder="Email" required style="width:100%; padding:12px; margin:10px 0; border-radius:8px; border:none; box-sizing:border-box; background:#0f172a; color:white;">
        <input name="password" type="password" placeholder="Пароль" required style="width:100%; padding:12px; margin:10px 0; border-radius:8px; border:none; box-sizing:border-box; background:#0f172a; color:white;">
        <button style="width:100%; padding:12px; background:#6366f1; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; margin-top:10px;">ВОЙТИ</button>
        <div style="text-align:center; margin-top:20px;">
            <a href="/register" style="color:#94a3b8; text-decoration:none; font-size:0.9em;">Нет аккаунта? Регистрация</a>
        </div>
    </form></body>`);
});

app.post('/login', async (req, res) => {
    try { 
        await pb.collection('users').authWithPassword(req.body.email, req.body.password); 
        res.redirect('/'); 
    } catch (e) { res.send('<script>alert("Неверный логин или пароль"); window.location="/login";</script>'); }
});

app.get('/register', (req, res) => {
    res.send(`<body style="background:#0f172a; color:white; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif; margin:0;">
    <form method="POST" style="background:#1e293b; padding:40px; border-radius:15px; width:320px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
        <h2 style="text-align:center; margin-bottom:25px; color:#10b981;">РЕГИСТРАЦИЯ</h2>
        <input name="email" type="email" placeholder="Ваш Email" required style="width:100%; padding:12px; margin:10px 0; border-radius:8px; border:none; box-sizing:border-box; background:#0f172a; color:white;">
        <input name="password" type="password" placeholder="Придумайте пароль" required style="width:100%; padding:12px; margin:10px 0; border-radius:8px; border:none; box-sizing:border-box; background:#0f172a; color:white;">
        <button style="width:100%; padding:12px; background:#10b981; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold; margin-top:10px;">СОЗДАТЬ АККАУНТ</button>
        <div style="text-align:center; margin-top:20px;">
            <a href="/login" style="color:#94a3b8; text-decoration:none; font-size:0.9em;">Уже есть аккаунт? Войти</a>
        </div>
    </form></body>`);
});

app.post('/register', async (req, res) => {
    try {
        await pb.collection('users').create({ 
            email: req.body.email, 
            password: req.body.password, 
            passwordConfirm: req.body.password, 
            role: "user", 
            emailVisibility: true 
        });
        await pb.collection('users').authWithPassword(req.body.email, req.body.password);
        res.redirect('/');
    } catch (e) { res.send("Ошибка регистрации: " + e.message); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

// ЗАПУСК
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ====================================
    🚀 SYSTEM UP AND RUNNING
    🔗 URL: http://localhost:${PORT}
    ====================================
    `);
});

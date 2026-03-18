const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// Функция аватарок (по почте)
function getAvatarUrl(user) {
    if (!user || !user.avatar) return `https://via.placeholder.com/100?text=${user?.email?.split('@')[0] || 'User'}`;
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
        // Загружаем только НЕ проданные товары
        const inventory = await pb.collection('inventory').getFullList({
            filter: 'work != "sold"',
            sort: '-created'
        });

        // Загружаем юзеров только для админа
        const users = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: sans-serif; background: #f0f2f5; padding: 20px; }
            .container { max-width: 1000px; margin: 0 auto; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .avatar { width: 45px; height: 45px; border-radius: 50%; border: 2px solid #007bff; vertical-align: middle; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
            .price { font-weight: bold; color: #2ecc71; font-size: 1.1em; }
            .status-tag { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
            .status-working { background: #e3fcef; color: #00875a; }
            .status-not-working { background: #ffebe6; color: #de350b; }
            .btn-buy { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: bold; }
            .btn-buy:hover { background: #0056b3; }
        </style>

        <div class="container">
            <div class="header">
                <div>
                    <img src="${getAvatarUrl(me)}" class="avatar">
                    <strong style="margin-left:10px;">${me.email}</strong> 
                    <span style="color:gray;">[${me.role.toUpperCase()}]</span>
                </div>
                <a href="/logout" style="color:red; text-decoration:none; font-weight:bold;">Выйти</a>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Управление воркерами и юзерами</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input type="email" name="email" placeholder="Email" required style="flex:1; padding:8px;">
                    <input type="password" name="password" placeholder="Пароль" required style="padding:8px;">
                    <select name="role" style="padding:8px;">
                        <option value="user">User (Покупатель)</option>
                        <option value="worker">Worker (Сотрудник)</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit" style="background:#28a745; color:white; border:none; border-radius:4px; padding:0 15px;">Создать</button>
                </form>
                <table>
                    ${users.map(u => `<tr><td>${u.email}</td><td><b>${u.role}</b></td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            <div class="card">
                <h3>📦 Склад / Магазин</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:20px;">
                    <input type="text" name="device" placeholder="Товар" required style="flex:2; padding:8px;">
                    <input type="number" name="price" placeholder="Цена" required style="flex:1; padding:8px;">
                    <button type="submit" style="background:#007bff; color:white; border:none; border-radius:4px; padding:0 20px;">Добавить товар</button>
                </form>
                ` : ''}

                <table>
                    <thead>
                        <tr>
                            <th>Товар</th>
                            <th>Цена</th>
                            ${!isUser ? '<th>Состояние</th>' : ''} <th>Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inventory.map(i => `
                        <tr>
                            <td><b>${i.device}</b></td>
                            <td><span class="price">${i.price} $</span></td>
                            
                            ${!isUser ? `
                                <td>
                                    <span class="status-tag ${i.work === 'working' ? 'status-working' : 'status-not-working'}">
                                        ${i.work}
                                    </span>
                                </td>
                            ` : ''}

                            <td>
                                ${isUser ? `
                                    <form method="POST" action="/purchase">
                                        <input type="hidden" name="id" value="${i.id}">
                                        <button type="submit" class="btn-buy">КУПИТЬ</button>
                                    </form>
                                ` : `
                                    <form method="POST" action="/toggle-status">
                                        <input type="hidden" name="id" value="${i.id}">
                                        <input type="hidden" name="current" value="${i.work}">
                                        <button type="submit" style="font-size:11px;">Изм. статус</button>
                                    </form>
                                `}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `;
        res.send(html);
    } catch (e) { res.status(500).send("Ошибка: " + e.message); }
});

// --- ОБРАБОТЧИКИ ---

// Покупка (Только для User)
app.post('/purchase', async (req, res) => {
    try {
        await pb.collection('inventory').update(req.body.id, { work: 'sold' });
        res.redirect('/');
    } catch (e) { res.send("Ошибка покупки"); }
});

// Переключение рабочего состояния (Для Admin и Worker)
app.post('/toggle-status', async (req, res) => {
    try {
        const next = req.body.current === 'working' ? 'not working' : 'working';
        await pb.collection('inventory').update(req.body.id, { work: next });
        res.redirect('/');
    } catch (e) { res.send("Ошибка статуса"); }
});

// Добавление товара (Admin)
app.post('/add-inventory', async (req, res) => {
    try {
        await pb.collection('inventory').create({ 
            device: req.body.device, 
            price: req.body.price, 
            work: 'working' 
        });
        res.redirect('/');
    } catch (e) { res.send("Ошибка"); }
});

// Добавление юзера (Admin)
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
    } catch (e) { res.send("Ошибка создания"); }
});

// Логин / Логаут
app.get('/login', (req, res) => {
    res.send('<body style="font-family:sans-serif; display:flex; justify-content:center; padding:50px;"><form method="POST" style="border:1px solid #ccc; padding:20px; border-radius:8px;"><h2>Вход</h2><input name="email" placeholder="Email" required><br><br><input name="password" type="password" placeholder="Пароль" required><br><br><button type="submit" style="width:100%;">Войти</button></form></body>');
});
app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.status(400).send('Ошибка входа'); }
});
app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`Запущено: http://localhost:${PORT}`));

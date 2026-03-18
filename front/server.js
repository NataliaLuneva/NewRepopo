const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

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
        // 1. ТОВАРЫ В ПРОДАЖЕ (working / not working)
        const availableItems = await pb.collection('inventory').getFullList({
            filter: 'work != "sold"',
            sort: '-created'
        });

        // 2. ПРОДАННЫЕ ТОВАРЫ (Видят ТОЛЬКО Админ и Воркер)
        let soldItems = [];
        if (isAdmin || isWorker) {
            soldItems = await pb.collection('inventory').getFullList({
                filter: 'work = "sold"',
                sort: '-updated'
            });
        }

        // Список юзеров для админа
        const users = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: sans-serif; background: #f0f2f5; margin: 0; padding: 20px; color: #333; }
            .container { max-width: 1100px; margin: 0 auto; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); margin-bottom: 25px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: #2f3542; color: white; padding: 15px 25px; border-radius: 12px; }
            .avatar { width: 40px; height: 40px; border-radius: 50%; border: 2px solid #fff; vertical-align: middle; margin-right: 10px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
            .price { font-weight: bold; color: #2ecc71; font-size: 1.2em; }
            .status-badge { padding: 4px 10px; border-radius: 5px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
            .working { background: #e3fcef; color: #00875a; }
            .not-working { background: #ffebe6; color: #de350b; }
            .sold { background: #2f3542; color: white; }
            .btn-buy { background: #ff4757; color: white; border: none; padding: 10px 25px; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 16px; }
            .btn-buy:hover { background: #ff6b81; transform: scale(1.05); }
            .history-card { border-left: 5px solid #ff4757; }
        </style>

        <div class="container">
            <div class="header">
                <div>
                    <img src="${getAvatarUrl(me)}" class="avatar">
                    <strong>${me.email}</strong> <span style="opacity: 0.7;">(${me.role})</span>
                </div>
                <a href="/logout" style="color: #fffa65; text-decoration: none; font-weight: bold;">ВЫХОД</a>
            </div>

            <div class="card">
                <h3 style="margin-top:0;">📦 ${isUser ? 'Доступные товары' : 'Склад (В наличии)'}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>Товар</th>
                            <th>Цена</th>
                            ${!isUser ? '<th>Состояние</th>' : ''}
                            <th>Действие</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${availableItems.length === 0 ? '<tr><td colspan="4">Пусто</td></tr>' : ''}
                        ${availableItems.map(i => `
                        <tr>
                            <td style="font-size: 1.1em;"><b>${i.device}</b></td>
                            <td class="price">${i.price} $</td>
                            ${!isUser ? `
                                <td><span class="status-badge ${i.work === 'working' ? 'working' : 'not-working'}">${i.work}</span></td>
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
                                        <button type="submit" style="cursor:pointer; padding:5px 10px;">Изм. состояние</button>
                                    </form>
                                `}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            ${(isAdmin || isWorker) ? `
            <div class="card history-card">
                <h3 style="color:#ff4757;">🔴 ПРОДАНО (История)</h3>
                <table>
                    <thead>
                        <tr style="background:#f8f9fa;">
                            <th>Товар</th>
                            <th>Цена</th>
                            <th>Статус</th>
                            <th>Время сделки</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${soldItems.length === 0 ? '<tr><td colspan="4">Продаж еще не было</td></tr>' : ''}
                        ${soldItems.map(s => `
                        <tr>
                            <td><del>${s.device}</del></td>
                            <td class="price">${s.price} $</td>
                            <td><span class="status-badge sold">SOLD</span></td>
                            <td style="color:gray; font-size:12px;">${new Date(s.updated).toLocaleString()}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            ${isAdmin ? `
            <div class="card" style="border-top: 4px solid #007bff;">
                <h3>⚙️ Управление системой (Admin Only)</h3>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <div>
                        <h4>+ Добавить товар</h4>
                        <form method="POST" action="/add-inventory">
                            <input name="device" placeholder="Название" required style="width:100%; padding:8px; margin-bottom:10px;">
                            <input name="price" type="number" placeholder="Цена" required style="width:100%; padding:8px; margin-bottom:10px;">
                            <button type="submit" style="width:100%; background:#007bff; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer;">Добавить на склад</button>
                        </form>
                    </div>
                    <div>
                        <h4>+ Создать пользователя</h4>
                        <form method="POST" action="/add-user">
                            <input name="email" placeholder="Email" required style="width:100%; padding:8px; margin-bottom:10px;">
                            <input name="password" type="password" placeholder="Пароль" required style="width:100%; padding:8px; margin-bottom:10px;">
                            <select name="role" style="width:100%; padding:8px; margin-bottom:10px;">
                                <option value="user">User (Покупатель)</option>
                                <option value="worker">Worker (Сотрудник)</option>
                                <option value="admin">Admin</option>
                            </select>
                            <button type="submit" style="width:100%; background:#2ecc71; color:white; border:none; padding:10px; border-radius:5px; cursor:pointer;">Создать аккаунт</button>
                        </form>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
        `;
        res.send(html);
    } catch (e) { res.status(500).send("Ошибка: " + e.message); }
});

// --- ОБРАБОТЧИКИ (POST) ---

app.post('/purchase', async (req, res) => {
    try {
        await pb.collection('inventory').update(req.body.id, { work: 'sold' });
        res.redirect('/');
    } catch (e) { res.send("Ошибка при покупке"); }
});

app.post('/toggle-status', async (req, res) => {
    try {
        const next = req.body.current === 'working' ? 'not working' : 'working';
        await pb.collection('inventory').update(req.body.id, { work: next });
        res.redirect('/');
    } catch (e) { res.send("Ошибка изменения"); }
});

app.post('/add-inventory', async (req, res) => {
    try {
        await pb.collection('inventory').create({ device: req.body.device, price: req.body.price, work: 'working' });
        res.redirect('/');
    } catch (e) { res.send("Ошибка"); }
});

app.post('/add-user', async (req, res) => {
    try {
        await pb.collection('users').create({
            email: req.body.email, password: req.body.password, passwordConfirm: req.body.password,
            role: req.body.role, emailVisibility: true
        });
        res.redirect('/');
    } catch (e) { res.send("Ошибка создания юзера: " + e.message); }
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); }
    catch (e) { res.status(400).send('Неверные данные'); }
});

app.get('/login', (req, res) => {
    res.send('<body style="font-family:sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; background:#f0f2f5;"><form method="POST" style="background:#fff; padding:40px; border-radius:12px; box-shadow:0 5px 15px rgba(0,0,0,0.1); width:300px;"><h2 style="margin-top:0;">Вход</h2><input name="email" placeholder="Email" style="width:100%; padding:10px; margin-bottom:10px;" required><input name="password" type="password" placeholder="Пароль" style="width:100%; padding:10px; margin-bottom:20px;" required><button style="width:100%; padding:10px; background:#007bff; color:#fff; border:none; border-radius:6px; cursor:pointer;">Войти</button></form></body>');
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`СИСТЕМА ГОТОВА: http://localhost:${PORT}`));

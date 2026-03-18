const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// Помощник для получения ссылки на аватар
function getAvatarUrl(user) {
    if (!user || !user.avatar) return 'https://via.placeholder.com/80?text=No+Avatar';
    return `${PB_URL}api/files/_pb_users_auth_/${user.id}/${user.avatar}`;
}

// --- СТРАНИЦА ВХОДА ---
app.get('/login', (req, res) => {
    res.send(`
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; margin: 0; }
            .login-card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 320px; }
            input, select, button { width: 100%; padding: 10px; margin-top: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
            button { background: #007bff; color: white; border: none; cursor: pointer; font-weight: bold; }
        </style>
        <div class="login-card">
            <h2 style="text-align:center">Система Учета</h2>
            <form method="POST" action="/login">
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Пароль" required>
                <button type="submit">Войти</button>
            </form>
        </div>
    `);
});

app.post('/login', async (req, res) => {
    try {
        await pb.collection('users').authWithPassword(req.body.email, req.body.password);
        res.redirect('/');
    } catch (e) {
        res.status(400).send('Ошибка входа: ' + e.message + ' <a href="/login">Назад</a>');
    }
});

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';

    try {
        const inventory = await pb.collection('inventory').getFullList({ sort: '-created' });
        const users = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f8f9fa; padding: 20px; }
            .container { max-width: 1000px; margin: 0 auto; }
            .section { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 25px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .avatar-img { width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid #007bff; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
            .status-working { color: #28a745; font-weight: bold; }
            .status-not-working { color: #dc3545; font-weight: bold; }
            .admin-badge { background: #ffc107; padding: 2px 8px; border-radius: 5px; font-size: 12px; }
            .form-inline { display: flex; gap: 10px; margin-bottom: 15px; }
            input, select, .btn { padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
            .btn-blue { background: #007bff; color: white; border: none; cursor: pointer; }
        </style>

        <div class="container">
            <div class="header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${getAvatarUrl(me)}" class="avatar-img">
                    <div>
                        <strong>${me.name || me.email}</strong><br>
                        <span class="admin-badge">${me.role}</span>
                    </div>
                </div>
                <a href="/logout" style="color:#dc3545; text-decoration:none; font-weight:bold;">Выйти</a>
            </div>

            ${isAdmin ? `
            <div class="section">
                <h3>👥 Управление персоналом</h3>
                <form method="POST" action="/add-user" class="form-inline">
                    <input type="email" name="email" placeholder="Новый Email" required>
                    <input type="password" name="password" placeholder="Пароль" required>
                    <select name="role"><option value="user">User</option><option value="admin">Admin</option></select>
                    <button type="submit" class="btn-blue">Создать юзера</button>
                </form>
                <table>
                    <thead><tr><th>Аватар</th><th>Email</th><th>Роль</th></tr></thead>
                    <tbody>
                        ${users.map(u => `
                        <tr>
                            <td><img src="${getAvatarUrl(u)}" style="width:30px; height:30px; border-radius:50%;"></td>
                            <td>${u.email}</td>
                            <td>
                                <form method="POST" action="/change-role" style="margin:0;">
                                    <input type="hidden" name="userId" value="${u.id}">
                                    <select name="newRole" onchange="this.form.submit()">
                                        <option value="user" ${u.role === 'worker' ? 'selected' : ''}>Worker</option>
                                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    </select>
                                </form>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <div class="section">
                <h3>📦 Инвентарь (Товары)</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" class="form-inline">
                    <input type="text" name="device" placeholder="Название товара" required style="flex-grow:1">
                    <select name="work">
                        <option value="working">working</option>
                        <option value="not working">not working</option>
                    </select>
                    <button type="submit" class="btn-blue">Добавить товар</button>
                </form>
                ` : ''}
                <table>
                    <thead><tr><th>Название</th><th>Статус</th><th>Действие</th></tr></thead>
                    <tbody>
                        ${inventory.map(i => `
                        <tr>
                            <td><b>${i.device}</b></td>
                            <td class="${i.work === 'working' ? 'status-working' : 'status-not-working'}">${i.work}</td>
                            <td>
                                <form method="POST" action="/toggle-inventory" style="margin:0;">
                                    <input type="hidden" name="id" value="${i.id}">
                                    <input type="hidden" name="current" value="${i.work}">
                                    <button type="submit" class="btn">Изменить статус</button>
                                </form>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `;
        res.send(html);
    } catch (e) {
        res.status(500).send("Ошибка загрузки: " + e.message);
    }
});

// --- ОБРАБОТЧИКИ (POST) ---

// Добавить юзера
app.post('/add-user', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Отказ");
    try {
        await pb.collection('users').create({
            email: req.body.email,
            password: req.body.password,
            passwordConfirm: req.body.password,
            role: req.body.role,
            emailVisibility: true
        });
        res.redirect('/');
    } catch (e) { res.send("Ошибка: " + e.message); }
});

// Смена роли
app.post('/change-role', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Отказ");
    try {
        await pb.collection('users').update(req.body.userId, { role: req.body.newRole });
        res.redirect('/');
    } catch (e) { res.send("Ошибка"); }
});

// Добавить товар
app.post('/add-inventory', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Отказ");
    try {
        await pb.collection('inventory').create({ device: req.body.device, work: req.body.work });
        res.redirect('/');
    } catch (e) { res.send("Ошибка"); }
});

// Переключить статус товара
app.post('/toggle-inventory', async (req, res) => {
    try {
        const next = req.body.current === 'working' ? 'not working' : 'working';
        await pb.collection('inventory').update(req.body.id, { work: next });
        res.redirect('/');
    } catch (e) { res.send("Ошибка"); }
});

app.get('/logout', (req, res) => {
    pb.authStore.clear();
    res.redirect('/login');
});

app.listen(PORT, '0.0.0.0', () => console.log(`Слушаю на http://localhost:${PORT}`));

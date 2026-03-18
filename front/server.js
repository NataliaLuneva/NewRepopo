const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// Ссылка на аватар
function getAvatarUrl(user) {
    if (!user || !user.avatar) return 'https://via.placeholder.com/100?text=User';
    return `${PB_URL}api/files/_pb_users_auth_/${user.id}/${user.avatar}`;
}

// --- ЛОГИН ---
app.get('/login', (req, res) => {
    res.send(`
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #eef2f3; margin: 0; }
            .card { background: white; padding: 40px; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 350px; }
            input, button { width: 100%; padding: 12px; margin-top: 15px; border-radius: 8px; border: 1px solid #ddd; box-sizing: border-box; }
            button { background: #4a90e2; color: white; border: none; font-weight: bold; cursor: pointer; }
        </style>
        <div class="card">
            <h2 style="text-align:center">Inventory System</h2>
            <form method="POST" action="/login">
                <input type="email" name="email" placeholder="Email" required>
                <input type="password" name="password" placeholder="Password" required>
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
        res.status(400).send('Ошибка входа. Проверьте данные. <a href="/login">Назад</a>');
    }
});

// --- ГЛАВНАЯ ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';

    try {
        const inventory = await pb.collection('inventory').getFullList({ sort: '-created' });
        // Админ видит всех, воркер только себя (согласно правилам PocketBase)
        const users = await pb.collection('users').getFullList({ sort: '-created' });

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f9fbff; padding: 20px; }
            .container { max-width: 1100px; margin: 0 auto; }
            .box { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.02); margin-bottom: 25px; border: 1px solid #edf2f7; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
            .avatar { width: 50px; height: 50px; border-radius: 50%; border: 2px solid #4a90e2; object-fit: cover; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 15px; text-align: left; border-bottom: 1px solid #f1f5f9; }
            .status { font-weight: bold; text-transform: uppercase; font-size: 12px; }
            .working { color: #38a169; }
            .not-working { color: #e53e3e; }
            .badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; color: white; }
            .badge-admin { background: #805ad5; }
            .badge-worker { background: #3182ce; }
            .btn { padding: 8px 15px; border-radius: 6px; border: 1px solid #cbd5e0; background: white; cursor: pointer; }
            .btn-primary { background: #4a90e2; color: white; border: none; }
        </style>

        <div class="container">
            <div class="header">
                <div style="display:flex; align-items:center; gap:15px;">
                    <img src="${getAvatarUrl(me)}" class="avatar">
                    <div>
                        <strong style="font-size:18px;">${me.name || me.email}</strong><br>
                        <span class="badge ${isAdmin ? 'badge-admin' : 'badge-worker'}">${me.role}</span>
                    </div>
                </div>
                <a href="/logout" style="color:#e53e3e; text-decoration:none;">Выход</a>
            </div>

            ${isAdmin ? `
            <div class="box">
                <h3>👥 Список сотрудников (${users.length})</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:20px;">
                    <input type="email" name="email" placeholder="Email нового воркера" required style="flex:1; padding:10px;">
                    <input type="password" name="password" placeholder="Пароль" required style="flex:1; padding:10px;">
                    <select name="role" style="padding:10px;"><option value="worker">Worker</option><option value="admin">Admin</option></select>
                    <button type="submit" class="btn-primary">Создать</button>
                </form>
                <table>
                    <thead><tr><th>Сотрудник</th><th>Роль</th><th>Действие</th></tr></thead>
                    <tbody>
                        ${users.map(u => `
                        <tr>
                            <td><img src="${getAvatarUrl(u)}" style="width:30px; height:30px; border-radius:50%; vertical-align:middle; margin-right:10px;"> ${u.email}</td>
                            <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-worker'}">${u.role}</span></td>
                            <td>
                                <form method="POST" action="/change-role" style="margin:0;">
                                    <input type="hidden" name="userId" value="${u.id}">
                                    <select name="newRole" onchange="this.form.submit()" style="font-size:12px;">
                                        <option value="worker" ${u.role === 'worker' ? 'selected' : ''}>Worker</option>
                                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    </select>
                                </form>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <div class="box">
                <h3>📦 Список товаров</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:20px;">
                    <input type="text" name="device" placeholder="Название товара" required style="flex:2; padding:10px;">
                    <select name="work" style="flex:1; padding:10px;">
                        <option value="working">working</option>
                        <option value="not working">not working</option>
                    </select>
                    <button type="submit" class="btn-primary">Добавить товар</button>
                </form>
                ` : ''}
                <table>
                    <thead><tr><th>Название</th><th>Статус</th><th>Действие</th></tr></thead>
                    <tbody>
                        ${inventory.map(i => `
                        <tr>
                            <td><b>${i.device}</b></td>
                            <td class="status ${i.work === 'working' ? 'working' : 'not-working'}">${i.work}</td>
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
        res.status(500).send("Ошибка: " + e.message);
    }
});

// --- ОБРАБОТЧИКИ ---

app.post('/add-user', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Forbidden");
    try {
        await pb.collection('users').create({
            email: req.body.email,
            password: req.body.password,
            passwordConfirm: req.body.password,
            role: req.body.role,
            emailVisibility: true
        });
        res.redirect('/');
    } catch (e) { res.send("Ошибка создания: " + e.message); }
});

app.post('/change-role', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Forbidden");
    try {
        await pb.collection('users').update(req.body.userId, { role: req.body.newRole });
        res.redirect('/');
    } catch (e) { res.send("Ошибка смены роли"); }
});

app.post('/add-inventory', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Forbidden");
    try {
        await pb.collection('inventory').create({ device: req.body.device, work: req.body.work });
        res.redirect('/');
    } catch (e) { res.send("Ошибка"); }
});

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

app.listen(PORT, '0.0.0.0', () => console.log(`Server: http://localhost:${PORT}`));

const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// Ссылка на аватар (используем почту как подпись, если нет аватара)
function getAvatarUrl(user) {
    if (!user || !user.avatar) return `https://via.placeholder.com/100?text=${user?.email?.split('@')[0] || 'User'}`;
    return `${PB_URL}api/files/_pb_users_auth_/${user.id}/${user.avatar}`;
}

// --- ЛОГИН ---
app.get('/login', (req, res) => {
    res.send(`
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; margin: 0; }
            .card { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); width: 320px; }
            input, button { width: 100%; padding: 12px; margin-top: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
            button { background: #007bff; color: white; border: none; cursor: pointer; font-weight: bold; }
        </style>
        <div class="card">
            <h2 style="text-align:center">Inventory</h2>
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
        res.status(400).send('Ошибка входа. <a href="/login">Назад</a>');
    }
});

// --- ГЛАВНАЯ ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';

    try {
        const inventory = await pb.collection('inventory').getFullList({ sort: '-created' });
        // Получаем всех пользователей (админ видит список)
        const users = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: sans-serif; background: #f8f9fa; padding: 20px; }
            .container { max-width: 900px; margin: 0 auto; }
            .section { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
            .avatar-circle { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 10px; border: 2px solid #007bff; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; color: white; background: #007bff; }
            .status-working { color: green; font-weight: bold; }
            .status-not-working { color: red; font-weight: bold; }
        </style>

        <div class="container">
            <div class="header">
                <div>
                    <img src="${getAvatarUrl(me)}" class="avatar-circle">
                    <b>${me.email}</b> <span class="badge">${me.role}</span>
                </div>
                <a href="/logout">Выйти</a>
            </div>

            ${isAdmin ? `
            <div class="section">
                <h3>👥 Сотрудники (Workers)</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input type="email" name="email" placeholder="Email воркера" required style="padding:8px; flex:1;">
                    <input type="password" name="password" placeholder="Пароль" required style="padding:8px; flex:1;">
                    <input type="hidden" name="role" value="worker">
                    <button type="submit" style="padding:8px 15px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">+ Создать Worker</button>
                </form>
                <table>
                    <thead><tr><th>Аватар</th><th>Email</th><th>Роль</th></tr></thead>
                    <tbody>
                        ${users.map(u => `
                        <tr>
                            <td><img src="${getAvatarUrl(u)}" style="width:30px; border-radius:50%;"></td>
                            <td>${u.email}</td>
                            <td><b>${u.role}</b></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            ` : ''}

            <div class="section">
                <h3>📦 Инвентарь</h3>
                ${isAdmin ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input type="text" name="device" placeholder="Название товара" required style="padding:8px; flex:1;">
                    <select name="work" style="padding:8px;"><option value="working">working</option><option value="not working">not working</option></select>
                    <button type="submit" style="padding:8px 15px; background:#007bff; color:white; border:none; border-radius:4px; cursor:pointer;">Добавить товар</button>
                </form>
                ` : ''}
                <table>
                    <thead><tr><th>Товар</th><th>Статус</th><th>Действие</th></tr></thead>
                    <tbody>
                        ${inventory.map(i => `
                        <tr>
                            <td>${i.device}</td>
                            <td class="${i.work === 'working' ? 'status-working' : 'status-not-working'}">${i.work}</td>
                            <td>
                                <form method="POST" action="/toggle-inventory" style="margin:0;">
                                    <input type="hidden" name="id" value="${i.id}">
                                    <input type="hidden" name="current" value="${i.work}">
                                    <button type="submit">Изменить</button>
                                </form>
                            </td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        `;
        res.send(html);
    } catch (e) { res.send("Ошибка: " + e.message); }
});

// --- ОБРАБОТЧИКИ ---

app.post('/add-user', async (req, res) => {
    try {
        await pb.collection('users').create({
            email: req.body.email,
            password: req.body.password,
            passwordConfirm: req.body.password,
            role: 'worker',
            emailVisibility: true // Чтобы почта была видна в списке
        });
        res.redirect('/');
    } catch (e) { res.send("Ошибка: " + e.message); }
});

app.post('/add-inventory', async (req, res) => {
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

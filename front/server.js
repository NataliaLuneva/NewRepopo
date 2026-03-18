const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// Функция для получения URL аватарки
function getAvatarUrl(user) {
    if (!user || !user.avatar) return 'https://via.placeholder.com/50';
    return `${PB_URL}api/files/_pb_users_auth_/${user.id}/${user.avatar}`;
}

// --- ЛОГИН ---
app.get('/login', (req, res) => {
    res.send(`
        <style>body { font-family: sans-serif; display: flex; justify-content: center; padding-top: 100px; background: #f0f2f5; }</style>
        <form method="POST" action="/login" style="background:white; padding:30px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); width: 300px;">
            <h2 style="text-align:center">Inventory</h2>
            <input type="email" name="email" placeholder="Email" required style="display:block; width:100%; margin-bottom:10px; padding:10px; box-sizing:border-box;">
            <input type="password" name="password" placeholder="Password" required style="display:block; width:100%; margin-bottom:10px; padding:10px; box-sizing:border-box;">
            <button type="submit" style="width:100%; padding:10px; background:#007bff; color:white; border:none; border-radius:5px; cursor:pointer;">Войти</button>
        </form>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        await pb.collection('users').authWithPassword(email, password);
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка: " + err.message + '<br><a href="/login">Назад</a>');
    }
});

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    const currentUser = pb.authStore.model;
    const isAdmin = currentUser.role === 'admin';

    try {
        const inventory = await pb.collection('inventory').getFullList({ sort: '-created' });
        const allUsers = isAdmin ? await pb.collection('users').getFullList() : [];

        let html = `
            <style>
                body { font-family: sans-serif; padding: 20px; background: #fafafa; }
                .card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); margin-bottom: 20px; }
                .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 10px; border: 2px solid #007bff; background: #eee; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
                .btn { padding: 6px 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: #fff; }
                .status-working { color: green; font-weight: bold; }
                .status-not-working { color: red; font-weight: bold; }
            </style>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h1>📦 Inventory System</h1>
                <div>
                    <img src="${getAvatarUrl(currentUser)}" class="avatar">
                    <b>${currentUser.name || currentUser.email}</b> 
                    <span style="background:#007bff; color:white; padding:2px 8px; border-radius:10px; font-size:12px;">${currentUser.role}</span> | 
                    <a href="/logout">Выйти</a>
                </div>
            </div>

            ${isAdmin ? `
                <div class="card" style="border-left: 5px solid #ffc107;">
                    <h3>👥 Управление пользователями (Админ)</h3>
                    <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:20px;">
                        <input type="email" name="email" placeholder="Новый Email" required style="padding:8px;">
                        <input type="password" name="password" placeholder="Пароль" required style="padding:8px;">
                        <select name="role" style="padding:8px;"><option value="user">User</option><option value="admin">Admin</option></select>
                        <button type="submit" class="btn" style="background:#28a745; color:white; border:none;">Создать</button>
                    </form>
                    <table>
                        ${allUsers.map(u => `
                            <tr>
                                <td><img src="${getAvatarUrl(u)}" class="avatar" style="width:30px; height:30px;"> ${u.email}</td>
                                <td>
                                    <form method="POST" action="/change-role" style="display:inline;">
                                        <input type="hidden" name="userId" value="${u.id}">
                                        <select name="newRole" onchange="this.form.submit()" style="padding:4px;">
                                            <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                                            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                                        </select>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            ` : ''}

            <div class="card">
                <h3>🛠 Инвентарь</h3>
                <table>
                    <thead><tr><th>Устройство</th><th>Статус</th><th>Действие</th></tr></thead>
                    <tbody>
                        ${inventory.map(r => `
                            <tr>
                                <td><b>${r.device}</b></td>
                                <td class="${r.work === 'working' ? 'status-working' : 'status-not-working'}">${r.work}</td>
                                <td>
                                    <form method="POST" action="/toggle-status" style="display:inline;">
                                        <input type="hidden" name="id" value="${r.id}">
                                        <input type="hidden" name="current" value="${r.work}">
                                        <button type="submit" class="btn">Переключить</button>
                                    </form>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        res.send(html);
    } catch (err) {
        res.status(500).send("Ошибка сервера: " + err.message);
    }
});

// --- ЛОГИКА ---

app.post('/add-user', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Нет прав");
    try {
        const { email, password, role } = req.body;
        await pb.collection('users').create({
            email, password, passwordConfirm: password, role, emailVisibility: true
        });
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка: " + err.message + '<br><a href="/">Назад</a>');
    }
});

app.post('/change-role', async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Нет прав");
    try {
        const { userId, newRole } = req.body;
        await pb.collection('users').update(userId, { role: newRole });
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка: " + err.message);
    }
});

app.post('/toggle-status', async (req, res) => {
    try {
        const { id, current } = req.body;
        await pb.collection('inventory').update(id, { work: current === 'working' ? 'not working' : 'working' });
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка обновления статуса");
    }
});

app.get('/logout', (req, res) => {
    pb.authStore.clear();
    res.redirect('/login');
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server: http://localhost:${PORT}`));

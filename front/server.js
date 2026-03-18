const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');
const multer = require('multer'); // Для загрузки файлов
const upload = multer(); 

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// Функция для получения URL аватарки
function getAvatarUrl(user) {
    if (!user.avatar) return 'https://via.placeholder.com/50';
    return `${PB_URL}api/files/_pb_users_auth_/${user.id}/${user.avatar}`;
}

// --- ЛОГИН ---
app.get('/login', (req, res) => {
    res.send(`
        <style>body { font-family: sans-serif; display: flex; justify-content: center; padding-top: 100px; background: #f0f2f5; }</style>
        <form method="POST" action="/login" style="background:white; padding:30px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            <h2>Inventory Access</h2>
            <input type="email" name="email" placeholder="Email" required style="display:block; width:100%; margin-bottom:10px; padding:10px;">
            <input type="password" name="password" placeholder="Password" required style="display:block; width:100%; margin-bottom:10px; padding:10px;">
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
        res.status(400).send("Ошибка: " + err.message);
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
                .avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 10px; border: 2px solid #007bff; }
                table { width: 100%; border-collapse: collapse; }
                th, td { padding: 12px; border-bottom: 1px solid #eee; text-align: left; }
                .btn { padding: 5px 10px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; }
                .admin-only { border: 2px solid #ffc107; }
            </style>

            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h1>📦 Inventory System</h1>
                <div>
                    <img src="${getAvatarUrl(currentUser)}" class="avatar">
                    <b>${currentUser.name || currentUser.email}</b> (${currentUser.role}) | <a href="/logout">Выйти</a>
                </div>
            </div>

            ${isAdmin ? `
                <div class="card admin-only">
                    <h3>👥 Управление пользователями</h3>
                    <form method="POST" action="/add-user" enctype="multipart/form-data" style="display:grid; grid-template-columns: 1fr 1fr 1fr 100px; gap:10px; margin-bottom:20px;">
                        <input type="email" name="email" placeholder="Email" required>
                        <input type="password" name="password" placeholder="Password" required>
                        <select name="role"><option value="user">User</option><option value="admin">Admin</option></select>
                        <button type="submit" class="btn" style="background:#28a745; color:white;">Создать</button>
                    </form>

                    <table>
                        ${allUsers.map(u => `
                            <tr>
                                <td><img src="${getAvatarUrl(u)}" class="avatar" style="width:30px; height:30px;"> ${u.email}</td>
                                <td>
                                    <form method="POST" action="/change-role" style="display:inline;">
                                        <input type="hidden" name="userId" value="${u.id}">
                                        <select name="newRole" onchange="this.form.submit()">
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
                                <td>${r.device}</td>
                                <td style="color:${r.work === 'working' ? 'green' : 'red'}"><b>${r.work}</b></td>
                                <td>
                                    <form method="POST" action="/toggle-status" style="display:inline;">
                                        <input type="hidden" name="id" value="${r.id}"><input type="hidden" name="current" value="${r.work}">
                                        <button type="submit" class="btn">Изменить статус</button>
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
        res.send("Ошибка: " + err.message);
    }
});

// --- ЛОГИКА: СОЗДАНИЕ ЮЗЕРА (АДМИН) ---
app.post('/add-user', upload.single('avatar'), async (req, res) => {
    if (pb.authStore.model.role !== 'admin') return res.status(403).send("Нет прав");
    try {
        const { email, password, role } = req.body;
        await pb.collection('users').create({
            email,
            password,
            passwordConfirm: password,
            role,
            emailVisibility: true
        });
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка: " + err.message);
    }
});

// --- ЛОГИКА: СМЕНА РОЛИ (АДМИН) ---
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

// --- ЛОГИКА: СМЕНА СТАТУСА ИНВЕНТАРЯ ---
app.post('/toggle-status', async (req, res) => {
    try {
        const { id, current } = req.body;
        await pb.collection('inventory').update(id, { work: current === 'working' ? 'not working' : 'working' });
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка: " + err.message);
    }
});

app.get('/logout', (req, res) => {
    pb.authStore.clear();
    res.redirect('/login');
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server on http://localhost:${PORT}`));

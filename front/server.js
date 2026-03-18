const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// Настройка обработки данных из форм
app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- СТРАНИЦА ВХОДА ---
app.get('/login', (req, res) => {
    res.send(`
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; margin: 0; }
            form { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.1); width: 320px; }
            h2 { text-align: center; color: #1c1e21; }
            input { display: block; width: 100%; margin-bottom: 15px; padding: 12px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
            button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; font-weight: bold; }
            button:hover { background: #0056b3; }
        </style>
        <form method="POST" action="/login">
            <h2>Inventory Login</h2>
            <input type="email" name="email" placeholder="Email (почта)" required>
            <input type="password" name="password" placeholder="Пароль" required>
            <button type="submit">Войти</button>
        </form>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        // Авторизуемся в коллекции users
        await pb.collection('users').authWithPassword(email, password);
        res.redirect('/');
    } catch (err) {
        res.status(400).send(`<h2>Ошибка входа</h2><p>${err.message}</p><a href="/login">Попробовать снова</a>`);
    }
});

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    // Если токен невалиден — на логин
    if (!pb.authStore.isValid) return res.redirect('/login');

    const currentUser = pb.authStore.model;
    const isAdmin = currentUser.role === 'admin';

    try {
        const records = await pb.collection('inventory').getFullList({ sort: '-created' });

        let html = `
            <style>
                body { font-family: sans-serif; padding: 40px; background: #fafafa; color: #333; }
                .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
                .user-info { font-size: 14px; background: #eee; padding: 5px 15px; border-radius: 20px; }
                .admin-panel { background: #fff3cd; border: 1px solid #ffeeba; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
                table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                th, td { padding: 15px; border: 1px solid #eee; text-align: left; }
                th { background: #f8f9fa; }
                .status-working { color: #28a745; font-weight: bold; }
                .status-not-working { color: #dc3545; font-weight: bold; }
                .btn { padding: 8px 16px; border-radius: 4px; border: 1px solid #ccc; cursor: pointer; background: white; }
                .btn:hover { background: #f0f0f0; }
                .btn-add { background: #28a745; color: white; border: none; padding: 10px 20px; }
            </style>

            <div class="header">
                <h1>📦 Мониторинг Инвентаря</h1>
                <div class="user-info">
                    Пользователь: <b>${currentUser.name || currentUser.email}</b> | Роль: <b>${currentUser.role}</b> | 
                    <a href="/logout">Выйти</a>
                </div>
            </div>

            ${isAdmin ? `
                <div class="admin-panel">
                    <h3>➕ Добавить новое устройство (Панель Админа)</h3>
                    <form method="POST" action="/add-item" style="display:flex; gap:10px;">
                        <input type="text" name="device" placeholder="Название (например: Принтер)" required style="padding:10px; flex-grow:1; border:1px solid #ccc; border-radius:4px;">
                        <select name="work" style="padding:10px; border-radius:4px; border:1px solid #ccc;">
                            <option value="working">working</option>
                            <option value="not working">not working</option>
                        </select>
                        <button type="submit" class="btn-add">Создать запись</button>
                    </form>
                </div>
            ` : ''}

            <table>
                <thead>
                    <tr>
                        <th>Название устройства</th>
                        <th>Текущий статус</th>
                        <th>Действие</th>
                    </tr>
                </thead>
                <tbody>
        `;

        records.forEach(r => {
            const isWorking = r.work === 'working';
            html += `
                <tr>
                    <td><b>${r.device || 'Без имени'}</b></td>
                    <td class="${isWorking ? 'status-working' : 'status-not-working'}">
                        ${isWorking ? '● WORKING' : '○ NOT WORKING'}
                    </td>
                    <td>
                        <form method="POST" action="/toggle-status" style="display:inline;">
                            <input type="hidden" name="id" value="${r.id}">
                            <input type="hidden" name="currentWork" value="${r.work}">
                            <button type="submit" class="btn">Изменить статус</button>
                        </form>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        res.send(html);
    } catch (err) {
        res.send("Ошибка загрузки данных: " + err.message);
    }
});

// --- ЛОГИКА: СМЕНА СТАТУСА (ДЛЯ ВСЕХ) ---
app.post('/toggle-status', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    try {
        const { id, currentWork } = req.body;
        // Если было working -> станет not working, и наоборот
        const newStatus = (currentWork === 'working') ? 'not working' : 'working';

        await pb.collection('inventory').update(id, {
            work: newStatus
        });

        res.redirect('/');
    } catch (err) {
        console.error("Update Error:", err);
        res.status(400).send("Ошибка обновления. Проверьте права API Rules в PocketBase. " + err.message);
    }
});

// --- ЛОГИКА: ДОБАВЛЕНИЕ (ТОЛЬКО АДМИН) ---
app.post('/add-item', async (req, res) => {
    if (!pb.authStore.isValid || pb.authStore.model.role !== 'admin') {
        return res.status(403).send("Только админ может добавлять устройства!");
    }

    try {
        const { device, work } = req.body;
        await pb.collection('inventory').create({
            device: device,
            work: work
        });
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка при создании: " + err.message);
    }
});

// --- ВЫХОД ---
app.get('/logout', (req, res) => {
    pb.authStore.clear();
    res.redirect('/login');
});

// Запуск
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`Сервер запущен: http://localhost:${PORT}`);
    console.log(`=========================================`);
});

const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- СТРАНИЦА ВХОДА ---
app.get('/login', (req, res) => {
    res.send(`
        <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; }
            form { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            input { display: block; width: 100%; margin-bottom: 1rem; padding: 10px; }
            button { width: 100%; padding: 10px; background: #007bff; color: white; border: none; cursor: pointer; }
        </style>
        <form method="POST" action="/login">
            <h2>Система Inventory</h2>
            <input type="email" name="email" placeholder="Email" required>
            <input type="password" name="password" placeholder="Пароль" required>
            <button type="submit">Войти</button>
        </form>
    `);
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        await pb.collection('users').authWithPassword(email, password);
        res.redirect('/');
    } catch (err) {
        res.status(400).send("Ошибка входа: " + err.message);
    }
});

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    const currentUser = pb.authStore.model;
    const isAdmin = currentUser.role === 'admin';

    try {
        // Загружаем данные из коллекции inventory
        const records = await pb.collection('inventory').getFullList({ sort: '-created' });

        let html = `
            <style>
                body { font-family: sans-serif; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { padding: 12px; border: 1px solid #ddd; text-align: left; }
                th { background-color: #f8f9fa; }
                .status-working { color: #28a745; font-weight: bold; }
                .status-not-working { color: #dc3545; font-weight: bold; }
                .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; background: #eee; }
            </style>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h1>Управление инвентарем</h1>
                <div>
                    <b>${currentUser.name || currentUser.email}</b> 
                    <span class="badge">${currentUser.role}</span>
                    <a href="/logout" style="margin-left: 15px;">Выход</a>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Устройство (Device)</th>
                        <th>Статус (Work)</th>
                        <th>Действия</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const r of records) {
            const isWorking = r.work === 'working';
            
            html += `
                <tr>
                    <td><strong>${r.device || 'Без названия'}</strong></td>
                    <td class="${isWorking ? 'status-working' : 'status-not-working'}">
                        ${isWorking ? '● Working' : '○ Not Working'}
                    </td>
                    <td>
                        <form method="POST" action="/toggle-status" style="display:inline;">
                            <input type="hidden" name="id" value="${r.id}">
                            <input type="hidden" name="currentWork" value="${r.work}">
                            <button type="submit">
                                Сделать ${isWorking ? 'Not Working' : 'Working'}
                            </button>
                        </form>

                        ${isAdmin ? `
                            <button style="margin-left:10px; color:red; cursor:not-allowed;" title="Функция удаления только для админа">
                                Удалить
                            </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }

        html += '</tbody></table>';
        res.send(html);

    } catch (err) {
        res.status(500).send("Ошибка загрузки данных: " + err.message);
    }
});

// --- СМЕНА СТАТУСА ---
app.post('/toggle-status', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    try {
        const { id, currentWork } = req.body;
        // Переключаем статус между working и not working
        const newStatus = (currentWork === 'working') ? 'not working' : 'working';

        await pb.collection('inventory').update(id, {
            work: newStatus
        });

        res.redirect('/');
    } catch (err) {
        res.status(403).send("Ошибка обновления: " + err.message);
    }
});

app.get('/logout', (req, res) => {
    pb.authStore.clear();
    res.redirect('/login');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Приложение запущено: http://localhost:${PORT}`);
});

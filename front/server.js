const express = require('express');
const PocketBase = require('pocketbase/cjs');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');

    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
    const isWorker = me.role === 'worker';
    const isUser = me.role === 'user'; // Наш покупатель

    try {
        // Показываем только товары со статусом "not sold"
        const inventory = await pb.collection('inventory').getFullList({
            filter: 'work = "not sold"',
            sort: '-created'
        });

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f4f7f9; padding: 20px; }
            .container { max-width: 900px; margin: 0 auto; }
            .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); margin-bottom: 20px; }
            .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
            .item { display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee; }
            .price { font-size: 22px; font-weight: bold; color: #27ae60; }
            .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: bold; }
            .btn-buy { background: #ff4757; color: white; }
            .btn-admin { background: #2f3542; color: white; margin-top: 10px; }
            .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; color: white; }
            .badge-user { background: #1e90ff; }
            .badge-worker { background: #ffa502; }
            .badge-admin { background: #2f3542; }
        </style>

        <div class="container">
            <div class="header">
                <div>
                    <span class="badge badge-${me.role}">${me.role.toUpperCase()}</span>
                    <strong style="margin-left: 10px;">${me.email}</strong>
                </div>
                <a href="/logout" style="text-decoration: none; color: #ff4757;">Выйти</a>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>➕ Добавить новый товар (Admin Only)</h3>
                <form method="POST" action="/add-item" style="display: flex; gap: 10px;">
                    <input type="text" name="device" placeholder="Название товара" required style="flex: 2; padding: 10px; border-radius: 5px; border: 1px solid #ddd;">
                    <input type="number" name="price" placeholder="Цена" required style="flex: 1; padding: 10px; border-radius: 5px; border: 1px solid #ddd;">
                    <button type="submit" class="btn btn-admin">Добавить</button>
                </form>
            </div>
            ` : ''}

            <div class="card">
                <h3>🛒 Доступные товары в магазине</h3>
                ${inventory.length === 0 ? '<p>Товаров нет в наличии.</p>' : ''}
                
                ${inventory.map(item => `
                    <div class="item">
                        <div>
                            <div style="font-size: 18px; font-weight: bold;">${item.device}</div>
                            <div style="color: #777;">Статус: ${item.work}</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 20px;">
                            <span class="price">${item.price} $</span>
                            
                            ${isUser ? `
                                <form method="POST" action="/purchase">
                                    <input type="hidden" name="id" value="${item.id}">
                                    <button type="submit" class="btn btn-buy">КУПИТЬ</button>
                                </form>
                            ` : ''}

                            ${(isAdmin || isWorker) ? `<span style="color: #999; font-size: 12px;">Просмотр</span>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        `;
        res.send(html);
    } catch (e) {
        res.status(500).send("Ошибка: " + e.message);
    }
});

// --- ЛОГИКА ПОКУПКИ (Смена статуса) ---
app.post('/purchase', async (req, res) => {
    try {
        const { id } = req.body;
        // Меняем статус на sold. Товар пропадет из списка из-за фильтра в GET
        await pb.collection('inventory').update(id, {
            work: 'sold'
        });
        res.redirect('/');
    } catch (e) {
        res.status(400).send("Ошибка покупки");
    }
});

// --- ДОБАВЛЕНИЕ ТОВАРА (Админ) ---
app.post('/add-item', async (req, res) => {
    try {
        await pb.collection('inventory').create({
            device: req.body.device,
            price: req.body.price,
            work: 'not sold' // По умолчанию в продаже
        });
        res.redirect('/');
    } catch (e) {
        res.status(400).send("Ошибка добавления");
    }
});

// --- ЛОГИН / ЛОГАУТ ---
app.get('/login', (req, res) => {
    res.send(`
        <body style="display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
            <form method="POST" style="padding:40px; border:1px solid #ddd; border-radius:10px;">
                <h2>Вход в систему</h2>
                <input name="email" placeholder="Email" required style="display:block; width:250px; padding:10px; margin-bottom:10px;"><br>
                <input name="password" type="password" placeholder="Пароль" required style="display:block; width:250px; padding:10px; margin-bottom:10px;"><br>
                <button style="width:100%; padding:10px; background:#1e90ff; color:white; border:none; cursor:pointer;">Войти</button>
            </form>
        </body>
    `);
});

app.post('/login', async (req, res) => {
    try {
        await pb.collection('users').authWithPassword(req.body.email, req.body.password);
        res.redirect('/');
    } catch (e) { res.status(400).send('Ошибка входа'); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`Магазин запущен: http://localhost:${PORT}`));

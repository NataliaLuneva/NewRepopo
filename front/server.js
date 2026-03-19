const express = require('express');
const PocketBase = require('pocketbase/cjs');
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');
const multer = require('multer'); 

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const PORT = process.env.PORT || 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const formatPrice = (val) => {
    const p = Number(val) || 0;
    return p % 1 === 0 ? p.toString() : p.toFixed(2);
};

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');
    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
    const isWorker = me.role === 'worker' || isAdmin;
    const isUser = me.role === 'user';

    const avatarUrl = me.avatar 
        ? `${PB_URL}api/files/_pb_users_auth_/${me.id}/${me.avatar}`
        : 'https://cdn-icons-png.flaticon.com/512/149/149071.png';

    try {
        const availableItems = await pb.collection('inventory').getFullList({ filter: 'status != "sold"', sort: '-created' });
        const allUsers = isAdmin ? await pb.collection('users').getFullList({ sort: '-created' }) : [];

        let html = `
        <style>
            body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: white; margin: 0; padding: 20px; }
            .container { max-width: 1100px; margin: 0 auto; }
            .card { background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); }
            .profile-section { display: flex; align-items: center; gap: 20px; }
            .avatar-img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #6366f1; background: #334155; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 12px; border-bottom: 1px solid #334155; text-align: left; }
            .btn { padding: 8px 15px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; text-decoration: none; color: white; display: inline-block; transition: 0.2s; font-size: 0.9em; }
            .btn-primary { background: #6366f1; }
            .btn-danger { background: #f43f5e; }
            .btn-success { background: #10b981; }
            .btn-warning { background: #f59e0b; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; background: #475569; }
            input, select { padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; margin-bottom: 10px; }
            #searchInput { width: 100%; font-size: 1.1em; border: 2px solid #6366f1; box-sizing: border-box; margin-bottom: 20px; }
            .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; z-index: 100; }
            .modal-content { background: #1e293b; padding: 30px; border-radius: 15px; width: 380px; }
        </style>

        <div class="container">
            <div class="card profile-section">
                <img src="${avatarUrl}" class="avatar-img">
                <div style="flex-grow: 1;">
                    <h2 style="margin:0;">${me.email}</h2>
                    <span class="badge" style="background:#6366f1;">${me.role}</span>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="openModal('profileModal')" class="btn btn-primary">⚙️ Настройки</button>
                    <a href="/logout" class="btn btn-danger">Выход</a>
                </div>
            </div>

            <div id="profileModal" class="modal">
                <div class="modal-content">
                    <h3>Настройки профиля</h3>
                    <form action="/update-profile" method="POST" enctype="multipart/form-data">
                        <label>🖼️ Новая аватарка:</label><br>
                        <input type="file" name="avatar" accept="image/*" style="width:100%;"><br><br>
                        <label>🔑 Текущий пароль:</label><br>
                        <input type="password" name="oldPassword" style="width:100%;" placeholder="Обязательно для смены пароля">
                        <label>🆕 Новый пароль:</label><br>
                        <input type="password" name="password" style="width:100%;">
                        <input type="password" name="passwordConfirm" placeholder="Повтор" style="width:100%;">
                        <div style="display:flex; gap:10px; margin-top:20px;">
                            <button type="submit" class="btn btn-success" style="flex:1;">Ок</button>
                            <button type="button" onclick="closeModal('profileModal')" class="btn btn-danger" style="flex:1;">Отмена</button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="card">
                <h3>📦 Склад товаров</h3>
                <input type="text" id="searchInput" onkeyup="filterTable()" placeholder="🔍 Быстрый поиск...">

                ${isWorker ? `
                <form method="POST" action="/add-inventory" style="display:flex; gap:10px; margin-bottom:20px;">
                    <input name="device" placeholder="Название" required style="flex:3;">
                    <input name="price" type="number" placeholder="Цена" required style="flex:1;">
                    <button class="btn btn-success">+ Добавить</button>
                </form>` : ''}

                <form method="POST" action="/purchase">
                    <table id="inventoryTable">
                        <thead>
                            <tr>${isUser ? '<th>🛒</th>' : ''} <th>Название</th> <th>Цена</th> ${isWorker ? '<th>Состояние</th> <th>Действия</th>' : ''}</tr>
                        </thead>
                        <tbody>
                            ${availableItems.map(i => `
                            <tr class="item-row">
                                ${isUser ? `<td><input type="checkbox" name="ids" value="${i.id}"></td>` : ''}
                                <td class="device-name"><b>${i.device}</b></td>
                                <td style="color:#10b981; font-weight:bold;">$${i.price}</td>
                                ${isWorker ? `
                                    <td><span class="badge ${i.work === 'working' ? 'btn-success' : 'btn-danger'}">${i.work}</span></td>
                                    <td>
                                        <button type="button" onclick="openEditModal('${i.id}', '${i.device}', '${i.price}', '${i.work}')" class="btn btn-warning">📝</button>
                                        <a href="/toggle-status/${i.id}/${i.work}" class="btn btn-primary">🔄</a>
                                        ${isAdmin ? `<a href="/del-item/${i.id}" class="btn btn-danger">🗑️</a>` : ''}
                                    </td>
                                ` : ''}
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${isUser && availableItems.length > 0 ? `<button class="btn btn-success" style="width:100%; margin-top:20px; padding:15px;">КУПИТЬ ВЫБРАННЫЕ</button>` : ''}
                </form>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Добавить пользователя</h3>
                <form method="POST" action="/add-user" style="display:flex; gap:10px; margin-bottom:15px;">
                    <input name="email" type="email" placeholder="Email" required style="flex:2;">
                    <input name="password" type="password" placeholder="Пароль" required style="flex:2;">
                    <select name="role" style="flex:1;"><option value="user">User</option><option value="worker">Worker</option><option value="admin">Admin</option></select>
                    <button class="btn btn-primary">Создать</button>
                </form>
                <table>
                    ${allUsers.map(u => `<tr><td>${u.email}</td><td><span class="badge">${u.role}</span></td><td style="text-align:right;"><a href="/del-user/${u.id}" style="color:#f43f5e;">❌</a></td></tr>`).join('')}
                </table>
            </div>` : ''}
        </div>

        <div id="editItemModal" class="modal">
            <div class="modal-content">
                <h3>Редактировать товар</h3>
                <form id="editItemForm" method="POST">
                    <input type="text" name="device" id="editDevice" style="width:100%;" required>
                    <input type="number" name="price" id="editPrice" style="width:100%;" required>
                    <select name="work" id="editWork" style="width:100%;">
                        <option value="working">working</option>
                        <option value="not working">not working</option>
                    </select>
                    <div style="display:flex; gap:10px; margin-top:20px;">
                        <button type="submit" class="btn btn-success" style="flex:1;">Сохранить</button>
                        <button type="button" onclick="closeModal('editItemModal')" class="btn btn-danger" style="flex:1;">Отмена</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            function openModal(id) { document.getElementById(id).style.display = 'flex'; }
            function closeModal(id) { document.getElementById(id).style.display = 'none'; }
            function openEditModal(id, name, price, work) {
                document.getElementById('editItemForm').action = '/edit-inventory/' + id;
                document.getElementById('editDevice').value = name;
                document.getElementById('editPrice').value = price;
                document.getElementById('editWork').value = work;
                openModal('editItemModal');
            }
            function filterTable() {
                let input = document.getElementById("searchInput").value.toUpperCase();
                document.querySelectorAll(".item-row").forEach(row => {
                    let name = row.querySelector(".device-name").innerText;
                    row.style.display = name.toUpperCase().includes(input) ? "" : "none";
                });
            }
        </script>
        `;
        res.send(html);
    } catch (e) { res.send("Ошибка: " + e.message); }
});

// --- ЛОГИКА ТОВАРОВ ---
app.post('/add-inventory', async (req, res) => {
    try {
        if (!pb.authStore.isValid) return res.redirect('/login');
        await pb.collection('inventory').create({
            device: req.body.device,
            price: Number(req.body.price) || 0,
            work: "working"
        });
        res.redirect('/');
    } catch (e) { res.status(500).send("Ошибка: " + e.message); }
});

app.post('/edit-inventory/:id', async (req, res) => {
    try {
        await pb.collection('inventory').update(req.params.id, { 
            device: req.body.device, 
            price: Number(req.body.price), 
            work: req.body.work 
        });
        res.redirect('/');
    } catch (e) { res.status(500).send("Ошибка обновления: " + e.message); }
});

app.get('/toggle-status/:id/:current', async (req, res) => {
    const next = req.params.current === 'working' ? 'not working' : 'working';
    await pb.collection('inventory').update(req.params.id, { work: next });
    res.redirect('/');
});

app.get('/del-item/:id', async (req, res) => {
    await pb.collection('inventory').delete(req.params.id);
    res.redirect('/');
});

// --- ЛОГИКА ЮЗЕРОВ И ПРОФИЛЯ ---
app.post('/update-profile', upload.single('avatar'), async (req, res) => {
    try {
        if (!pb.authStore.isValid) return res.redirect('/login');
        const formData = new FormData();
        
        if (req.body.password && req.body.password.trim() !== "") {
            if (!req.body.oldPassword) throw new Error("Введите старый пароль");
            formData.append('oldPassword', req.body.oldPassword);
            formData.append('password', req.body.password);
            formData.append('passwordConfirm', req.body.passwordConfirm);
        }
        
        if (req.file) formData.append('avatar', new Blob([req.file.buffer]), req.file.originalname);
        
        await pb.collection('users').update(pb.authStore.model.id, formData);
        await pb.collection('users').authRefresh();
        res.redirect('/');
    } catch (e) {
        // КРАСИВАЯ СТРАНИЦА ОШИБКИ / ИСТЕКШЕЙ СЕССИИ
        const isAuthError = e.status === 401 || e.message.includes("token");
        const errorTitle = isAuthError ? "СЕССИЯ ИСТЕКЛА" : "ОШИБКА ОБНОВЛЕНИЯ";
        const errorMsg = isAuthError 
            ? "Ваш токен безопасности обновился. Нужно зайти в систему заново." 
            : (e.data?.data?.oldPassword ? "Неверный текущий пароль!" : e.message);

        res.status(e.status || 500).send(`
        <body style="background:#0f172a; color:white; font-family:'Segoe UI',sans-serif; display:flex; justify-content:center; align-items:center; height:100vh; margin:0;">
            <div style="background:rgba(30,41,59,0.8); backdrop-filter:blur(10px); padding:40px; border-radius:20px; border:1px solid #334155; text-align:center; box-shadow:0 20px 50px rgba(0,0,0,0.5); max-width:400px;">
                <div style="font-size:50px; margin-bottom:20px;">${isAuthError ? '🔐' : '⚠️'}</div>
                <h2 style="color:#f43f5e; margin-bottom:10px; letter-spacing:1px;">${errorTitle}</h2>
                <p style="color:#94a3b8; line-height:1.6; margin-bottom:30px;">${errorMsg}</p>
                <a href="/login" style="background:#6366f1; color:white; text-decoration:none; padding:12px 30px; border-radius:10px; font-weight:bold; display:inline-block; transition:0.3s; box-shadow:0 4px 15px rgba(99,102,241,0.4);">
                    ${isAuthError ? 'ВОЙТИ СНОВА' : 'ВЕРНУТЬСЯ'}
                </a>
                ${isAuthError ? '<script>setTimeout(() => { window.location.href = "/login"; }, 5000);</script>' : ''}
            </div>
        </body>`);
    }
});

app.post('/add-user', async (req, res) => {
    try {
        await pb.collection('users').create({ email: req.body.email, password: req.body.password, passwordConfirm: req.body.password, role: req.body.role, emailVisibility: true });
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

app.get('/del-user/:id', async (req, res) => {
    await pb.collection('users').delete(req.params.id);
    res.redirect('/');
});

// --- АВТОРИЗАЦИЯ И СТРАЙП ---
app.get('/login', (req, res) => {
    res.send(`<body style="background:#0f172a; color:white; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
    <form method="POST" style="background:#1e293b; padding:40px; border-radius:15px; width:300px;">
        <h2 style="text-align:center;">ВХОД</h2>
        <input name="email" placeholder="Email" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:none; box-sizing:border-box;">
        <input name="password" type="password" placeholder="Пароль" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:none; box-sizing:border-box;">
        <button style="width:100%; padding:10px; background:#6366f1; color:white; border:none; border-radius:5px; cursor:pointer;">ВОЙТИ</button>
    </form></body>`);
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); } catch (e) { res.send('Ошибка входа'); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.post('/purchase', async (req, res) => {
    try {
        let ids = req.body.ids;
        if (!ids) return res.status(400).send("Ничего не выбрано");
        if (!Array.isArray(ids)) ids = [ids];

        const lineItems = [];
        for (const id of ids) {
            try {
                const item = await pb.collection('inventory').getOne(id);
                lineItems.push({
                    price_data: {
                        currency: 'usd',
                        product_data: { 
                            name: item.device,
                            // Добавляем описание, чтобы Stripe не ругался на пустые данные
                            description: `Артикул: ${item.id}` 
                        },
                        // Переводим в центы и округляем
                        unit_amount: Math.round(parseFloat(item.price) * 100),
                    },
                    quantity: 1,
                });
            } catch (err) {
                console.error(`Товар ${id} не найден`);
            }
        }

        if (lineItems.length === 0) throw new Error("Список товаров пуст или цены некорректны");

        // Формируем базовый URL динамически
        const protocol = req.protocol;
        const host = req.get('host');
        const baseURL = `${protocol}://${host}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            // Stripe ОЧЕНЬ капризен к этим ссылкам. Делаем их полными:
            success_url: `${baseURL}/?payment=success`,
            cancel_url: `${baseURL}/?payment=cancel`,
        });

        // 303 Redirect - стандарт для Stripe
        res.redirect(303, session.url);

    } catch (e) {
        console.error("STRIPE 404/500 ERROR:", e.message);
        res.status(500).send(`
            <div style="background:#0f172a; color:white; height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; font-family:sans-serif;">
                <h1 style="color:#f43f5e;">ОШИБКА ПЛАТЕЖНОЙ СИСТЕМЫ</h1>
                <p>${e.message}</p>
                <p style="color:#475569;">Проверьте, что в Stripe Dashboard созданы нужные настройки и ключ верен.</p>
                <a href="/" style="color:#6366f1; text-decoration:none; margin-top:20px; border:1px solid #6366f1; padding:10px 20px; border-radius:8px;">Назад на склад</a>
            </div>
        `);
    }
});
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 СИСТЕМА ГОТОВА`));

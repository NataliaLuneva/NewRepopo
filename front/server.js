const express = require('express');
const PocketBase = require('pocketbase/cjs');
const stripe = require('stripe')('sk_test_51TCHFTRlVO81FVeef3B915pGfBvbQqhMAi1sSUkM06jOxkgUrSmfrwul9ezTdcCfqde2dBjdUxBDdBjOYWRcBcWG004OYs4Xf8');
const multer = require('multer'); 

// Настройка multer: храним файл в памяти (buffer)
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const PORT = process.env.PORT || 3000;

const PB_URL = 'http://pocketbase-enkyv7ef4telz43i7fxgf1wv.176.112.158.3.sslip.io/';
const pb = new PocketBase(PB_URL);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- ГЛАВНАЯ СТРАНИЦА ---
app.get('/', async (req, res) => {
    if (!pb.authStore.isValid) return res.redirect('/login');
    const me = pb.authStore.model;
    const isAdmin = me.role === 'admin';
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
            .btn { padding: 8px 15px; border-radius: 6px; border: none; cursor: pointer; font-weight: bold; text-decoration: none; color: white; display: inline-block; }
            .btn-primary { background: #6366f1; }
            .btn-danger { background: #f43f5e; }
            .btn-success { background: #10b981; }
            .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.8em; background: #475569; }
            input { padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: white; margin-bottom: 10px; }
            #profileModal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); justify-content: center; align-items: center; z-index: 100; }
            .modal-content { background: #1e293b; padding: 30px; border-radius: 15px; width: 350px; }
        </style>

        <div class="container">
            <div class="card profile-section">
                <img src="${avatarUrl}" class="avatar-img">
                <div style="flex-grow: 1;">
                    <h2 style="margin:0;">${me.email}</h2>
                    <span class="badge" style="background:#6366f1;">${me.role}</span>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="document.getElementById('profileModal').style.display='flex'" class="btn btn-primary">Настройки</button>
                    <a href="/logout" class="btn btn-danger">Выход</a>
                </div>
            </div>

            <div id="profileModal">
                <div class="modal-content">
                    <h3>Настройки профиля</h3>
                    <form action="/update-profile" method="POST" enctype="multipart/form-data">
                        <label>Аватарка:</label><br>
                        <input type="file" name="avatar" accept="image/*"><br>
                        <label>Новый пароль:</label><br>
                        <input type="password" name="password" placeholder="Оставьте пустым, если не меняете" style="width:100%;">
                        <input type="password" name="passwordConfirm" placeholder="Подтверждение" style="width:100%;">
                        <div style="display:flex; gap:10px; margin-top:20px;">
                            <button type="submit" class="btn btn-success" style="flex:1;">Ок</button>
                            <button type="button" onclick="document.getElementById('profileModal').style.display='none'" class="btn btn-danger" style="flex:1;">Отмена</button>
                        </div>
                    </form>
                </div>
            </div>

            ${isAdmin ? `
            <div class="card">
                <h3>👥 Пользователи</h3>
                <table>
                    ${allUsers.map(u => `<tr><td>${u.email}</td><td>${u.role}</td><td><a href="/del-user/${u.id}" style="color:#f43f5e;">Удалить</a></td></tr>`).join('')}
                </table>
            </div>
            ` : ''}

            <div class="card">
                <h3>📦 Товары</h3>
                <form method="POST" action="/purchase">
                    <table>
                        <thead>
                            <tr>${isUser ? '<th>🛒</th>' : ''} <th>Название</th> <th>Цена</th> ${!isUser ? '<th>Действия</th>' : ''}</tr>
                        </thead>
                        <tbody>
                            ${availableItems.map(i => `
                            <tr>
                                ${isUser ? `<td><input type="checkbox" name="ids" value="${i.id}"></td>` : ''}
                                <td><b>${i.device}</b></td>
                                <td style="color:#10b981;">$${i.price}</td>
                                ${!isUser ? `<td><a href="/toggle-status/${i.id}/${i.work}" class="btn" style="background:#475569; font-size:0.8em;">${i.work}</a></td>` : ''}
                            </tr>`).join('')}
                        </tbody>
                    </table>
                    ${isUser && availableItems.length > 0 ? `<button class="btn btn-success" style="width:100%; margin-top:20px;">ОПЛАТИТЬ</button>` : ''}
                </form>
            </div>
        </div>
        `;
        res.send(html);
    } catch (e) { res.send("Ошибка: " + e.message); }
});

// --- РОУТ ОБНОВЛЕНИЯ ПРОФИЛЯ (ФИКС) ---
app.post('/update-profile', upload.single('avatar'), async (req, res) => {
    try {
        const userId = pb.authStore.model.id;
        
        // Используем встроенный механизм PocketBase для файлов
        const data = {};

        if (req.body.password && req.body.password.length >= 8) {
            data.password = req.body.password;
            data.passwordConfirm = req.body.passwordConfirm;
        }

        if (req.file) {
            // Передаем файл как Blobs/Buffer прямо в объект
            data.avatar = new Uint8Array(req.file.buffer).buffer; 
            // Но в Node.js лучше использовать multipart/form-data вручную через SDK:
            const formData = new FormData();
            formData.append('avatar', new Blob([req.file.buffer]), req.file.originalname);
            if (data.password) {
                formData.append('password', data.password);
                formData.append('passwordConfirm', data.passwordConfirm);
            }
            await pb.collection('users').update(userId, formData);
        } else {
            // Если файла нет, просто обновляем поля
            await pb.collection('users').update(userId, data);
        }

        // Обновляем локальную модель пользователя
        await pb.collection('users').authRefresh();
        
        res.redirect('/');
    } catch (e) {
        console.error(e.data);
        res.status(500).send("Ошибка: " + (e.data?.message || e.message));
    }
});

// --- ОСТАЛЬНЫЕ РОУТЫ ---
app.post('/add-inventory', async (req, res) => {
    try {
        await pb.collection('inventory').create({ device: req.body.device, price: Number(req.body.price), work: 'working', status: 'available' });
        res.redirect('/');
    } catch (e) { res.send(e.message); }
});

app.get('/toggle-status/:id/:current', async (req, res) => {
    const next = req.params.current === 'working' ? 'not working' : 'working';
    await pb.collection('inventory').update(req.params.id, { work: next });
    res.redirect('/');
});

app.get('/login', (req, res) => {
    res.send(`<body style="background:#0f172a; color:white; display:flex; justify-content:center; align-items:center; height:100vh; font-family:sans-serif;">
    <form method="POST" style="background:#1e293b; padding:40px; border-radius:15px; width:300px;">
        <h2 style="text-align:center;">ВХОД</h2>
        <input name="email" placeholder="Email" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:none;">
        <input name="password" type="password" placeholder="Пароль" style="width:100%; padding:10px; margin-bottom:10px; border-radius:5px; border:none;">
        <button style="width:100%; padding:10px; background:#6366f1; color:white; border:none; border-radius:5px; cursor:pointer;">ВОЙТИ</button>
    </form></body>`);
});

app.post('/login', async (req, res) => {
    try { await pb.collection('users').authWithPassword(req.body.email, req.body.password); res.redirect('/'); } catch (e) { res.send('Ошибка входа'); }
});

app.get('/logout', (req, res) => { pb.authStore.clear(); res.redirect('/login'); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SYSTEM READY`));

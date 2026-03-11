const express = require('express');
const PocketBase = require('pocketbase/cjs');

const app = express();
const PORT = 3000;

// Настройки PocketBase и суперпользователя
const PB_URL = 'http://127.0.0.1:8090'; // URL вашего PocketBase сервера
const PB_ADMIN_EMAIL = 'jaroslava.makarova@ivkhk.ee';
const PB_ADMIN_PASSWORD = 'Morkovka';

const pb = new PocketBase(PB_URL);

async function getStudentsTable() {
  try {
    // Сначала логинимся как суперпользователь
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);

    // Запрашиваем данные коллекции 'student'
    const records = await pb.collection('student').getFullList();

    let html = `
      <h1>Kursantide hinnetabel</h1>
      <table border="1" cellpadding="5" cellspacing="0">
        <thead>
          <tr>
            <th>Student Name</th>
            <th>Subject</th>
            <th>Score</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    for (const r of records) {
      html += `
        <tr>
          <td>${r.student_name || '-'}</td>
          <td>${r.subject || '-'}</td>
          <td>${r.score ?? '-'}</td>
          <td>${r.status || '-'}</td>
        </tr>
      `;
    }

    html += '</tbody></table>';
    return html;

  } catch (err) {
    console.error("Viga PocketBase’ist andmete pärimisel:", err.message);
    return `<h1>Viga andmebaasiga</h1><p>${err.message}</p>`;
  }
}

app.get('/', async (req, res) => {
  const html = await getStudentsTable();
  res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`============================`);
  console.log(`Server töötab!`);
  console.log(`Port: ${PORT}`);
  console.log(`PocketBase URL: ${PB_URL}`);
  console.log(`============================`);
});

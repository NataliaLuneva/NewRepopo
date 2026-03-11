require('dotenv').config();
const express = require('express');
const PocketBase = require('pocketbase/cjs'); // ametlik PocketBase SDK

const app = express();
const PORT = process.env.PORT || 3000;
const PB_URL = process.env.PB_URL;

if (!PB_URL) {
  console.error("Keskkonnamuutuja PB_URL pole seadistatud!");
  process.exit(1);
}

const pb = new PocketBase(PB_URL);


async function getStudentsTable() {
  try {

    const records = await pb.collection('students').getFullList();

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

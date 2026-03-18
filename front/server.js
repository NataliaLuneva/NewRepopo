const express = require('express');
const PocketBase = require('pocketbase/cjs');

const app = express();
const PORT = 3000;

const PB_URL = 'http://10.245.0.103:8090';
const PB_ADMIN_EMAIL = 'jaroslava.makarova@ivkhk.ee';
const PB_ADMIN_PASSWORD = 'Morkovka';

const pb = new PocketBase(PB_URL);

async function debug() {
  try {
    await pb.admins.authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);

    console.log("Auth valid:", pb.authStore.isValid);

    const collections = await pb.collections.getFullList();
    console.log("Collections:", collections.map(c => c.name));

  } catch (err) {
    console.log("FULL ERROR:");
    console.log(err);
  }
}

debug();

app.get('/', async (req, res) => {
  const html = await getStudentsTable();
  res.send(html);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server töötab! Port: ${PORT}`);
});

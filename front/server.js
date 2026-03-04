const express = require('express');
const path = require('path');

const app = express();

const PORT = process.env.PORT || 3000;

// 👉 Отдаём статические файлы React
app.use(express.static(path.join(__dirname, 'clerk-react/dist')));

// 👉 Health check (можешь оставить)
app.get('/health', (req, res) => {
	res.status(200).json({
		status: 'ok',
		message: 'Rakendus töötab!',
		uptime: process.uptime()
	});
});

// 👉 ВАЖНО: для React Router
app.get('/royter', (req, res) => {
	res.sendFile(path.join(__dirname, 'clerk-react/dist/index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
	console.log(`Server töötab pordil ${PORT}`);
});
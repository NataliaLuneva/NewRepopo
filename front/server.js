const express = require('express');
const app = express();

const PORT = process.env.port || 3000;

app.get('/health', (req, res) = {
	res.status(200).json({
		status: 'ok',
		message: 'Rakendus tootab!',
		uptime: process.uptime()
	});
});

app.listen(PORT, '0.0.0.0', () => {
	console.log('Server tootab pordi ${PORT}');
});
// Нам больше не нужен require('axios'), используем встроенный fetch!

// Безопасное получение токена без "засвета" в коде
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;

async function getBitcoinPrice() {
    try {
        // Получаем курс в евро
        const url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur";
        const response = await fetch(url);
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        return data.bitcoin.eur;
    } catch (error) {
        console.error(`[ERROR] service=btc-bot API timeout or error: ${error.message}`);
        return null;
    }
}

async function sendToDiscord(price) {
    if (!WEBHOOK_URL) {
        console.error("[ERROR] service=btc-bot Webhook URL is missing! Define variable.");
        return;
    }

    // Формируем сообщение
    const msg = {
        content: `📈 **Bitcoin radar for Estonia**\nCurrent course: **${price} EUR**`
    };

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msg)
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        console.log(`[INFO] service=btc-bot BTC: ${price} EUR. Sent to Discord.`);
    } catch (error) {
        console.error(`[ERROR] service=btc-bot Discord Error: ${error.message}`);
    }
}

async function main() {
    console.log("[INFO] service=btc-bot Cron job started.");
    const btcPrice = await getBitcoinPrice();
    
    if (btcPrice) {
        await sendToDiscord(btcPrice);
    }
}

// Запуск
main();

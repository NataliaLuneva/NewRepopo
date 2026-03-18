// --- ЛОГИКА ПОКУПКИ ЧЕРЕЗ STRIPE ---
app.post('/purchase', async (req, res) => {
    try {
        const item = await pb.collection('inventory').getOne(req.body.id);
        
        // Получаем базовый URL твоего сайта (например, http://176.112.158.3:3000)
        const protocol = req.protocol;
        const host = req.get('http://q4vrdaww4pxl853s04ou3wty.176.112.158.3.sslip.io/');
        const baseUrl = `${protocol}://${host}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: item.device },
                    unit_amount: Math.round(item.price * 100), 
                },
                quantity: 1,
            }],
            mode: 'payment',
            // ИСПОЛЬЗУЕМ ДИНАМИЧЕСКИЙ URL ВМЕСТО LOCALHOST
            success_url: `${baseUrl}/?status=success`,
            cancel_url: `${baseUrl}/?status=cancel`,
            metadata: { itemId: item.id }
        });

        res.redirect(303, session.url);
    } catch (e) { 
        console.error("Stripe Error:", e);
        res.status(500).send("Ошибка Stripe: " + e.message); 
    }
});

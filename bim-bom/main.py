import os
import requests
from dotenv import load_dotenv

# Загружаем переменные из .env (только для локального запуска)
load_dotenv()

def run_bot():
    # 1. Получаем настройки из переменных окружения
    webhook_url = os.environ.get('DISCORD_WEBHOOK')
    api_url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur"

    if not webhook_url:
        print("[ERROR] service=btcbot Discord Webhook URL не найден!")
        return

    print("[INFO] service=btcbot Скрипт запущен.")

    try:
        # 2. Получаем данные о курсе
        response = requests.get(api_url, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        price = data["bitcoin"]["eur"]
        
        # 3. Формируем сообщение
        message = {
            "content": f"₿ **Bitcoin Update**\nТекущий курс: `{price}` EUR"
        }
        
        # 4. Отправляем в Discord через POST-запрос
        res = requests.post(webhook_url, json=message)
        
        if res.status_code == 204:
            print(f"[INFO] service=btcbot BTC: {price} EUR. Сообщение отправлено.")
        else:
            print(f"[ERROR] service=btcbot Discord ответил ошибкой: {res.status_code}")

    except Exception as e:
        print(f"[ERROR] service=btcbot Произошла ошибка: {e}")

if __name__ == "__main__":
    run_bot()
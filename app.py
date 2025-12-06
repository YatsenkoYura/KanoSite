import re
from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import markdown
import html

# Импортируем логику из main.py
# Нам больше не нужен get_system_dataframe для Plotly в app.py
from main import process_user_query, initialize_system_once

app = Flask(__name__)
CORS(app)

# Инициализируем систему при запуске
initialize_system_once()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/chat', methods=['POST'])
def chat():
    try:
        data = request.get_json()
        user_message = data.get('message')
        chat_id = data.get('chat_id', 'web_user')

        print(f"📩 Сообщение: {user_message}")

        # 1. Получаем полный ответ от main.py
        # main.py теперь сам генерирует картинку и возвращает её в Base64 внутри текста
        ai_response_full = process_user_query(user_message, chat_id)

        plot_data = None
        clean_text_response = ai_response_full

        # 2. Ищем тег [IMAGE_BASE64]
        # Регулярка ищет контент между тегами
        img_tag_pattern = r'\[IMAGE_BASE64\](.*?)\[/IMAGE_BASE64\]'
        match = re.search(img_tag_pattern, ai_response_full, re.DOTALL)

        if match:
            # Извлекаем строку Base64
            base64_str = match.group(1).strip()

            # Формируем объект для фронтенда
            plot_data = {
                'type': 'png',  # Указываем тип PNG
                'data': base64_str
            }

            # Удаляем тег из текстового ответа, чтобы пользователь не видел абракадабру
            clean_text_response = re.sub(img_tag_pattern, '', ai_response_full).strip()
            print("✅ График Matplotlib (PNG) успешно извлечен.")

        # 3. Конвертация Markdown в HTML для красивого текста
        try:
            escaped_text = html.escape(clean_text_response)
            response_html = markdown.markdown(
                escaped_text,
                extensions=['fenced_code', 'tables', 'nl2br']
            )
            # Фикс двойного экранирования тегов, которое иногда делает markdown
            response_html = response_html.replace('&lt;b&gt;', '<b>').replace('&lt;/b&gt;', '</b>')
            response_html = response_html.replace('&lt;strong&gt;', '<strong>').replace('&lt;/strong&gt;', '</strong>')
            response_html = response_html.replace('&lt;i&gt;', '<i>').replace('&lt;/i&gt;', '</i>')
        except Exception as e:
            print(f"⚠️ Ошибка Markdown: {e}")
            response_html = clean_text_response

        return jsonify({
            'response': response_html,
            'raw_text': clean_text_response,
            'plot': plot_data,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"❌ Server Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
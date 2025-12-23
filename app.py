from datetime import datetime
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import markdown
import html
import traceback

from main import process_user_query, initialize_system_once

app = Flask(__name__)
CORS(app)

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

        print(f"📩 Сообщение от юзера: {user_message}")

        # 1. Получаем СТРУКТУРИРОВАННЫЙ ответ от main.py
        # main_pro.py возвращает словарь: {'type': '...', 'text/response': '...', 'plot': ...}
        agent_response = process_user_query(user_message, chat_id)
        
        # Переменные для формирования ответа
        clean_text_response = ""
        plot_payload = None
        
        # 2. Разбираем ответ в зависимости от типа (PLOT vs TEXT/ANALYSIS)
        response_type = agent_response.get('type', 'text')
        
        if response_type == 'plot':
            # Если агент вернул график
            clean_text_response = agent_response.get('response', '') # В main_pro используется ключ 'response' для текста с графиком
            plot_payload = agent_response.get('plot') # Это словарь {'type': 'plotly', 'data': ...}
            print("✅ Обнаружен график Plotly")
            
        elif response_type == 'error':
            # Если вернулась ошибка
            clean_text_response = agent_response.get('text', 'Произошла неизвестная ошибка')
            print("⚠️ Агент вернул ошибку")
            
        else:
            # Обычный текстовый ответ (analysis, web_search, offtop)
            clean_text_response = agent_response.get('text', '')

        # 3. Конвертация Markdown в HTML для красивого отображения
        try:
            # Экранируем HTML теги, чтобы не сломать верстку, но разрешаем Markdown
            # (Если агент возвращает таблицы, markdown их обработает)
            response_html = markdown.markdown(
                clean_text_response,
                extensions=['fenced_code', 'tables', 'nl2br']
            )
        except Exception as e:
            print(f"⚠️ Ошибка Markdown конвертации: {e}")
            response_html = clean_text_response

        # 4. Формируем JSON для фронтенда
        # Структура соответствует тому, что ждет script.js (renderPlot)
        return jsonify({
            'response': response_html,           # HTML текст для вывода в пузырь сообщений
            'raw_text': clean_text_response,     # Сырой текст (на всякий случай)
            'plot': plot_payload,                # Объект графика или None
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        print(f"❌ Server Error: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


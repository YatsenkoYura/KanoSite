

## Требования
* **Python 3.11** с pip

## Установка
0. Репозиторий и подготовка
   ```bash
   git clone https://github.com/YatsenkoYura/KanoSite.git
   cd KanoShite
   7z x data/db.7z -odata/
   cp .env.example .env
   ```
   Заполнить в .env строчку с ключом openrouter
   
2. Рекомендуется создать и активировать виртуальное окружение:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # Для Linux/macOS
   # venv\Scripts\activate   # Для Windows
   ```
3. Установите зависимости:
   ```bash
   pip install -r requirements.txt
   ```

4. Запуск

```bash
python3 app.py
```
### Сайт запустится на 5000 порту!
### Места на диске под сайт и бот должно быть лучше под 25 гигов минимум

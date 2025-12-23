import os
import json
import re
import io
import contextlib
import pandas as pd
import numpy as np
import plotly.express as px
import plotly.graph_objects as go
import plotly.io as pio
from typing import Dict, Any, Optional, List, Literal, Annotated
from datetime import datetime
from dataclasses import dataclass

# ============= LangChain & LangGraph =============
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import create_react_agent
from langgraph.errors import GraphRecursionError
import config
from sqlalchemy import create_engine

# ============= CONFIG & DATA LOADING =============
cf = config.Config()
API_KEY = cf.OPENROUTER_API_KEY
BASE_URL = "https://openrouter.ai/api/v1"

# Глобальная переменная для DataFrame
df = None

def load_data() -> pd.DataFrame:
    """Загружает медицинские данные из БД"""
    db_url = os.environ.get("DATABASE_URL")
    
    if not db_url:
        print("⚠️ DATABASE_URL не найдена в ENV, проверяю config.py...")
        raise ValueError("Ошибка: DATABASE_URL не найдена")

    engine = create_engine(db_url)
    try:
        count_query = "SELECT COUNT(*) as cnt FROM main_data_last"
        count_df = pd.read_sql(count_query, engine)
        print(f"✅ Всего строк в таблице: {count_df['cnt'].iloc[0]}")

        full_query = "SELECT * FROM main_data_last"
        full_df = pd.read_sql(full_query, engine)
        print(f"✅ DataFrame загружен: {len(full_df)} строк, {len(full_df.columns)} колонок")
        return full_df
    except Exception as e:
        print(f"❌ Ошибка загрузки данных: {e}")
        return pd.DataFrame() 
    finally:
        engine.dispose()

# Загружаем данные при импорте
try:
    df = load_data()
except Exception as e:
    print(f"CRITICAL: Не удалось загрузить данные при старте: {e}")
    df = pd.DataFrame()

# ==============================================================================
# 🔥 ИНСТРУМЕНТЫ (Tools)
# ==============================================================================

@tool("create_top_chart_automated")
def create_top_chart_automated(column_name: str, limit: int = 10, title: str = "Top Chart") -> str:
    """
    ⭐ ТОП-N диаграмма (горизонтальные столбцы)
    Используй: "Топ-10 диагнозов", "Самые частые препараты", "ТОП болезни"
    """
    try:
        if column_name not in df.columns:
            return json.dumps({"error": f"Колонка '{column_name}' не найдена", "type": "error"}, ensure_ascii=False)
        
        col_data = df[column_name].dropna().astype(str).str.strip()
        col_data = col_data[col_data != '']
        
        if len(col_data) == 0:
            return json.dumps({"error": f"Колонка '{column_name}' пустая", "type": "error"}, ensure_ascii=False)
        
        value_counts_result = col_data.value_counts().head(limit)
        top_data_sorted = value_counts_result.sort_values(ascending=True)

        # Подготовка данных для Plotly
        y_values = [str(x) for x in top_data_sorted.index]
        x_values = list(top_data_sorted.values)
        
        fig = go.Figure(go.Bar(
            x=x_values, 
            y=y_values, 
            orientation='h',
            text=x_values,
            textposition='auto',
            marker=dict(color='#6366f1')
        ))

        fig.update_layout(
            title=title, 
            height=max(400, limit * 40),
            margin=dict(l=10, r=10, t=40, b=10),
            template="plotly_white"
        )
        
        # Легенда текстом
        legend_lines = []
        for rank, (name, count) in enumerate(zip(reversed(y_values), reversed(x_values)), 1):
            legend_lines.append(f"**#{rank}**: {name} — {count}")
            
        legend_text = "### 📋 Расшифровка:\n" + "\n".join(legend_lines)

        stats = {
            "total_viewed": int(sum(x_values)),
            "top_item": y_values[-1],
            "top_value": int(x_values[-1])
        }

        return json.dumps({
            "type": "plotly", 
            "data": json.loads(pio.to_json(fig)), 
            "legend": legend_text, 
            "stats": stats
        }, ensure_ascii=False)

    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("create_pie_chart")
def create_pie_chart(column_name: str, limit: int = 8, title: str = "Distribution") -> str:
    """🥧 Круговая диаграмма - показывает распределение по категориям"""
    try:
        if column_name not in df.columns:
            return json.dumps({"error": "Колонка не найдена", "type": "error"}, ensure_ascii=False)
            
        col_data = df[column_name].dropna().astype(str).str.strip()
        col_data = col_data[col_data != '']
        
        value_counts = col_data.value_counts().head(limit)
        labels = list(value_counts.index)
        values = list(value_counts.values)

        fig = go.Figure(data=[go.Pie(labels=labels, values=values, hole=.3)])
        fig.update_layout(title=title, height=400)

        return json.dumps({
            "type": "plotly",
            "data": json.loads(pio.to_json(fig)),
            "legend": f"Топ категория: {labels[0]} ({values[0]})",
            "stats": {"total": int(sum(values))}
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("create_box_plot")
def create_box_plot(numeric_column: str, group_by: Optional[str] = None, title: str = "Distribution") -> str:
    """📦 Box Plot - показывает распределение, медиану, выбросы"""
    try:
        if numeric_column not in df.columns:
            return json.dumps({"error": "Колонка не найдена", "type": "error"}, ensure_ascii=False)

        local_df = df.copy()
        local_df[numeric_column] = pd.to_numeric(local_df[numeric_column], errors='coerce')
        local_df = local_df.dropna(subset=[numeric_column])

        if len(local_df) == 0:
            return json.dumps({"error": "Нет числовых данных", "type": "error"}, ensure_ascii=False)

        if group_by and group_by in df.columns:
            fig = px.box(local_df, x=group_by, y=numeric_column, title=title)
        else:
            fig = px.box(local_df, y=numeric_column, title=title)
            
        fig.update_layout(height=500)
        
        return json.dumps({
            "type": "plotly",
            "data": json.loads(pio.to_json(fig)),
            "stats": {
                "mean": float(local_df[numeric_column].mean()),
                "median": float(local_df[numeric_column].median()),
                "min": float(local_df[numeric_column].min()),
                "max": float(local_df[numeric_column].max())
            }
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("analyze_pareto")
def analyze_pareto(numeric_column: str, group_by_column: str, limit: int = 10) -> str:
    """📊 Парето диаграмма - анализ 80/20"""
    try:
        if numeric_column not in df.columns or group_by_column not in df.columns:
            return json.dumps({"error": "Колонки не найдены", "type": "error"}, ensure_ascii=False)

        local_df = df.copy()
        local_df[numeric_column] = pd.to_numeric(local_df[numeric_column], errors='coerce')
        local_df = local_df.dropna(subset=[numeric_column, group_by_column])

        grouped = local_df.groupby(group_by_column)[numeric_column].sum().sort_values(ascending=False).head(limit)
        cumsum = grouped.cumsum()
        total = grouped.sum()
        cumperc = 100 * cumsum / total

        fig = go.Figure()
        fig.add_trace(go.Bar(x=list(grouped.index), y=list(grouped.values), name='Сумма', marker=dict(color='#6366f1')))
        fig.add_trace(go.Scatter(x=list(grouped.index), y=list(cumperc), name='Накопл. %', yaxis='y2', mode='lines+markers', line=dict(color='red', width=3)))

        fig.update_layout(
            title="Анализ Парето",
            yaxis=dict(title='Сумма'),
            yaxis2=dict(title='Накопленный %', overlaying='y', side='right', range=[0, 110]),
            height=500
        )

        return json.dumps({
            "type": "plotly",
            "data": json.loads(pio.to_json(fig)),
            "stats": {"total": float(total), "80_percent_items": len(grouped[cumperc <= 80])}
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("create_grouped_comparison")
def create_grouped_comparison(primary_column: str, group_column: str, limit: int = 5) -> str:
    """🔀 Сравнение по группам"""
    try:
        if primary_column not in df.columns or group_column not in df.columns:
            return json.dumps({"error": "Колонки не найдены", "type": "error"}, ensure_ascii=False)

        top_primary = df[primary_column].value_counts().head(limit).index
        local_df = df[df[primary_column].isin(top_primary)].copy()
        local_df[group_column] = local_df[group_column].astype(str)

        grouped = local_df.groupby([primary_column, group_column]).size().reset_index(name='count')
        fig = px.bar(grouped, x=primary_column, y='count', color=group_column, barmode='group', title="Сравнение по группам")
        fig.update_layout(height=500)

        return json.dumps({
            "type": "plotly",
            "data": json.loads(pio.to_json(fig))
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("create_histogram")
def create_histogram(numeric_column: str, bins: int = 30) -> str:
    """📊 Гистограмма"""
    try:
        if numeric_column not in df.columns:
            return json.dumps({"error": "Колонка не найдена", "type": "error"}, ensure_ascii=False)

        local_df = df.copy()
        local_df[numeric_column] = pd.to_numeric(local_df[numeric_column], errors='coerce')
        local_df = local_df.dropna(subset=[numeric_column])

        if len(local_df) == 0:
            return json.dumps({"error": "Нет данных", "type": "error"}, ensure_ascii=False)

        fig = px.histogram(local_df, x=numeric_column, nbins=bins, title="Распределение")
        fig.update_layout(height=500)

        return json.dumps({
            "type": "plotly",
            "data": json.loads(pio.to_json(fig))
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("create_heatmap")
def create_heatmap(row_column: str, col_column: str, limit: int = 10) -> str:
    """🔥 Тепловая карта"""
    try:
        if row_column not in df.columns or col_column not in df.columns:
            return json.dumps({"error": "Колонки не найдены", "type": "error"}, ensure_ascii=False)

        pivot = pd.crosstab(df[row_column], df[col_column])
        pivot = pivot.iloc[:limit, :limit]

        fig = go.Figure(data=go.Heatmap(z=pivot.values, x=pivot.columns, y=pivot.index, colorscale='Blues'))
        fig.update_layout(title="Тепловая карта", height=500)

        return json.dumps({
            "type": "plotly",
            "data": json.loads(pio.to_json(fig))
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("create_scatter_plot")
def create_scatter_plot(x_column: str, y_column: str) -> str:
    """📈 Scatter Plot - корреляция"""
    try:
        if x_column not in df.columns or y_column not in df.columns:
            return json.dumps({"error": "Колонки не найдены", "type": "error"}, ensure_ascii=False)

        local_df = df.copy()
        local_df[x_column] = pd.to_numeric(local_df[x_column], errors='coerce')
        local_df[y_column] = pd.to_numeric(local_df[y_column], errors='coerce')
        local_df = local_df.dropna(subset=[x_column, y_column])

        if len(local_df) == 0:
            return json.dumps({"error": "Нет числовых данных", "type": "error"}, ensure_ascii=False)

        fig = px.scatter(local_df, x=x_column, y=y_column, title="Корреляция")
        fig.update_layout(height=500)

        corr = local_df[x_column].corr(local_df[y_column])

        return json.dumps({
            "type": "plotly",
            "data": json.loads(pio.to_json(fig)),
            "stats": {"correlation": float(corr)}
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e), "type": "error"}, ensure_ascii=False)

@tool("get_unique_values")
def get_unique_values(column_name: str, search_term: Optional[str] = None) -> str:
    """Получить уникальные значения в колонке"""
    try:
        if column_name not in df.columns:
            return f"Ошибка: Колонка {column_name} не найдена"

        values = df[column_name].dropna().astype(str).unique()[:30]

        if search_term:
            filtered = [v for v in values if search_term.lower() in v.lower()]
            return json.dumps({"found": filtered[:20], "total_matches": len(filtered)}, ensure_ascii=False)

        return json.dumps({
            "values": list(values),
            "total_unique": len(df[column_name].unique())
        }, ensure_ascii=False)
    except Exception as e:
        return str(e)

@tool("get_dataframe_info")
def get_dataframe_info() -> str:
    """Информация о DataFrame"""
    buffer = io.StringIO()
    df.info(buf=buffer)
    return buffer.getvalue()

# ==============================================================================
# MEDICAL DATA AGENT
# ==============================================================================

class MedicalDataAgent:
    def __init__(self, df: pd.DataFrame, api_key: str):
        self.df = df
        self.api_key = api_key
        self.base_url = BASE_URL
        
        self.agent_llm = ChatOpenAI(
            model_name="openai/gpt-4o-mini",
            temperature=0.0,
            max_tokens=2048,
            openai_api_key=api_key,
            openai_api_base=self.base_url
        )
        
        self.router_llm = ChatOpenAI(
            model_name="qwen/qwen-2.5-72b-instruct",
            temperature=0.0,
            openai_api_key=api_key,
            openai_api_base=self.base_url
        )

        self.web_search_llm = ChatOpenAI(
            model_name="perplexity/sonar-reasoning",
            temperature=0.1,
            openai_api_key=api_key,
            openai_api_base=self.base_url
        )
        
        # Список инструментов
        self.tools = [
            create_top_chart_automated,
            create_pie_chart,
            create_box_plot,
            analyze_pareto,
            create_grouped_comparison,
            create_histogram,
            create_heatmap,
            create_scatter_plot,
            get_unique_values,
            get_dataframe_info
        ]

        self.agent = create_react_agent(
            model=self.agent_llm,
            tools=self.tools,
            prompt=self._get_system_prompt()
        )

        self.columns_info = {
            'код_диагноза': 'Код диагноза по МКБ',
            'код_препарата': 'Код назначенного препарата',
            'id_пациента': 'ID пациента',
            'пол': 'Пол пациента (М/Ж)',
            'название_диагноза': 'Название заболевания',
            'класс_заболевания': 'Класс заболевания',
            'Торговое название': 'Коммерческое название препарата',
            'стоимость': 'Стоимость препарата',
            'возраст_человека': 'Возраст пациента',
        }

    def _get_system_prompt(self) -> str:
        return """🏥 Ассистент анализа медицинских данных
        
**🎯 ВЫБОР ИНСТРУМЕНТА:**

1️⃣ **ТОП-10, ПОПУЛЯРНЫЕ** → `create_top_chart_automated`
2️⃣ **КАК РАСПРЕДЕЛЯЕТСЯ, ДОЛЯ** → `create_pie_chart`
3️⃣ **РАСПРЕДЕЛЕНИЕ, ВЫБРОСЫ** → `create_box_plot`
4️⃣ **ГДЕ ТЕРЯЮТСЯ ДЕНЬГИ, 80/20** → `analyze_pareto`
5️⃣ **СРАВНИ М vs Ж, ПО ГРУППАМ** → `create_grouped_comparison`
6️⃣ **РАСПРЕДЕЛЕНИЕ ЧИСЕЛ** → `create_histogram`
7️⃣ **ТАБЛИЦА ПЕРЕСЕЧЕНИЙ** → `create_heatmap`
8️⃣ **КОРРЕЛЯЦИЯ, СВЯЗЬ X vs Y** → `create_scatter_plot`

**⭐ КРИТИЧНЫЕ ПРАВИЛА:**
✅ Выбирай инструмент по типу вопроса
✅ Доверяй инструментам - они работают с реальными данными
✅ Возвращай JSON от инструмента
✅ Отвечай на РУССКОМ
❌ НЕ пиши Python код
❌ НЕ придумывай цифры
"""

    def _determine_intent(self, question: str, dialog_context: str = "") -> str:
        """Определение типа запроса"""
        keywords_plot = ["график", "топ", "диаграмм", "визуали", "таблица", "распредел", "анализ"]
        
        if any(kw in question.lower() for kw in keywords_plot):
            return "PLOT"
        
        return "ANALYSIS"

    def query(self, question: str, dialog_history: str = "", chat_id: str = None) -> Dict[str, Any]:
        print(f"\n{'🚀 PROCESSING':=^60}")
        print(f"📝 Question: {question}")
        
        try:
            intent = self._determine_intent(question, dialog_history)
            print(f"🎯 Intent: {intent}")
            
            if intent == "PLOT":
                context_prompt = f"""User Request: {question}

Available Columns: {json.dumps(self.columns_info, ensure_ascii=False)}

Dialog Context: {dialog_history}
"""
                
                try:
                    result = self.agent.invoke(
                        {"messages": [
                            SystemMessage(content=self._get_system_prompt()), 
                            HumanMessage(content=context_prompt)
                        ]},
                        config={"recursion_limit": 30}
                    )
                    
                    messages = result["messages"]
                    return self._process_plot_response(messages, chat_id)
                    
                except GraphRecursionError:
                    print("⚠️ Recursion limit reached")
                    return {
                        "type": "error",
                        "text": "⚠️ Слишком сложный запрос. Попробуйте упростить.",
                        "chat_id": chat_id
                    }
            
            else:
                # Обычный текстовый анализ
                return {
                    "type": "text", 
                    "text": f"Вот анализ вашего запроса: {question}", 
                    "chat_id": chat_id
                }

        except Exception as e:
            print(f"❌ Error: {str(e)}")
            import traceback
            traceback.print_exc()
            return {
                "type": "error", 
                "text": f"Системная ошибка: {str(e)}", 
                "chat_id": chat_id
            }

    def _process_plot_response(self, messages: List[Any], chat_id: str) -> Dict[str, Any]:
        """Ищет JSON от тулов в истории сообщений"""
        final_text = messages[-1].content if messages else "Готово"
        plot_data = None
        
        # Проходим с конца, ищем ToolMessage
        for msg in reversed(messages):
            if isinstance(msg, ToolMessage):
                try:
                    content = msg.content.strip()
                    
                    # ИСПРАВЛЕННЫЙ БЛОК ПАРСИНГА
                    if "```json" in content:
                        # Берем то, что между ```json и ```
                        parts = content.split("```json")
                        if len(parts) > 1:
                            content = parts[1].split("```")[0].strip()
                    elif "```" in content:
                        # Просто удаляем тройные кавычки
                        content = content.replace("```", "").strip()

                    tool_output = json.loads(content)
                    
                    if tool_output.get("type") == "plotly":
                        plot_data = tool_output
                        # Если есть легенда, добавляем её к тексту
                        if "legend" in tool_output:
                            final_text = tool_output["legend"] + "\n\n" + final_text
                        # Если есть статистика
                        if "stats" in tool_output:
                            stats_text = "\n\n**📊 Статистика:**\n"
                            for key, value in tool_output["stats"].items():
                                if isinstance(value, float):
                                    stats_text += f"- {key}: {value:.2f}\n"
                                else:
                                    stats_text += f"- {key}: {value}\n"
                            final_text += stats_text
                        break
                except Exception as e:
                    print(f"⚠️ JSON parsing error in ToolMessage: {e}")
                    continue

        if plot_data:
            return {
                "type": "plot",
                "response": final_text, 
                "plot": plot_data, 
                "chat_id": chat_id
            }
            
        return {"type": "text", "text": final_text, "chat_id": chat_id}


# ==============================================================================
# 🔌 МОСТ ДЛЯ FLASK (APP.PY)
# ==============================================================================

# Глобальный экземпляр агента
system_agent = None

def initialize_system_once():
    """Инициализация агента (вызывается из app.py при старте)"""
    global system_agent, df
    if system_agent is None:
        print("⚙️ Инициализация системы...")
        if df is None or df.empty:
            df = load_data()
        
        system_agent = MedicalDataAgent(df=df, api_key=API_KEY)
        print("✅ Агент инициализирован!")

def process_user_query(message: str, chat_id: str) -> Dict[str, Any]:
    """Точка входа для app.py - обрабатывает запрос пользователя"""
    global system_agent
    
    # Если вдруг не инициализирован
    if system_agent is None:
        initialize_system_once()
        
    # Запускаем обработку и возвращаем структурированный результат
    return system_agent.query(message, chat_id=chat_id)

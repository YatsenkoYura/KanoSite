# config.py
import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Flask
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    DEBUG = os.getenv('DEBUG', 'True').lower() in ['true', '1', 't']

    # AI/LLM
    OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
    MODEL_NAME = os.getenv('MODEL_NAME', 'Qwen/Qwen3-Next-80B-A3B-Instruct')
    EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-m3')

    # Database
    SQLITE_DB_PATH = os.getenv('SQLITE_DB_PATH', 'data/database_novec.db')
    CHROMA_DB_PATH = os.getenv('CHROMA_DB_PATH', 'data/chroma_db')

    # Paths
    CHAT_HISTORY_DIR = os.getenv('CHAT_HISTORY_DIR', 'data/chat_history')

    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        if not cls.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is required")
        return True
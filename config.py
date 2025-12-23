import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    OPENROUTER_API_KEY = os.getenv('OPENROUTER_API_KEY', '')
    MODEL_NAME = os.getenv('MODEL_NAME', 'Qwen/Qwen3-Next-80B-A3B-Instruct')
    EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-m3')
    CHROMA_DB_PATH = os.getenv('CHROMA_DB_PATH', 'data/chroma_db')

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        if not cls.OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is required")
        return True

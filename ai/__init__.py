"""
AI 모듈
카드 기반 AI 학습 시스템
"""

from .card_based_ai import CardBasedAI

# RLSystem은 선택적으로 import (파일이 없을 수 있음)
try:
    from .rl_system import RLSystem
    __all__ = ['CardBasedAI', 'RLSystem']
except ImportError:
    # RLSystem 모듈이 없는 경우
    RLSystem = None
    __all__ = ['CardBasedAI']

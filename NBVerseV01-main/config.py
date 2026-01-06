"""
NBverse 설정 관리 모듈
"""

import os
import json
from typing import Optional


class NBverseConfig:
    """NBverse 설정 클래스"""
    
    DEFAULT_CONFIG = {
        'decimal_places': 10,
        'bit_default': 5.5,
        'data_dir': 'novel_ai/v1.0.7/data',
        'count': 150,
        'cont': 20
    }
    
    def __init__(self, config_file: str = 'nbverse_config.json'):
        """
        초기화
        
        Args:
            config_file: 설정 파일 경로
        """
        self.config_file = config_file
        self.config = self.DEFAULT_CONFIG.copy()
        self.load()
    
    def load(self):
        """설정 파일에서 로드"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    loaded_config = json.load(f)
                    self.config.update(loaded_config)
        except Exception as e:
            print(f"설정 파일 로드 오류: {e}")
    
    def save(self):
        """설정 파일에 저장"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"설정 파일 저장 오류: {e}")
            return False
    
    def get(self, key: str, default=None):
        """설정 값 가져오기"""
        return self.config.get(key, default)
    
    def set(self, key: str, value):
        """설정 값 설정"""
        self.config[key] = value
    
    def set_decimal_places(self, decimal_places: int):
        """소수점 자리수 설정"""
        if decimal_places < 0 or decimal_places > 20:
            raise ValueError("소수점 자리수는 0~20 사이여야 합니다.")
        self.set('decimal_places', decimal_places)
        self.save()
    
    def get_decimal_places(self) -> int:
        """소수점 자리수 가져오기"""
        return self.get('decimal_places', 10)
    
    def set_data_dir(self, data_dir: str):
        """데이터 디렉토리 설정"""
        self.set('data_dir', data_dir)
        self.save()
    
    def get_data_dir(self) -> str:
        """데이터 디렉토리 가져오기"""
        return self.get('data_dir', 'novel_ai/v1.0.7/data')
    
    def get_bit_default(self) -> float:
        """기본 비트 값 가져오기"""
        return self.get('bit_default', 5.5)
    
    def set_bit_default(self, bit: float):
        """기본 비트 값 설정"""
        self.set('bit_default', bit)
        self.save()


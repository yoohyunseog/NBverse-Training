"""설정 관리자 모듈"""
import os
import json


class SettingsManager:
    """설정 관리 클래스"""
    def __init__(self, settings_file="data/settings.json"):
        self.settings_file = settings_file
        self.settings = {
            "min_buy_amount": 5000,
            "fee_rate": 0.1,
            "update_cycle_seconds": 25,  # 전체 프로세스 업데이트 주기 (초)
            "production_timeframes": ["1m", "3m", "5m", "15m", "30m", "60m", "1d"],  # 생산 가능한 타임프레임 목록
            "nb_decimal_places": 10,  # N/B 값 소수점 자리수
            "production_card_limit": 0,  # 생산 카드 제한 (0이면 제한 없음)
            "chart_animation_interval_ms": 1000  # 차트 애니메이션 순회 주기 (밀리초, 기본값 1초)
        }
        self.load()
    
    def load(self):
        """설정 로드"""
        try:
            os.makedirs(os.path.dirname(self.settings_file), exist_ok=True)
            if os.path.exists(self.settings_file):
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.settings.update(data)
        except Exception as e:
            print(f"설정 로드 오류: {e}")
    
    def save(self, background: bool = True):
        """
        설정 저장
        
        Args:
            background: True이면 백그라운드 스레드에서 실행 (기본값: True)
        """
        if background:
            # 백그라운드 스레드에서 실행
            import threading
            
            def save_in_background():
                try:
                    os.makedirs(os.path.dirname(self.settings_file), exist_ok=True)
                    settings_copy = self.settings.copy()  # 복사본 사용 (스레드 안전)
                    with open(self.settings_file, 'w', encoding='utf-8') as f:
                        json.dump(settings_copy, f, ensure_ascii=False, indent=2)
                except Exception as e:
                    print(f"설정 저장 오류: {e}")
            
            thread = threading.Thread(target=save_in_background, daemon=True)
            thread.start()
        else:
            # 동기 실행
            try:
                os.makedirs(os.path.dirname(self.settings_file), exist_ok=True)
                with open(self.settings_file, 'w', encoding='utf-8') as f:
                    json.dump(self.settings, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"설정 저장 오류: {e}")
    
    def get(self, key, default=None):
        """설정 값 가져오기"""
        return self.settings.get(key, default)
    
    def set(self, key, value):
        """설정 값 저장"""
        self.settings[key] = value
        self.save()


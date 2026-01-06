"""가격 캐시 서비스 모듈 - 모든 카드가 공유하는 중앙 가격 캐시"""
from PyQt6.QtCore import QObject, pyqtSignal, QTimer
from typing import List, Callable
import pyupbit


class PriceCacheService(QObject):
    """가격 캐시 서비스 (싱글톤)"""
    _instance = None
    price_updated = pyqtSignal(float)  # 가격 업데이트 시그널
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        super().__init__()
        self._initialized = True
        
        self._cached_price = 0.0
        self._price_callbacks: List[Callable[[float], None]] = []
        self._update_timer = QTimer()
        self._update_timer.timeout.connect(self._update_price)
        self._is_updating = False
        
        # 가격 업데이트 주기 (15초 - 성능 최적화, API 호출 감소)
        self._update_interval = 15000
        
        # 시그널 연결
        self.price_updated.connect(self._notify_callbacks)
    
    def start(self, interval_ms: int = 15000):
        """가격 업데이트 시작"""
        self._update_interval = interval_ms
        if not self._update_timer.isActive():
            self._update_timer.start(interval_ms)
            # 즉시 한 번 업데이트
            self._update_price()
    
    def stop(self):
        """가격 업데이트 중지"""
        if self._update_timer.isActive():
            self._update_timer.stop()
    
    def get_price(self) -> float:
        """현재 캐시된 가격 반환"""
        return self._cached_price
    
    def register_callback(self, callback: Callable[[float], None]):
        """가격 업데이트 콜백 등록"""
        if callback not in self._price_callbacks:
            self._price_callbacks.append(callback)
            # 등록 시 즉시 현재 가격 전달
            if self._cached_price > 0:
                try:
                    callback(self._cached_price)
                except Exception as e:
                    print(f"가격 콜백 실행 오류: {e}")
    
    def unregister_callback(self, callback: Callable[[float], None]):
        """가격 업데이트 콜백 제거"""
        if callback in self._price_callbacks:
            self._price_callbacks.remove(callback)
    
    def _update_price(self):
        """가격 업데이트 (API 호출)"""
        if self._is_updating:
            return  # 이미 업데이트 중이면 스킵
        
        try:
            self._is_updating = True
            price = pyupbit.get_current_price("KRW-BTC")
            if price is not None:
                new_price = float(price)
                if new_price > 0 and new_price != self._cached_price:
                    self._cached_price = new_price
                    # 시그널로 모든 콜백에 알림
                    self.price_updated.emit(new_price)
        except Exception as e:
            print(f"가격 업데이트 오류: {e}")
        finally:
            self._is_updating = False
    
    def _notify_callbacks(self, price: float):
        """모든 등록된 콜백에 가격 전달 (성능 최적화)"""
        # 콜백 리스트 복사 (콜백 실행 중 리스트 변경 방지)
        callbacks = self._price_callbacks[:]
        
        # 직접 호출 (QTimer.singleShot은 오히려 오버헤드가 더 큼)
        for callback in callbacks:
            try:
                callback(price)
            except Exception as e:
                print(f"가격 콜백 실행 오류: {e}")


# 싱글톤 인스턴스 접근 함수
def get_price_cache_service() -> PriceCacheService:
    """가격 캐시 서비스 인스턴스 반환"""
    return PriceCacheService()


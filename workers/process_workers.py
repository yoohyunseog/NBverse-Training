"""프로세스 업데이트 워커 클래스"""
from PyQt6.QtCore import QThread, pyqtSignal
import time


class ProcessUpdateWorker(QThread):
    """전체 프로세스를 백그라운드에서 실행하는 워커 스레드"""
    step_completed = pyqtSignal(int, str)  # 단계 완료 시그널 (진행률, 메시지)
    price_updated = pyqtSignal(float)  # 가격 업데이트 시그널
    balance_updated = pyqtSignal(dict)  # 자산 정보 업데이트 시그널
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    finished_signal = pyqtSignal()  # 전체 완료 시그널
    
    def __init__(self, upbit, cycle_seconds=25):
        super().__init__()
        self.upbit = upbit
        self.cycle_seconds = cycle_seconds
        self._stop_requested = False
        # 필요한 함수 import
        from utils import get_btc_price, get_all_balances
        self.get_btc_price = get_btc_price
        self.get_all_balances = get_all_balances
    
    def stop(self):
        """워커 중지 요청"""
        self._stop_requested = True
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            if self._stop_requested:
                return
            
            # 0-10%: 가격 정보 업데이트
            self.step_completed.emit(0, "🔄 전체 프로세스 업데이트 시작...")
            time.sleep(self.cycle_seconds * 0.05)  # 5% 지점
            
            if self._stop_requested:
                return
            
            price = self.get_btc_price()
            if price > 0:
                self.price_updated.emit(price)
            self.step_completed.emit(10, "📊 가격 정보 업데이트 중...")
            time.sleep(self.cycle_seconds * 0.15)  # 10% -> 25% 지점
            
            # 25-30%: 자산 정보 업데이트
            if self._stop_requested:
                return
            
            try:
                balances = self.get_all_balances(self.upbit)
                self.balance_updated.emit(balances)
            except Exception as e:
                print(f"자산 정보 업데이트 오류: {e}")
            
            self.step_completed.emit(30, "💰 자산 정보 업데이트 중...")
            time.sleep(self.cycle_seconds * 0.15)  # 30% -> 45% 지점
            
            # 45-50%: 생산 카드 생성 준비
            if self._stop_requested:
                return
            
            self.step_completed.emit(50, "📈 생산 카드 생성 중...")
            time.sleep(self.cycle_seconds * 0.15)  # 50% -> 65% 지점
            
            # 65-70%: 아이템 데이터 업데이트 준비
            if self._stop_requested:
                return
            
            self.step_completed.emit(70, "📦 아이템 데이터 업데이트 중...")
            time.sleep(self.cycle_seconds * 0.1)  # 70% -> 80% 지점
            
            # 80-85%: AI 분석 업데이트
            if self._stop_requested:
                return
            
            self.step_completed.emit(85, "🤖 AI 분석 업데이트 중...")
            time.sleep(self.cycle_seconds * 0.08)  # 85% -> 93% 지점
            
            # 93-95%: 완료 준비
            if self._stop_requested:
                return
            
            self.step_completed.emit(95, "✅ 업데이트 완료 준비 중...")
            time.sleep(self.cycle_seconds * 0.05)  # 95% -> 100% 지점
            
            # 100%: 완료
            if not self._stop_requested:
                self.step_completed.emit(100, "✅ 전체 프로세스 업데이트 완료")
                self.finished_signal.emit()
                
        except Exception as e:
            self.error_occurred.emit(f"전체 프로세스 업데이트 오류: {str(e)}")
            import traceback
            traceback.print_exc()


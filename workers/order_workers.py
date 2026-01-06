"""주문 관련 워커 클래스들"""
from PyQt6.QtCore import QThread, pyqtSignal


class PriceUpdateWorker(QThread):
    """가격 업데이트를 백그라운드에서 실행하는 워커 스레드"""
    price_ready = pyqtSignal(float)  # 가격 준비 완료 시그널
    
    def __init__(self):
        super().__init__()
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            from utils import get_btc_price
            price = get_btc_price()
            if price > 0:
                self.price_ready.emit(price)
        except Exception as e:
            print(f"⚠️ 가격 업데이트 오류: {e}")


class BuyOrderWorker(QThread):
    """매수 주문을 백그라운드에서 실행하는 워커 스레드"""
    order_completed = pyqtSignal(float, float)  # 주문 완료 시그널 (amount_krw, purchase_amount)
    order_failed = pyqtSignal(str)  # 주문 실패 시그널
    
    def __init__(self, upbit, amount_krw, purchase_amount, item_manager):
        super().__init__()
        self.upbit = upbit
        self.amount_krw = amount_krw
        self.purchase_amount = purchase_amount
        self.item_manager = item_manager
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            if not self.upbit:
                self.order_failed.emit("업비트 연결이 없습니다.")
                return
            
            # 매수 주문 실행
            order = self.upbit.buy_market_order("KRW-BTC", int(self.amount_krw))
            if not order:
                self.order_failed.emit("매수 주문에 실패했습니다.")
                return
            
            # 아이템 생성
            self.item_manager.add_item(self.amount_krw, self.purchase_amount, "비트코인")
            self.msleep(100)  # UI 반응성을 위해 대기
            
            # 주문 완료 시그널 발생
            self.order_completed.emit(self.amount_krw, self.purchase_amount)
        except Exception as e:
            self.order_failed.emit(f"매수 중 오류 발생: {e}")


class SellOrderWorker(QThread):
    """매도 주문을 백그라운드에서 실행하는 워커 스레드"""
    order_completed = pyqtSignal(str, float)  # 주문 완료 시그널 (item_id, current_price)
    order_failed = pyqtSignal(str)  # 주문 실패 시그널
    
    def __init__(self, upbit, item_id, sell_amount, current_price):
        super().__init__()
        self.upbit = upbit
        self.item_id = item_id
        self.sell_amount = sell_amount
        self.current_price = current_price
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            if not self.upbit:
                self.order_failed.emit("업비트 연결이 없습니다.")
                return
            
            # 매도 주문 실행
            order = self.upbit.sell_market_order("KRW-BTC", self.sell_amount)
            if not order:
                self.order_failed.emit("매도 주문에 실패했습니다.")
                return
            
            self.msleep(100)  # UI 반응성을 위해 대기
            
            # 주문 완료 시그널 발생 (가격 정보도 함께 전달)
            self.order_completed.emit(self.item_id, self.current_price)
        except Exception as e:
            self.order_failed.emit(f"매도 중 오류 발생: {e}")


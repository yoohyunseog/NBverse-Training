"""데이터 업데이트 관련 워커 클래스들"""
from PyQt6.QtCore import QThread, pyqtSignal


class BalanceUpdateWorker(QThread):
    """잔고 업데이트를 백그라운드에서 실행하는 워커 스레드"""
    balance_ready = pyqtSignal(dict)  # 잔고 준비 완료 시그널
    
    def __init__(self, upbit):
        super().__init__()
        self.upbit = upbit
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            from utils import get_all_balances, get_btc_price
            balances = get_all_balances(self.upbit)
            current_price = get_btc_price()
            
            krw = balances.get("KRW", 0)
            if isinstance(krw, dict):
                krw = krw.get("total", 0)
            krw = float(krw) if krw else 0.0
            
            btc = balances.get("BTC", {})
            if isinstance(btc, dict):
                btc_amount = btc.get("total", 0)
            else:
                btc_amount = 0.0
            
            total_value = krw + (btc_amount * current_price)
            
            self.balance_ready.emit({
                'krw': krw,
                'btc': btc_amount,
                'total_value': total_value,
                'current_price': current_price
            })
        except Exception as e:
            print(f"⚠️ 잔고 업데이트 오류: {e}")


class ItemsUpdateWorker(QThread):
    """아이템 업데이트를 백그라운드에서 실행하는 워커 스레드"""
    items_ready = pyqtSignal(dict)  # 아이템 준비 완료 시그널
    
    def __init__(self, item_manager, settings_manager):
        super().__init__()
        self.item_manager = item_manager
        self.settings_manager = settings_manager
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            from utils import safe_float, get_btc_price
            import numpy as np
            
            # GPU 사용 가능 여부 확인
            GPU_AVAILABLE = False
            USE_GPU = False
            cp = None
            np_gpu = None
            
            try:
                import cupy as cp
                np_gpu = cp
                GPU_AVAILABLE = True
                USE_GPU = self.settings_manager.get("use_gpu", False)
            except ImportError:
                pass
            
            # 아이템 로드
            self.item_manager.load()
            current_price = safe_float(get_btc_price())
            
            # 판매 완료 최고 수익률 계산
            sold_items = self.item_manager.get_sold_items()
            max_sold_profit_percent = 0.0
            if sold_items:
                profit_percents = [item.get('final_profit_loss_percent', 0) for item in sold_items]
                if profit_percents:
                    max_sold_profit_percent = max(profit_percents)
            
            # 활성 아이템
            active_items = self.item_manager.get_active_items()
            
            # 손익이 높은 순서대로 정렬 (GPU 가속)
            if active_items and current_price > 0:
                fee_rate = self.settings_manager.get("fee_rate", 0.1) / 100.0
                
                if GPU_AVAILABLE and USE_GPU and cp is not None and len(active_items) > 10:
                    # GPU로 손익 계산 (대량 데이터 처리 시)
                    try:
                        purchase_prices = np_gpu.array([safe_float(item.get('purchase_price', 0)) for item in active_items], dtype=np_gpu.float32)
                        purchase_amounts = np_gpu.array([safe_float(item.get('purchase_amount', 0)) for item in active_items], dtype=np_gpu.float32)
                        current_values = np_gpu.array([current_price], dtype=np_gpu.float32) * purchase_amounts
                        
                        buy_fees = purchase_prices * (fee_rate / 2)
                        sell_fees = current_values * (fee_rate / 2)
                        purchase_prices_with_fee = purchase_prices + buy_fees
                        current_values_after_fee = current_values - sell_fees
                        profit_losses = current_values_after_fee - purchase_prices_with_fee
                        
                        # GPU에서 정렬 인덱스 계산
                        sorted_indices = np_gpu.argsort(profit_losses)[::-1]  # 내림차순
                        sorted_indices_cpu = np_gpu.asnumpy(sorted_indices)
                        
                        # 정렬된 아이템 리스트 생성
                        active_items = [active_items[i] for i in sorted_indices_cpu]
                        print(f"📊 아이템 정렬 완료 (GPU): 손익이 높은 순서대로 {len(active_items)}개")
                    except Exception as e:
                        print(f"⚠️ GPU 정렬 실패, CPU로 전환: {e}")
                        # CPU로 폴백
                        def calculate_profit_loss(item):
                            purchase_price = safe_float(item.get('purchase_price', 0))
                            purchase_amount = safe_float(item.get('purchase_amount', 0))
                            current_value = current_price * purchase_amount
                            buy_fee = purchase_price * (fee_rate / 2)
                            sell_fee = current_value * (fee_rate / 2)
                            purchase_price_with_fee = purchase_price + buy_fee
                            current_value_after_fee = current_value - sell_fee
                            profit_loss = current_value_after_fee - purchase_price_with_fee
                            return profit_loss
                        
                        active_items = sorted(active_items, key=calculate_profit_loss, reverse=True)
                        print(f"📊 아이템 정렬 완료 (CPU): 손익이 높은 순서대로 {len(active_items)}개")
                else:
                    # CPU 정렬 (소량 데이터 또는 GPU 미사용)
                    def calculate_profit_loss(item):
                        purchase_price = safe_float(item.get('purchase_price', 0))
                        purchase_amount = safe_float(item.get('purchase_amount', 0))
                        current_value = current_price * purchase_amount
                        buy_fee = purchase_price * (fee_rate / 2)
                        sell_fee = current_value * (fee_rate / 2)
                        purchase_price_with_fee = purchase_price + buy_fee
                        current_value_after_fee = current_value - sell_fee
                        profit_loss = current_value_after_fee - purchase_price_with_fee
                        return profit_loss
                    
                    active_items = sorted(active_items, key=calculate_profit_loss, reverse=True)
                    print(f"📊 아이템 정렬 완료: 손익이 높은 순서대로 {len(active_items)}개")
            
            self.items_ready.emit({
                'active_items': active_items,
                'sold_items': sold_items,
                'current_price': current_price,
                'max_sold_profit_percent': max_sold_profit_percent
            })
        except Exception as e:
            print(f"❌ 아이템 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()


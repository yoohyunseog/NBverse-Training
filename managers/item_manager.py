"""아이템 관리자 모듈"""
import os
import json
import random
from datetime import datetime


class ItemManager:
    """아이템 관리 클래스"""
    def __init__(self, data_file="data/bitcoin_items.json"):
        self.data_file = data_file
        self.items = []
        self.load()
    
    def load(self):
        """아이템 로드"""
        try:
            os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
            if os.path.exists(self.data_file):
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.items = data.get('items', [])
                    print(f"✅ 아이템 로드 완료: {len(self.items)}개")
            else:
                self.items = []
        except Exception as e:
            print(f"❌ 아이템 로드 오류: {e}")
            self.items = []
    
    def save(self, background: bool = True):
        """
        아이템 저장
        
        Args:
            background: True이면 백그라운드 스레드에서 실행 (기본값: True)
        """
        if background:
            # 백그라운드 스레드에서 실행
            import threading
            
            def save_in_background():
                try:
                    os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
                    data = {
                        'items': self.items.copy(),  # 복사본 사용 (스레드 안전)
                        'last_updated': datetime.now().isoformat()
                    }
                    with open(self.data_file, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                        f.flush()
                        os.fsync(f.fileno())
                except Exception as e:
                    print(f"아이템 저장 오류: {e}")
            
            thread = threading.Thread(target=save_in_background, daemon=True)
            thread.start()
        else:
            # 동기 실행
            try:
                os.makedirs(os.path.dirname(self.data_file), exist_ok=True)
                data = {
                    'items': self.items,
                    'last_updated': datetime.now().isoformat()
                }
                with open(self.data_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
            except Exception as e:
                print(f"아이템 저장 오류: {e}")
    
    def add_item(self, purchase_price: float, purchase_amount: float, item_name: str = "비트코인"):
        """아이템 추가"""
        item_id = f"btc_item_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{random.randint(1000, 9999)}"
        item = {
            'item_id': item_id,
            'item_name': item_name,
            'purchase_price': purchase_price,
            'purchase_amount': purchase_amount,
            'purchase_time': datetime.now().isoformat(),
            'status': 'active'
        }
        self.items.append(item)
        self.save()
        return item
    
    def sell_item(self, item_id: str, sell_price: float, fee_rate: float = 0.1):
        """아이템 판매"""
        for item in self.items:
            if item.get('item_id') == item_id and item.get('status') == 'active':
                item['status'] = 'sold'
                item['sell_price'] = sell_price
                item['sell_time'] = datetime.now().isoformat()
                fee_rate_decimal = fee_rate / 100.0
                purchase_price_with_fee = item['purchase_price'] * (1 + fee_rate_decimal / 2)
                sell_value = sell_price * item['purchase_amount']
                sell_value_after_fee = sell_value * (1 - fee_rate_decimal / 2)
                item['final_profit_loss'] = sell_value_after_fee - purchase_price_with_fee
                item['final_profit_loss_percent'] = ((item['final_profit_loss'] / purchase_price_with_fee) * 100) if purchase_price_with_fee > 0 else 0
                self.save()
                return item
        return None
    
    def get_active_items(self):
        """활성 아이템만 반환"""
        return [item for item in self.items if item.get('status') == 'active']
    
    def get_sold_items(self):
        """판매된 아이템만 반환"""
        return [item for item in self.items if item.get('status') == 'sold']


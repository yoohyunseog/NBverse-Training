"""이벤트 핸들러 모듈"""
from PyQt6.QtWidgets import QMessageBox, QInputDialog
from workers.order_workers import BuyOrderWorker, SellOrderWorker, PriceUpdateWorker
from utils import get_btc_price


class EventHandlers:
    """이벤트 핸들러 클래스"""
    
    def __init__(self, gui):
        self.gui = gui
    
    def on_buy_click(self):
        """매수 버튼 클릭 (백그라운드 처리) - 생산 카드가 있어야 매수 가능"""
        # 실제 트레이딩 ON/OFF 체크
        if not getattr(self.gui, "real_trading_enabled", False):
            QMessageBox.warning(self.gui, "경고", "실제 트레이딩이 OFF 상태입니다.\n좌측 사이드바에서 ON 으로 변경해야 실제 매매가 실행됩니다.")
            return
        # 생산 카드 확인
        if not hasattr(self.gui, 'production_card_manager') or not self.gui.production_card_manager:
            QMessageBox.warning(self.gui, "경고", "생산 카드가 없습니다. 먼저 카드를 생산해주세요.")
            return
        
        active_cards = self.gui.production_card_manager.get_active_cards()
        if not active_cards or len(active_cards) == 0:
            QMessageBox.warning(self.gui, "경고", "생산 카드가 없습니다. 먼저 카드를 생산해주세요.")
            return
        
        current_price = get_btc_price()
        if current_price <= 0:
            QMessageBox.critical(self.gui, "오류", "BTC 가격을 조회해주세요.")
            return
        
        self.gui.save_min_amount()
        min_amount = self.gui.settings_manager.get("min_buy_amount", 5000)
        
        amount_krw, ok = QInputDialog.getDouble(
            self.gui, "매수", 
            f"매수할 금액을 입력하세요 (KRW)\n현재 BTC 가격: {current_price:,.0f} KRW\n최소 금액: {min_amount:,} KRW",
            min_amount, min_amount, 100000000, 0
        )
        
        if not ok or amount_krw < min_amount:
            return
        
        purchase_amount = amount_krw / current_price
        
        # 실제 매수 실행 (백그라운드)
        if self.gui.upbit:
            buy_worker = BuyOrderWorker(self.gui.upbit, amount_krw, purchase_amount, self.gui.item_manager)
            buy_worker.order_completed.connect(self._on_buy_order_completed)
            buy_worker.order_failed.connect(self._on_buy_order_failed)
            buy_worker.start()
    
    def on_buy_click_for_card(self, card_id: str, entry_price: float, amount_krw: float):
        """생산 카드에서 매수 버튼 클릭 (백그라운드 처리)"""
        # 실제 트레이딩 ON/OFF 체크
        if not getattr(self.gui, "real_trading_enabled", False):
            QMessageBox.warning(self.gui, "경고", "실제 트레이딩이 OFF 상태입니다.\n좌측 사이드바에서 ON 으로 변경해야 실제 매매가 실행됩니다.")
            return
        current_price = get_btc_price()
        if current_price <= 0:
            QMessageBox.critical(self.gui, "오류", "BTC 가격을 조회해주세요.")
            return
        
        purchase_amount = amount_krw / entry_price
        
        # 실제 매수 실행 (백그라운드)
        if self.gui.upbit:
            buy_worker = BuyOrderWorker(self.gui.upbit, amount_krw, purchase_amount, self.gui.item_manager)
            buy_worker.order_completed.connect(lambda amt, pur: self._on_buy_order_completed_for_card(card_id, entry_price, amt, pur))
            buy_worker.order_failed.connect(self._on_buy_order_failed)
            buy_worker.start()
    
    def _on_buy_order_completed_for_card(self, card_id: str, entry_price: float, amount_krw: float, purchase_amount: float):
        """생산 카드 매수 주문 완료"""
        try:
            # 생산 카드에 매수 히스토리 추가
            if hasattr(self.gui, 'production_card_manager') and self.gui.production_card_manager:
                fee_rate = (self.gui.settings_manager.get("fee_rate", 0.1) / 100.0) if self.gui.settings_manager else 0.001
                fee_amount = amount_krw * (fee_rate / 2)  # 매수 수수료
                
                self.gui.production_card_manager.add_buy_history(
                    card_id=card_id,
                    qty=purchase_amount,
                    entry_price=entry_price,
                    fee_amount=fee_amount,
                    memo=f"생산 카드에서 매수: {amount_krw:,.0f} KRW"
                )
                
                # 생산 카드 UI 업데이트 (매도 버튼 표시를 위해)
                if hasattr(self.gui, 'refresh_production_cards'):
                    from PyQt6.QtCore import QTimer
                    QTimer.singleShot(500, self.gui.refresh_production_cards)
                
                # 강화학습 AI 학습 데이터 기록 (매수 완료 시)
                if hasattr(self.gui, 'rl_system') and self.gui.rl_system:
                    card = self.gui.production_card_manager.get_card_by_id(card_id)
                    if card:
                        from workers.rl_buy_worker import RLBuyWorker
                        worker = RLBuyWorker(
                            rl_system=self.gui.rl_system,
                            card=card,
                            entry_price=entry_price,
                            amount_krw=amount_krw,
                            purchase_amount=purchase_amount,
                            fee_amount=fee_amount,
                            is_simulation=False  # 실제 거래 모드
                        )
                        worker.buy_recorded.connect(
                            lambda cid: print(f"✅ [RL 매수 기록 완료] 카드 {cid}")
                        )
                        worker.error_occurred.connect(
                            lambda msg: print(f"⚠️ RL 매수 기록 오류: {msg}")
                        )
                        worker.start()
        except Exception as e:
            print(f"⚠️ 생산 카드 매수 히스토리 추가 오류: {e}")
        
        self._on_buy_order_completed(amount_krw, purchase_amount)
    
    def _on_buy_order_completed(self, amount_krw: float, purchase_amount: float):
        """매수 주문 완료"""
        self.gui.refresh_items(update_immediately=True)
        self.gui.refresh_balance()
        QMessageBox.information(self.gui, "매수 완료", f"매수가 완료되었습니다.\n금액: {amount_krw:,.0f} KRW")
    
    def _on_buy_order_failed(self, error_msg: str):
        """매수 주문 실패"""
        QMessageBox.critical(self.gui, "오류", error_msg)
    
    def on_sell_click(self, item_id: str):
        """매도 버튼 클릭"""
        item = None
        for it in self.gui.item_manager.items:
            if it.get('item_id') == item_id and it.get('status') == 'active':
                item = it
                break
        
        if not item:
            QMessageBox.critical(self.gui, "오류", "아이템을 찾을 수 없습니다.")
            return
        
        sell_amount = item.get('purchase_amount', 0)
        
        # 가격 조회를 백그라운드로 이동
        if self.gui._price_worker and self.gui._price_worker.isRunning():
            return
        
        self.gui._price_worker = PriceUpdateWorker()
        self.gui._price_worker.price_ready.connect(lambda price: self._on_sell_price_ready(price, item_id, sell_amount))
        self.gui._price_worker.start()
    
    def _on_sell_price_ready(self, current_price: float, item_id: str, sell_amount: float):
        """매도 가격 준비 완료"""
        if current_price <= 0:
            QMessageBox.critical(self.gui, "오류", "BTC 가격을 조회해주세요.")
            return
        
        # 실제 트레이딩 ON/OFF 체크
        if not getattr(self.gui, "real_trading_enabled", False):
            QMessageBox.warning(self.gui, "경고", "실제 트레이딩이 OFF 상태입니다.\n좌측 사이드바에서 ON 으로 변경해야 실제 매매가 실행됩니다.")
            return
        
        # 실제 매도 실행 (백그라운드)
        if self.gui.upbit:
            sell_worker = SellOrderWorker(self.gui.upbit, item_id, sell_amount, current_price)
            sell_worker.order_completed.connect(self._on_sell_order_completed)
            sell_worker.order_failed.connect(self._on_sell_order_failed)
            sell_worker.start()
    
    def _on_sell_order_completed(self, item_id: str, current_price: float):
        """매도 주문 완료"""
        fee_rate = self.gui.settings_manager.get("fee_rate", 0.1)
        self.gui.item_manager.sell_item(item_id, current_price, fee_rate)
        self.gui.refresh_items(update_immediately=True)
        self.gui.refresh_balance()
        QMessageBox.information(self.gui, "매도 완료", f"매도가 완료되었습니다.\n아이템ID: {item_id}")
    
    def _on_sell_order_failed(self, error_msg: str):
        """매도 주문 실패"""
        QMessageBox.critical(self.gui, "오류", error_msg)


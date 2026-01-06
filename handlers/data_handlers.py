"""데이터 업데이트 핸들러 모듈"""
from workers.order_workers import PriceUpdateWorker
from workers.data_workers import BalanceUpdateWorker, ItemsUpdateWorker


class DataHandlers:
    """데이터 업데이트 핸들러 클래스"""
    
    def __init__(self, gui):
        self.gui = gui
    
    def update_price(self):
        """가격 업데이트"""
        if self.gui._price_worker and self.gui._price_worker.isRunning():
            return
        
        self.gui._price_worker = PriceUpdateWorker()
        self.gui._price_worker.price_ready.connect(self._on_price_ready)
        self.gui._price_worker.start()
    
    def _on_price_ready(self, price):
        """가격 준비 완료"""
        if price > 0:
            self.gui.btc_price_text = f"{price:,.0f} KRW"
            self.gui.btc_price_label.setText(self.gui.btc_price_text)
    
    def update_balance(self):
        """잔고 업데이트"""
        if self.gui._updating_balance:
            return
        
        try:
            self.gui._updating_balance = True
            self.gui._update_ai_progress(10, "전체 잔고 정보 업데이트 중..", process_events=True)
            self.refresh_balance()
            self.gui._update_ai_progress(50, "전체 AI 메시지 업데이트 중..", process_events=True)
            self.gui.refresh_items(update_immediately=False)
            self.gui._update_ai_progress(100, "업데이트 완료", process_events=True)
        finally:
            self.gui._updating_balance = False
    
    def refresh_balance(self):
        """잔고 새로고침"""
        if self.gui._balance_worker and self.gui._balance_worker.isRunning():
            return
        
        self.gui._balance_worker = BalanceUpdateWorker(self.gui.upbit)
        self.gui._balance_worker.balance_ready.connect(self._on_balance_ready)
        self.gui._balance_worker.start()
    
    def _on_balance_ready(self, balance_data):
        """잔고 준비 완료"""
        try:
            krw = balance_data['krw']
            btc_amount = balance_data['btc']
            total_value = balance_data['total_value']
            
            self.gui.krw_balance_text = f"{krw:,.0f} KRW"
            self.gui.btc_balance_text = f"{btc_amount:.8f} BTC"
            self.gui.total_value_text = f"{total_value:,.0f} KRW"
            
            self.gui.krw_balance_label.setText(self.gui.krw_balance_text)
            self.gui.btc_balance_label.setText(self.gui.btc_balance_text)
            self.gui.total_value_label.setText(self.gui.total_value_text)
        except Exception as e:
            print(f"잔고 정보 업데이트 오류: {e}")
    
    def refresh_items(self, update_immediately=False):
        """아이템 새로고침"""
        if self.gui._items_worker and self.gui._items_worker.isRunning():
            return
        
        self.gui._items_worker = ItemsUpdateWorker(self.gui.item_manager, self.gui.settings_manager)
        self.gui._items_worker.items_ready.connect(lambda data: self._on_items_ready(data, update_immediately))
        self.gui._items_worker.start()
    
    def _on_items_ready(self, items_data, update_immediately):
        """아이템 준비 완료"""
        try:
            self.gui.pending_items_data = items_data
            
            if update_immediately:
                self._apply_items_update()
            else:
                if self.gui.ai_progress_value < 100:
                    self.gui.pending_items_update = True
                else:
                    self._apply_items_update()
        except Exception as e:
            print(f"아이템 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _apply_items_update(self):
        """아이템 업데이트 적용"""
        from PyQt6.QtWidgets import QApplication, QLabel
        from PyQt6.QtCore import Qt
        from ui.item_card import ItemCard
        
        if not self.gui.pending_items_data:
            return
        
        try:
            active_items = self.gui.pending_items_data['active_items']
            sold_items = self.gui.pending_items_data['sold_items']
            current_price = self.gui.pending_items_data['current_price']
            max_sold_profit_percent = self.gui.pending_items_data['max_sold_profit_percent']
            
            # 활성 아이템면 업데이트
            self.gui.active_masonry.clear()
            QApplication.processEvents()
            
            if not active_items:
                empty_label = QLabel("보유 중인 아이템이 없습니다.")
                empty_label.setStyleSheet("color: #888888; font-size: 16px;")
                empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                self.gui.active_masonry.add_widget(empty_label)
            else:
                if self.gui.ml_enabled and len(active_items) > 0:
                    self.gui._update_ai_progress(0, f"전체 AI 메시지 업데이트 중.. ({len(active_items)}개 아이템)", process_events=True)
                
                # 배치로 카드 생성 및 추가 (성능 최적화)
                BATCH_SIZE = 10  # 배치 크기 증가
                cards = []
                
                for batch_start in range(0, len(active_items), BATCH_SIZE):
                    batch_end = min(batch_start + BATCH_SIZE, len(active_items))
                    batch_items = active_items[batch_start:batch_end]
                    
                    # 배치 내 모든 카드 생성
                    batch_cards = []
                    for idx, item in enumerate(batch_items):
                        global_idx = batch_start + idx
                        if self.gui.ml_enabled:
                            progress = int(10 + (global_idx / len(active_items)) * 80)
                            self.gui._update_ai_progress(progress, f"전체 AI 메시지 생성 중.. ({global_idx+1}/{len(active_items)})", process_events=False)
                        
                        card = ItemCard(item, is_sold=False, current_price=current_price,
                                      max_sold_profit_percent=max_sold_profit_percent,
                                      settings_manager=self.gui.settings_manager,
                                      ml_enabled=self.gui.ml_enabled, 
                                      ml_models=getattr(self.gui, 'ml_models', None),
                                      get_ai_message_callback=self.gui.get_ai_message_for_item)
                        card.sell_clicked.connect(self.gui.event_handlers.on_sell_click)
                        batch_cards.append(card)
                    
                    # 배치로 한 번에 추가 (성능 향상)
                    if batch_cards:
                        self.gui.active_masonry.add_widgets_batch(batch_cards)
                        cards.extend(batch_cards)
                    
                    # 배치마다 한 번만 UI 업데이트
                    QApplication.processEvents()
                
                if self.gui.ml_enabled and len(active_items) > 0:
                    self.gui._update_ai_progress(100, "AI 메시지 업데이트 완료", process_events=True)
            
            # 판매 아이템면 업데이트 (생산 카드 탭으로 통합됨 - 제거)
            # 판매 완료된 아이템은 생산 카드 탭의 "판매 완료" 필터에서 확인 가능
            pass
            
            # 업데이트 완료 후 초기화
            self.gui.pending_items_data = None
            self.gui.pending_items_update = False
            
        except Exception as e:
            print(f"아이템면 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()


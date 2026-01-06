"""생산 카드 관련 컨트롤러"""
from PyQt6.QtCore import QTimer, pyqtSignal, QObject
from typing import List, Dict, Optional


class CardController(QObject):
    """생산 카드 관리 컨트롤러"""
    
    # 시그널
    cards_loaded = pyqtSignal(list)
    card_produced = pyqtSignal(dict)
    card_production_error = pyqtSignal(str)
    duplicate_cleanup_complete = pyqtSignal(int)
    
    def __init__(self, parent, production_card_manager, discarded_card_manager, settings_manager):
        super().__init__(parent)
        self.parent = parent
        self.production_card_manager = production_card_manager
        self.discarded_card_manager = discarded_card_manager
        self.settings_manager = settings_manager
        
        # 워커 변수
        self._card_load_worker = None
        self._card_production_worker = None
        self._duplicate_cleanup_worker = None
        
        # 상태 변수
        self._producing_card = False
    
    def refresh_production_cards(self):
        """생산 카드 새로고침"""
        from workers.card_workers import CardLoadWorker
        if self._card_load_worker and self._card_load_worker.isRunning():
            return
        
        self._card_load_worker = CardLoadWorker(self.production_card_manager)
        self._card_load_worker.cards_ready.connect(self._on_cards_loaded)
        self._card_load_worker.error_occurred.connect(self._on_cards_load_error)
        self._card_load_worker.start()
    
    def _on_cards_loaded(self, cards):
        """카드 로드 완료"""
        try:
            # 중복 카드 제거
            cards = self._remove_duplicate_cards(cards)
            self.cards_loaded.emit(cards)
        except Exception as e:
            print(f"카드 로드 처리 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_cards_load_error(self, error_msg):
        """카드 로드 오류"""
        print(f"생산 카드 새로고침 오류: {error_msg}")
        self.cards_loaded.emit([])
    
    def _remove_duplicate_cards(self, cards):
        """중복 카드 제거"""
        if not cards:
            return cards
        
        card_dict = {}
        for card in cards:
            card_key = card.get('card_key', '') or card.get('card_id', '')
            if not card_key:
                continue
            
            if card_key not in card_dict:
                card_dict[card_key] = card
            else:
                existing_time = card_dict[card_key].get('production_time', '')
                current_time = card.get('production_time', '')
                if current_time > existing_time:
                    card_dict[card_key] = card
        
        unique_cards = list(card_dict.values())
        if len(unique_cards) < len(cards):
            removed_count = len(cards) - len(unique_cards)
            print(f"✅ 생산 카드 탭 중복 제거: {removed_count}개 중복 카드 제거됨")
        
        return unique_cards
    
    def filter_production_cards(self, cards):
        """생산 카드 필터링"""
        if not hasattr(self.parent, 'production_card_filter'):
            return cards
        
        filter_type = self.parent.production_card_filter.currentText()
        
        if filter_type == "전체":
            all_cards = list(cards)
            if self.discarded_card_manager:
                try:
                    discarded_cards = self.discarded_card_manager.get_all_discarded_cards()
                    all_cards.extend(discarded_cards)
                except Exception as e:
                    print(f"  ⚠️ 폐기된 카드 로드 오류 (무시): {e}")
            return all_cards
        elif filter_type == "보유 중":
            from managers.production_card_manager import CardState
            return [card for card in cards 
                   if card.get('card_state') in [CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value]]
        elif filter_type == "판매 완료":
            return [card for card in cards 
                   if any(h.get('type') == 'SOLD' for h in card.get('history_list', []))]
        elif filter_type == "폐기":
            if self.discarded_card_manager:
                return self.discarded_card_manager.get_all_discarded_cards()
            return []
        
        return cards
    
    def produce_new_card(self):
        """새 생산 카드 생성"""
        if self._producing_card:
            print("⚠️ 이미 생산 중이므로 건너뜀")
            return
        
        if not self.parent.nbverse_storage or not self.parent.nbverse_converter:
            print("⚠️ NBVerse가 초기화되지 않았으니 카드 생산 건너뜀")
            return
        
        print("[카드 생산] 카드 생산 시작...")
        self._producing_card = True
        
        if hasattr(self.parent, 'production_log_text'):
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            self.parent.production_log_text.appendPlainText(f"[{timestamp}] 카드 생산 시작...")
            scrollbar = self.parent.production_log_text.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())
        
        if self._card_production_worker and self._card_production_worker.isRunning():
            self._card_production_worker.terminate()
            self._card_production_worker.wait()
        
        from workers.card_workers import CardProductionWorker
        self._card_production_worker = CardProductionWorker(
            self.settings_manager,
            self.production_card_manager,
            self.parent.nbverse_storage,
            self.parent.nbverse_converter,
            chart_max_nb=self.parent.current_chart_max_nb,
            chart_min_nb=self.parent.current_chart_min_nb,
            chart_nb_value=self.parent.current_chart_nb_value,
            chart_timeframe=self.parent.current_chart_timeframe
        )
        self._card_production_worker.card_created.connect(self._on_card_produced)
        self._card_production_worker.error_occurred.connect(self._on_card_production_error)
        self._card_production_worker.log_message.connect(self._on_card_production_log)
        self._card_production_worker.finished.connect(self._on_card_production_finished)
        self._card_production_worker.start()
        print("[카드 생산] 백그라운드 워커 시작")
    
    def _on_card_produced(self, result):
        """카드 생성 완료"""
        self.card_produced.emit(result)
        self._producing_card = False
    
    def _on_card_production_error(self, error_msg):
        """카드 생산 오류"""
        print(f"❌ 카드 생산 오류: {error_msg}")
        self.card_production_error.emit(error_msg)
        self._producing_card = False
    
    def _on_card_production_log(self, log_msg):
        """카드 생산 로그"""
        if hasattr(self.parent, 'production_log_text'):
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            self.parent.production_log_text.appendPlainText(f"[{timestamp}] {log_msg}")
            scrollbar = self.parent.production_log_text.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())
    
    def _on_card_production_finished(self):
        """카드 생산 완료"""
        self._producing_card = False
    
    def cleanup_duplicate_cards(self):
        """중복 카드 정리"""
        try:
            if not self.production_card_manager:
                return
            
            from PyQt6.QtCore import QThread, pyqtSignal
            
            class DuplicateCleanupWorker(QThread):
                cleanup_complete = pyqtSignal(int)
                
                def __init__(self, production_card_manager):
                    super().__init__()
                    self.production_card_manager = production_card_manager
                
                def run(self):
                    try:
                        removed_count = self.production_card_manager.cleanup_duplicate_cards()
                        self.cleanup_complete.emit(removed_count)
                    except Exception as e:
                        print(f"⚠️ 중복 카드 정리 오류: {e}")
                        self.cleanup_complete.emit(0)
            
            if self._duplicate_cleanup_worker and self._duplicate_cleanup_worker.isRunning():
                return
            
            self._duplicate_cleanup_worker = DuplicateCleanupWorker(self.production_card_manager)
            self._duplicate_cleanup_worker.cleanup_complete.connect(self.duplicate_cleanup_complete.emit)
            self._duplicate_cleanup_worker.start()
        except Exception as e:
            print(f"⚠️ 중복 카드 정리 시작 오류: {e}")
    
    def save_cards_to_cache(self):
        """생산 카드를 임시 저장 파일에 저장"""
        try:
            if self.production_card_manager and hasattr(self.production_card_manager, '_save_cards_to_cache'):
                self.production_card_manager._save_cards_to_cache()
        except Exception as e:
            print(f"⚠️ 생산 카드 임시 저장 오류: {e}")


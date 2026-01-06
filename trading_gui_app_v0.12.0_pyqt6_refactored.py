"""리팩토링된 Trading Bot GUI 메인 클래스 (1000줄 이하)"""
import os
import sys
import time
from PyQt6.QtWidgets import QApplication, QMainWindow, QWidget, QHBoxLayout, QStackedWidget, QMessageBox
from PyQt6.QtCore import QTimer, Qt

import pyupbit

from utils import load_config
from managers import SettingsManager, ItemManager, ProductionCardManager
from nbverse_helper import init_nbverse_storage
from ui.gui_builder import GUIBuilder
from ui.settings_page import SettingsPage
from handlers.event_handlers import EventHandlers
from handlers.data_handlers import DataHandlers
from workers.process_workers import ProcessUpdateWorker
from ai import MLModelManager
from controllers import CardController, ChartController, VerificationController, AIController, WorkerManager


class TradingBotGUI(QMainWindow):
    """PyQt6 기반 Trading Bot GUI (리팩토링 버전)"""
    
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.upbit = None
        self.item_manager = ItemManager()
        self.settings_manager = SettingsManager()
        
        # 폐기된 카드 관리자 초기화
        from managers.discarded_card_manager import DiscardedCardManager
        self.discarded_card_manager = DiscardedCardManager()
        
        # 생산 카드 관리자 초기화
        self.production_card_manager = ProductionCardManager(
            discarded_card_manager=self.discarded_card_manager
        )
        
        # NBVerse 초기화
        self._init_nbverse()
        
        # API 연결 시도
        self._init_upbit()
        
        # 기본 설정
        self.setWindowTitle("자동 매매")
        self.setGeometry(100, 100, 1000, 700)
        self.setStyleSheet("background-color: #0b1220;")
        
        # 상태 변수
        self.btc_price_text = "0"
        self.krw_balance_text = "0"
        self.btc_balance_text = "0"
        self.total_value_text = "0"
        
        # 실제 트레이딩 ON/OFF 토글
        self.real_trading_enabled = False
        self.pending_items_update = None
        self.pending_items_data = None
        
        # ML 모델 관리자
        try:
            self.ml_model_manager = MLModelManager()
        except Exception as e:
            print(f"⚠️ ML 모델 관리자 초기화 오류: {e}")
            self.ml_model_manager = None
        
        # 강화학습 시스템 초기화
        from ai.rl_system import RLSystem
        self.rl_system = RLSystem(
            ml_model_manager=self.ml_model_manager,
            production_card_manager=self.production_card_manager
        )
        
        # 컨트롤러 초기화
        self._init_controllers()
        
        # 이벤트 핸들러 초기화
        self.event_handlers = EventHandlers(self, self.settings_manager)
        self.data_handlers = DataHandlers(self, self.settings_manager, self.upbit)
        
        # UI 구성
        self.setup_ui()
        
        # 타이머 초기화
        self._init_timers()
        
        # 초기 로드
        self._initial_load()
    
    def _init_controllers(self):
        """컨트롤러 초기화"""
        # 카드 컨트롤러
        self.card_controller = CardController(
            self, self.production_card_manager, 
            self.discarded_card_manager, self.settings_manager
        )
        self.card_controller.cards_loaded.connect(self._on_cards_loaded)
        self.card_controller.card_produced.connect(self._on_card_produced)
        self.card_controller.duplicate_cleanup_complete.connect(self._on_duplicate_cleanup_complete)
        
        # 차트 컨트롤러
        self.chart_controller = ChartController(
            self, self.settings_manager, 
            self.nbverse_storage, self.nbverse_converter
        )
        self.chart_controller.chart_data_ready.connect(self._on_chart_data_ready)
        self.chart_controller.max_min_ready.connect(self._on_max_min_ready)
        
        # 검증 컨트롤러
        self.verification_controller = VerificationController(
            self, self.production_card_manager,
            self.discarded_card_manager, self.settings_manager
        )
        self.verification_controller.verification_cards_loaded.connect(self._on_verification_cards_loaded)
        self.verification_controller.verification_stats_ready.connect(self._on_verification_stats_ready)
        
        # AI 컨트롤러
        self.ai_controller = AIController(
            self, self.ml_model_manager, self.rl_system, self.settings_manager
        )
        
        # 워커 관리자
        self.worker_manager = WorkerManager(self)
    
    def _init_nbverse(self):
        """NBVerse 초기화"""
        try:
            self.nbverse_storage, self.nbverse_converter = init_nbverse_storage()
            if self.production_card_manager:
                self.production_card_manager.nbverse_storage = self.nbverse_storage
            print("✅ NBVerse 초기화 완료")
        except Exception as e:
            print(f"⚠️ NBVerse 초기화 오류: {e}")
            self.nbverse_storage = None
            self.nbverse_converter = None
    
    def _init_upbit(self):
        """Upbit API 초기화"""
        try:
            from utils.config import get_upbit_keys
            access_key, secret_key = get_upbit_keys()
            if access_key and secret_key:
                self.upbit = pyupbit.Upbit(access_key, secret_key)
                self._test_upbit_connection()
            else:
                print("⚠️ Upbit API 키가 설정되지 않았습니다.")
        except Exception as e:
            print(f"⚠️ Upbit API 초기화 오류: {e}")
    
    def _test_upbit_connection(self):
        """Upbit 연결 테스트"""
        if not self.upbit:
            return
        
        from workers.data_workers import UpbitTestWorker
        self._upbit_test_worker = UpbitTestWorker(self.upbit)
        self._upbit_test_worker.test_complete.connect(self._on_upbit_test_complete)
        self._upbit_test_worker.start()
    
    def _on_upbit_test_complete(self, balance_data):
        """Upbit 연결 테스트 완료"""
        if balance_data:
            print(f"✅ Upbit API 연결 성공 (잔고: {balance_data.get('krw', 0):,.0f} KRW)")
        else:
            print("⚠️ Upbit API 연결 실패")
    
    def _init_timers(self):
        """타이머 초기화"""
        # 가격 업데이트 타이머
        self.price_timer = QTimer()
        self.price_timer.timeout.connect(self.data_handlers.update_price)
        self.price_timer.start(5000)
        
        # 차트 업데이트 타이머
        self.chart_timer = QTimer()
        self.chart_timer.timeout.connect(self.chart_controller.update_main_chart)
        self.chart_timer.start(30000)
        
        # 잔고 업데이트 타이머
        self.balance_timer = QTimer()
        self.balance_timer.timeout.connect(self.data_handlers.update_balance)
        self.balance_timer.start(10000)
        
        # AI 업데이트 타이머
        self.ai_update_timer = QTimer()
        self.ai_update_timer.timeout.connect(self._periodic_ai_update)
        self.ai_update_timer.start(15000)
        
        # 프로세스 업데이트 타이머
        self.process_update_timer = QTimer()
        self.process_update_timer.timeout.connect(self._periodic_process_update)
        
        # 생산 카드 임시 저장 타이머 (1분마다)
        self.production_card_save_timer = QTimer()
        self.production_card_save_timer.timeout.connect(self.card_controller.save_cards_to_cache)
        self.production_card_save_timer.start(60000)
        
        # 생산 카드 자동 생산 타이머 (60초마다)
        self.auto_production_timer = QTimer()
        self.auto_production_timer.timeout.connect(self._auto_produce_card)
        self.auto_production_timer.start(60000)
        self._last_auto_production_time = 0
    
    def setup_ui(self):
        """UI 구성"""
        # 메뉴바
        GUIBuilder.build_menubar(self, self.show_settings_page)
        
        # 메인 레이아웃
        main_widget = QWidget()
        main_layout = QHBoxLayout(main_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        
        # 왼쪽 사이드바
        sidebar_widgets = GUIBuilder.build_left_sidebar(self, self.settings_manager)
        sidebar_layout = QHBoxLayout()
        for widget in sidebar_widgets:
            sidebar_layout.addWidget(widget)
        sidebar_widget = QWidget()
        sidebar_widget.setLayout(sidebar_layout)
        sidebar_widget.setFixedWidth(300)
        main_layout.addWidget(sidebar_widget)
        
        # 메인 탭
        tab_widget = GUIBuilder.build_main_tabs(self)
        main_layout.addWidget(tab_widget, 1)
        
        self.setCentralWidget(main_widget)
        
        # 설정 페이지
        self.settings_page = SettingsPage(self.settings_manager)
        self.settings_page.settings_applied.connect(self.apply_settings)
        
        # 스택 위젯
        self.stacked_widget = QStackedWidget()
        self.stacked_widget.addWidget(main_widget)
        self.stacked_widget.addWidget(self.settings_page)
        self.setCentralWidget(self.stacked_widget)
        
        # 생산 카드 필터 연결
        self._connect_production_card_filter()
    
    def _connect_production_card_filter(self):
        """생산 카드 필터 연결"""
        if hasattr(self, 'production_card_filter'):
            self.production_card_filter.currentTextChanged.connect(self._on_production_card_filter_changed)
    
    def _on_production_card_filter_changed(self):
        """생산 카드 필터 변경 시 새로고침"""
        self.card_controller.refresh_production_cards()
    
    def _initial_load(self):
        """초기 로드"""
        QTimer.singleShot(500, self.data_handlers.update_price)
        QTimer.singleShot(600, self.data_handlers.update_balance)
        QTimer.singleShot(700, self.data_handlers.refresh_items)
        QTimer.singleShot(650, self.card_controller.refresh_production_cards)
        QTimer.singleShot(800, self.chart_controller.update_main_chart)
        QTimer.singleShot(900, self.card_controller.cleanup_duplicate_cards)
    
    def show_settings_page(self):
        """설정 페이지 표시"""
        self.stacked_widget.setCurrentIndex(1)
    
    def show_main_page(self):
        """메인 페이지 표시"""
        self.stacked_widget.setCurrentIndex(0)
    
    def apply_settings(self, new_settings):
        """설정 적용"""
        for key, value in new_settings.items():
            self.settings_manager.set(key, value)
        self.show_main_page()
        QTimer.singleShot(100, self.refresh_all)
    
    def _on_cards_loaded(self, cards):
        """카드 로드 완료"""
        try:
            if not hasattr(self, 'production_masonry'):
                return
            
            if hasattr(self, 'production_masonry'):
                self.production_masonry.clear()
            
            # 필터 적용
            filtered_cards = self.card_controller.filter_production_cards(cards)
            
            if not filtered_cards or len(filtered_cards) == 0:
                from PyQt6.QtWidgets import QLabel
                from PyQt6.QtCore import Qt
                filter_text = "전체"
                if hasattr(self, 'production_card_filter'):
                    filter_text = self.production_card_filter.currentText()
                no_cards_label = QLabel(f"{filter_text} 카드가 없습니다.")
                no_cards_label.setStyleSheet("color: #888888; font-size: 14px; padding: 20px;")
                no_cards_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                if hasattr(self, 'production_masonry'):
                    self.production_masonry.add_widget(no_cards_label)
                return
            
            # 배치 렌더링
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            self._cards_to_render = filtered_cards
            self._current_card_index = 0
            self._decimal_places = decimal_places
            self._render_production_cards_batch()
        except Exception as e:
            print(f"카드 로드 처리 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _render_production_cards_batch(self):
        """생산 카드 배치 렌더링"""
        if not hasattr(self, '_cards_to_render') or not hasattr(self, '_current_card_index'):
            return
        
        batch_size = 5
        end_index = min(self._current_card_index + batch_size, len(self._cards_to_render))
        
        for i in range(self._current_card_index, end_index):
            card = self._cards_to_render[i]
            try:
                from ui.production_card import ProductionCard
                production_card = ProductionCard(
                    card,
                    decimal_places=self._decimal_places,
                    settings_manager=self.settings_manager,
                    ai_message_callback=self.ai_controller.get_ai_message_for_card,
                    rl_ai_callback=self.ai_controller.get_rl_ai_analysis_for_card,
                    rl_action_callback=self.execute_rl_action,
                    parent=self
                )
                if hasattr(self, 'production_masonry'):
                    self.production_masonry.add_widget(production_card)
            except Exception as e:
                print(f"⚠️ 생산 카드 위젯 생성 오류: {e}")
        
        self._current_card_index = end_index
        
        if self._current_card_index < len(self._cards_to_render):
            QTimer.singleShot(30, self._render_production_cards_batch)
        else:
            from PyQt6.QtWidgets import QApplication
            QApplication.processEvents()
    
    def _on_card_produced(self, result):
        """카드 생성 완료"""
        try:
            card = result.get('card', {})
            timeframe = result.get('timeframe', 'N/A')
            nb_value = result.get('nb_value', 0.0)
            card_type = result.get('card_type', 'normal')
            chart_data = result.get('chart_data', {})
            card_id = card.get('card_id', 'N/A')
            
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            print(f"✅ 생산 카드 생성 완료: {timeframe} (N/B: {nb_value:.{decimal_places}f}, 타입 {card_type}, 가격 {chart_data.get('current_price', 0):,.0f} KRW)")
            
            if hasattr(self, 'production_log_text'):
                from datetime import datetime
                timestamp = datetime.now().strftime("%H:%M:%S")
                self.production_log_text.appendPlainText(f"[{timestamp}] ✅ 카드 생성 완료: {card_id}")
                scrollbar = self.production_log_text.verticalScrollBar()
                scrollbar.setValue(scrollbar.maximum())
            
            QTimer.singleShot(500, self.card_controller.refresh_production_cards)
        except Exception as e:
            print(f"❌ 카드 생성 후처리 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_duplicate_cleanup_complete(self, removed_count):
        """중복 카드 정리 완료"""
        if removed_count > 0:
            print(f"✅ 중복 카드 정리 완료: {removed_count}개 카드 제거됨")
            QTimer.singleShot(100, self.card_controller.refresh_production_cards)
    
    def _on_chart_data_ready(self, chart_data):
        """차트 데이터 준비 완료"""
        self.chart_controller.update_chart_ui(chart_data)
    
    def _on_max_min_ready(self, bit_max, bit_min):
        """MAX/MIN 계산 완료"""
        # 차트 컨트롤러에서 이미 처리됨
        pass
    
    def _on_verification_cards_loaded(self, verification_cards):
        """검증 카드 로드 완료"""
        # 검증 컨트롤러에서 이미 처리됨
        pass
    
    def _on_verification_stats_ready(self, data):
        """검증 통계 준비 완료"""
        # 검증 컨트롤러에서 이미 처리됨
        pass
    
    def _auto_produce_card(self):
        """자동 카드 생산"""
        from time import time as current_time
        if current_time() - self._last_auto_production_time < 60:
            return
        
        self._last_auto_production_time = current_time()
        self.card_controller.produce_new_card()
    
    def _periodic_ai_update(self):
        """주기적 AI 업데이트"""
        # AI 컨트롤러에서 처리
        pass
    
    def _periodic_process_update(self):
        """주기적 프로세스 업데이트"""
        if hasattr(self, '_process_worker') and self._process_worker and self._process_worker.isRunning():
            return
        
        self._process_worker = ProcessUpdateWorker(
            self.upbit, self.settings_manager
        )
        self._process_worker.step_completed.connect(self._on_process_step_completed)
        self._process_worker.price_updated.connect(self.data_handlers.update_price)
        self._process_worker.balance_updated.connect(self.data_handlers.update_balance)
        self._process_worker.error_occurred.connect(self._on_process_error)
        self._process_worker.finished.connect(self._on_process_finished)
        self._process_worker.start()
    
    def _on_process_step_completed(self, progress, message):
        """프로세스 단계 완료"""
        if hasattr(self, 'process_progress_bar'):
            self.process_progress_bar.setValue(progress)
        if hasattr(self, 'process_progress_label'):
            self.process_progress_label.setText(message)
    
    def _on_process_error(self, error_msg):
        """프로세스 오류"""
        print(f"⚠️ 프로세스 업데이트 오류: {error_msg}")
    
    def _on_process_finished(self):
        """프로세스 완료"""
        pass
    
    def refresh_all(self):
        """전체 새로고침"""
        self.data_handlers.update_price()
        self.data_handlers.update_balance()
        self.data_handlers.refresh_items()
        self.card_controller.refresh_production_cards()
        self.verification_controller.refresh_verification_cards()
    
    def execute_rl_action(self, card_id: str, action: int, action_name: str):
        """강화학습 AI 행동 실행"""
        try:
            if not self.production_card_manager:
                return False
            
            if action_name == 'DELETE':
                # 카드 찾기
                card = None
                for c in self.production_card_manager.cards_cache:
                    if c.get('card_id') == card_id:
                        card = c
                        break
                
                if not card:
                    return False
                
                # 폐기된 카드 관리자에 추가
                from managers.discarded_card_manager import DiscardReason
                self.discarded_card_manager.discard_card(
                    card,
                    reason=DiscardReason.RL_DELETE,
                    reason_detail="강화학습 AI DELETE 행동"
                )
                
                # 카드 상태를 REMOVED로 변경
                from managers.production_card_manager import CardState
                card['card_state'] = CardState.REMOVED.value
                card['status'] = CardState.REMOVED.value
                
                # NBverse에 저장
                if self.nbverse_storage:
                    from workers.file_workers import CardUpdateWorker
                    worker = CardUpdateWorker(self.nbverse_storage, card)
                    worker.start()
                    worker.wait(2000)
                
                # 캐시에서 제거
                if card in self.production_card_manager.cards_cache:
                    self.production_card_manager.cards_cache.remove(card)
                
                self.production_card_manager._cache_dirty = True
                print(f"✅ 강화학습 AI: 카드 {card_id} 폐기 완료")
                
                QTimer.singleShot(500, self.card_controller.refresh_production_cards)
                return True
            
            return False
        except Exception as e:
            print(f"⚠️ 강화학습 AI 행동 실행 오류: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def closeEvent(self, event):
        """프로그램 종료 이벤트"""
        try:
            reply = QMessageBox.question(
                self, '종료 확인', '프로그램을 종료하시겠습니까?',
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            
            if reply == QMessageBox.StandardButton.No:
                event.ignore()
                return
            
            # 워커 정리
            self.worker_manager.cleanup_all_workers()
            
            # 카드 저장
            if hasattr(self, 'production_card_manager') and self.production_card_manager:
                try:
                    all_cards = self.production_card_manager.get_all_cards()
                    if all_cards and self.nbverse_storage:
                        saved_count = 0
                        for card in all_cards[:10]:
                            try:
                                self.production_card_manager._update_card_in_nbverse(card)
                                saved_count += 1
                            except:
                                pass
                        if saved_count > 0:
                            print(f"✓ {saved_count}개 카드 상태 저장 완료")
                except Exception as e:
                    pass
            
            print("✓ 프로그램 종료 준비 완료")
            event.accept()
        except Exception as e:
            print(f"⚠️ 프로그램 종료 중 오류: {e}")
            import traceback
            traceback.print_exc()
            event.accept()


def main():
    """메인 함수"""
    app = QApplication(sys.argv)
    
    # 설정 로드
    cfg = load_config()
    
    # GUI 생성
    window = TradingBotGUI(cfg)
    window.show()
    
    sys.exit(app.exec())


if __name__ == '__main__':
    main()


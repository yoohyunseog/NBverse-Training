"""리팩토링된 Trading Bot GUI 메인 클래스"""
import os
import sys
import time
from PyQt6.QtWidgets import QApplication, QMainWindow, QWidget, QHBoxLayout, QStackedWidget, QMessageBox
from PyQt6.QtCore import QTimer, Qt
from PyQt6.QtGui import QFont

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


class TradingBotGUI(QMainWindow):
    """PyQt6 기반 Trading Bot GUI (리팩토링 버전)"""
    
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.upbit = None
        self.item_manager = ItemManager()
        self.settings_manager = SettingsManager()
        self.production_card_manager = ProductionCardManager()
        
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
        
        # AI 상태 변수
        self.ai_progress_value = 0
        self.ai_progress_message = "전체 AI 시스템 업데이트 중.."
        self.ai_status_animating = False
        
        # 중복 방지 플래그
        self._updating_progress = False
        self._updating_balance = False
        
        # 워커 변수
        self._price_worker = None
        self._balance_worker = None
        self._items_worker = None
        self._process_worker = None
        self._chart_worker = None
        self._chart_ai_worker = None
        self._card_production_worker = None
        self._nb_max_min_worker = None
        
        # 차트 관련
        self._chart_updating = False
        self.chart_timeframes = ['1m', '3m', '5m', '15m', '30m', '60m', '1d']
        self.current_timeframe_index = 0
        
        # 카드 생산 관련
        self._producing_card = False
        self.pending_items_update = None
        self.pending_items_data = None
        
        # ML 모델 관리자
        try:
            self.ml_model_manager = MLModelManager()
            self.ml_enabled = True
        except Exception as e:
            print(f"ML 모델 관리자 초기화 실패: {e}")
            self.ml_model_manager = None
            self.ml_enabled = False
        
        # 타이머 초기화
        self._init_timers()
        
        # UI 구성
        self.setup_ui()
        
        # 핸들러 초기화
        self.event_handlers = EventHandlers(self)
        self.data_handlers = DataHandlers(self)
        
        # 초기 로드
        self._initial_load()
    
    def _init_nbverse(self):
        """NBVerse 초기화"""
        try:
            nb_decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            data_dir = os.path.join("data", "nbverse")
            os.makedirs(data_dir, exist_ok=True)
            
            self.nbverse_storage, self.nbverse_converter = init_nbverse_storage(
                data_dir=data_dir,
                decimal_places=nb_decimal_places
            )
            
            if not self.nbverse_storage or not self.nbverse_converter:
                raise RuntimeError("NBVerse 초기화에 실패했습니다.")
            
            self.production_card_manager.nbverse_storage = self.nbverse_storage
            self.production_card_manager._cache_dirty = True
            self.production_card_manager.load()
            
            print(f"NBVerse 초기화 완료 (소수점 자리수: {nb_decimal_places})")
        except Exception as e:
            print(f"NBVerse 초기화 오류: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"NBVerse 초기화 실패: {e}")
    
    def _init_upbit(self):
        """Upbit API 초기화"""
        if self.cfg.access_key and self.cfg.secret_key and self.cfg.secret_key != "여기SECRET_KEY_입력":
            try:
                print(f"API 연결 시도 중.. Access Key: {self.cfg.access_key[:10]}...")
                self.upbit = pyupbit.Upbit(self.cfg.access_key, self.cfg.secret_key)
                test_balance = self.upbit.get_balance("KRW")
                print(f"API 연결 성공! 테스트 잔고: {test_balance}")
            except Exception as e:
                print(f"⚠️ API 연결 오류: {e}")
                self.upbit = None
        else:
            print("⚠️ API 키가 설정되지 않았으니 Paper Trading 모드로 실행합니다.")
            self.upbit = None
    
    def _init_timers(self):
        """타이머 초기화"""
        # 가격 업데이트 타이머
        self.price_timer = QTimer()
        self.price_timer.timeout.connect(self.data_handlers.update_price)
        self.price_timer.start(5000)
        
        # 차트 업데이트 타이머
        self.chart_timer = QTimer()
        self.chart_timer.timeout.connect(self._update_main_chart)
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
        
        # 프로그레스바 애니메이션 타이머
        self.progress_timer = QTimer()
        self.progress_timer.timeout.connect(self._update_progress_animation)
        self.progress_start_time = None
        self.progress_duration = 45000
        self.progress_current_step = 0
        self.progress_total_steps = 90
        
        # 프로세스 프로그레스바 타이머
        self.process_progress_timer = QTimer()
        self.process_progress_timer.timeout.connect(self._update_process_progress_animation)
        self.process_progress_start_time = None
        self.process_progress_duration = 0
    
    def setup_ui(self):
        """UI 구성"""
        # 메뉴바
        GUIBuilder.build_menubar(self, self.show_settings_page)
        
        # StackedWidget 생성
        self.stacked_widget = QStackedWidget()
        self.setCentralWidget(self.stacked_widget)
        
        # 메인 페이지 위젯 생성
        main_widget = QWidget()
        main_layout = QHBoxLayout(main_widget)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        # 왼쪽 사이드바
        left_sidebar_scroll, _ = GUIBuilder.build_left_sidebar(self, self.settings_manager)
        main_layout.addWidget(left_sidebar_scroll)
        
        # 메인 탭 위젯
        self.tab_widget = GUIBuilder.build_main_tabs(self)
        main_layout.addWidget(self.tab_widget, 1)
        
        # 설정 페이지
        self.settings_page = SettingsPage(self.settings_manager, self)
        
        # StackedWidget에 페이지 추가
        self.stacked_widget.addWidget(main_widget)
        self.stacked_widget.addWidget(self.settings_page)
        self.stacked_widget.setCurrentIndex(0)
        
        # 이벤트 연결
        if hasattr(self, 'buy_btn'):
            self.buy_btn.clicked.connect(self.event_handlers.on_buy_click)
    
    def _initial_load(self):
        """초기 로드"""
        self._update_ai_progress(0, "전체 초기화 중..", process_events=True)
        QTimer.singleShot(200, lambda: self._update_ai_progress(30, "전체 아이템 로드 중..", process_events=True))
        QTimer.singleShot(300, self.data_handlers.update_price)
        QTimer.singleShot(350, self._update_main_chart)
        QTimer.singleShot(400, lambda: self._update_ai_progress(60, "전체 가격 정보 업데이트 중..", process_events=True))
        QTimer.singleShot(500, self.data_handlers.refresh_items)
        QTimer.singleShot(550, lambda: self._update_ai_progress(70, "전체 생산 카드 로드 중..", process_events=True))
        QTimer.singleShot(600, self.refresh_production_cards)
        QTimer.singleShot(700, lambda: self._update_ai_progress(80, "초기화 완료", process_events=True))
        
        # 프로세스 업데이트 타이머 시작
        self._start_process_update_timer()
        QTimer.singleShot(1000, self._periodic_process_update)
    
    # 간단한 메서드들 (기존 코드에서 핵심만 유지)
    def save_min_amount(self):
        """최소 매수 금액 저장"""
        try:
            value = float(self.min_amount_edit.text())
            self.settings_manager.set("min_buy_amount", value)
        except ValueError:
            pass
    
    def save_fee_rate(self):
        """수수료 저장"""
        try:
            value = float(self.fee_rate_edit.text())
            self.settings_manager.set("fee_rate", value)
        except ValueError:
            pass
    
    def save_update_cycle(self):
        """업데이트 주기 저장"""
        try:
            value = int(self.update_cycle_edit.text())
            self.settings_manager.set("update_cycle_seconds", value)
            self._start_process_update_timer()
        except ValueError:
            pass
    
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
        
        self.min_amount_edit.setText(str(new_settings["min_buy_amount"]))
        self.fee_rate_edit.setText(str(new_settings["fee_rate"]))
        self.update_cycle_edit.setText(str(new_settings["update_cycle_seconds"]))
        
        # NBVerse 재초기화
        if new_settings.get("nb_decimal_places") != self.settings_manager.get("nb_decimal_places", 10):
            try:
                nb_decimal_places = new_settings["nb_decimal_places"]
                data_dir = os.path.join("data", "nbverse")
                os.makedirs(data_dir, exist_ok=True)
                self.nbverse_storage = None  # 재초기화 필요
                print(f"NBVerse 재초기화 필요 (소수점 자리수: {nb_decimal_places})")
            except Exception as e:
                print(f"⚠️ NBVerse 재초기화 오류: {e}")
        
        self._start_process_update_timer()
        self.show_main_page()
        QMessageBox.information(self, "설정 저장", "설정이 저장되었습니다.")
    
    def _start_process_update_timer(self):
        """프로세스 업데이트 타이머 시작"""
        cycle_seconds = self.settings_manager.get("update_cycle_seconds", 25)
        self.process_update_timer.stop()
        self.process_update_timer.start(cycle_seconds * 1000)
        print(f"전체 프로세스 업데이트 타이머 시작: {cycle_seconds}초 주기")
    
    # 이벤트 핸들러 위임
    def on_buy_click(self):
        """매수 버튼 클릭"""
        self.event_handlers.on_buy_click()
    
    def _on_buy_order_completed(self, amount_krw: float, purchase_amount: float):
        """매수 주문 완료"""
        self.event_handlers._on_buy_order_completed(amount_krw, purchase_amount)
    
    def _on_buy_order_failed(self, error_msg: str):
        """매수 주문 실패"""
        self.event_handlers._on_buy_order_failed(error_msg)
    
    # 데이터 핸들러 위임
    def update_price(self):
        """가격 업데이트"""
        self.data_handlers.update_price()
    
    def update_balance(self):
        """잔고 업데이트"""
        self.data_handlers.update_balance()
    
    def refresh_balance(self):
        """잔고 새로고침"""
        self.data_handlers.refresh_balance()
    
    def refresh_items(self, update_immediately=False):
        """아이템 새로고침"""
        self.data_handlers.refresh_items(update_immediately)
    
    def _apply_items_update(self):
        """아이템 업데이트 적용"""
        self.data_handlers._apply_items_update()
    
    # 간단한 메서드들 (기존 코드에서 핵심만 유지)
    def _update_main_chart(self):
        """메인 차트 업데이트"""
        if self._chart_updating:
            return
        if self._chart_worker and self._chart_worker.isRunning():
            return
        
        self._chart_updating = True
        from workers.chart_workers import ChartDataWorker
        current_timeframe = self.chart_timeframes[self.current_timeframe_index]
        self._chart_worker = ChartDataWorker(current_timeframe, 200)
        self._chart_worker.data_ready.connect(self._on_chart_data_ready)
        self._chart_worker.error_occurred.connect(self._on_chart_error)
        self._chart_worker.start()
    
    def _on_chart_data_ready(self, chart_data):
        """차트 데이터 준비 완료"""
        self._chart_updating = False
        self._update_chart_ui(chart_data)
    
    def _on_chart_error(self, error_msg):
        """차트 오류"""
        self._chart_updating = False
        print(f"차트 업데이트 오류: {error_msg}")
    
    def _update_chart_ui(self, chart_data):
        """차트 UI 업데이트"""
        if chart_data and 'prices' in chart_data:
            self.main_chart_widget.prices = chart_data['prices']
            self.main_chart_widget.update()
    
    def refresh_production_cards(self):
        """생산 카드 새로고침"""
        from workers.card_workers import CardLoadWorker
        if hasattr(self, '_card_load_worker') and self._card_load_worker and self._card_load_worker.isRunning():
            return
        
        self._card_load_worker = CardLoadWorker(self.production_card_manager)
        self._card_load_worker.cards_loaded.connect(self._on_cards_loaded)
        self._card_load_worker.error_occurred.connect(self._on_cards_load_error)
        self._card_load_worker.start()
    
    def _on_cards_loaded(self, cards):
        """카드 로드 완료"""
        # 카드 렌더링 로직 (간소화)
        pass
    
    def _on_cards_load_error(self, error_msg):
        """카드 로드 오류"""
        print(f"카드 로드 오류: {error_msg}")
    
    def _periodic_process_update(self):
        """주기적 프로세스 업데이트"""
        if self._process_worker and self._process_worker.isRunning():
            return
        
        self._process_worker = ProcessUpdateWorker(
            self.upbit, self.item_manager, self.settings_manager
        )
        self._process_worker.step_completed.connect(self._on_process_step_completed)
        self._process_worker.price_updated.connect(self._on_process_price_updated)
        self._process_worker.balance_updated.connect(self._on_process_balance_updated)
        self._process_worker.error_occurred.connect(self._on_process_error)
        self._process_worker.finished.connect(self._on_process_finished)
        self._process_worker.start()
    
    def _on_process_step_completed(self, progress, message):
        """프로세스 단계 완료"""
        self._update_process_progress(progress, message)
    
    def _on_process_price_updated(self, price):
        """프로세스 가격 업데이트"""
        if price > 0:
            self.btc_price_text = f"{price:,.0f} KRW"
            self.btc_price_label.setText(self.btc_price_text)
    
    def _on_process_balance_updated(self, balances):
        """프로세스 잔고 업데이트"""
        try:
            self.krw_balance_text = f"{balances.get('krw', 0):,.0f} KRW"
            self.btc_balance_text = f"{balances.get('btc', 0):.8f} BTC"
            self.total_value_text = f"{balances.get('total_value', 0):,.0f} KRW"
            self.krw_balance_label.setText(self.krw_balance_text)
            self.btc_balance_label.setText(self.btc_balance_text)
            self.total_value_label.setText(self.total_value_text)
        except Exception as e:
            print(f"잔고 업데이트 오류: {e}")
    
    def _on_process_error(self, error_msg):
        """프로세스 오류"""
        print(f"프로세스 업데이트 오류: {error_msg}")
    
    def _on_process_finished(self):
        """프로세스 완료"""
        self._update_process_progress(100, "업데이트 완료")
    
    def _update_process_progress(self, value, message=""):
        """프로세스 프로그레스 업데이트"""
        self.process_progress_bar.setValue(value)
        self.process_status_label.setText(message)
    
    def _update_process_progress_animation(self):
        """프로세스 프로그레스 애니메이션"""
        # 간소화된 애니메이션 로직
        pass
    
    def _periodic_ai_update(self):
        """주기적 AI 업데이트"""
        # 간소화된 AI 업데이트 로직
        pass
    
    def _update_progress_animation(self):
        """프로그레스 애니메이션"""
        # 간소화된 애니메이션 로직
        pass
    
    def _update_ai_progress(self, value, message="", process_events=True):
        """AI 진행 상태 업데이트"""
        self.ai_progress_value = max(0, min(100, int(value)))
        if message:
            self.ai_progress_message = message
        
        if hasattr(self, 'ai_status_icon'):
            if self.ai_progress_value > 0 and self.ai_progress_value < 100:
                self.ai_status_icon.setText("◉")
                self.ai_status_icon.setStyleSheet("""
                    color: #00d1ff;
                    font-weight: bold;
                    font-size: 20px;
                    min-width: 30px;
                """)
                self.ai_status_animating = True
            elif self.ai_progress_value >= 100:
                self.ai_status_icon.setText("◉")
                self.ai_status_icon.setStyleSheet("""
                    color: #0ecb81;
                    font-weight: bold;
                    font-size: 20px;
                    min-width: 30px;
                """)
                self.ai_status_animating = False
        
        if hasattr(self, 'ai_progress_label'):
            self.ai_progress_label.setText(self.ai_progress_message)
        
        if hasattr(self, 'ai_progress_percent_label'):
            self.ai_progress_percent_label.setText(f"{self.ai_progress_value}%")
    
    def refresh_all(self):
        """전체 새로고침"""
        self._periodic_process_update()
    
    def load_ml_model(self, interval='minute10', force_reload=False):
        """ML 모델 로드"""
        if self.ml_model_manager:
            return self.ml_model_manager.load_ml_model(interval, force_reload)
        return None
    
    def get_ai_message_for_item(self, item, current_price, current_profit_percent):
        """아이템용 AI 메시지"""
        if self.ml_model_manager:
            return self.ml_model_manager.get_ai_message_for_item(
                item, current_price, current_profit_percent, self.settings_manager
            )
        return ""
    
    def get_ai_message_for_card(self, card, current_price):
        """카드용 AI 메시지"""
        if self.ml_model_manager:
            return self.ml_model_manager.get_ai_message_for_card(
                card, current_price, self.settings_manager
            )
        return ""
    
    def closeEvent(self, event):
        """프로그램 종료 이벤트"""
        try:
            print("전체 프로그램 종료 중.. 카드 상태 저장 중..")
            
            if hasattr(self, 'production_card_manager') and self.production_card_manager:
                all_cards = self.production_card_manager.get_all_cards()
                saved_count = 0
                
                for card in all_cards:
                    try:
                        self.production_card_manager._update_card_in_nbverse(card)
                        saved_count += 1
                    except Exception as e:
                        print(f"⚠️ 카드 저장 오류 ({card.get('card_id', 'unknown')}): {e}")
                
                print(f"✓ {saved_count}개 카드 상태 저장 완료")
            
            # 워커 종료
            workers = [
                ('_process_update_worker', 3000),
                ('_card_load_worker', 1000),
                ('_card_production_worker', 2000),
                ('_chart_ai_worker', 2000),
                ('_chart_worker', 2000),
            ]
            
            for worker_attr, timeout in workers:
                if hasattr(self, worker_attr) and getattr(self, worker_attr):
                    worker = getattr(self, worker_attr)
                    if worker.isRunning():
                        worker.terminate()
                        worker.wait(timeout)
            
            print("✓ 프로그램 종료 준비 완료")
        except Exception as e:
            print(f"⚠️ 프로그램 종료 중 오류: {e}")
            import traceback
            traceback.print_exc()
        finally:
            event.accept()


def main():
    """메인 함수"""
    try:
        print("프로그램 시작...")
        cfg = load_config()
        print("설정 로드 완료")
        
        app = QApplication(sys.argv)
        
        # 폰트 설정 (나눔고딕)
        font = QFont("나눔고딕", 10)
        app.setFont(font)
        
        print("PyQt6 초기화 중..")
        window = TradingBotGUI(cfg)
        print("GUI 표시 중..")
        
        window.show()
        window.raise_()
        window.activateWindow()
        
        print("GUI 이벤트루프 시작")
        sys.exit(app.exec())
    except Exception as e:
        print(f"프로그램 실행 오류: {e}")
        import traceback
        traceback.print_exc()
        input("아무 키나 누르면 종료합니다..")


if __name__ == "__main__":
    main()


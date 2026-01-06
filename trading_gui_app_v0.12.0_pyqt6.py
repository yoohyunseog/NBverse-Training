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
from profiling.profile_manager import Profiler, get_profiler


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
        
        # 생산 카드 관리자 초기화 (폐기된 카드 관리자 전달)
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
        self._upbit_test_worker = None
        self._verification_worker = None
        self._verification_stats_worker = None
        
        # 검증 카드 캐시 (성능 최적화)
        self._verification_cards_cache = None  # 검증 카드 데이터 캐시
        self._verification_cards_cache_time = 0  # 캐시 생성 시간
        self._verification_stats_cache = None  # 통계 캐시
        self._verification_stats_cache_time = 0  # 통계 캐시 생성 시간
        self._verification_cache_ttl = 30.0  # 캐시 유효 시간 (30초)
        
        # 차트 관련
        self._chart_updating = False
        self.chart_timeframes = ['1m', '3m', '5m', '15m', '30m', '60m', '1d']
        self.current_timeframe_index = 0
        self.current_chart_timeframe = None
        self.current_chart_max_nb = None
        self.current_chart_min_nb = None
        self.current_chart_nb_value = None
        
        # 카드 생산 관련
        self._producing_card = False
        
        # 실제 트레이딩 ON/OFF 토글 (기본: OFF)
        # False: 실제 Upbit 주문 실행 안 함 (모니터링/시뮬레이션 전용)
        # True: 실제 Upbit API를 통해 BUY/SELL 주문 실행
        self.real_trading_enabled = False
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
        
        # 프로파일러 초기화
        self.profiler = Profiler()
        self.profiling_enabled = True
        self.profiling_interval = 300000  # 5분마다 분석 및 저장 (밀리초)
        self.profiling_log_dir = os.path.join("data", "profiling_logs")
        os.makedirs(self.profiling_log_dir, exist_ok=True)
        self.profiler.start()  # 프로파일링 시작 (지속적으로 수집)
        
        # 강화학습 AI 시스템 초기화
        try:
            from ai import RLSystem
            # ProductionCardManager를 전달하여 중복 카드 체크 가능하도록 함
            self.rl_system = RLSystem(
                self.ml_model_manager,
                production_card_manager=self.production_card_manager,
                nbverse_storage=self.nbverse_storage,
                nbverse_converter=self.nbverse_converter,
                settings_manager=self.settings_manager
            ) if self.ml_model_manager else None
            self.rl_enabled = self.rl_system is not None
            if self.rl_enabled:
                # 저장된 모델 로드 시도
                self.rl_system.load_all_models(version="latest")
                print("✅ 강화학습 AI 시스템 초기화 완료")
        except Exception as e:
            print(f"⚠️ 강화학습 AI 시스템 초기화 실패: {e}")
            self.rl_system = None
            self.rl_enabled = False
        
        # UI 구성
        self.setup_ui()
        
        # 핸들러 초기화
        self.event_handlers = EventHandlers(self)
        self.data_handlers = DataHandlers(self)
        
        # 타이머 초기화 (핸들러 초기화 이후)
        self._init_timers()
        
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
            # 폐기된 카드 관리자도 설정 (이미 초기화 시 전달했지만 재확인)
            if not self.production_card_manager.discarded_card_manager:
                self.production_card_manager.discarded_card_manager = self.discarded_card_manager
            
            # 카드 로드는 백그라운드에서 실행 (초기 로드 시 자동으로 호출됨)
            # self.production_card_manager.load()는 제거하고 초기 로드에서 처리
            
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
                
                # API 테스트는 QTimer로 약간 지연하여 백그라운드처럼 실행
                QTimer.singleShot(100, self._test_upbit_connection)
            except Exception as e:
                print(f"⚠️ API 연결 오류: {e}")
                self.upbit = None
        else:
            print("⚠️ API 키가 설정되지 않았으니 Paper Trading 모드로 실행합니다.")
            self.upbit = None
    
    def _test_upbit_connection(self):
        """Upbit API 연결 테스트 (백그라운드 실행)"""
        if not self.upbit:
            return
        
        # 기존 워커가 실행 중이면 종료
        if self._upbit_test_worker and self._upbit_test_worker.isRunning():
            self._upbit_test_worker.terminate()
            self._upbit_test_worker.wait(1000)
        
        # 백그라운드 스레드에서 실행
        from workers.data_workers import BalanceUpdateWorker
        self._upbit_test_worker = BalanceUpdateWorker(self.upbit)
        self._upbit_test_worker.balance_ready.connect(self._on_upbit_test_complete)
        self._upbit_test_worker.finished.connect(lambda: setattr(self, '_upbit_test_worker', None))
        self._upbit_test_worker.start()
    
    def _on_upbit_test_complete(self, balance_data):
        """Upbit API 테스트 완료"""
        try:
            test_balance = balance_data.get('krw', 0)
            print(f"API 연결 성공! 테스트 잔고: {test_balance}")
        except Exception as e:
            print(f"⚠️ API 테스트 결과 처리 오류: {e}")
    
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
        
        # 생산 카드 임시 저장 타이머 (1분마다)
        self.production_card_save_timer = QTimer()
        self.production_card_save_timer.timeout.connect(self._save_production_cards_to_cache)
        self.production_card_save_timer.start(60000)  # 1분 = 60000ms
        
        # 생산 카드 순차 업데이트 관련 변수 (회기 기준)
        self._production_card_widgets = []  # 생산 카드 위젯 리스트
        self._current_update_card_index = 0  # 현재 업데이트할 카드 인덱스
        self._cycle_waiting = False  # 회기 대기 중인지 여부
        self._cycle_start_time = 0  # 회기 시작 시간
        self._min_cycle_interval_ms = 1000  # 최소 회기 간격 (밀리초, 설정에서 가져옴)
        self._current_rl_analysis_card_index = 0  # 현재 강화학습 AI 분석 중인 카드 인덱스
        self._rl_analysis_in_progress = False  # 강화학습 AI 분석 진행 중 플래그
        
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
        
        # 생산 카드 자동 생산 타이머 (60초마다)
        self.auto_production_timer = QTimer()
        self.auto_production_timer.timeout.connect(self._auto_produce_card)
        self.auto_production_timer.start(60000)  # 60초마다 자동 생산
        self._last_auto_production_time = 0
        
        # 프로파일링 타이머 (5분마다)
        self.profiling_timer = QTimer()
        self.profiling_timer.timeout.connect(self._run_profiling_analysis)
        if self.profiling_enabled:
            self.profiling_timer.start(self.profiling_interval)
            print(f"✅ 프로파일링 타이머 시작: {self.profiling_interval/1000}초 주기")
    
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
        # 탭 전환 이벤트 연결 (원활한 전환을 위해 지연 처리)
        self.tab_widget.currentChanged.connect(self._on_tab_changed)
        main_layout.addWidget(self.tab_widget, 1)
        
        # 설정 페이지
        self.settings_page = SettingsPage(self.settings_manager, self)
        
        # StackedWidget에 페이지 추가
        self.stacked_widget.addWidget(main_widget)
        self.stacked_widget.addWidget(self.settings_page)
        self.stacked_widget.setCurrentIndex(0)
        
        # 실제 트레이딩 ON/OFF 토글 버튼 연결
        if hasattr(self, 'trade_toggle_btn'):
            self.trade_toggle_btn.clicked.connect(self._toggle_real_trading)
        
        # 생산 카드 필터 제거됨
    
    def _on_tab_changed(self, index):
        """탭 전환 이벤트 핸들러 (즉시 표시, 백그라운드 업데이트)"""
        try:
            from PyQt6.QtCore import QTimer
            
            # 탭 이름 가져오기
            tab_name = self.tab_widget.tabText(index) if hasattr(self.tab_widget, 'tabText') else ""
            
            # 탭 전환 시 즉시 표시 (지연 없음)
            # 백그라운드에서만 데이터 업데이트 (UI는 즉시 표시)
            if tab_name == "생산 카드":
                # 캐시된 데이터가 있으면 즉시 표시, 백그라운드에서만 업데이트
                # 이미 로드된 데이터가 있으면 새로고침하지 않음 (즉시 표시)
                if not hasattr(self, '_production_cards_loaded') or not self._production_cards_loaded:
                    # 첫 로드인 경우에만 백그라운드에서 로드
                    QTimer.singleShot(0, self.refresh_production_cards)
                else:
                    # 이미 로드된 경우 백그라운드에서만 업데이트 (UI는 즉시 표시)
                    QTimer.singleShot(0, lambda: self.refresh_production_cards())
            elif tab_name == "🧠 AI 검증":
                # 캐시된 데이터가 있으면 즉시 표시, 백그라운드에서만 업데이트
                if hasattr(self, '_verification_cards_cache') and self._verification_cards_cache is not None:
                    # 캐시된 데이터가 있으면 즉시 표시 (지연 없음)
                    QTimer.singleShot(0, lambda: self._on_verification_cards_loaded(self._verification_cards_cache))
                # 백그라운드에서 최신 데이터 업데이트 (UI는 즉시 표시)
                QTimer.singleShot(100, lambda: self.refresh_rl_verification_cards(force_refresh=False))
        except Exception as e:
            print(f"⚠️ 탭 전환 처리 오류: {e}")
    
    def _toggle_real_trading(self):
        """실제 트레이딩 ON/OFF 토글"""
        # 상태 토글
        self.real_trading_enabled = not self.real_trading_enabled
        
        if hasattr(self, 'trade_toggle_btn'):
            if self.real_trading_enabled:
                # ON 상태
                self.trade_toggle_btn.setText("ON")
                self.trade_toggle_btn.setChecked(True)
                self.trade_toggle_btn.setToolTip("현재 상태: 실제 트레이딩 ON\nUpbit 계정으로 실제 주문이 실행됩니다.")
            else:
                # OFF 상태
                self.trade_toggle_btn.setText("OFF")
                self.trade_toggle_btn.setChecked(False)
                self.trade_toggle_btn.setToolTip("현재 상태: 실제 트레이딩 OFF\n모니터링/시뮬레이션 전용 (실제 주문 없음).")
    
    def _initial_load(self):
        """초기 로드 (모든 탭 데이터 미리 로드)"""
        self._update_ai_progress(0, "전체 초기화 중..", process_events=True)
        QTimer.singleShot(200, lambda: self._update_ai_progress(30, "전체 아이템 로드 중..", process_events=True))
        QTimer.singleShot(300, self.data_handlers.update_price)
        QTimer.singleShot(350, self._update_main_chart)
        QTimer.singleShot(400, lambda: self._update_ai_progress(60, "전체 가격 정보 업데이트 중..", process_events=True))
        QTimer.singleShot(500, self.data_handlers.refresh_items)
        QTimer.singleShot(550, lambda: self._update_ai_progress(70, "전체 탭 데이터 로드 중..", process_events=True))
        QTimer.singleShot(600, self._cleanup_duplicate_cards)  # 중복 카드 정리
        
        # 모든 탭 데이터를 백그라운드에서 미리 로드 (탭 전환 시 즉시 표시)
        QTimer.singleShot(650, self.refresh_production_cards)  # 생산 카드 로드
        QTimer.singleShot(700, self.refresh_rl_verification_cards)  # AI 검증 카드 로드
        
        # 생산 카드 로드 완료 플래그 초기화
        self._production_cards_loaded = False
        
        QTimer.singleShot(800, lambda: self._update_ai_progress(80, "초기화 완료", process_events=True))
        
        # 프로세스 업데이트 타이머 시작
        self._start_process_update_timer()
        QTimer.singleShot(1000, self._periodic_process_update)
        
        # 모든 탭 백그라운드 업데이트 타이머 (30초마다 - 매끄러운 탭 전환을 위해)
        self._tab_background_update_timer = QTimer()
        self._tab_background_update_timer.timeout.connect(self._update_all_tabs_background)
        self._tab_background_update_timer.start(30000)  # 30초마다 백그라운드 업데이트
        
        # 만료된 폐기 카드 정리 타이머 (1시간마다)
        self.discarded_cleanup_timer = QTimer()
        self.discarded_cleanup_timer.timeout.connect(self._cleanup_expired_discarded_cards)
        self.discarded_cleanup_timer.start(3600000)  # 1시간
        
        # 오래된 생산 카드 정리 타이머 (1시간마다)
        self.old_card_cleanup_timer = QTimer()
        self.old_card_cleanup_timer.timeout.connect(self._cleanup_old_production_cards)
        self.old_card_cleanup_timer.start(3600000)  # 1시간
        
        # 초기 로드 시에도 한 번 실행
        QTimer.singleShot(60000, self._cleanup_old_production_cards)  # 1분 후 실행
    
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
        
        # 생산 카드 제한이 변경되면 카드 새로고침
        if "production_card_limit" in new_settings:
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(100, self.refresh_production_cards)
        
        self._start_process_update_timer()
        self.show_main_page()
        msg_box = QMessageBox(self)
        msg_box.setWindowTitle("설정 저장")
        msg_box.setText("설정이 저장되었습니다.")
        msg_box.setIcon(QMessageBox.Icon.Information)
        msg_box.setStandardButtons(QMessageBox.StandardButton.Ok)
        self._apply_message_box_style(msg_box)
        msg_box.exec()
    
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
            
            # 현재 타임프레임 업데이트
            if hasattr(self, 'chart_timeframes') and hasattr(self, 'current_timeframe_index'):
                current_timeframe = self.chart_timeframes[self.current_timeframe_index]
                if hasattr(self, 'chart_timeframe_label'):
                    self.chart_timeframe_label.setText(f"타임프레임: {current_timeframe}")
                self.current_chart_timeframe = current_timeframe
            
            # MAX, MIN 계산을 백그라운드에서 실행
            if self._nb_max_min_worker and self._nb_max_min_worker.isRunning():
                return
            
            if self.nbverse_converter:
                from workers.chart_workers import NBMaxMinWorker
                self._nb_max_min_worker = NBMaxMinWorker(
                    chart_data,
                    self.nbverse_converter,
                    self.settings_manager
                )
                self._nb_max_min_worker.max_min_ready.connect(self._on_max_min_ready)
                self._nb_max_min_worker.start()
    
    def _connect_production_card_filter(self):
        """생산 카드 필터 제거됨"""
        pass
    
    def _on_production_card_filter_changed(self):
        """생산 카드 필터 제거됨"""
        pass
    
    def _save_production_cards_to_cache(self):
        """생산 카드를 임시 저장 파일에 저장 (1분마다 자동 호출)"""
        try:
            if not hasattr(self, 'production_card_manager') or not self.production_card_manager:
                return
            
            # 백그라운드에서 저장 (UI 블로킹 방지)
            if hasattr(self.production_card_manager, '_save_cards_to_cache'):
                self.production_card_manager._save_cards_to_cache()
        except Exception as e:
            print(f"⚠️ 생산 카드 임시 저장 오류: {e}")
    
    def _cleanup_duplicate_cards(self):
        """중복 카드 정리 (백그라운드 실행)"""
        try:
            if not hasattr(self, 'production_card_manager') or not self.production_card_manager:
                return
            
            # 백그라운드에서 중복 카드 정리
            from PyQt6.QtCore import QThread, pyqtSignal
            
            class DuplicateCleanupWorker(QThread):
                cleanup_complete = pyqtSignal(int)  # 제거된 카드 개수
                
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
            
            if hasattr(self, '_duplicate_cleanup_worker') and self._duplicate_cleanup_worker and self._duplicate_cleanup_worker.isRunning():
                return
            
            self._duplicate_cleanup_worker = DuplicateCleanupWorker(self.production_card_manager)
            self._duplicate_cleanup_worker.cleanup_complete.connect(self._on_duplicate_cleanup_complete)
            self._duplicate_cleanup_worker.start()
            
        except Exception as e:
            print(f"⚠️ 중복 카드 정리 시작 오류: {e}")
    
    def _on_duplicate_cleanup_complete(self, removed_count):
        """중복 카드 정리 완료"""
        if removed_count > 0:
            print(f"✅ 중복 카드 정리 완료: {removed_count}개 카드 제거됨")
            # 카드 새로고침
            QTimer.singleShot(100, self.refresh_production_cards)
    
    def refresh_production_cards(self):
        """생산 카드 새로고침"""
        from workers.card_workers import CardLoadWorker
        if hasattr(self, '_card_load_worker') and self._card_load_worker and self._card_load_worker.isRunning():
            return
        
        # 모든 카드 로드 (필터는 _on_cards_loaded에서 적용)
        self._card_load_worker = CardLoadWorker(self.production_card_manager)
        self._card_load_worker.cards_ready.connect(self._on_cards_loaded)
        self._card_load_worker.error_occurred.connect(self._on_cards_load_error)
        self._card_load_worker.start()
    
    def refresh_rl_verification_cards(self, force_refresh=False):
        """강화학습 AI 검증 카드 새로고침 (백그라운드 실행, 캐시 사용)"""
        try:
            if not hasattr(self, 'rl_verification_masonry'):
                return
            
            # 기존 워커가 실행 중이면 종료
            if hasattr(self, '_verification_worker') and self._verification_worker and self._verification_worker.isRunning():
                return
            
            # 화면 초기화 (항상 clear하여 중복 방지)
            self.rl_verification_masonry.clear()
            
            # 캐시 확인 (강제 새로고침이 아니고 캐시가 유효하면 캐시 사용)
            import time
            current_time = time.time()
            if not force_refresh and self._verification_cards_cache is not None:
                cache_age = current_time - self._verification_cards_cache_time
                if cache_age < self._verification_cache_ttl:
                    # 캐시된 데이터 사용 (즉시 표시)
                    print(f"✅ 검증 카드 캐시 사용 (캐시 나이: {cache_age:.1f}초)")
                    self._on_verification_cards_loaded(self._verification_cards_cache)
                    # 백그라운드에서만 업데이트 (UI는 즉시 표시)
                    force_refresh = True  # 백그라운드 업데이트를 위해 계속 진행
            
            # 백그라운드 워커로 검증 카드 로드
            from workers.verification_worker import VerificationCardLoadWorker
            
            self._verification_worker = VerificationCardLoadWorker(
                self.production_card_manager,
                self.discarded_card_manager  # 폐기된 카드도 포함
            )
            self._verification_worker.cards_ready.connect(self._on_verification_cards_loaded)
            self._verification_worker.error_occurred.connect(self._on_verification_cards_load_error)
            self._verification_worker.start()
            
        except Exception as e:
            print(f"⚠️ 검증 카드 새로고침 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_verification_cards_loaded(self, verification_cards):
        """검증 카드 로드 완료 (메인 스레드에서 호출, 캐시 저장 및 배치 처리)"""
        try:
            # 화면 초기화 (중복 방지)
            self.rl_verification_masonry.clear()
            
            # 캐시 저장 (전체 카드 저장)
            import time
            self._verification_cards_cache = verification_cards
            self._verification_cards_cache_time = time.time()
            self._verification_cards_displayed = True  # 표시 완료 플래그
            
            if not verification_cards or len(verification_cards) == 0:
                from PyQt6.QtWidgets import QLabel
                from PyQt6.QtCore import Qt
                no_cards_label = QLabel("검증 완료된 카드가 없습니다.\nSELL 판정 후 매도 완료된 카드가 여기에 표시됩니다.")
                no_cards_label.setStyleSheet("color: #888888; font-size: 14px; padding: 20px;")
                no_cards_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                self.rl_verification_masonry.add_widget(no_cards_label)
                # 통계도 0으로 설정
                self._update_verification_stats([])
                return
            
            # 통계는 전체 카드로 계산 (모든 검증 완료 카드 기준)
            self._update_verification_stats_async(verification_cards)
            
            # UI에는 최신 5장만 표시 (렉 방지)
            MAX_DISPLAY_VERIFICATION_CARDS = 5
            display_cards = verification_cards[:MAX_DISPLAY_VERIFICATION_CARDS]
            
            print(f"📊 검증 카드: 전체 {len(verification_cards)}개 중 최신 {len(display_cards)}개만 표시")
            
            # 검증 카드들을 배치로 UI에 표시 (성능 최적화)
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            
            # 배치로 위젯 생성
            verification_card_widgets = []
            for card in display_cards:
                try:
                    from ui.verification_card import VerificationCard
                    verification_card_widget = VerificationCard(
                        card,
                        decimal_places=decimal_places,
                        settings_manager=self.settings_manager
                    )
                    verification_card_widgets.append(verification_card_widget)
                except Exception as e:
                    print(f"⚠️ 검증 카드 위젯 생성 오류: {e}")
                    import traceback
                    traceback.print_exc()
            
            # 배치로 한 번에 추가 (성능 최적화)
            if verification_card_widgets:
                self.rl_verification_masonry.add_widgets_batch(verification_card_widgets)
            
            print(f"✅ {len(verification_cards)}개 검증 카드 중 최신 {len(display_cards)}장 표시 완료 (배치 처리)")
            
        except Exception as e:
            print(f"⚠️ 검증 카드 로드 처리 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_verification_cards_load_error(self, error_msg):
        """검증 카드 로드 오류"""
        print(f"검증 카드 로드 오류: {error_msg}")
        if hasattr(self, 'rl_verification_masonry'):
            self.rl_verification_masonry.clear()
            from PyQt6.QtWidgets import QLabel
            from PyQt6.QtCore import Qt
            error_label = QLabel(f"검증 카드 로드 오류: {error_msg}")
            error_label.setStyleSheet("color: #f6465d; font-size: 14px;")
            error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.rl_verification_masonry.add_widget(error_label)
    
    def _update_verification_stats_async(self, verification_cards):
        """검증 통계 업데이트 (백그라운드 실행, 캐시 사용)"""
        try:
            # 기존 워커가 실행 중이면 종료
            if hasattr(self, '_verification_stats_worker') and self._verification_stats_worker and self._verification_stats_worker.isRunning():
                return
            
            # 통계 캐시 확인
            import time
            current_time = time.time()
            if self._verification_stats_cache is not None:
                cache_age = current_time - self._verification_stats_cache_time
                # 카드 수가 같고 캐시가 유효하면 캐시 사용
                if cache_age < self._verification_cache_ttl and len(verification_cards) == len(self._verification_cards_cache or []):
                    print(f"✅ 검증 통계 캐시 사용 (캐시 나이: {cache_age:.1f}초)")
                    self._on_verification_stats_ready(self._verification_stats_cache)
                    return
            
            # 백그라운드 워커로 통계 및 차트 데이터 계산
            from workers.verification_chart_worker import VerificationChartWorker
            
            self._verification_stats_worker = VerificationChartWorker(verification_cards)
            self._verification_stats_worker.chart_data_ready.connect(self._on_verification_stats_ready)
            self._verification_stats_worker.error_occurred.connect(self._on_verification_stats_error)
            self._verification_stats_worker.start()
            
        except Exception as e:
            print(f"⚠️ 검증 통계 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_verification_stats_ready(self, data):
        """검증 통계 및 차트 데이터 준비 완료 (메인 스레드에서 호출, 캐시 저장)"""
        try:
            # 통계 캐시 저장
            import time
            self._verification_stats_cache = data
            self._verification_stats_cache_time = time.time()
            
            verification_cards = self._get_verification_cards_sync()
            
            if not verification_cards:
                if hasattr(self, 'rl_verification_total_label'):
                    self.rl_verification_total_label.setText("0")
                    self.rl_verification_win_label.setText("0")
                    self.rl_verification_loss_label.setText("0")
                    self.rl_verification_winrate_label.setText("0%")
                    self.rl_verification_avg_pnl_label.setText("0 KRW")
                    self.rl_verification_total_pnl_label.setText("0 KRW")
                    if hasattr(self, 'rl_verification_sim_label'):
                        self.rl_verification_sim_label.setText("0")
                    if hasattr(self, 'rl_verification_real_label'):
                        self.rl_verification_real_label.setText("0")
                    if hasattr(self, 'rl_verification_buy_label'):
                        self.rl_verification_buy_label.setText("0")
                        self.rl_verification_sell_label.setText("0")
                        self.rl_verification_discard_label.setText("0")
                    if hasattr(self, 'rl_verification_rank_labels'):
                        for label in self.rl_verification_rank_labels.values():
                            label.setText("0")
                    if hasattr(self, 'rl_verification_score_label'):
                        self.rl_verification_score_label.setText("0.0")
                        self.rl_verification_score_label.setStyleSheet("color: #9d4edd; font-size: 14px; font-weight: bold;")
                return
            
            total = len(verification_cards)
            wins = 0
            losses = 0
            total_pnl = 0.0
            sim_count = 0  # 모의 실적 개수
            real_count = 0  # 실제 실적 개수
            
            for card in verification_cards:
                history_list = card.get('history_list', [])
                # 가장 최근 SOLD 히스토리 찾기
                for hist in reversed(history_list):
                    if hist.get('type') == 'SOLD':
                        pnl_amount = hist.get('pnl_amount', 0)
                        total_pnl += pnl_amount
                        if pnl_amount > 0:
                            wins += 1
                        elif pnl_amount < 0:
                            losses += 1
                        
                        # 모의/실제 실적 구분
                        is_simulation = hist.get('is_simulation', False)
                        if is_simulation:
                            sim_count += 1
                        else:
                            real_count += 1
                        break
            
            winrate = (wins / total * 100) if total > 0 else 0
            avg_pnl = total_pnl / total if total > 0 else 0
            
            # UI 업데이트
            if hasattr(self, 'rl_verification_total_label'):
                self.rl_verification_total_label.setText(str(total))
                self.rl_verification_win_label.setText(str(wins))
                self.rl_verification_loss_label.setText(str(losses))
                self.rl_verification_winrate_label.setText(f"{winrate:.1f}%")
                self.rl_verification_avg_pnl_label.setText(f"{avg_pnl:,.0f} KRW")
                self.rl_verification_total_pnl_label.setText(f"{total_pnl:,.0f} KRW")
                if hasattr(self, 'rl_verification_sim_label'):
                    self.rl_verification_sim_label.setText(str(sim_count))
                if hasattr(self, 'rl_verification_real_label'):
                    self.rl_verification_real_label.setText(str(real_count))
                
                # AI 판정 횟수 업데이트
                if hasattr(self, 'rl_verification_buy_label'):
                    self.rl_verification_buy_label.setText(str(data.get('buy_count', 0)))
                if hasattr(self, 'rl_verification_sell_label'):
                    self.rl_verification_sell_label.setText(str(data.get('sell_count', 0)))
                if hasattr(self, 'rl_verification_discard_label'):
                    self.rl_verification_discard_label.setText(str(data.get('discard_count', 0)))
                
                # 랭크별 통계 업데이트
                rank_stats = data.get('rank_stats', {})
                if hasattr(self, 'rl_verification_rank_labels'):
                    for rank, label in self.rl_verification_rank_labels.items():
                        count = rank_stats.get(rank, 0)
                        label.setText(str(count))
                
                # 손실률 기반 점수 표시
                avg_loss_rate_score = data.get('avg_loss_rate_score', 0.0)
                if hasattr(self, 'rl_verification_score_label'):
                    score_color = self._get_verification_score_color(avg_loss_rate_score)
                    self.rl_verification_score_label.setText(f"{avg_loss_rate_score:.1f}")
                    self.rl_verification_score_label.setStyleSheet(f"color: {score_color}; font-size: 14px; font-weight: bold;")
                
                # 차트 데이터 업데이트
                pnl_data = data.get('pnl_data', [])
                winrate_data = data.get('winrate_data', [])
                
                if hasattr(self, 'rl_verification_pnl_chart') and pnl_data:
                    self.rl_verification_pnl_chart.prices = pnl_data
                    self.rl_verification_pnl_chart.update()
                
                if hasattr(self, 'rl_verification_winrate_chart') and winrate_data:
                    self.rl_verification_winrate_chart.prices = winrate_data
                    self.rl_verification_winrate_chart.update()
                
        except Exception as e:
            print(f"⚠️ 검증 통계 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _get_verification_score_color(self, score: float) -> str:
        """검증 점수에 따른 색상 반환"""
        if score >= 80:
            return '#0ecb81'  # 초록색 (우수)
        elif score >= 60:
            return '#00d1ff'  # 청록색 (양호)
        elif score >= 40:
            return '#ffa500'  # 주황색 (보통)
        else:
            return '#f6465d'  # 빨간색 (불량)
    
    def _on_verification_stats_error(self, error_msg):
        """검증 통계 계산 오류"""
        print(f"⚠️ 검증 통계 계산 오류: {error_msg}")
    
    def _get_verification_cards_sync(self):
        """검증 카드 동기적으로 가져오기 (통계 계산용)"""
        try:
            if not self.production_card_manager:
                return []
            
            # 모든 카드 가져오기 (REMOVED 제외)
            all_cards = self.production_card_manager.get_all_cards()
            
            # 폐기된 카드도 가져오기 (REMOVED 상태인 카드 포함)
            discarded_cards = []
            if hasattr(self, 'discarded_card_manager') and self.discarded_card_manager:
                try:
                    discarded_cards = self.discarded_card_manager.get_all_discarded_cards()
                except Exception as e:
                    print(f"  ⚠️ 폐기된 카드 로드 오류: {e}")
            
            # 모든 카드 통합 (중복 제거)
            all_verification_cards = {}
            for card in all_cards:
                card_id = card.get('card_id', '')
                if card_id:
                    all_verification_cards[card_id] = card
            
            # 폐기된 카드 추가 (덮어쓰기 가능 - 최신 데이터 우선)
            for card in discarded_cards:
                card_id = card.get('card_id', '')
                if card_id:
                    all_verification_cards[card_id] = card
            
            verification_cards = []
            
            for card in all_verification_cards.values():
                history_list = card.get('history_list', [])
                
                # BUY 히스토리 확인
                has_buy = any(hist.get('type') in ['NEW', 'BUY'] for hist in history_list)
                
                # SOLD 히스토리 확인
                has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
                
                # BUY와 SOLD가 모두 있으면 검증 완료 카드로 포함
                if has_buy and has_sold:
                    verification_cards.append(card)
            
            def get_sold_time(card):
                history_list = card.get('history_list', [])
                # SOLD 시간 우선, 없으면 폐기 시간
                for hist in reversed(history_list):
                    if hist.get('type') == 'SOLD':
                        timestamp = hist.get('timestamp', '')
                        return timestamp
                    # 폐기 히스토리 시간
                    memo = hist.get('memo', '')
                    if '폐기' in memo and ('FREEZE' in memo or 'DELETE' in memo):
                        timestamp = hist.get('timestamp', '')
                        return timestamp
                return ''
            
            verification_cards.sort(key=get_sold_time, reverse=True)
            return verification_cards
            
        except Exception as e:
            print(f"⚠️ 검증 카드 가져오기 오류: {e}")
            return []
    
    def refresh_discarded_cards(self):
        """폐기된 카드 새로고침"""
        try:
            if not hasattr(self, 'discarded_masonry'):
                return
            
            # 화면 초기화
            self.discarded_masonry.clear()
            
            # 폐기된 카드 로드
            discarded_cards = self.discarded_card_manager.get_all_discarded_cards()
            
            if not discarded_cards or len(discarded_cards) == 0:
                from PyQt6.QtWidgets import QLabel
                from PyQt6.QtCore import Qt
                no_cards_label = QLabel("폐기된 카드가 없습니다.")
                no_cards_label.setStyleSheet("color: #888888; font-size: 14px; padding: 20px;")
                no_cards_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                self.discarded_masonry.add_widget(no_cards_label)
                return
            
            # 폐기된 카드들을 UI에 표시
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            
            for card in discarded_cards:
                try:
                    from ui.discarded_card import DiscardedCard
                    discarded_card_widget = DiscardedCard(
                        card,
                        decimal_places=decimal_places,
                        settings_manager=self.settings_manager,
                        restore_callback=self._restore_discarded_card
                    )
                    self.discarded_masonry.add_widget(discarded_card_widget)
                except Exception as e:
                    print(f"⚠️ 폐기 카드 렌더링 오류 ({card.get('card_id', 'unknown')}): {e}")
                    import traceback
                    traceback.print_exc()
            
            print(f"✅ {len(discarded_cards)}개 폐기 카드 로드 완료")
            
        except Exception as e:
            print(f"⚠️ 폐기 카드 새로고침 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _restore_discarded_card(self, card_id: str):
        """폐기된 카드 복구"""
        try:
            # 폐기된 카드 복구
            restored_card = self.discarded_card_manager.restore_card(card_id)
            if not restored_card:
                print(f"⚠️ 폐기 카드 복구 실패: {card_id}")
                return
            
            # 생산 카드 관리자에 다시 추가
            self.production_card_manager.add_card(
                timeframe=restored_card.get('timeframe', '15m'),
                nb_value=restored_card.get('nb_value', 0.0),
                nb_max=restored_card.get('nb_max'),
                nb_min=restored_card.get('nb_min'),
                card_type=restored_card.get('card_type', 'normal'),
                chart_data=restored_card.get('chart_data', {}),
                nb_id=restored_card.get('nb_id'),
                generation=1,
                qty=0.0,
                entry_price=0.0,
                memo="폐기 카드 복구",
                decimal_places=self.settings_manager.get("nb_decimal_places", 10),
                status=restored_card.get('card_state', 'active')
            )
            
            print(f"✅ 폐기 카드 복구 완료: {card_id}")
            
            # UI 새로고침
            QTimer.singleShot(500, self.refresh_production_cards)
            QTimer.singleShot(600, self.refresh_discarded_cards)
            
        except Exception as e:
            print(f"⚠️ 폐기 카드 복구 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _cleanup_expired_discarded_cards(self):
        """만료된 폐기 카드 정리"""
        try:
            cleaned_count = self.discarded_card_manager.cleanup_expired_cards()
            if cleaned_count > 0:
                # UI 새로고침
                QTimer.singleShot(100, self.refresh_production_cards)  # 생산 카드 탭으로 통합
        except Exception as e:
            print(f"⚠️ 만료 폐기 카드 정리 오류: {e}")
    
    def _cleanup_old_production_cards(self):
        """오래된 생산 카드 정리 (20시간 이상)"""
        try:
            if not hasattr(self, 'production_card_manager'):
                return
            
            # 설정에서 임계값 가져오기 (기본값: 20시간)
            hours_threshold = self.settings_manager.get("old_card_cleanup_hours", 20.0)
            cleaned_count = self.production_card_manager.cleanup_old_cards(hours_threshold=hours_threshold)
            
            if cleaned_count > 0:
                print(f"✅ 오래된 생산 카드 {cleaned_count}개 정리 완료")
                # UI 새로고침
                from PyQt6.QtCore import QTimer
                QTimer.singleShot(100, self.refresh_production_cards)
        except Exception as e:
            print(f"⚠️ 오래된 생산 카드 정리 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_cards_loaded(self, cards):
        """카드 로드 완료 (필터 적용)"""
        try:
            # 가격 캐시 서비스 시작 (모든 카드가 공유하는 중앙 가격 업데이트)
            from services.price_cache_service import get_price_cache_service
            price_cache_service = get_price_cache_service()
            price_cache_service.start(interval_ms=10000)  # 10초마다 업데이트 (성능 최적화)
            
            # 화면 초기화
            if hasattr(self, 'production_masonry'):
                self.production_masonry.clear()
            
            # 생산 카드 위젯 리스트 초기화 (순차 업데이트용)
            if hasattr(self, '_production_card_widgets'):
                self._production_card_widgets = []
            self._cycle_waiting = False
            self._current_update_card_index = 0
            
            # 중복 카드 제거 (같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 유지)
            cards = self._remove_duplicate_cards(cards)
            
            # 검증 완료된 카드 제외 (SOLD 히스토리가 있는 카드는 생산 카드 탭에서 제외)
            filtered_cards = []
            for card in cards:
                history_list = card.get('history_list', [])
                has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
                if not has_sold:
                    filtered_cards.append(card)
            
            # 생산 카드 제한 적용
            card_limit = self.settings_manager.get("production_card_limit", 0)
            if card_limit > 0 and len(filtered_cards) > card_limit:
                # 최신 카드부터 정렬 (production_time 기준)
                filtered_cards.sort(key=lambda x: x.get('production_time', ''), reverse=True)
                # 제한 개수만큼만 표시
                filtered_cards = filtered_cards[:card_limit]
                print(f"ℹ️ 생산 카드 제한 적용: {len(cards)}개 중 {card_limit}개만 표시")
            
            if not filtered_cards or len(filtered_cards) == 0:
                # 카드가 없으면 메시지 표시
                from PyQt6.QtWidgets import QLabel
                from PyQt6.QtCore import Qt
                no_cards_label = QLabel("카드가 없습니다.")
                no_cards_label.setStyleSheet("color: #888888; font-size: 14px; padding: 20px;")
                no_cards_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                if hasattr(self, 'production_masonry'):
                    self.production_masonry.add_widget(no_cards_label)
                print(f"⚠️ 생산 카드가 없습니다.")
                return
            
            # 카드들을 UI에 배치하여 추가 (배치 렌더링)
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            
            # 배치 렌더링을 위한 변수
            self._cards_to_render = filtered_cards
            self._current_card_index = 0
            self._decimal_places = decimal_places
            
            # 첫 배치 렌더링 시작
            self._render_production_cards_batch()
            
            # 생산 카드 로드 완료 플래그 설정
            self._production_cards_loaded = True
            
        except Exception as e:
            print(f"카드 로드 처리 오류: {e}")
            import traceback
            traceback.print_exc()
            # 오류가 있어도 플래그 설정 (다음 로드 시도 가능)
            self._production_cards_loaded = True
    
    def _update_all_tabs_background(self):
        """모든 탭을 백그라운드에서 업데이트 (매끄러운 탭 전환을 위해)"""
        try:
            # 현재 활성 탭이 아니어도 백그라운드에서 업데이트
            # 생산 카드 탭 업데이트
            if hasattr(self, 'production_masonry') and self.production_masonry:
                # 백그라운드에서만 업데이트 (UI는 건드리지 않음)
                if hasattr(self, '_card_load_worker') and self._card_load_worker and self._card_load_worker.isRunning():
                    pass  # 이미 업데이트 중
                else:
                    # 백그라운드에서 조용히 업데이트
                    from workers.card_workers import CardLoadWorker
                    self._card_load_worker = CardLoadWorker(self.production_card_manager)
                    # 완료 시에만 UI 업데이트 (조용히)
                    self._card_load_worker.cards_ready.connect(self._on_cards_loaded)
                    self._card_load_worker.error_occurred.connect(lambda e: None)  # 오류 무시
                    self._card_load_worker.start()
            
            # AI 검증 탭 업데이트 (캐시만 업데이트, UI는 현재 탭이 아니면 업데이트 안 함)
            if hasattr(self, 'rl_verification_masonry') and self.rl_verification_masonry:
                # 백그라운드에서만 업데이트
                if hasattr(self, '_verification_worker') and self._verification_worker and self._verification_worker.isRunning():
                    pass  # 이미 업데이트 중
                else:
                    # 백그라운드에서 조용히 업데이트 (캐시만 갱신)
                    from workers.verification_worker import VerificationCardLoadWorker
                    self._verification_worker = VerificationCardLoadWorker(
                        self.production_card_manager,
                        self.discarded_card_manager
                    )
                    # 완료 시 캐시만 업데이트 (현재 탭이 아니면 UI 업데이트 안 함)
                    def update_cache_only(cards):
                        import time
                        self._verification_cards_cache = cards
                        self._verification_cards_cache_time = time.time()
                        # 현재 탭이 AI 검증 탭이면 UI도 업데이트
                        if hasattr(self, 'tab_widget'):
                            current_tab = self.tab_widget.currentIndex()
                            tab_name = self.tab_widget.tabText(current_tab) if hasattr(self.tab_widget, 'tabText') else ""
                            if tab_name == "🧠 AI 검증":
                                self._on_verification_cards_loaded(cards)
                    
                    self._verification_worker.cards_ready.connect(update_cache_only)
                    self._verification_worker.error_occurred.connect(lambda e: None)  # 오류 무시
                    self._verification_worker.start()
        except Exception as e:
            # 백그라운드 업데이트 오류는 조용히 무시
            pass
    
    def _remove_duplicate_cards(self, cards):
        """
        중복 카드 제거 (같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 유지)
        
        Args:
            cards: 카드 리스트
            
        Returns:
            중복 제거된 카드 리스트
        """
        if not cards:
            return cards
        
        # card_key별로 그룹화 (최신 카드만 유지)
        card_dict = {}
        for card in cards:
            card_key = card.get('card_key', '')
            if not card_key:
                # card_key가 없으면 card_id로 대체
                card_key = card.get('card_id', '')
            
            if not card_key:
                continue
            
            # 같은 card_key를 가진 카드가 없거나, 현재 카드가 더 최신이면 업데이트
            if card_key not in card_dict:
                card_dict[card_key] = card
            else:
                # 생산 시간 비교 (최신 것만 유지)
                existing_time = card_dict[card_key].get('production_time', '')
                current_time = card.get('production_time', '')
                if current_time > existing_time:
                    card_dict[card_key] = card
        
        # 중복 제거된 카드 리스트 반환
        unique_cards = list(card_dict.values())
        
        # 중복이 제거되었으면 로그 출력
        if len(unique_cards) < len(cards):
            removed_count = len(cards) - len(unique_cards)
            print(f"✅ 생산 카드 탭 중복 제거: {removed_count}개 중복 카드 제거됨 ({len(cards)}개 → {len(unique_cards)}개)")
        
        return unique_cards
    
    def _filter_production_cards(self, cards):
        """생산 카드 필터링 (UI 반응성을 위해 최적화)"""
        if not hasattr(self, 'production_card_filter'):
            return cards
        
        filter_type = self.production_card_filter.currentText()
        
        if filter_type == "전체":
            # 모든 카드 (활성 카드만 - 검증 완료된 카드 제외)
            # 검증 완료된 카드(SOLD 히스토리가 있는 카드)는 AI 검증 탭에서만 표시
            from managers.production_card_manager import CardState
            all_cards = []
            for card in cards:
                # REMOVED 상태 카드 제외
                if card.get('card_state') == CardState.REMOVED.value:
                    continue
                # SOLD 히스토리가 있는 카드 제외 (검증 완료된 카드)
                history_list = card.get('history_list', [])
                has_sold = any(h.get('type') == 'SOLD' for h in history_list)
                if has_sold:
                    continue
                all_cards.append(card)
            
            # 폐기된 카드도 추가 (UI 반응성을 위해 try-except로 감싸서 오류 시 무시)
            if hasattr(self, 'discarded_card_manager'):
                try:
                    discarded_cards = self.discarded_card_manager.get_all_discarded_cards()
                    # 폐기된 카드 중에서도 SOLD 히스토리가 있는 카드는 제외
                    for discarded_card in discarded_cards:
                        history_list = discarded_card.get('history_list', [])
                        has_sold = any(h.get('type') == 'SOLD' for h in history_list)
                        if not has_sold:  # SOLD 히스토리가 없는 폐기 카드만 추가
                            all_cards.append(discarded_card)
                except Exception as e:
                    print(f"  ⚠️ 폐기된 카드 로드 오류 (무시): {e}")
            return all_cards
        elif filter_type == "보유 중":
            # 활성 카드만 (ACTIVE, OVERLAP_ACTIVE)
            from managers.production_card_manager import CardState
            return [card for card in cards 
                   if card.get('card_state') in [CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value]]
        elif filter_type == "판매 완료":
            # SOLD 히스토리가 있는 카드
            return [card for card in cards 
                   if any(h.get('type') == 'SOLD' for h in card.get('history_list', []))]
        elif filter_type == "폐기":
            # 폐기된 카드만
            if hasattr(self, 'discarded_card_manager'):
                return self.discarded_card_manager.get_all_discarded_cards()
            return []
        
        return cards
    
    def _render_production_cards_batch(self):
        """생산 카드 배치 렌더링 (최적화: 배치 추가 사용)"""
        if not hasattr(self, '_cards_to_render') or not hasattr(self, '_current_card_index'):
            return
        
        try:
            batch_size = 5  # 배치 크기 감소 (5개씩 렌더링 - 초기 로딩 최적화)
            
            # 배치 범위만큼 카드 렌더링
            from PyQt6.QtWidgets import QApplication
            from PyQt6.QtCore import QTimer
            
            # 배치 내에서 모든 카드 생성
            production_cards = []
            for _ in range(batch_size):
                if self._current_card_index >= len(self._cards_to_render):
                    # 남은 카드가 있으면 배치로 추가
                    if production_cards and hasattr(self, 'production_masonry'):
                        self.production_masonry.add_widgets_batch(production_cards)
                    
                    # 모든 카드 렌더링 완료
                    print(f"✅ {len(self._cards_to_render)}개 생산 카드 로드 및 표시 완료")
                    
                    # 생산 카드 순차 업데이트 타이머 시작
                    self._start_production_card_sequential_update()
                    
                    # 정리
                    if hasattr(self, '_cards_to_render'):
                        del self._cards_to_render
                    if hasattr(self, '_current_card_index'):
                        del self._current_card_index
                    if hasattr(self, '_decimal_places'):
                        del self._decimal_places
                    # 마지막 UI 업데이트
                    QApplication.processEvents()
                    return
                
                card = self._cards_to_render[self._current_card_index]
                try:
                    from ui.production_card import ProductionCard
                    
                    production_card = ProductionCard(
                        card, 
                        decimal_places=self._decimal_places, 
                        settings_manager=self.settings_manager,
                        ai_message_callback=self.get_ai_message_for_card,  # 기존 ML AI 콜백
                        rl_ai_callback=self.get_rl_ai_analysis_for_card,  # 강화학습 AI 콜백
                        rl_action_callback=self._execute_rl_action_for_card  # 강화학습 AI 행동 콜백
                    )
                    production_cards.append(production_card)
                    # 생산 카드 위젯 리스트에 추가 (순차 업데이트용)
                    if not hasattr(self, '_production_card_widgets'):
                        self._production_card_widgets = []
                    self._production_card_widgets.append(production_card)
                    
                    # 강화학습 AI 분석 회귀 시작 (첫 번째 카드부터)
                    if len(self._production_card_widgets) == 1:
                        # 첫 번째 카드가 추가되면 분석 시작
                        from PyQt6.QtCore import QTimer
                        QTimer.singleShot(2000, self.trigger_next_rl_analysis)  # 2초 후 시작
                    self._current_card_index += 1
                    
                except Exception as e:
                    print(f"⚠️ 생산 카드 위젯 생성 오류: {e}")
                    import traceback
                    traceback.print_exc()
                    self._current_card_index += 1  # 오류가 있어도 다음 카드로 진행
            
            # 배치로 한 번에 추가 (성능 향상)
            if production_cards and hasattr(self, 'production_masonry'):
                self.production_masonry.add_widgets_batch(production_cards)
            
            # UI 업데이트는 선택적으로만 수행 (성능 최적화)
            # 마지막 배치이거나 일정 간격마다만 processEvents 호출
            if self._current_card_index >= len(self._cards_to_render) or self._current_card_index % 10 == 0:
                QApplication.processEvents()
            
            # 다음 배치 예약 (50ms 후 - 초기 로딩 최적화)
            QTimer.singleShot(50, self._render_production_cards_batch)
            
        except Exception as e:
            print(f"⚠️ 배치 렌더링 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _start_production_card_sequential_update(self):
        """생산 카드 순차 업데이트 시작 (회기 기준)"""
        if not hasattr(self, '_production_card_widgets') or not self._production_card_widgets:
            return
        
        # 설정에서 최소 회기 간격 가져오기 (기본값 1000ms = 1초)
        self._min_cycle_interval_ms = self.settings_manager.get('chart_animation_interval_ms', 1000)
        
        # 현재 업데이트 인덱스 초기화
        self._current_update_card_index = 0
        self._cycle_waiting = False
        
        # 첫 번째 카드 업데이트 시작
        self._update_next_card_in_cycle()
    
    def _update_next_card_in_cycle(self):
        """회기 내 다음 카드 업데이트 (최적화 - 타이머 재사용)"""
        if not hasattr(self, '_production_card_widgets') or not self._production_card_widgets:
            return
        
        # 회기 대기 중이면 체크
        if self._cycle_waiting:
            import time
            elapsed_ms = (time.time() - self._cycle_start_time) * 1000
            if elapsed_ms < self._min_cycle_interval_ms:
                # 아직 최소 대기 시간이 지나지 않음
                # 타이머 재사용 (singleShot 대신 재사용 가능한 타이머 사용)
                if not hasattr(self, '_cycle_timer') or not self._cycle_timer:
                    from PyQt6.QtCore import QTimer
                    self._cycle_timer = QTimer()
                    self._cycle_timer.setSingleShot(True)
                    self._cycle_timer.timeout.connect(self._update_next_card_in_cycle)
                
                # 남은 시간 계산 (최소 500ms, 최대 2000ms)
                remaining_ms = max(500, min(2000, self._min_cycle_interval_ms - elapsed_ms))
                if not self._cycle_timer.isActive():
                    self._cycle_timer.start(int(remaining_ms))
                return
            else:
                # 최소 대기 시간 경과, 다음 회기 시작
                self._cycle_waiting = False
                self._current_update_card_index = 0
        
        try:
            # 현재 인덱스의 카드 업데이트
            if self._current_update_card_index < len(self._production_card_widgets):
                card_widget = self._production_card_widgets[self._current_update_card_index]
                
                # 카드 업데이트 완료 시그널 연결 최적화 (이미 연결되어 있으면 스킵)
                if not hasattr(card_widget, '_update_completed_connected') or not card_widget._update_completed_connected:
                    try:
                        card_widget.update_completed.disconnect()
                    except:
                        pass
                    card_widget.update_completed.connect(self._on_card_update_completed)
                    card_widget._update_completed_connected = True
                
                # 카드 회기 업데이트 시작 (차트, 가격 등 모든 업데이트)
                card_widget.update_card_for_cycle()
                
            else:
                # 모든 카드 업데이트 완료 (회기 완료)
                # 최소 대기 시간 후 다음 회기 시작
                import time
                self._cycle_start_time = time.time()
                self._cycle_waiting = True
                
                # 타이머 재사용 (singleShot 대신)
                if not hasattr(self, '_cycle_timer') or not self._cycle_timer:
                    from PyQt6.QtCore import QTimer
                    self._cycle_timer = QTimer()
                    self._cycle_timer.setSingleShot(True)
                    self._cycle_timer.timeout.connect(self._update_next_card_in_cycle)
                
                if not self._cycle_timer.isActive():
                    self._cycle_timer.start(int(self._min_cycle_interval_ms))
                
        except Exception as e:
            print(f"⚠️ 생산 카드 순차 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
            # 오류가 있어도 다음 카드로 진행
            self._on_card_update_completed()
    
    def _on_card_update_completed(self):
        """카드 업데이트 완료 콜백 (다음 카드로 진행) - 최적화"""
        # 시그널 연결 해제 최적화 (매번 해제하지 않고 유지)
        # if self._current_update_card_index < len(self._production_card_widgets):
        #     card_widget = self._production_card_widgets[self._current_update_card_index]
        #     try:
        #         card_widget.update_completed.disconnect()
        #     except:
        #         pass
        
        # 다음 카드로 이동
        self._current_update_card_index += 1
        
        # 다음 카드 업데이트 시작 (즉시 실행, 타이머 제거)
        self._update_next_card_in_cycle()
    
    def trigger_next_rl_analysis(self):
        """다음 강화학습 AI 분석 트리거 (회귀 방식)"""
        try:
            if not hasattr(self, '_production_card_widgets') or not self._production_card_widgets:
                return
            
            # 이미 분석 중이면 스킵
            if self._rl_analysis_in_progress:
                return
            
            # 분석할 카드 찾기 (순차적으로)
            while self._current_rl_analysis_card_index < len(self._production_card_widgets):
                card_widget = self._production_card_widgets[self._current_rl_analysis_card_index]
                
                # 카드가 분석 가능한지 확인 (SELL 판정 완료된 카드는 제외)
                history_list = card_widget.card.get('history_list', [])
                has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
                
                if not has_sold and hasattr(card_widget, 'update_rl_ai_analysis'):
                    # 분석 시작
                    self._rl_analysis_in_progress = True
                    card_widget.update_rl_ai_analysis()
                    # 다음 카드 인덱스로 이동 (분석 완료 후 다음 카드로)
                    self._current_rl_analysis_card_index += 1
                    return
                
                # 다음 카드로 이동
                self._current_rl_analysis_card_index += 1
            
            # 모든 카드 분석 완료, 처음부터 다시 시작
            self._current_rl_analysis_card_index = 0
            self._rl_analysis_in_progress = False
            
            # 다음 회기 시작 (1초 후)
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(1000, self.trigger_next_rl_analysis)
            
        except Exception as e:
            print(f"⚠️ 강화학습 AI 분석 트리거 오류: {e}")
            import traceback
            traceback.print_exc()
            self._rl_analysis_in_progress = False
    
    def _on_cards_load_error(self, error_msg):
        """카드 로드 오류"""
        print(f"생산 카드 새로고침 오류: {error_msg}")
        if hasattr(self, 'production_masonry'):
            self.production_masonry.clear()
            from PyQt6.QtWidgets import QLabel
            from PyQt6.QtCore import Qt
            error_label = QLabel(f"카드 로드 오류: {error_msg}")
            error_label.setStyleSheet("color: #f6465d; font-size: 14px;")
            error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.production_masonry.add_widget(error_label)
    
    def _produce_new_card(self):
        """새 생산 카드 생성"""
        print(f"📊 _produce_new_card 호출 (생산 중: {self._producing_card})")
        
        # 이미 생산 중이면 건너뛰기
        if self._producing_card:
            print("⚠️ 이미 생산 중이므로 건너뜀")
            return
        
        # NBVerse가 초기화되지 않았으면 건너뛰기
        if not self.nbverse_storage or not self.nbverse_converter:
            print("⚠️ NBVerse가 초기화되지 않았으니 카드 생산 건너뜀")
            print(f"   nbverse_storage: {self.nbverse_storage}, nbverse_converter: {self.nbverse_converter}")
            return
        
        print("[카드 생산] 카드 생산 시작...")
        self._producing_card = True
        
        # 프로그레스바 초기화 및 표시
        if hasattr(self, 'production_progress'):
            self.production_progress.setValue(0)
            self.production_progress.setFormat("카드 생산 시작... %p%")
            self.production_progress.setVisible(True)
        
        # 로그 영역에 시작 메시지 추가
        if hasattr(self, 'production_log_text'):
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            self.production_log_text.appendPlainText(f"[{timestamp}] 카드 생산 시작...")
            scrollbar = self.production_log_text.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())
        
        # 기존 워커가 실행 중이면 종료
        if self._card_production_worker and self._card_production_worker.isRunning():
            self._card_production_worker.terminate()
            self._card_production_worker.wait()
        
        # 백그라운드 스레드에서 카드 생산
        # 좌측 차트에서 계산한 MAX/MIN 값을 전달 (생산 시 사용)
        from workers.card_workers import CardProductionWorker
        self._card_production_worker = CardProductionWorker(
            self.settings_manager,
            self.production_card_manager,
            self.nbverse_storage,
            self.nbverse_converter,
            chart_max_nb=self.current_chart_max_nb,
            chart_min_nb=self.current_chart_min_nb,
            chart_nb_value=self.current_chart_nb_value,  # 좌측 차트에서 계산한 N/B 값
            chart_timeframe=self.current_chart_timeframe
        )
        self._card_production_worker.card_created.connect(self._on_card_produced)
        self._card_production_worker.error_occurred.connect(self._on_card_production_error)
        self._card_production_worker.log_message.connect(self._on_card_production_log)
        self._card_production_worker.progress_updated.connect(self._on_card_production_progress)
        # 워커가 종료되면 (정상 종료 또는 오류) 플래그 해제
        self._card_production_worker.finished.connect(self._on_card_production_finished)
        self._card_production_worker.start()  # 백그라운드 스레드 시작
        print("[카드 생산] 백그라운드 워커 시작")
    
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
            
            # 로그 영역에 완료 메시지 추가
            if hasattr(self, 'production_log_text'):
                from datetime import datetime
                timestamp = datetime.now().strftime("%H:%M:%S")
                self.production_log_text.appendPlainText(f"[{timestamp}] ✅ 카드 생성 완료: {card_id}")
                scrollbar = self.production_log_text.verticalScrollBar()
                scrollbar.setValue(scrollbar.maximum())
            
            # 카드가 목록에 표시되는지 확인 위해 전체 목록 새로고침
            # 시간지연을 두어 저장이 완료되도록 함
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(500, self.refresh_production_cards)
            print(f"⏰ [카드 생산] 전체 목록 새로고침 예약됨")
        except Exception as e:
            print(f"❌ 카드 생성 후처리 오류: {e}")
            import traceback
            traceback.print_exc()
            # 오류 발생 시에도 새로고침 시도
            from PyQt6.QtCore import QTimer
            QTimer.singleShot(500, self.refresh_production_cards)
    
    def _on_card_production_error(self, error_msg):
        """카드 생산 오류"""
        self._producing_card = False
        print(f"❌ 카드 생산 오류: {error_msg}")
        
        # 프로그레스바 오류 표시
        if hasattr(self, 'production_progress'):
            self.production_progress.setValue(0)
            self.production_progress.setFormat(f"오류: {error_msg[:30]}...")
            self.production_progress.setVisible(True)
            # 3초 후 리셋
            from PyQt6.QtCore import QTimer
            def reset_progress():
                if hasattr(self, 'production_progress'):
                    self.production_progress.setValue(0)
                    self.production_progress.setFormat("대기 중... %p%")
            QTimer.singleShot(3000, reset_progress)
        
        # 로그 영역에 오류 메시지 추가
        if hasattr(self, 'production_log_text'):
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            self.production_log_text.appendPlainText(f"[{timestamp}] ❌ 오류: {error_msg}")
            scrollbar = self.production_log_text.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())
    
    def _on_card_production_log(self, log_msg):
        """카드 생산 로그 메시지"""
        if hasattr(self, 'production_log_text'):
            from datetime import datetime
            timestamp = datetime.now().strftime("%H:%M:%S")
            self.production_log_text.appendPlainText(f"[{timestamp}] {log_msg}")
            scrollbar = self.production_log_text.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())
    
    def _on_card_production_progress(self, progress: int, message: str):
        """카드 생산 진행률 업데이트"""
        if hasattr(self, 'production_progress'):
            self.production_progress.setValue(progress)
            self.production_progress.setFormat(f"{message} %p%")
            # 프로그레스바 항상 표시
            self.production_progress.setVisible(True)
            
            # 완료 시 3초 후 0%로 리셋 (숨기지 않음)
            if progress >= 100:
                from PyQt6.QtCore import QTimer
                def reset_progress():
                    if hasattr(self, 'production_progress'):
                        self.production_progress.setValue(0)
                        self.production_progress.setFormat("대기 중... %p%")
                QTimer.singleShot(3000, reset_progress)
    
    def _on_card_production_finished(self):
        """카드 생산 워커 종료"""
        self._producing_card = False
        print("[카드 생산] 워커 종료")
        
        # 프로그레스바가 100%가 아니면 리셋 (오류가 아닌 경우)
        if hasattr(self, 'production_progress'):
            if self.production_progress.value() < 100:
                from PyQt6.QtCore import QTimer
                def reset_progress():
                    if hasattr(self, 'production_progress'):
                        self.production_progress.setValue(0)
                        self.production_progress.setFormat("대기 중... %p%")
                QTimer.singleShot(2000, reset_progress)
    
    def _auto_produce_card(self):
        """자동 카드 생산 (60초마다)"""
        try:
            import time
            current_time = time.time()
            
            # 최소 간격 체크 (60초)
            if current_time - self._last_auto_production_time < 60:
                return
            
            # 이미 생산 중이면 건너뛰기
            if self._producing_card:
                return
            
            # 생산 카드 개수 확인
            if not hasattr(self, 'production_card_manager') or not self.production_card_manager:
                return
            
            active_cards = self.production_card_manager.get_active_cards()
            max_cards = self.production_card_manager.MAX_CARDS
            
            # 최대 개수에 도달하지 않았으면 생산
            if len(active_cards) < max_cards:
                print(f"🔄 자동 카드 생산 시작 (현재: {len(active_cards)}/{max_cards}개)")
                self._last_auto_production_time = current_time
                self._produce_new_card()
        except Exception as e:
            print(f"⚠️ 자동 카드 생산 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_max_min_ready(self, bit_max, bit_min):
        """MAX/MIN 계산 완료"""
        try:
            if bit_max is not None and bit_min is not None:
                decimal_places = self.settings_manager.get("nb_decimal_places", 10)
                
                # MAX/MIN 레이블 업데이트
                if hasattr(self, 'max_nb_label'):
                    self.max_nb_label.setText(f"{bit_max:.{decimal_places}f}")
                if hasattr(self, 'min_nb_label'):
                    self.min_nb_label.setText(f"{bit_min:.{decimal_places}f}")
                
                # 좌측 차트에서 계산한 MAX/MIN 값을 저장 (생산 카드 생성 시 사용)
                self.current_chart_max_nb = bit_max
                self.current_chart_min_nb = bit_min
                
                # 좌측 차트 N/B 값도 계산하여 저장 (생산 카드 생성 시 사용)
                # MAX/MIN 값으로부터 N/B 값 계산 (bitMax와 bitMin을 0~1 범위로 정규화)
                nb_max_normalized = max(0.0, min(1.0, bit_max / 10.0))
                nb_min_normalized = max(0.0, min(1.0, bit_min / 10.0))
                nb_value = (nb_max_normalized + nb_min_normalized) / 2.0
                
                self.current_chart_nb_value = round(nb_value, decimal_places)
                
                print(f"✅ 좌측 차트 N/B 값 계산 완료: {self.current_chart_nb_value:.{decimal_places}f} (MAX: {bit_max:.{decimal_places}f}, MIN: {bit_min:.{decimal_places}f})")
        except Exception as e:
            print(f"⚠️ MAX/MIN 표시 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _periodic_process_update(self):
        """주기적 프로세스 업데이트"""
        if self._process_worker and self._process_worker.isRunning():
            return
        
        cycle_seconds = self.settings_manager.get("update_cycle_seconds", 25)
        self._process_worker = ProcessUpdateWorker(
            self.upbit, cycle_seconds
        )
        self._process_worker.step_completed.connect(self._on_process_step_completed)
        self._process_worker.price_updated.connect(self._on_process_price_updated)
        self._process_worker.balance_updated.connect(self._on_process_balance_updated)
        self._process_worker.error_occurred.connect(self._on_process_error)
        self._process_worker.finished_signal.connect(self._on_process_finished)
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
    
    def _run_profiling_analysis(self):
        """프로파일링 분석 실행 및 텍스트 로그 저장 (백그라운드 실행)"""
        if not self.profiling_enabled:
            return
        
        # 백그라운드 워커로 실행
        from PyQt6.QtCore import QThread, pyqtSignal
        
        class ProfilingWorker(QThread):
            analysis_complete = pyqtSignal(str)  # 로그 파일 경로
            error_occurred = pyqtSignal(str)  # 오류 메시지
            
            def __init__(self, gui_instance):
                super().__init__()
                self.gui = gui_instance
                self.profiler = Profiler()
            
            def run(self):
                try:
                    from datetime import datetime
                    
                    print("📊 프로파일링 분석 시작...")
                    
                    # 현재 실행 중인 프로파일러의 결과를 가져옴
                    # 프로파일러는 계속 실행 중이므로 현재까지의 통계만 가져옴
                    stats_text = self.gui.profiler.get_stats(sort_by='cumulative', limit=50)
                    summary = self.gui.profiler.get_summary()
                    
                    # 타임스탬프 생성
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    log_filename = f"profile_analysis_{timestamp}.txt"
                    log_path = os.path.join(self.gui.profiling_log_dir, log_filename)
                    
                    # 로그 파일에 저장
                    with open(log_path, 'w', encoding='utf-8') as f:
                        f.write("=" * 80 + "\n")
                        f.write(f"프로파일링 분석 결과\n")
                        f.write(f"생성 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                        f.write("=" * 80 + "\n\n")
                        
                        # 요약 정보
                        f.write("[요약 정보]\n")
                        f.write("-" * 80 + "\n")
                        if summary:
                            sorted_summary = sorted(
                                summary.items(),
                                key=lambda x: x[1]['total_time'],
                                reverse=True
                            )
                            f.write(f"{'함수명':<50} {'호출':<8} {'총시간(s)':<12} {'평균(ms)':<12} {'최대(ms)':<12}\n")
                            f.write("-" * 80 + "\n")
                            for func_name, stats in sorted_summary[:30]:
                                f.write(f"{func_name:<50} {stats['call_count']:<8} "
                                       f"{stats['total_time']:<12.4f} "
                                       f"{stats['avg_time']*1000:<12.2f} "
                                       f"{stats['max_time']*1000:<12.2f}\n")
                        else:
                            f.write("⚠️ 기록된 프로파일링 데이터가 없습니다.\n")
                        f.write("\n")
                        
                        # 상세 통계
                        f.write("[상세 통계 (cProfile)]\n")
                        f.write("-" * 80 + "\n")
                        f.write(stats_text)
                        f.write("\n")
                        
                        # 시스템 정보
                        f.write("[시스템 정보]\n")
                        f.write("-" * 80 + "\n")
                        import platform
                        f.write(f"플랫폼: {platform.platform()}\n")
                        f.write(f"Python 버전: {sys.version}\n")
                        if hasattr(self.gui, 'production_card_manager') and self.gui.production_card_manager:
                            try:
                                all_cards = self.gui.production_card_manager.get_all_cards()
                                active_cards = self.gui.production_card_manager.get_active_cards()
                                f.write(f"전체 카드 수: {len(all_cards)}\n")
                                f.write(f"활성 카드 수: {len(active_cards)}\n")
                            except:
                                pass
                        f.write("\n")
                    
                    self.analysis_complete.emit(log_path)
                    
                    # 프로파일러는 계속 실행 상태 유지 (리셋하지 않음)
                    
                except Exception as e:
                    error_msg = f"프로파일링 분석 오류: {e}"
                    print(f"⚠️ {error_msg}")
                    import traceback
                    traceback.print_exc()
                    self.error_occurred.emit(error_msg)
        
        # 기존 워커가 실행 중이면 종료
        if hasattr(self, '_profiling_worker') and self._profiling_worker and self._profiling_worker.isRunning():
            return
        
        # 백그라운드 워커 시작
        self._profiling_worker = ProfilingWorker(self)
        self._profiling_worker.analysis_complete.connect(self._on_profiling_complete)
        self._profiling_worker.error_occurred.connect(self._on_profiling_error)
        self._profiling_worker.finished.connect(lambda: setattr(self, '_profiling_worker', None))
        self._profiling_worker.start()
    
    def _on_profiling_complete(self, log_path):
        """프로파일링 분석 완료"""
        print(f"✅ 프로파일링 분석 완료: {log_path}")
    
    def _on_profiling_error(self, error_msg):
        """프로파일링 분석 오류"""
        print(f"⚠️ {error_msg}")
    
    def _save_final_profiling_result(self):
        """프로그램 종료 시 최종 프로파일링 결과 저장"""
        try:
            from datetime import datetime
            
            if not self.profiler:
                return
            
            # 프로파일링 결과 가져오기
            stats_text = self.profiler.get_stats(sort_by='cumulative', limit=50)
            summary = self.profiler.get_summary()
            
            # 타임스탬프 생성
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            log_filename = f"profile_final_{timestamp}.txt"
            log_path = os.path.join(self.profiling_log_dir, log_filename)
            
            # 로그 파일에 저장
            with open(log_path, 'w', encoding='utf-8') as f:
                f.write("=" * 80 + "\n")
                f.write(f"프로파일링 최종 분석 결과 (프로그램 종료 시)\n")
                f.write(f"생성 시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write("=" * 80 + "\n\n")
                
                # 요약 정보
                f.write("[요약 정보]\n")
                f.write("-" * 80 + "\n")
                if summary:
                    sorted_summary = sorted(
                        summary.items(),
                        key=lambda x: x[1]['total_time'],
                        reverse=True
                    )
                    f.write(f"{'함수명':<50} {'호출':<8} {'총시간(s)':<12} {'평균(ms)':<12} {'최대(ms)':<12}\n")
                    f.write("-" * 80 + "\n")
                    for func_name, stats in sorted_summary[:30]:
                        f.write(f"{func_name:<50} {stats['call_count']:<8} "
                               f"{stats['total_time']:<12.4f} "
                               f"{stats['avg_time']*1000:<12.2f} "
                               f"{stats['max_time']*1000:<12.2f}\n")
                else:
                    f.write("⚠️ 기록된 프로파일링 데이터가 없습니다.\n")
                f.write("\n")
                
                # 상세 통계
                f.write("[상세 통계 (cProfile)]\n")
                f.write("-" * 80 + "\n")
                f.write(stats_text)
                f.write("\n")
            
            print(f"✅ 최종 프로파일링 결과 저장: {log_path}")
            
        except Exception as e:
            print(f"⚠️ 최종 프로파일링 결과 저장 오류: {e}")
    
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
        """카드용 AI 메시지 (기존 ML 모델)"""
        if self.ml_model_manager:
            return self.ml_model_manager.get_ai_message_for_card(
                card, current_price, self.settings_manager
            )
        return ""
    
    def get_rl_ai_analysis_for_card(self, card, current_price):
        """강화학습 AI 분석 (백그라운드 실행)"""
        if not self.rl_system:
            return None
        
        try:
            # 백그라운드 워커로 실행
            from workers.rl_ai_workers import RLAIAnalysisWorker
            worker = RLAIAnalysisWorker(self.rl_system, card, current_price)
            return worker  # 워커 반환 (시그널 연결은 호출자가 처리)
        except Exception as e:
            print(f"⚠️ 강화학습 AI 분석 워커 생성 오류: {e}")
            return None
    
    def _execute_rl_action_for_card(self, card_id: str, action_name: str) -> bool:
        """강화학습 AI 행동 실행 (카드용, 간단한 인터페이스)"""
        return self.execute_rl_action(card_id, 0, action_name)
    
    def execute_rl_action(self, card_id: str, action: int, action_name: str):
        """강화학습 AI 행동 실행 (DELETE/FREEZE 등)"""
        try:
            if not self.production_card_manager:
                return False
            
            if action_name == 'DELETE':
                # 카드 즉시 제거
                # REMOVED 상태인 카드도 찾기 위해 캐시에서 직접 검색
                if self.production_card_manager._cache_dirty:
                    self.production_card_manager.load()
                
                card = None
                # 캐시에서 직접 찾기 (REMOVED 상태 포함)
                for c in self.production_card_manager.cards_cache:
                    if c.get('card_id') == card_id:
                        card = c
                        print(f"  🔍 카드 발견 (캐시): {card_id}, 상태: {c.get('card_state', 'unknown')}, status: {c.get('status', 'unknown')}")
                        break
                
                # 캐시에서 못 찾으면 get_all_cards()에서 찾기 (이미 REMOVED일 수 있음)
                if not card:
                    all_cards = self.production_card_manager.get_all_cards()
                    card = next((c for c in all_cards if c.get('card_id') == card_id), None)
                    if card:
                        print(f"  🔍 카드 발견 (get_all_cards): {card_id}, 상태: {card.get('card_state', 'unknown')}, status: {card.get('status', 'unknown')}")
                
                if not card:
                    print(f"  ⚠️ 카드를 찾을 수 없습니다: {card_id} (이미 REMOVED 상태일 수 있음)")
                    # REMOVED 상태인지 확인하기 위해 NBverse에서 직접 확인
                    if self.nbverse_storage:
                        try:
                            # NBverse에서 직접 로드 시도
                            from managers.production_card_manager import CardState
                            # 카드 상태를 REMOVED로 강제 설정하고 저장
                            print(f"  → NBverse에서 카드 상태를 REMOVED로 강제 설정: {card_id}")
                            # 폐기된 카드 관리자에만 추가하고 종료
                            return True
                        except Exception as e:
                            print(f"  ⚠️ NBverse 확인 오류: {e}")
                    return False
                
                if card:
                    # 폐기된 카드 관리자에 추가
                    from managers.discarded_card_manager import DiscardReason
                    self.discarded_card_manager.discard_card(
                        card,
                        reason=DiscardReason.RL_DELETE,
                        reason_detail="강화학습 AI DELETE 행동"
                    )
                    
                    # 카드 제거 (NBverse에서 삭제)
                    if self.nbverse_storage:
                        from managers.production_card_manager import CardState
                        # 카드 상태를 REMOVED로 변경하고 저장
                        card['card_state'] = CardState.REMOVED.value
                        card['status'] = CardState.REMOVED.value
                        # NBverse에 저장
                        from workers.file_workers import CardUpdateWorker
                        worker = CardUpdateWorker(self.nbverse_storage, card)
                        worker.start()
                        # 스레드가 완료될 때까지 대기 (타임아웃 2초)
                        if not worker.wait(2000):
                            print(f"⚠️ 카드 업데이트 워커가 2초 내에 완료되지 않아 강제 종료합니다: {card_id}")
                            worker.terminate()
                            worker.wait(1000)  # 강제 종료 후 최종 대기
                    
                    # 캐시에서 카드 제거 (REMOVED 상태이므로 get_all_cards()에서 제외됨)
                    # 하지만 명시적으로 제거하여 즉시 반영
                    if hasattr(self.production_card_manager, 'cards_cache'):
                        if card in self.production_card_manager.cards_cache:
                            self.production_card_manager.cards_cache.remove(card)
                            print(f"  ✓ 캐시에서 카드 제거 완료: {card_id}")
                    
                    # 캐시 무효화 (다음 로드 시 REMOVED 상태로 로드됨)
                    self.production_card_manager._cache_dirty = True
                    
                    print(f"✅ 강화학습 AI: 카드 {card_id} 폐기 완료 (보관 기간: {self.discarded_card_manager.retention_days}일)")
                    
                    # UI 새로고침
                    QTimer.singleShot(500, self.refresh_production_cards)
                    QTimer.singleShot(600, self.refresh_production_cards)  # 생산 카드 탭으로 통합
                    
                    # 빈 슬롯이 생겼으므로 새 카드 생산 가능
                    # (자동 생산 로직이 있으면 여기서 트리거)
                    return True
            
            elif action_name == 'FREEZE':
                # 카드 FREEZE 처리 (다음 생산 시 제거 후보)
                all_cards = self.production_card_manager.get_all_cards()
                card = next((c for c in all_cards if c.get('card_id') == card_id), None)
                if card:
                    # 카드 상태를 GRAY로 변경
                    from managers.production_card_manager import CardState
                    card['card_state'] = CardState.GRAY.value
                    card['status'] = CardState.GRAY.value
                    card['removal_pending'] = True
                    
                    # NBverse에 저장
                    if self.nbverse_storage:
                        from workers.file_workers import CardUpdateWorker
                        worker = CardUpdateWorker(self.nbverse_storage, card)
                        worker.start()
                        # 스레드가 완료될 때까지 대기 (타임아웃 2초)
                        if not worker.wait(2000):
                            print(f"⚠️ 카드 업데이트 워커가 2초 내에 완료되지 않아 강제 종료합니다: {card_id}")
                            worker.terminate()
                            worker.wait(1000)  # 강제 종료 후 최종 대기
                    
                    print(f"✅ 강화학습 AI: 카드 {card_id} FREEZE 처리 완료")
                    
                    # UI 새로고침
                    QTimer.singleShot(500, self.refresh_production_cards)
                    
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
            # 종료 확인 대화상자
            from PyQt6.QtWidgets import QMessageBox
            msg_box = QMessageBox(self)
            msg_box.setWindowTitle('프로그램 종료')
            msg_box.setText('정말 프로그램을 종료하시겠습니까?')
            msg_box.setStandardButtons(QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No)
            msg_box.setDefaultButton(QMessageBox.StandardButton.No)
            
            # 다크 테마 스타일시트 적용 (글자 보이도록)
            self._apply_message_box_style(msg_box)
            
            reply = msg_box.exec()
            
            if reply == QMessageBox.StandardButton.No:
                event.ignore()  # 종료 취소
                return
            
            # 프로파일링 타이머 중지
            if hasattr(self, 'profiling_timer'):
                self.profiling_timer.stop()
            
            # 프로파일러 중지 및 마지막 결과 저장
            if hasattr(self, 'profiler') and self.profiler:
                try:
                    self.profiler.stop()
                    # 마지막 프로파일링 결과 저장
                    self._save_final_profiling_result()
                except:
                    pass
            
            # 가격 캐시 서비스 중지
            try:
                from services.price_cache_service import get_price_cache_service
                price_cache_service = get_price_cache_service()
                price_cache_service.stop()
                print("✅ 가격 캐시 서비스 중지 완료")
            except Exception as e:
                print(f"⚠️ 가격 캐시 서비스 중지 오류: {e}")
            
            # 실행 중인 워커 확인
            workers = [
                '_process_update_worker',
                '_card_load_worker',
                '_card_production_worker',
                '_chart_ai_worker',
                '_chart_worker',
                '_nb_max_min_worker',
                '_upbit_test_worker',
                '_price_worker',
                '_balance_worker',
                '_items_worker',
                '_verification_worker',
                '_verification_stats_worker',
            ]
            
            running_workers = []
            for worker_attr in workers:
                try:
                    if hasattr(self, worker_attr) and getattr(self, worker_attr):
                        worker = getattr(self, worker_attr)
                        if worker.isRunning():
                            running_workers.append(worker_attr)
                except:
                    pass
            
            # 실행 중인 워커가 있으면 정상 종료 시도 (강제 종료는 최후의 수단)
            if running_workers:
                print(f"🔄 실행 중인 워커 종료 중: {running_workers}")
                import time
                
                # 모든 워커에 중단 요청 및 quit() 신호 전송 (정상 종료)
                for worker_attr in running_workers:
                    try:
                        if hasattr(self, worker_attr) and getattr(self, worker_attr):
                            worker = getattr(self, worker_attr)
                            if worker.isRunning():
                                # 먼저 중단 요청
                                worker.requestInterruption()
                                # 그 다음 quit() 신호 전송
                                worker.quit()  # 정상 종료 시도
                    except Exception as e:
                        print(f"⚠️ 워커 {worker_attr} 종료 신호 전송 오류: {e}")
                
                # 워커가 완료될 때까지 기다림 (최대 5초)
                start_time = time.time()
                timeout = 5.0
                
                while (time.time() - start_time) < timeout:
                    still_running = []
                    for worker_attr in workers:
                        try:
                            if hasattr(self, worker_attr) and getattr(self, worker_attr):
                                worker = getattr(self, worker_attr)
                                if worker.isRunning():
                                    still_running.append(worker_attr)
                        except:
                            pass
                    
                    if not still_running:
                        break
                    time.sleep(0.1)
                
                # 여전히 실행 중인 워커가 있으면 추가 대기
                if still_running:
                    print(f"⚠️ 일부 워커가 아직 실행 중입니다: {still_running}")
                    print("⚠️ 워커가 완료될 때까지 추가 대기 중... (최대 3초)")
                    # 추가로 3초 더 대기
                    additional_start = time.time()
                    additional_timeout = 3.0
                    while (time.time() - additional_start) < additional_timeout:
                        still_running = []
                        for worker_attr in workers:
                            try:
                                if hasattr(self, worker_attr) and getattr(self, worker_attr):
                                    worker = getattr(self, worker_attr)
                                    if worker.isRunning():
                                        still_running.append(worker_attr)
                            except:
                                pass
                        if not still_running:
                            break
                        time.sleep(0.1)
                    
                    if still_running:
                        print(f"⚠️ 다음 워커가 여전히 실행 중입니다: {still_running}")
                        print("⚠️ 강제 종료하지 않고 프로그램을 종료합니다 (워커는 백그라운드에서 완료될 것입니다)")
                    else:
                        print("✅ 모든 워커 종료 완료")
                
                print("✅ 메인 GUI 워커 종료 완료")
            
            print("전체 프로그램 종료 중.. 카드 상태 저장 중..")
            
            # 생산 카드 위젯의 워커들도 종료 (모든 워커가 완전히 종료될 때까지 대기)
            try:
                if hasattr(self, 'production_masonry') and hasattr(self.production_masonry, 'stored_widgets'):
                    print("🔄 생산 카드 위젯 워커 종료 중...")
                    widgets = list(self.production_masonry.stored_widgets)  # 복사본 사용
                    widget_count = len(widgets)
                    
                    if widget_count > 0:
                        print(f"  → {widget_count}개 위젯의 워커 종료 중...")
                        
                        # 모든 위젯의 cleanup 호출 (wait_for_completion=True로 완전 종료)
                        for idx, widget in enumerate(widgets, 1):
                            if widget and hasattr(widget, 'cleanup'):
                                try:
                                    print(f"  → [{idx}/{widget_count}] 위젯 워커 종료 중...")
                                    widget.cleanup(wait_for_completion=True)  # 완전 종료 대기
                                except Exception as e:
                                    print(f"  ⚠️ 위젯 {idx} 정리 오류: {e}")
                        
                        # 모든 워커가 완전히 종료되었는지 최종 확인
                        import time
                        max_wait_time = 3.0  # 최대 3초 대기
                        start_time = time.time()
                        
                        while (time.time() - start_time) < max_wait_time:
                            all_stopped = True
                            for widget in widgets:
                                if widget:
                                    # 워커 상태 확인
                                    if hasattr(widget, '_ml_worker') and widget._ml_worker:
                                        if widget._ml_worker.isRunning():
                                            all_stopped = False
                                            break
                                    if hasattr(widget, '_rl_worker') and widget._rl_worker:
                                        if widget._rl_worker.isRunning():
                                            all_stopped = False
                                            break
                            
                            if all_stopped:
                                break
                            time.sleep(0.1)
                        
                        if all_stopped:
                            print("✅ 모든 생산 카드 워커 종료 완료")
                        else:
                            print("⚠️ 일부 워커가 아직 실행 중일 수 있습니다 (강제 종료)")
                    else:
                        print("  ℹ️ 종료할 위젯이 없습니다")
            except Exception as e:
                print(f"⚠️ 생산 카드 위젯 정리 오류: {e}")
                import traceback
                traceback.print_exc()
            
            # 카드 저장은 빠르게 처리 (최대 2초 대기)
            if hasattr(self, 'production_card_manager') and self.production_card_manager:
                try:
                    all_cards = self.production_card_manager.get_all_cards()
                    if all_cards and self.nbverse_storage:
                        # 동기적으로 빠르게 저장 (백그라운드 워커 대신)
                        saved_count = 0
                        for card in all_cards[:10]:  # 최대 10개만 저장 (빠른 종료)
                            try:
                                self.production_card_manager._update_card_in_nbverse(card)
                                saved_count += 1
                            except:
                                pass
                        if saved_count > 0:
                            print(f"✓ {saved_count}개 카드 상태 저장 완료")
                except Exception as e:
                    # 저장 오류는 무시하고 계속 진행
                    pass
            
            # 모든 QThread가 완료될 때까지 최종 대기
            from PyQt6.QtCore import QThread
            import time
            print("🔄 모든 스레드 종료 대기 중...")
            start_time = time.time()
            max_wait = 10.0  # 최대 10초 대기 (증가)
            
            # 모든 실행 중인 스레드에 종료 신호 전송
            all_threads = QThread.allThreads()
            for thread in all_threads:
                if thread != QThread.currentThread() and thread.isRunning():
                    try:
                        thread.requestInterruption()
                        thread.quit()
                    except:
                        pass
            
            # 스레드 종료 대기
            while (time.time() - start_time) < max_wait:
                # 실행 중인 스레드 확인
                running_threads = []
                for thread in QThread.allThreads():
                    if thread != QThread.currentThread() and thread.isRunning():
                        running_threads.append(thread)
                
                if not running_threads:
                    break
                
                # 각 스레드에 추가 대기
                for thread in running_threads:
                    try:
                        thread.wait(100)  # 100ms 대기
                    except:
                        pass
                
                time.sleep(0.1)
            
            # 최종 확인
            running_threads = []
            for thread in QThread.allThreads():
                if thread != QThread.currentThread() and thread.isRunning():
                    running_threads.append(thread)
            
            if running_threads:
                print(f"⚠️ {len(running_threads)}개 스레드가 아직 실행 중입니다")
                # 강제 종료는 하지 않음 (안전성)
                print("⚠️ 프로그램을 종료합니다 (스레드는 백그라운드에서 완료될 것입니다)")
            else:
                print("✅ 모든 스레드 종료 완료")
            
            print("✓ 프로그램 종료 준비 완료")
            event.accept()
        except Exception as e:
            print(f"⚠️ 프로그램 종료 중 오류: {e}")
            import traceback
            traceback.print_exc()
            # 오류가 발생해도 종료는 진행
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


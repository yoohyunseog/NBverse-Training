"""UI 구성 모듈 - GUI 레이아웃 및 위젯 생성"""
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QPushButton, 
    QLineEdit, QTabWidget, QScrollArea, QFrame, QProgressBar, 
    QPlainTextEdit, QStackedWidget, QSizePolicy, QComboBox
)
from PyQt6.QtCore import Qt
from ui.masonry_layout import MasonryLayout
from ui.production_card import ChartWidget
from ui.settings_page import SettingsPage


class GUIBuilder:
    """GUI 구성 빌더 클래스"""
    
    @staticmethod
    def build_menubar(window, settings_handler):
        """메뉴바 구성"""
        menubar = window.menuBar()
        menubar.setStyleSheet("""
            QMenuBar {
                background-color: #1e2329;
                color: #ffffff;
                padding: 5px;
            }
            QMenuBar::item {
                background-color: transparent;
                padding: 5px 15px;
            }
            QMenuBar::item:selected {
                background-color: #2b3139;
            }
            QMenu {
                background-color: #1e2329;
                color: #ffffff;
                border: 1px solid #444444;
            }
            QMenu::item:selected {
                background-color: #2b3139;
            }
        """)
        
        settings_menu = menubar.addMenu("설정")
        settings_action = settings_menu.addAction("설정 열기")
        settings_action.triggered.connect(settings_handler)
        return menubar
    
    @staticmethod
    def build_left_sidebar(window, settings_manager):
        """왼쪽 사이드바 구성"""
        from PyQt6.QtWidgets import QScrollArea
        
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setStyleSheet("background-color: #1e2329; border: none;")
        scroll.setMinimumWidth(300)
        scroll.setMaximumWidth(450)
        
        sidebar = QFrame()
        sidebar.setStyleSheet("background-color: #1e2329; padding: 15px; border-radius: 5px;")
        layout = QVBoxLayout(sidebar)
        layout.setSpacing(10)
        
        # 위젯들을 생성하고 layout에 추가
        widgets = GUIBuilder._build_sidebar_widgets(window, settings_manager)
        for widget in widgets:
            layout.addWidget(widget)
        
        scroll.setWidget(sidebar)
        return scroll, widgets
    
    @staticmethod
    def _build_sidebar_widgets(window, settings_manager):
        """사이드바 위젯들 생성"""
        widgets = []
        
        # BTC 가격
        price_frame = QFrame()
        price_layout = QHBoxLayout(price_frame)
        btc_price_title = QLabel("BTC 현재 가격")
        btc_price_title.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        price_layout.addWidget(btc_price_title)
        
        window.btc_price_label = QLabel("0")
        window.btc_price_label.setStyleSheet("color: #00d1ff; font-size: 14px; font-weight: bold;")
        window.btc_price_label.setWordWrap(True)
        price_layout.addWidget(window.btc_price_label, 1)
        widgets.append(price_frame)
        
        # KRW 잔고
        krw_frame = QFrame()
        krw_layout = QHBoxLayout(krw_frame)
        krw_title = QLabel("KRW 잔고:")
        krw_title.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        krw_layout.addWidget(krw_title)
        
        window.krw_balance_label = QLabel("0")
        window.krw_balance_label.setStyleSheet("color: #ffffff; font-size: 14px; font-weight: bold;")
        window.krw_balance_label.setWordWrap(True)
        krw_layout.addWidget(window.krw_balance_label, 1)
        widgets.append(krw_frame)
        
        # BTC 잔고
        btc_frame = QFrame()
        btc_layout = QHBoxLayout(btc_frame)
        btc_title = QLabel("BTC 잔고:")
        btc_title.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        btc_layout.addWidget(btc_title)
        
        window.btc_balance_label = QLabel("0")
        window.btc_balance_label.setStyleSheet("color: #ffffff; font-size: 14px; font-weight: bold;")
        window.btc_balance_label.setWordWrap(True)
        btc_layout.addWidget(window.btc_balance_label, 1)
        widgets.append(btc_frame)
        
        # 총산
        total_frame = QFrame()
        total_layout = QHBoxLayout(total_frame)
        total_title = QLabel("총산:")
        total_title.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        total_layout.addWidget(total_title)
        
        window.total_value_label = QLabel("0")
        window.total_value_label.setStyleSheet("color: #0ecb81; font-size: 14px; font-weight: bold;")
        window.total_value_label.setWordWrap(True)
        total_layout.addWidget(window.total_value_label, 1)
        widgets.append(total_frame)
        
        # 구분선
        separator1 = QFrame()
        separator1.setFrameShape(QFrame.Shape.HLine)
        separator1.setStyleSheet("background-color: #444444; max-height: 1px;")
        widgets.append(separator1)
        
        # MAX, MIN
        max_frame = QFrame()
        max_layout = QHBoxLayout(max_frame)
        max_title = QLabel("MAX:")
        max_title.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        max_layout.addWidget(max_title)
        
        window.max_nb_label = QLabel("0.0000000000")
        window.max_nb_label.setStyleSheet("color: #0ecb81; font-size: 14px; font-weight: bold;")
        window.max_nb_label.setWordWrap(True)
        max_layout.addWidget(window.max_nb_label, 1)
        widgets.append(max_frame)
        
        min_frame = QFrame()
        min_layout = QHBoxLayout(min_frame)
        min_title = QLabel("MIN:")
        min_title.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        min_layout.addWidget(min_title)
        
        window.min_nb_label = QLabel("0.0000000000")
        window.min_nb_label.setStyleSheet("color: #f6465d; font-size: 14px; font-weight: bold;")
        window.min_nb_label.setWordWrap(True)
        min_layout.addWidget(window.min_nb_label, 1)
        widgets.append(min_frame)
        
        # 차트
        chart_label = QLabel("전체 현재 가격차트")
        chart_label.setStyleSheet("color: #ffffff; font-size: 14px; font-weight: bold; margin-top: 10px;")
        widgets.append(chart_label)
        
        window.chart_timeframe_label = QLabel("타임프레임: 1m")
        window.chart_timeframe_label.setStyleSheet("color: #888888; font-size: 11px; margin-top: 5px;")
        widgets.append(window.chart_timeframe_label)
        
        window.main_chart_widget = ChartWidget([])
        window.main_chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #333333; border-radius: 3px;")
        window.main_chart_widget.setMinimumHeight(120)
        window.main_chart_widget.setMaximumHeight(150)
        widgets.append(window.main_chart_widget)
        
        # 차트 AI 분석 영역
        chart_ai_frame = QFrame()
        chart_ai_frame.setStyleSheet("""
            QFrame {
                background-color: #0a1a2a;
                border: 2px solid #00d1ff;
                border-radius: 5px;
                padding: 8px;
                margin-top: 5px;
            }
        """)
        chart_ai_layout = QVBoxLayout(chart_ai_frame)
        chart_ai_layout.setSpacing(5)
        
        chart_signal_layout = QHBoxLayout()
        chart_signal_title = QLabel("전체 차트 AI 시그널")
        chart_signal_title.setStyleSheet("color: #00d1ff; font-weight: bold; font-size: 12px;")
        chart_signal_layout.addWidget(chart_signal_title)
        
        window.chart_ai_signal_label = QLabel("HOLD")
        window.chart_ai_signal_label.setStyleSheet("""
            color: #ffffff;
            font-weight: bold;
            font-size: 14px;
            padding: 3px 8px;
            background-color: #2b3139;
            border-radius: 3px;
        """)
        chart_signal_layout.addWidget(window.chart_ai_signal_label)
        chart_signal_layout.addStretch()
        chart_ai_layout.addLayout(chart_signal_layout)
        
        window.chart_ai_message_label = QLabel("전체 차트 AI 분석 중..")
        window.chart_ai_message_label.setStyleSheet("""
            color: #ffffff;
            font-size: 11px;
            padding: 5px;
            background-color: #1a2a3a;
            border-radius: 3px;
        """)
        window.chart_ai_message_label.setWordWrap(True)
        window.chart_ai_message_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        chart_ai_layout.addWidget(window.chart_ai_message_label)
        widgets.append(chart_ai_frame)
        
        # 구분선
        separator2 = QFrame()
        separator2.setFrameShape(QFrame.Shape.HLine)
        separator2.setStyleSheet("background-color: #444444; max-height: 1px;")
        widgets.append(separator2)
        
        # 설정 영역
        min_amount_frame = QFrame()
        min_amount_layout = QHBoxLayout(min_amount_frame)
        min_amount_label = QLabel("최소 매수 금액:")
        min_amount_label.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        min_amount_layout.addWidget(min_amount_label)
        
        window.min_amount_edit = QLineEdit(str(settings_manager.get("min_buy_amount", 5000)))
        window.min_amount_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 5px;")
        min_amount_layout.addWidget(window.min_amount_edit, 1)
        
        krw_label = QLabel("KRW")
        krw_label.setStyleSheet("color: #ffffff; font-size: 12px;")
        min_amount_layout.addWidget(krw_label)
        widgets.append(min_amount_frame)
        
        fee_frame = QFrame()
        fee_layout = QHBoxLayout(fee_frame)
        fee_label = QLabel("수수료")
        fee_label.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        fee_layout.addWidget(fee_label)
        
        window.fee_rate_edit = QLineEdit(str(settings_manager.get("fee_rate", 0.1)))
        window.fee_rate_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 5px;")
        fee_layout.addWidget(window.fee_rate_edit, 1)
        
        percent_label = QLabel("%")
        percent_label.setStyleSheet("color: #ffffff; font-size: 12px;")
        fee_layout.addWidget(percent_label)
        widgets.append(fee_frame)
        
        cycle_frame = QFrame()
        cycle_layout = QHBoxLayout(cycle_frame)
        cycle_label = QLabel("업데이트 주기:")
        cycle_label.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        cycle_layout.addWidget(cycle_label)
        
        window.update_cycle_edit = QLineEdit(str(settings_manager.get("update_cycle_seconds", 25)))
        window.update_cycle_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 5px;")
        cycle_layout.addWidget(window.update_cycle_edit, 1)
        
        sec_label = QLabel("초")
        sec_label.setStyleSheet("color: #ffffff; font-size: 12px;")
        cycle_layout.addWidget(sec_label)
        widgets.append(cycle_frame)
        
        # 실제 트레이딩 ON/OFF 토글 버튼
        trade_toggle_frame = QFrame()
        trade_toggle_layout = QHBoxLayout(trade_toggle_frame)
        trade_toggle_layout.setContentsMargins(0, 0, 0, 0)
        trade_toggle_layout.setSpacing(8)
        
        toggle_label = QLabel("실제 트레이딩:")
        toggle_label.setStyleSheet("color: #ffffff; font-size: 12px; min-width: 120px;")
        trade_toggle_layout.addWidget(toggle_label)
        
        trade_toggle_btn = QPushButton("OFF")
        trade_toggle_btn.setCheckable(True)
        trade_toggle_btn.setStyleSheet("""
            QPushButton {
                background-color: #3a1a1a;
                color: #ff6b6b;
                font-weight: bold;
                padding: 6px 18px;
                border-radius: 5px;
            }
            QPushButton:checked {
                background-color: #0ecb81;
                color: #ffffff;
            }
        """)
        trade_toggle_btn.setToolTip("OFF: 실제 주문 없음 (모니터링 전용)\nON: 실제 Upbit 계정으로 매매 실행")
        trade_toggle_layout.addWidget(trade_toggle_btn)
        
        # 메인 윈도우에서 접근 가능하도록 저장
        window.trade_toggle_btn = trade_toggle_btn
        widgets.append(trade_toggle_frame)
        
        # 프로세스 진행 상태
        process_progress_outer_frame = QFrame()
        process_progress_outer_frame.setStyleSheet("""
            QFrame {
                background-color: #0b1220;
                border: 2px solid #00d1ff;
                border-radius: 3px;
            }
        """)
        process_progress_outer_frame.setMinimumHeight(50)
        process_progress_layout = QVBoxLayout(process_progress_outer_frame)
        process_progress_layout.setContentsMargins(15, 10, 15, 10)
        process_progress_layout.setSpacing(5)
        
        window.process_status_label = QLabel("전체 프로세스 업데이트 중..")
        window.process_status_label.setStyleSheet("color: #00d1ff; font-weight: bold; font-size: 12px;")
        window.process_status_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        process_progress_layout.addWidget(window.process_status_label)
        
        window.process_progress_bar = QProgressBar()
        window.process_progress_bar.setMinimum(0)
        window.process_progress_bar.setMaximum(100)
        window.process_progress_bar.setValue(0)
        window.process_progress_bar.setStyleSheet("""
            QProgressBar {
                border: 1px solid #444444;
                border-radius: 3px;
                text-align: center;
                background-color: #1a1a1a;
                color: #ffffff;
                font-weight: bold;
                height: 20px;
            }
            QProgressBar::chunk {
                background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #00d1ff, stop:1 #0ecb81);
                border-radius: 2px;
            }
        """)
        window.process_progress_bar.setFormat("%p%")
        process_progress_layout.addWidget(window.process_progress_bar)
        widgets.append(process_progress_outer_frame)
        
        # AI 업데이트 상태 표시
        ai_progress_outer_frame = QFrame()
        ai_progress_outer_frame.setStyleSheet("""
            QFrame {
                background-color: #0b1220;
                border: 2px solid #ffffff;
                border-radius: 3px;
            }
        """)
        ai_progress_outer_frame.setMinimumHeight(60)
        ai_progress_layout = QHBoxLayout(ai_progress_outer_frame)
        ai_progress_layout.setContentsMargins(15, 10, 15, 10)
        ai_progress_layout.setSpacing(15)
        
        window.ai_status_icon = QLabel("○")
        window.ai_status_icon.setStyleSheet("""
            color: #888888;
            font-weight: bold;
            font-size: 20px;
            min-width: 30px;
        """)
        window.ai_status_icon.setAlignment(Qt.AlignmentFlag.AlignCenter | Qt.AlignmentFlag.AlignVCenter)
        ai_progress_layout.addWidget(window.ai_status_icon)
        
        window.ai_progress_label = QLabel("전체 AI 시스템 업데이트 중..")
        window.ai_progress_label.setStyleSheet("color: #00d1ff; font-weight: bold; font-size: 13px;")
        window.ai_progress_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)
        window.ai_progress_label.setWordWrap(True)
        ai_progress_layout.addWidget(window.ai_progress_label, 1)
        
        window.ai_progress_percent_label = QLabel("0%")
        window.ai_progress_percent_label.setStyleSheet("""
            color: #ffffff;
            font-weight: bold;
            font-size: 14px;
            min-width: 50px;
        """)
        ai_progress_layout.addWidget(window.ai_progress_percent_label)
        widgets.append(ai_progress_outer_frame)
        
        return widgets
    
    @staticmethod
    def build_main_tabs(window):
        """메인 탭 위젯 구성"""
        tab_widget = QTabWidget()
        tab_widget.setStyleSheet("""
            QTabWidget::pane {
                background-color: #0b1220;
                border: none;
            }
            QTabBar::tab {
                background-color: #2b3139;
                color: #ffffff;
                padding: 8px 20px;
                border-top-left-radius: 5px;
                border-top-right-radius: 5px;
            }
            QTabBar::tab:selected {
                background-color: #1e2329;
            }
        """)
        
        # 보유 중 탭
        active_scroll = QScrollArea()
        active_scroll.setWidgetResizable(True)
        active_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        active_scroll.setStyleSheet("background-color: #0b1220; border: none;")
        window.active_masonry = MasonryLayout(columns=3, min_card_width=280)
        active_scroll.setWidget(window.active_masonry)
        tab_widget.addTab(active_scroll, "보유 중")
        
        # 생산 카드 탭 (모든 카드 상태 통합 관리)
        production_widget = QWidget()
        production_layout = QVBoxLayout(production_widget)
        production_layout.setContentsMargins(10, 10, 10, 10)
        production_layout.setSpacing(10)
        
        production_scroll = QScrollArea()
        production_scroll.setWidgetResizable(True)
        production_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        production_scroll.setStyleSheet("background-color: #0b1220; border: none;")
        
        window.production_masonry = MasonryLayout(columns=3, min_card_width=280)
        production_scroll.setWidget(window.production_masonry)
        production_layout.addWidget(production_scroll, 1)
        
        # 생산 카드 로그 영역
        log_frame = QFrame()
        log_frame.setStyleSheet("""
            QFrame {
                background-color: #0a1a1a;
                border: 2px solid #00d1ff;
                border-radius: 3px;
            }
        """)
        log_frame.setMinimumHeight(150)
        log_frame.setMaximumHeight(200)
        log_layout = QVBoxLayout(log_frame)
        log_layout.setContentsMargins(10, 8, 10, 8)
        log_layout.setSpacing(5)
        
        log_header = QLabel("전체 생산 카드 로그")
        log_header.setStyleSheet("color: #00d1ff; font-size: 14px; font-weight: bold;")
        log_layout.addWidget(log_header)
        
        # 생산 프로그레스바
        from PyQt6.QtWidgets import QProgressBar
        window.production_progress = QProgressBar()
        window.production_progress.setRange(0, 100)
        window.production_progress.setValue(0)
        window.production_progress.setStyleSheet("""
            QProgressBar {
                border: 1px solid #9d4edd;
                border-radius: 3px;
                text-align: center;
                background-color: #1a0a2a;
                height: 25px;
                font-size: 11px;
            }
            QProgressBar::chunk {
                background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #9d4edd, stop:1 #c77dff);
                border-radius: 2px;
            }
        """)
        window.production_progress.setFormat("대기 중... %p%")
        window.production_progress.setVisible(True)  # 항상 표시
        window.production_progress.setValue(0)  # 초기값 0%
        log_layout.addWidget(window.production_progress)
        
        window.production_log_text = QPlainTextEdit()
        window.production_log_text.setReadOnly(True)
        window.production_log_text.setStyleSheet("""
            QPlainTextEdit {
                background-color: #0a0a0a;
                color: #00d1ff;
                border: 1px solid #333333;
                border-radius: 3px;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 14px;
                padding: 8px;
            }
        """)
        log_layout.addWidget(window.production_log_text)
        production_layout.addWidget(log_frame)
        
        tab_widget.addTab(production_widget, "생산 카드")
        
        # 강화학습 AI 검증 탭 (통합 스크롤)
        verification_scroll = QScrollArea()
        verification_scroll.setWidgetResizable(True)
        verification_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        verification_scroll.setStyleSheet("background-color: #0b1220; border: none;")
        
        verification_content = QWidget()
        verification_layout = QVBoxLayout(verification_content)
        verification_layout.setContentsMargins(10, 10, 10, 10)
        verification_layout.setSpacing(10)
        
        # 통계 요약 영역
        stats_frame = QFrame()
        stats_frame.setStyleSheet("""
            QFrame {
                background-color: #1a0a2a;
                border: 2px solid #9d4edd;
                border-radius: 5px;
                padding: 10px;
            }
        """)
        stats_layout = QVBoxLayout(stats_frame)
        stats_layout.setSpacing(10)
        
        stats_header = QLabel("🧠 강화학습 AI 검증 통계")
        stats_header.setStyleSheet("color: #9d4edd; font-size: 18px; font-weight: bold; background-color: transparent;")
        stats_layout.addWidget(stats_header)
        
        # 통계 그리드
        stats_grid = QGridLayout()
        stats_grid.setSpacing(10)
        stats_grid.setColumnStretch(0, 1)  # 라벨 컬럼
        stats_grid.setColumnStretch(1, 2)  # 값 컬럼
        stats_grid.setColumnStretch(2, 1)  # 라벨 컬럼
        stats_grid.setColumnStretch(3, 2)  # 값 컬럼
        
        window.rl_verification_total_label = QLabel("0")
        window.rl_verification_total_label.setStyleSheet("color: #ffffff; font-size: 14px; font-weight: bold;")
        window.rl_verification_total_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        total_label = QLabel("총 검증 카드:")
        total_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        total_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(total_label, 0, 0)
        stats_grid.addWidget(window.rl_verification_total_label, 0, 1)
        
        window.rl_verification_win_label = QLabel("0")
        window.rl_verification_win_label.setStyleSheet("color: #0ecb81; font-size: 14px; font-weight: bold;")
        window.rl_verification_win_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        win_label = QLabel("승리:")
        win_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        win_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(win_label, 0, 2)
        stats_grid.addWidget(window.rl_verification_win_label, 0, 3)
        
        window.rl_verification_loss_label = QLabel("0")
        window.rl_verification_loss_label.setStyleSheet("color: #f6465d; font-size: 14px; font-weight: bold;")
        window.rl_verification_loss_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        loss_label = QLabel("손실:")
        loss_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        loss_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(loss_label, 1, 0)
        stats_grid.addWidget(window.rl_verification_loss_label, 1, 1)
        
        window.rl_verification_winrate_label = QLabel("0%")
        window.rl_verification_winrate_label.setStyleSheet("color: #9d4edd; font-size: 14px; font-weight: bold;")
        window.rl_verification_winrate_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        winrate_label = QLabel("승률:")
        winrate_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        winrate_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(winrate_label, 1, 2)
        stats_grid.addWidget(window.rl_verification_winrate_label, 1, 3)
        
        window.rl_verification_avg_pnl_label = QLabel("0 KRW")
        window.rl_verification_avg_pnl_label.setStyleSheet("color: #ffffff; font-size: 14px; font-weight: bold;")
        window.rl_verification_avg_pnl_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        avg_pnl_label = QLabel("평균 손익:")
        avg_pnl_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        avg_pnl_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(avg_pnl_label, 2, 0)
        stats_grid.addWidget(window.rl_verification_avg_pnl_label, 2, 1)
        
        window.rl_verification_total_pnl_label = QLabel("0 KRW")
        window.rl_verification_total_pnl_label.setStyleSheet("color: #9d4edd; font-size: 14px; font-weight: bold;")
        window.rl_verification_total_pnl_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        total_pnl_label = QLabel("총 손익:")
        total_pnl_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        total_pnl_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(total_pnl_label, 2, 2)
        stats_grid.addWidget(window.rl_verification_total_pnl_label, 2, 3)
        
        # 모의/실제 실적 구분
        window.rl_verification_sim_label = QLabel("0")
        window.rl_verification_sim_label.setStyleSheet("color: #ffa500; font-size: 14px; font-weight: bold;")
        window.rl_verification_sim_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        sim_label = QLabel("🧪 모의 실적:")
        sim_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        sim_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(sim_label, 3, 0)
        stats_grid.addWidget(window.rl_verification_sim_label, 3, 1)
        
        window.rl_verification_real_label = QLabel("0")
        window.rl_verification_real_label.setStyleSheet("color: #0ecb81; font-size: 14px; font-weight: bold;")
        window.rl_verification_real_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        real_label = QLabel("💰 실제 실적:")
        real_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        real_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(real_label, 3, 2)
        stats_grid.addWidget(window.rl_verification_real_label, 3, 3)
        
        # AI 판정 횟수 통계
        window.rl_verification_buy_label = QLabel("0")
        window.rl_verification_buy_label.setStyleSheet("color: #0ecb81; font-size: 14px; font-weight: bold;")
        window.rl_verification_buy_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        buy_label = QLabel("BUY 판정:")
        buy_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        buy_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(buy_label, 4, 0)
        stats_grid.addWidget(window.rl_verification_buy_label, 4, 1)
        
        window.rl_verification_sell_label = QLabel("0")
        window.rl_verification_sell_label.setStyleSheet("color: #f6465d; font-size: 14px; font-weight: bold;")
        window.rl_verification_sell_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        sell_label = QLabel("SELL 판정:")
        sell_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        sell_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(sell_label, 4, 2)
        stats_grid.addWidget(window.rl_verification_sell_label, 4, 3)
        
        window.rl_verification_discard_label = QLabel("0")
        window.rl_verification_discard_label.setStyleSheet("color: #888888; font-size: 14px; font-weight: bold;")
        window.rl_verification_discard_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        discard_label = QLabel("폐기 판정:")
        discard_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        discard_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(discard_label, 5, 0)
        stats_grid.addWidget(window.rl_verification_discard_label, 5, 1)
        
        # 손실률 기반 점수 표시
        window.rl_verification_score_label = QLabel("0.0")
        window.rl_verification_score_label.setStyleSheet("color: #9d4edd; font-size: 14px; font-weight: bold;")
        window.rl_verification_score_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        score_label = QLabel("📊 평균 검증 점수:")
        score_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
        score_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        stats_grid.addWidget(score_label, 5, 2)
        stats_grid.addWidget(window.rl_verification_score_label, 5, 3)
        
        stats_layout.addLayout(stats_grid)
        verification_layout.addWidget(stats_frame)
        
        # 랭크별 통계 영역
        rank_stats_frame = QFrame()
        rank_stats_frame.setStyleSheet("""
            QFrame {
                background-color: #1a0a2a;
                border: 2px solid #9d4edd;
                border-radius: 5px;
                padding: 10px;
            }
        """)
        rank_stats_layout = QVBoxLayout(rank_stats_frame)
        rank_stats_layout.setSpacing(10)
        
        rank_stats_header = QLabel("🏆 랭크별 검증 통계")
        rank_stats_header.setStyleSheet("color: #9d4edd; font-size: 18px; font-weight: bold; background-color: transparent;")
        rank_stats_layout.addWidget(rank_stats_header)
        
        # 랭크별 그리드
        rank_stats_grid = QGridLayout()
        rank_stats_grid.setSpacing(10)
        rank_stats_grid.setColumnStretch(0, 1)  # 라벨 컬럼
        rank_stats_grid.setColumnStretch(1, 1)  # 값 컬럼
        rank_stats_grid.setColumnStretch(2, 1)  # 라벨 컬럼
        rank_stats_grid.setColumnStretch(3, 1)  # 값 컬럼
        rank_stats_grid.setColumnStretch(4, 1)  # 라벨 컬럼
        rank_stats_grid.setColumnStretch(5, 1)  # 값 컬럼
        rank_stats_grid.setColumnStretch(6, 1)  # 라벨 컬럼
        rank_stats_grid.setColumnStretch(7, 1)  # 값 컬럼
        rank_stats_grid.setColumnStretch(8, 1)  # 라벨 컬럼
        rank_stats_grid.setColumnStretch(9, 1)  # 값 컬럼
        
        # 랭크별 라벨 생성
        rank_colors = {
            '+SS': '#ff00ff', '++S': '#ff00ff', '+S': '#ff00ff',
            'S': '#ffd700', 'A': '#00d1ff', 'B': '#0ecb81',
            'C': '#ffffff', 'D': '#ffa500', 'E': '#ff6b6b', 'F': '#f6465d'
        }
        
        ranks = ['+SS', '++S', '+S', 'S', 'A', 'B', 'C', 'D', 'E', 'F']
        window.rl_verification_rank_labels = {}
        
        row = 0
        col = 0
        for rank in ranks:
            label = QLabel("0")
            label.setStyleSheet(f"color: {rank_colors.get(rank, '#ffffff')}; font-size: 14px; font-weight: bold;")
            label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            rank_name_label = QLabel(f"{rank}:")
            rank_name_label.setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;")
            rank_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            rank_stats_grid.addWidget(rank_name_label, row, col * 2)
            rank_stats_grid.addWidget(label, row, col * 2 + 1)
            window.rl_verification_rank_labels[rank] = label
            
            col += 1
            if col >= 5:  # 5개씩 한 줄
                col = 0
                row += 1
        
        rank_stats_layout.addLayout(rank_stats_grid)
        verification_layout.addWidget(rank_stats_frame)
        
        # AI 실적 차트 영역
        chart_frame = QFrame()
        chart_frame.setStyleSheet("""
            QFrame {
                background-color: #1a0a2a;
                border: 2px solid #9d4edd;
                border-radius: 5px;
                padding: 10px;
            }
        """)
        chart_layout = QVBoxLayout(chart_frame)
        chart_layout.setSpacing(10)
        
        chart_header = QLabel("📈 AI 실적 차트")
        chart_header.setStyleSheet("color: #9d4edd; font-size: 16px; font-weight: bold;")
        chart_layout.addWidget(chart_header)
        
        # 손익률 추이 차트
        pnl_chart_label = QLabel("손익률 추이 (%)")
        pnl_chart_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold;")
        chart_layout.addWidget(pnl_chart_label)
        
        from ui.production_card import ChartWidget
        window.rl_verification_pnl_chart = ChartWidget([])
        window.rl_verification_pnl_chart.setStyleSheet("background-color: #0a1a1a; border: 1px solid #333333; border-radius: 3px;")
        window.rl_verification_pnl_chart.setMinimumHeight(150)
        window.rl_verification_pnl_chart.setMaximumHeight(200)
        chart_layout.addWidget(window.rl_verification_pnl_chart)
        
        # 승률 추이 차트
        winrate_chart_label = QLabel("누적 승률 추이 (%)")
        winrate_chart_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold;")
        chart_layout.addWidget(winrate_chart_label)
        
        window.rl_verification_winrate_chart = ChartWidget([])
        window.rl_verification_winrate_chart.setStyleSheet("background-color: #0a1a1a; border: 1px solid #333333; border-radius: 3px;")
        window.rl_verification_winrate_chart.setMinimumHeight(150)
        window.rl_verification_winrate_chart.setMaximumHeight(200)
        chart_layout.addWidget(window.rl_verification_winrate_chart)
        
        verification_layout.addWidget(chart_frame)
        
        # 검증 카드 목록
        cards_header = QLabel("📋 검증 완료 카드 목록")
        cards_header.setStyleSheet("color: #9d4edd; font-size: 16px; font-weight: bold;")
        verification_layout.addWidget(cards_header)
        
        window.rl_verification_masonry = MasonryLayout(columns=3, min_card_width=280)
        verification_layout.addWidget(window.rl_verification_masonry)
        
        # 스크롤 영역에 콘텐츠 설정
        verification_scroll.setWidget(verification_content)
        tab_widget.addTab(verification_scroll, "🧠 AI 검증")
        
        return tab_widget


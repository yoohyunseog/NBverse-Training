"""생산 카드 위젯 모듈"""
from PyQt6.QtWidgets import QFrame, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QSizePolicy, QWidget, QPushButton, QProgressBar
from PyQt6.QtCore import Qt, QTimer, pyqtSignal
from PyQt6.QtGui import QColor, QPainter, QPen
import numpy as np

from utils import safe_float, parse_iso_datetime, get_btc_price
from services.price_cache_service import get_price_cache_service


class ChartWidget(QWidget):
    """가격 차트 위젯"""
    def __init__(self, prices, parent=None, settings_manager=None, enable_animation=False):
        super().__init__(parent)
        self.prices = prices if prices else []
        self.settings_manager = settings_manager
        self.enable_animation = enable_animation
        self.current_index = 0  # 현재 표시할 인덱스 (애니메이션용)
        self.animation_timer = None
        self.setMinimumHeight(120)
        self.setMaximumHeight(150)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        
        # 애니메이션이 활성화되어 있으면 시작
        if self.enable_animation and self.prices and len(self.prices) > 1:
            self.start_animation()
    
    def start_animation(self):
        """애니메이션 시작"""
        if self.animation_timer:
            self.animation_timer.stop()
        
        # 설정에서 순회 주기 가져오기 (기본값 1000ms = 1초)
        interval_ms = 1000
        if self.settings_manager:
            interval_ms = self.settings_manager.get('chart_animation_interval_ms', 1000)
        
        self.current_index = 0
        self.animation_timer = QTimer(self)
        self.animation_timer.timeout.connect(self._on_animation_tick)
        self.animation_timer.start(interval_ms)
    
    def stop_animation(self):
        """애니메이션 중지"""
        if self.animation_timer:
            self.animation_timer.stop()
            self.animation_timer = None
        self.current_index = len(self.prices) if self.prices else 0  # 전체 표시
    
    def _on_animation_tick(self):
        """애니메이션 틱 (타이머 콜백)"""
        if self.prices and self.current_index < len(self.prices):
            self.current_index += 1
            self.update()  # 화면 갱신
        else:
            # 애니메이션 완료 후 다시 시작 (루프)
            self.current_index = 0
    
    def paintEvent(self, event):
        """차트 그리기"""
        if not self.prices or len(self.prices) < 2:
            return
        
        painter = QPainter(self)
        try:
            painter.setRenderHint(QPainter.RenderHint.Antialiasing)
            
            width = self.width()
            height = self.height()
            
            # 패딩
            padding = 10
            chart_width = width - padding * 2
            chart_height = height - padding * 2
            
            # 표시할 가격 데이터 결정
            if self.enable_animation and self.current_index > 0:
                # 애니메이션 모드: current_index까지만 표시
                display_prices = self.prices[:self.current_index]
            else:
                # 일반 모드: 전체 표시
                display_prices = self.prices
            
            if not display_prices or len(display_prices) < 2:
                return
            
            # 가격 범위 계산 (표시할 데이터 기준)
            min_price = min(display_prices)
            max_price = max(display_prices)
            price_range = max_price - min_price if max_price != min_price else 1
            
            # 그리드 배경
            painter.fillRect(0, 0, width, height, QColor('#0a1a1a'))
            
            # 그리드 라인 그리기
            pen = QPen(QColor('#1a2a2a'), 1)
            painter.setPen(pen)
            for i in range(5):
                y = int(padding + (chart_height / 4) * i)
                painter.drawLine(padding, y, width - padding, y)
            
            # 가격 라인 그리기
            if len(display_prices) > 1:
                # 최근 100개 데이터만 표시하고, 화면 너비에 맞춰 샘플링 (성능 최적화)
                max_points = min(100, width // 3)  # 화면 너비에 따라 최대 포인트 수 조정
                if len(display_prices) > max_points:
                    display_prices = display_prices[-max_points:]
                step = max(1, len(display_prices) // max_points) if len(display_prices) > max_points else 1
                display_prices = display_prices[::step]
                
                # 가격이 상승하면 초록색, 하락하면 빨간색
                first_price = display_prices[0]
                last_price = display_prices[-1]
                line_color = QColor('#0ecb81') if last_price >= first_price else QColor('#f6465d')
                
                pen = QPen(line_color, 2)
                painter.setPen(pen)
                
                points = []
                for i, price in enumerate(display_prices):
                    x = padding + (chart_width / (len(display_prices) - 1)) * i if len(display_prices) > 1 else padding + chart_width / 2
                    # Y 좌표는 위에서 아래로 (높은 가격이 위)
                    normalized = (price - min_price) / price_range
                    y = padding + chart_height - (normalized * chart_height)
                    points.append((x, y))
                
                # 라인 그리기
                for i in range(len(points) - 1):
                    painter.drawLine(int(points[i][0]), int(points[i][1]), 
                                   int(points[i+1][0]), int(points[i+1][1]))
                
                # 포인트 그리기 (작은 원)
                pen.setWidth(3)
                painter.setPen(pen)
                for x, y in points:
                    painter.drawEllipse(int(x) - 2, int(y) - 2, 4, 4)
            
            # 최소/최대 가격 표시
            painter.setPen(QPen(QColor('#888888'), 1))
            font = painter.font()
            font.setPixelSize(9)
            painter.setFont(font)
            
            # 최소 가격 (왼쪽 하단)
            min_text = f"{min_price:,.0f}"
            painter.drawText(padding, height - 5, min_text)
            
            # 최대 가격 (왼쪽 상단)
            max_text = f"{max_price:,.0f}"
            painter.drawText(padding, padding + 10, max_text)
            
            # 현재 가격 (오른쪽 하단)
            if display_prices:
                current_price = display_prices[-1]
                current_text = f"{current_price:,.0f}"
                text_width = painter.fontMetrics().boundingRect(current_text).width()
                painter.drawText(width - padding - text_width, height - 5, current_text)
        finally:
            painter.end()


class ProductionCard(QFrame):
    """생산 카드 위젯"""
    # 업데이트 완료 시그널
    update_completed = pyqtSignal()
    
    def __init__(self, card, decimal_places=10, settings_manager=None, 
                 ai_message_callback=None, rl_ai_callback=None, 
                 rl_action_callback=None, parent=None):
        super().__init__(parent)
        self.card = card
        self.decimal_places = decimal_places
        self.settings_manager = settings_manager
        self.ai_message_callback = ai_message_callback  # 기존 ML AI 메시지 콜백
        self.rl_ai_callback = rl_ai_callback  # 강화학습 AI 분석 콜백
        self.rl_action_callback = rl_action_callback  # 강화학습 AI 행동 실행 콜백
        
        # 실시간 가격 추적을 위한 변수
        self.realtime_prices = []  # 실시간 가격 히스토리
        self.production_price = 0.0  # 생산 시점 가격
        self.current_price = 0.0  # 현재 가격
        self.realtime_chart_widget = None  # 실시간 차트 위젯
        self.profit_loss_label = None  # 손익 표시 레이블
        
        # 실시간 점수 추적을 위한 변수
        self.realtime_scores = []  # 실시간 점수 히스토리
        self.current_score = 100.0  # 현재 점수 (기본값 100)
        self.score_chart_widget = None  # 점수 차트 위젯
        self.score_value_label = None  # 점수 표시 레이블
        self.buy_entry_price = 0.0  # 매수 진입 가격 (BUY 상태일 때)
        
        # AI 메시지 관련
        self.ai_message_label = None  # 기존 ML AI 메시지 레이블
        self.ai_signal_label = None  # 기존 ML AI 시그널 레이블
        
        # 강화학습 AI 관련
        self.rl_ai_frame = None  # 강화학습 AI 프레임
        self.rl_ai_label = None  # 강화학습 AI 레이블
        self.rl_ai_progress = None  # 강화학습 AI 프로그레스바
        self.rl_action_buttons = {}  # 행동 버튼들
        self._rl_analysis_progress = 0  # 분석 진행률 (0-100)
        self._rl_progress_timer = None  # 프로그레스바 애니메이션 타이머
        
        # 백그라운드 워커
        self._ml_worker = None
        self._rl_worker = None
        self._buy_worker = None
        self._sell_worker = None
        self._reward_worker = None
        
        # 판정 상태 추적 (SELL 판정 후 매도 완료 시 더 이상 판정 업데이트 안 함)
        self._last_sell_decision_time = None  # 마지막 SELL 판정 시간
        self._sell_executed = False  # SELL 판정 후 매도 실행 여부
        
        # AI 업데이트 디바운싱을 위한 변수
        self._ai_update_pending = False  # AI 업데이트 대기 중인지
        self._rl_update_pending = False  # RL 업데이트 대기 중인지
        self._last_ai_update_time = 0  # 마지막 AI 업데이트 시간
        self._last_rl_update_time = 0  # 마지막 RL 업데이트 시간
        
        # 가격 업데이트 디바운싱을 위한 변수 (성능 최적화)
        self._last_price_update_time = 0  # 마지막 가격 업데이트 시간
        self._price_update_interval = 2.0  # 가격 업데이트 최소 간격 (2초) - 성능 최적화
        self._parent_cache = None  # 부모 위젯 캐시 (성능 최적화)
        self._production_card_manager_cache = None  # ProductionCardManager 캐시
        self._settings_manager_cache = None  # SettingsManager 캐시
        
        # 생산 시점 가격 저장
        chart_data = self.card.get('chart_data', {})
        if isinstance(chart_data, dict):
            self.production_price = safe_float(chart_data.get('current_price', 0))
            # 초기 가격 히스토리 (생산 시점 가격)
            if self.production_price > 0:
                self.realtime_prices = [self.production_price]
        
        # 가격 캐시 서비스 초기화 (setup_ui() 전에 초기화 필요)
        self._price_cache_service = get_price_cache_service()
        self._price_cache_service.register_callback(self._on_price_updated)
        
        self.setup_ui()
        
        # 개별 타이머 제거 - 가격 캐시 서비스가 중앙에서 관리
        
        # AI 메시지 업데이트 타이머 시작 (지연 시작으로 초기 로딩 속도 향상)
        self.ai_update_timer = QTimer()
        self.ai_update_timer.timeout.connect(self.update_ai_message)
        # 타이머는 10초 후 시작 (초기 로딩 최적화)
        QTimer.singleShot(10000, lambda: self.ai_update_timer.start(60000))
        
        # 강화학습 AI는 회귀 방식으로 실행 (타이머 제거, 이벤트 기반)
        # 초기 AI 메시지 업데이트 (지연 실행으로 초기 로딩 속도 향상)
        QTimer.singleShot(10000, self.update_ai_message)  # 10초 후 실행 (초기 로딩 최적화)
    
    def setup_ui(self):
        """UI 설정"""
        timeframe = self.card.get('timeframe', 'N/A')
        nb_value = safe_float(self.card.get('nb_value', 0))
        card_type = self.card.get('card_type', 'normal')
        status = self.card.get('status', 'active')
        
        # 배경색 설정
        if status == 'active':
            card_bg = QColor('#1a2e2e')
            text_color = QColor('#ffffff')
            border_color = '#00d1ff'
        else:
            card_bg = QColor('#2b3139')
            text_color = QColor('#888888')
            border_color = '#444444'
        
        # 프레임 스타일 설정
        self.setStyleSheet(f"""
            QFrame {{
                background-color: {card_bg.name()};
                border: 2px solid {border_color};
                border-radius: 5px;
                padding: 10px;
            }}
        """)
        
        # 카드 최소/최대 너비 설정
        self.setMinimumWidth(260)
        self.setMaximumWidth(320)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Minimum)
        
        # 레이아웃
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        
        # AI 메시지 영역 (상단)
        ai_frame = QFrame()
        ai_frame.setStyleSheet("""
            QFrame {
                background-color: #0a1a2a;
                border: 2px solid #00d1ff;
                border-radius: 5px;
                padding: 8px;
            }
        """)
        ai_layout = QVBoxLayout(ai_frame)
        ai_layout.setSpacing(5)
        
        # AI 시그널 표시 (BUY/SELL/HOLD) - ML 모델 기반
        signal_layout = QHBoxLayout()
        signal_layout.setSpacing(5)
        
        signal_title = QLabel("🤖 AI 시그널 (ML):")
        signal_title.setStyleSheet("color: #00d1ff; font-weight: bold; font-size: 12px;")
        signal_title.setToolTip("기존 ML 모델이 내는 신호\n- BUY: 매수 추천\n- SELL: 매도 추천\n- HOLD: 관망\n10초마다 업데이트")
        signal_layout.addWidget(signal_title)
        
        self.ai_signal_label = QLabel("HOLD")
        self.ai_signal_label.setStyleSheet("""
            color: #ffffff;
            font-weight: bold;
            font-size: 14px;
            padding: 3px 8px;
            background-color: #2b3139;
            border-radius: 3px;
        """)
        signal_layout.addWidget(self.ai_signal_label)
        signal_layout.addStretch()
        
        ai_layout.addLayout(signal_layout)
        
        # AI 메시지 표시
        self.ai_message_label = QLabel("🤖 AI 분석 중...")
        self.ai_message_label.setStyleSheet("""
            color: #ffffff;
            font-size: 11px;
            padding: 5px;
            background-color: #1a2a3a;
            border-radius: 3px;
        """)
        self.ai_message_label.setWordWrap(True)
        self.ai_message_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        ai_layout.addWidget(self.ai_message_label)
        
        layout.addWidget(ai_frame)
        
        # 강화학습 AI 분석 영역
        self.rl_ai_frame = QFrame()
        self.rl_ai_frame.setStyleSheet("""
            QFrame {
                background-color: #1a0a2a;
                border: 2px solid #9d4edd;
                border-radius: 5px;
                padding: 8px;
            }
        """)
        rl_ai_layout = QVBoxLayout(self.rl_ai_frame)
        rl_ai_layout.setSpacing(5)
        
        # 강화학습 AI 헤더
        rl_ai_header = QHBoxLayout()
        rl_ai_title = QLabel("🧠 강화학습 AI:")
        rl_ai_title.setStyleSheet("color: #9d4edd; font-weight: bold; font-size: 12px;")
        rl_ai_title.setToolTip(
            "강화학습 AI는 카드의 상태를 분석하여 최적의 행동을 결정합니다.\n\n"
            "판정 종류:\n"
            "• HOLD: 현재 상태 유지 (추가 분석 필요)\n"
            "• BUY: 매수 신호 (매수 기회로 판단)\n"
            "• SELL: 매도 신호 (수익 실현 또는 손절)\n"
            "• FREEZE: 회색 처리 (다음 생산 시 제거 후보)\n"
            "• DELETE: 즉시 제거 (불필요한 카드)\n\n"
            "분석 주기: 약 15초마다 자동 업데이트"
        )
        rl_ai_header.addWidget(rl_ai_title)
        rl_ai_header.addStretch()
        
        # 강화학습 AI 상태 표시
        self.rl_ai_status_label = QLabel("분석 중...")
        self.rl_ai_status_label.setStyleSheet("""
            color: #ffffff;
            font-size: 11px;
            padding: 2px 6px;
            background-color: #2b1a3a;
            border-radius: 3px;
        """)
        rl_ai_header.addWidget(self.rl_ai_status_label)
        rl_ai_layout.addLayout(rl_ai_header)
        
        # 강화학습 AI 프로그레스바
        self.rl_ai_progress = QProgressBar()
        self.rl_ai_progress.setRange(0, 100)
        self.rl_ai_progress.setValue(0)
        self.rl_ai_progress.setStyleSheet("""
            QProgressBar {
                border: 1px solid #9d4edd;
                border-radius: 3px;
                text-align: center;
                background-color: #1a0a2a;
                height: 20px;
            }
            QProgressBar::chunk {
                background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #9d4edd, stop:1 #c77dff);
                border-radius: 2px;
            }
        """)
        self.rl_ai_progress.setFormat("분석 중... %p%")
        rl_ai_layout.addWidget(self.rl_ai_progress)
        
        # 강화학습 AI 분석 메시지 (N/B MAX, MIN 값 포함)
        nb_max_display = self.card.get('nb_max', 5.5)
        nb_min_display = self.card.get('nb_min', 5.5)
        self.rl_ai_label = QLabel(
            "강화학습 AI는 카드의 N/B 값, 가격 변동, 히스토리 등을 종합 분석하여\n"
            "최적의 매매 시점을 판단합니다.\n\n"
            f"N/B MAX: {nb_max_display:.{self.decimal_places}f} | MIN: {nb_min_display:.{self.decimal_places}f}"
        )
        self.rl_ai_label.setStyleSheet("""
            color: #ffffff;
            font-size: 11px;
            padding: 5px;
            background-color: #2a1a3a;
            border-radius: 3px;
        """)
        self.rl_ai_label.setWordWrap(True)
        self.rl_ai_label.setAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignTop)
        rl_ai_layout.addWidget(self.rl_ai_label)
        
        # 강화학습 AI 행동 버튼 영역
        rl_action_layout = QHBoxLayout()
        rl_action_layout.setSpacing(5)
        
        # DELETE 버튼
        delete_btn = QLabel("🗑️")
        delete_btn.setStyleSheet("""
            QLabel {
                color: #f6465d;
                font-size: 16px;
                padding: 5px;
                background-color: #3a1a1a;
                border: 1px solid #f6465d;
                border-radius: 3px;
            }
            QLabel:hover {
                background-color: #4a2a2a;
            }
        """)
        delete_btn.mousePressEvent = lambda e: self._execute_rl_action('DELETE')
        delete_btn.setToolTip("카드 제거 (강화학습 AI)")
        rl_action_layout.addWidget(delete_btn)
        self.rl_action_buttons['DELETE'] = delete_btn
        
        # FREEZE 버튼
        freeze_btn = QLabel("❄️")
        freeze_btn.setStyleSheet("""
            QLabel {
                color: #888888;
                font-size: 16px;
                padding: 5px;
                background-color: #2a2a2a;
                border: 1px solid #888888;
                border-radius: 3px;
            }
            QLabel:hover {
                background-color: #3a3a3a;
            }
        """)
        freeze_btn.mousePressEvent = lambda e: self._execute_rl_action('FREEZE')
        freeze_btn.setToolTip("카드 FREEZE (강화학습 AI)")
        rl_action_layout.addWidget(freeze_btn)
        self.rl_action_buttons['FREEZE'] = freeze_btn
        
        rl_action_layout.addStretch()
        rl_ai_layout.addLayout(rl_action_layout)
        
        layout.addWidget(self.rl_ai_frame)
        
        # 헤더
        header_layout = QHBoxLayout()
        
        # 카드 타입에 따른 헤더 아이콘
        if card_type == 'normal':
            header_icon = "🆕"
            header_text = "신규 생산 카드"
        elif card_type == 'overlap':
            header_icon = "🔄"
            header_text = "중첩 생산 카드"
        else:
            header_icon = "📊"
            header_text = "생산 카드"
        
        title_label = QLabel(f"{header_icon} {header_text}")
        title_label.setStyleSheet(f"color: {text_color.name()}; font-weight: bold; font-size: 14px;")
        header_layout.addWidget(title_label)
        
        card_id_label = QLabel(self.card.get('card_id', '').split('_')[-1])
        card_id_label.setStyleSheet("color: #888888; font-size: 11px;")
        header_layout.addWidget(card_id_label, alignment=Qt.AlignmentFlag.AlignRight)
        
        layout.addLayout(header_layout)
        
        # 생산 시간 표시 (상단에 명확하게)
        production_time = parse_iso_datetime(self.card.get('production_time'))
        if production_time:
            from datetime import datetime
            now = datetime.now()
            time_diff = now - production_time.replace(tzinfo=None) if production_time.tzinfo else now - production_time
            elapsed_seconds = time_diff.total_seconds()
            
            # 경과 시간 계산
            if elapsed_seconds < 60:
                elapsed_text = f"{int(elapsed_seconds)}초 전"
            elif elapsed_seconds < 3600:
                elapsed_text = f"{int(elapsed_seconds / 60)}분 전"
            elif elapsed_seconds < 86400:
                elapsed_text = f"{int(elapsed_seconds / 3600)}시간 전"
            else:
                elapsed_text = f"{int(elapsed_seconds / 86400)}일 전"
            
            # 오래된 카드 경고 (20시간 이상)
            is_old_card = elapsed_seconds >= 72000  # 20시간 = 72000초
            time_emoji = "⚠️" if is_old_card else "🕐"
            
            time_text = f"{time_emoji} 생산 시간: {production_time.strftime('%Y-%m-%d %H:%M:%S')} ({elapsed_text})"
            if is_old_card:
                time_text += " [오래된 카드]"
        else:
            time_text = "🕐 생산 시간: 정보 없음"
            is_old_card = False
        
        # 오래된 카드는 경고 색상으로 표시
        time_color = "#f6465d" if is_old_card else "#00d1ff"
        production_time_label = QLabel(time_text)
        production_time_label.setStyleSheet(f"color: {time_color}; font-size: 11px; font-weight: bold; padding: 3px;")
        production_time_label.setWordWrap(True)
        if is_old_card:
            production_time_label.setToolTip("이 카드는 20시간 이상 지났습니다. 자동 정리 대상일 수 있습니다.")
        layout.addWidget(production_time_label)
        
        # 정보 그리드
        info_layout = QGridLayout()
        info_layout.setSpacing(5)
        
        # 타임프레임
        timeframe_label = QLabel("타임프레임")
        timeframe_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(timeframe_label, 0, 0)
        timeframe_value = QLabel(timeframe)
        timeframe_value.setStyleSheet(f"color: {text_color.name()}; font-weight: bold;")
        info_layout.addWidget(timeframe_value, 0, 1)
        
        # N/B 값
        nb_label = QLabel("N/B 값")
        nb_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(nb_label, 1, 0)
        nb_color = '#0ecb81' if nb_value >= 0.5 else '#f6465d'
        nb_value_label = QLabel(f"{nb_value:.{self.decimal_places}f}")
        nb_value_label.setStyleSheet(f"color: {nb_color}; font-weight: bold;")
        info_layout.addWidget(nb_value_label, 1, 1)
        
        # N/B MAX 값 (항상 표시)
        nb_max_value = self.card.get('nb_max')
        if nb_max_value is None:
            nb_max_value = 5.5  # 기본값
        nb_max_label = QLabel("N/B MAX")
        nb_max_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(nb_max_label, 2, 0)
        nb_max_value_label = QLabel(f"{nb_max_value:.{self.decimal_places}f}")
        nb_max_value_label.setStyleSheet(f"color: #0ecb81; font-weight: bold;")
        info_layout.addWidget(nb_max_value_label, 2, 1)
        
        # N/B MIN 값 (항상 표시)
        nb_min_value = self.card.get('nb_min')
        if nb_min_value is None:
            nb_min_value = 5.5  # 기본값
        nb_min_label = QLabel("N/B MIN")
        nb_min_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(nb_min_label, 3, 0)
        nb_min_value_label = QLabel(f"{nb_min_value:.{self.decimal_places}f}")
        nb_min_value_label.setStyleSheet(f"color: #f6465d; font-weight: bold;")
        info_layout.addWidget(nb_min_value_label, 3, 1)
        
        # 카드 타입 (행 번호 고정) - 더 명확하게 표시
        type_row = 4
        type_label = QLabel("카드 타입")
        type_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(type_label, type_row, 0)
        
        # 카드 타입에 따른 명확한 표시
        if card_type == 'normal':
            type_text = "🆕 신규 카드"
            type_color = "#0ecb81"  # 초록색
        elif card_type == 'overlap':
            type_text = "🔄 중첩 카드"
            type_color = "#ffa500"  # 주황색
        else:
            type_text = f"❓ {card_type}"
            type_color = text_color.name()
        
        type_value = QLabel(type_text)
        type_value.setStyleSheet(f"color: {type_color}; font-weight: bold;")
        type_value.setToolTip(
            "신규 카드: 처음 생성된 일반 카드\n"
            "중첩 카드: 기존 카드와 유사한 패턴을 가진 카드"
        )
        info_layout.addWidget(type_value, type_row, 1)
        
        # 상태 (행 번호 고정)
        status_row = 5
        status_label = QLabel("상태")
        status_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(status_label, status_row, 0)
        status_text = "활성" if status == 'active' else "종료" if status == 'closed' else status
        status_color = '#0ecb81' if status == 'active' else '#888888'
        status_value = QLabel(status_text)
        status_value.setStyleSheet(f"color: {status_color}; font-weight: bold;")
        info_layout.addWidget(status_value, status_row, 1)
        
        # 점수 (행 번호 고정) - 실시간 업데이트 가능하도록 저장
        score_row = 6
        initial_score = safe_float(self.card.get('score', 100.0))
        self.current_score = initial_score
        score_label = QLabel("점수")
        score_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(score_label, score_row, 0)
        self.score_value_label = QLabel(f"{initial_score:.1f}")
        # 점수에 따른 색상 설정
        score_color = self._get_score_color(initial_score)
        self.score_value_label.setStyleSheet(f"color: {score_color}; font-weight: bold; font-size: 13px;")
        info_layout.addWidget(self.score_value_label, score_row, 1)
        
        # 등급 (행 번호 고정)
        rank_row = 7
        rank = self.card.get('rank', 'C')
        rank_label = QLabel("등급")
        rank_label.setStyleSheet(f"color: #888888;")
        info_layout.addWidget(rank_label, rank_row, 0)
        rank_value_label = QLabel(rank)
        # 등급에 따른 색상 설정
        if rank == '+SS':
            rank_color = '#ff00ff'  # 자홍색
        elif rank == '++S':
            rank_color = '#ff00ff'  # 자홍색
        elif rank == '+S':
            rank_color = '#ff00ff'  # 자홍색
        elif rank == 'S':
            rank_color = '#ffd700'  # 금색
        elif rank == 'A':
            rank_color = '#00d1ff'  # 청록색
        elif rank == 'B':
            rank_color = '#0ecb81'  # 초록색
        elif rank == 'C':
            rank_color = '#ffffff'  # 흰색
        elif rank == 'D':
            rank_color = '#ffa500'  # 주황색
        elif rank == 'E':
            rank_color = '#ff6b6b'  # 연한 빨간색
        else:  # F
            rank_color = '#f6465d'  # 빨간색
        rank_value_label.setStyleSheet(f"color: {rank_color}; font-weight: bold; font-size: 14px;")
        info_layout.addWidget(rank_value_label, rank_row, 1)
        
        layout.addLayout(info_layout)
        
        # 생산 시점 가격 차트 그래프 추가
        chart_data = self.card.get('chart_data', {})
        prices = chart_data.get('prices', []) if isinstance(chart_data, dict) else []
        if prices and len(prices) > 0:
            chart_label = QLabel("📈 생산 시점 가격 차트")
            chart_label.setStyleSheet(f"color: {text_color.name()}; font-size: 12px; font-weight: bold; margin-top: 5px;")
            layout.addWidget(chart_label)
            
            chart_widget = ChartWidget(prices, settings_manager=self.settings_manager, enable_animation=False)
            chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #333333; border-radius: 3px;")
            layout.addWidget(chart_widget)
        
        # 실시간 가격 차트 추가
        realtime_chart_label = QLabel("📊 실시간 가격 차트")
        realtime_chart_label.setStyleSheet(f"color: {text_color.name()}; font-size: 12px; font-weight: bold; margin-top: 5px;")
        layout.addWidget(realtime_chart_label)
        
        self.realtime_chart_widget = ChartWidget(
            self.realtime_prices if self.realtime_prices else [self.production_price] if self.production_price > 0 else [],
            settings_manager=self.settings_manager,
            enable_animation=False  # 카드 전체 순차 업데이트를 사용하므로 개별 차트 애니메이션 비활성화
        )
        self.realtime_chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #00d1ff; border-radius: 3px;")
        layout.addWidget(self.realtime_chart_widget)
        
        # 실시간 점수 차트 추가
        score_chart_label = QLabel("📈 실시간 점수 차트")
        score_chart_label.setStyleSheet(f"color: {text_color.name()}; font-size: 12px; font-weight: bold; margin-top: 5px;")
        layout.addWidget(score_chart_label)
        
        # 초기 점수 설정
        initial_score = safe_float(self.card.get('score', 100.0))
        self.current_score = initial_score
        self.realtime_scores = [initial_score]  # 초기 점수
        
        # 매수 진입 가격 확인 (BUY 상태인 경우)
        self._update_buy_entry_price()
        
        self.score_chart_widget = ChartWidget(
            self.realtime_scores,
            settings_manager=self.settings_manager,
            enable_animation=False
        )
        self.score_chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #9d4edd; border-radius: 3px;")
        layout.addWidget(self.score_chart_widget)
        
        # 보유 상태 확인
        is_holding = self._is_holding_position()
        sold_history = self._get_latest_sold_history()
        
        # 보유 상태 배지 영역
        status_badge_frame = QFrame()
        status_badge_frame.setStyleSheet("background-color: #0a1a1a; border: 2px solid #333333; border-radius: 5px; padding: 8px; margin-bottom: 5px;")
        status_badge_layout = QHBoxLayout(status_badge_frame)
        status_badge_layout.setSpacing(10)
        
        if sold_history:
            # 매도 완료 상태
            status_emoji = "✅"
            status_text = "매도 완료"
            status_color = "#888888"
        elif is_holding:
            # 보유 중 상태
            status_emoji = "🟢"
            status_text = "보유 중"
            status_color = "#0ecb81"
        else:
            # 매수 가능 상태
            status_emoji = "🔵"
            status_text = "매수 가능"
            status_color = "#00d1ff"
        
        status_badge_label = QLabel(f"{status_emoji} {status_text}")
        status_badge_label.setStyleSheet(f"""
            color: {status_color};
            font-weight: bold;
            font-size: 13px;
            padding: 5px 10px;
            background-color: #1a1a2a;
            border-radius: 3px;
        """)
        status_badge_layout.addWidget(status_badge_label)
        
        # 보유 수량 표시 (보유 중일 때만)
        if is_holding and not sold_history:
            latest_buy = None
            for hist in reversed(self.card.get('history_list', [])):
                if hist.get('type') in ['NEW', 'BUY']:
                    latest_buy = hist
                    break
            
            if latest_buy:
                qty = safe_float(latest_buy.get('qty', 0))
                if qty > 0:
                    qty_label = QLabel(f"수량: {qty:.8f} BTC")
                    qty_label.setStyleSheet(f"color: {status_color}; font-size: 12px;")
                    status_badge_layout.addWidget(qty_label)
        
        status_badge_layout.addStretch()
        layout.addWidget(status_badge_frame)
        
        # 포지션 정보 표시 영역 (보유 중일 때만)
        if is_holding and not sold_history:
            position_frame = QFrame()
            position_frame.setStyleSheet("background-color: #0a1a2a; border: 2px solid #0ecb81; border-radius: 5px; padding: 10px; margin-bottom: 5px;")
            position_layout = QVBoxLayout(position_frame)
            position_layout.setSpacing(5)
            
            position_title = QLabel("📊 포지션 정보")
            position_title.setStyleSheet("color: #0ecb81; font-weight: bold; font-size: 12px;")
            position_layout.addWidget(position_title)
            
            # 매수 평균 가격
            self.position_entry_label = QLabel("매수 평균: 계산 중...")
            self.position_entry_label.setStyleSheet("color: #ffffff; font-size: 11px;")
            position_layout.addWidget(self.position_entry_label)
            
            # 현재 평가 금액
            self.position_value_label = QLabel("현재 평가: 계산 중...")
            self.position_value_label.setStyleSheet("color: #ffffff; font-size: 11px;")
            position_layout.addWidget(self.position_value_label)
            
            # 실시간 손익
            self.position_pnl_label = QLabel("손익: 계산 중...")
            self.position_pnl_label.setStyleSheet("color: #ffffff; font-size: 11px; font-weight: bold;")
            position_layout.addWidget(self.position_pnl_label)
            
            layout.addWidget(position_frame)
        
        # 손익 정보 표시
        profit_loss_frame = QFrame()
        profit_loss_frame.setStyleSheet("background-color: #0a1a1a; border: 1px solid #333333; border-radius: 3px; padding: 8px;")
        profit_loss_layout = QVBoxLayout(profit_loss_frame)
        profit_loss_layout.setSpacing(5)
        
        # 생산 시점 가격
        production_price_label = QLabel(f"생산 시점: {self.production_price:,.0f} KRW")
        production_price_label.setStyleSheet(f"color: {text_color.name()}; font-size: 11px;")
        profit_loss_layout.addWidget(production_price_label)
        
        # 현재 가격 및 손익
        self.profit_loss_label = QLabel("현재: 계산 중...")
        self.profit_loss_label.setStyleSheet(f"color: {text_color.name()}; font-size: 11px; font-weight: bold;")
        profit_loss_layout.addWidget(self.profit_loss_label)
        
        # 매수 금액 표시
        self.buy_amount_label = QLabel("매수 금액: 계산 중...")
        self.buy_amount_label.setStyleSheet(f"color: {text_color.name()}; font-size: 11px;")
        profit_loss_layout.addWidget(self.buy_amount_label)
        
        # 매도 금액 표시 (보유 중일 때만)
        if is_holding and not sold_history:
            self.sell_amount_label = QLabel("매도 금액: 계산 중...")
            self.sell_amount_label.setStyleSheet(f"color: #f6465d; font-size: 11px;")
            profit_loss_layout.addWidget(self.sell_amount_label)
        else:
            self.sell_amount_label = None
        
        layout.addWidget(profit_loss_frame)
        
        # 매도 완료된 경우 검증 정보 표시
        sold_history = self._get_latest_sold_history()
        if sold_history:
            # 손실률 기반 점수 계산 및 표시
            pnl_percent = sold_history.get('pnl_percent', 0)
            pnl_amount = sold_history.get('pnl_amount', 0)
            exit_price = sold_history.get('exit_price', 0)
            
            # 진입 가격 가져오기
            entry_price = sold_history.get('entry_price', 0)
            if not entry_price:
                for hist in reversed(self.card.get('history_list', [])):
                    if hist.get('type') in ['NEW', 'BUY']:
                        entry_price = hist.get('entry_price', 0)
                        break
            
            # 검증 정보 프레임
            verification_frame = QFrame()
            verification_frame.setStyleSheet("""
                QFrame {
                    background-color: #1a0a2a;
                    border: 2px solid #9d4edd;
                    border-radius: 5px;
                    padding: 10px;
                }
            """)
            verification_layout = QVBoxLayout(verification_frame)
            verification_layout.setSpacing(5)
            
            # 검증 완료 헤더
            verification_title = QLabel("✅ 검증 완료")
            verification_title.setStyleSheet("color: #9d4edd; font-weight: bold; font-size: 14px;")
            verification_layout.addWidget(verification_title)
            
            # 손익 정보
            if pnl_amount > 0:
                result_text = f"✅ 승리: +{pnl_percent:.2f}% (+{pnl_amount:,.0f} KRW)"
                result_color = '#0ecb81'
            elif pnl_amount < 0:
                result_text = f"❌ 손실: {pnl_percent:.2f}% ({pnl_amount:,.0f} KRW)"
                result_color = '#f6465d'
            else:
                result_text = f"➖ 무승부: {pnl_percent:.2f}%"
                result_color = '#888888'
            
            result_label = QLabel(result_text)
            result_label.setStyleSheet(f"""
                color: {result_color};
                font-weight: bold;
                font-size: 14px;
            """)
            verification_layout.addWidget(result_label)
            
            # 손실률 기반 점수
            loss_rate_score = self._calculate_loss_rate_score(pnl_percent)
            score_label = QLabel(f"📊 검증 점수: {loss_rate_score:.1f}")
            score_color = self._get_score_color(loss_rate_score)
            score_label.setStyleSheet(f"""
                color: {score_color};
                font-weight: bold;
                font-size: 13px;
                padding: 5px;
                background-color: #0a0a1a;
                border-radius: 3px;
            """)
            verification_layout.addWidget(score_label)
            
            layout.addWidget(verification_frame)
            
            # 매도 시점 가격 차트 추가
            if exit_price > 0:
                sell_chart_label = QLabel("📉 매도 시점 가격 차트")
                sell_chart_label.setStyleSheet(f"color: {text_color.name()}; font-size: 12px; font-weight: bold; margin-top: 5px;")
                layout.addWidget(sell_chart_label)
                
                # 매도 시점 가격 차트 (매수 시점 차트의 마지막 부분 + 매도 시점)
                sell_prices = []
                if prices:
                    sell_prices = prices[-10:] if len(prices) >= 10 else prices
                sell_prices.append(exit_price)
                
                sell_chart_widget = ChartWidget(sell_prices)
                sell_chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #f6465d; border-radius: 3px;")
                layout.addWidget(sell_chart_widget)
        
        # 초기 매수 금액 표시
        if self.production_price > 0 and self.buy_amount_label:
            min_buy_amount = self.settings_manager.get("min_buy_amount", 5000) if self.settings_manager else 5000
            fee_rate = (self.settings_manager.get("fee_rate", 0.1) / 100.0) if self.settings_manager else 0.001
            buy_fee = min_buy_amount * (fee_rate / 2)
            buy_total = min_buy_amount + buy_fee
            buy_amount_text = f"매수 금액: {min_buy_amount:,.0f} KRW (수수료 포함: {buy_total:,.0f} KRW)"
            self.buy_amount_label.setText(buy_amount_text)
        
        # 초기 실시간 가격 업데이트
        self.update_realtime_price()
        
        # 하단 시간 정보 (중복 제거 - 상단에 이미 표시됨)
        
        # 버튼 영역 (매수, 매도, 폐기)
        button_layout = QHBoxLayout()
        button_layout.setSpacing(10)
        
        # 매수 버튼 (보유 중이 아니고 매도 완료되지 않았을 때만 활성화)
        self.buy_button = QPushButton("매수")
        self.buy_button.setStyleSheet("""
            QPushButton {
                background-color: #0ecb81;
                color: white;
                font-weight: bold;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 14px;
            }
            QPushButton:hover {
                background-color: #0db870;
            }
            QPushButton:disabled {
                background-color: #444444;
                color: #888888;
            }
        """)
        self.buy_button.clicked.connect(self._on_buy_clicked)
        if is_holding or sold_history:
            self.buy_button.setEnabled(False)
            self.buy_button.setToolTip("보유 중이거나 매도 완료된 카드는 매수할 수 없습니다.")
        button_layout.addWidget(self.buy_button)
        
        # 매도 버튼 (보유 중일 때만 표시)
        self.sell_button = QPushButton("매도")
        self.sell_button.setStyleSheet("""
            QPushButton {
                background-color: #f6465d;
                color: white;
                font-weight: bold;
                padding: 10px 20px;
                border-radius: 5px;
                font-size: 14px;
            }
            QPushButton:hover {
                background-color: #e5354a;
            }
            QPushButton:disabled {
                background-color: #444444;
                color: #888888;
            }
        """)
        self.sell_button.clicked.connect(self._on_sell_clicked)
        if not is_holding or sold_history:
            self.sell_button.setVisible(False)
        button_layout.addWidget(self.sell_button)
        
        layout.addLayout(button_layout)
        layout.addStretch()
    
    def _on_price_updated(self, current_price: float):
        """가격 캐시 서비스에서 가격 업데이트 알림 받음 (디바운싱 강화)"""
        try:
            if current_price > 0:
                # 디바운싱: 최소 간격으로 업데이트 (성능 최적화)
                import time
                current_time = time.time()
                if current_time - self._last_price_update_time < self._price_update_interval:
                    # 가격만 업데이트하고 UI 업데이트는 스킵
                    self.current_price = current_price
                    # 실시간 가격 히스토리에만 추가 (UI 업데이트 스킵)
                    if hasattr(self, 'realtime_prices'):
                        self.realtime_prices.append(current_price)
                        if len(self.realtime_prices) > 100:
                            self.realtime_prices = self.realtime_prices[-100:]
                    return
                
                self._last_price_update_time = current_time
                self.current_price = current_price
                
                # 실시간 가격 히스토리에 추가 (최대 100개)
                self.realtime_prices.append(current_price)
                if len(self.realtime_prices) > 100:
                    self.realtime_prices = self.realtime_prices[-100:]
                
                # 실시간 차트 업데이트 (디바운싱 강화 - 5초마다만 업데이트)
                if self.realtime_chart_widget:
                    # 차트 업데이트는 5초마다만 수행 (성능 최적화)
                    if not hasattr(self, '_last_chart_update_time'):
                        self._last_chart_update_time = 0
                    
                    if current_time - self._last_chart_update_time >= 5.0:
                        self._last_chart_update_time = current_time
                        # 실시간 가격이 추가되면 애니메이션 인덱스도 조정
                        old_prices_count = len(self.realtime_chart_widget.prices) if self.realtime_chart_widget.prices else 0
                        self.realtime_chart_widget.prices = self.realtime_prices
                        # 애니메이션이 활성화되어 있고 새로운 가격이 추가된 경우
                        if self.realtime_chart_widget.enable_animation and len(self.realtime_prices) > old_prices_count:
                            # 새로운 가격이 추가되면 애니메이션 인덱스를 조정 (새 가격도 표시되도록)
                            if self.realtime_chart_widget.current_index >= old_prices_count:
                                # 이미 모든 기존 가격을 표시했으면 새 가격도 바로 표시
                                self.realtime_chart_widget.current_index = len(self.realtime_prices)
                        self.realtime_chart_widget.update()
                
                # 손익 계산 및 표시 (최소 매수 금액 및 수수료 반영)
                if self.production_price > 0 and self.profit_loss_label:
                    # 설정값 가져오기
                    min_buy_amount = self.settings_manager.get("min_buy_amount", 5000) if self.settings_manager else 5000
                    fee_rate = (self.settings_manager.get("fee_rate", 0.1) / 100.0) if self.settings_manager else 0.001
                    
                    # 매수 계산
                    buy_amount = min_buy_amount  # 최소 매수 금액
                    buy_fee = buy_amount * (fee_rate / 2)  # 매수 수수료 (반값)
                    buy_total = buy_amount + buy_fee  # 매수 총액 (수수료 포함)
                    
                    # 매수 수량 계산
                    buy_quantity = buy_amount / self.production_price  # 생산 시점 가격으로 매수한 수량
                    
                    # 매도 계산
                    current_value = current_price * buy_quantity  # 현재 가치
                    sell_fee = current_value * (fee_rate / 2)  # 매도 수수료 (반값)
                    sell_total = current_value - sell_fee  # 매도 후 받을 금액 (수수료 제외)
                    
                    # 손익 계산
                    profit_loss = sell_total - buy_total  # 실제 손익 (수수료 반영)
                    profit_loss_percent = (profit_loss / buy_total * 100) if buy_total > 0 else 0
                    
                    if profit_loss > 0:
                        profit_text = f"현재: {current_price:,.0f} KRW | 손익: +{profit_loss:,.0f} KRW (+{profit_loss_percent:.2f}%)"
                        color = '#0ecb81'  # 초록색 (수익)
                    elif profit_loss < 0:
                        profit_text = f"현재: {current_price:,.0f} KRW | 손익: {profit_loss:,.0f} KRW ({profit_loss_percent:.2f}%)"
                        color = '#f6465d'  # 빨간색 (손실)
                    else:
                        profit_text = f"현재: {current_price:,.0f} KRW | 손익: 0 KRW (0.00%)"
                        color = '#ffffff'  # 흰색 (변동 없음)
                    
                    self.profit_loss_label.setText(profit_text)
                    self.profit_loss_label.setStyleSheet(f"color: {color}; font-size: 11px; font-weight: bold;")
                    
                    # 매수 금액 표시 (손익 계산 아래)
                    if self.buy_amount_label:
                        buy_amount_text = f"매수 금액: {buy_amount:,.0f} KRW (수수료 포함: {buy_total:,.0f} KRW)"
                        self.buy_amount_label.setText(buy_amount_text)
                    
                    # 포지션 정보 업데이트 (보유 중일 때만)
                    if self._is_holding_position() and not self._get_latest_sold_history():
                        # 최근 매수 정보 가져오기
                        latest_buy = None
                        for hist in reversed(self.card.get('history_list', [])):
                            if hist.get('type') in ['NEW', 'BUY']:
                                latest_buy = hist
                                break
                        
                        if latest_buy:
                            entry_price = safe_float(latest_buy.get('entry_price', 0))
                            qty = safe_float(latest_buy.get('qty', 0))
                            
                            if entry_price > 0 and qty > 0:
                                # 매수 평균 가격
                                if hasattr(self, 'position_entry_label') and self.position_entry_label:
                                    self.position_entry_label.setText(f"매수 평균: {entry_price:,.0f} KRW")
                                
                                # 현재 평가 금액
                                current_value = current_price * qty
                                if hasattr(self, 'position_value_label') and self.position_value_label:
                                    self.position_value_label.setText(f"현재 평가: {current_value:,.0f} KRW")
                                
                                # 실시간 손익
                                buy_total = entry_price * qty
                                fee_rate = (self.settings_manager.get("fee_rate", 0.1) / 100.0) if self.settings_manager else 0.001
                                buy_fee = buy_total * (fee_rate / 2)
                                buy_total_with_fee = buy_total + buy_fee
                                
                                sell_fee = current_value * (fee_rate / 2)
                                sell_amount = current_value - sell_fee
                                
                                position_pnl = sell_amount - buy_total_with_fee
                                position_pnl_percent = (position_pnl / buy_total_with_fee * 100) if buy_total_with_fee > 0 else 0
                                
                                if hasattr(self, 'position_pnl_label') and self.position_pnl_label:
                                    if position_pnl > 0:
                                        pnl_text = f"손익: +{position_pnl:,.0f} KRW (+{position_pnl_percent:.2f}%)"
                                        pnl_color = '#0ecb81'
                                    elif position_pnl < 0:
                                        pnl_text = f"손익: {position_pnl:,.0f} KRW ({position_pnl_percent:.2f}%)"
                                        pnl_color = '#f6465d'
                                    else:
                                        pnl_text = f"손익: 0 KRW (0.00%)"
                                        pnl_color = '#ffffff'
                                    
                                    self.position_pnl_label.setText(pnl_text)
                                    self.position_pnl_label.setStyleSheet(f"color: {pnl_color}; font-size: 11px; font-weight: bold;")
                                
                                # 매도 금액 표시
                                if hasattr(self, 'sell_amount_label') and self.sell_amount_label:
                                    self.sell_amount_label.setText(f"매도 금액: {sell_amount:,.0f} KRW (예상, 수수료 제외)")
                    
                    # BUY 상태에서 실시간 점수 계산 및 업데이트 (디바운싱 강화)
                    if self._is_holding_position():
                        # 점수 업데이트는 3초마다만 수행 (성능 최적화)
                        if not hasattr(self, '_last_score_update_time'):
                            self._last_score_update_time = 0
                        
                        if current_time - self._last_score_update_time >= 3.0:
                            self._last_score_update_time = current_time
                            self._update_realtime_score(current_price, profit_loss_percent)
        except Exception as e:
            print(f"가격 업데이트 처리 오류: {e}")
    
    def update_card_for_cycle(self):
        """회기 업데이트: 카드의 모든 업데이트 수행 (차트, 가격 등) - 최적화"""
        try:
            # 디바운싱: 최소 간격으로 업데이트 (성능 최적화)
            import time
            current_time = time.time()
            if current_time - self._last_price_update_time < self._price_update_interval:
                # 가격 업데이트 스킵, 차트만 업데이트
                if hasattr(self, 'realtime_chart_widget') and self.realtime_chart_widget:
                    self.realtime_chart_widget.update()
                # 즉시 완료 시그널 발생 (다음 카드로 빠르게 진행)
                self.update_completed.emit()
                return
            
            self._last_price_update_time = current_time
            
            # 차트 업데이트 (동기적으로 즉시 완료)
            if hasattr(self, 'realtime_chart_widget') and self.realtime_chart_widget:
                self.realtime_chart_widget.update()
            
            # 가격 업데이트 (캐시에서 가져와서 업데이트)
            from services.price_cache_service import get_price_cache_service
            _price_cache_service = get_price_cache_service()
            cached_price = _price_cache_service.get_price()
            
            if cached_price > 0:
                # 가격 업데이트 (비동기이지만 UI 업데이트는 즉시 완료)
                self._on_price_updated(cached_price)
            
            # 업데이트 완료 시그널 발생
            self.update_completed.emit()
            
        except Exception as e:
            print(f"⚠️ 카드 회기 업데이트 오류: {e}")
            # 오류가 있어도 완료 시그널 발생 (다음 카드로 진행)
            self.update_completed.emit()
    
    def update_realtime_price(self):
        """실시간 가격 업데이트 (하위 호환성을 위해 유지, 내부적으로는 캐시 사용)"""
        # 가격 캐시 서비스가 초기화되지 않았으면 스킵
        if not hasattr(self, '_price_cache_service') or self._price_cache_service is None:
            return
        
        # 가격 캐시 서비스에서 가격 가져오기
        cached_price = self._price_cache_service.get_price()
        if cached_price > 0:
            self._on_price_updated(cached_price)
    
    def update_ai_message(self):
        """기존 ML AI 메시지 업데이트 (백그라운드 실행, 디바운싱 적용)"""
        try:
            if not self.ai_message_callback:
                return
            
            # 기존 워커가 실행 중이면 스킵
            if self._ml_worker and self._ml_worker.isRunning():
                return
            
            # 디바운싱: 최소 15초 간격으로 업데이트 (성능 최적화)
            import time
            current_time = time.time()
            if current_time - self._last_ai_update_time < 15.0:
                return  # 너무 자주 호출 방지
            
            self._last_ai_update_time = current_time
            
            # 백그라운드 워커로 실행
            from workers.rl_ai_workers import MLModelAnalysisWorker
            current_price = self.current_price if self.current_price > 0 else self.production_price
            
            self._ml_worker = MLModelAnalysisWorker(
                self.ai_message_callback.__self__.ml_model_manager,
                self.card,
                current_price,
                self.settings_manager
            )
            # 부모를 명시적으로 설정하여 안전한 소멸 보장
            self._ml_worker.setParent(self)
            
            # 시그널 연결 최적화: 기존 연결이 있으면 제거 후 재연결 (중복 방지)
            try:
                self._ml_worker.analysis_ready.disconnect()
            except:
                pass
            try:
                self._ml_worker.error_occurred.disconnect()
            except:
                pass
            try:
                self._ml_worker.finished.disconnect()
            except:
                pass
            
            # 람다 대신 직접 메서드 참조 사용 (성능 향상)
            self._ml_worker.analysis_ready.connect(self._on_ml_analysis_ready)
            self._ml_worker.error_occurred.connect(self._on_ml_analysis_error)
            
            # finished 시그널: 간단한 람다 사용 (메모리 효율적)
            def clear_ml_worker():
                self._ml_worker = None
            self._ml_worker.finished.connect(clear_ml_worker)
            self._ml_worker.start()
            
        except Exception as e:
            print(f"⚠️ ML AI 메시지 업데이트 오류: {e}")
    
    def update_rl_ai_analysis(self):
        """강화학습 AI 분석 업데이트 (회귀 방식, 백그라운드 실행, 최적화)"""
        try:
            if not self.rl_ai_callback:
                return
            
            # SELL 판정 후 매도가 완료된 경우 더 이상 판정 업데이트 안 함
            # 또는 이미 SOLD 히스토리가 있는 경우 (매도 완료된 카드)
            history_list = self.card.get('history_list', [])
            has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
            
            if has_sold:
                # 이미 매도 완료된 카드는 판정 업데이트 중단 (검증 카드로 표시됨)
                return
            
            if self._sell_executed:
                # SELL 판정이 나왔지만 아직 매도가 완료되지 않은 경우
                # 매도 완료 후 5분이 지나면 다시 판정 시작 (새로운 매수 기회)
                import time
                if self._last_sell_decision_time:
                    elapsed = time.time() - self._last_sell_decision_time
                    if elapsed < 300:  # 5분 (300초)
                        return  # 아직 판정 업데이트 안 함
                    else:
                        # 5분 지나면 리셋하고 다시 판정 시작 (하지만 SOLD가 없으면 계속 중단)
                        if not has_sold:
                            # SOLD가 없으면 여전히 판정 업데이트 중단 (매도 대기 중)
                            return
                        self._sell_executed = False
                        self._last_sell_decision_time = None
            
            # 기존 워커가 실행 중이면 스킵 (중복 실행 방지)
            if self._rl_worker and self._rl_worker.isRunning():
                return
            
            # 프로그레스바 초기화 및 애니메이션 시작
            if self.rl_ai_progress:
                self._rl_analysis_progress = 0
                self.rl_ai_progress.setValue(0)
                self.rl_ai_progress.setFormat("분석 시작... %p%")
                # 프로그레스바 애니메이션 시작
                self._start_rl_progress_animation()
            
            # 백그라운드 워커로 실행 (회귀 방식: 이전 워커 완료 후 다음 카드로)
            current_price = self.current_price if self.current_price > 0 else self.production_price
            
            worker = self.rl_ai_callback(self.card, current_price)
            if worker:
                self._rl_worker = worker
                # 부모를 명시적으로 설정하여 안전한 소멸 보장
                self._rl_worker.setParent(self)
                
                # 시그널 연결 최적화: 기존 연결이 있으면 제거 후 재연결 (중복 방지)
                try:
                    self._rl_worker.analysis_ready.disconnect()
                except:
                    pass
                try:
                    self._rl_worker.error_occurred.disconnect()
                except:
                    pass
                try:
                    self._rl_worker.finished.disconnect()
                except:
                    pass
                
                # 람다 대신 직접 메서드 참조 사용 (성능 향상)
                self._rl_worker.analysis_ready.connect(self._on_rl_analysis_ready)
                self._rl_worker.error_occurred.connect(self._on_rl_analysis_error)
                
                # finished 시그널: 회귀 방식으로 다음 카드 분석 트리거
                def on_rl_worker_finished():
                    self._rl_worker = None
                    # 프로그레스바 애니메이션 중지
                    self._stop_rl_progress_animation()
                    # 회귀 방식: 다음 카드 분석을 트리거 (부모에게 알림) - 캐싱 최적화
                    parent = self._get_parent_with_attr('trigger_next_rl_analysis')
                    if parent and hasattr(parent, 'trigger_next_rl_analysis'):
                        # 분석 완료 플래그 해제
                        parent._rl_analysis_in_progress = False
                        QTimer.singleShot(100, parent.trigger_next_rl_analysis)  # 100ms 후 다음 카드 분석
                
                self._rl_worker.finished.connect(on_rl_worker_finished)
                self._rl_worker.start()
            
        except Exception as e:
            print(f"⚠️ 강화학습 AI 분석 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_ml_analysis_ready(self, result):
        """ML AI 분석 완료 (메인 스레드에서 호출)"""
        try:
            message = result.get('message', 'AI 분석 중...')
            signal = result.get('signal', 'HOLD')
            
            # AI 시그널 레이블 업데이트
            if self.ai_signal_label:
                self.ai_signal_label.setText(signal)
                # 시그널에 따른 색상 설정
                if signal == 'BUY':
                    self.ai_signal_label.setStyleSheet("""
                        color: #0ecb81;
                        font-weight: bold;
                        font-size: 14px;
                        padding: 3px 8px;
                        background-color: #1a3a2a;
                        border-radius: 3px;
                    """)
                elif signal == 'SELL':
                    self.ai_signal_label.setStyleSheet("""
                        color: #f6465d;
                        font-weight: bold;
                        font-size: 14px;
                        padding: 3px 8px;
                        background-color: #3a1a1a;
                        border-radius: 3px;
                    """)
                else:  # HOLD
                    self.ai_signal_label.setStyleSheet("""
                        color: #ffa500;
                        font-weight: bold;
                        font-size: 14px;
                        padding: 3px 8px;
                        background-color: #3a2a1a;
                        border-radius: 3px;
                    """)
            
            # AI 메시지 레이블 업데이트
            if self.ai_message_label:
                self.ai_message_label.setText(f"🤖 [ML AI] {message}")
        except Exception as e:
            print(f"⚠️ ML AI UI 업데이트 오류: {e}")
    
    def _on_ml_analysis_error(self, error_msg):
        """ML AI 분석 오류"""
        if self.ai_message_label:
            self.ai_message_label.setText(f"⚠️ ML AI 분석 오류")
    
    def _on_rl_analysis_ready(self, result):
        """강화학습 AI 분석 완료 (메인 스레드에서 호출)"""
        try:
            decision = result.get('decision', {})
            ui_info = result.get('ui_info', {})
            
            # 상태 표시
            action_name = decision.get('action_name', 'HOLD')
            if self.rl_ai_status_label:
                self.rl_ai_status_label.setText(f"판정: {action_name}")
                
                # 색상 설정
                if action_name == 'BUY':
                    color = '#0ecb81'
                elif action_name == 'SELL':
                    color = '#f6465d'
                elif action_name == 'FREEZE':
                    color = '#888888'
                elif action_name == 'DELETE':
                    color = '#f6465d'
                else:
                    color = '#ffa500'
                
                self.rl_ai_status_label.setStyleSheet(f"""
                    color: {color};
                    font-weight: bold;
                    font-size: 11px;
                    padding: 2px 6px;
                    background-color: #2b1a3a;
                    border-radius: 3px;
                """)
            
            # 프로그레스바 완료 표시
            if self.rl_ai_progress:
                self._rl_analysis_progress = 100
                self.rl_ai_progress.setValue(100)
                self.rl_ai_progress.setFormat("분석 완료! %p%")
                # 애니메이션 중지
                self._stop_rl_progress_animation()
            
            # 분석 메시지 표시 (N/B MAX, MIN 값 포함)
            analysis = ui_info.get('ai_analysis', '분석 중...')
            score = ui_info.get('card_score_ai', 50.0)
            loss_rate = ui_info.get('card_loss_rate_ai', 0.5)
            
            # 카드에서 최신 N/B MAX, MIN 값 가져오기
            nb_max = self.card.get('nb_max', 5.5)
            nb_min = self.card.get('nb_min', 5.5)
            
            if self.rl_ai_label:
                message = f"🧠 [강화학습 AI]\n{analysis}\n점수: {score:.1f} | 손실률: {loss_rate:.2%}\nN/B MAX: {nb_max:.{self.decimal_places}f} | MIN: {nb_min:.{self.decimal_places}f}"
                self.rl_ai_label.setText(message)
            
            # 강화학습 AI 판정 반영하여 점수 업데이트 (BUY 상태일 때)
            if self._is_holding_position() and self.current_price > 0:
                # 현재 손익률 계산
                if self.buy_entry_price > 0:
                    profit_loss_percent = ((self.current_price - self.buy_entry_price) / self.buy_entry_price) * 100
                else:
                    profit_loss_percent = 0
                
                # 강화학습 AI 판정을 반영하여 점수 업데이트
                self._update_realtime_score(self.current_price, profit_loss_percent, action_name)
            
            # 행동 버튼 활성화/비활성화
            if action_name == 'DELETE':
                if 'DELETE' in self.rl_action_buttons:
                    self.rl_action_buttons['DELETE'].setStyleSheet("""
                        QLabel {
                            color: #f6465d;
                            font-size: 16px;
                            padding: 5px;
                            background-color: #4a1a1a;
                            border: 2px solid #f6465d;
                            border-radius: 3px;
                        }
                    """)
            elif action_name == 'FREEZE':
                if 'FREEZE' in self.rl_action_buttons:
                    self.rl_action_buttons['FREEZE'].setStyleSheet("""
                        QLabel {
                            color: #888888;
                            font-size: 16px;
                            padding: 5px;
                            background-color: #3a3a3a;
                            border: 2px solid #888888;
                            border-radius: 3px;
                        }
                    """)
            
            # 판정 결과에 따른 자동 실행
            # SELL 판정인 경우 시간 기록 및 판정 업데이트 중단 준비
            if action_name == 'SELL':
                import time
                self._last_sell_decision_time = time.time()
                # SELL 판정이 나왔으므로 판정 업데이트 중단 (매도 완료 여부와 관계없이)
                # 매도가 완료되면 _sell_executed가 True로 유지되고,
                # 매도가 실패하거나 보유 포지션이 없으면 _auto_execute_sell에서 True로 설정됨
                self._sell_executed = False  # 일단 False로 설정, _auto_execute_sell에서 True로 변경
            
            self._auto_execute_rl_decision(action_name, decision)
            
        except Exception as e:
            print(f"⚠️ 강화학습 AI UI 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_rl_analysis_error(self, error_msg):
        """강화학습 AI 분석 오류"""
        # 프로그레스바 오류 표시
        if self.rl_ai_progress:
            self._rl_analysis_progress = 0
            self.rl_ai_progress.setValue(0)
            self.rl_ai_progress.setFormat("분석 오류")
            self._stop_rl_progress_animation()
        
        if self.rl_ai_label:
            self.rl_ai_label.setText(f"⚠️ 강화학습 AI 분석 오류: {error_msg}")
    
    def _start_rl_progress_animation(self):
        """강화학습 AI 프로그레스바 애니메이션 시작"""
        if not self.rl_ai_progress:
            return
        
        # 기존 타이머가 있으면 중지
        self._stop_rl_progress_animation()
        
        # 프로그레스바 애니메이션 (0-90%까지 점진적 증가)
        self._rl_analysis_progress = 0
        self._rl_progress_timer = QTimer(self)
        self._rl_progress_timer.timeout.connect(self._update_rl_progress)
        self._rl_progress_timer.start(100)  # 100ms마다 업데이트
    
    def _stop_rl_progress_animation(self):
        """강화학습 AI 프로그레스바 애니메이션 중지"""
        if self._rl_progress_timer:
            self._rl_progress_timer.stop()
            self._rl_progress_timer = None
    
    def _update_rl_progress(self):
        """강화학습 AI 프로그레스바 업데이트"""
        if not self.rl_ai_progress:
            return
        
        # 0-85%까지 빠르게 증가 (실제 완료는 워커 완료 시 100%로 설정)
        if self._rl_analysis_progress < 85:
            # 더 빠른 증가 (초반 매우 빠르게, 후반도 빠르게)
            if self._rl_analysis_progress < 50:
                increment = 5  # 초반 빠르게
            elif self._rl_analysis_progress < 75:
                increment = 3  # 중반 빠르게
            else:
                increment = 2  # 후반도 빠르게
            
            self._rl_analysis_progress = min(85, self._rl_analysis_progress + increment)
            self.rl_ai_progress.setValue(self._rl_analysis_progress)
            
            # 진행률에 따른 메시지 변경
            if self._rl_analysis_progress < 30:
                self.rl_ai_progress.setFormat("데이터 수집 중... %p%")
            elif self._rl_analysis_progress < 60:
                self.rl_ai_progress.setFormat("AI 모델 분석 중... %p%")
            else:
                self.rl_ai_progress.setFormat("판정 결정 중... %p%")
        else:
            # 85%에 도달하면 애니메이션 중지 (실제 완료는 워커 완료 시)
            self._stop_rl_progress_animation()
    
    def _auto_execute_rl_decision(self, action_name: str, decision: dict):
        """판정 결과에 따른 자동 실행"""
        try:
            card_id = self.card.get('card_id', '')
            
            # BUY 판정: 보유 중이 아니면 자동 매수
            if action_name == 'BUY':
                self._auto_execute_buy(card_id)
            
            # SELL 판정: 보유 중인 포지션이 있으면 자동 매도
            elif action_name == 'SELL':
                self._auto_execute_sell(card_id)
            
            # FREEZE/DELETE 판정: 자동 폐기 처리
            elif action_name in ['FREEZE', 'DELETE']:
                self._auto_execute_discard(card_id, action_name)
            
            # HOLD 판정: 생산 카드에서 제거
            elif action_name == 'HOLD':
                self._auto_execute_hold_removal(card_id)
            
        except Exception as e:
            print(f"⚠️ 판정 자동 실행 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _auto_execute_buy(self, card_id: str):
        """BUY 판정 시 자동 매수 실행"""
        try:
            # 카드 히스토리 확인: 이미 보유 중인지 체크
            history_list = self.card.get('history_list', [])
            is_holding = False
            
            for hist in reversed(history_list):
                if hist.get('type') == 'SOLD':
                    # 이미 매도 완료된 상태 - 새로 매수 가능
                    is_holding = False
                    break
                elif hist.get('type') in ['NEW', 'BUY']:
                    # 이미 보유 중
                    is_holding = True
                    break
            
            if is_holding:
                print(f"ℹ️ 카드 {card_id}: 이미 보유 중이어서 매수 건너뜀")
                return
            
            # 현재 가격 확인
            current_price = self.current_price if self.current_price > 0 else self.production_price
            if current_price <= 0:
                print(f"⚠️ 카드 {card_id}: 현재 가격을 알 수 없어 매수 불가")
                return
            
            # 최소 매수 금액 가져오기 (캐싱 최적화)
            parent = self._get_parent_with_attr('settings_manager')
            
            if not parent or not hasattr(parent, 'settings_manager'):
                print(f"⚠️ 카드 {card_id}: 설정 관리자를 찾을 수 없어 매수 불가")
                return
            
            min_buy_amount = parent.settings_manager.get("min_buy_amount", 5000)
            amount_krw = min_buy_amount
            purchase_amount = amount_krw / current_price
            
            print(f"🟢 [자동 매수] 카드 {card_id}: BUY 판정에 따라 자동 매수 실행 (금액: {amount_krw:,.0f} KRW, 수량: {purchase_amount:.8f} BTC)")
            
            # 실제 트레이딩 ON/OFF 체크
            if hasattr(parent, 'real_trading_enabled'):
                if not parent.real_trading_enabled:
                    print(f"⚠️ 실제 트레이딩이 OFF 상태라 매수 실행 안 함 (시뮬레이션 모드)")
                    # 시뮬레이션 모드: 히스토리만 추가
                    self._simulate_buy(card_id, current_price, amount_krw, purchase_amount)
                    return
            
            # 실제 매수 실행 (백그라운드)
            from workers.order_workers import BuyOrderWorker
            
            if hasattr(parent, 'upbit') and parent.upbit:
                # 실제 Upbit API 사용
                buy_worker = BuyOrderWorker(
                    parent.upbit,
                    amount_krw,
                    purchase_amount,
                    parent.item_manager if hasattr(parent, 'item_manager') else None
                )
                # 부모를 명시적으로 설정하여 안전한 소멸 보장
                buy_worker.setParent(self)
                self._buy_worker = buy_worker  # 추적
                buy_worker.order_completed.connect(
                    lambda amt, pur: self._on_auto_buy_completed(card_id, current_price, amt, pur)
                )
                buy_worker.order_failed.connect(
                    lambda msg: self._on_auto_buy_failed(card_id, msg)
                )
                # finished 시그널: 안전하게 처리
                def safe_buy_finished():
                    try:
                        if hasattr(self, '_buy_worker'):
                            self._buy_worker = None
                    except:
                        pass
                buy_worker.finished.connect(safe_buy_finished)
                buy_worker.start()
            else:
                # Paper Trading 모드: 시뮬레이션
                self._simulate_buy(card_id, current_price, amount_krw, purchase_amount)
                
        except Exception as e:
            print(f"⚠️ 자동 매수 실행 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _simulate_buy(self, card_id: str, entry_price: float, amount_krw: float, purchase_amount: float):
        """시뮬레이션 모드: 매수 시뮬레이션"""
        try:
            # 생산 카드 관리자에 매수 히스토리 추가 (캐싱 최적화)
            parent = self._get_parent_with_attr('production_card_manager')
            
            if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                fee_rate = parent.settings_manager.get("fee_rate", 0.1) / 100.0 if parent.settings_manager else 0.001
                fee_amount = amount_krw * (fee_rate / 2)  # 매수 수수료
                
                # 히스토리 타입 결정 (첫 매수면 NEW, 아니면 BUY)
                history_list = self.card.get('history_list', [])
                has_any_buy = any(hist.get('type') in ['NEW', 'BUY'] for hist in history_list)
                history_type = 'NEW' if not has_any_buy else 'BUY'
                
                parent.production_card_manager.add_buy_history(
                    card_id=card_id,
                    qty=purchase_amount,
                    entry_price=entry_price,
                    fee_amount=fee_amount,
                    memo=f"자동 매수 (BUY 판정, 시뮬레이션)"
                )
                print(f"✅ [시뮬레이션] 카드 {card_id} 매수 완료 (금액: {amount_krw:,.0f} KRW)")
                
                # 매수 진입 가격 업데이트
                self.buy_entry_price = entry_price
                self.card['buy_entry_price'] = entry_price
                
                # UI 새로고침
                if hasattr(parent, 'refresh_production_cards'):
                    QTimer.singleShot(500, parent.refresh_production_cards)
                
                # 버튼 상태 업데이트 (매도 버튼 표시)
                def update_after_sim_buy():
                    # 카드 데이터 다시 로드
                    if parent and hasattr(parent, 'production_card_manager'):
                        updated_card = parent.production_card_manager.get_card_by_id(card_id)
                        if updated_card:
                            self.card = updated_card
                    self._update_button_states()
                
                QTimer.singleShot(600, update_after_sim_buy)
                
                # 강화학습 AI 학습 데이터 기록 (매수 완료 시)
                self._record_rl_buy(
                    parent=parent,
                    card_id=card_id,
                    entry_price=entry_price,
                    amount_krw=amount_krw,
                    purchase_amount=purchase_amount,
                    fee_amount=fee_amount,
                    is_simulation=True  # 시뮬레이션 모드
                )
        except Exception as e:
            print(f"⚠️ 시뮬레이션 매수 오류: {e}")
    
    def _update_button_states(self):
        """버튼 상태 업데이트 (보유 상태에 따라)"""
        try:
            is_holding = self._is_holding_position()
            sold_history = self._get_latest_sold_history()
            
            if hasattr(self, 'buy_button') and self.buy_button:
                if is_holding or sold_history:
                    self.buy_button.setEnabled(False)
                    self.buy_button.setToolTip("보유 중이거나 매도 완료된 카드는 매수할 수 없습니다.")
                else:
                    self.buy_button.setEnabled(True)
                    self.buy_button.setToolTip("")
            
            if hasattr(self, 'sell_button') and self.sell_button:
                if is_holding and not sold_history:
                    self.sell_button.setVisible(True)
                    self.sell_button.setEnabled(True)
                    self.sell_button.setToolTip("")
                else:
                    self.sell_button.setVisible(False)
        except Exception as e:
            print(f"⚠️ 버튼 상태 업데이트 오류: {e}")
    
    def _on_auto_buy_completed(self, card_id: str, entry_price: float, amount_krw: float, purchase_amount: float):
        """자동 매수 완료"""
        try:
            # 매수 진입 가격 업데이트
            self.buy_entry_price = entry_price
            # 카드 데이터 업데이트
            self.card['buy_entry_price'] = entry_price
            parent = self._get_parent_with_attr('production_card_manager')
            
            if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                fee_rate = parent.settings_manager.get("fee_rate", 0.1) / 100.0 if parent.settings_manager else 0.001
                fee_amount = amount_krw * (fee_rate / 2)  # 매수 수수료
                
                # 히스토리 타입 결정 (첫 매수면 NEW, 아니면 BUY)
                history_list = self.card.get('history_list', [])
                has_any_buy = any(hist.get('type') in ['NEW', 'BUY'] for hist in history_list)
                
                parent.production_card_manager.add_buy_history(
                    card_id=card_id,
                    qty=purchase_amount,
                    entry_price=entry_price,
                    fee_amount=fee_amount,
                    memo=f"자동 매수 (BUY 판정)"
                )
                print(f"✅ [자동 매수 완료] 카드 {card_id} (금액: {amount_krw:,.0f} KRW)")
                
                # 매수 진입 가격 업데이트
                self.buy_entry_price = entry_price
                self.card['buy_entry_price'] = entry_price
                
                # UI 새로고침
                if hasattr(parent, 'refresh_production_cards'):
                    QTimer.singleShot(500, parent.refresh_production_cards)
                
                # 잔고 새로고침
                if hasattr(parent, 'refresh_balance'):
                    QTimer.singleShot(600, parent.refresh_balance)
                
                # 버튼 상태 업데이트 (매도 버튼 표시)
                def update_after_auto_buy():
                    # 카드 데이터 다시 로드
                    if parent and hasattr(parent, 'production_card_manager'):
                        updated_card = parent.production_card_manager.get_card_by_id(card_id)
                        if updated_card:
                            self.card = updated_card
                    self._update_button_states()
                
                QTimer.singleShot(700, update_after_auto_buy)
                
                # 강화학습 AI 학습 데이터 기록 (매수 완료 시)
                self._record_rl_buy(
                    parent=parent,
                    card_id=card_id,
                    entry_price=entry_price,
                    amount_krw=amount_krw,
                    purchase_amount=purchase_amount,
                    fee_amount=fee_amount,
                    is_simulation=False  # 실제 거래 모드
                )
        except Exception as e:
            print(f"⚠️ 자동 매수 완료 처리 오류: {e}")
    
    def _on_auto_buy_failed(self, card_id: str, error_msg: str):
        """자동 매수 실패"""
        print(f"❌ [자동 매수 실패] 카드 {card_id}: {error_msg}")
    
    def _get_parent_with_attr(self, attr_name: str):
        """부모 위젯 찾기 (캐싱 최적화)"""
        try:
            # 위젯이 삭제되었는지 확인
            try:
                _ = self.parent()
            except RuntimeError:
                # 위젯이 이미 삭제됨
                return None
            
            # 캐시 확인
            cache_key = f'_parent_{attr_name}_cache'
            try:
                if hasattr(self, cache_key):
                    cached = getattr(self, cache_key)
                    if cached is not None and hasattr(cached, attr_name):
                        return cached
            except RuntimeError:
                # 위젯이 삭제됨
                return None
            
            # 부모 찾기
            try:
                parent = self.parent()
                while parent and not hasattr(parent, attr_name):
                    parent = parent.parent()
                
                # 캐시 저장
                if parent:
                    try:
                        setattr(self, cache_key, parent)
                    except RuntimeError:
                        # 위젯이 삭제됨
                        pass
                
                return parent
            except RuntimeError:
                # 위젯이 삭제됨
                return None
        except RuntimeError:
            # 위젯이 삭제됨
            return None
    
    def _auto_execute_sell(self, card_id: str):
        """SELL 판정 시 자동 매도 실행"""
        try:
            # 카드 히스토리 확인: 보유 중인 포지션이 있는지 체크
            history_list = self.card.get('history_list', [])
            is_holding = False
            latest_buy = None
            
            for hist in reversed(history_list):
                if hist.get('type') == 'SOLD':
                    # 이미 매도 완료된 상태
                    is_holding = False
                    break
                elif hist.get('type') in ['NEW', 'BUY']:
                    is_holding = True
                    latest_buy = hist
                    break
            
            if not is_holding or not latest_buy:
                print(f"ℹ️ 카드 {card_id}: 보유 중인 포지션이 없어 매도 건너뜀")
                # 보유 중인 포지션이 없어도 SELL 판정이 나왔으므로 판정 업데이트 중단
                self._sell_executed = True
                return
            
            # 보유 수량 확인
            qty = latest_buy.get('qty', 0)
            if qty <= 0:
                print(f"⚠️ 카드 {card_id}: 보유 수량이 0이어서 매도 불가")
                # 매도 불가능하지만 SELL 판정이 나왔으므로 판정 업데이트 중단
                self._sell_executed = True
                return
            
            # 현재 가격 확인
            current_price = self.current_price if self.current_price > 0 else self.production_price
            if current_price <= 0:
                print(f"⚠️ 카드 {card_id}: 현재 가격을 알 수 없어 매도 불가")
                # 매도 불가능하지만 SELL 판정이 나왔으므로 판정 업데이트 중단
                self._sell_executed = True
                return
            
            print(f"🔴 [자동 매도] 카드 {card_id}: SELL 판정에 따라 자동 매도 실행 (수량: {qty}, 가격: {current_price:,.0f})")
            
            # SELL 판정 실행 플래그 설정 (판정 업데이트 중단)
            self._sell_executed = True
            
            # 실제 트레이딩 ON/OFF 체크 (캐싱 최적화)
            parent = self._get_parent_with_attr('real_trading_enabled')
            
            if parent and hasattr(parent, 'real_trading_enabled'):
                if not parent.real_trading_enabled:
                    print(f"⚠️ 실제 트레이딩이 OFF 상태라 매도 실행 안 함 (시뮬레이션 모드)")
                    # 시뮬레이션 모드: 히스토리만 추가
                    self._simulate_sell(card_id, current_price, qty)
                    return
            
            # 실제 매도 실행 (백그라운드)
            from workers.order_workers import SellOrderWorker
            
            if parent and hasattr(parent, 'upbit') and parent.upbit:
                # 실제 Upbit API 사용
                sell_worker = SellOrderWorker(
                    parent.upbit,
                    f"card_{card_id}",
                    qty,
                    current_price
                )
                # 부모를 명시적으로 설정하여 안전한 소멸 보장
                sell_worker.setParent(self)
                self._sell_worker = sell_worker  # 추적
                sell_worker.order_completed.connect(
                    lambda price: self._on_auto_sell_completed(card_id, price, qty)
                )
                sell_worker.order_failed.connect(
                    lambda msg: self._on_auto_sell_failed(card_id, msg)
                )
                # finished 시그널: 안전하게 처리
                def safe_sell_finished():
                    try:
                        if hasattr(self, '_sell_worker'):
                            self._sell_worker = None
                    except:
                        pass
                sell_worker.finished.connect(safe_sell_finished)
                sell_worker.start()
            else:
                # Paper Trading 모드: 시뮬레이션
                self._simulate_sell(card_id, current_price, qty)
                
        except Exception as e:
            print(f"⚠️ 자동 매도 실행 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _simulate_sell(self, card_id: str, current_price: float, qty: float):
        """시뮬레이션 모드: 매도 시뮬레이션"""
        try:
            # 생산 카드 관리자에 매도 히스토리 추가 (캐싱 최적화)
            parent = self._get_parent_with_attr('production_card_manager')
            
            if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                # 최근 BUY 히스토리에서 진입 가격 확인
                latest_buy = None
                for hist in reversed(self.card.get('history_list', [])):
                    if hist.get('type') in ['NEW', 'BUY']:
                        latest_buy = hist
                        break
                
                if latest_buy:
                    entry_price = latest_buy.get('entry_price', current_price)
                    qty = latest_buy.get('qty', 0)
                    
                    # entry_price가 0이거나 qty가 0이면 최소 구매 금액 사용
                    min_buy_amount = parent.settings_manager.get("min_buy_amount", 5000) if parent.settings_manager else 5000
                    if entry_price == 0 or qty == 0:
                        # 최소 구매 금액을 사용해서 entry_price와 qty 계산
                        if entry_price == 0:
                            entry_price = current_price  # 현재 가격을 entry_price로 사용
                        if qty == 0:
                            qty = min_buy_amount / entry_price if entry_price > 0 else 0
                    
                    pnl_percent = ((current_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0
                    pnl_amount = (current_price - entry_price) * qty if entry_price > 0 else 0
                    fee_rate = parent.settings_manager.get("fee_rate", 0.1) / 100.0 if parent.settings_manager else 0.001
                    fee_amount = current_price * qty * (fee_rate / 2)  # 매도 수수료
                    
                    # 실적 기록 (모의 거래)
                    parent.production_card_manager.add_sold_history(
                        card_id=card_id,
                        exit_price=current_price,
                        pnl_percent=pnl_percent,
                        pnl_amount=pnl_amount,
                        fee_amount=fee_amount,
                        qty=qty,
                        memo=f"자동 매도 (SELL 판정, 시뮬레이션)",
                        is_simulation=True,
                        settings_manager=parent.settings_manager if parent.settings_manager else None
                    )
                    print(f"✅ [시뮬레이션] 카드 {card_id} 매도 완료 (손익: {pnl_amount:,.0f} KRW)")
                    
                    # SELL 판정 실행 플래그 설정 (판정 업데이트 중단)
                    self._sell_executed = True
                    
                    # 강화학습 AI 리워드 계산 및 기록
                    self._record_rl_reward(
                        parent=parent,
                        card_id=card_id,
                        action_name='SELL',
                        pnl_percent=pnl_percent,
                        pnl_amount=pnl_amount,
                        current_price=current_price,
                        entry_price=entry_price,
                        qty=qty,
                        fee_amount=fee_amount,
                        is_simulation=True  # 시뮬레이션 모드
                    )
                    
                    # UI 새로고침
                    if hasattr(parent, 'refresh_production_cards'):
                        QTimer.singleShot(500, parent.refresh_production_cards)
                    if hasattr(parent, 'refresh_rl_verification_cards'):
                        # 검증 카드 캐시 무효화 후 새로고침
                        if hasattr(parent, '_verification_cards_cache'):
                            parent._verification_cards_cache = None
                        if hasattr(parent, '_verification_stats_cache'):
                            parent._verification_stats_cache = None
                        QTimer.singleShot(600, lambda: parent.refresh_rl_verification_cards(force_refresh=True))
                    
                    # AI 검증 탭으로 자동 전환
                    if hasattr(parent, 'tab_widget'):
                        # "🧠 AI 검증" 탭 인덱스 찾기
                        verification_tab_index = -1
                        for i in range(parent.tab_widget.count()):
                            if parent.tab_widget.tabText(i) == "🧠 AI 검증":
                                verification_tab_index = i
                                break
                        if verification_tab_index >= 0:
                            QTimer.singleShot(800, lambda idx=verification_tab_index: parent.tab_widget.setCurrentIndex(idx))
                    
                    # UI 새로고침
                    if hasattr(parent, 'refresh_production_cards'):
                        QTimer.singleShot(500, parent.refresh_production_cards)
                    if hasattr(parent, 'refresh_rl_verification_cards'):
                        # 검증 카드 캐시 무효화 후 새로고침
                        if hasattr(parent, '_verification_cards_cache'):
                            parent._verification_cards_cache = None
                        if hasattr(parent, '_verification_stats_cache'):
                            parent._verification_stats_cache = None
                        QTimer.singleShot(600, lambda: parent.refresh_rl_verification_cards(force_refresh=True))
        except Exception as e:
            print(f"⚠️ 시뮬레이션 매도 오류: {e}")
    
    def _on_auto_sell_completed(self, card_id: str, current_price: float, qty: float):
        """자동 매도 완료"""
        try:
            parent = self._get_parent_with_attr('production_card_manager')
            
            if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                # 최근 BUY 히스토리에서 진입 가격 확인
                latest_buy = None
                for hist in reversed(self.card.get('history_list', [])):
                    if hist.get('type') in ['NEW', 'BUY']:
                        latest_buy = hist
                        break
                
                if latest_buy:
                    entry_price = latest_buy.get('entry_price', current_price)
                    pnl_percent = ((current_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0
                    pnl_amount = (current_price - entry_price) * qty if entry_price > 0 else 0
                    fee_rate = parent.settings_manager.get("fee_rate", 0.1) / 100.0 if parent.settings_manager else 0.001
                    fee_amount = current_price * qty * (fee_rate / 2)  # 매도 수수료
                    
                    # 실적 기록 (실제 거래)
                    sold_history = parent.production_card_manager.add_sold_history(
                        card_id=card_id,
                        exit_price=current_price,
                        pnl_percent=pnl_percent,
                        pnl_amount=pnl_amount,
                        fee_amount=fee_amount,
                        qty=qty,
                        memo=f"자동 매도 (SELL 판정)",
                        is_simulation=False
                    )
                    print(f"✅ [자동 매도 완료] 카드 {card_id} (손익: {pnl_amount:,.0f} KRW)")
                    
                    # SELL 판정 실행 완료 플래그 설정 (판정 업데이트 중단)
                    self._sell_executed = True
                    
                    # 강화학습 AI 리워드 계산 및 기록
                    self._record_rl_reward(
                        parent=parent,
                        card_id=card_id,
                        action_name='SELL',
                        pnl_percent=pnl_percent,
                        pnl_amount=pnl_amount,
                        current_price=current_price,
                        entry_price=entry_price,
                        qty=qty,
                        fee_amount=fee_amount,
                        is_simulation=True  # 시뮬레이션 모드
                    )
                    
                    # UI 새로고침
                    if hasattr(parent, 'refresh_production_cards'):
                        QTimer.singleShot(500, parent.refresh_production_cards)
                    if hasattr(parent, 'refresh_rl_verification_cards'):
                        # 검증 카드 캐시 무효화 후 새로고침
                        if hasattr(parent, '_verification_cards_cache'):
                            parent._verification_cards_cache = None
                        if hasattr(parent, '_verification_stats_cache'):
                            parent._verification_stats_cache = None
                        QTimer.singleShot(600, lambda: parent.refresh_rl_verification_cards(force_refresh=True))
                    
                    # AI 검증 탭으로 자동 전환
                    if hasattr(parent, 'tab_widget'):
                        # "🧠 AI 검증" 탭 인덱스 찾기
                        verification_tab_index = -1
                        for i in range(parent.tab_widget.count()):
                            if parent.tab_widget.tabText(i) == "🧠 AI 검증":
                                verification_tab_index = i
                                break
                        if verification_tab_index >= 0:
                            QTimer.singleShot(800, lambda idx=verification_tab_index: parent.tab_widget.setCurrentIndex(idx))
                
                # 버튼 상태 업데이트
                QTimer.singleShot(900, self._update_button_states)
        except Exception as e:
            print(f"⚠️ 자동 매도 완료 처리 오류: {e}")
    
    def _on_auto_sell_failed(self, card_id: str, error_msg: str):
        """자동 매도 실패"""
        print(f"❌ [자동 매도 실패] 카드 {card_id}: {error_msg}")
    
    def _auto_execute_hold_removal(self, card_id: str):
        """HOLD 판정 시 생산 카드에서 제거"""
        try:
            print(f"⏸️ [HOLD 판정 제거] 카드 {card_id}: HOLD 판정에 따라 생산 카드에서 제거")
            
            parent = self._get_parent_with_attr('production_card_manager')
            
            if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                card = parent.production_card_manager.get_card_by_id(card_id)
                if card:
                    # 카드 상태를 REMOVED로 변경
                    from managers.production_card_manager import CardState
                    card['card_state'] = CardState.REMOVED.value
                    card['status'] = CardState.REMOVED.value  # 호환성
                    card['removal_pending'] = False
                    
                    # NBverse에 업데이트
                    parent.production_card_manager._update_card_in_nbverse(card)
                    
                    print(f"✅ [HOLD 판정 제거 완료] 카드 {card_id} (생산 카드에서 제거됨)")
                    
                    # UI 새로고침
                    if hasattr(parent, 'refresh_production_cards'):
                        from PyQt6.QtCore import QTimer
                        QTimer.singleShot(500, parent.refresh_production_cards)
            
        except Exception as e:
            print(f"⚠️ HOLD 판정 제거 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _auto_execute_discard(self, card_id: str, action_name: str):
        """FREEZE/DELETE 판정 시 자동 폐기 처리"""
        try:
            print(f"🗑️ [자동 폐기] 카드 {card_id}: {action_name} 판정에 따라 자동 폐기 처리")
            
            # 폐기 전에 워커 종료 신호 전송 (UI 반응성을 위해 비동기 처리)
            print(f"  → 워커 종료 신호 전송...")
            # UI 반응성을 위해 wait_for_completion=False로 변경
            self.cleanup(wait_for_completion=False)  # 워커 종료 신호만 전송, 대기 안 함
            print(f"  ✓ 워커 종료 신호 전송 완료 (비동기)")
            
            parent = self._get_parent_with_attr('production_card_manager')
            
            # 폐기 전 실적 기록 (보유 중인 포지션이 있으면)
            if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                card = parent.production_card_manager.get_card_by_id(card_id)
                if card:
                    history_list = card.get('history_list', [])
                    is_holding = False
                    latest_buy = None
                    
                    for hist in reversed(history_list):
                        if hist.get('type') == 'SOLD':
                            is_holding = False
                            break
                        elif hist.get('type') in ['NEW', 'BUY']:
                            is_holding = True
                            latest_buy = hist
                            break
                    
                    # 보유 중인 포지션이 있으면 실적 기록 (손실로 처리)
                    if is_holding and latest_buy:
                        current_price = self.current_price if self.current_price > 0 else self.production_price
                        if current_price > 0:
                            entry_price = latest_buy.get('entry_price', current_price)
                            qty = latest_buy.get('qty', 0)
                            
                            # entry_price가 0이거나 qty가 0이면 최소 구매 금액 사용
                            min_buy_amount = parent.settings_manager.get("min_buy_amount", 5000) if parent.settings_manager else 5000
                            if entry_price == 0 or qty == 0:
                                # 최소 구매 금액을 사용해서 entry_price와 qty 계산
                                if entry_price == 0:
                                    entry_price = current_price  # 현재 가격을 entry_price로 사용
                                if qty == 0:
                                    qty = min_buy_amount / entry_price if entry_price > 0 else 0
                            
                            pnl_percent = ((current_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0
                            pnl_amount = (current_price - entry_price) * qty if entry_price > 0 else 0
                            fee_rate = parent.settings_manager.get("fee_rate", 0.1) / 100.0 if parent.settings_manager else 0.001
                            fee_amount = current_price * qty * (fee_rate / 2)  # 매도 수수료
                            
                            # 실적 기록 (폐기로 인한 손실)
                            # 실제 트레이딩 모드 확인
                            is_sim = not (hasattr(parent, 'real_trading_enabled') and parent.real_trading_enabled)
                            parent.production_card_manager.add_sold_history(
                                card_id=card_id,
                                exit_price=current_price,
                                pnl_percent=pnl_percent,
                                pnl_amount=pnl_amount,
                                fee_amount=fee_amount,
                                qty=qty,
                                memo=f"자동 폐기 ({action_name} 판정)",
                                is_simulation=is_sim,
                                settings_manager=parent.settings_manager if parent.settings_manager else None
                            )
                            
                            # 강화학습 AI 리워드 계산 및 기록
                            self._record_rl_reward(
                                parent=parent,
                                card_id=card_id,
                                action_name=action_name,
                                pnl_percent=pnl_percent,
                                pnl_amount=pnl_amount,
                                current_price=current_price,
                                entry_price=entry_price,
                                qty=qty,
                                fee_amount=fee_amount,
                                is_simulation=is_sim  # 실제 거래/시뮬레이션 모드
                            )
                            
                            print(f"✅ [폐기 실적 기록] 카드 {card_id} (손익: {pnl_amount:,.0f} KRW)")
            
            # RL 행동 실행 콜백 호출 (카드 제거)
            if self.rl_action_callback:
                self.rl_action_callback(card_id, action_name)
            else:
                print(f"⚠️ RL 행동 콜백이 없어 폐기 처리 불가")
                
        except Exception as e:
            print(f"⚠️ 자동 폐기 처리 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _record_rl_buy(self, parent, card_id: str, entry_price: float,
                      amount_krw: float, purchase_amount: float,
                      fee_amount: float, is_simulation: bool = False):
        """강화학습 AI 매수 학습 데이터 기록 (백그라운드 실행)"""
        try:
            if not hasattr(parent, 'rl_system') or not parent.rl_system:
                print(f"⚠️ RL 시스템이 없어 매수 학습 데이터 기록 불가")
                return
            
            # 카드 데이터 가져오기
            card = parent.production_card_manager.get_card_by_id(card_id)
            if not card:
                print(f"⚠️ 카드 {card_id}를 찾을 수 없어 매수 학습 데이터 기록 불가")
                return
            
            # 백그라운드 워커로 실행
            from workers.rl_buy_worker import RLBuyWorker
            
            worker = RLBuyWorker(
                rl_system=parent.rl_system,
                card=card,
                entry_price=entry_price,
                amount_krw=amount_krw,
                purchase_amount=purchase_amount,
                fee_amount=fee_amount,
                is_simulation=is_simulation
            )
            # 부모를 명시적으로 설정하여 안전한 소멸 보장
            worker.setParent(self)
            self._buy_rl_worker = worker  # 추적
            worker.buy_recorded.connect(
                lambda cid: print(f"✅ [RL 매수 기록 완료] 카드 {cid}")
            )
            worker.error_occurred.connect(
                lambda msg: print(f"⚠️ RL 매수 기록 오류: {msg}")
            )
            # finished 시그널: 안전하게 처리
            def safe_buy_rl_finished():
                try:
                    if hasattr(self, '_buy_rl_worker'):
                        self._buy_rl_worker = None
                except:
                    pass
            worker.finished.connect(safe_buy_rl_finished)
            worker.start()
            
        except Exception as e:
            print(f"⚠️ RL 매수 기록 워커 생성 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _record_rl_reward(self, parent, card_id: str, action_name: str, 
                         pnl_percent: float, pnl_amount: float, 
                         current_price: float, entry_price: float, 
                         qty: float, fee_amount: float, is_simulation: bool = None):
        """강화학습 AI 리워드 계산 및 기록 (백그라운드 실행)"""
        try:
            if not hasattr(parent, 'rl_system') or not parent.rl_system:
                print(f"⚠️ RL 시스템이 없어 리워드 기록 불가")
                return
            
            # 카드 데이터 가져오기
            card = parent.production_card_manager.get_card_by_id(card_id)
            if not card:
                print(f"⚠️ 카드 {card_id}를 찾을 수 없어 리워드 기록 불가")
                return
            
            # is_simulation 정보 확인 (파라미터가 없으면 히스토리에서 확인)
            if is_simulation is None:
                # 최근 SOLD 히스토리에서 is_simulation 확인
                history_list = card.get('history_list', [])
                for hist in reversed(history_list):
                    if hist.get('type') == 'SOLD':
                        is_simulation = hist.get('is_simulation', False)
                        break
                # 히스토리에서 찾지 못하면 부모의 real_trading_enabled 상태 확인
                if is_simulation is None:
                    if hasattr(parent, 'real_trading_enabled'):
                        is_simulation = not parent.real_trading_enabled
                    else:
                        is_simulation = False  # 기본값: 실제 거래
            
            # 백그라운드 워커로 실행
            from workers.rl_reward_worker import RLRewardWorker
            
            worker = RLRewardWorker(
                rl_system=parent.rl_system,
                card=card,
                action_name=action_name,
                pnl_percent=pnl_percent,
                pnl_amount=pnl_amount,
                current_price=current_price,
                entry_price=entry_price,
                qty=qty,
                fee_amount=fee_amount,
                is_simulation=is_simulation
            )
            # 부모를 명시적으로 설정하여 안전한 소멸 보장
            worker.setParent(self)
            self._reward_worker = worker  # 추적
            worker.reward_recorded.connect(
                lambda cid, rwd: print(f"✅ [RL 리워드 기록 완료] 카드 {cid}, 리워드: {rwd:.4f}")
            )
            worker.error_occurred.connect(
                lambda msg: print(f"⚠️ RL 리워드 기록 오류: {msg}")
            )
            # finished 시그널: 안전하게 처리
            def safe_reward_finished():
                try:
                    if hasattr(self, '_reward_worker'):
                        self._reward_worker = None
                except:
                    pass
            worker.finished.connect(safe_reward_finished)
            worker.start()
            
        except Exception as e:
            print(f"⚠️ RL 리워드 기록 워커 생성 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _execute_rl_action(self, action_name: str):
        """강화학습 AI 행동 실행"""
        try:
            if not self.rl_action_callback:
                return
            
            card_id = self.card.get('card_id', '')
            if self.rl_action_callback(card_id, action_name):
                print(f"✅ 강화학습 AI 행동 실행: {action_name} (카드: {card_id})")
                # 카드 제거 시 UI 업데이트는 부모 위젯에서 처리
            else:
                print(f"⚠️ 강화학습 AI 행동 실행 실패: {action_name}")
        except Exception as e:
            print(f"⚠️ 강화학습 AI 행동 실행 오류: {e}")
    
    def _on_buy_clicked(self):
        """매수 버튼 클릭"""
        try:
            from PyQt6.QtWidgets import QMessageBox
            
            # 보유 중인지 확인
            if self._is_holding_position():
                QMessageBox.warning(None, "경고", "이미 보유 중인 포지션이 있습니다.")
                return
            
            # 가격 캐시 서비스에서 현재 가격 조회 (성능 최적화)
            current_price = self._price_cache_service.get_price() if hasattr(self, '_price_cache_service') and self._price_cache_service else 0
            if current_price <= 0:
                QMessageBox.critical(None, "오류", "BTC 가격을 조회할 수 없습니다.")
                return
            
            # 생산 시점 가격 사용
            entry_price = self.production_price if self.production_price > 0 else current_price
            
            # 설정값 가져오기
            min_buy_amount = self.settings_manager.get("min_buy_amount", 5000) if self.settings_manager else 5000
            fee_rate = (self.settings_manager.get("fee_rate", 0.1) / 100.0) if self.settings_manager else 0.001
            
            # 확인 메시지
            fee_amount = min_buy_amount * (fee_rate / 2)
            total_amount = min_buy_amount + fee_amount
            reply = QMessageBox.question(
                None,
                "매수 확인",
                f"매수를 실행하시겠습니까?\n\n"
                f"매수 금액: {min_buy_amount:,.0f} KRW\n"
                f"수수료: {fee_amount:,.0f} KRW\n"
                f"총액: {total_amount:,.0f} KRW\n"
                f"진입 가격: {entry_price:,.0f} KRW",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            
            if reply != QMessageBox.StandardButton.Yes:
                return
            
            # 매수 실행 (시뮬레이션 모드 또는 실제 거래 모드)
            parent = self._get_parent_with_attr('real_trading_enabled')
            card_id = self.card.get('card_id', '')
            purchase_amount = min_buy_amount / entry_price
            
            # 실제 트레이딩 ON/OFF 체크
            if parent and hasattr(parent, 'real_trading_enabled') and parent.real_trading_enabled:
                # 실제 거래 모드: event_handlers를 통해 실제 주문 실행
                parent_widget = self.parent()
                while parent_widget:
                    if hasattr(parent_widget, 'event_handlers') and hasattr(parent_widget.event_handlers, 'on_buy_click_for_card'):
                        # 매수 완료 후 UI 업데이트를 위한 콜백 연결
                        # event_handlers의 _on_buy_order_completed_for_card에서 이미 처리되지만,
                        # 추가로 UI 업데이트를 보장하기 위해 타이머 설정
                        def update_after_real_buy():
                            # 카드 데이터 다시 로드
                            if parent and hasattr(parent, 'production_card_manager'):
                                updated_card = parent.production_card_manager.get_card_by_id(card_id)
                                if updated_card:
                                    self.card = updated_card
                            self._update_button_states()
                        
                        QTimer.singleShot(2000, update_after_real_buy)
                        parent_widget.event_handlers.on_buy_click_for_card(card_id, entry_price, min_buy_amount)
                        return
                    parent_widget = parent_widget.parent()
            else:
                # 시뮬레이션 모드: 히스토리만 추가
                print(f"🧪 [시뮬레이션] 카드 {card_id} 수동 매수 실행 (금액: {min_buy_amount:,.0f} KRW)")
                self._simulate_buy(card_id, entry_price, min_buy_amount, purchase_amount)
                # 버튼 상태 업데이트 (매도 버튼 표시)
                # 카드 데이터 새로고침 후 버튼 상태 업데이트
                def update_after_buy():
                    # 카드 데이터 다시 로드
                    if parent and hasattr(parent, 'production_card_manager'):
                        updated_card = parent.production_card_manager.get_card_by_id(card_id)
                        if updated_card:
                            self.card = updated_card
                    self._update_button_states()
                
                QTimer.singleShot(800, update_after_buy)
                QMessageBox.information(None, "매수 완료 (시뮬레이션)", f"시뮬레이션 모드로 매수가 완료되었습니다.\n금액: {min_buy_amount:,.0f} KRW")
                return
            
            QMessageBox.warning(None, "경고", "매수 기능을 사용할 수 없습니다.")
        except Exception as e:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.critical(None, "오류", f"매수 중 오류 발생: {e}")
            print(f"⚠️ 매수 버튼 클릭 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_sell_clicked(self):
        """매도 버튼 클릭"""
        try:
            from PyQt6.QtWidgets import QMessageBox
            
            # 보유 중인지 확인
            if not self._is_holding_position():
                QMessageBox.warning(None, "경고", "보유 중인 포지션이 없습니다.")
                return
            
            # 최근 매수 정보 가져오기
            latest_buy = None
            for hist in reversed(self.card.get('history_list', [])):
                if hist.get('type') in ['NEW', 'BUY']:
                    latest_buy = hist
                    break
            
            if not latest_buy:
                QMessageBox.warning(None, "경고", "매수 정보를 찾을 수 없습니다.")
                return
            
            # 가격 캐시 서비스에서 현재 가격 조회
            current_price = self._price_cache_service.get_price() if hasattr(self, '_price_cache_service') and self._price_cache_service else 0
            if current_price <= 0:
                QMessageBox.critical(None, "오류", "BTC 가격을 조회할 수 없습니다.")
                return
            
            # 포지션 정보
            entry_price = safe_float(latest_buy.get('entry_price', 0))
            qty = safe_float(latest_buy.get('qty', 0))
            
            if entry_price <= 0 or qty <= 0:
                QMessageBox.warning(None, "경고", "유효하지 않은 포지션 정보입니다.")
                return
            
            # 설정값 가져오기
            fee_rate = (self.settings_manager.get("fee_rate", 0.1) / 100.0) if self.settings_manager else 0.001
            
            # 손익 계산
            current_value = current_price * qty
            sell_fee = current_value * (fee_rate / 2)
            sell_amount = current_value - sell_fee
            
            buy_amount = entry_price * qty
            buy_fee = buy_amount * (fee_rate / 2)
            buy_total = buy_amount + buy_fee
            
            pnl_amount = sell_amount - buy_total
            pnl_percent = (pnl_amount / buy_total * 100) if buy_total > 0 else 0
            
            # 확인 메시지
            pnl_text = f"+{pnl_percent:.2f}% (+{pnl_amount:,.0f} KRW)" if pnl_amount >= 0 else f"{pnl_percent:.2f}% ({pnl_amount:,.0f} KRW)"
            pnl_color = "수익" if pnl_amount >= 0 else "손실"
            
            reply = QMessageBox.question(
                None,
                "매도 확인",
                f"매도를 실행하시겠습니까?\n\n"
                f"보유 수량: {qty:.8f} BTC\n"
                f"진입 가격: {entry_price:,.0f} KRW\n"
                f"현재 가격: {current_price:,.0f} KRW\n"
                f"매도 금액: {sell_amount:,.0f} KRW (수수료 제외)\n"
                f"예상 손익: {pnl_text} ({pnl_color})",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            
            if reply != QMessageBox.StandardButton.Yes:
                return
            
            # 매도 실행 (시뮬레이션 모드 또는 실제 거래 모드)
            parent = self._get_parent_with_attr('real_trading_enabled')
            card_id = self.card.get('card_id', '')
            
            # 실제 트레이딩 ON/OFF 체크
            if parent and hasattr(parent, 'real_trading_enabled') and parent.real_trading_enabled:
                # 실제 거래 모드: event_handlers를 통해 실제 주문 실행
                # 생산 카드의 매도는 직접 처리 (on_sell_click_for_card가 없으므로)
                # 실제 매도 실행 (백그라운드)
                if hasattr(parent, 'upbit') and parent.upbit:
                    from workers.order_workers import SellOrderWorker
                    sell_worker = SellOrderWorker(
                        parent.upbit,
                        f"card_{card_id}",
                        qty,
                        current_price
                    )
                    sell_worker.setParent(self)
                    self._sell_worker = sell_worker
                    sell_worker.order_completed.connect(
                        lambda price: self._on_auto_sell_completed(card_id, price, qty)
                    )
                    sell_worker.order_failed.connect(
                        lambda msg: QMessageBox.critical(None, "오류", f"매도 실패: {msg}")
                    )
                    def safe_sell_finished():
                        try:
                            if hasattr(self, '_sell_worker'):
                                self._sell_worker = None
                        except:
                            pass
                    sell_worker.finished.connect(safe_sell_finished)
                    sell_worker.start()
                else:
                    QMessageBox.warning(None, "경고", "Upbit API가 설정되지 않았습니다.")
            else:
                # 시뮬레이션 모드: 히스토리만 추가
                print(f"🧪 [시뮬레이션] 카드 {card_id} 수동 매도 실행 (수량: {qty:.8f} BTC)")
                self._simulate_sell(card_id, current_price, qty)
                QMessageBox.information(None, "매도 완료 (시뮬레이션)", f"시뮬레이션 모드로 매도가 완료되었습니다.\n수량: {qty:.8f} BTC")
                return
        except Exception as e:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.critical(None, "오류", f"매도 중 오류 발생: {e}")
            print(f"⚠️ 매도 버튼 클릭 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_discard_clicked(self):
        """폐기 버튼 클릭"""
        try:
            # 위젯이 삭제되었는지 확인
            try:
                if not hasattr(self, 'card') or self.card is None:
                    return
            except RuntimeError:
                # 위젯이 이미 삭제됨
                return
            
            from PyQt6.QtWidgets import QMessageBox
            
            card_id = self.card.get('card_id', '')
            card_key = self.card.get('card_key', '')
            
            # 확인 메시지
            reply = QMessageBox.question(
                None,
                "카드 폐기 확인",
                f"카드를 폐기하시겠습니까?\n\n카드 ID: {card_id}\n카드 키: {card_key}\n\n이 작업은 되돌릴 수 없습니다.",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.No
            )
            
            if reply != QMessageBox.StandardButton.Yes:
                return
            
            # 보유 중인 포지션이 있는지 확인
            history_list = self.card.get('history_list', [])
            is_holding = False
            latest_buy = None
            
            for hist in reversed(history_list):
                if hist.get('type') == 'SOLD':
                    is_holding = False
                    break
                elif hist.get('type') in ['NEW', 'BUY']:
                    is_holding = True
                    latest_buy = hist
                    break
            
            # 보유 중인 포지션이 있으면 경고
            if is_holding and latest_buy:
                warning_reply = QMessageBox.warning(
                    None,
                    "보유 중인 포지션 경고",
                    f"이 카드에는 보유 중인 포지션이 있습니다.\n\n진입 가격: {latest_buy.get('entry_price', 0):,.0f} KRW\n수량: {latest_buy.get('qty', 0):.8f} BTC\n\n그래도 폐기하시겠습니까?",
                    QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                    QMessageBox.StandardButton.No
                )
                
                if warning_reply != QMessageBox.StandardButton.Yes:
                    return
                
                # 보유 중인 포지션이 있으면 실적 기록 (손실로 처리)
                current_price = self.current_price if self.current_price > 0 else self.production_price
                if current_price > 0:
                    entry_price = latest_buy.get('entry_price', current_price)
                    qty = latest_buy.get('qty', 0)
                    
                    # entry_price가 0이거나 qty가 0이면 최소 구매 금액 사용
                    parent_settings = self._get_parent_with_attr('settings_manager')
                    min_buy_amount = 5000
                    if parent_settings and hasattr(parent_settings, 'settings_manager') and parent_settings.settings_manager:
                        min_buy_amount = parent_settings.settings_manager.get("min_buy_amount", 5000)
                    
                    if entry_price == 0 or qty == 0:
                        # 최소 구매 금액을 사용해서 entry_price와 qty 계산
                        if entry_price == 0:
                            entry_price = current_price  # 현재 가격을 entry_price로 사용
                        if qty == 0:
                            qty = min_buy_amount / entry_price if entry_price > 0 else 0
                    
                    pnl_percent = ((current_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0
                    pnl_amount = (current_price - entry_price) * qty if entry_price > 0 else 0
                    
                    fee_rate = parent_settings.settings_manager.get("fee_rate", 0.1) / 100.0 if parent_settings and hasattr(parent_settings, 'settings_manager') and parent_settings.settings_manager else 0.001
                    fee_amount = current_price * qty * (fee_rate / 2)  # 매도 수수료
                    
                    # 실적 기록 (사용자 폐기)
                    parent = self._get_parent_with_attr('production_card_manager')
                    
                    if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                        is_sim = not (hasattr(parent, 'real_trading_enabled') and parent.real_trading_enabled)
                        parent.production_card_manager.add_sold_history(
                            card_id=card_id,
                            exit_price=current_price,
                            pnl_percent=pnl_percent,
                            pnl_amount=pnl_amount,
                            fee_amount=fee_amount,
                            qty=qty,
                            memo="사용자 폐기",
                            is_simulation=is_sim,
                            settings_manager=parent_settings.settings_manager if parent_settings and hasattr(parent_settings, 'settings_manager') and parent_settings.settings_manager else None
                        )
                        print(f"✅ [폐기 실적 기록] 카드 {card_id} (손익: {pnl_amount:,.0f} KRW)")
            
            # 폐기 처리 (RL DELETE 액션과 동일하게 처리) - 캐싱 최적화
            parent = self._get_parent_with_attr('rl_action_callback')
            
            if parent and hasattr(parent, 'rl_action_callback'):
                # RL DELETE 액션 실행
                parent.rl_action_callback(card_id, 'DELETE')
                print(f"✅ [사용자 폐기] 카드 {card_id} 폐기 완료")
                
                # UI 새로고침
                if hasattr(parent, 'refresh_production_cards'):
                    from PyQt6.QtCore import QTimer
                    QTimer.singleShot(500, parent.refresh_production_cards)
            else:
                # 직접 폐기 처리
                parent = self._get_parent_with_attr('execute_rl_action')
                
                if parent and hasattr(parent, 'execute_rl_action'):
                    parent.execute_rl_action(card_id, 4, 'DELETE')  # DELETE = 4
                    print(f"✅ [사용자 폐기] 카드 {card_id} 폐기 완료")
                else:
                    QMessageBox.warning(None, "경고", "폐기 기능을 사용할 수 없습니다.")
                    
        except RuntimeError as e:
            # 위젯이 이미 삭제된 경우 무시
            if "has been deleted" in str(e):
                return
            raise
        except Exception as e:
            from PyQt6.QtWidgets import QMessageBox
            QMessageBox.critical(None, "오류", f"폐기 중 오류 발생: {e}")
            print(f"⚠️ 폐기 버튼 클릭 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def cleanup(self, wait_for_completion=True):
        """리소스 정리
        
        Args:
            wait_for_completion: 워커가 완전히 종료될 때까지 대기할지 여부
        """
        card_id = self.card.get('card_id', 'unknown') if hasattr(self, 'card') and self.card else 'unknown'
        print(f"🔄 [리소스 정리 시작] 카드: {card_id}, wait_for_completion: {wait_for_completion}")
        
        # 가격 캐시 서비스 콜백 제거
        if hasattr(self, '_price_cache_service'):
            try:
                self._price_cache_service.unregister_callback(self._on_price_updated)
                print(f"  ✓ 가격 캐시 서비스 콜백 제거")
            except Exception as e:
                print(f"  ⚠️ 가격 캐시 서비스 콜백 제거 오류: {e}")
        
        if hasattr(self, 'update_timer'):
            self.update_timer.stop()
            print(f"  ✓ update_timer 중지")
        if hasattr(self, 'ai_update_timer'):
            self.ai_update_timer.stop()
            print(f"  ✓ ai_update_timer 중지")
        if hasattr(self, 'rl_ai_update_timer'):
            self.rl_ai_update_timer.stop()
            print(f"  ✓ rl_ai_update_timer 중지")
        
        # 프로그레스바 애니메이션 중지
        self._stop_rl_progress_animation()
        
        # 워커 종료 (정상 종료만 시도)
        if self._ml_worker:
            try:
                if self._ml_worker.isRunning():
                    print(f"  🔄 ML 워커 종료 시작 (카드: {card_id})")
                    # requestInterruption() 호출하여 중단 요청
                    self._ml_worker.requestInterruption()
                    print(f"  → ML 워커 중단 요청 전송 완료")
                    # quit()도 호출 (이벤트 루프가 있으면 작동)
                    self._ml_worker.quit()
                    print(f"  → ML 워커 quit() 신호 전송 완료")
                    
                    if wait_for_completion:
                        # 워커가 완전히 종료될 때까지 대기 (최대 10초, 필수)
                        import time
                        start_time = time.time()
                        timeout = 10.0  # 10초로 증가 (ML 모델 분석이 오래 걸릴 수 있음)
                        wait_count = 0
                        
                        # 워커가 완전히 종료될 때까지 반복 대기
                        while self._ml_worker.isRunning() and (time.time() - start_time) < timeout:
                            wait_count += 1
                            elapsed = time.time() - start_time
                            if wait_count % 10 == 0:  # 1초마다 로그
                                print(f"  ⏳ ML 워커 종료 대기 중... ({elapsed:.1f}초 경과)")
                            # 100ms씩 대기하되, 완료되면 즉시 반환
                            if self._ml_worker.wait(100):
                                # wait()가 True를 반환하면 워커가 종료됨
                                break
                        
                        if self._ml_worker.isRunning():
                            elapsed = time.time() - start_time
                            print(f"  ⚠️ ML 워커가 {elapsed:.1f}초 후에도 실행 중입니다")
                            print(f"  ⚠️ ML 워커 완료까지 추가 대기 중... (최대 5초 더)")
                            # 추가로 5초 더 대기
                            additional_wait = 0
                            while self._ml_worker.isRunning() and additional_wait < 5.0:
                                if self._ml_worker.wait(200):
                                    break
                                additional_wait += 0.2
                                time.sleep(0.2)
                            
                            if self._ml_worker.isRunning():
                                total_elapsed = time.time() - start_time
                                print(f"  ⚠️ ML 워커가 {total_elapsed:.1f}초 후에도 실행 중입니다")
                                print(f"  ⚠️ 워커 완료까지 무한 대기 중... (위젯 파괴 방지)")
                                # 워커가 완료될 때까지 무한정 대기 (위젯 파괴 방지)
                                while self._ml_worker.isRunning():
                                    if self._ml_worker.wait(500):  # 500ms씩 대기
                                        break
                                    elapsed = time.time() - start_time
                                    if int(elapsed) % 2 == 0 and elapsed > total_elapsed + 1:  # 2초마다 로그
                                        print(f"  ⏳ ML 워커 종료 대기 중... ({elapsed:.1f}초 경과)")
                                final_elapsed = time.time() - start_time
                                print(f"  ✅ ML 워커 종료 완료 ({final_elapsed:.2f}초 소요, 무한 대기 후)")
                            else:
                                elapsed = time.time() - start_time
                                print(f"  ✅ ML 워커 종료 완료 ({elapsed:.2f}초 소요, 추가 대기 후)")
                        else:
                            elapsed = time.time() - start_time
                            print(f"  ✅ ML 워커 종료 완료 ({elapsed:.2f}초 소요)")
                    else:
                        # 대기하지 않음
                        self._ml_worker.wait(2000)
                        print(f"  → ML 워커 종료 신호 전송 완료 (대기 없음)")
                else:
                    print(f"  ℹ️ ML 워커는 실행 중이 아닙니다")
            except Exception as e:
                print(f"  ❌ ML 워커 종료 오류: {e}")
                import traceback
                traceback.print_exc()
            finally:
                # 워커가 완전히 종료된 경우에만 참조 해제
                if self._ml_worker and not self._ml_worker.isRunning():
                    self._ml_worker = None
                    print(f"  ✓ ML 워커 참조 해제 완료")
                elif self._ml_worker:
                    print(f"  ⚠️ ML 워커가 아직 실행 중이므로 참조 유지 (나중에 정리)")
        else:
            print(f"  ℹ️ ML 워커가 없습니다")
        
        if self._rl_worker:
            try:
                if self._rl_worker.isRunning():
                    print(f"  🔄 RL 워커 종료 시작 (카드: {card_id})")
                    # requestInterruption() 호출하여 중단 요청
                    self._rl_worker.requestInterruption()
                    print(f"  → RL 워커 중단 요청 전송 완료")
                    # quit()도 호출 (이벤트 루프가 있으면 작동)
                    self._rl_worker.quit()
                    print(f"  → RL 워커 quit() 신호 전송 완료")
                    
                    if wait_for_completion:
                        # 워커가 완전히 종료될 때까지 대기 (최대 10초, 필수)
                        import time
                        start_time = time.time()
                        timeout = 10.0  # 10초로 증가
                        wait_count = 0
                        
                        # 워커가 완전히 종료될 때까지 반복 대기
                        while self._rl_worker.isRunning() and (time.time() - start_time) < timeout:
                            wait_count += 1
                            elapsed = time.time() - start_time
                            if wait_count % 10 == 0:  # 1초마다 로그
                                print(f"  ⏳ RL 워커 종료 대기 중... ({elapsed:.1f}초 경과)")
                            # 100ms씩 대기하되, 완료되면 즉시 반환
                            if self._rl_worker.wait(100):
                                # wait()가 True를 반환하면 워커가 종료됨
                                break
                        
                        if self._rl_worker.isRunning():
                            elapsed = time.time() - start_time
                            print(f"  ⚠️ RL 워커가 {elapsed:.1f}초 후에도 실행 중입니다")
                            print(f"  ⚠️ RL 워커 완료까지 추가 대기 중... (최대 5초 더)")
                            # 추가로 5초 더 대기
                            additional_wait = 0
                            while self._rl_worker.isRunning() and additional_wait < 5.0:
                                if self._rl_worker.wait(200):
                                    break
                                additional_wait += 0.2
                                time.sleep(0.2)
                            
                            if self._rl_worker.isRunning():
                                total_elapsed = time.time() - start_time
                                print(f"  ⚠️ RL 워커가 {total_elapsed:.1f}초 후에도 실행 중입니다")
                                print(f"  ⚠️ 워커 완료까지 무한 대기 중... (위젯 파괴 방지)")
                                # 워커가 완료될 때까지 무한정 대기 (위젯 파괴 방지)
                                while self._rl_worker.isRunning():
                                    if self._rl_worker.wait(500):  # 500ms씩 대기
                                        break
                                    elapsed = time.time() - start_time
                                    if int(elapsed) % 2 == 0 and elapsed > total_elapsed + 1:  # 2초마다 로그
                                        print(f"  ⏳ RL 워커 종료 대기 중... ({elapsed:.1f}초 경과)")
                                final_elapsed = time.time() - start_time
                                print(f"  ✅ RL 워커 종료 완료 ({final_elapsed:.2f}초 소요, 무한 대기 후)")
                            else:
                                elapsed = time.time() - start_time
                                print(f"  ✅ RL 워커 종료 완료 ({elapsed:.2f}초 소요, 추가 대기 후)")
                        else:
                            elapsed = time.time() - start_time
                            print(f"  ✅ RL 워커 종료 완료 ({elapsed:.2f}초 소요)")
                    else:
                        # 대기하지 않음 - 하지만 최소한의 대기는 필요
                        import time
                        start_time = time.time()
                        timeout = 2.0  # 최대 2초 대기
                        while self._rl_worker.isRunning() and (time.time() - start_time) < timeout:
                            if self._rl_worker.wait(100):
                                break
                        
                        if self._rl_worker.isRunning():
                            print(f"  ⚠️ RL 워커가 2초 후에도 실행 중입니다. 강제 종료하지 않고 참조 유지")
                        else:
                            print(f"  → RL 워커 종료 신호 전송 완료")
                else:
                    print(f"  ℹ️ RL 워커는 실행 중이 아닙니다")
            except Exception as e:
                print(f"  ❌ RL 워커 종료 오류: {e}")
                import traceback
                traceback.print_exc()
            finally:
                # 워커가 완전히 종료된 경우에만 참조 해제
                if self._rl_worker:
                    if not self._rl_worker.isRunning():
                        self._rl_worker = None
                        print(f"  ✓ RL 워커 참조 해제 완료")
                    else:
                        # 실행 중이면 부모 참조만 제거하고 워커는 나중에 정리되도록 함
                        try:
                            self._rl_worker.setParent(None)  # 부모 참조 제거
                        except:
                            pass
                        print(f"  ⚠️ RL 워커가 아직 실행 중이므로 참조 유지 (나중에 정리)")
        else:
            print(f"  ℹ️ RL 워커가 없습니다")
        
        # 추가 워커들 정리 (BuyOrderWorker, SellOrderWorker, RLRewardWorker)
        for worker_name, worker_attr in [('BuyOrder', '_buy_worker'), ('SellOrder', '_sell_worker'), ('Reward', '_reward_worker')]:
            worker = getattr(self, worker_attr, None)
            if worker:
                try:
                    if worker.isRunning():
                        print(f"  🔄 {worker_name} 워커 종료 시작 (카드: {card_id})")
                        worker.requestInterruption()
                        worker.quit()
                        if wait_for_completion:
                            import time
                            start_time = time.time()
                            timeout = 5.0
                            while worker.isRunning() and (time.time() - start_time) < timeout:
                                if worker.wait(100):
                                    break
                            if worker.isRunning():
                                elapsed = time.time() - start_time
                                print(f"  ⚠️ {worker_name} 워커가 {elapsed:.1f}초 후에도 실행 중입니다")
                                # 무한 대기
                                while worker.isRunning():
                                    if worker.wait(500):
                                        break
                                final_elapsed = time.time() - start_time
                                print(f"  ✅ {worker_name} 워커 종료 완료 ({final_elapsed:.2f}초 소요)")
                            else:
                                elapsed = time.time() - start_time
                                print(f"  ✅ {worker_name} 워커 종료 완료 ({elapsed:.2f}초 소요)")
                        setattr(self, worker_attr, None)
                        print(f"  ✓ {worker_name} 워커 참조 해제 완료")
                except Exception as e:
                    print(f"  ❌ {worker_name} 워커 종료 오류: {e}")
                    setattr(self, worker_attr, None)
        
        print(f"✅ [리소스 정리 완료] 카드: {card_id}")
    
    def _is_holding_position(self):
        """보유 중인 포지션이 있는지 확인"""
        history_list = self.card.get('history_list', [])
        for hist in reversed(history_list):
            if hist.get('type') == 'SOLD':
                return False
            elif hist.get('type') in ['NEW', 'BUY']:
                return True
        return False
    
    def _update_buy_entry_price(self):
        """매수 진입 가격 업데이트 (BUY 상태일 때)"""
        history_list = self.card.get('history_list', [])
        for hist in reversed(history_list):
            if hist.get('type') == 'SOLD':
                break
            elif hist.get('type') in ['NEW', 'BUY']:
                self.buy_entry_price = safe_float(hist.get('entry_price', 0))
                if self.buy_entry_price <= 0:
                    self.buy_entry_price = self.production_price
                break
    
    def _calculate_realtime_score(self, current_price: float, profit_loss_percent: float, rl_action: str = None) -> float:
        """실시간 점수 계산 (가격 변동 + 강화학습 AI 판정 고려)
        
        Args:
            current_price: 현재 가격
            profit_loss_percent: 손익률 (%)
            rl_action: 강화학습 AI 판정 (BUY, SELL, HOLD 등)
        
        Returns:
            계산된 점수
        """
        try:
            # 기본 점수는 손익률 기반
            base_score = 100.0
            
            # BUY 상태에서 가격 변동에 따른 점수 조절
            if self.buy_entry_price > 0:
                # 진입 가격 대비 변동률
                price_change_percent = ((current_price - self.buy_entry_price) / self.buy_entry_price) * 100
                
                # 가격 상승: 점수 상승, 가격 하락: 점수 하락
                # 1% 변동당 2점 변화 (최대 ±50점)
                score_change = min(max(price_change_percent * 2, -50), 50)
                base_score = 100.0 + score_change
            else:
                # 진입 가격이 없으면 손익률 기반
                if profit_loss_percent > 0:
                    base_score = 100.0 + min(profit_loss_percent * 2, 50)
                elif profit_loss_percent < 0:
                    base_score = 100.0 + max(profit_loss_percent * 2, -50)
            
            # 강화학습 AI 판정에 따른 점수 조절
            if rl_action:
                if rl_action == 'BUY':
                    # BUY 판정: 점수 +5 (긍정적 신호)
                    base_score += 5
                elif rl_action == 'SELL':
                    # SELL 판정: 점수 -10 (부정적 신호)
                    base_score -= 10
                elif rl_action == 'HOLD':
                    # HOLD 판정: 점수 변화 없음
                    pass
                elif rl_action in ['FREEZE', 'DELETE']:
                    # 폐기 판정: 점수 -20 (매우 부정적)
                    base_score -= 20
            
            # 점수 범위 제한 (0-300)
            return max(0.0, min(300.0, base_score))
            
        except Exception as e:
            print(f"⚠️ 실시간 점수 계산 오류: {e}")
            return 100.0
    
    def _update_realtime_score(self, current_price: float, profit_loss_percent: float, action_name: str = None):
        """실시간 점수 업데이트"""
        try:
            # 강화학습 AI 판정 가져오기
            rl_action = action_name
            if rl_action is None and hasattr(self, 'rl_ai_status_label') and self.rl_ai_status_label:
                status_text = self.rl_ai_status_label.text()
                if '판정:' in status_text:
                    rl_action = status_text.split('판정:')[1].strip()
            
            # 점수 계산
            new_score = self._calculate_realtime_score(current_price, profit_loss_percent, rl_action)
            
            # 점수 업데이트
            self.current_score = new_score
            self.realtime_scores.append(new_score)
            
            # 최대 100개만 유지
            if len(self.realtime_scores) > 100:
                self.realtime_scores = self.realtime_scores[-100:]
            
            # UI 업데이트
            if self.score_value_label:
                self.score_value_label.setText(f"{new_score:.1f}")
                score_color = self._get_score_color(new_score)
                self.score_value_label.setStyleSheet(f"color: {score_color}; font-weight: bold; font-size: 13px;")
            
            # 점수 차트 업데이트
            if self.score_chart_widget:
                self.score_chart_widget.prices = self.realtime_scores
                self.score_chart_widget.update()
            
            # 카드 데이터에 점수 저장 (생산 카드 관리자에 반영)
            self.card['score'] = new_score
            self.card['realtime_scores'] = self.realtime_scores.copy()  # 점수 히스토리 저장
            
            # 생산 카드 관리자에 점수 업데이트 반영 (저장을 위해) - 캐싱 최적화
            # 카드 데이터를 직접 수정하면 생산 카드 관리자가 자동으로 저장함
            parent = self._get_parent_with_attr('production_card_manager')
            
            if parent and hasattr(parent, 'production_card_manager') and parent.production_card_manager:
                card_id = self.card.get('card_id', '')
                if card_id:
                    # 카드 캐시에서 찾아서 업데이트
                    if hasattr(parent.production_card_manager, 'cards_cache'):
                        if card_id in parent.production_card_manager.cards_cache:
                            parent.production_card_manager.cards_cache[card_id]['score'] = new_score
                            parent.production_card_manager.cards_cache[card_id]['realtime_scores'] = self.realtime_scores.copy()
                            # 캐시 dirty 플래그 설정 (저장 필요)
                            parent.production_card_manager._cache_dirty = True
            
        except Exception as e:
            print(f"⚠️ 실시간 점수 업데이트 오류: {e}")
    
    def _get_score_color(self, score: float) -> str:
        """점수에 따른 색상 반환"""
        if score >= 300:
            return '#ff00ff'  # +SS (자홍색)
        elif score >= 260:
            return '#ff00ff'  # ++S (자홍색)
        elif score >= 220:
            return '#ff00ff'  # +S (자홍색)
        elif score >= 180:
            return '#ffd700'  # S (금색)
        elif score >= 140:
            return '#00d1ff'  # A (청록색)
        elif score >= 120:
            return '#0ecb81'  # B (초록색)
        elif score >= 100:
            return '#ffffff'  # C (흰색)
        elif score >= 80:
            return '#ffa500'  # D (주황색)
        elif score >= 60:
            return '#ff6b6b'  # E (연한 빨간색)
        else:
            return '#f6465d'  # F (빨간색)
    
    def _get_latest_sold_history(self):
        """가장 최근 SOLD 히스토리 가져오기"""
        history_list = self.card.get('history_list', [])
        for hist in reversed(history_list):
            if hist.get('type') == 'SOLD':
                return hist
        return None
    
    def _calculate_loss_rate_score(self, pnl_percent: float) -> float:
        """손실률 기반 점수 계산
        
        Args:
            pnl_percent: 손익률 (%)
            
        Returns:
            점수 (0-100)
        """
        try:
            # 손익률에 따른 점수 계산
            # 수익: 50 + (수익률 * 2), 최대 100
            # 손실: 50 - (손실률 * 2), 최소 0
            if pnl_percent > 0:
                # 수익인 경우
                score = 50 + min(pnl_percent * 2, 50)
            elif pnl_percent < 0:
                # 손실인 경우
                score = 50 + max(pnl_percent * 2, -50)
            else:
                # 무승부
                score = 50.0
            
            return max(0.0, min(100.0, score))
        except:
            return 50.0
    
    def _get_score_color(self, score: float) -> str:
        """점수에 따른 색상 반환"""
        if score >= 80:
            return '#0ecb81'  # 초록색 (우수)
        elif score >= 60:
            return '#00d1ff'  # 청록색 (양호)
        elif score >= 40:
            return '#ffa500'  # 주황색 (보통)
        else:
            return '#f6465d'  # 빨간색 (불량)
    
    def __del__(self):
        """위젯 파괴 시 리소스 정리 (안전장치)"""
        try:
            self.cleanup()
        except:
            pass  # 파괴 중에는 예외 무시


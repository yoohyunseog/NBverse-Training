"""폐기된 카드 위젯 모듈"""
from PyQt6.QtWidgets import QFrame, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QPushButton, QSizePolicy
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QColor

from utils import safe_float, parse_iso_datetime
from ui.production_card import ChartWidget


class DiscardedCard(QFrame):
    """폐기된 카드 위젯"""
    def __init__(self, card, decimal_places=10, settings_manager=None, restore_callback=None, parent=None):
        super().__init__(parent)
        self.card = card
        self.decimal_places = decimal_places
        self.settings_manager = settings_manager
        self.restore_callback = restore_callback
        
        self.setup_ui()
    
    def setup_ui(self):
        """UI 설정"""
        timeframe = self.card.get('timeframe', 'N/A')
        nb_value = safe_float(self.card.get('nb_value', 0))
        card_type = self.card.get('card_type', 'normal')
        discard_reason = self.card.get('discard_reason', 'UNKNOWN')
        discarded_at = self.card.get('discarded_at', '')
        expiry_at = self.card.get('expiry_at', '')
        
        # 폐기된 카드 스타일 (회색 톤)
        card_bg = QColor('#2b2b2b')
        text_color = QColor('#888888')
        border_color = '#666666'
        
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
        
        # 폐기 표시 헤더
        header_layout = QHBoxLayout()
        title_label = QLabel("🗑️ 폐기된 카드")
        title_label.setStyleSheet(f"color: {text_color.name()}; font-weight: bold; font-size: 14px;")
        header_layout.addWidget(title_label)
        
        card_id_label = QLabel(self.card.get('card_id', '').split('_')[-1])
        card_id_label.setStyleSheet("color: #666666; font-size: 11px;")
        header_layout.addWidget(card_id_label, alignment=Qt.AlignmentFlag.AlignRight)
        layout.addLayout(header_layout)
        
        # 폐기 정보
        discard_info_frame = QFrame()
        discard_info_frame.setStyleSheet("""
            QFrame {
                background-color: #1a1a1a;
                border: 1px solid #444444;
                border-radius: 3px;
                padding: 8px;
            }
        """)
        discard_info_layout = QVBoxLayout(discard_info_frame)
        discard_info_layout.setSpacing(5)
        
        # 폐기 사유
        reason_text = {
            'RL_DELETE': '강화학습 AI DELETE',
            'MANUAL': '수동 폐기',
            'AUTO_CLEANUP': '자동 정리'
        }.get(discard_reason, discard_reason)
        
        reason_label = QLabel(f"폐기 사유: {reason_text}")
        reason_label.setStyleSheet("color: #888888; font-size: 11px;")
        discard_info_layout.addWidget(reason_label)
        
        # 폐기 시간
        if discarded_at:
            try:
                discarded_time = parse_iso_datetime(discarded_at)
                if discarded_time:
                    time_text = f"폐기 시간: {discarded_time.strftime('%Y-%m-%d %H:%M:%S')}"
                else:
                    time_text = f"폐기 시간: {discarded_at}"
            except:
                time_text = f"폐기 시간: {discarded_at}"
        else:
            time_text = "폐기 시간: 알 수 없음"
        
        time_label = QLabel(time_text)
        time_label.setStyleSheet("color: #888888; font-size: 11px;")
        discard_info_layout.addWidget(time_label)
        
        # 만료 시간
        if expiry_at:
            try:
                expiry_time = parse_iso_datetime(expiry_at)
                if expiry_time:
                    from datetime import datetime
                    remaining = expiry_time - datetime.now()
                    if remaining.total_seconds() > 0:
                        days = remaining.days
                        hours = remaining.seconds // 3600
                        expiry_text = f"보관 만료: {days}일 {hours}시간 후"
                    else:
                        expiry_text = "보관 만료됨"
                else:
                    expiry_text = f"만료 시간: {expiry_at}"
            except:
                expiry_text = f"만료 시간: {expiry_at}"
        else:
            expiry_text = "만료 시간: 알 수 없음"
        
        expiry_label = QLabel(expiry_text)
        expiry_label.setStyleSheet("color: #666666; font-size: 10px;")
        discard_info_layout.addWidget(expiry_label)
        
        layout.addWidget(discard_info_frame)
        
        # 정보 그리드
        info_layout = QGridLayout()
        info_layout.setSpacing(5)
        
        # 타임프레임
        timeframe_label = QLabel("타임프레임")
        timeframe_label.setStyleSheet(f"color: #666666;")
        info_layout.addWidget(timeframe_label, 0, 0)
        timeframe_value = QLabel(timeframe)
        timeframe_value.setStyleSheet(f"color: {text_color.name()}; font-weight: bold;")
        info_layout.addWidget(timeframe_value, 0, 1)
        
        # N/B 값
        nb_label = QLabel("N/B 값")
        nb_label.setStyleSheet(f"color: #666666;")
        info_layout.addWidget(nb_label, 1, 0)
        nb_value_label = QLabel(f"{nb_value:.{self.decimal_places}f}")
        nb_value_label.setStyleSheet(f"color: {text_color.name()}; font-weight: bold;")
        info_layout.addWidget(nb_value_label, 1, 1)
        
        layout.addLayout(info_layout)
        
        # 차트 (있는 경우)
        chart_data = self.card.get('chart_data', {})
        prices = chart_data.get('prices', []) if isinstance(chart_data, dict) else []
        if prices and len(prices) > 0:
            chart_label = QLabel("📈 가격 차트")
            chart_label.setStyleSheet(f"color: {text_color.name()}; font-size: 12px; font-weight: bold; margin-top: 5px;")
            layout.addWidget(chart_label)
            
            chart_widget = ChartWidget(prices)
            chart_widget.setStyleSheet("background-color: #0a0a0a; border: 1px solid #333333; border-radius: 3px;")
            layout.addWidget(chart_widget)
        
        # 복구 버튼
        restore_btn = QPushButton("🔄 복구")
        restore_btn.setStyleSheet("""
            QPushButton {
                background-color: #2b3a2b;
                color: #0ecb81;
                border: 1px solid #0ecb81;
                border-radius: 3px;
                padding: 8px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #3a4a3a;
            }
        """)
        restore_btn.clicked.connect(lambda: self._on_restore_clicked())
        layout.addWidget(restore_btn)
        
        layout.addStretch()
    
    def _on_restore_clicked(self):
        """복구 버튼 클릭"""
        try:
            card_id = self.card.get('card_id', '')
            if card_id and self.restore_callback:
                self.restore_callback(card_id)
        except Exception as e:
            print(f"⚠️ 폐기 카드 복구 오류: {e}")


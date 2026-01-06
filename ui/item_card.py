"""아이템 카드 위젯 모듈"""
from PyQt6.QtWidgets import QFrame, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QPushButton, QSizePolicy
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtGui import QColor

from utils import safe_float, get_btc_price, parse_iso_datetime


class ItemCard(QFrame):
    """아이템 카드 위젯"""
    sell_clicked = pyqtSignal(str)  # item_id 전달
    
    def __init__(self, item, is_sold=False, current_price=None, max_sold_profit_percent=0.0, 
                 settings_manager=None, ml_enabled=False, ml_models=None, 
                 get_ai_message_callback=None, parent=None):
        super().__init__(parent)
        self.item = item
        self.is_sold = is_sold
        self.current_price = current_price or safe_float(get_btc_price())
        self.max_sold_profit_percent = max_sold_profit_percent
        self.settings_manager = settings_manager
        self.ml_enabled = ml_enabled
        self.ml_models = ml_models or {}
        self.get_ai_message_callback = get_ai_message_callback
        
        self.setup_ui()
    
    def setup_ui(self):
        """UI 설정"""
        purchase_amount = safe_float(self.item.get('purchase_amount'))
        purchase_price_total = safe_float(self.item.get('purchase_price'))
        if purchase_amount > 0:
            purchase_unit_price = purchase_price_total / purchase_amount
        else:
            purchase_unit_price = purchase_price_total
        
        # 배경색 설정
        if self.is_sold:
            card_bg = QColor('#2b3139')
            text_color = QColor('#888888')
            profit_loss = 0  # 판매된 아이템은 profit_loss를 사용하지 않음
        else:
            fee_rate = (self.settings_manager.get("fee_rate", 0.1) / 100.0) if self.settings_manager else 0.001
            purchase_price = self.item.get('purchase_price', 0)
            purchase_price_with_fee = purchase_price * (1 + fee_rate / 2)
            current_value = self.current_price * self.item.get('purchase_amount', 0)
            current_value_after_fee = current_value * (1 - fee_rate / 2)
            profit_loss = current_value_after_fee - purchase_price_with_fee
            
            if profit_loss >= 0:
                card_bg = QColor('#1a2e1a')
                text_color = QColor('#ffffff')
            else:
                card_bg = QColor('#2e1a1a')
                text_color = QColor('#ffffff')
        
        # 프레임 스타일 설정
        border_color = '#444444' if self.is_sold else ('#0ecb81' if profit_loss >= 0 else '#f6465d')
        self.setStyleSheet(f"""
            QFrame {{
                background-color: {card_bg.name()};
                border: 2px solid {border_color};
                border-radius: 5px;
                padding: 10px;
            }}
        """)
        
        # 카드 최소/최대 너비 설정 (가로 스크롤 방지)
        self.setMinimumWidth(260)
        self.setMaximumWidth(320)
        self.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Minimum)
        
        # 레이아웃
        layout = QVBoxLayout(self)
        layout.setSpacing(10)
        
        # 헤더
        header_layout = QHBoxLayout()
        title_label = QLabel(f"🪙 {self.item.get('item_name', '비트코인')}")
        title_label.setStyleSheet(f"color: {text_color.name()}; font-weight: bold; font-size: 14px;")
        header_layout.addWidget(title_label)
        
        if not self.is_sold:
            item_id_label = QLabel(self.item.get('item_id', '').split('_')[-1])
            item_id_label.setStyleSheet("color: #888888; font-size: 11px;")
            header_layout.addWidget(item_id_label, alignment=Qt.AlignmentFlag.AlignRight)
        
        layout.addLayout(header_layout)
        
        # 정보 그리드
        info_layout = QGridLayout()
        info_layout.setSpacing(5)
        
        # 수량
        qty_label = QLabel("수량")
        qty_label.setStyleSheet(f"color: #888888;")
        qty_label.setWordWrap(True)
        info_layout.addWidget(qty_label, 0, 0)
        qty_value = QLabel(f"{self.item.get('purchase_amount', 0):.8f} BTC")
        qty_value.setStyleSheet(f"color: {text_color.name()};")
        qty_value.setWordWrap(True)
        info_layout.addWidget(qty_value, 0, 1)
        
        # 매수 시세
        price_label = QLabel("매수 시세\n(1BTC 기준)")
        price_label.setStyleSheet(f"color: #888888;")
        price_label.setWordWrap(True)
        info_layout.addWidget(price_label, 1, 0)
        price_value = QLabel(f"{purchase_unit_price:,.0f} KRW")
        price_value.setStyleSheet(f"color: {text_color.name()};")
        price_value.setWordWrap(True)
        info_layout.addWidget(price_value, 1, 1)
        
        if self.is_sold:
            # 판매 시세
            sell_price_label = QLabel("판매 시세")
            sell_price_label.setStyleSheet(f"color: #888888;")
            info_layout.addWidget(sell_price_label, 2, 0)
            sell_price_value = QLabel(f"{self.item.get('sell_price', 0):,.0f} KRW")
            sell_price_value.setStyleSheet(f"color: {text_color.name()};")
            info_layout.addWidget(sell_price_value, 2, 1)
            
            # 손익 정보
            profit_loss = self.item.get('final_profit_loss', 0)
            profit_percent = self.item.get('final_profit_loss_percent', 0)
            profit_color = '#0ecb81' if profit_loss >= 0 else '#f6465d'
            
            profit_label_text = QLabel("최종 손익")
            profit_label_text.setStyleSheet(f"color: #888888;")
            info_layout.addWidget(profit_label_text, 3, 0)
            profit_label = QLabel(f"{profit_percent:+.2f}%")
            profit_label.setStyleSheet(f"color: {profit_color}; font-weight: bold;")
            info_layout.addWidget(profit_label, 3, 1)
        else:
            # 현재 시세
            current_price_label = QLabel("현재 시세")
            current_price_label.setStyleSheet(f"color: #888888;")
            info_layout.addWidget(current_price_label, 2, 0)
            current_price_value = QLabel(f"{self.current_price:,.0f} KRW")
            current_price_value.setStyleSheet(f"color: {text_color.name()};")
            info_layout.addWidget(current_price_value, 2, 1)
            
            # 현재 가치
            current_value = self.current_price * purchase_amount
            value_label = QLabel("현재 가치")
            value_label.setStyleSheet(f"color: #888888;")
            info_layout.addWidget(value_label, 3, 0)
            value_value = QLabel(f"{current_value:,.0f} KRW")
            value_value.setStyleSheet(f"color: {text_color.name()};")
            info_layout.addWidget(value_value, 3, 1)
            
            # 손익 계산
            fee_rate = (self.settings_manager.get("fee_rate", 0.1) / 100.0) if self.settings_manager else 0.001
            purchase_price = purchase_price_total
            buy_fee = purchase_price * (fee_rate / 2)
            sell_fee = current_value * (fee_rate / 2)
            purchase_price_with_fee = purchase_price + buy_fee
            current_value_after_fee = current_value - sell_fee
            profit_loss = current_value_after_fee - purchase_price_with_fee
            profit_percent = (profit_loss / purchase_price_with_fee * 100) if purchase_price_with_fee > 0 else 0
            
            profit_color = '#0ecb81' if profit_loss >= 0 else '#f6465d'
            profit_text_label = QLabel("현재 손익")
            profit_text_label.setStyleSheet(f"color: #888888;")
            profit_text_label.setWordWrap(True)
            info_layout.addWidget(profit_text_label, 4, 0)
            profit_label = QLabel(f"{profit_percent:+.2f}%")
            profit_label.setStyleSheet(f"color: {profit_color}; font-weight: bold;")
            profit_label.setWordWrap(True)
            info_layout.addWidget(profit_label, 4, 1)
            
            # 최고 수익률 비교
            row_offset = 5
            if self.max_sold_profit_percent != 0.0:
                max_profit_text_label = QLabel("판매 완료\n최고 수익률")
                max_profit_text_label.setStyleSheet(f"color: #888888;")
                max_profit_text_label.setWordWrap(True)
                info_layout.addWidget(max_profit_text_label, 5, 0)
                max_profit_color = '#0ecb81' if self.max_sold_profit_percent >= 0 else '#f6465d'
                max_profit_label = QLabel(f"{self.max_sold_profit_percent:+.2f}%")
                max_profit_label.setStyleSheet(f"color: {max_profit_color};")
                max_profit_label.setWordWrap(True)
                info_layout.addWidget(max_profit_label, 5, 1)
                
                profit_diff = profit_percent - self.max_sold_profit_percent
                diff_text_label = QLabel("최고 대비")
                diff_text_label.setStyleSheet(f"color: #888888;")
                diff_text_label.setWordWrap(True)
                info_layout.addWidget(diff_text_label, 6, 0)
                diff_text = f"{profit_diff:+.2f}%p"
                diff_color = '#0ecb81' if profit_diff >= 0 else '#ffb703' if abs(profit_diff) < 0.5 else '#f6465d'
                diff_label = QLabel(diff_text)
                diff_label.setStyleSheet(f"color: {diff_color}; font-weight: bold;")
                diff_label.setWordWrap(True)
                info_layout.addWidget(diff_label, 6, 1)
                row_offset = 7
            
            # AI 메시지 (ML 예측 기반) - 활성 아이템만
            if self.ml_enabled and not self.is_sold and self.get_ai_message_callback:
                ai_message = self.get_ai_message_callback(self.item, self.current_price, profit_percent)
                if ai_message:
                    ai_title_label = QLabel("🤖 AI 분석")
                    ai_title_label.setStyleSheet("color: #00d1ff; font-weight: bold; font-size: 13px;")
                    info_layout.addWidget(ai_title_label, row_offset, 0)
                    
                    ai_message_label = QLabel(ai_message)
                    ai_message_label.setStyleSheet("color: #00d1ff; font-size: 12px; line-height: 1.4;")
                    ai_message_label.setWordWrap(True)  # 줄바꿈 활성화
                    info_layout.addWidget(ai_message_label, row_offset, 1)
        
        layout.addLayout(info_layout)
        
        # 시간 정보
        purchase_time = parse_iso_datetime(self.item.get('purchase_time'))
        if purchase_time:
            time_text = f"구매: {purchase_time.strftime('%Y-%m-%d %H:%M:%S')}"
        else:
            time_text = "구매 시간 정보 없음"
        
        if self.is_sold:
            sell_time = parse_iso_datetime(self.item.get('sell_time'))
            if sell_time:
                time_text += f"\n판매: {sell_time.strftime('%Y-%m-%d %H:%M:%S')}"
        
        time_label = QLabel(time_text)
        time_label.setStyleSheet("color: #666666; font-size: 11px;")
        time_label.setWordWrap(True)
        layout.addWidget(time_label)
        
        # 매도 버튼 (활성 아이템만)
        if not self.is_sold:
            sell_btn = QPushButton("매도")
            sell_btn.setStyleSheet("""
                QPushButton {
                    background-color: #f6465d;
                    color: white;
                    font-weight: bold;
                    padding: 8px;
                    border-radius: 5px;
                }
                QPushButton:hover {
                    background-color: #d93a4f;
                }
            """)
            sell_btn.clicked.connect(lambda: self.sell_clicked.emit(self.item.get('item_id')))
            layout.addWidget(sell_btn)
        else:
            sold_label = QLabel("판매 완료")
            sold_label.setStyleSheet("color: #888888; font-size: 12px;")
            layout.addWidget(sold_label)
        
        layout.addStretch()


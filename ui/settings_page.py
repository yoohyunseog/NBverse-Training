"""설정 페이지 위젯 모듈"""
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QPushButton, QLineEdit, QFrame


class SettingsPage(QWidget):
    """설정 페이지 (화면 전환 방식)"""
    def __init__(self, settings_manager, parent=None):
        super().__init__(parent)
        self.settings_manager = settings_manager
        self.parent_window = parent
        self.setup_ui()
    
    def setup_ui(self):
        """UI 설정"""
        layout = QVBoxLayout(self)
        layout.setSpacing(15)
        layout.setContentsMargins(20, 20, 20, 20)
        self.setStyleSheet("background-color: #0b1220; color: #ffffff;")
        
        # 제목
        title_label = QLabel("설정")
        title_label.setStyleSheet("color: #00d1ff; font-size: 24px; font-weight: bold;")
        layout.addWidget(title_label)
        
        # 설정 그리드
        settings_frame = QFrame()
        settings_frame.setStyleSheet("background-color: #1e2329; padding: 20px; border-radius: 5px;")
        settings_layout = QVBoxLayout(settings_frame)
        settings_layout.setSpacing(15)
        
        settings_grid = QGridLayout()
        settings_grid.setSpacing(15)
        
        # N/B 값 소수점 자리수
        nb_decimal_label = QLabel("N/B 값 소수점 자리수:")
        nb_decimal_label.setStyleSheet("color: #ffffff; font-size: 14px;")
        settings_grid.addWidget(nb_decimal_label, 0, 0)
        self.nb_decimal_edit = QLineEdit(str(self.settings_manager.get("nb_decimal_places", 10)))
        self.nb_decimal_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 8px; font-size: 14px; border-radius: 3px;")
        settings_grid.addWidget(self.nb_decimal_edit, 0, 1)
        
        # 업데이트 주기
        cycle_label = QLabel("업데이트 주기 (초):")
        cycle_label.setStyleSheet("color: #ffffff; font-size: 14px;")
        settings_grid.addWidget(cycle_label, 1, 0)
        self.cycle_edit = QLineEdit(str(self.settings_manager.get("update_cycle_seconds", 25)))
        self.cycle_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 8px; font-size: 14px; border-radius: 3px;")
        settings_grid.addWidget(self.cycle_edit, 1, 1)
        
        # 최소 매수 금액
        min_amount_label = QLabel("최소 매수 금액 (KRW):")
        min_amount_label.setStyleSheet("color: #ffffff; font-size: 14px;")
        settings_grid.addWidget(min_amount_label, 2, 0)
        self.min_amount_edit = QLineEdit(str(self.settings_manager.get("min_buy_amount", 5000)))
        self.min_amount_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 8px; font-size: 14px; border-radius: 3px;")
        settings_grid.addWidget(self.min_amount_edit, 2, 1)
        
        # 수수료
        fee_label = QLabel("수수료 (%):")
        fee_label.setStyleSheet("color: #ffffff; font-size: 14px;")
        settings_grid.addWidget(fee_label, 3, 0)
        self.fee_edit = QLineEdit(str(self.settings_manager.get("fee_rate", 0.1)))
        self.fee_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 8px; font-size: 14px; border-radius: 3px;")
        settings_grid.addWidget(self.fee_edit, 3, 1)
        
        # 생산 카드 제한
        card_limit_label = QLabel("생산 카드 제한 (0=제한없음):")
        card_limit_label.setStyleSheet("color: #ffffff; font-size: 14px;")
        settings_grid.addWidget(card_limit_label, 4, 0)
        self.card_limit_edit = QLineEdit(str(self.settings_manager.get("production_card_limit", 0)))
        self.card_limit_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 8px; font-size: 14px; border-radius: 3px;")
        self.card_limit_edit.setToolTip("표시할 생산 카드의 최대 개수입니다. 0으로 설정하면 제한이 없습니다.")
        settings_grid.addWidget(self.card_limit_edit, 4, 1)
        
        # 카드 생산 라인 순차 회기
        chart_animation_label = QLabel("카드 생산 라인 순차 회기 (밀리초):")
        chart_animation_label.setStyleSheet("color: #ffffff; font-size: 14px;")
        settings_grid.addWidget(chart_animation_label, 5, 0)
        self.chart_animation_edit = QLineEdit(str(self.settings_manager.get("chart_animation_interval_ms", 1000)))
        self.chart_animation_edit.setStyleSheet("background-color: #2b3139; color: #ffffff; padding: 8px; font-size: 14px; border-radius: 3px;")
        self.chart_animation_edit.setToolTip("생산 카드들을 순차적으로 업데이트하는 회기입니다. (기본값: 1000ms = 1초)")
        settings_grid.addWidget(self.chart_animation_edit, 5, 1)
        
        settings_layout.addLayout(settings_grid)
        layout.addWidget(settings_frame)
        
        layout.addStretch()
        
        # 버튼
        button_layout = QHBoxLayout()
        button_layout.addStretch()
        
        cancel_btn = QPushButton("취소")
        cancel_btn.setStyleSheet("""
            QPushButton {
                background-color: #2b3139;
                color: #ffffff;
                padding: 10px 30px;
                border-radius: 5px;
                font-size: 14px;
            }
            QPushButton:hover {
                background-color: #3a4149;
            }
        """)
        cancel_btn.clicked.connect(self.cancel_settings)
        button_layout.addWidget(cancel_btn)
        
        save_btn = QPushButton("저장")
        save_btn.setStyleSheet("""
            QPushButton {
                background-color: #0ecb81;
                color: #ffffff;
                padding: 10px 30px;
                border-radius: 5px;
                font-size: 14px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #0db870;
            }
        """)
        save_btn.clicked.connect(self.save_settings)
        button_layout.addWidget(save_btn)
        
        layout.addLayout(button_layout)
    
    def get_settings(self):
        """설정 값 가져오기"""
        return {
            "nb_decimal_places": int(self.nb_decimal_edit.text()) if self.nb_decimal_edit.text().isdigit() else 10,
            "update_cycle_seconds": int(self.cycle_edit.text()) if self.cycle_edit.text().isdigit() else 25,
            "min_buy_amount": int(self.min_amount_edit.text()) if self.min_amount_edit.text().isdigit() else 5000,
            "fee_rate": float(self.fee_edit.text()) if self.fee_edit.text().replace('.', '').isdigit() else 0.1,
            "production_card_limit": int(self.card_limit_edit.text()) if self.card_limit_edit.text().isdigit() else 0,
            "chart_animation_interval_ms": int(self.chart_animation_edit.text()) if self.chart_animation_edit.text().isdigit() else 1000
        }
    
    def save_settings(self):
        """설정 저장"""
        if self.parent_window:
            self.parent_window.apply_settings(self.get_settings())
    
    def cancel_settings(self):
        """설정 취소 (메인 화면으로 돌아가기)"""
        if self.parent_window:
            self.parent_window.show_main_page()


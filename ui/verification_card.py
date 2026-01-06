"""검증 카드 위젯 모듈"""
from PyQt6.QtWidgets import QFrame, QVBoxLayout, QHBoxLayout, QGridLayout, QLabel, QSizePolicy, QWidget
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QColor, QPainter, QPen

from utils import safe_float, parse_iso_datetime
from ui.production_card import ChartWidget


class VerificationCard(QFrame):
    """강화학습 AI 검증 카드 위젯"""
    
    def __init__(self, card, decimal_places=10, settings_manager=None, parent=None):
        super().__init__(parent)
        self.card = card
        self.decimal_places = decimal_places
        self.settings_manager = settings_manager
        
        self.setup_ui()
    
    def setup_ui(self):
        """UI 설정"""
        timeframe = self.card.get('timeframe', 'N/A')
        nb_value = safe_float(self.card.get('nb_value', 0))
        card_type = self.card.get('card_type', 'normal')
        status = self.card.get('status', 'gray')
        
        # 배경색 설정 (검증 완료된 카드는 보라색 계열)
        card_bg = QColor('#2a1a3a')
        text_color = QColor('#ffffff')
        border_color = '#9d4edd'
        
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
        
        # 헤더
        header_layout = QHBoxLayout()
        title_label = QLabel("✅ 검증 완료")
        title_label.setStyleSheet(f"color: {text_color.name()}; font-weight: bold; font-size: 14px;")
        header_layout.addWidget(title_label)
        
        card_id_label = QLabel(self.card.get('card_id', '').split('_')[-1])
        card_id_label.setStyleSheet("color: #b0b0b0; font-size: 12px; font-weight: bold;")
        header_layout.addWidget(card_id_label, alignment=Qt.AlignmentFlag.AlignRight)
        
        layout.addLayout(header_layout)
        
        # 검증 결과 (SOLD 히스토리에서 가져오기)
        sold_history = self._get_latest_sold_history()
        if sold_history:
            result_frame = QFrame()
            result_frame.setStyleSheet("""
                QFrame {
                    background-color: #1a0a2a;
                    border: 2px solid #9d4edd;
                    border-radius: 5px;
                    padding: 10px;
                }
            """)
            result_layout = QVBoxLayout(result_frame)
            result_layout.setSpacing(5)
            
            # 판정 결과
            exit_price = sold_history.get('exit_price', 0)
            entry_price = sold_history.get('entry_price', 0)
            qty = sold_history.get('qty', 0)
            is_simulation = sold_history.get('is_simulation', False)
            
            # 손익률과 손익 금액 계산 (히스토리에 값이 없거나 0이면 직접 계산)
            pnl_percent = sold_history.get('pnl_percent', 0)
            pnl_amount = sold_history.get('pnl_amount', 0)
            
            # pnl_percent나 pnl_amount가 0이거나 없으면 entry_price와 exit_price로 계산
            if (pnl_percent == 0 and pnl_amount == 0) or (not pnl_percent and not pnl_amount):
                if entry_price > 0 and exit_price > 0:
                    # 손익률 계산
                    pnl_percent = ((exit_price - entry_price) / entry_price) * 100
                    # 손익 금액 계산
                    if qty > 0:
                        pnl_amount = (exit_price - entry_price) * qty
                    else:
                        # qty가 없으면 최소 구매 금액으로 계산
                        if self.settings_manager:
                            min_buy_amount = self.settings_manager.get("min_buy_amount", 5000)
                            estimated_qty = min_buy_amount / entry_price if entry_price > 0 else 0
                            pnl_amount = (exit_price - entry_price) * estimated_qty
                        else:
                            pnl_amount = 0
                else:
                    # entry_price나 exit_price가 없으면 히스토리에서 가져오기
                    if not entry_price or entry_price == 0:
                        # BUY 히스토리에서 가져오기
                        for hist in reversed(self.card.get('history_list', [])):
                            if hist.get('type') in ['NEW', 'BUY']:
                                entry_price = hist.get('entry_price', 0)
                                if not qty or qty == 0:
                                    qty = hist.get('qty', 0)
                                break
                    
                    # 다시 계산
                    if entry_price > 0 and exit_price > 0:
                        pnl_percent = ((exit_price - entry_price) / entry_price) * 100
                        if qty > 0:
                            pnl_amount = (exit_price - entry_price) * qty
                        else:
                            if self.settings_manager:
                                min_buy_amount = self.settings_manager.get("min_buy_amount", 5000)
                                estimated_qty = min_buy_amount / entry_price if entry_price > 0 else 0
                                pnl_amount = (exit_price - entry_price) * estimated_qty
                            else:
                                pnl_amount = 0
            
            # 실적 타입 표시
            trade_type = "🧪 모의 거래" if is_simulation else "💰 실제 거래"
            trade_type_label = QLabel(trade_type)
            trade_type_label.setStyleSheet("""
                color: #9d4edd;
                font-weight: bold;
                font-size: 12px;
                padding: 3px;
            """)
            result_layout.addWidget(trade_type_label)
            
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
                font-size: 16px;
            """)
            result_layout.addWidget(result_label)
            
            # 손실률 기반 점수 계산 및 표시
            loss_rate_score = self._calculate_loss_rate_score(pnl_percent)
            
            # 카드에 저장된 실시간 점수 히스토리가 있으면 사용, 없으면 손익률 기반 점수 사용
            card_score = self.card.get('score', loss_rate_score)
            realtime_scores = self.card.get('realtime_scores', [])
            
            # 실시간 점수 히스토리가 있으면 마지막 점수 사용
            if realtime_scores and len(realtime_scores) > 0:
                card_score = realtime_scores[-1]
            
            score_label = QLabel(f"📊 검증 점수: {card_score:.1f}")
            score_color = self._get_score_color(card_score)
            score_label.setStyleSheet(f"""
                color: {score_color};
                font-weight: bold;
                font-size: 14px;
                padding: 5px;
                background-color: #1a0a2a;
                border-radius: 3px;
            """)
            result_layout.addWidget(score_label)
            
            # 실시간 점수 차트 표시 (점수 히스토리가 있는 경우)
            if realtime_scores and len(realtime_scores) > 1:
                score_chart_label = QLabel("📈 실시간 점수 차트")
                score_chart_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold; margin-top: 5px;")
                result_layout.addWidget(score_chart_label)
                
                from ui.production_card import ChartWidget
                score_chart_widget = ChartWidget(realtime_scores)
                score_chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #9d4edd; border-radius: 3px;")
                score_chart_widget.setMinimumHeight(100)
                score_chart_widget.setMaximumHeight(120)
                result_layout.addWidget(score_chart_widget)
            
            # 상세 정보
            detail_layout = QGridLayout()
            detail_layout.setSpacing(5)
            detail_layout.setColumnStretch(0, 1)  # 라벨 컬럼
            detail_layout.setColumnStretch(1, 2)  # 값 컬럼
            
            # 진입 가격 (위에서 이미 계산됨, 없으면 BUY 히스토리에서 가져오기)
            if not entry_price or entry_price == 0:
                # BUY 히스토리에서 가져오기
                for hist in reversed(self.card.get('history_list', [])):
                    if hist.get('type') in ['NEW', 'BUY']:
                        entry_price = hist.get('entry_price', 0)
                        break
            
            entry_name_label = QLabel("진입 가격:")
            entry_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            entry_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            detail_layout.addWidget(entry_name_label, 0, 0)
            entry_label = QLabel(f"{entry_price:,.0f} KRW")
            entry_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold;")
            entry_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            entry_label.setWordWrap(True)
            detail_layout.addWidget(entry_label, 0, 1)
            
            # 청산 가격
            exit_name_label = QLabel("청산 가격:")
            exit_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            exit_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            detail_layout.addWidget(exit_name_label, 1, 0)
            exit_label = QLabel(f"{exit_price:,.0f} KRW")
            exit_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold;")
            exit_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            exit_label.setWordWrap(True)
            detail_layout.addWidget(exit_label, 1, 1)
            
            # 수량 (위에서 이미 가져옴, 없으면 BUY 히스토리에서 가져오기)
            if not qty or qty == 0:
                for hist in reversed(self.card.get('history_list', [])):
                    if hist.get('type') in ['NEW', 'BUY']:
                        qty = hist.get('qty', 0)
                        break
            qty_name_label = QLabel("수량:")
            qty_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            qty_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            detail_layout.addWidget(qty_name_label, 2, 0)
            qty_label = QLabel(f"{qty:.8f} BTC")
            qty_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold;")
            qty_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            qty_label.setWordWrap(True)
            detail_layout.addWidget(qty_label, 2, 1)
            
            # 손익률 (손실률)
            pnl_name_label = QLabel("손익률:")
            pnl_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            pnl_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            detail_layout.addWidget(pnl_name_label, 3, 0)
            
            # 손익률에 따른 색상 설정
            if pnl_percent > 0:
                pnl_color = '#0ecb81'  # 초록색 (수익)
            elif pnl_percent < 0:
                pnl_color = '#f6465d'  # 빨간색 (손실)
            else:
                pnl_color = '#888888'  # 회색 (무승부)
            
            pnl_label = QLabel(f"{pnl_percent:+.2f}%")
            pnl_label.setStyleSheet(f"color: {pnl_color}; font-size: 12px; font-weight: bold;")
            pnl_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            pnl_label.setWordWrap(True)
            detail_layout.addWidget(pnl_label, 3, 1)
            
            # 손익 금액
            pnl_amount_name_label = QLabel("손익 금액:")
            pnl_amount_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            pnl_amount_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            detail_layout.addWidget(pnl_amount_name_label, 4, 0)
            
            pnl_amount_label = QLabel(f"{pnl_amount:+,.0f} KRW")
            pnl_amount_label.setStyleSheet(f"color: {pnl_color}; font-size: 12px; font-weight: bold;")
            pnl_amount_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            pnl_amount_label.setWordWrap(True)
            detail_layout.addWidget(pnl_amount_label, 4, 1)
            
            # 수수료
            fee_amount = sold_history.get('fee_amount', 0)
            fee_name_label = QLabel("수수료:")
            fee_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            fee_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            detail_layout.addWidget(fee_name_label, 5, 0)
            fee_label = QLabel(f"{fee_amount:,.0f} KRW")
            fee_label.setStyleSheet("color: #b0b0b0; font-size: 12px;")
            fee_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            fee_label.setWordWrap(True)
            detail_layout.addWidget(fee_label, 5, 1)
            
            result_layout.addLayout(detail_layout)
            
            # 메모
            memo = sold_history.get('memo', '')
            if memo:
                memo_label = QLabel(f"📝 {memo}")
                memo_label.setStyleSheet("color: #b0b0b0; font-size: 11px;")
                memo_label.setWordWrap(True)
                result_layout.addWidget(memo_label)
            
            # 판정 시간
            timestamp = sold_history.get('timestamp', '')
            if timestamp:
                try:
                    sold_time = parse_iso_datetime(timestamp)
                    if sold_time:
                        time_text = f"판정 시간: {sold_time.strftime('%Y-%m-%d %H:%M:%S')}"
                        time_label = QLabel(time_text)
                        time_label.setStyleSheet("color: #9d4edd; font-size: 11px; font-weight: bold;")
                        result_layout.addWidget(time_label)
                except:
                    pass
            
            layout.addWidget(result_frame)
            
            # 매수/매도 시점 가격 차트 추가
            self._add_trade_charts(layout, sold_history, entry_price, exit_price, text_color)
        
        # 카드 정보
        info_layout = QGridLayout()
        info_layout.setSpacing(5)
        info_layout.setColumnStretch(0, 1)  # 라벨 컬럼
        info_layout.setColumnStretch(1, 2)  # 값 컬럼
        
        # 타임프레임
        timeframe_label = QLabel("타임프레임:")
        timeframe_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
        timeframe_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        info_layout.addWidget(timeframe_label, 0, 0)
        timeframe_value = QLabel(timeframe)
        timeframe_value.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold;")
        timeframe_value.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        timeframe_value.setWordWrap(True)
        info_layout.addWidget(timeframe_value, 0, 1)
        
        # N/B 값
        nb_label = QLabel("N/B:")
        nb_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
        nb_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        info_layout.addWidget(nb_label, 1, 0)
        nb_value_label = QLabel(f"{nb_value:.{self.decimal_places}f}")
        nb_value_label.setStyleSheet("color: #ffffff; font-size: 12px; font-weight: bold;")
        nb_value_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        nb_value_label.setWordWrap(True)
        info_layout.addWidget(nb_value_label, 1, 1)
        
        # 생산 시간
        production_time = parse_iso_datetime(self.card.get('production_time'))
        if production_time:
            time_text = production_time.strftime('%Y-%m-%d %H:%M:%S')
        else:
            time_text = "정보 없음"
        
        time_label = QLabel("생산 시간:")
        time_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
        time_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
        info_layout.addWidget(time_label, 2, 0)
        time_value = QLabel(time_text)
        time_value.setStyleSheet("color: #ffffff; font-size: 11px;")
        time_value.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
        time_value.setWordWrap(True)
        info_layout.addWidget(time_value, 2, 1)
        
        # AI 판정 횟수 통계
        action_stats = self._calculate_action_stats()
        if action_stats:
            stats_frame = QFrame()
            stats_frame.setStyleSheet("""
                QFrame {
                    background-color: #1a0a2a;
                    border: 1px solid #9d4edd;
                    border-radius: 5px;
                    padding: 8px;
                }
            """)
            stats_layout = QVBoxLayout(stats_frame)
            stats_layout.setSpacing(5)
            
            stats_title = QLabel("📊 AI 판정 통계")
            stats_title.setStyleSheet("color: #9d4edd; font-weight: bold; font-size: 12px;")
            stats_layout.addWidget(stats_title)
            
            stats_grid = QGridLayout()
            stats_grid.setSpacing(5)
            stats_grid.setColumnStretch(0, 1)  # 라벨 컬럼
            stats_grid.setColumnStretch(1, 1)  # 값 컬럼
            stats_grid.setColumnStretch(2, 1)  # 라벨 컬럼
            stats_grid.setColumnStretch(3, 1)  # 값 컬럼
            
            # BUY 횟수
            buy_count = action_stats.get('buy_count', 0)
            buy_name_label = QLabel("BUY:")
            buy_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            buy_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            stats_grid.addWidget(buy_name_label, 0, 0)
            buy_label = QLabel(str(buy_count))
            buy_label.setStyleSheet("color: #0ecb81; font-weight: bold; font-size: 13px;")
            buy_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            stats_grid.addWidget(buy_label, 0, 1)
            
            # SELL 횟수
            sell_count = action_stats.get('sell_count', 0)
            sell_name_label = QLabel("SELL:")
            sell_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            sell_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            stats_grid.addWidget(sell_name_label, 0, 2)
            sell_label = QLabel(str(sell_count))
            sell_label.setStyleSheet("color: #f6465d; font-weight: bold; font-size: 13px;")
            sell_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            stats_grid.addWidget(sell_label, 0, 3)
            
            # 폐기 횟수
            discard_count = action_stats.get('discard_count', 0)
            has_discard_decision = action_stats.get('has_discard_decision', False)
            has_sell_decision = action_stats.get('has_sell_decision', False)
            
            # 폐기 사유 표시 (SELL 판정인지, 폐기 판정인지 구분)
            discard_reason = ""
            if has_discard_decision:
                # 폐기 판정으로 폐기된 경우
                discard_reason = " (판정)"
            elif has_sell_decision and sell_count > 0:
                # SELL 판정으로 매도된 경우
                discard_reason = " (SELL)"
            
            discard_name_label = QLabel("폐기:")
            discard_name_label.setStyleSheet("color: #cccccc; font-size: 12px; font-weight: bold;")
            discard_name_label.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Preferred)
            stats_grid.addWidget(discard_name_label, 1, 0)
            discard_label = QLabel(f"{discard_count}{discard_reason}")
            discard_label.setStyleSheet("color: #b0b0b0; font-weight: bold; font-size: 13px;")
            discard_label.setSizePolicy(QSizePolicy.Policy.MinimumExpanding, QSizePolicy.Policy.Preferred)
            discard_label.setToolTip("폐기 판정으로 폐기된 경우 '판정' 표시, SELL 판정으로 매도된 경우 'SELL' 표시")
            stats_grid.addWidget(discard_label, 1, 1)
            
            stats_layout.addLayout(stats_grid)
            layout.addWidget(stats_frame)
        
        layout.addLayout(info_layout)
    
    def _calculate_action_stats(self):
        """AI 판정 횟수 통계 계산"""
        try:
            history_list = self.card.get('history_list', [])
            
            buy_count = 0
            sell_count = 0
            discard_count = 0
            
            # RL AI 판정 추적 (메모에서 판정 정보 추출)
            rl_actions = []  # RL AI가 내린 판정들
            has_discard_decision = False  # 폐기 판정 여부
            has_sell_decision = False  # SELL 판정 여부
            
            for hist in history_list:
                hist_type = hist.get('type', '')
                memo = hist.get('memo', '')
                
                # BUY 횟수 (NEW, BUY 히스토리)
                if hist_type in ['NEW', 'BUY']:
                    buy_count += 1
                
                # SELL 판정과 폐기 판정 구분
                # 폐기 판정이 있으면 폐기로 카운트 (SELL 판정이 아닌 경우만 SELL로 카운트)
                if '자동 폐기' in memo and ('FREEZE 판정' in memo or 'DELETE 판정' in memo):
                    has_discard_decision = True
                elif '자동 매도' in memo and 'SELL 판정' in memo:
                    has_sell_decision = True
                
                # SOLD 히스토리 처리
                if hist_type == 'SOLD':
                    # 폐기 판정으로 인한 매도인지, SELL 판정으로 인한 매도인지 구분
                    if '자동 폐기' in memo and ('FREEZE 판정' in memo or 'DELETE 판정' in memo):
                        # 폐기 판정으로 인한 매도 (폐기로 카운트)
                        discard_count = 1
                    elif '자동 매도' in memo and 'SELL 판정' in memo:
                        # SELL 판정으로 인한 매도
                        sell_count += 1
                    else:
                        # 판정 정보가 없으면 기본적으로 SELL로 카운트
                        sell_count += 1
                
                # RL AI 판정 추출 (메모에서)
                # "자동 폐기 (FREEZE 판정)", "자동 폐기 (DELETE 판정)" 등
                if 'FREEZE 판정' in memo:
                    rl_actions.append('FREEZE')
                elif 'DELETE 판정' in memo:
                    rl_actions.append('DELETE')
                elif 'BUY 판정' in memo:
                    rl_actions.append('BUY')
                elif 'SELL 판정' in memo and '자동 폐기' not in memo:
                    rl_actions.append('SELL')
            
            # 폐기 판정이 있지만 SOLD 히스토리가 없는 경우 (매도 전 폐기)
            if has_discard_decision and discard_count == 0:
                # 히스토리에서 폐기 메모 찾기
                for hist in history_list:
                    memo = hist.get('memo', '')
                    if '자동 폐기' in memo and ('FREEZE 판정' in memo or 'DELETE 판정' in memo):
                        discard_count = 1
                        break
            
            return {
                'buy_count': buy_count,
                'sell_count': sell_count,
                'discard_count': discard_count,
                'has_discard_decision': has_discard_decision,
                'has_sell_decision': has_sell_decision
            }
        except Exception as e:
            print(f"⚠️ 판정 통계 계산 오류: {e}")
            import traceback
            traceback.print_exc()
            return None
    
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
    
    def _add_trade_charts(self, layout, sold_history, entry_price, exit_price, text_color):
        """매수/매도 시점 가격 차트 추가"""
        try:
            # 매수 시점 가격 차트 (생산 시점 차트 데이터 사용)
            chart_data = self.card.get('chart_data', {})
            buy_prices = chart_data.get('prices', []) if isinstance(chart_data, dict) else []
            
            if buy_prices and len(buy_prices) > 0:
                buy_chart_label = QLabel("📈 매수 시점 가격 차트")
                buy_chart_label.setStyleSheet(f"color: {text_color.name()}; font-size: 12px; font-weight: bold; margin-top: 5px;")
                layout.addWidget(buy_chart_label)
                
                buy_chart_widget = ChartWidget(buy_prices)
                buy_chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #0ecb81; border-radius: 3px;")
                layout.addWidget(buy_chart_widget)
            
            # 매도 시점 가격 차트 (매도 시점 주변 가격 데이터 구성)
            if exit_price > 0:
                # 매도 시점 가격을 중심으로 차트 구성 (매수 시점 차트의 마지막 부분 + 매도 시점)
                sell_prices = []
                if buy_prices:
                    # 매수 시점 차트의 마지막 10개 + 매도 시점 가격
                    sell_prices = buy_prices[-10:] if len(buy_prices) >= 10 else buy_prices
                sell_prices.append(exit_price)
                
                sell_chart_label = QLabel("📉 매도 시점 가격 차트")
                sell_chart_label.setStyleSheet(f"color: {text_color.name()}; font-size: 12px; font-weight: bold; margin-top: 5px;")
                layout.addWidget(sell_chart_label)
                
                sell_chart_widget = ChartWidget(sell_prices)
                sell_chart_widget.setStyleSheet("background-color: #0a1a1a; border: 1px solid #f6465d; border-radius: 3px;")
                layout.addWidget(sell_chart_widget)
        except Exception as e:
            print(f"⚠️ 거래 차트 추가 오류: {e}")
            import traceback
            traceback.print_exc()


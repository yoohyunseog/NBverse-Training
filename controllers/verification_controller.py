"""검증 카드 관련 컨트롤러"""
from PyQt6.QtCore import QObject, pyqtSignal
from typing import List, Dict


class VerificationController(QObject):
    """검증 카드 관리 컨트롤러"""
    
    # 시그널
    verification_cards_loaded = pyqtSignal(list)
    verification_stats_ready = pyqtSignal(dict)
    verification_error = pyqtSignal(str)
    
    def __init__(self, parent, production_card_manager, discarded_card_manager, settings_manager):
        super().__init__(parent)
        self.parent = parent
        self.production_card_manager = production_card_manager
        self.discarded_card_manager = discarded_card_manager
        self.settings_manager = settings_manager
        
        # 워커 변수
        self._verification_worker = None
        self._verification_stats_worker = None
    
    def refresh_verification_cards(self):
        """검증 카드 새로고침"""
        try:
            if not hasattr(self.parent, 'rl_verification_masonry'):
                return
            
            if self._verification_worker and self._verification_worker.isRunning():
                return
            
            # 화면 초기화
            self.parent.rl_verification_masonry.clear()
            
            from workers.verification_worker import VerificationCardLoadWorker
            self._verification_worker = VerificationCardLoadWorker(
                self.production_card_manager,
                self.discarded_card_manager
            )
            self._verification_worker.cards_ready.connect(self._on_verification_cards_loaded)
            self._verification_worker.error_occurred.connect(self._on_verification_cards_load_error)
            self._verification_worker.start()
        except Exception as e:
            print(f"⚠️ 검증 카드 새로고침 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_verification_cards_loaded(self, verification_cards):
        """검증 카드 로드 완료"""
        try:
            # 화면 초기화 (중복 방지)
            if hasattr(self.parent, 'rl_verification_masonry'):
                self.parent.rl_verification_masonry.clear()
            
            if not verification_cards or len(verification_cards) == 0:
                from PyQt6.QtWidgets import QLabel
                from PyQt6.QtCore import Qt
                no_cards_label = QLabel("검증 완료된 카드가 없습니다.\nSELL 판정 후 매도 완료된 카드가 여기에 표시됩니다.")
                no_cards_label.setStyleSheet("color: #888888; font-size: 14px; padding: 20px;")
                no_cards_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
                self.parent.rl_verification_masonry.add_widget(no_cards_label)
                self._update_verification_stats([])
                return
            
            # 통계 업데이트 (백그라운드) - 전체 카드로 계산
            self._update_verification_stats_async(verification_cards)
            
            # 최신 4~5개만 표시 (렉 방지)
            MAX_DISPLAY_VERIFICATION_CARDS = 5
            display_cards = verification_cards[:MAX_DISPLAY_VERIFICATION_CARDS]
            
            print(f"📊 검증 카드: 전체 {len(verification_cards)}개 중 최신 {len(display_cards)}개만 표시")
            
            # 검증 카드들을 UI에 표시
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            
            for card in display_cards:
                try:
                    from ui.verification_card import VerificationCard
                    verification_card_widget = VerificationCard(
                        card,
                        decimal_places=decimal_places,
                        settings_manager=self.settings_manager
                    )
                    self.parent.rl_verification_masonry.add_widget(verification_card_widget)
                except Exception as e:
                    print(f"⚠️ 검증 카드 위젯 생성 오류: {e}")
                    import traceback
                    traceback.print_exc()
            
            print(f"✅ {len(verification_cards)}개 검증 카드 로드 완료")
            self.verification_cards_loaded.emit(verification_cards)
        except Exception as e:
            print(f"⚠️ 검증 카드 로드 처리 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _on_verification_cards_load_error(self, error_msg):
        """검증 카드 로드 오류"""
        print(f"검증 카드 로드 오류: {error_msg}")
        if hasattr(self.parent, 'rl_verification_masonry'):
            self.parent.rl_verification_masonry.clear()
            from PyQt6.QtWidgets import QLabel
            from PyQt6.QtCore import Qt
            error_label = QLabel(f"검증 카드 로드 오류: {error_msg}")
            error_label.setStyleSheet("color: #f6465d; font-size: 14px;")
            error_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            self.parent.rl_verification_masonry.add_widget(error_label)
        self.verification_error.emit(error_msg)
    
    def _update_verification_stats_async(self, verification_cards):
        """검증 통계 업데이트 (비동기)"""
        try:
            if self._verification_stats_worker and self._verification_stats_worker.isRunning():
                return
            
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
        """검증 통계 준비 완료"""
        self._update_verification_stats_ui(data)
        self.verification_stats_ready.emit(data)
    
    def _on_verification_stats_error(self, error_msg):
        """검증 통계 오류"""
        print(f"⚠️ 검증 통계 오류: {error_msg}")
        self.verification_error.emit(error_msg)
    
    def _update_verification_stats_ui(self, data):
        """검증 통계 UI 업데이트"""
        try:
            if not hasattr(self.parent, 'rl_verification_pnl_chart'):
                return
            
            # PnL 차트 업데이트
            pnl_data = data.get('pnl_data', [])
            if pnl_data:
                self.parent.rl_verification_pnl_chart.setData(pnl_data)
            
            # 승률 차트 업데이트
            winrate_data = data.get('winrate_data', [])
            if winrate_data:
                self.parent.rl_verification_winrate_chart.setData(winrate_data)
            
            # 통계 레이블 업데이트
            if hasattr(self.parent, 'rl_verification_buy_count_label'):
                self.parent.rl_verification_buy_count_label.setText(str(data.get('buy_count', 0)))
            if hasattr(self.parent, 'rl_verification_sell_count_label'):
                self.parent.rl_verification_sell_count_label.setText(str(data.get('sell_count', 0)))
            if hasattr(self.parent, 'rl_verification_discard_count_label'):
                self.parent.rl_verification_discard_count_label.setText(str(data.get('discard_count', 0)))
        except Exception as e:
            print(f"⚠️ 검증 통계 UI 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()


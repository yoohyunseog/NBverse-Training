"""AI 관련 컨트롤러"""
from PyQt6.QtCore import QObject, pyqtSignal
from typing import Dict, Optional


class AIController(QObject):
    """AI 관리 컨트롤러"""
    
    # 시그널
    ai_progress_updated = pyqtSignal(int, str)
    
    def __init__(self, parent, ml_model_manager, rl_system, settings_manager):
        super().__init__(parent)
        self.parent = parent
        self.ml_model_manager = ml_model_manager
        self.rl_system = rl_system
        self.settings_manager = settings_manager
        
        # 상태 변수
        self.ai_progress_value = 0
        self.ai_progress_message = "전체 AI 시스템 업데이트 중.."
        self.ai_status_animating = False
        self._updating_progress = False
    
    def get_ai_message_for_item(self, item, current_price, current_profit_percent):
        """아이템에 대한 AI 메시지 가져오기"""
        try:
            if not self.ml_model_manager:
                return None
            
            prediction = self.ml_model_manager.predict(item, current_price)
            if not prediction:
                return None
            
            signal = prediction.get('signal', 'HOLD')
            confidence = prediction.get('confidence', 0.0)
            
            if signal == 'BUY':
                return f"매수 신호 (신뢰도: {confidence:.1%})"
            elif signal == 'SELL':
                return f"매도 신호 (신뢰도: {confidence:.1%})"
            else:
                return f"보유 신호 (신뢰도: {confidence:.1%})"
        except Exception as e:
            print(f"⚠️ AI 메시지 가져오기 오류: {e}")
            return None
    
    def get_ai_message_for_card(self, card, current_price):
        """카드에 대한 AI 메시지 가져오기"""
        try:
            if not self.ml_model_manager:
                return None
            
            prediction = self.ml_model_manager.predict(card, current_price)
            if not prediction:
                return None
            
            signal = prediction.get('signal', 'HOLD')
            confidence = prediction.get('confidence', 0.0)
            
            if signal == 'BUY':
                return f"매수 신호 (신뢰도: {confidence:.1%})"
            elif signal == 'SELL':
                return f"매도 신호 (신뢰도: {confidence:.1%})"
            else:
                return f"보유 신호 (신뢰도: {confidence:.1%})"
        except Exception as e:
            print(f"⚠️ AI 메시지 가져오기 오류: {e}")
            return None
    
    def get_rl_ai_analysis_for_card(self, card, current_price):
        """카드에 대한 강화학습 AI 분석 가져오기"""
        try:
            if not self.rl_system:
                return None
            
            decision = self.rl_system.decide_action(card, current_price)
            return decision
        except Exception as e:
            print(f"⚠️ 강화학습 AI 분석 오류: {e}")
            return None
    
    def update_ai_progress(self, value, message="", process_events=True):
        """AI 진행률 업데이트"""
        if self._updating_progress:
            return
        
        self._updating_progress = True
        try:
            self.ai_progress_value = max(0, min(100, int(value)))
            if message:
                self.ai_progress_message = message
            
            if hasattr(self.parent, 'ai_progress_bar'):
                self.parent.ai_progress_bar.setValue(self.ai_progress_value)
            
            if hasattr(self.parent, 'ai_progress_label'):
                self.parent.ai_progress_label.setText(self.ai_progress_message)
            
            if hasattr(self.parent, 'ai_progress_percent_label'):
                self.parent.ai_progress_percent_label.setText(f"{self.ai_progress_value}%")
            
            if process_events:
                from PyQt6.QtWidgets import QApplication
                QApplication.processEvents()
            
            self.ai_progress_updated.emit(self.ai_progress_value, self.ai_progress_message)
        finally:
            self._updating_progress = False
    
    def load_ml_model(self, interval='minute10', force_reload=False):
        """ML 모델 로드"""
        try:
            if self.ml_model_manager:
                self.ml_model_manager.load_model(interval, force_reload)
        except Exception as e:
            print(f"⚠️ ML 모델 로드 오류: {e}")
            import traceback
            traceback.print_exc()


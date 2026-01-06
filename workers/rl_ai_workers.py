"""
강화학습 AI 워커 모듈 (백그라운드 실행)
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import Dict, Any, Optional
import numpy as np


class RLAIAnalysisWorker(QThread):
    """강화학습 AI 분석 워커 (백그라운드 실행)"""
    
    analysis_ready = pyqtSignal(dict)  # 분석 완료 시그널
    error_occurred = pyqtSignal(str)   # 오류 발생 시그널
    
    def __init__(self, rl_system, card: Dict[str, Any], current_price: float):
        """
        Args:
            rl_system: RLSystem 인스턴스
            card: 카드 데이터
            current_price: 현재 가격
        """
        super().__init__()
        self.rl_system = rl_system
        self.card = card
        self.current_price = current_price
    
    def _score_from_pnl(self, pnl_percent: float) -> float:
        """손익률 기반 점수 (기본 50, ±25% → 0~100에 클램프)"""
        try:
            score = 50 + (pnl_percent * 2)
            return max(0.0, min(100.0, score))
        except Exception:
            return 50.0
    
    def run(self):
        """백그라운드에서 AI 분석 실행 (app.py와 동일한 로직)"""
        try:
            # 중단 요청 확인
            if self.isInterruptionRequested():
                print(f"  ℹ️ RL 워커 중단 요청됨 (작업 시작 전)")
                return
            
            card_id = self.card.get('card_id', '')
            
            # 강화학습 AI 시스템을 사용하여 판정
            if self.rl_system:
                try:
                    import time
                    rl_start_time = time.time()
                    print(f"🧠 강화학습 AI 판정 시작: card_id={card_id}")
                    print(f"   → Base Model 예측 시작...")
                    
                    # RLSystem.decide_action 호출 (성능 최적화 적용됨)
                    # 이 함수는 Base Model, Emotion Model, Policy Model을 모두 실행
                    decision = self.rl_system.decide_action(self.card, self.current_price)
                    
                    rl_duration = time.time() - rl_start_time
                    
                    # 성능 정보 출력
                    performance_info = decision.get('performance', {}) if decision else {}
                    if performance_info:
                        base_duration = performance_info.get('base_model_duration', 0)
                        emotion_duration = performance_info.get('emotion_model_duration', 0)
                        policy_duration = performance_info.get('policy_model_duration', 0)
                        nb_duration = performance_info.get('nb_calculation_duration', 0)
                        cache_hit = performance_info.get('cache_hit', False)
                        
                        print(f"⏱️ 강화학습 AI 판정 완료: {rl_duration:.2f}초")
                        print(f"   📊 성능 분석: Base={base_duration:.2f}s, Emotion={emotion_duration:.2f}s, "
                              f"Policy={policy_duration:.2f}s, NB={nb_duration:.2f}s")
                        if cache_hit:
                            print(f"   ⚡ 캐시 히트: 예측 결과 재사용")
                    else:
                        print(f"⏱️ 강화학습 AI 판정 완료: {rl_duration:.2f}초")
                    
                    if rl_duration > 30:
                        print(f"⚠️ 강화학습 AI 판정이 {rl_duration:.2f}초 소요되었습니다. (30초 이상)")
                    elif rl_duration > 10:
                        print(f"ℹ️ 강화학습 AI 판정이 {rl_duration:.2f}초 소요되었습니다. (10초 이상)")
                    
                    # 중단 요청 확인
                    if self.isInterruptionRequested():
                        print(f"  ℹ️ RL 워커 중단 요청됨 (행동 결정 후)")
                        return
                    
                    if decision:
                        action_name = decision.get('action_name', 'HOLD')
                        action_prob = decision.get('action_prob', 0.5)
                        q_value = decision.get('q_value', 0.0)
                        reasoning = decision.get('reasoning', '강화학습 AI 판정')
                        base_output = decision.get('base_output', {})
                        emotion_output = decision.get('emotion_output', {})
                        
                        # ActionType을 문자열로 변환
                        from ai.policy_model import ActionType
                        action_map = {
                            ActionType.BUY.value: 'BUY',
                            ActionType.SELL.value: 'SELL',
                            ActionType.HOLD.value: 'HOLD',
                            ActionType.FREEZE.value: 'FREEZE',
                            ActionType.DELETE.value: 'DELETE'
                        }
                        action = action_map.get(decision.get('action'), action_name)
                        
                        # 보유 상태 판단
                        history_list = self.card.get('history_list', [])
                        is_holding = False
                        entry_price = 0.0
                        for hist in reversed(history_list):
                            if hist.get('type') in ['NEW', 'BUY']:
                                is_holding = True
                                entry_price = (
                                    hist.get('entry_price', 0) or
                                    hist.get('price', 0) or
                                    hist.get('buy_price', 0) or
                                    hist.get('production_price', 0)
                                )
                                break
                            elif hist.get('type') == 'SOLD':
                                is_holding = False
                                break
                        
                        if entry_price <= 0:
                            entry_price = (
                                self.card.get('entry_price', 0) or
                                self.card.get('production_price', 0) or
                                self.card.get('current_price', 0) or
                                self.current_price
                            )
                        if entry_price <= 0 and history_list:
                            for hist in history_list:
                                cand = hist.get('entry_price') or hist.get('price') or hist.get('buy_price') or hist.get('production_price')
                                if cand and cand > 0:
                                    entry_price = cand
                                    break
                        
                        # 손익률 계산
                        pnl_percent = 0.0
                        if is_holding and entry_price > 0 and self.current_price > 0:
                            pnl_percent = ((self.current_price - entry_price) / entry_price) * 100
                        
                        # Base Model 출력 정보 추출
                        base_pred_return = base_output.get('pred_return', 0.0) if base_output else 0.0
                        base_confidence = base_output.get('confidence', 0.0) if base_output else 0.0
                        base_signal = base_output.get('signal', 'HOLD') if base_output else 'HOLD'
                        
                        # Emotion Model 출력 정보 추출
                        emotion_state = emotion_output.get('emotion_state', []) if emotion_output else []
                        emotion_dim = len(emotion_state) if emotion_state else 0
                        emotion_summary = {}
                        if emotion_output:
                            # 주요 감정 상태 추출
                            if 'emotion_state' in emotion_output:
                                emotion_state_array = emotion_output['emotion_state']
                                if isinstance(emotion_state_array, (list, np.ndarray)):
                                    try:
                                        emotion_array = np.array(emotion_state_array) if isinstance(emotion_state_array, list) else emotion_state_array
                                        emotion_summary = {
                                            'dimension': len(emotion_array),
                                            'max_value': float(np.max(emotion_array)),
                                            'min_value': float(np.min(emotion_array)),
                                            'mean_value': float(np.mean(emotion_array)),
                                            'std_value': float(np.std(emotion_array))
                                        }
                                    except Exception as e:
                                        print(f"⚠️ Emotion Model 배열 처리 오류: {e}")
                                        emotion_summary = {'dimension': len(emotion_state_array) if emotion_state_array else 0}
                        
                        # Policy Model 정보 (decision에서 추출)
                        exploration = decision.get('exploration', False)
                        
                        # 실시간 점수 차트 히스토리 가져오기
                        realtime_scores_list = self.card.get('realtime_scores', [])
                        # 최신 점수 사용 (히스토리가 있으면)
                        current_score = self.card.get('score', 100.0)
                        if realtime_scores_list and len(realtime_scores_list) > 0:
                            current_score = realtime_scores_list[-1]
                        
                        analysis_details = {
                            'nb_value': self.card.get('nb_value', 0.5),
                            'nb_max': self.card.get('nb_max', 5.5),
                            'nb_min': self.card.get('nb_min', 5.5),
                            'score': current_score,  # 실시간 점수 차트의 최신 점수 사용
                            'timeframe': self.card.get('timeframe', '1m'),
                            'current_price': self.current_price,
                            'is_holding': is_holding,
                            'entry_price': entry_price,
                            'pnl_percent': pnl_percent,
                            'history_count': len(history_list),
                            'card_state': self.card.get('card_state', 'ACTIVE'),
                            'card_type': self.card.get('card_type_detail', self.card.get('card_type', 'normal')),
                            'q_value': q_value,
                            'action_prob': action_prob,
                            'exploration': exploration,
                            'realtime_scores': realtime_scores_list[-50:] if len(realtime_scores_list) > 50 else realtime_scores_list,  # 최근 50개만 전송 (성능 최적화)
                            'realtime_scores_count': len(realtime_scores_list),
                            'base_output': {
                                'pred_return': base_pred_return,
                                'confidence': base_confidence,
                                'signal': base_signal
                            },
                            'emotion_output': emotion_summary,
                            'base_output_full': base_output,  # 전체 정보 (디버깅용)
                            'emotion_output_full': emotion_output  # 전체 정보 (디버깅용)
                        }
                        
                        # 메시지 생성
                        confidence = action_prob * 100.0
                        message = f'강화학습 AI 판정: {action} (확률: {confidence:.1f}%, Q값: {q_value:.4f})'
                        
                        print(f"✅ 강화학습 AI 판정 완료: {action} (확률: {confidence:.1f}%)")
                        print(f"   📊 실시간 점수: {current_score:.2f} (히스토리: {len(realtime_scores_list)}개)")
                        
                        # 중단 요청 확인
                        if self.isInterruptionRequested():
                            print(f"  ℹ️ RL 워커 중단 요청됨 (결과 구성 후)")
                            return
                        
                        # Card AI Mapper로 UI 정보 변환 (기존 호환성 유지)
                        from ai import CardAIMapper
                        mapper = CardAIMapper()
                        ui_info = mapper.map_to_ui(decision, self.card)
                        
                        # 결과 통합 (app.py와 동일한 구조)
                        result = {
                            'decision': decision,
                            'ui_info': ui_info,
                            'card_id': card_id,
                            'ai_type': 'RL',  # 강화학습 AI
                            # app.py와 동일한 필드 추가
                            'action': action,
                            'action_name': action,
                            'message': message,
                            'reasoning': reasoning,
                            'confidence': confidence,
                            'action_prob': action_prob,
                            'q_value': q_value,
                            'score': current_score,  # 실시간 점수 차트의 최신 점수
                            'analysis_details': analysis_details
                        }
                        
                        # 중단 요청 확인
                        if self.isInterruptionRequested():
                            print(f"  ℹ️ RL 워커 중단 요청됨 (시그널 전송 전)")
                            return
                        
                        self.analysis_ready.emit(result)
                        return
                        
                except Exception as e:
                    print(f"⚠️ 강화학습 AI 판정 오류: {e}")
                    import traceback
                    traceback.print_exc()
                    # 오류 발생 시 폴백 로직 사용
            
            # RL 시스템이 없거나 오류 발생 시 간단한 판정 (폴백) - app.py와 동일
            print("⚠️ 강화학습 AI 시스템을 사용할 수 없어 간단한 판정을 사용합니다.")
            nb_value = self.card.get('nb_value', 0.5)
            nb_max = self.card.get('nb_max', 5.5)
            nb_min = self.card.get('nb_min', 5.5)
            score = self.card.get('score', 100.0)
            timeframe = self.card.get('timeframe', '1m')
            history_list = self.card.get('history_list', [])
            
            # 보유 여부 확인
            is_holding = False
            entry_price = 0.0
            for hist in reversed(history_list):
                if hist.get('type') in ['NEW', 'BUY']:
                    is_holding = True
                    entry_price = (
                        hist.get('entry_price', 0) or
                        hist.get('price', 0) or
                        hist.get('buy_price', 0) or
                        hist.get('production_price', 0)
                    )
                    break
                elif hist.get('type') == 'SOLD':
                    is_holding = False
                    break
            
            # 히스토리에서 못 찾으면 카드 기본값 사용
            if entry_price <= 0:
                entry_price = (
                    self.card.get('entry_price', 0) or
                    self.card.get('production_price', 0) or
                    self.card.get('current_price', 0) or
                    self.current_price
                )
            if entry_price <= 0 and history_list:
                for hist in history_list:
                    cand = hist.get('entry_price') or hist.get('price') or hist.get('buy_price') or hist.get('production_price')
                    if cand and cand > 0:
                        entry_price = cand
                        break
            
            # 손익률 계산 (보유 중인 경우)
            pnl_percent = 0.0
            if is_holding and entry_price > 0 and self.current_price > 0:
                pnl_percent = ((self.current_price - entry_price) / entry_price) * 100
            
            # 실시간 점수 차트 히스토리 가져오기
            realtime_scores_list = self.card.get('realtime_scores', [])
            # 최신 점수 사용 (히스토리가 있으면)
            if realtime_scores_list and len(realtime_scores_list) > 0:
                score = realtime_scores_list[-1]
            else:
                # 손익 기반 점수 계산 (실시간 점수 차트와 동일 로직)
                score = self._score_from_pnl(pnl_percent) if self.current_price > 0 and (entry_price > 0 or self.card.get('production_price')) else score
            
            # 상세 분석 정보 계산
            analysis_details = {
                'nb_value': nb_value,
                'nb_max': nb_max,
                'nb_min': nb_min,
                'score': score,  # 실시간 점수 차트의 최신 점수 사용
                'timeframe': timeframe,
                'current_price': self.current_price,
                'is_holding': is_holding,
                'entry_price': entry_price,
                'pnl_percent': pnl_percent,
                'history_count': len(history_list),
                'card_state': self.card.get('card_state', 'ACTIVE'),
                'card_type': self.card.get('card_type_detail', self.card.get('card_type', 'normal')),
                'realtime_scores': realtime_scores_list[-50:] if len(realtime_scores_list) > 50 else realtime_scores_list,  # 최근 50개만 전송
                'realtime_scores_count': len(realtime_scores_list)
            }
            
            # 판단 근거 생성 (기본 AI zone 활용)
            reasoning_parts = []
            action = 'HOLD'
            confidence = 50.0
            
            # 기본 AI zone 정보 활용 (ORANGE → BUY, BLUE → SELL)
            zone = self.card.get('zone') or self.card.get('analysis_details', {}).get('zone') or self.card.get('zone_analysis', {}).get('zone')
            if zone == 'ORANGE':
                action = 'BUY'
                confidence = 70.0
                reasoning_parts.append(f"🟠 ORANGE 구역 기반 BUY 신호")
            elif zone == 'BLUE':
                action = 'SELL'
                confidence = 70.0
                reasoning_parts.append(f"🔵 BLUE 구역 기반 SELL 신호")
            
            # 손익률 참고
            reasoning_parts.append(f"📉 N/B 값: {nb_value:.10f}")
            reasoning_parts.append(f"💯 점수: {score:.2f}")
            if zone:
                reasoning_parts.append(f"📌 Zone: {zone}")
            
            # 메시지
            if action == 'BUY':
                message = f'매수 신호: Zone/기본 AI 기준 BUY.'
            elif action == 'SELL':
                message = f'매도 신호: Zone/기본 AI 기준 SELL.'
            else:
                message = 'HOLD 신호: 명확한 BUY/SELL 신호가 부족합니다.'
            
            reasoning = ' | '.join(reasoning_parts)
            
            print(f"⚠️ 폴백 로직 사용: {action} (확률: {confidence:.1f}%)")
            print(f"   📊 실시간 점수: {score:.2f} (히스토리: {len(realtime_scores_list)}개)")
            
            # 결과 구성
            result = {
                'action': action,
                'action_name': action,
                'message': message,
                'reasoning': reasoning,
                'confidence': confidence,
                'action_prob': confidence / 100.0,  # 0-1 범위
                'nb_value': nb_value,
                'nb_max': nb_max,
                'nb_min': nb_min,
                'score': score,  # 실시간 점수 차트의 최신 점수
                'analysis_details': analysis_details,
                'card_id': card_id,
                'ai_type': 'RL'  # 강화학습 AI (폴백)
            }
            
            # 중단 요청 확인
            if self.isInterruptionRequested():
                print(f"  ℹ️ RL 워커 중단 요청됨 (시그널 전송 전)")
                return
            
            self.analysis_ready.emit(result)
            
        except Exception as e:
            error_msg = f"강화학습 AI 분석 오류: {str(e)}"
            print(f"⚠️ {error_msg}")
            import traceback
            traceback.print_exc()
            self.error_occurred.emit(error_msg)


class MLModelAnalysisWorker(QThread):
    """기존 ML 모델 분석 워커 (백그라운드 실행)"""
    
    analysis_ready = pyqtSignal(dict)  # 분석 완료 시그널
    error_occurred = pyqtSignal(str)   # 오류 발생 시그널
    
    def __init__(self, ml_model_manager, card: Dict[str, Any], current_price: float, settings_manager):
        """
        Args:
            ml_model_manager: MLModelManager 인스턴스
            card: 카드 데이터
            current_price: 현재 가격
            settings_manager: SettingsManager 인스턴스
        """
        super().__init__()
        self.ml_model_manager = ml_model_manager
        self.card = card
        self.current_price = current_price
        self.settings_manager = settings_manager
    
    def run(self):
        """백그라운드에서 ML 모델 분석 실행"""
        try:
            # 중단 요청 확인
            if self.isInterruptionRequested():
                print(f"  ℹ️ ML 워커 중단 요청됨 (작업 시작 전)")
                return
            
            # 기존 ML 모델 분석
            if self.ml_model_manager:
                ai_result = self.ml_model_manager.get_ai_message_for_card(
                    self.card, 
                    self.current_price, 
                    self.settings_manager
                )
                
                # 중단 요청 확인
                if self.isInterruptionRequested():
                    print(f"  ℹ️ ML 워커 중단 요청됨 (분석 완료 후)")
                    return
                
                if isinstance(ai_result, dict):
                    signal = ai_result.get('signal', 'HOLD')
                    message = ai_result.get('message', 'AI 분석 중...')
                else:
                    # 문자열로 반환된 경우 (구버전 호환)
                    signal = 'HOLD'
                    message = ai_result if ai_result else "ML 모델을 사용할 수 없습니다."
            else:
                signal = 'HOLD'
                message = "ML 모델을 사용할 수 없습니다."
            
            # 중단 요청 확인
            if self.isInterruptionRequested():
                print(f"  ℹ️ ML 워커 중단 요청됨 (결과 구성 전)")
                return
            
            # 결과 구성
            result = {
                'signal': signal,
                'message': message,
                'card_id': self.card.get('card_id', ''),
                'ai_type': 'ML'  # 학습 완료된 ML AI
            }
            
            # 중단 요청 확인
            if self.isInterruptionRequested():
                print(f"  ℹ️ ML 워커 중단 요청됨 (시그널 전송 전)")
                return
            
            self.analysis_ready.emit(result)
            
        except Exception as e:
            error_msg = f"ML 모델 분석 오류: {str(e)}"
            print(f"⚠️ {error_msg}")
            import traceback
            traceback.print_exc()
            self.error_occurred.emit(error_msg)


#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
카드 정보 기반 AI 학습 시스템
카드 데이터만을 사용하여 학습하고 예측하는 AI 모델
"""

import os
import json
import pickle
import numpy as np
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict

# statistics 모듈 대체 (Python 3.4+)
try:
    import statistics
except ImportError:
    # Python 3.3 이하를 위한 대체 함수
    def mean(data):
        return sum(data) / len(data) if data else 0.0
    
    def stdev(data):
        if len(data) < 2:
            return 1.0
        m = mean(data)
        variance = sum((x - m) ** 2 for x in data) / (len(data) - 1)
        return variance ** 0.5
    
    class statistics:
        mean = staticmethod(mean)
        stdev = staticmethod(stdev)


class CardBasedAI:
    """
    카드 정보만을 사용하는 AI 학습 시스템
    
    학습 데이터:
    - 카드의 N/B 값 (nb_value, nb_max, nb_min)
    - 타임프레임
    - 생산 시점 가격 및 분봉 데이터
    - 카드 성과 (손익률, 점수, 등급)
    - 카드 히스토리 (매수/매도 기록)
    """
    
    def __init__(self, model_dir: str = "models/card_ai"):
        """
        초기화
        
        Args:
            model_dir: 모델 저장 디렉토리
        """
        self.model_dir = model_dir
        os.makedirs(model_dir, exist_ok=True)
        
        # 학습 데이터 저장소
        self.training_data: List[Dict] = []
        self.model_weights: Dict[str, float] = {}
        self.is_trained = False
        self.training_stats: Dict[str, Any] = {}
        
        # 모델 파일 경로
        self.model_file = os.path.join(model_dir, "card_ai_model.pkl")
        self.data_file = os.path.join(model_dir, "training_data.json")
        
        # 모델 로드
        self.load_model()
    
    def extract_card_features(self, card: Dict[str, Any]) -> Dict[str, float]:
        """
        카드에서 특징 추출
        
        Args:
            card: 카드 데이터
            
        Returns:
            특징 딕셔너리
        """
        features = {}
        
        # N/B 값 특징
        features['nb_value'] = float(card.get('nb_value', 0.5))
        features['nb_max'] = float(card.get('nb_max', 0.5))
        features['nb_min'] = float(card.get('nb_min', 0.5))
        features['nb_range'] = features['nb_max'] - features['nb_min']
        features['nb_center'] = (features['nb_max'] + features['nb_min']) / 2.0
        
        # 타임프레임 특징 (문자열을 숫자로 변환)
        timeframe = card.get('timeframe', '1m')
        timeframe_map = {
            '1m': 1, '3m': 3, '5m': 5, '15m': 15,
            '30m': 30, '60m': 60, '240m': 240,
            '1d': 1440, '1w': 10080, '1mo': 43200
        }
        features['timeframe_value'] = float(timeframe_map.get(timeframe, 1))
        
        # 생산 시점 가격 특징
        chart_data = card.get('chart_data', {})
        production_candle = chart_data.get('production_candle', {})
        if production_candle:
            features['production_open'] = float(production_candle.get('open', 0))
            features['production_high'] = float(production_candle.get('high', 0))
            features['production_low'] = float(production_candle.get('low', 0))
            features['production_close'] = float(production_candle.get('close', 0))
            features['production_volume'] = float(production_candle.get('volume', 0))
            features['production_range'] = features['production_high'] - features['production_low']
            if features['production_range'] > 0:
                features['production_body_ratio'] = abs(features['production_close'] - features['production_open']) / features['production_range']
            else:
                features['production_body_ratio'] = 0.0
        else:
            # 생산 분봉 데이터가 없으면 기본값
            production_price = chart_data.get('current_price', 0) or chart_data.get('prices', [0])[-1] if chart_data.get('prices') else 0
            features['production_open'] = production_price
            features['production_high'] = production_price
            features['production_low'] = production_price
            features['production_close'] = production_price
            features['production_volume'] = 0.0
            features['production_range'] = 0.0
            features['production_body_ratio'] = 0.0
        
        # 카드 점수 및 등급
        features['score'] = float(card.get('score', 100.0))
        rank = card.get('rank', 'C')
        rank_map = {'F': 0, 'E': 1, 'D': 2, 'C': 3, 'B': 4, 'A': 5, 'S': 6, 'SS': 7, '+SS': 8}
        features['rank_value'] = float(rank_map.get(rank, 3))
        
        # 히스토리 특징
        history_list = card.get('history_list', [])
        features['history_count'] = float(len(history_list))
        
        # 매수/매도 기록 분석
        buy_count = sum(1 for h in history_list if h.get('type') in ['NEW', 'BUY'])
        sell_count = sum(1 for h in history_list if h.get('type') == 'SOLD')
        features['buy_count'] = float(buy_count)
        features['sell_count'] = float(sell_count)
        
        # 진입 가격 및 청산 가격
        entry_price = 0.0
        exit_price = 0.0
        for hist in reversed(history_list):
            if hist.get('type') in ['NEW', 'BUY'] and entry_price == 0:
                entry_price = float(hist.get('entry_price', 0) or hist.get('price', 0) or 0)
            if hist.get('type') == 'SOLD' and exit_price == 0:
                exit_price = float(hist.get('exit_price', 0) or hist.get('price', 0) or 0)
        
        features['entry_price'] = entry_price
        features['exit_price'] = exit_price
        
        # 손익률 계산
        if entry_price > 0 and exit_price > 0:
            features['pnl_percent'] = ((exit_price - entry_price) / entry_price) * 100.0
        elif entry_price > 0:
            # 아직 매도하지 않은 경우 현재 가격 기준
            current_price = chart_data.get('current_price', 0) or chart_data.get('prices', [0])[-1] if chart_data.get('prices') else 0
            if current_price > 0:
                features['pnl_percent'] = ((current_price - entry_price) / entry_price) * 100.0
            else:
                features['pnl_percent'] = 0.0
        else:
            features['pnl_percent'] = 0.0
        
        # 생산 시간 특징 (생산 후 경과 시간)
        production_time = card.get('production_time')
        if production_time:
            try:
                prod_dt = datetime.fromisoformat(production_time.replace('Z', '+00:00'))
                elapsed_seconds = (datetime.now() - prod_dt.replace(tzinfo=None)).total_seconds()
                features['elapsed_hours'] = elapsed_seconds / 3600.0
            except:
                features['elapsed_hours'] = 0.0
        else:
            features['elapsed_hours'] = 0.0
        
        return features
    
    def calculate_target(self, card: Dict[str, Any]) -> float:
        """
        카드의 목표값 계산 (학습용 레이블)
        
        Args:
            card: 카드 데이터
            
        Returns:
            목표값 (손익률 기반)
        """
        # 손익률을 목표값으로 사용
        history_list = card.get('history_list', [])
        
        # SOLD 히스토리에서 최종 손익률 찾기
        for hist in reversed(history_list):
            if hist.get('type') == 'SOLD':
                pnl_percent = hist.get('pnl_percent', 0)
                if pnl_percent:
                    return float(pnl_percent)
        
        # SOLD가 없으면 현재 손익률 계산
        chart_data = card.get('chart_data', {})
        entry_price = 0.0
        current_price = 0.0
        
        # 진입 가격 찾기
        for hist in reversed(history_list):
            if hist.get('type') in ['NEW', 'BUY']:
                entry_price = float(hist.get('entry_price', 0) or hist.get('price', 0) or 0)
                if entry_price > 0:
                    break
        
        # 현재 가격
        if chart_data:
            current_price = chart_data.get('current_price', 0) or (chart_data.get('prices', [0])[-1] if chart_data.get('prices') else 0)
        
        # 손익률 계산
        if entry_price > 0 and current_price > 0:
            pnl_percent = ((current_price - entry_price) / entry_price) * 100.0
            return float(pnl_percent)
        
        # 데이터가 없으면 점수 기반 추정
        score = float(card.get('score', 100.0))
        # 점수를 손익률로 변환 (100점 = 0%, 150점 = +5%, 50점 = -5%)
        estimated_pnl = (score - 100.0) * 0.1
        return estimated_pnl
    
    def prepare_training_data(self, cards: List[Dict[str, Any]]) -> Tuple[List[Dict], List[float]]:
        """
        학습 데이터 준비
        
        Args:
            cards: 카드 리스트
            
        Returns:
            (특징 리스트, 목표값 리스트)
        """
        X = []
        y = []
        
        for card in cards:
            try:
                features = self.extract_card_features(card)
                target = self.calculate_target(card)
                
                X.append(features)
                y.append(target)
            except Exception as e:
                print(f"⚠️ 카드 데이터 처리 오류: {e}")
                continue
        
        return X, y
    
    def train(self, cards: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        카드 데이터로 학습
        
        Args:
            cards: 학습용 카드 리스트
            
        Returns:
            학습 결과
        """
        if not cards or len(cards) < 10:
            return {
                'success': False,
                'error': f'학습 데이터가 부족합니다. (최소 10개 필요, 현재 {len(cards)}개)'
            }
        
        print(f"🔄 카드 기반 AI 학습 시작: {len(cards)}개 카드")
        
        # 학습 데이터 준비
        X, y = self.prepare_training_data(cards)
        
        if len(X) < 10:
            return {
                'success': False,
                'error': f'유효한 학습 데이터가 부족합니다. (최소 10개 필요, 현재 {len(X)}개)'
            }
        
        # 특징 정규화를 위한 통계 계산
        feature_names = list(X[0].keys())
        feature_stats = {}
        for name in feature_names:
            values = [x[name] for x in X if name in x]
            if values:
                feature_stats[name] = {
                    'mean': statistics.mean(values),
                    'std': statistics.stdev(values) if len(values) > 1 else 1.0,
                    'min': min(values),
                    'max': max(values)
                }
        
        # 가중치 기반 선형 모델 학습 (간단한 회귀)
        # 각 특징의 중요도(가중치) 계산
        weights = {}
        target_mean = statistics.mean(y)
        target_std = statistics.stdev(y) if len(y) > 1 else 1.0
        
        for name in feature_names:
            feature_values = [x[name] for x in X]
            feature_mean = feature_stats[name]['mean']
            feature_std = feature_stats[name]['std']
            
            # 상관관계 기반 가중치 계산
            if feature_std > 0 and target_std > 0:
                # 정규화된 값들
                normalized_features = [(v - feature_mean) / feature_std for v in feature_values]
                normalized_targets = [(t - target_mean) / target_std for t in y]
                
                # 상관계수 계산
                if len(normalized_features) > 1:
                    correlation = np.corrcoef(normalized_features, normalized_targets)[0, 1]
                    if np.isnan(correlation):
                        correlation = 0.0
                    weights[name] = float(correlation)
                else:
                    weights[name] = 0.0
            else:
                weights[name] = 0.0
        
        # 가중치 정규화
        total_weight = sum(abs(w) for w in weights.values())
        if total_weight > 0:
            weights = {k: v / total_weight for k, v in weights.items()}
        
        # 모델 저장
        self.model_weights = weights
        self.training_data = X
        self.feature_stats = feature_stats  # 특징 통계 저장 (예측 시 사용)
        self.is_trained = True
        
        # 학습 통계 계산
        predictions = [self._predict_single(x) for x in X]
        mse = statistics.mean([(p - t) ** 2 for p, t in zip(predictions, y)])
        mae = statistics.mean([abs(p - t) for p, t in zip(predictions, y)])
        
        # R² 계산
        ss_res = sum([(t - p) ** 2 for p, t in zip(predictions, y)])
        ss_tot = sum([(t - target_mean) ** 2 for t in y])
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
        
        self.training_stats = {
            'train_count': len(X),
            'train_mse': mse,
            'train_mae': mae,
            'train_r2': r2,
            'target_mean': target_mean,
            'target_std': target_std,
            'feature_importance': dict(sorted(weights.items(), key=lambda x: abs(x[1]), reverse=True)[:10])
        }
        
        # 모델 저장
        self.save_model()
        
        print(f"✅ 카드 기반 AI 학습 완료")
        print(f"   학습 데이터: {len(X)}개")
        print(f"   R²: {r2:.4f}")
        print(f"   MSE: {mse:.4f}")
        print(f"   MAE: {mae:.4f}")
        
        return {
            'success': True,
            'train_count': len(X),
            'train_r2': r2,
            'train_mse': mse,
            'train_mae': mae,
            'feature_importance': self.training_stats['feature_importance']
        }
    
    def _predict_single(self, features: Dict[str, float]) -> float:
        """
        단일 카드 예측
        
        Args:
            features: 카드 특징
            
        Returns:
            예측 손익률
        """
        if not self.is_trained or not self.model_weights:
            return 0.0
        
        prediction = 0.0
        for name, weight in self.model_weights.items():
            if name in features:
                # 특징 정규화 (학습 시 통계 사용)
                if hasattr(self, 'feature_stats') and name in self.feature_stats:
                    stats = self.feature_stats[name]
                    normalized = (features[name] - stats['mean']) / stats['std'] if stats['std'] > 0 else 0.0
                else:
                    normalized = features[name]
                
                prediction += weight * normalized
        
        # 목표값 역정규화
        if hasattr(self, 'training_stats') and 'target_mean' in self.training_stats:
            target_mean = self.training_stats['target_mean']
            target_std = self.training_stats['target_std']
            prediction = prediction * target_std + target_mean
        
        return prediction
    
    def predict(self, card: Dict[str, Any]) -> Dict[str, Any]:
        """
        카드의 예상 손익률 예측
        
        Args:
            card: 카드 데이터
            
        Returns:
            예측 결과
        """
        if not self.is_trained:
            return {
                'success': False,
                'error': '모델이 학습되지 않았습니다.'
            }
        
        try:
            features = self.extract_card_features(card)
            predicted_pnl = self._predict_single(features)
            
            # 예측 신뢰도 계산 (특징의 완전성 기반)
            feature_completeness = sum(1 for v in features.values() if v != 0) / len(features)
            confidence = min(100.0, feature_completeness * 100.0)
            
            # 예측 방향
            direction = '상승' if predicted_pnl > 0 else '하락' if predicted_pnl < 0 else '보합'
            
            return {
                'success': True,
                'predicted_pnl_percent': float(predicted_pnl),
                'predicted_direction': direction,
                'confidence': float(confidence),
                'features_used': list(features.keys()),
                'feature_values': {k: float(v) for k, v in features.items()}
            }
        except Exception as e:
            return {
                'success': False,
                'error': f'예측 실패: {str(e)}'
            }
    
    def save_model(self):
        """모델 저장"""
        try:
            model_data = {
                'weights': self.model_weights,
                'training_stats': self.training_stats,
                'feature_stats': getattr(self, 'feature_stats', {}),
                'is_trained': self.is_trained,
                'saved_at': datetime.now().isoformat()
            }
            
            with open(self.model_file, 'wb') as f:
                pickle.dump(model_data, f)
            
            # 학습 데이터도 저장 (선택적)
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(self.training_data[:1000], f, ensure_ascii=False, indent=2)  # 최근 1000개만 저장
            
            print(f"💾 모델 저장 완료: {self.model_file}")
        except Exception as e:
            print(f"⚠️ 모델 저장 실패: {e}")
    
    def load_model(self):
        """모델 로드"""
        try:
            if os.path.exists(self.model_file):
                with open(self.model_file, 'rb') as f:
                    model_data = pickle.load(f)
                
                self.model_weights = model_data.get('weights', {})
                self.training_stats = model_data.get('training_stats', {})
                self.feature_stats = model_data.get('feature_stats', {})
                self.is_trained = model_data.get('is_trained', False)
                
                print(f"✅ 모델 로드 완료: {self.model_file}")
                if self.is_trained:
                    print(f"   학습 데이터: {self.training_stats.get('train_count', 0)}개")
                    print(f"   R²: {self.training_stats.get('train_r2', 0):.4f}")
            else:
                print(f"ℹ️ 모델 파일이 없습니다: {self.model_file}")
        except Exception as e:
            print(f"⚠️ 모델 로드 실패: {e}")
            self.is_trained = False
            self.feature_stats = {}
    
    def get_model_info(self) -> Dict[str, Any]:
        """모델 정보 조회"""
        return {
            'is_trained': self.is_trained,
            'training_stats': self.training_stats,
            'feature_count': len(self.model_weights),
            'model_file': self.model_file
        }

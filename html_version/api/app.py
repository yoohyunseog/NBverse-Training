"""
HTML 버전 백엔드 API 서버
NBVerse 데이터베이스와 연동하여 N/B 값 관리 및 카드 관리
"""
import os
import sys
import json
import time
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pyupbit
from dotenv import load_dotenv
import numpy as np
import signal
from contextlib import contextmanager

# 상위 디렉토리의 모듈 import
# 현재 파일: html_version/api/app.py
# 목표: v0.0.0.4/ 디렉토리를 sys.path에 추가
current_file_dir = os.path.dirname(os.path.abspath(__file__))  # html_version/api
html_version_dir = os.path.dirname(current_file_dir)  # html_version
parent_dir = os.path.dirname(html_version_dir)  # v0.0.0.4

# v0.0.0.4 디렉토리를 sys.path에 추가 (중복 방지)
parent_dir_normalized = os.path.normpath(parent_dir)
if parent_dir_normalized not in [os.path.normpath(p) for p in sys.path]:
    sys.path.insert(0, parent_dir_normalized)

# 작업 디렉토리를 v0.0.0.4로 변경 (상대 경로 문제 해결)
os.chdir(parent_dir_normalized)

print(f"📁 작업 디렉토리: {os.getcwd()}")
print(f"📁 Python 경로에 추가: {parent_dir_normalized}")
print(f"📁 nbverse_helper 경로 확인: {os.path.join(parent_dir_normalized, 'nbverse_helper.py')}")

from nbverse_helper import init_nbverse_storage, calculate_nb_value_from_chart
from managers import SettingsManager, ProductionCardManager, DiscardedCardManager
from utils import load_config

# ML 모델 관리자 제거됨

# env.local 파일 로드 (여러 위치에서 찾기)
def load_env_local():
    """env.local 파일을 여러 위치에서 찾아서 로드"""
    current_file_dir = os.path.dirname(os.path.abspath(__file__))  # html_version/api
    parent_dir = os.path.dirname(os.path.dirname(current_file_dir))  # v0.0.0.4
    html_version_dir = os.path.dirname(current_file_dir)  # html_version
    
    env_local_paths = [
        os.path.join(parent_dir, "env.local"),  # v0.0.0.4/env.local (우선순위 1)
        os.path.join(html_version_dir, "env.local"),  # html_version/env.local (우선순위 2)
        os.path.join(current_file_dir, "env.local"),  # html_version/api/env.local (우선순위 3)
    ]
    
    for env_path in env_local_paths:
        if os.path.exists(env_path):
            print(f"📄 env.local 파일 로드: {env_path}")
            load_dotenv(env_path, override=True)
            return True
    
    print("⚠️ env.local 파일을 찾을 수 없습니다.")
    return False

# env.local 파일 로드
load_env_local()

app = Flask(__name__)
CORS(app)  # CORS 활성화

# 응답 압축 활성화 (성능 향상)
from flask_compress import Compress
Compress(app)

# HTTP 세션 관리 (연결 재사용)
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# pyupbit용 세션 설정
_http_session = requests.Session()
retry_strategy = Retry(
    total=2,
    backoff_factor=0.1,
    status_forcelist=[429, 500, 502, 503, 504]
)
adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=10, pool_maxsize=20)
_http_session.mount("http://", adapter)
_http_session.mount("https://", adapter)

# 전역 변수
nbverse_storage = None
nbverse_converter = None
settings_manager = None
production_card_manager = None
discarded_card_manager = None
upbit = None
cfg = None
# rl_system 제거됨
_price_cache_value = 0.0
_price_cache_time = 0.0
_price_call_times = []  # 최근 호출 시각(초) 목록

# OHLCV 캐시 시스템 (메모리 기반)
_ohlcv_cache = {}  # key: f"{market}_{interval}_{count}", value: {"data": [...], "timestamp": time.time()}
_ohlcv_cache_ttl = 180  # 캐시 유효 시간 (초) - 180초(3분)간 캐시 유지 (성능 최적화)


class TimeoutError(Exception):
    """타임아웃 예외"""
    pass


@contextmanager
def time_limit(seconds):
    """함수 실행 시간 제한 (Windows 호환)"""
    def signal_handler(signum, frame):
        raise TimeoutError(f"Timed out after {seconds} seconds")
    
    # Windows에서는 SIGALRM이 지원되지 않으므로 다른 방법 사용
    if sys.platform == 'win32':
        # Windows: threading을 사용한 타임아웃
        import threading
        timer = threading.Timer(seconds, lambda: None)
        try:
            timer.start()
            yield
        finally:
            timer.cancel()
    else:
        # Unix/Linux: signal 사용
        old_handler = signal.signal(signal.SIGALRM, signal_handler)
        signal.alarm(seconds)
        try:
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)


def _score_from_pnl(pnl_percent: float) -> float:
    """손익률 기반 점수 (기본 50, ±25% → 0~100에 클램프)"""
    try:
        score = 50 + (pnl_percent * 2)
        return max(0.0, min(100.0, score))
    except Exception:
        return 50.0


def _predict_next_card(card: dict, chart_data: dict = None) -> dict:
    """
    현재 카드 데이터를 기반으로 다음 카드의 Zone(BLUE/ORANGE) 및 가격 예측
    
    Args:
        card: 현재 카드 데이터
        chart_data: 차트 데이터 (선택적)
    
    Returns:
        {
            'predicted_zone': 'BLUE' or 'ORANGE',
            'predicted_price': float,
            'predicted_price_change_percent': float,
            'prediction_confidence': float (0.0~1.0),
            'prediction_reason': str,
            'predicted_r_value': float
        }
    """
    try:
        # 현재 카드의 Zone 및 r값
        current_zone = (card.get('zone') or 
                       card.get('ml_ai_zone') or 
                       card.get('basic_ai_zone') or
                       card.get('recent_ml_ai_analysis', {}).get('zone') or
                       card.get('recent_basic_ai_analysis', {}).get('zone'))
        current_r_value = (card.get('r_value') or 
                          card.get('ml_ai_r_value') or 
                          card.get('basic_ai_r_value') or
                          card.get('recent_ml_ai_analysis', {}).get('r_value') or
                          card.get('recent_basic_ai_analysis', {}).get('r_value'))
        
        # N/B 값
        nb_value = card.get('nb_value', 0.5)
        nb_max = card.get('nb_max', 0.5)
        nb_min = card.get('nb_min', 0.5)
        
        # 현재 가격 가져오기
        current_price = 0.0
        if chart_data and chart_data.get('prices'):
            prices = chart_data.get('prices', [])
            if len(prices) > 0:
                current_price = prices[-1]
        elif chart_data and chart_data.get('current_price'):
            current_price = chart_data.get('current_price')
        else:
            # 카드의 생산 시점 가격 사용
            if card.get('chart_data') and card.get('chart_data', {}).get('prices'):
                card_prices = card.get('chart_data', {}).get('prices', [])
                if len(card_prices) > 0:
                    current_price = card_prices[-1]
            elif card.get('chart_data') and card.get('chart_data', {}).get('current_price'):
                current_price = card.get('chart_data', {}).get('current_price')
        
        # 차트 데이터가 있으면 가격 추세 분석
        price_trend = None
        price_change_rate = 0.0
        if chart_data and chart_data.get('prices'):
            prices = chart_data.get('prices', [])
            if len(prices) >= 20:
                # 최근 20개 가격의 추세 분석
                recent_prices = prices[-20:]
                price_changes = []
                for i in range(1, len(recent_prices)):
                    change = (recent_prices[i] - recent_prices[i-1]) / recent_prices[i-1]
                    price_changes.append(change)
                
                avg_change = sum(price_changes) / len(price_changes) if price_changes else 0
                price_trend = 'up' if avg_change > 0 else 'down'
                price_change_rate = avg_change  # 평균 변동률
        
        # 예측 로직
        prediction_factors = []
        confidence_sum = 0.0
        predicted_r_value = 0.5
        
        # 1. 현재 Zone 기반 예측 (30% 가중치)
        if current_zone:
            if current_zone == 'BLUE':
                # BLUE 구역에서는 계속 상승하거나 ORANGE로 전환 가능
                # r값이 낮으면(0.3 이하) 계속 BLUE, 높으면(0.7 이상) ORANGE 전환 가능
                if current_r_value is not None:
                    if current_r_value < 0.3:
                        # 강한 BLUE → 다음도 BLUE 가능성 높음
                        predicted_r_value += (0.3 - current_r_value) * 0.3
                        prediction_factors.append(f"현재 강한 BLUE 구역 (r={current_r_value:.3f}) → 다음 카드도 BLUE 가능성 높음")
                        confidence_sum += 0.3
                    elif current_r_value > 0.7:
                        # BLUE에서 ORANGE로 전환 가능
                        predicted_r_value += (current_r_value - 0.5) * 0.3
                        prediction_factors.append(f"BLUE 구역에서 ORANGE 전환 가능 (r={current_r_value:.3f})")
                        confidence_sum += 0.3
                    else:
                        # 중간 → 현재 추세 유지
                        predicted_r_value = current_r_value
                        prediction_factors.append(f"현재 BLUE 구역 (r={current_r_value:.3f}) → 추세 유지")
                        confidence_sum += 0.2
            elif current_zone == 'ORANGE':
                # ORANGE 구역에서는 계속 하락하거나 BLUE로 전환 가능
                if current_r_value is not None:
                    if current_r_value > 0.7:
                        # 강한 ORANGE → 다음도 ORANGE 가능성 높음
                        predicted_r_value += (current_r_value - 0.5) * 0.3
                        prediction_factors.append(f"현재 강한 ORANGE 구역 (r={current_r_value:.3f}) → 다음 카드도 ORANGE 가능성 높음")
                        confidence_sum += 0.3
                    elif current_r_value < 0.3:
                        # ORANGE에서 BLUE로 전환 가능
                        predicted_r_value += (0.3 - current_r_value) * 0.3
                        prediction_factors.append(f"ORANGE 구역에서 BLUE 전환 가능 (r={current_r_value:.3f})")
                        confidence_sum += 0.3
                    else:
                        # 중간 → 현재 추세 유지
                        predicted_r_value = current_r_value
                        prediction_factors.append(f"현재 ORANGE 구역 (r={current_r_value:.3f}) → 추세 유지")
                        confidence_sum += 0.2
        
        # 2. N/B 값 기반 예측 (25% 가중치)
        if nb_value is not None:
            # N/B 값이 낮으면(0.3 이하) 상승 가능성, 높으면(0.7 이상) 하락 가능성
            if nb_value < 0.3:
                predicted_r_value -= (0.3 - nb_value) * 0.25
                prediction_factors.append(f"N/B 값 낮음 ({nb_value:.3f}) → 상승 가능성 (BLUE)")
                confidence_sum += 0.25
            elif nb_value > 0.7:
                predicted_r_value += (nb_value - 0.5) * 0.25
                prediction_factors.append(f"N/B 값 높음 ({nb_value:.3f}) → 하락 가능성 (ORANGE)")
                confidence_sum += 0.25
            else:
                confidence_sum += 0.15
        
        # 3. 가격 추세 기반 예측 (25% 가중치)
        if price_trend:
            if price_trend == 'up':
                # 상승 추세 → BLUE 가능성
                predicted_r_value -= 0.15
                prediction_factors.append("가격 상승 추세 → BLUE 가능성")
                confidence_sum += 0.25
            elif price_trend == 'down':
                # 하락 추세 → ORANGE 가능성
                predicted_r_value += 0.15
                prediction_factors.append("가격 하락 추세 → ORANGE 가능성")
                confidence_sum += 0.25
        
        # 4. N/B 범위 기반 예측 (20% 가중치)
        if nb_max is not None and nb_min is not None:
            nb_range = nb_max - nb_min
            if nb_range > 0.3:
                # 변동성이 크면 현재 Zone 유지 가능성 높음
                if current_zone == 'BLUE':
                    predicted_r_value -= 0.1
                elif current_zone == 'ORANGE':
                    predicted_r_value += 0.1
                prediction_factors.append(f"높은 변동성 (범위: {nb_range:.3f}) → 현재 Zone 유지 가능")
                confidence_sum += 0.2
        
        # r값 정규화 (0~1 범위)
        predicted_r_value = max(0.0, min(1.0, predicted_r_value))
        
        # Zone 결정 (r < 0.5 → BLUE, r >= 0.5 → ORANGE)
        predicted_zone = 'BLUE' if predicted_r_value < 0.5 else 'ORANGE'
        
        # 가격 예측 계산
        predicted_price_change_percent = 0.0
        predicted_price = current_price
        
        if current_price > 0:
            # Zone 기반 가격 변동 예측
            if predicted_zone == 'BLUE':
                # BLUE 구역: 상승 예상
                # r값이 낮을수록(0에 가까울수록) 강한 상승, 높을수록 약한 상승
                if predicted_r_value < 0.3:
                    # 강한 BLUE → 큰 상승
                    predicted_price_change_percent = 0.5 + (0.3 - predicted_r_value) * 1.0  # 0.5% ~ 0.8%
                elif predicted_r_value < 0.5:
                    # 약한 BLUE → 작은 상승
                    predicted_price_change_percent = 0.2 + (0.5 - predicted_r_value) * 0.3  # 0.2% ~ 0.5%
                else:
                    predicted_price_change_percent = 0.1  # 최소 상승
            else:  # ORANGE
                # ORANGE 구역: 하락 예상
                # r값이 높을수록(1에 가까울수록) 강한 하락, 낮을수록 약한 하락
                if predicted_r_value > 0.7:
                    # 강한 ORANGE → 큰 하락
                    predicted_price_change_percent = -0.5 - (predicted_r_value - 0.7) * 1.0  # -0.5% ~ -0.8%
                elif predicted_r_value > 0.5:
                    # 약한 ORANGE → 작은 하락
                    predicted_price_change_percent = -0.2 - (predicted_r_value - 0.5) * 0.3  # -0.2% ~ -0.5%
                else:
                    predicted_price_change_percent = -0.1  # 최소 하락
            
            # 가격 추세 반영
            if price_trend == 'up':
                predicted_price_change_percent += 0.1  # 상승 추세 보정
            elif price_trend == 'down':
                predicted_price_change_percent -= 0.1  # 하락 추세 보정
            
            # N/B 값 기반 보정
            if nb_value < 0.3:
                predicted_price_change_percent += 0.15  # 낮은 N/B → 상승 보정
            elif nb_value > 0.7:
                predicted_price_change_percent -= 0.15  # 높은 N/B → 하락 보정
            
            # 예측 가격 계산
            predicted_price = current_price * (1 + predicted_price_change_percent / 100)
            
            # 가격 예측 근거 추가
            if predicted_price_change_percent > 0:
                prediction_factors.append(f"가격 상승 예상: +{predicted_price_change_percent:.2f}%")
            elif predicted_price_change_percent < 0:
                prediction_factors.append(f"가격 하락 예상: {predicted_price_change_percent:.2f}%")
            else:
                prediction_factors.append("가격 유지 예상")
        
        # 신뢰도 계산 (0.0~1.0)
        confidence = min(1.0, confidence_sum)
        
        # 예측 이유 생성
        reason = " | ".join(prediction_factors) if prediction_factors else "데이터 부족으로 예측 불가"
        
        return {
            'predicted_zone': predicted_zone,
            'predicted_price': predicted_price,
            'predicted_price_change_percent': predicted_price_change_percent,
            'prediction_confidence': confidence,
            'prediction_reason': reason,
            'predicted_r_value': predicted_r_value
        }
    except Exception as e:
        print(f"⚠️ Zone 예측 오류: {e}")
        import traceback
        traceback.print_exc()
        # 기본값 반환
        return {
            'predicted_zone': 'ORANGE',
            'predicted_price': 0.0,
            'predicted_price_change_percent': 0.0,
            'prediction_confidence': 0.0,
            'prediction_reason': f'예측 오류: {str(e)}',
            'predicted_r_value': 0.5
        }


def _verify_prediction(previous_card: dict, current_card: dict, chart_data: dict = None) -> dict:
    """
    이전 카드의 Zone 및 가격 예측을 현재 카드의 실제 Zone 및 가격과 비교하여 검증
    
    Args:
        previous_card: 이전 카드 (예측이 저장된 카드)
        current_card: 현재 카드 (실제 Zone이 있는 카드)
        chart_data: 현재 카드의 차트 데이터 (선택적)
    
    Returns:
        {
            'verified': bool,
            'zone_correct': bool,
            'price_correct': bool,
            'predicted_zone': str,
            'actual_zone': str,
            'predicted_price': float,
            'actual_price': float,
            'price_error_percent': float,
            'verification_time': str
        }
    """
    try:
        # 이전 카드의 예측 정보
        predicted_zone = previous_card.get('predicted_next_zone')
        predicted_price = previous_card.get('predicted_next_price', 0.0)
        
        if not predicted_zone:
            return {
                'verified': False,
                'zone_correct': False,
                'price_correct': False,
                'predicted_zone': None,
                'actual_zone': None,
                'predicted_price': 0.0,
                'actual_price': 0.0,
                'price_error_percent': 0.0,
                'verification_time': None,
                'reason': '이전 카드에 예측 정보가 없습니다.'
            }
        
        # 현재 카드의 실제 Zone
        actual_zone = (current_card.get('zone') or 
                      current_card.get('ml_ai_zone') or 
                      current_card.get('basic_ai_zone') or
                      current_card.get('recent_ml_ai_analysis', {}).get('zone') or
                      current_card.get('recent_basic_ai_analysis', {}).get('zone'))
        
        # 현재 카드의 실제 가격
        actual_price = 0.0
        if chart_data and chart_data.get('prices'):
            prices = chart_data.get('prices', [])
            if len(prices) > 0:
                actual_price = prices[-1]
        elif chart_data and chart_data.get('current_price'):
            actual_price = chart_data.get('current_price')
        elif current_card.get('chart_data') and current_card.get('chart_data', {}).get('prices'):
            card_prices = current_card.get('chart_data', {}).get('prices', [])
            if len(card_prices) > 0:
                actual_price = card_prices[-1]
        elif current_card.get('chart_data') and current_card.get('chart_data', {}).get('current_price'):
            actual_price = current_card.get('chart_data', {}).get('current_price')
        
        if not actual_zone:
            return {
                'verified': False,
                'zone_correct': False,
                'price_correct': False,
                'predicted_zone': predicted_zone,
                'actual_zone': None,
                'predicted_price': predicted_price,
                'actual_price': actual_price,
                'price_error_percent': 0.0,
                'verification_time': None,
                'reason': '현재 카드에 Zone 정보가 없습니다.'
            }
        
        # Zone 예측 정확도 확인
        zone_correct = (predicted_zone == actual_zone)
        
        # 가격 예측 정확도 확인 (오차 2% 이내면 정확)
        price_correct = False
        price_error_percent = 0.0
        if predicted_price > 0 and actual_price > 0:
            price_error_percent = abs((actual_price - predicted_price) / predicted_price) * 100
            price_correct = (price_error_percent <= 2.0)  # 2% 이내 오차면 정확
        
        verified = zone_correct or (predicted_price > 0 and actual_price > 0)
        
        reason_parts = []
        if zone_correct:
            reason_parts.append('Zone 예측 정확')
        else:
            reason_parts.append('Zone 예측 실패')
        
        if predicted_price > 0 and actual_price > 0:
            if price_correct:
                reason_parts.append(f'가격 예측 정확 (오차: {price_error_percent:.2f}%)')
            else:
                reason_parts.append(f'가격 예측 실패 (오차: {price_error_percent:.2f}%)')
        
        return {
            'verified': verified,
            'zone_correct': zone_correct,
            'price_correct': price_correct,
            'predicted_zone': predicted_zone,
            'actual_zone': actual_zone,
            'predicted_price': predicted_price,
            'actual_price': actual_price,
            'price_error_percent': price_error_percent,
            'verification_time': datetime.now().isoformat(),
            'reason': ' | '.join(reason_parts)
        }
    except Exception as e:
        print(f"⚠️ 예측 검증 오류: {e}")
        import traceback
        traceback.print_exc()
        return {
            'verified': False,
            'zone_correct': False,
            'price_correct': False,
            'predicted_zone': None,
            'actual_zone': None,
            'predicted_price': 0.0,
            'actual_price': 0.0,
            'price_error_percent': 0.0,
            'verification_time': None,
            'reason': f'검증 오류: {str(e)}'
        }


def _get_btc_price_cached():
    """설정 기반 캐시/레이트리밋을 적용해 BTC 현재가를 반환"""
    global _price_cache_value, _price_cache_time, _price_call_times

    ttl = settings_manager.get('price_cache_ttl_seconds', 60) if settings_manager else 60
    rate_limit = settings_manager.get('price_rate_limit_per_min', 10) if settings_manager else 10

    now = time.time()

    # 1) 캐시 유효하면 반환
    if _price_cache_time > 0 and (now - _price_cache_time) < ttl and _price_cache_value > 0:
        return _price_cache_value

    # 2) 레이트 리밋 확인 (최근 60초)
    _price_call_times = [t for t in _price_call_times if now - t < 60]
    if len(_price_call_times) >= rate_limit:
        if _price_cache_value > 0:
            print("⚠️ 가격 API 레이트 리밋 초과, 캐시된 가격 반환")
            return _price_cache_value
        raise Exception("가격 API 호출 한도 초과 (캐시 없음)")

    # 3) 실시간 조회 (다중 fallback)
    price = None
    try:
        price = pyupbit.get_current_price("KRW-BTC")
    except Exception as e:
        print(f"⚠️ get_current_price 실패: {e}")

    if not price or price <= 0:
        try:
            ticker = pyupbit.get_ticker("KRW-BTC")
            if ticker and 'trade_price' in ticker:
                price = float(ticker['trade_price'])
        except Exception as e:
            print(f"⚠️ get_ticker 실패: {e}")

    if not price or price <= 0:
        try:
            df_last = pyupbit.get_ohlcv("KRW-BTC", interval='minute1', count=1)
            if df_last is not None and not df_last.empty:
                price = float(df_last['close'].iloc[-1])
        except Exception as e:
            print(f"⚠️ get_ohlcv fallback 실패: {e}")

    if not price or price <= 0:
        raise Exception("현재 가격을 가져올 수 없습니다.")

    _price_call_times.append(now)
    _price_cache_value = float(price)
    _price_cache_time = now
    return _price_cache_value


def _map_timeframe_to_interval(timeframe: str) -> str:
    """카드 타임프레임을 pyupbit interval 문자열로 변환"""
    tf = (timeframe or "").lower()
    mapping = {
        '1m': 'minute1',
        '3m': 'minute3',
        '5m': 'minute5',
        '10m': 'minute10',
        '15m': 'minute15',
        '30m': 'minute30',
        '60m': 'minute60',
        '1h': 'minute60',
        '240m': 'minute240',
        '4h': 'minute240',
        '1d': 'day',
        '1day': 'day',
        '1w': 'week',
        '1week': 'week'
    }
    return mapping.get(tf, 'minute1')


def _fetch_ohlcv_cached(market: str, interval: str, count: int = 20):
    """pyupbit OHLCV를 캐시와 함께 조회"""
    cache_key = f"{market}_{interval}_{count}"
    now = time.time()

    cached = _ohlcv_cache.get(cache_key)
    if cached and (now - cached['timestamp']) < _ohlcv_cache_ttl:
        return cached['data']

    df = pyupbit.get_ohlcv(market, interval=interval, count=count)
    if df is not None:
        _ohlcv_cache[cache_key] = {'data': df, 'timestamp': now}
    return df


def _calculate_market_volume_metrics(timeframe: str, market: str = "KRW-BTC", count: int = 20) -> dict:
    """업비트 OHLCV로 거래량/거래대금 합계를 계산"""
    interval = _map_timeframe_to_interval(timeframe)
    try:
        df = _fetch_ohlcv_cached(market, interval, count)
        if df is None or df.empty:
            return {
                'interval': interval,
                'count': count,
                'volume': 0.0,
                'trade_value': 0.0,
                'source': 'upbit'
            }

        volume_sum = float(df['volume'].sum()) if 'volume' in df else 0.0
        if 'value' in df:
            value_sum = float(df['value'].sum())
        elif 'close' in df and 'volume' in df:
            value_sum = float((df['close'] * df['volume']).sum())
        else:
            value_sum = 0.0

        return {
            'interval': interval,
            'count': count,
            'volume': volume_sum,
            'trade_value': value_sum,
            'source': 'upbit'
        }
    except Exception as e:
        print(f"⚠️ 거래량 계산 실패: interval={interval}, count={count}, error={e}")
        return {
            'interval': interval,
            'count': count,
            'volume': 0.0,
            'trade_value': 0.0,
            'source': 'upbit'
        }


def _resolve_entry_and_qty(card: dict, current_price: float) -> tuple[float, float]:
    """카드 히스토리 기반으로 진입가와 수량을 계산"""
    entry_price = 0.0
    qty = 0.0

    history_list = card.get('history_list', []) if card else []
    for hist in reversed(history_list):
        if hist.get('type') in ['NEW', 'BUY']:
            entry_price = hist.get('entry_price', 0) or hist.get('price', 0) or hist.get('buy_price', 0)
            qty = hist.get('qty', 0) or hist.get('quantity', 0) or hist.get('amount', 0)
            if entry_price > 0 and qty > 0:
                break

    if entry_price <= 0:
        production_price = card.get('production_price', 0)
        if production_price and production_price > 0:
            entry_price = production_price

    if entry_price <= 0:
        entry_price = current_price

    if qty <= 0 and entry_price > 0:
        min_buy_amount = settings_manager.get('min_buy_amount', 5000) if settings_manager else 5000
        qty = min_buy_amount / entry_price if entry_price > 0 else 0

    return float(entry_price or 0.0), float(qty or 0.0)

# 가격 캐시 (Flask 전용)
_price_cache_value = 0.0
_price_cache_time = 0.0
_price_call_times = []  # 최근 호출 시각(초) 목록

def init_app():
    """애플리케이션 초기화"""
    global nbverse_storage, nbverse_converter, settings_manager
    global production_card_manager, discarded_card_manager, upbit, cfg
    global _price_cache_value, _price_cache_time, _price_call_times
    try:
        # 설정 관리자
        settings_manager = SettingsManager()
        
        # NBVerse 초기화
        nb_decimal_places = settings_manager.get("nb_decimal_places", 10)
        
        # API 서버는 html_version/api/에서 실행되므로, 상위 디렉토리(v0.0.0.4)의 data/nbverse를 사용
        # 현재 파일 위치: html_version/api/app.py
        # 목표 위치: v0.0.0.4/data/nbverse
        current_file_dir = os.path.dirname(os.path.abspath(__file__))  # html_version/api
        parent_dir = os.path.dirname(os.path.dirname(current_file_dir))  # v0.0.0.4
        data_dir = os.path.join(parent_dir, "data", "nbverse")
        
        print(f"📁 NBVerse 데이터 디렉토리: {data_dir}")
        os.makedirs(data_dir, exist_ok=True)
        
        # 하위 폴더도 생성 (max, min, cards)
        os.makedirs(os.path.join(data_dir, "max"), exist_ok=True)
        os.makedirs(os.path.join(data_dir, "min"), exist_ok=True)
        cards_dir = os.path.join(data_dir, "cards")
        os.makedirs(cards_dir, exist_ok=True)
        
        print(f"✅ NBVerse 데이터 디렉토리 생성 완료: {data_dir}")
        print(f"✅ 카드 저장 디렉토리 생성 완료: {cards_dir}")
        
        nbverse_storage, nbverse_converter = init_nbverse_storage(
            data_dir=data_dir,
            decimal_places=nb_decimal_places
        )
        
        if not nbverse_storage or not nbverse_converter:
            raise RuntimeError("NBVerse 초기화에 실패했습니다.")
        
        # 카드 관리자 초기화
        discarded_card_manager = DiscardedCardManager()
        production_card_manager = ProductionCardManager(
            nbverse_storage=nbverse_storage,
            discarded_card_manager=discarded_card_manager
        )
        
        # Upbit API 초기화
        try:
            # env.local 파일 경로 확인 (상위 디렉토리 또는 현재 디렉토리)
            env_local_paths = [
                os.path.join(parent_dir, "env.local"),  # v0.0.0.4/env.local
                os.path.join(os.path.dirname(current_file_dir), "env.local"),  # html_version/env.local
                os.path.join(current_file_dir, "env.local")  # html_version/api/env.local
            ]
            
            env_local_path = None
            for path in env_local_paths:
                if os.path.exists(path):
                    env_local_path = path
                    print(f"📄 env.local 파일 발견: {env_local_path}")
                    break
            
            # env.local 파일이 있으면 환경 변수로 로드
            if env_local_path:
                with open(env_local_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            os.environ[key.strip()] = value.strip()
            
            cfg = load_config()
            if cfg.access_key and cfg.secret_key and cfg.secret_key != "여기SECRET_KEY_입력":
                upbit = pyupbit.Upbit(cfg.access_key, cfg.secret_key)
                print("✅ Upbit API 연결 성공")
            else:
                print("⚠️ Upbit API 키가 설정되지 않았습니다.")
        except Exception as e:
            print(f"⚠️ Upbit API 초기화 실패: {e}")
            import traceback
            traceback.print_exc()
        
        # 강화학습 AI 시스템 제거됨
        
        print("✅ 백엔드 API 서버 초기화 완료")
        # 저장된 예측 모델 로드
        try:
            load_saved_models()
        except Exception:
            pass
    except Exception as e:
        print(f"❌ 백엔드 API 서버 초기화 실패: {e}")
        import traceback
        traceback.print_exc()
        raise

# 루트 경로: index.html 서빙
@app.route('/')
def index():
    """메인 HTML 페이지"""
    html_version_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return send_from_directory(html_version_dir, 'index.html')

# 정적 파일 서빙 (CSS, JS 등)
@app.route('/<path:filename>')
def static_files(filename):
    """정적 파일 서빙 (CSS, JS, 이미지 등)"""
    html_version_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    # 보안: 상위 디렉토리 접근 방지
    if '..' in filename or filename.startswith('/'):
        return jsonify({'error': 'Invalid path'}), 400
    try:
        return send_from_directory(html_version_dir, filename)
    except Exception as e:
        return jsonify({'error': f'File not found: {filename}'}), 404

# 가격 정보 API
@app.route('/api/price', methods=['GET'])
def get_price():
    """BTC 현재 가격 조회"""
    try:
        price = _get_btc_price_cached()
        return jsonify({
            'price': price,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 잔고 정보 API
@app.route('/api/balance', methods=['GET'])
def get_balance():
    """잔고 정보 조회"""
    try:
        if not upbit:
            return jsonify({
                'krw': 0,
                'btc': 0,
                'total': 0,
                'error': 'Upbit API가 연결되지 않았습니다.'
            })
        
        balances = upbit.get_balances()
        krw = 0
        btc = 0
        all_assets = []  # 모든 자산 정보
        
        # BTC 가격 가져오기 (캐시/레이트리밋 적용)
        btc_price = _get_btc_price_cached()
        
        for balance in balances:
            currency = balance.get('currency', '')
            balance_amount = float(balance.get('balance', 0))
            locked = float(balance.get('locked', 0))  # 주문 중인 금액
            available = balance_amount - locked  # 사용 가능한 금액
            
            if currency == 'KRW':
                krw = balance_amount
                all_assets.append({
                    'currency': currency,
                    'balance': balance_amount,
                    'available': available,
                    'locked': locked,
                    'krw_value': balance_amount
                })
            elif currency == 'BTC':
                btc = balance_amount
                krw_value = balance_amount * btc_price
                all_assets.append({
                    'currency': currency,
                    'balance': balance_amount,
                    'available': available,
                    'locked': locked,
                    'krw_value': krw_value
                })
            else:
                # 다른 코인도 포함 (KRW-BTC 기준으로 가격 조회)
                try:
                    ticker = f"KRW-{currency}"
                    coin_price = pyupbit.get_current_price(ticker)
                    if coin_price:
                        krw_value = balance_amount * coin_price
                        all_assets.append({
                            'currency': currency,
                            'balance': balance_amount,
                            'available': available,
                            'locked': locked,
                            'krw_value': krw_value,
                            'price': coin_price
                        })
                except:
                    # 가격 조회 실패 시 제외
                    pass
        
        # 총 자산 계산
        total = krw + sum(asset.get('krw_value', 0) for asset in all_assets if asset.get('currency') != 'KRW')
        
        return jsonify({
            'krw': krw,
            'btc': btc,
            'total': total,
            'all_assets': all_assets,  # 모든 자산 정보
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 차트 데이터 API
@app.route('/api/chart', methods=['GET'])
def get_chart():
    """차트 데이터 조회"""
    try:
        timeframe = request.args.get('timeframe', '1m')
        count = int(request.args.get('count', 200))

        # pyupbit interval 매핑 (UI 분봉 → pyupbit interval)
        interval_map = {
            '1m': 'minute1',
            '3m': 'minute3',
            '5m': 'minute5',
            '15m': 'minute15',
            '30m': 'minute30',
            '60m': 'minute60',
            '240m': 'minute240',
            '1d': 'day',
            '1w': 'week',
            '1mo': 'month'
        }
        pyupbit_interval = interval_map.get(timeframe, 'minute1')
        
        print(f"📊 차트 데이터 요청: timeframe={timeframe}, mapped_interval={pyupbit_interval}, count={count}")
        
        df = pyupbit.get_ohlcv("KRW-BTC", interval=pyupbit_interval, count=count)
        if df is None or df.empty:
            print(f"❌ [{timeframe}] 차트 데이터를 가져올 수 없습니다.")
            return jsonify({'error': '차트 데이터를 가져올 수 없습니다.'}), 500
        
        prices = df['close'].tolist()
        current_price = prices[-1] if prices else 0
        
        print(f"✅ [{timeframe}] 차트 데이터 반환: {len(prices)}개 가격, 현재가={current_price:,.0f} KRW")
        print(f"   가격 범위: 최저={min(prices):,.0f} KRW, 최고={max(prices):,.0f} KRW")
        print(f"   첫 가격: {prices[0]:,.0f} KRW, 마지막 가격: {prices[-1]:,.0f} KRW")
        
        return jsonify({
            'prices': prices,
            'timeframe': timeframe,
            'mapped_interval': pyupbit_interval,
            'current_price': current_price,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        print(f"❌ 차트 데이터 조회 오류: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# OHLCV 차트 데이터 API (차트 분석용) - 캐싱 최적화
@app.route('/api/ohlcv', methods=['GET'])
def get_ohlcv():
    """OHLCV 차트 데이터 조회 (차트 분석 시스템용) - 캐시 적용"""
    try:
        start_time = time.time()
        market = request.args.get('market', 'KRW-BTC')
        interval = request.args.get('interval', 'minute10')
        
        # count 파라미터 검증
        try:
            count = int(request.args.get('count', 200))
            if count <= 0 or count > 1000:
                count = 200  # 기본값으로 설정
        except (ValueError, TypeError):
            count = 200
        
        # interval 파라미터 검증 및 매핑
        valid_intervals = ['minute1', 'minute3', 'minute5', 'minute10', 'minute15', 'minute30', 'minute60', 'hour', 'day']
        if interval not in valid_intervals:
            # interval 매핑 시도
            interval_map = {
                'minute1': 'minute1',
                'minute3': 'minute3',
                'minute5': 'minute5',
                'minute10': 'minute10',
                'minute15': 'minute15',
                'minute30': 'minute30',
                'minute60': 'minute60',
                'hour': 'minute60',
                'day': 'day'
            }
            mapped_interval = interval_map.get(interval, 'minute10')
            if mapped_interval != interval:
                print(f"⚠️ interval 매핑: {interval} → {mapped_interval}")
                interval = mapped_interval
            else:
                print(f"⚠️ 잘못된 interval 파라미터: {interval}, 기본값 'minute10' 사용")
                interval = 'minute10'
        
        # 캐시 키 생성
        cache_key = f"{market}_{interval}_{count}"
        current_time = time.time()
        
        # 캐시 확인
        if cache_key in _ohlcv_cache:
            cached_data = _ohlcv_cache[cache_key]
            cache_age = current_time - cached_data['timestamp']
            if cache_age < _ohlcv_cache_ttl:
                return jsonify({
                    'ok': True,
                    'data': cached_data['data'],
                    'market': market,
                    'interval': interval,
                    'count': len(cached_data['data']),
                    'cached': True
                })
        
        # pyupbit API 호출 (빠른 실행)
        df = None
        try:
            df = pyupbit.get_ohlcv(market, interval=interval, count=count)
            if df is None or df.empty:
                # 한 번만 재시도
                time.sleep(0.05)
                df = pyupbit.get_ohlcv(market, interval=interval, count=count)
        except Exception as e:
            return jsonify({'error': str(e), 'ok': False}), 500
        
        if df is None or df.empty:
            return jsonify({'error': 'No data', 'ok': False}), 500
        
        # DataFrame을 리스트로 변환 (최적화)
        try:
            data = [
                {
                    'time': idx.isoformat() if hasattr(idx, 'isoformat') else str(idx),
                    'open': float(row.get('open', 0) or 0),
                    'high': float(row.get('high', 0) or 0),
                    'low': float(row.get('low', 0) or 0),
                    'close': float(row.get('close', 0) or 0),
                    'volume': float(row.get('volume', 0) or 0)
                }
                for idx, row in df.iterrows()
            ]
        except Exception as e:
            return jsonify({'error': str(e), 'ok': False}), 500
        
        if not data:
            return jsonify({'error': 'No data converted', 'ok': False}), 500
        
        # 캐시에 저장
        _ohlcv_cache[cache_key] = {'data': data, 'timestamp': current_time}
        
        # 캐시 정리 (비동기적으로)
        if len(_ohlcv_cache) > 300:
            expired_keys = [k for k, v in _ohlcv_cache.items() if current_time - v['timestamp'] > _ohlcv_cache_ttl]
            for k in expired_keys[:50]:  # 한 번에 최대 50개만 제거
                del _ohlcv_cache[k]
        
        return jsonify({
            'ok': True,
            'data': data,
            'market': market,
            'interval': interval,
            'count': len(data),
            'cached': False
        })
    except ValueError as ve:
        print(f"❌ OHLCV 파라미터 오류: {ve}")
        return jsonify({
            'error': f'파라미터 오류: {str(ve)}',
            'ok': False
        }), 400
    except Exception as e:
        print(f"❌ OHLCV 데이터 조회 오류: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': f'서버 오류: {str(e)}',
            'ok': False
        }), 500

# 캐시 통계 및 관리 API
@app.route('/api/cache/stats', methods=['GET'])
def get_cache_stats():
    """OHLCV 캐시 통계 조회"""
    try:
        current_time = time.time()
        cache_items = []
        
        for key, value in _ohlcv_cache.items():
            age = current_time - value['timestamp']
            is_expired = age > _ohlcv_cache_ttl
            
            cache_items.append({
                'key': key,
                'age_seconds': round(age, 2),
                'data_count': len(value['data']),
                'expired': is_expired
            })
        
        return jsonify({
            'ok': True,
            'total_cached_items': len(_ohlcv_cache),
            'cache_ttl_seconds': _ohlcv_cache_ttl,
            'items': cache_items
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'ok': False
        }), 500


@app.route('/api/cache/clear', methods=['POST'])
def clear_cache():
    """OHLCV 캐시 초기화"""
    try:
        cache_size = len(_ohlcv_cache)
        _ohlcv_cache.clear()
        print(f"🧹 캐시 초기화 완료: {cache_size}개 항목 삭제")
        
        return jsonify({
            'ok': True,
            'message': f'{cache_size}개 캐시 항목 삭제 완료'
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'ok': False
        }), 500

# N/B 값 계산 API
@app.route('/api/nb/calculate', methods=['POST'])
def calculate_nb():
    """N/B 값 계산"""
    try:
        data = request.json
        chart_data = data.get('chart_data')
        prices = data.get('prices')
        
        if not prices and chart_data:
            prices = chart_data.get('prices')
        
        if not prices or len(prices) < 2:
            return jsonify({'error': '가격 데이터가 부족합니다.'}), 400
        
        # NBVerse를 사용하여 N/B 값 계산
        if nbverse_storage and nbverse_converter:
            chart_data_dict = {
                'prices': prices,
                'timeframe': chart_data.get('timeframe', '1m') if chart_data else '1m',
                'current_price': prices[-1] if prices else 0
            }
            
            nb_value = calculate_nb_value_from_chart(
                chart_data_dict,
                nbverse_storage=nbverse_storage,
                nbverse_converter=nbverse_converter,
                settings_manager=settings_manager
            )
            
            # bitMax, bitMin 계산
            prices_str = ",".join([str(p) for p in prices[-200:]])
            result = nbverse_converter.text_to_nb(prices_str)
            bit_max = result.get('bitMax', 5.5)
            bit_min = result.get('bitMin', 5.5)
            
            # nb_max, nb_min 계산 (0~1 범위로 정규화)
            nb_max = max(0.0, min(1.0, bit_max / 10.0))
            nb_min = max(0.0, min(1.0, bit_min / 10.0))
            
            return jsonify({
                'nb_value': nb_value,
                'nb_max': nb_max,
                'nb_min': nb_min,
                'bit_max': bit_max,
                'bit_min': bit_min,
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({'error': 'NBVerse가 초기화되지 않았습니다.'}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# N/B 값 저장 API
@app.route('/api/nb/save', methods=['POST'])
def save_nb():
    """N/B 값 저장"""
    try:
        data = request.json
        nb_value = data.get('nb_value')
        nb_max = data.get('nb_max')
        nb_min = data.get('nb_min')
        metadata = data.get('metadata', {})
        
        if nb_value is None:
            return jsonify({'error': 'N/B 값이 필요합니다.'}), 400
        
        if not nbverse_storage:
            return jsonify({'error': 'NBVerse가 초기화되지 않았습니다.'}), 500
        
        # NBVerse에 저장
        prices_str = metadata.get('prices_str', '')
        if not prices_str:
            # metadata에서 가격 정보 가져오기
            prices = metadata.get('prices', [])
            if prices:
                prices_str = ",".join([str(p) for p in prices])
        
        if prices_str:
            nbverse_storage.save_text(
                prices_str,
                metadata={
                    **metadata,
                    'nb_value': nb_value,
                    'nb_max': nb_max,
                    'nb_min': nb_min,
                    'bit_max': nb_max * 10 if nb_max else 5.5,
                    'bit_min': nb_min * 10 if nb_min else 5.5,
                    'timestamp': datetime.now().isoformat()
                }
            )
        
        return jsonify({
            'success': True,
            'nb_id': f"nb_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# N/B 값 조회 API
@app.route('/api/nb/<nb_value>', methods=['GET'])
def get_nb(nb_value):
    """N/B 값 조회"""
    try:
        nb_value = float(nb_value)
        
        if not nbverse_storage:
            return jsonify({'error': 'NBVerse가 초기화되지 않았습니다.'}), 500
        
        # NBVerse에서 조회 (간단한 구현)
        # 실제로는 경로 기반 검색이 필요할 수 있음
        return jsonify({
            'nb_value': nb_value,
            'found': False,
            'message': 'N/B 값 조회는 NBVerse 경로 검색이 필요합니다.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 활성 카드 목록 API (보유 중 탭용)
@app.route('/api/cards/active', methods=['GET'])
def get_active_cards():
    """활성 카드 목록 조회 (ACTIVE, OVERLAP_ACTIVE 상태만)"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        from managers.production_card_manager import CardState
        
        cards = production_card_manager.get_all_cards()
        
        # 활성 카드만 필터링 (ACTIVE, OVERLAP_ACTIVE)
        active_cards = []
        for card in cards:
            card_state = card.get('card_state')
            if card_state in [CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value]:
                # 검증 완료된 카드 제외 (SOLD 히스토리가 있는 카드)
                history_list = card.get('history_list', [])
                has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
                if not has_sold:
                    # N/B 값 검증
                    if not card.get('nb_value') and not card.get('nb_max') and not card.get('nb_min'):
                        card['nb_value'] = 0.5
                        card['nb_max'] = 5.5
                        card['nb_min'] = 5.5
                    active_cards.append(card)
        
        return jsonify({
            'cards': active_cards,
            'count': len(active_cards),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 생산 카드 목록 API
@app.route('/api/cards/production', methods=['GET'])
def get_production_cards():
    """생산 카드 목록 조회"""
    try:
        if not production_card_manager:
            print("❌ 카드 관리자가 초기화되지 않았습니다.")
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        cards = production_card_manager.get_all_cards()
        print(f"📋 전체 카드 수: {len(cards) if cards else 0}개")
        
        # N/B 값 검증 및 검증 완료 카드 필터링 (SOLD 히스토리가 있는 카드는 제외)
        validated_cards = []
        sold_count = 0
        for card in cards:
            if not card.get('nb_value') and not card.get('nb_max') and not card.get('nb_min'):
                # 기본값 설정
                card['nb_value'] = 0.5
                card['nb_max'] = 5.5
                card['nb_min'] = 5.5
            
            # 검증 완료된 카드 (SOLD 히스토리가 있는 카드)는 생산 카드에서 제외
            history_list = card.get('history_list', [])
            has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
            
            # SOLD 히스토리가 없는 카드만 포함
            if not has_sold:
                validated_cards.append(card)
            else:
                sold_count += 1
        
        print(f"✅ 검증된 카드 수: {len(validated_cards)}개 (SOLD 제외: {sold_count}개)")
        
        return jsonify({
            'cards': validated_cards,
            'count': len(validated_cards),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ 생산 카드 목록 조회 오류: {e}")
        return jsonify({'error': str(e)}), 500

# 카드 생산 API
@app.route('/api/cards/produce', methods=['POST'])
def produce_card():
    """카드 생산"""
    try:
        print("📝 카드 생산 요청 수신")
        data = request.json
        chart_data = data.get('chart_data')
        
        if not production_card_manager:
            print("❌ 카드 관리자가 초기화되지 않았습니다.")
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        # 생산 카드 제한 체크 및 가장 오래된 카드 자동 제거
        from managers.settings_manager import SettingsManager
        settings_manager = SettingsManager()
        production_card_limit = settings_manager.get('production_card_limit', 0)
        
        if production_card_limit > 0:
            active_cards = production_card_manager.get_active_cards()
            current_card_count = len(active_cards) if active_cards else 0
            
            if current_card_count >= production_card_limit:
                # 제거 가능한 카드 찾기 (매도 완료된 카드만 제거 가능)
                # 예측 성공 여부와 관계없이 매도 완료된 카드는 제거 가능
                removable_cards = []
                for card in active_cards:
                    history_list = card.get('history_list', [])
                    has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
                    
                    # 매도 완료된 카드만 제거 가능 (예측 성공 여부와 관계없이)
                    if has_sold:
                        removable_cards.append(card)
                
                if removable_cards:
                    # 생성 시간 기준으로 정렬하여 가장 오래된 카드 찾기
                    sorted_removable_cards = sorted(
                        removable_cards,
                        key=lambda c: c.get('created_at', c.get('production_time', ''))
                    )
                    
                    oldest_card = sorted_removable_cards[0]
                    oldest_card_id = oldest_card.get('card_id', 'unknown')
                    oldest_card_time = oldest_card.get('created_at', oldest_card.get('production_time', 'N/A'))
                    
                    # 매도 완료 여부 확인
                    history_list = oldest_card.get('history_list', [])
                    has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
                    prediction_verified = oldest_card.get('prediction_verified', False)
                    zone_correct = oldest_card.get('zone_prediction_correct', False)
                    price_correct = oldest_card.get('price_prediction_correct', False)
                    is_verified = prediction_verified and (zone_correct or price_correct)
                    reason = '매도 완료 + 대가 판정' if (has_sold and is_verified) else '매도 완료'
                    
                    print(f"⚠️ 생산 카드 제한 도달 ({current_card_count}/{production_card_limit}), 가장 오래된 카드 제거 중: {oldest_card_id} ({reason})")
                    print(f"🗑️ 가장 오래된 카드 제거: {oldest_card_id} (생성 시간: {oldest_card_time})")
                    
                    # 카드 제거
                    removed = production_card_manager.remove_card(oldest_card_id)
                    if removed:
                        print(f"✅ 가장 오래된 카드 제거 완료: {oldest_card_id}")
                        # 제거 후 카드 수 다시 확인
                        active_cards = production_card_manager.get_active_cards()
                        current_card_count = len(active_cards) if active_cards else 0
                        print(f"✅ 생산 카드 제한 확인 (제거 후): {current_card_count}/{production_card_limit}")
                    else:
                        error_msg = f'생산 카드 제한에 도달했고 가장 오래된 카드 제거에 실패했습니다. (현재: {current_card_count}/{production_card_limit})'
                        print(f"❌ {error_msg}")
                        return jsonify({
                            'error': error_msg,
                            'current_count': current_card_count,
                            'limit': production_card_limit
                        }), 400
                else:
                    error_msg = f'생산 카드 제한에 도달했지만 제거 가능한 카드가 없습니다. (현재: {current_card_count}/{production_card_limit}, 매도 완료된 카드가 필요합니다.)'
                    print(f"❌ {error_msg}")
                    return jsonify({
                        'error': error_msg,
                        'current_count': current_card_count,
                        'limit': production_card_limit
                    }), 400
            else:
                print(f"✅ 생산 카드 제한 확인: {current_card_count}/{production_card_limit}")
        
        print("📊 차트 데이터 확인 중...")
        # 차트 데이터가 없으면 가져오기
        production_candle_data = None  # 생산 시점 분봉 데이터
        if not chart_data:
            print("📊 차트 데이터 가져오기 중...")
            timeframe = '1m'
            df = pyupbit.get_ohlcv("KRW-BTC", interval=timeframe, count=200)
            if df is None or df.empty:
                print("❌ 차트 데이터를 가져올 수 없습니다.")
                return jsonify({'error': '차트 데이터를 가져올 수 없습니다.'}), 500
            
            prices = df['close'].tolist()
            
            # 생산 시점의 분봉 데이터 저장 (마지막 캔들)
            last_candle = df.iloc[-1]
            production_candle_data = {
                'time': df.index[-1].isoformat() if hasattr(df.index[-1], 'isoformat') else str(df.index[-1]),
                'open': float(last_candle['open']),
                'high': float(last_candle['high']),
                'low': float(last_candle['low']),
                'close': float(last_candle['close']),
                'volume': float(last_candle['volume']) if 'volume' in last_candle else 0.0
            }
            
            chart_data = {
                'prices': prices,
                'timeframe': timeframe,
                'current_price': prices[-1] if prices else 0,
                'production_candle': production_candle_data  # 생산 시점 분봉 데이터 추가
            }
            print(f"✅ 차트 데이터 가져오기 완료: {len(prices)}개 가격")
            print(f"📊 생산 시점 분봉 데이터 저장: {production_candle_data}")
        elif chart_data and not chart_data.get('production_candle'):
            # chart_data가 있지만 production_candle이 없는 경우, 현재 분봉 데이터 가져오기
            try:
                timeframe = chart_data.get('timeframe', '1m')
                interval_map = {
                    '1m': 'minute1', '3m': 'minute3', '5m': 'minute5',
                    '15m': 'minute15', '30m': 'minute30', '60m': 'minute60',
                    '240m': 'minute240', '1d': 'day', '1w': 'week', '1mo': 'month'
                }
                pyupbit_interval = interval_map.get(timeframe, 'minute1')
                df = pyupbit.get_ohlcv("KRW-BTC", interval=pyupbit_interval, count=1)
                if df is not None and not df.empty:
                    last_candle = df.iloc[-1]
                    production_candle_data = {
                        'time': df.index[-1].isoformat() if hasattr(df.index[-1], 'isoformat') else str(df.index[-1]),
                        'open': float(last_candle['open']),
                        'high': float(last_candle['high']),
                        'low': float(last_candle['low']),
                        'close': float(last_candle['close']),
                        'volume': float(last_candle['volume']) if 'volume' in last_candle else 0.0
                    }
                    chart_data['production_candle'] = production_candle_data
                    print(f"📊 생산 시점 분봉 데이터 추가: {production_candle_data}")
            except Exception as e:
                print(f"⚠️ 생산 시점 분봉 데이터 가져오기 실패: {e}")
        
        import time
        nb_calc_start_time = time.time()
        
        # 클라이언트에서 이미 계산된 N/B 값이 있는지 확인
        nb_result = None
        nb_max = None
        nb_min = None
        bit_max = None
        bit_min = None
        
        if chart_data.get('nb_value') is not None:
            # 클라이언트에서 계산된 N/B 값 사용
            print("✅ 클라이언트에서 계산된 N/B 값 사용 (재계산 생략)")
            nb_result = float(chart_data.get('nb_value'))
            nb_max = float(chart_data.get('nb_max', 5.5 / 10.0))
            nb_min = float(chart_data.get('nb_min', 5.5 / 10.0))
            bit_max = float(chart_data.get('bit_max', 5.5))
            bit_min = float(chart_data.get('bit_min', 5.5))
            
            # nb_max, nb_min이 정규화되지 않은 경우 정규화
            if nb_max > 1.0:
                nb_max = max(0.0, min(1.0, nb_max / 10.0))
            if nb_min > 1.0:
                nb_min = max(0.0, min(1.0, nb_min / 10.0))
            
            nb_calc_duration = time.time() - nb_calc_start_time
            print(f"✅ N/B 값 사용 완료: {nb_result} (소요 시간: {nb_calc_duration:.2f}초, 재계산 생략)")
        else:
            # 서버에서 N/B 값 계산 (기존 로직)
            print("🔢 N/B 값 계산 중... (이 작업은 시간이 오래 걸릴 수 있습니다)")
            
            # N/B 값 계산 (필수)
            if not nbverse_storage or not nbverse_converter:
                print("❌ NBVerse가 초기화되지 않았습니다.")
                return jsonify({'error': 'NBVerse가 초기화되지 않았습니다.'}), 500
            
            try:
                # N/B 값 계산 (시간이 오래 걸릴 수 있음)
                print("   → calculate_nb_value_from_chart 함수 실행 중...")
                nb_result = calculate_nb_value_from_chart(
                    chart_data,
                    nbverse_storage=nbverse_storage,
                    nbverse_converter=nbverse_converter,
                    settings_manager=settings_manager
                )
                nb_calc_duration = time.time() - nb_calc_start_time
                print(f"✅ N/B 값 계산 완료: {nb_result} (소요 시간: {nb_calc_duration:.2f}초)")
            except Exception as e:
                nb_calc_duration = time.time() - nb_calc_start_time
                print(f"❌ N/B 값 계산 실패 (소요 시간: {nb_calc_duration:.2f}초): {e}")
                import traceback
                traceback.print_exc()
                return jsonify({'error': f'N/B 값 계산 실패: {str(e)}'}), 500
            
            # bitMax, bitMin 계산
            print("🔢 bitMax, bitMin 계산 중...")
            bit_calc_start_time = time.time()
            try:
                prices_str = ",".join([str(p) for p in chart_data['prices'][-200:]])
                print(f"   → text_to_nb 함수 실행 중... (가격 데이터: {len(chart_data['prices'])}개)")
                result = nbverse_converter.text_to_nb(prices_str)
                bit_max = result.get('bitMax', 5.5)
                bit_min = result.get('bitMin', 5.5)
                bit_calc_duration = time.time() - bit_calc_start_time
                print(f"✅ bitMax: {bit_max}, bitMin: {bit_min} (소요 시간: {bit_calc_duration:.2f}초)")
            except Exception as e:
                bit_calc_duration = time.time() - bit_calc_start_time
                print(f"⚠️ bitMax/bitMin 계산 실패 (소요 시간: {bit_calc_duration:.2f}초), 기본값 사용: {e}")
                bit_max = 5.5
                bit_min = 5.5
            
            # nb_max, nb_min 계산
            nb_max = max(0.0, min(1.0, bit_max / 10.0))
            nb_min = max(0.0, min(1.0, bit_min / 10.0))
        
        # 카드 데이터 생성
        print("📝 카드 데이터 생성 중...")
        timeframe = chart_data.get('timeframe', '1m')
        
        # 소수점 자리수 가져오기
        decimal_places = settings_manager.get("nb_decimal_places", 10) if settings_manager else 10
        
        # 카드 생성 (add_card는 개별 파라미터를 받음)
        print("💾 카드 저장 중...")
        card_save_start_time = time.time()
        print(f"  - timeframe: {timeframe}")
        print(f"  - nb_value: {nb_result}")
        print(f"  - nb_max: {nb_max}")
        print(f"  - nb_min: {nb_min}")
        print(f"  - decimal_places: {decimal_places}")
        
        print("   → production_card_manager.add_card 함수 실행 중...")
        try:
            card = production_card_manager.add_card(
                timeframe=timeframe,
                nb_value=nb_result,
                nb_max=nb_max,
                nb_min=nb_min,
                card_type='normal',
                chart_data=chart_data,
                decimal_places=decimal_places
            )
        except Exception as e:
            card_save_duration = time.time() - card_save_start_time
            print(f"❌ 카드 저장 중 오류 발생 (소요 시간: {card_save_duration:.2f}초): {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': f'카드 저장 중 오류가 발생했습니다: {str(e)}',
                'traceback': traceback.format_exc()
            }), 500
        
        card_save_duration = time.time() - card_save_start_time
        print(f"   → 카드 저장 완료 (소요 시간: {card_save_duration:.2f}초)")
        
        # Zone 예측 및 검증 로직
        try:
            # 1. 이전 카드의 Zone 예측 검증
            all_cards = production_card_manager.get_all_cards()
            if all_cards and len(all_cards) > 1:
                # 생성 시간 기준으로 정렬하여 가장 최근 이전 카드 찾기
                sorted_cards = sorted(all_cards, key=lambda c: c.get('created_at', ''), reverse=True)
                current_card_index = next((i for i, c in enumerate(sorted_cards) if c.get('card_id') == card.get('card_id')), -1)
                
                if current_card_index > 0:
                    # 이전 카드 찾기
                    previous_card = sorted_cards[current_card_index - 1]
                    
                    # 이전 카드에 예측이 있으면 검증
                    if previous_card.get('predicted_next_zone'):
                        print(f"🔍 이전 카드의 예측 검증 중... (이전 카드: {previous_card.get('card_id')})")
                        verification_result = _verify_prediction(previous_card, card, chart_data)
                        
                        if verification_result.get('verified'):
                            # 검증 결과를 이전 카드에 저장
                            previous_card['prediction_verified'] = True
                            previous_card['zone_prediction_correct'] = verification_result.get('zone_correct', False)
                            previous_card['price_prediction_correct'] = verification_result.get('price_correct', False)
                            previous_card['prediction_actual_zone'] = verification_result.get('actual_zone')
                            previous_card['prediction_actual_price'] = verification_result.get('actual_price', 0.0)
                            previous_card['prediction_price_error_percent'] = verification_result.get('price_error_percent', 0.0)
                            previous_card['prediction_verification_time'] = verification_result.get('verification_time')
                            
                            # 이전 카드 업데이트
                            production_card_manager.update_card(
                                previous_card.get('card_id'),
                                {
                                    'prediction_verified': True,
                                    'zone_prediction_correct': verification_result.get('zone_correct', False),
                                    'price_prediction_correct': verification_result.get('price_correct', False),
                                    'prediction_actual_zone': verification_result.get('actual_zone'),
                                    'prediction_actual_price': verification_result.get('actual_price', 0.0),
                                    'prediction_price_error_percent': verification_result.get('price_error_percent', 0.0),
                                    'prediction_verification_time': verification_result.get('verification_time')
                                }
                            )
                            
                            zone_str = "✅ 정확" if verification_result.get('zone_correct') else "❌ 실패"
                            price_str = "✅ 정확" if verification_result.get('price_correct') else "❌ 실패"
                            print(f"   Zone 예측: {zone_str} (예측={verification_result.get('predicted_zone')}, 실제={verification_result.get('actual_zone')})")
                            if verification_result.get('predicted_price', 0) > 0:
                                print(f"   가격 예측: {price_str} (예측={verification_result.get('predicted_price', 0):,.0f}, 실제={verification_result.get('actual_price', 0):,.0f}, 오차={verification_result.get('price_error_percent', 0):.2f}%)")
            
            # 2. 현재 카드의 다음 Zone 및 가격 예측
            print(f"🔮 다음 카드의 Zone 및 가격 예측 중... (현재 카드: {card.get('card_id')})")
            prediction_result = _predict_next_card(card, chart_data)
            
            # 예측 정보를 현재 카드에 저장
            card['predicted_next_zone'] = prediction_result.get('predicted_zone')
            card['predicted_next_price'] = prediction_result.get('predicted_price', 0.0)
            card['predicted_next_price_change_percent'] = prediction_result.get('predicted_price_change_percent', 0.0)
            card['prediction_confidence'] = prediction_result.get('prediction_confidence', 0.0)
            card['prediction_reason'] = prediction_result.get('prediction_reason', '')
            card['predicted_r_value'] = prediction_result.get('predicted_r_value', 0.5)
            card['prediction_time'] = datetime.now().isoformat()
            
            # 카드 업데이트
            production_card_manager.update_card(
                card.get('card_id'),
                {
                    'predicted_next_zone': prediction_result.get('predicted_zone'),
                    'predicted_next_price': prediction_result.get('predicted_price', 0.0),
                    'predicted_next_price_change_percent': prediction_result.get('predicted_price_change_percent', 0.0),
                    'prediction_confidence': prediction_result.get('prediction_confidence', 0.0),
                    'prediction_reason': prediction_result.get('prediction_reason', ''),
                    'predicted_r_value': prediction_result.get('predicted_r_value', 0.5),
                    'prediction_time': datetime.now().isoformat()
                }
            )
            
            predicted_zone_emoji = "🔵" if prediction_result.get('predicted_zone') == 'BLUE' else "🟠"
            predicted_price = prediction_result.get('predicted_price', 0.0)
            price_change = prediction_result.get('predicted_price_change_percent', 0.0)
            print(f"   예측 완료: {predicted_zone_emoji} {prediction_result.get('predicted_zone')} (신뢰도: {prediction_result.get('prediction_confidence', 0.0):.1%})")
            if predicted_price > 0:
                print(f"   예상 가격: {predicted_price:,.0f} KRW ({price_change:+.2f}%)")
        except Exception as e:
            print(f"⚠️ Zone 예측/검증 오류 (무시하고 계속): {e}")
            import traceback
            traceback.print_exc()
        
        if not card:
            # card_key 생성하여 중복 확인
            from managers.production_card_manager import ProductionCardManager
            nb_id = production_card_manager._generate_nb_id(timeframe, nb_result, decimal_places)
            card_key = production_card_manager._generate_card_key(timeframe, nb_id)
            
            # 중복 카드 확인 (활성 카드만 체크)
            active_cards = production_card_manager.get_active_cards_by_key(card_key)
            
            # 기존 카드 확인 (모든 상태)
            existing_card = production_card_manager.get_card_by_key(card_key)
            
            error_msg = '카드 생산에 실패했습니다.'
            error_details = []
            
            if active_cards and len(active_cards) > 0:
                # 활성 카드가 있는 경우에만 중복 에러
                card_ids = [c.get('card_id', 'unknown') for c in active_cards]
                error_msg = f'같은 N/B 값을 가진 활성 카드가 이미 존재합니다. (카드 ID: {", ".join(card_ids)})'
                error_details.append(f'활성 카드 수: {len(active_cards)}')
                error_details.append(f'N/B 값: {nb_result:.{decimal_places}f}')
                error_details.append(f'타임프레임: {timeframe}')
                print(f"❌ {error_msg}")
                print(f"   활성 카드 수: {len(active_cards)}")
                print(f"   카드 ID: {', '.join(card_ids)}")
            elif existing_card:
                # 기존 카드가 있지만 활성 상태가 아닌 경우
                card_state = existing_card.get('card_state', 'UNKNOWN')
                error_msg = f'같은 N/B 값을 가진 카드가 이미 존재합니다. (상태: {card_state}, 카드 ID: {existing_card.get("card_id", "unknown")})'
                error_details.append(f'카드 상태: {card_state}')
                error_details.append(f'N/B 값: {nb_result:.{decimal_places}f}')
                error_details.append(f'타임프레임: {timeframe}')
                print(f"❌ {error_msg}")
                print(f"   카드 상태: {card_state}")
                print(f"   카드 ID: {existing_card.get('card_id', 'unknown')}")
            else:
                # 활성 카드가 없으면 생산 실패 (다른 원인)
                error_msg = '카드 생산에 실패했습니다. (원인 불명)'
                error_details.append(f'card_key: {card_key}')
                error_details.append(f'N/B 값: {nb_result:.{decimal_places}f}')
                error_details.append(f'타임프레임: {timeframe}')
                print("❌ 카드 생산에 실패했습니다. (원인 불명)")
                print(f"   card_key: {card_key}")
                print(f"   활성 카드 수: {len(active_cards) if active_cards else 0}")
                print(f"   기존 카드 존재 여부: {existing_card is not None}")
            
            return jsonify({
                'error': error_msg,
                'details': error_details,
                'card_key': card_key,
                'nb_value': nb_result,
                'timeframe': timeframe,
                'has_active_card': len(active_cards) > 0 if active_cards else False,
                'has_existing_card': existing_card is not None,
                'existing_card_state': existing_card.get('card_state') if existing_card else None
            }), 400  # 400 Bad Request (중복 요청)
        
        total_duration = time.time() - nb_calc_start_time
        card_id = card.get('card_id', 'N/A')
        print(f"✅ 카드 생산 완료: {card_id}")
        print(f"   - 타임프레임: {timeframe}")
        print(f"   - N/B 값: {nb_result:.{decimal_places}f}")
        print(f"   - N/B MAX: {nb_max:.{decimal_places}f}")
        print(f"   - N/B MIN: {nb_min:.{decimal_places}f}")
        print(f"   - 카드 타입: {card.get('card_type', 'normal')}")
        print(f"   - 카드 상태: {card.get('card_state', 'ACTIVE')}")
        print(f"   - 총 소요 시간: {total_duration:.2f}초")
        
        return jsonify({
            'card': card,
            'success': True,
            'message': f'카드 생산 완료: {card_id} (소요 시간: {total_duration:.2f}초)',
            'duration': total_duration,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        error_msg = str(e)
        traceback.print_exc()
        print(f"❌ 카드 생산 오류: {error_msg}")
        return jsonify({
            'error': error_msg,
            'traceback': traceback.format_exc()
        }), 500

# 개별 카드 조회 API
@app.route('/api/cards/<card_id>', methods=['GET'])
def get_card(card_id):
    """개별 카드 조회"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
        
        # N/B 값 검증
        if not card.get('nb_value') and not card.get('nb_max') and not card.get('nb_min'):
            card['nb_value'] = 0.5
            card['nb_max'] = 5.5
            card['nb_min'] = 5.5
        
        return jsonify({
            'card': card,
            'success': True,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 카드 업데이트 API
@app.route('/api/cards/<card_id>', methods=['PUT'])
def update_card(card_id):
    """카드 업데이트"""
    try:
        data = request.json
        
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
        
        # 카드 업데이트
        updated_card = {**card, **data}
        production_card_manager.update_card(card_id, updated_card)
        
        return jsonify({
            'card': updated_card,
            'success': True,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 카드 삭제 API
# 카드 DELETE 시작 API (1분 대기 시작)
@app.route('/api/cards/<card_id>/delete/start', methods=['POST'])
def delete_card_start(card_id):
    """카드 DELETE 시작 - 1분 대기 시작"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
        
        # 이미 진행 중인지 확인
        if card_id in delete_progress:
            existing = delete_progress[card_id]
            if existing['status'] in ['waiting', 'processing']:
                return jsonify({
                    'success': True,
                    'status': existing['status'],
                    'progress': existing['progress'],
                    'message': '이미 진행 중인 DELETE 작업이 있습니다.'
                })
        
        # DELETE 진행 상태 초기화
        import time
        delete_progress[card_id] = {
            'status': 'waiting',
            'progress': 0,
            'started_at': time.time(),
            'card_id': card_id
        }
        
        return jsonify({
            'success': True,
            'status': 'waiting',
            'progress': 0,
            'message': 'DELETE 작업이 시작되었습니다. 1분간 대기합니다.'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 카드 DELETE 취소 API
@app.route('/api/cards/<card_id>/delete/cancel', methods=['POST'])
def delete_card_cancel(card_id):
    """카드 DELETE 취소"""
    try:
        if card_id in delete_progress:
            delete_progress[card_id]['status'] = 'cancelled'
            delete_progress[card_id]['progress'] = 0
            return jsonify({
                'success': True,
                'message': 'DELETE 작업이 취소되었습니다.'
            })
        else:
            return jsonify({
                'success': False,
                'message': '진행 중인 DELETE 작업이 없습니다.'
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 카드 DELETE 진행 상태 확인 API
@app.route('/api/cards/<card_id>/delete/status', methods=['GET'])
def delete_card_status(card_id):
    """카드 DELETE 진행 상태 확인"""
    try:
        if card_id not in delete_progress:
            return jsonify({
                'success': False,
                'status': 'not_started',
                'progress': 0
            })
        
        import time
        progress_info = delete_progress[card_id]
        elapsed = time.time() - progress_info['started_at']
        
        # 1분(60초) 대기 후 처리 시작
        if elapsed < 60:
            # 대기 중
            progress = int((elapsed / 60) * 100)
            return jsonify({
                'success': True,
                'status': 'waiting',
                'progress': progress,
                'elapsed': int(elapsed),
                'remaining': int(60 - elapsed)
            })
        else:
            # 처리 중 또는 완료
            if progress_info['status'] == 'waiting':
                progress_info['status'] = 'processing'
                progress_info['progress'] = 50
            
            return jsonify({
                'success': True,
                'status': progress_info['status'],
                'progress': progress_info['progress'],
                'elapsed': int(elapsed)
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cards/<card_id>', methods=['DELETE'])
def delete_card(card_id):
    """카드 삭제 (즉시 실행)"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        # 카드 존재 확인
        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({
                'success': False,
                'error': '카드를 찾을 수 없습니다.'
            }), 404
        
        # 예측 성공 여부와 관계없이 카드 제거 가능
        # 즉시 카드 제거 실행
        success = production_card_manager.remove_card(card_id)
        
        if success:
            # 진행 상태가 있으면 정리
            if card_id in delete_progress:
                del delete_progress[card_id]
            
            return jsonify({
                'success': True,
                'message': '카드가 제거되었습니다.',
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({
                'success': False,
                'error': '카드 제거에 실패했습니다.'
            }), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 실제 매수 API
@app.route('/api/trade/buy', methods=['POST'])
def trade_buy():
    """실제 매수 거래 실행"""
    try:
        data = request.json
        market = data.get('market', 'KRW-BTC')
        price = data.get('price')  # 매수 금액 (KRW)
        
        if not price or price <= 0:
            return jsonify({'error': '매수 금액을 입력해주세요.'}), 400
        
        # 최소 매수 금액 체크
        min_buy_amount = 5000  # 업비트 최소 매수 금액
        if price < min_buy_amount:
            return jsonify({'error': f'최소 매수 금액은 {min_buy_amount:,}원입니다.'}), 400
        
        # Upbit 객체 초기화
        access_key = os.getenv('UPBIT_ACCESS_KEY')
        secret_key = os.getenv('UPBIT_SECRET_KEY')
        
        if not access_key or not secret_key:
            return jsonify({'error': '업비트 API 키가 설정되지 않았습니다.'}), 500
        
        upbit = pyupbit.Upbit(access_key, secret_key)
        
        # 시장가 매수
        try:
            result = upbit.buy_market_order(market, price)
            
            if 'error' in result:
                return jsonify({
                    'success': False,
                    'error': result.get('error', {}).get('message', '매수 실패')
                }), 400
            
            # 매수 성공
            return jsonify({
                'success': True,
                'message': '매수가 완료되었습니다.',
                'uuid': result.get('uuid'),
                'market': market,
                'price': price,
                'timestamp': datetime.now().isoformat()
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'매수 실행 중 오류: {str(e)}'
            }), 500
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 실제 매도 API
@app.route('/api/trade/sell', methods=['POST'])
def trade_sell():
    """실제 매도 거래 실행"""
    try:
        data = request.json
        market = data.get('market', 'KRW-BTC')
        volume = data.get('volume')  # 매도 수량 (BTC)
        price = data.get('price')  # 매도 금액 (KRW, 선택적)
        
        if not volume or volume <= 0:
            return jsonify({'error': '매도 수량을 입력해주세요.'}), 400
        
        # Upbit 객체 초기화
        access_key = os.getenv('UPBIT_ACCESS_KEY')
        secret_key = os.getenv('UPBIT_SECRET_KEY')
        
        if not access_key or not secret_key:
            return jsonify({'error': '업비트 API 키가 설정되지 않았습니다.'}), 500
        
        upbit = pyupbit.Upbit(access_key, secret_key)
        
        # 시장가 매도
        try:
            result = upbit.sell_market_order(market, volume)
            
            if 'error' in result:
                return jsonify({
                    'success': False,
                    'error': result.get('error', {}).get('message', '매도 실패')
                }), 400
            
            # 매도 성공
            return jsonify({
                'success': True,
                'message': '매도가 완료되었습니다.',
                'uuid': result.get('uuid'),
                'market': market,
                'volume': volume,
                'timestamp': datetime.now().isoformat()
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'매도 실행 중 오류: {str(e)}'
            }), 500
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 카드 BUY API
@app.route('/api/cards/<card_id>/buy', methods=['POST'])
def buy_card(card_id):
    """카드 BUY (매수)"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
        
        # 현재 가격 가져오기 (캐시/레이트리밋 적용)
        try:
            current_price = _get_btc_price_cached()
        except Exception as e:
            print(f"⚠️ 캐시 기반 가격 조회 실패: {e}")
            # 마지막 방어: PriceCacheService 직접 호출
            current_price = None
            try:
                from services.price_cache_service import get_price_cache_service
                price_cache = get_price_cache_service()
                cached_price = price_cache.get_price()
                if cached_price and cached_price > 0:
                    current_price = cached_price
            except Exception as e2:
                print(f"⚠️ PriceCacheService에서 가격 가져오기 추가 실패: {e2}")
            
            if not current_price or current_price <= 0:
                print("❌ 현재 가격을 가져올 수 없습니다. (캐시/레이트리밋 실패)")
                return jsonify({'error': '현재 가격을 가져올 수 없습니다.'}), 500
        
        # 최소 구매 금액 가져오기
        min_buy_amount = settings_manager.get('min_buy_amount', 5000) if settings_manager else 5000
        qty = min_buy_amount / current_price
        
        # BUY 히스토리 추가
        production_card_manager.add_buy_history(
            card_id=card_id,
            qty=qty,
            entry_price=current_price,
            fee_amount=min_buy_amount * (settings_manager.get('fee_rate', 0.1) / 100) if settings_manager else 0,
            memo=f'수동 매수: {current_price:,.0f} KRW'
        )
        
        # 카드 상태 업데이트
        production_card_manager.update_card(card_id, {'card_state': 'ACTIVE'})
        
        return jsonify({
            'success': True,
            'message': '매수가 완료되었습니다.',
            'entry_price': current_price,
            'qty': qty,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# SELL 진행 상태 저장 (전역 딕셔너리)
sell_progress = {}  # {card_id: {'status': 'waiting'|'processing'|'completed'|'cancelled', 'progress': 0-100, 'started_at': timestamp}}

# DELETE 진행 상태 저장 (전역 딕셔너리)
delete_progress = {}  # {card_id: {'status': 'waiting'|'processing'|'completed'|'cancelled', 'progress': 0-100, 'started_at': timestamp}}

# 카드 SELL 시작 API (1분 대기 시작)
@app.route('/api/cards/<card_id>/sell/start', methods=['POST'])
def sell_card_start(card_id):
    """카드 SELL 시작 - 1분 대기 시작"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
        
        # 이미 진행 중인지 확인
        if card_id in sell_progress:
            existing = sell_progress[card_id]
            if existing['status'] in ['waiting', 'processing']:
                return jsonify({
                    'success': True,
                    'status': existing['status'],
                    'progress': existing['progress'],
                    'message': '이미 진행 중인 SELL 작업이 있습니다.'
                })
        
        # SELL 진행 상태 초기화
        import time
        sell_progress[card_id] = {
            'status': 'waiting',
            'progress': 0,
            'started_at': time.time(),
            'card_id': card_id
        }
        
        # 매도 진행 중 상태를 카드에 저장
        if card:
            card['sell_progress'] = {
                'status': 'waiting',
                'progress': 0,
                'started_at': time.time(),
                'card_id': card_id
            }
            # 카드 저장
            try:
                production_card_manager._save_cards_to_cache()
                print(f"💾 매도 진행 중 카드 저장 완료: {card_id}")
            except Exception as e:
                print(f"⚠️ 매도 진행 중 카드 저장 오류: {e}")
        
        return jsonify({
            'success': True,
            'status': 'waiting',
            'progress': 0,
            'message': 'SELL 작업이 시작되었습니다. 1분간 대기합니다.'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 카드 SELL 취소 API
@app.route('/api/cards/<card_id>/sell/cancel', methods=['POST'])
def sell_card_cancel(card_id):
    """카드 SELL 취소"""
    try:
        if card_id in sell_progress:
            sell_progress[card_id]['status'] = 'cancelled'
            sell_progress[card_id]['progress'] = 0
            return jsonify({
                'success': True,
                'message': 'SELL 작업이 취소되었습니다.'
            })
        else:
            return jsonify({
                'success': False,
                'message': '진행 중인 SELL 작업이 없습니다.'
            })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# 카드 SELL 진행 상태 확인 API
@app.route('/api/cards/<card_id>/sell/status', methods=['GET'])
def sell_card_status(card_id):
    """카드 SELL 진행 상태 확인"""
    try:
        if card_id not in sell_progress:
            return jsonify({
                'success': False,
                'status': 'not_started',
                'progress': 0
            })
        
        import time
        progress_info = sell_progress[card_id]
        elapsed = time.time() - progress_info['started_at']
        wait_time = 60  # 1분
        
        # 진행률 계산
        if progress_info['status'] == 'waiting':
            progress = min(100, int((elapsed / wait_time) * 100))
            progress_info['progress'] = progress
            
            # 1분이 지났으면 processing으로 변경
            if elapsed >= wait_time:
                progress_info['status'] = 'processing'
                progress_info['progress'] = 95
        
        # 매도 진행 상태를 카드에 저장 (주기적으로 업데이트)
        try:
            card = production_card_manager.get_card_by_id(card_id) if production_card_manager else None
            if card:
                card['sell_progress'] = {
                    'status': progress_info['status'],
                    'progress': progress_info['progress'],
                    'started_at': progress_info['started_at'],
                    'card_id': card_id
                }
                # 카드 저장 (주기적으로 저장하여 진행 상태 유지)
                production_card_manager._save_cards_to_cache()
        except Exception as e:
            print(f"⚠️ 매도 진행 상태 저장 오류: {e}")
        
        return jsonify({
            'success': True,
            'status': progress_info['status'],
            'progress': progress_info['progress'],
            'remaining': max(0, int(wait_time - elapsed)) if progress_info['status'] == 'waiting' else 0
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/cards/<card_id>/sell/metrics', methods=['GET'])
def sell_card_metrics(card_id):
    """Step 4: 업비트 데이터를 사용한 거래량/거래대금 계산"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500

        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404

        current_price = _get_btc_price_cached()
        entry_price, qty = _resolve_entry_and_qty(card, current_price)
        metrics = _calculate_market_volume_metrics(card.get('timeframe', 'minute1'))
        trade_value = current_price * qty if current_price and qty else 0.0

        return jsonify({
            'success': True,
            'card_id': card_id,
            'timeframe': card.get('timeframe', 'unknown'),
            'market': 'KRW-BTC',
            'current_price': current_price,
            'entry_price': entry_price,
            'trade_volume': qty,
            'trade_value': trade_value,
            'market_volume': metrics.get('volume', 0.0),
            'market_trade_value': metrics.get('trade_value', 0.0),
            'market_interval': metrics.get('interval'),
            'market_candle_count': metrics.get('count'),
            'calculated_at': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# 카드 SELL API (1분 대기 후 실행)
@app.route('/api/cards/<card_id>/sell', methods=['POST'])
def sell_card(card_id):
    """카드 SELL (매도) - 1분 대기 후 실행"""
    try:
        # 진행 상태 확인
        if card_id not in sell_progress:
            return jsonify({
                'success': False,
                'error': 'SELL 작업이 시작되지 않았습니다. 먼저 /sell/start를 호출하세요.'
            }), 400
        
        progress_info = sell_progress[card_id]
        
        # 취소되었는지 확인
        if progress_info['status'] == 'cancelled':
            del sell_progress[card_id]
            return jsonify({
                'success': False,
                'error': 'SELL 작업이 취소되었습니다.',
                'cancelled': True
            }), 400
        
        # 1분 대기 확인
        import time
        elapsed = time.time() - progress_info['started_at']
        wait_time = 60  # 1분
        
        if elapsed < wait_time:
            # 아직 대기 중
            remaining = wait_time - elapsed
            progress = int((elapsed / wait_time) * 100)
            progress_info['progress'] = progress
            progress_info['status'] = 'waiting'
            
            # 매도 진행 상태를 카드에 저장
            try:
                if card:
                    card['sell_progress'] = {
                        'status': 'waiting',
                        'progress': progress,
                        'started_at': progress_info['started_at'],
                        'card_id': card_id
                    }
                    production_card_manager._save_cards_to_cache()
            except Exception as e:
                print(f"⚠️ 매도 진행 상태 저장 오류: {e}")
            
            return jsonify({
                'success': False,
                'status': 'waiting',
                'progress': progress,
                'remaining': int(remaining),
                'message': f'대기 중... {int(remaining)}초 남음'
            }), 202  # 202 Accepted (처리 중)
        
        # 1분 경과 - 실제 SELL 실행
        progress_info['status'] = 'processing'
        progress_info['progress'] = 95
        
        # 매도 처리 중 상태를 카드에 저장
        try:
            if card:
                card['sell_progress'] = {
                    'status': 'processing',
                    'progress': 95,
                    'started_at': progress_info['started_at'],
                    'card_id': card_id
                }
                production_card_manager._save_cards_to_cache()
        except Exception as e:
            print(f"⚠️ 매도 처리 중 상태 저장 오류: {e}")
        
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        card = production_card_manager.get_card_by_id(card_id)
        if not card:
            return jsonify({'error': '카드를 찾을 수 없습니다.'}), 404
        
        # BUY 히스토리 확인 (매우 중요: BUY 없이는 SELL 불가)
        history_list = card.get('history_list', [])
        has_buy = any(hist.get('type') in ['NEW', 'BUY'] for hist in history_list)
        has_sold = any(hist.get('type', '').upper() == 'SOLD' for hist in history_list)
        
        # 이미 매도 완료된 경우
        if has_sold:
            return jsonify({'error': '이미 매도 완료된 카드입니다. 검증 카드에서 확인하세요.'}), 400
        
        # BUY 히스토리가 없으면 SELL 불가
        if not has_buy:
            print(f"❌ SELL 거부: card_id={card_id}, BUY 히스토리 없음")
            return jsonify({
                'error': '매수 기록이 없습니다. 먼저 BUY를 실행하세요.',
                'has_buy': False,
                'history_types': [h.get('type') for h in history_list[:5]]
            }), 400
        
        # 현재 가격 가져오기
        import pyupbit
        current_price = None
        
        # PriceCacheService에서 가격 가져오기 시도
        try:
            from services.price_cache_service import get_price_cache_service
            price_cache = get_price_cache_service()
            cached_price = price_cache.get_price()
            if cached_price and cached_price > 0:
                current_price = cached_price
        except Exception as e:
            print(f"⚠️ PriceCacheService에서 가격 가져오기 실패: {e}")
        
        # 캐시에서 가격을 가져오지 못한 경우 직접 API 호출
        if not current_price or current_price <= 0:
            try:
                current_price = pyupbit.get_current_price("KRW-BTC")
                if not current_price or current_price <= 0:
                    return jsonify({'error': '현재 가격을 가져올 수 없습니다.'}), 500
            except Exception as e:
                print(f"❌ pyupbit.get_current_price() 실패: {e}")
                return jsonify({'error': f'현재 가격을 가져올 수 없습니다: {str(e)}'}), 500
        
        entry_price, qty = _resolve_entry_and_qty(card, current_price)
        
        # 손익률 계산
        print(f"📈 SELL 계산: entry_price={entry_price}, qty={qty}, current_price={current_price}")
        pnl_percent = ((current_price - entry_price) / entry_price) * 100
        pnl_amount = (current_price - entry_price) * qty
        
        # 수수료 계산
        fee_rate = settings_manager.get('fee_rate', 0.1) if settings_manager else 0.1
        buy_fee = entry_price * qty * (fee_rate / 100)
        sell_fee = current_price * qty * (fee_rate / 100)
        total_fee = buy_fee + sell_fee
        
        # 순 손익 계산 (수수료 제외)
        pnl_amount_net = pnl_amount - total_fee

        market_metrics = _calculate_market_volume_metrics(card.get('timeframe', 'minute1'))
        trade_value = current_price * qty if current_price and qty else 0.0
        
        # 진행 상태 확인 (취소되었는지)
        if card_id in sell_progress:
            if sell_progress[card_id]['status'] == 'cancelled':
                # 취소된 경우 진행 상태 제거하고 오류 반환
                del sell_progress[card_id]
                return jsonify({
                    'success': False,
                    'error': 'SELL 작업이 취소되었습니다.',
                    'cancelled': True
                }), 400
        
        # SELL 히스토리 추가 (검증 완료 처리)
        print(f"📝 SELL 히스토리 추가 중: card_id={card_id}, exit_price={current_price}, pnl_percent={pnl_percent:.2f}%")
        production_card_manager.add_sold_history(
            card_id=card_id,
            exit_price=current_price,
            pnl_percent=pnl_percent,
            pnl_amount=pnl_amount_net,
            fee_amount=total_fee,
            qty=qty,
            memo=f'수동 매도: {current_price:,.0f} KRW (검증 완료)',
            is_simulation=False,
            settings_manager=settings_manager
        )
        
        # 진행 상태 완료로 업데이트
        if card_id in sell_progress:
            sell_progress[card_id]['status'] = 'completed'
            sell_progress[card_id]['progress'] = 100
        
        # 카드 상태 확인 및 로그
        updated_card = production_card_manager.get_card_by_id(card_id)
        if updated_card:
            history_list = updated_card.get('history_list', [])
            has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
            
            # 매도 완료 후 sell_progress 제거 및 카드 저장
            if 'sell_progress' in updated_card:
                del updated_card['sell_progress']
            
            # 카드 저장 (매도 완료 상태 저장)
            try:
                production_card_manager._save_cards_to_cache()
                print(f"💾 매도 완료 카드 저장 완료: {card_id}")
                
                # 매도 완료 시 전체 카드 정보를 NB DATABASE에 저장
                try:
                    if updated_card:
                        # 전체 카드 정보를 JSON 문자열로 변환하여 NB DATABASE에 저장
                        import json
                        card_json = json.dumps(updated_card, ensure_ascii=False, default=str)
                        
                        # NBverse Storage에 전체 카드 정보 저장
                        if nbverse_storage:
                            # 카드 ID를 텍스트로 사용하여 저장
                            metadata = {
                                'card_id': updated_card.get('card_id'),
                                'card_key': updated_card.get('card_key'),
                                'card_type': 'production_card',
                                'card_state': updated_card.get('card_state', 'GRAY'),
                                'sold_at': datetime.now().isoformat(),
                                'pnl_percent': pnl_percent,
                                'pnl_amount': pnl_amount_net,
                                'entry_price': entry_price,
                                'exit_price': current_price,
                                'has_sold': True,
                                'full_card_data': True  # 전체 카드 데이터 저장 플래그
                            }
                            
                            # 전체 카드 정보를 텍스트로 저장
                            result = nbverse_storage.save_text(card_json, metadata=metadata)
                            print(f"💾 NB DATABASE 저장 완료: card_id={card_id}, max_path={result.get('max_path', 'N/A')}, min_path={result.get('min_path', 'N/A')}")
                        else:
                            print(f"⚠️ NBverse Storage가 초기화되지 않았습니다.")
                except Exception as nb_error:
                    print(f"⚠️ NB DATABASE 저장 오류: {nb_error}")
                    import traceback
                    traceback.print_exc()
            except Exception as e:
                print(f"⚠️ 매도 완료 카드 저장 오류: {e}")
            
            print(f"✅ SELL 히스토리 추가 완료: card_id={card_id}, has_sold={has_sold}, card_state={updated_card.get('card_state', 'N/A')}")
            print(f"   히스토리 개수: {len(history_list)}, 최신 히스토리 타입: {history_list[-1].get('type', 'N/A') if history_list else 'N/A'}")
        else:
            print(f"⚠️ 카드를 찾을 수 없습니다: card_id={card_id}")
        
        # 진행 상태 제거 (완료 후 5초 뒤)
        import threading
        def cleanup_progress():
            import time
            time.sleep(5)
            if card_id in sell_progress:
                del sell_progress[card_id]
        threading.Thread(target=cleanup_progress, daemon=True).start()
        
        # 카드는 이미 REMOVED 상태로 변경됨 (add_sold_history에서 처리)
        
        return jsonify({
            'success': True,
            'message': '매도가 완료되었습니다. 검증 완료 처리되었습니다.',
            'exit_price': current_price,
            'entry_price': entry_price,
            'pnl_percent': pnl_percent,
            'pnl_amount': pnl_amount_net,
            'trade_volume': qty,
            'trade_value': trade_value,
            'market_volume': market_metrics.get('volume', 0.0),
            'market_trade_value': market_metrics.get('trade_value', 0.0),
            'market_interval': market_metrics.get('interval'),
            'market_candle_count': market_metrics.get('count'),
            'verified': True,
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 검증 카드 목록 API
@app.route('/api/cards/verification', methods=['GET'])
def get_verification_cards():
    """검증 카드 목록 조회 (BUY와 SOLD 히스토리가 모두 있는 카드만)"""
    try:
        if not production_card_manager:
            return jsonify({'error': '카드 관리자가 초기화되지 않았습니다.'}), 500
        
        # 모든 카드 가져오기 (REMOVED 포함)
        all_cards = production_card_manager.get_all_cards()
        
        # 폐기된 카드도 포함
        discarded_cards = []
        if discarded_card_manager:
            try:
                discarded_cards = discarded_card_manager.get_all_discarded_cards()
            except:
                pass
        
        # 모든 카드 통합 (중복 제거)
        all_verification_cards = {}
        for card in all_cards:
            card_id = card.get('card_id', '')
            if card_id:
                all_verification_cards[card_id] = card
        
        for card in discarded_cards:
            card_id = card.get('card_id', '')
            if card_id:
                all_verification_cards[card_id] = card
        
        # 검증 카드 필터링 (BUY와 SOLD 히스토리가 모두 있는 카드만)
        verification_cards = []
        for card in all_verification_cards.values():
            history_list = card.get('history_list', [])
            card_id = card.get('card_id', 'N/A')
            
            # 디버깅: 히스토리 타입 확인 (첫 번째 카드만)
            if len(verification_cards) == 0 and len(history_list) > 0:
                print(f"🔍 검증 카드 확인: card_id={card_id}, 히스토리 개수={len(history_list)}")
                for i, hist in enumerate(history_list[:3]):  # 최신 3개만
                    print(f"   히스토리[{i}]: type={hist.get('type', 'N/A')}, memo={hist.get('memo', 'N/A')[:50]}")
            
            # BUY 히스토리 확인 (NEW, BUY 모두 포함)
            has_buy = any(hist.get('type') in ['NEW', 'BUY'] for hist in history_list)
            
            # SOLD 히스토리 확인 (대소문자 구분 없이, 정확히 SOLD만)
            has_sold = any(hist.get('type', '').upper() == 'SOLD' for hist in history_list)
            
            # 디버깅: 모든 카드의 검증 상태 로그
            if len(history_list) > 0:
                latest_hist_type = history_list[-1].get('type', 'N/A') if history_list else 'N/A'
                if latest_hist_type == 'SOLD' or has_sold:
                    print(f"🔍 검증 카드 후보: card_id={card_id}, has_buy={has_buy}, has_sold={has_sold}, 최신 히스토리={latest_hist_type}")
            
            # BUY와 SOLD가 모두 있으면 검증 완료 카드로 포함
            if has_buy and has_sold:
                if len(verification_cards) == 0:
                    print(f"✅ 검증 완료 카드로 포함: {card_id}")
                # 검증 점수 계산
                sold_history = None
                for hist in reversed(history_list):
                    if hist.get('type') == 'SOLD':
                        sold_history = hist
                        break
                
                if sold_history:
                    pnl_percent = sold_history.get('pnl_percent', 0)
                    # 손익률 기반 점수 계산
                    if pnl_percent > 0:
                        verification_score = 50 + min(pnl_percent * 2, 50)
                    elif pnl_percent < 0:
                        verification_score = 50 + max(pnl_percent * 2, -50)
                    else:
                        verification_score = 50.0
                    verification_score = max(0.0, min(100.0, verification_score))
                else:
                    verification_score = 50.0
                
                # 카드에 저장된 점수 사용 (있는 경우)
                card_score = card.get('score', verification_score)
                realtime_scores = card.get('realtime_scores', [])
                if realtime_scores and len(realtime_scores) > 0:
                    card_score = realtime_scores[-1]
                
                card['verification_score'] = card_score
                
                # RL AI 행동 통계 계산
                action_stats = _calculate_action_stats(card)
                card['action_stats'] = action_stats
                
                verification_cards.append(card)
        
        # 최신순으로 정렬 (SOLD 히스토리의 시간 기준, 가장 최근 매도가 맨 위에)
        def get_sold_time(card):
            history_list = card.get('history_list', [])
            # 역순으로 검색하여 가장 최근 SOLD 히스토리 찾기
            for hist in reversed(history_list):
                if hist.get('type', '').upper() == 'SOLD':
                    timestamp = hist.get('timestamp', '')
                    if timestamp:
                        return timestamp
            # SOLD 히스토리가 없으면 빈 문자열 (맨 아래로)
            return ''
        
        verification_cards.sort(key=get_sold_time, reverse=True)
        
        # 정렬 결과 확인 (최신 3개만 로그)
        if len(verification_cards) > 0:
            print(f"✅ 검증 카드 정렬 완료: 총 {len(verification_cards)}개")
            for i, card in enumerate(verification_cards[:3]):
                card_id = card.get('card_id', 'N/A')
                history_list = card.get('history_list', [])
                sold_time = get_sold_time(card)
                print(f"   [{i+1}] {card_id}: SOLD 시간={sold_time[:19] if sold_time else 'N/A'}")
        
        # N/B 값 검증 및 복원 (NBVerse 데이터베이스에서 조회)
        for card in verification_cards:
            # N/B 값이 없으면 NBVerse에서 조회 시도
            if not card.get('nb_value') and not card.get('nb_max') and not card.get('nb_min'):
                card_id = card.get('card_id', '')
                nb_id = card.get('nb_id', '')
                nb_value_from_file = card.get('nb_value')  # 파일에서 로드된 값 (없을 수 있음)
                
                # NBVerse에서 조회 시도
                nb_loaded = False
                if nbverse_storage:
                    try:
                        # 방법 1: card_id로 metadata에서 찾기
                        if card_id:
                            # NBVerse 데이터 디렉토리에서 card_id로 검색
                            current_file_dir = os.path.dirname(os.path.abspath(__file__))
                            parent_dir = os.path.dirname(os.path.dirname(current_file_dir))
                            data_dir = os.path.join(parent_dir, "data", "nbverse")
                            
                            base_dirs = [
                                os.path.join(data_dir, "max"),
                                os.path.join(data_dir, "min")
                            ]
                            
                            for base_dir in base_dirs:
                                if not os.path.exists(base_dir):
                                    continue
                                
                                # 재귀적으로 모든 JSON 파일 검색
                                for root, dirs, files in os.walk(base_dir):
                                    for filename in files:
                                        if filename.endswith('.json'):
                                            file_path = os.path.join(root, filename)
                                            try:
                                                data = nbverse_storage.load_from_path(file_path)
                                                if data and data.get('metadata', {}).get('card_id') == card_id:
                                                    metadata = data.get('metadata', {})
                                                    if metadata.get('nb_value') is not None:
                                                        card['nb_value'] = float(metadata.get('nb_value', 0.5))
                                                        card['nb_max'] = float(metadata.get('nb_max', 5.5))
                                                        card['nb_min'] = float(metadata.get('nb_min', 5.5))
                                                        # bit_max, bit_min도 복원 (있는 경우)
                                                        if metadata.get('bit_max'):
                                                            card['bit_max'] = float(metadata.get('bit_max'))
                                                        if metadata.get('bit_min'):
                                                            card['bit_min'] = float(metadata.get('bit_min'))
                                                        nb_loaded = True
                                                        print(f"✅ N/B 값 복원 (card_id): {card_id}, nb_value={card['nb_value']}")
                                                        break
                                            except Exception as e:
                                                continue
                                    if nb_loaded:
                                        break
                                if nb_loaded:
                                    break
                        
                        # 방법 2: nb_id로 찾기 (방법 1이 실패한 경우)
                        if not nb_loaded and nb_id:
                            # nb_id에서 nb_value 추출 시도 (예: "nb_3m_0.1402824772" -> 0.1402824772)
                            try:
                                if '_' in nb_id:
                                    parts = nb_id.split('_')
                                    if len(parts) >= 3:
                                        nb_value_str = parts[-1]
                                        nb_value_to_search = float(nb_value_str)
                                        
                                        # find_by_nb_value로 검색
                                        results = nbverse_storage.find_by_nb_value(nb_value_to_search, folder_type="max", limit=1)
                                        if results and len(results) > 0:
                                            result_data = results[0].get('data', {})
                                            metadata = result_data.get('metadata', {})
                                            if metadata.get('card_id') == card_id or metadata.get('nb_id') == nb_id:
                                                if metadata.get('nb_value') is not None:
                                                    card['nb_value'] = float(metadata.get('nb_value', 0.5))
                                                    card['nb_max'] = float(metadata.get('nb_max', 5.5))
                                                    card['nb_min'] = float(metadata.get('nb_min', 5.5))
                                                    nb_loaded = True
                                                    print(f"✅ N/B 값 복원 (nb_id): {nb_id}, nb_value={card['nb_value']}")
                            except Exception as e:
                                print(f"⚠️ nb_id로 N/B 값 조회 실패: {e}")
                        
                        # 방법 3: nb_value로 직접 검색 (방법 1, 2가 실패한 경우)
                        if not nb_loaded and nb_value_from_file is not None:
                            try:
                                results = nbverse_storage.find_by_nb_value(float(nb_value_from_file), folder_type="max", limit=5)
                                for result in results:
                                    result_data = result.get('data', {})
                                    metadata = result_data.get('metadata', {})
                                    # card_id 또는 nb_id로 매칭 확인
                                    if metadata.get('card_id') == card_id or metadata.get('nb_id') == nb_id:
                                        if metadata.get('nb_value') is not None:
                                            card['nb_value'] = float(metadata.get('nb_value', 0.5))
                                            card['nb_max'] = float(metadata.get('nb_max', 5.5))
                                            card['nb_min'] = float(metadata.get('nb_min', 5.5))
                                            nb_loaded = True
                                            print(f"✅ N/B 값 복원 (nb_value): {nb_value_from_file}, nb_value={card['nb_value']}")
                                            break
                            except Exception as e:
                                print(f"⚠️ nb_value로 N/B 값 조회 실패: {e}")
                    
                    except Exception as e:
                        print(f"⚠️ NBVerse에서 N/B 값 조회 중 오류: {e}")
                        import traceback
                        traceback.print_exc()
                
                # 모든 방법이 실패한 경우에만 기본값 사용
                if not nb_loaded:
                    print(f"⚠️ N/B 값 복원 실패, 기본값 사용: card_id={card_id}, nb_id={nb_id}")
                    card['nb_value'] = 0.5
                    card['nb_max'] = 5.5
                    card['nb_min'] = 5.5
        
        return jsonify({
            'cards': verification_cards,
            'count': len(verification_cards),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def _calculate_action_stats(card):
    """AI 판정 횟수 통계 계산"""
    try:
        history_list = card.get('history_list', [])
        
        buy_count = 0
        sell_count = 0
        discard_count = 0
        
        has_discard_decision = False
        has_sell_decision = False
        
        for hist in history_list:
            hist_type = hist.get('type', '')
            memo = hist.get('memo', '')
            
            # BUY 횟수 (NEW, BUY 히스토리)
            if hist_type in ['NEW', 'BUY']:
                buy_count += 1
            
            # SELL 판정과 폐기 판정 구분
            if '자동 폐기' in memo and ('FREEZE 판정' in memo or 'DELETE 판정' in memo):
                has_discard_decision = True
            elif '자동 매도' in memo and 'SELL 판정' in memo:
                has_sell_decision = True
            
            # SOLD 히스토리 처리
            if hist_type == 'SOLD':
                if '자동 폐기' in memo and ('FREEZE 판정' in memo or 'DELETE 판정' in memo):
                    discard_count = 1
                elif '자동 매도' in memo and 'SELL 판정' in memo:
                    sell_count += 1
                else:
                    sell_count += 1
        
        # 폐기 판정이 있지만 SOLD 히스토리가 없는 경우
        if has_discard_decision and discard_count == 0:
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
        return {
            'buy_count': 0,
            'sell_count': 0,
            'discard_count': 0,
            'has_discard_decision': False,
            'has_sell_decision': False
        }

# 폐기 카드 목록 API
@app.route('/api/cards/discarded', methods=['GET'])
def get_discarded_cards():
    """폐기 카드 목록 조회"""
    try:
        if not discarded_card_manager:
            return jsonify({'error': '폐기 카드 관리자가 초기화되지 않았습니다.'}), 500
        
        cards = discarded_card_manager.get_all_discarded_cards()
        
        return jsonify({
            'cards': cards,
            'count': len(cards),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# AI 분석 API
@app.route('/api/ai/analyze-chart', methods=['POST'])
def analyze_chart():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 강화학습 AI 분석 API
@app.route('/api/ai/analyze-rl', methods=['POST'])
def analyze_rl():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 강화학습 AI 시스템 정보 조회 API
@app.route('/api/ai/rl-info', methods=['GET'])
def get_rl_info():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 강화학습 AI 통계 조회 API
@app.route('/api/ai/rl-statistics', methods=['GET'])
def get_rl_statistics():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 강화학습 AI 카드별 통계 조회 API
@app.route('/api/ai/rl-statistics/<card_id>', methods=['GET'])
def get_rl_card_statistics(card_id):
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

def _execute_virtual_trade(card, action, current_price, base_output, is_holding, entry_price, qty):
    """
    가상 거래 실행 (실제 거래 없이 시뮬레이션)
    
    Returns:
        {
            'success': bool,
            'pnl_percent': float,  # 손익률 (%)
            'pnl_amount': float,   # 손익 금액
            'transaction_cost': float,  # 거래 수수료
            'entry_price': float,  # 진입 가격
            'exit_price': float,   # 청산 가격
            'qty': float           # 거래 수량
        }
    """
    try:
        # 가상 자본 설정 (기본 100만원)
        virtual_capital = 1000000.0  # 100만원
        
        # 거래 수수료 (0.05%)
        fee_rate = 0.0005
        
        if action == 'BUY':
            # 매수 시뮬레이션
            if is_holding:
                # 이미 보유 중이면 매수 불가
                return {
                    'success': False,
                    'pnl_percent': 0.0,
                    'pnl_amount': 0.0,
                    'transaction_cost': 0.0,
                    'entry_price': entry_price or current_price,
                    'exit_price': current_price,
                    'qty': qty or 0.0
                }
            
            # 진입 가격 (현재 가격)
            virtual_entry_price = current_price
            
            # 매수 수량 계산 (가상 자본의 10% 사용)
            buy_amount = virtual_capital * 0.1
            virtual_qty = buy_amount / virtual_entry_price
            
            # 거래 수수료
            transaction_cost = buy_amount * fee_rate
            
            # 매수 완료 (수익률은 아직 0, 보유 중)
            return {
                'success': True,
                'pnl_percent': 0.0,  # 매수 직후는 수익률 0
                'pnl_amount': 0.0,
                'transaction_cost': transaction_cost,
                'entry_price': virtual_entry_price,
                'exit_price': virtual_entry_price,
                'qty': virtual_qty
            }
            
        elif action == 'SELL':
            # 매도 시뮬레이션
            if not is_holding or not entry_price or entry_price <= 0:
                # 보유 중이 아니면 매도 불가
                return {
                    'success': False,
                    'pnl_percent': 0.0,
                    'pnl_amount': 0.0,
                    'transaction_cost': 0.0,
                    'entry_price': entry_price or current_price,
                    'exit_price': current_price,
                    'qty': qty or 0.0
                }
            
            # 청산 가격 (현재 가격)
            virtual_exit_price = current_price
            
            # 진입 가격 (이전 BUY 히스토리에서 가져옴)
            virtual_entry_price = entry_price
            
            # 거래 수량 (이전 BUY에서 가져옴, 없으면 계산)
            virtual_qty = qty if qty and qty > 0 else (virtual_capital * 0.1 / virtual_entry_price)
            
            # 손익 계산
            pnl_amount = (virtual_exit_price - virtual_entry_price) * virtual_qty
            pnl_percent = ((virtual_exit_price - virtual_entry_price) / virtual_entry_price) * 100.0
            
            # 거래 수수료 (매수 + 매도)
            buy_cost = virtual_entry_price * virtual_qty * fee_rate
            sell_cost = virtual_exit_price * virtual_qty * fee_rate
            transaction_cost = buy_cost + sell_cost
            
            # 순 손익 (수수료 제외)
            net_pnl = pnl_amount - transaction_cost
            net_pnl_percent = (net_pnl / (virtual_entry_price * virtual_qty)) * 100.0
            
            return {
                'success': True,
                'pnl_percent': net_pnl_percent,  # 수수료 제외 순 손익률
                'pnl_amount': net_pnl,
                'transaction_cost': transaction_cost,
                'entry_price': virtual_entry_price,
                'exit_price': virtual_exit_price,
                'qty': virtual_qty
            }
            
        else:
            # HOLD, FREEZE, DELETE는 거래 없음
            return {
                'success': True,
                'pnl_percent': 0.0,
                'pnl_amount': 0.0,
                'transaction_cost': 0.0,
                'entry_price': entry_price or current_price,
                'exit_price': current_price,
                'qty': qty or 0.0
            }
            
    except Exception as e:
        print(f"⚠️ 가상 거래 실행 오류: {e}")
        import traceback
        traceback.print_exc()
        return {
            'success': False,
            'pnl_percent': 0.0,
            'pnl_amount': 0.0,
            'transaction_cost': 0.0,
            'entry_price': current_price,
            'exit_price': current_price,
            'qty': 0.0
        }

def _add_virtual_trade_history(card, action, virtual_trade_result, current_price):
    """가상 거래 히스토리를 카드에 추가"""
    try:
        if not production_card_manager:
            return
        
        card_id = card.get('card_id', '')
        if not card_id:
            return
        
        history_list = card.get('history_list', [])
        
        if action == 'BUY':
            # 매수 히스토리 추가
            buy_history = {
                'type': 'BUY',
                'timestamp': datetime.now().isoformat(),
                'price': virtual_trade_result['entry_price'],
                'entry_price': virtual_trade_result['entry_price'],
                'qty': virtual_trade_result['qty'],
                'amount': virtual_trade_result['entry_price'] * virtual_trade_result['qty'],
                'transaction_cost': virtual_trade_result['transaction_cost'],
                'virtual': True,  # 가상 거래 플래그
                'pnl_percent': 0.0  # 매수 직후는 수익률 0
            }
            history_list.insert(0, buy_history)  # 최신 히스토리 맨 앞에 추가
            
        elif action == 'SELL':
            # 매도 히스토리 추가
            sell_history = {
                'type': 'SOLD',
                'timestamp': datetime.now().isoformat(),
                'price': virtual_trade_result['exit_price'],
                'entry_price': virtual_trade_result['entry_price'],
                'qty': virtual_trade_result['qty'],
                'amount': virtual_trade_result['exit_price'] * virtual_trade_result['qty'],
                'transaction_cost': virtual_trade_result['transaction_cost'],
                'pnl_percent': virtual_trade_result['pnl_percent'],
                'pnl_amount': virtual_trade_result['pnl_amount'],
                'virtual': True  # 가상 거래 플래그
            }
            history_list.insert(0, sell_history)  # 최신 히스토리 맨 앞에 추가
        
        # 카드 업데이트
        production_card_manager.update_card(card_id, {
            'history_list': history_list
        })
        
        print(f"💾 가상 거래 히스토리 추가: card_id={card_id}, action={action}, pnl={virtual_trade_result.get('pnl_percent', 0):.2f}%")
        
    except Exception as e:
        print(f"⚠️ 가상 거래 히스토리 추가 오류: {e}")
        import traceback
        traceback.print_exc()

# 검증 결과를 강화학습 학습 데이터로 반영 API
@app.route('/api/ai/learn-from-verification', methods=['POST'])
def learn_from_verification():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 강화학습 AI 행동 실행 API
@app.route('/api/ai/execute-rl-action', methods=['POST'])
def execute_rl_action():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 설정 API
@app.route('/api/settings', methods=['GET'])
def get_settings():
    """설정 조회"""
    try:
        if not settings_manager:
            return jsonify({'error': '설정 관리자가 초기화되지 않았습니다.'}), 500
        
        settings = {
            'nb_decimal_places': settings_manager.get('nb_decimal_places', 10),
            'min_buy_amount': settings_manager.get('min_buy_amount', 5000),
            'fee_rate': settings_manager.get('fee_rate', 0.1),
            'update_cycle_seconds': settings_manager.get('update_cycle_seconds', 25),
            'production_card_limit': settings_manager.get('production_card_limit', 4),
            'chart_animation_interval_ms': settings_manager.get('chart_animation_interval_ms', 30000),  # 기본 30초
            'production_timeframes': settings_manager.get('production_timeframes', ['1m', '3m', '5m', '15m', '30m', '60m', '1d']),
            'real_trading': settings_manager.get('real_trading', False),
            # 업데이트 주기 설정
            'price_update_interval_ms': settings_manager.get('price_update_interval_ms', 5000),
            'balance_update_interval_ms': settings_manager.get('balance_update_interval_ms', 10000),
            'chart_update_interval_ms': settings_manager.get('chart_update_interval_ms', 5000),
            'card_chart_update_interval_ms': settings_manager.get('card_chart_update_interval_ms', 5000),
            # 차트 설정
            'chart_points': settings_manager.get('chart_points', 200),
            # 카드 설정
            'max_history_per_card': settings_manager.get('max_history_per_card', 100),
            # AI 설정
            'ai_update_interval_ms': settings_manager.get('ai_update_interval_ms', 60000),
            # 가격 캐시/레이트리밋
            'price_cache_ttl_seconds': settings_manager.get('price_cache_ttl_seconds', 60),
            'price_rate_limit_per_min': settings_manager.get('price_rate_limit_per_min', 10)
        }
        
        return jsonify(settings)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/settings', methods=['POST'])
def save_settings():
    """설정 저장"""
    try:
        data = request.json
        
        if not settings_manager:
            return jsonify({'error': '설정 관리자가 초기화되지 않았습니다.'}), 500
        
        print(f"📝 설정 저장 요청: {list(data.keys())}")
        
        # 설정 저장
        for key, value in data.items():
            # production_timeframes는 리스트로 변환
            if key == 'production_timeframes' and isinstance(value, list):
                settings_manager.set(key, value)
            elif key == 'production_timeframes' and isinstance(value, str):
                # 문자열인 경우 쉼표로 분리
                timeframes = [tf.strip() for tf in value.split(',') if tf.strip()]
                settings_manager.set(key, timeframes)
            elif key == 'chart_animation_interval_ms':
                # 타임프레임 순회 간격 검증 (최소 10초 = 10000ms)
                validated_value = int(value) if value else 30000
                if validated_value < 10000:
                    print(f"  ⚠️ {key} 값이 너무 짧습니다 ({validated_value}ms). 최소값 10000ms로 조정합니다.")
                    validated_value = 10000
                settings_manager.set(key, validated_value)
                print(f"  ✅ {key} = {validated_value}ms")
            else:
                settings_manager.set(key, value)
                print(f"  ✅ {key} = {value}")
        
        print("✅ 모든 설정 저장 완료")
        return jsonify({
            'success': True, 
            'message': '설정이 저장되었습니다.',
            'saved_keys': list(data.keys()),
            'timestamp': datetime.now().isoformat()
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"❌ 설정 저장 오류: {e}")
        return jsonify({'error': str(e)}), 500

# 차트 분석 카드 저장 API (index.html과 동일한 방식)
@app.route('/api/cards/chart-analysis/save', methods=['POST'])
def save_chart_analysis_card():
    """차트 분석 카드를 N/B database에 저장 (index.html과 동일한 방식)"""
    try:
        data = request.json
        card_type = data.get('card_type')  # 'card1' or 'card2'
        card_data = data.get('card_data', {})
        timeframe = data.get('timeframe', 'minute10')
        
        if not card_type or not card_data:
            return jsonify({'error': '카드 타입과 데이터가 필요합니다.'}), 400
        
        if not nbverse_storage:
            return jsonify({'error': 'NBVerse가 초기화되지 않았습니다.'}), 500
        
        # N/B 값 추출
        nb_value = card_data.get('nb_value')
        nb_max = card_data.get('nb_max')
        nb_min = card_data.get('nb_min')
        
        # card_key 생성 (timeframe + N/B 값 기반, index.html과 동일한 방식)
        # N/B 값이 있으면 사용, 없으면 기본값
        if nb_value is not None:
            # N/B 값을 문자열로 변환하여 card_key 생성
            nb_id = f"{nb_value:.10f}".rstrip('0').rstrip('.')  # 불필요한 0 제거
            card_key = f"{timeframe}_nb_{timeframe}_{nb_id}"
        else:
            # N/B 값이 없으면 타임스탬프 기반으로 생성
            card_key = f"{timeframe}_chart_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # 카드 ID 생성
        card_id = f"chart_analysis_{card_type}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        
        # 중첩 카드 확인 (NBVerse database에서 동일한 card_key를 가진 카드 검색)
        is_overlap = False
        try:
            if nbverse_storage and nb_value is not None:
                # N/B 값으로 검색하여 동일한 card_key를 가진 카드 찾기
                # metadata에서 card_key를 확인할 수 있도록 검색
                # 간단한 방법: 같은 N/B 값 범위에서 검색
                search_results = nbverse_storage.find_by_nb_value(
                    float(nb_value),
                    folder_type="max",
                    limit=10
                )
                
                # 검색 결과에서 동일한 card_key를 가진 카드 확인
                for result in search_results:
                    if result and isinstance(result, dict):
                        metadata = result.get('metadata', {})
                        existing_card_key = metadata.get('card_key', '')
                        existing_card_type = metadata.get('card_type', '')
                        
                        # 동일한 card_key이고 chart_analysis_card 타입인 경우
                        if existing_card_key == card_key and existing_card_type == 'chart_analysis_card':
                            is_overlap = True
                            print(f"🔄 중첩 카드 감지: card_key={card_key}, 기존 카드 발견")
                            break
        except Exception as e:
            print(f"⚠️ 중첩 카드 확인 중 오류 (계속 진행): {e}")
            # 오류가 발생해도 계속 진행
        
        # 전체 카드 정보 구성 (index.html과 동일한 구조)
        full_card_data = {
            'card_id': card_id,
            'card_key': card_key,  # N/B 값 기반 card_key
            'card_type': 'chart_analysis_card',
            'chart_analysis_card_type': card_type,  # 'card1' or 'card2'
            'timeframe': timeframe,
            'card_data': card_data,
            'is_overlap': is_overlap,  # 중첩 카드 여부
            'timestamp': datetime.now().isoformat()
        }
        
        # 전체 카드 정보를 JSON 문자열로 변환 (index.html과 동일)
        card_json = json.dumps(full_card_data, ensure_ascii=False, default=str)
        
        # metadata 구성 (index.html과 동일한 구조)
        metadata = {
            'card_id': card_id,
            'card_key': card_key,  # N/B 값 기반 card_key
            'card_type': 'chart_analysis_card',
            'chart_analysis_card_type': card_type,
            'timeframe': timeframe,
            'nb_value': nb_value,
            'nb_max': nb_max,
            'nb_min': nb_min,
            'is_overlap': is_overlap,  # 중첩 카드 여부
            'full_card_data': True,  # 전체 카드 데이터 저장 플래그
            'timestamp': datetime.now().isoformat()
        }
        
        # 카드 저장 처리
        result = {}
        
        # 저장 전에 nbverse_storage 확인
        if not nbverse_storage:
            print(f"❌ nbverse_storage가 초기화되지 않았습니다!")
            return jsonify({'error': 'NBVerse 저장소가 초기화되지 않았습니다.'}), 500
        
        print(f"📝 카드 저장 시작: card_type={card_type}, nb_value={nb_value}, nb_max={nb_max}, nb_min={nb_min}")
        
        # 빠른 응답을 위해 먼저 응답 반환 후 백그라운드에서 저장 수행
        # 응답 객체 먼저 생성
        response_data = {
            'success': True,
            'card_id': card_id,
            'card_key': card_key,
            'is_overlap': is_overlap,
            'timestamp': datetime.now().isoformat()
        }
        
        # card2, card3는 MAX/MIN 경로에 저장
        if card_type in ['card2', 'card3'] and nb_max is not None and nb_min is not None:
            try:
                print(f"🔍 save_nb_values 호출: bit_max={nb_max}, bit_min={nb_min}")
                # nb_max, nb_min 값을 그대로 전달 (NBVerse 내부에서 변환 처리)
                result = nbverse_storage.save_nb_values(
                    bit_max=nb_max,
                    bit_min=nb_min,
                    text=card_json,
                    metadata=metadata
                )
                
                print(f"✅ {card_type} 카드 N/B MAX/MIN 경로 저장 완료:")
                print(f"   MAX 경로: {result.get('max_path', 'N/A')}")
                print(f"   MIN 경로: {result.get('min_path', 'N/A')}")
                response_data['max_path'] = result.get('max_path')
                response_data['min_path'] = result.get('min_path')
            except Exception as save_error:
                print(f"⚠️ 카드 저장 오류 (계속): {save_error}")
                import traceback
                traceback.print_exc()
                # 응답은 성공으로 반환 (클라이언트 시간제한 해제)
                # 저장 실패는 로그에만 기록
        else:
            # card1 또는 N/B 값이 없으면 일반 저장
            try:
                print(f"🔍 save_text 호출: card_type={card_type}")
                result = nbverse_storage.save_text(card_json, metadata=metadata)
                print(f"✅ {card_type} 카드 일반 저장 완료: card_id={card_id}")
            except Exception as save_error:
                print(f"⚠️ 카드 저장 오류 (계속): {save_error}")
                import traceback
                traceback.print_exc()
                # 응답은 성공으로 반환
        
        # production_card_manager 캐시에 카드 추가 (update API가 찾을 수 있도록)
        if production_card_manager:
            try:
                # 카드를 캐시에 추가
                production_card_manager.cards_cache.append(full_card_data)
                # 인덱스 재구성
                production_card_manager._rebuild_indexes()
                print(f"✅ 카드가 production_card_manager 캐시에 추가됨: {card_id}")
            except Exception as cache_error:
                print(f"⚠️ 캐시 추가 오류 (계속): {cache_error}")
        
        print(f"✅ API 응답 전송: {response_data}")
        return jsonify(response_data)
    except Exception as e:
        import traceback
        error_msg = str(e)
        tb_str = traceback.format_exc()
        print(f"❌ 차트 분석 카드 저장 오류: {error_msg}")
        print(f"❌ 스택 트레이스:\n{tb_str}")
        
        # 오류 상황도 응답 반환 (클라이언트 타임아웃 방지)
        return jsonify({
            'success': False, 
            'error': error_msg,
            'card_id': card_id if 'card_id' in locals() else None,
            'timestamp': datetime.now().isoformat()
        }), 200  # 200으로 반환 (클라이언트가 재시도 필요)


# 차트 분석 카드 조회 API (nb_min / nb_max 조건으로 NBVerse 저장소 검색)
@app.route('/api/cards/chart-analysis/query', methods=['POST'])
def query_chart_analysis_cards():
    try:
        if not nbverse_storage:
            return jsonify({'error': 'NBVerse 저장소가 초기화되지 않았습니다.'}), 500

        def to_float(val):
            try:
                return float(val) if val is not None else None
            except Exception:
                return None

        payload = request.get_json(silent=True) or {}
        nb_min_input = payload.get('nb_min')
        nb_max_input = payload.get('nb_max')
        nb_min = to_float(nb_min_input)
        nb_max = to_float(nb_max_input)

        # 입력 검증: 둘 다 없으면 의미 없는 조회이므로 차단
        if nb_min is None and nb_max is None:
            return jsonify({
                'error': 'nb_min 또는 nb_max 중 하나 이상을 숫자로 보내주세요.',
                'nb_min': nb_min_input,
                'nb_max': nb_max_input
            }), 400

        # 숫자로 변환 실패 시 오류 반환
        if (nb_min_input is not None and nb_min is None) or (nb_max_input is not None and nb_max is None):
            return jsonify({
                'error': 'nb_min/nb_max는 숫자여야 합니다.',
                'nb_min': nb_min_input,
                'nb_max': nb_max_input
            }), 400

        limit_raw = payload.get('limit', 20)
        try:
            limit = max(1, int(limit_raw))
        except Exception:
            limit = 20

        current_file_dir = os.path.dirname(os.path.abspath(__file__))
        parent_dir = os.path.dirname(os.path.dirname(current_file_dir))  # v0.0.0.4
        data_dir = os.path.join(parent_dir, "data", "nbverse")

        target_dirs = [
            os.path.join(data_dir, "max"),
            os.path.join(data_dir, "min"),
            os.path.join(data_dir, "cards"),
        ]

        results = []
        seen_ids = set()
        scanned_files = 0
        max_scan = 5000  # 안전장치: 너무 큰 디렉토리 전체 스캔 방지

        for base_dir in target_dirs:
            if not os.path.exists(base_dir):
                continue
            for root, _, files in os.walk(base_dir):
                for filename in files:
                    if not filename.endswith('.json'):
                        continue
                    file_path = os.path.join(root, filename)
                    scanned_files += 1
                    if scanned_files > max_scan:
                        break
                    try:
                        data = nbverse_storage.load_from_path(file_path)
                        metadata = data.get('metadata', {}) if isinstance(data, dict) else {}
                        card_payload = None
                        if isinstance(data, dict):
                            card_payload = data.get('data') or data.get('content')
                            if not card_payload and isinstance(data.get('text'), str):
                                card_payload = data.get('text')
                            if isinstance(card_payload, str):
                                try:
                                    card_payload = json.loads(card_payload)
                                except Exception:
                                    pass

                        stored_nb_min = to_float(metadata.get('nb_min'))
                        stored_nb_max = to_float(metadata.get('nb_max'))

                        # 메타데이터에 없으면 카드 본문에서 보충
                        if stored_nb_min is None and isinstance(card_payload, dict):
                            stored_nb_min = to_float(card_payload.get('nb_min') or card_payload.get('nbMin'))
                        if stored_nb_max is None and isinstance(card_payload, dict):
                            stored_nb_max = to_float(card_payload.get('nb_max') or card_payload.get('nbMax'))

                        # 필터: nb_min → 저장된 nb_min >= 요청 nb_min, nb_max → 저장된 nb_max <= 요청 nb_max
                        if nb_min is not None:
                            if stored_nb_min is None or stored_nb_min < nb_min:
                                continue
                        if nb_max is not None:
                            if stored_nb_max is None or stored_nb_max > nb_max:
                                continue

                        card_id = metadata.get('card_id') or (data.get('card_id') if isinstance(data, dict) else None)
                        dedup_key = card_id or file_path
                        if dedup_key in seen_ids:
                            continue
                        seen_ids.add(dedup_key)

                        results.append({
                            'card_id': card_id,
                            'card_key': metadata.get('card_key'),
                            'card_type': metadata.get('card_type'),
                            'chart_analysis_card_type': metadata.get('chart_analysis_card_type'),
                            'timeframe': metadata.get('timeframe'),
                            'nb_value': metadata.get('nb_value'),
                            'nb_max': stored_nb_max,
                            'nb_min': stored_nb_min,
                            'is_overlap': metadata.get('is_overlap', False),
                            'file_path': file_path,
                            'metadata': metadata,
                            'card_data': card_payload if isinstance(card_payload, dict) else None
                        })

                        if len(results) >= limit:
                            break
                    except Exception as load_err:
                        print(f"⚠️ 카드 조회 중 로드 실패: {file_path} -> {load_err}")
                        continue
                if len(results) >= limit or scanned_files > max_scan:
                    break
            if len(results) >= limit or scanned_files > max_scan:
                break

        return jsonify({
            'success': True,
            'count': len(results),
            'cards': results,
            'scanned_files': scanned_files,
            'max_scan': max_scan,
            'request_nb_min': nb_min,
            'request_nb_max': nb_max
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# AI 예측 모델 저장소
_prediction_models = {}  # {interval: {model_type: model}}

def get_prediction_model(model_type='RandomForest', interval='minute10'):
    """예측 모델 가져오기"""
    try:
        if interval not in _prediction_models:
            _prediction_models[interval] = {}
        if model_type not in _prediction_models[interval]:
            return None
        return _prediction_models[interval][model_type]
    except Exception as e:
        print(f"⚠️ 모델 가져오기 오류: {e}")
        return None


# 모델 상태 조회 API
@app.route('/api/ai/model/status', methods=['GET'])
def api_ai_model_status():
    """모델 상태 조회: 주어진 interval과 model_type에 대해 학습된 모델이 있는지 반환합니다."""
    try:
        model_type = request.args.get('model_type', 'RandomForest')
        interval = request.args.get('interval', 'minute10')

        # 모델 메모리/파일 상태 동기화: 파일 기반 모델이 있으면 메모리에 로드 시도
        try:
            load_saved_models()
        except Exception:
            pass

        model = get_prediction_model(model_type, interval)
        model_exists = model is not None

        # 간단한 가시성: 사용 가능한 모델 목록도 포함 (메모리 및 파일 기반)
        available = []
        try:
            if interval in _prediction_models:
                available = list(_prediction_models[interval].keys())
            # 파일 기반 모델 확인
            models_dir = _models_dir_path()
            if os.path.exists(models_dir):
                for fname in os.listdir(models_dir):
                    if not fname.endswith('.pkl'):
                        continue
                    parts = fname[:-4].split('_')
                    if len(parts) >= 3 and parts[1] == interval:
                        mt = '_'.join(parts[2:])
                        if mt not in available:
                            available.append(mt)
        except Exception:
            available = []

        return jsonify({
            'success': True,
            'model_exists': model_exists,
            'model_type': model_type,
            'interval': interval,
            'available_models_for_interval': available
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/ai/model/list', methods=['GET'])
def api_ai_model_list():
    """디버그용: 메모리에 로드된 모델 구조 반환"""
    try:
        load_saved_models()
    except Exception:
        pass
    try:
        summary = {k: list(v.keys()) for k, v in _prediction_models.items()}
        return jsonify({'success': True, 'models': summary})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _models_dir_path():
    """모델 파일 저장 디렉토리 경로 반환 (v0.0.0.4/data/models)"""
    current_file_dir = os.path.dirname(os.path.abspath(__file__))  # html_version/api
    parent_dir = os.path.dirname(os.path.dirname(current_file_dir))  # v0.0.0.4
    models_dir = os.path.join(parent_dir, 'data', 'models')
    os.makedirs(models_dir, exist_ok=True)
    return models_dir


def save_prediction_model(model, model_type='RandomForest', interval='minute10'):
    """모델을 파일로 저장하고 메모리에 등록합니다."""
    try:
        import pickle
        models_dir = _models_dir_path()
        filename = f"model_{interval}_{model_type}.pkl"
        path = os.path.join(models_dir, filename)
        with open(path, 'wb') as f:
            pickle.dump(model, f)
        if interval not in _prediction_models:
            _prediction_models[interval] = {}
        _prediction_models[interval][model_type] = model
        print(f"✅ 모델 저장 완료: {path}")
        return path
    except Exception as e:
        print(f"⚠️ 모델 저장 실패: {e}")
        import traceback
        traceback.print_exc()
        return None


def load_saved_models():
    """모델 디렉토리에서 저장된 모델을 로드하여 메모리에 복원합니다."""
    try:
        import pickle
        models_dir = _models_dir_path()
        for fname in os.listdir(models_dir):
            if not fname.endswith('.pkl'):
                continue
            try:
                parts = fname[:-4].split('_')
                # filename 형식: model_{interval}_{model_type}.pkl
                if len(parts) < 3:
                    continue
                interval = parts[1]
                model_type = '_'.join(parts[2:])
                path = os.path.join(models_dir, fname)
                with open(path, 'rb') as f:
                    model = pickle.load(f)
                if interval not in _prediction_models:
                    _prediction_models[interval] = {}
                _prediction_models[interval][model_type] = model
                # 모델을 디스크에 저장해서 재시작 후에도 사용 가능하게 함
                try:
                    save_prediction_model(model, model_type=model_type, interval=interval)
                except Exception:
                    pass
                print(f"✅ 모델 로드 완료: {path}")
            except Exception as e:
                print(f"⚠️ 모델 로드 실패 ({fname}): {e}")
                import traceback
                traceback.print_exc()
    except Exception as e:
        print(f"⚠️ 저장된 모델 로드 중 오류: {e}")
        import traceback
        traceback.print_exc()

# AI 예측 API
@app.route('/api/ai/predict', methods=['GET', 'POST'])
def api_ai_predict():
    """AI 예측 API - 200개 그래프 데이터, N/B MAX, N/B MIN, 분봉으로 학습"""
    try:
        # 요청 데이터 파싱
        if request.method == 'POST':
            data = request.json or {}
        else:
            data = request.args.to_dict()
        
        market = data.get('market', 'KRW-BTC')
        interval = data.get('interval', 'minute10')
        count = int(data.get('count', 200))
        n = int(data.get('n', 10))  # 예측할 미래 캔들 수
        model_type = data.get('model_type', 'RandomForest')
        train = data.get('train', False)  # 학습 여부
        ohlcv_data = data.get('ohlcv_data', None)  # 클라이언트에서 전달한 데이터
        # 클라이언트가 N/B 값만 제공할 수 있도록 허용
        nb_max_client = data.get('nb_max', None)
        nb_min_client = data.get('nb_min', None)

        nb_only_mode = False
        # OHLCV 데이터 가져오기 (우선 클라이언트 제공 데이터 사용)
        if ohlcv_data and isinstance(ohlcv_data, list) and len(ohlcv_data) > 0:
            df_data = []
            for item in ohlcv_data[-200:]:  # 최근 200개만 사용
                df_data.append({
                    'open': float(item.get('open', 0)),
                    'high': float(item.get('high', 0)),
                    'low': float(item.get('low', 0)),
                    'close': float(item.get('close', 0)),
                    'volume': float(item.get('volume', 0))
                })
        else:
            # 클라이언트가 nb_max/nb_min 만 보낸 경우에는 NB 전용 모드로 처리 (가격 데이터 전송 금지 요구에 대응)
            if nb_max_client is not None and nb_min_client is not None:
                nb_only_mode = True
                df_data = []
            else:
                # API에서 직접 가져오기
                df = pyupbit.get_ohlcv(market, interval=interval, count=count)
                if df is None or df.empty:
                    return jsonify({'error': '차트 데이터를 가져올 수 없습니다.'}), 500
                df_data = df.to_dict('records')

        # 학습(또는 일반) 시 OHLCV가 필요한 경우 검사
        # 중요: 학습(train=true) 시 클라이언트가 제공한 N/B에 대해서는
        # "계산에 사용한 차트(ohlcv_data)"를 반드시 함께 전송해야 합니다.
        # 서버가 pyupbit에서 임의로 가져오지 않습니다.
        if train and nb_only_mode:
            # client did not provide ohlcv_data but provided nb_max/nb_min
            return jsonify({'error': '학습 시에는 N/B 계산에 사용한 차트(ohlcv_data)를 함께 전송하세요.'}), 400

        if not nb_only_mode and len(df_data) < 200:
            return jsonify({'error': f'데이터가 부족합니다. (필요: 200개, 현재: {len(df_data)}개)'}), 400
        
        # N/B 값 계산 (최근 200개 데이터) - 클라이언트 제공값 우선
        if nb_only_mode:
            try:
                nb_max = float(nb_max_client)
                nb_min = float(nb_min_client)
            except Exception:
                return jsonify({'error': '유효한 nb_max/nb_min 값을 제공하세요.'}), 400
        else:
            # Use the NBVerse helper to compute N/B from chart data (do not let ML compute this)
            prices = [float(d['close']) for d in df_data]
            if len(prices) < 2:
                return jsonify({'error': 'N/B 값 계산을 위한 데이터가 부족합니다.'}), 400

            # Prepare chart_data structure expected by calculate_nb_value_from_chart
            chart_data_for_nb = {
                'prices': prices[-200:],
                'timeframe': interval,
                'current_price': prices[-1] if prices else 0
            }

            # Compute normalized nb_value using helper (this is not ML computation)
            try:
                nb_value = calculate_nb_value_from_chart(
                    chart_data_for_nb,
                    nbverse_storage=nbverse_storage,
                    nbverse_converter=nbverse_converter,
                    settings_manager=settings_manager
                )
            except Exception:
                nb_value = None

            # If NBVerse converter is available, extract bitMax/bitMin from it for nb_max/nb_min
            if nbverse_converter is not None:
                try:
                    prices_str = ",".join([str(p) for p in prices[-200:]])
                    result = nbverse_converter.text_to_nb(prices_str)
                    bit_max = result.get('bitMax', 5.5)
                    bit_min = result.get('bitMin', 5.5)
                    nb_max = max(0.0, min(1.0, bit_max / 10.0))
                    nb_min = max(0.0, min(1.0, bit_min / 10.0))
                except Exception:
                    bit_max = 5.5
                    bit_min = 5.5
                    nb_max = nb_min = nb_value if nb_value is not None else 0.5
            else:
                # Fallback: compute simple nb_max/nb_min from price changes (deterministic helper)
                price_changes = []
                for i in range(1, len(prices)):
                    if prices[i-1] > 0:
                        change = (prices[i] - prices[i-1]) / prices[i-1]
                        price_changes.append(change)
                if price_changes:
                    bit_max = max(price_changes) * 10
                    bit_min = min(price_changes) * 10
                    nb_max = max(0.0, min(1.0, bit_max / 10.0))
                    nb_min = max(0.0, min(1.0, bit_min / 10.0))
                else:
                    nb_max = nb_min = nb_value if nb_value is not None else 0.5
        
        # 학습 데이터 준비
        X_train = []
        y_train = []
        curr_prices = []
        
        # 분봉을 숫자로 변환
        interval_map = {
            'minute1': 1, 'minute3': 3, 'minute5': 5, 'minute10': 10,
            'minute15': 15, 'minute30': 30, 'minute60': 60, 'day': 1440
        }
        interval_value = interval_map.get(interval, 10)
        
        # 특징 추출: 각 캔들의 OHLCV + N/B MAX/MIN + 분봉
        for i in range(50, len(df_data)):  # 최소 50개는 필요
            features = []
            # 최근 10개 캔들의 OHLCV 데이터
            for j in range(max(0, i-10), i):
                features.extend([
                    df_data[j]['open'],
                    df_data[j]['high'],
                    df_data[j]['low'],
                    df_data[j]['close'],
                    df_data[j]['volume']
                ])
            # N/B MAX, N/B MIN 추가
            features.append(nb_max)
            features.append(nb_min)
            # 분봉 추가
            features.append(interval_value)
            
            # 타겟: 다음 캔들의 종가
            if i < len(df_data) - 1:
                X_train.append(features)
                y_train.append(df_data[i+1]['close'])
                # 현재(샘플 기준) 가격 저장 (i번째 캔들 종가)
                try:
                    curr_prices.append(float(df_data[i]['close']))
                except Exception:
                    curr_prices.append(float(df_data[i]['close']) if df_data[i].get('close') else 0.0)
        
        if len(X_train) < 10:
            return jsonify({'error': '학습 데이터가 부족합니다.'}), 400
        
        # 모델 학습 또는 예측
        if train or get_prediction_model(model_type, interval) is None:
            # 모델 학습
            try:
                from sklearn.ensemble import RandomForestRegressor
                from sklearn.model_selection import train_test_split
                from sklearn.metrics import r2_score, mean_squared_error
                
                # 학습/검증 데이터 분리 (현재 가격 배열도 함께 분리)
                X_train_split, X_val_split, y_train_split, y_val_split, curr_train, curr_val = train_test_split(
                    X_train, y_train, curr_prices, test_size=0.2, random_state=42
                )
                
                # 모델 생성 및 학습
                if model_type == 'RandomForest':
                    model = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
                else:
                    from sklearn.linear_model import LinearRegression
                    model = LinearRegression()
                
                model.fit(X_train_split, y_train_split)
                
                # 검증
                train_pred = model.predict(X_train_split)
                val_pred = model.predict(X_val_split)
                train_r2 = r2_score(y_train_split, train_pred)
                val_r2 = r2_score(y_val_split, val_pred)
                # 추가 검증 지표: MSE, MAE
                from sklearn.metrics import mean_absolute_error
                train_mse = float(mean_squared_error(y_train_split, train_pred))
                val_mse = float(mean_squared_error(y_val_split, val_pred))
                train_mae = float(mean_absolute_error(y_train_split, train_pred))
                val_mae = float(mean_absolute_error(y_val_split, val_pred))
                # 손실률(예측 기준): 예측이 현재 가격보다 낮은 비율
                try:
                    train_predicted_loss_rate = float(sum(1 for p,c in zip(train_pred, curr_train) if p < c) / max(1, len(train_pred)))
                    train_actual_loss_rate = float(sum(1 for t,c in zip(y_train_split, curr_train) if t < c) / max(1, len(y_train_split)))
                    val_predicted_loss_rate = float(sum(1 for p,c in zip(val_pred, curr_val) if p < c) / max(1, len(val_pred)))
                    val_actual_loss_rate = float(sum(1 for t,c in zip(y_val_split, curr_val) if t < c) / max(1, len(y_val_split)))
                except Exception:
                    train_predicted_loss_rate = train_actual_loss_rate = val_predicted_loss_rate = val_actual_loss_rate = None
                
                # 모델 저장
                if interval not in _prediction_models:
                    _prediction_models[interval] = {}
                _prediction_models[interval][model_type] = model
                
                print(f"✅ 모델 학습 완료: {model_type} ({interval}), 학습 데이터: {len(X_train_split)}개, 검증 R2: {val_r2:.4f}")
                
                return jsonify({
                    'success': True,
                    'model_type': model_type,
                    'training_data_count': len(X_train_split),
                    'train_r2': train_r2,
                    'val_r2': val_r2,
                    'train_mse': train_mse,
                    'val_mse': val_mse,
                    'train_mae': train_mae,
                    'val_mae': val_mae,
                    'train_predicted_loss_rate': train_predicted_loss_rate,
                    'train_actual_loss_rate': train_actual_loss_rate,
                    'val_predicted_loss_rate': val_predicted_loss_rate,
                    'val_actual_loss_rate': val_actual_loss_rate,
                    'model_saved': True
                })
            except ImportError:
                return jsonify({'error': 'scikit-learn이 설치되지 않았습니다. pip install scikit-learn'}), 500
            except Exception as e:
                import traceback
                traceback.print_exc()
                return jsonify({'error': f'모델 학습 실패: {str(e)}'}), 500
        
        # 예측 수행
        model = get_prediction_model(model_type, interval)
        if model is None:
            return jsonify({'error': '모델이 학습되지 않았습니다. train=true로 먼저 학습하세요.'}), 400
        
        # 최근 데이터로 예측
        last_features = []
        # NB 전용 모드일 경우 가격 정보를 전송하지 않으므로 OHLCV 부분은 0으로 채움
        if nb_only_mode:
            # 10 캔들 x 5 필드 = 50 zeros
            last_features = [0.0] * (10 * 5)
            last_features.append(nb_max)
            last_features.append(nb_min)
            last_features.append(interval_value)
        else:
            for j in range(max(0, len(df_data)-10), len(df_data)):
                last_features.extend([
                    df_data[j]['open'],
                    df_data[j]['high'],
                    df_data[j]['low'],
                    df_data[j]['close'],
                    df_data[j]['volume']
                ])
            last_features.append(nb_max)
            last_features.append(nb_min)
            last_features.append(interval_value)
        
        # 예측
        predictions = []
        current_features = last_features.copy()
        # 현재 가격: 가능하면 서버에서 직접 조회 (클라이언트로부터 가격을 받지 않음)
        current_price = None
        if not nb_only_mode and len(df_data) > 0:
            current_price = float(df_data[-1]['close'])
        else:
            try:
                current_price = pyupbit.get_current_price(market)
                if current_price is None:
                    current_price = None
                else:
                    current_price = float(current_price)
            except Exception:
                current_price = None
        
        for _ in range(n):
            pred_price = model.predict([current_features])[0]
            change_percent = None
            try:
                if current_price is not None and float(current_price) != 0:
                    change_percent = float((pred_price - current_price) / current_price * 100)
            except Exception:
                change_percent = None
            predictions.append({
                'price': float(pred_price),
                'change_percent': change_percent
            })
            # 다음 예측을 위한 특징 업데이트 (간단한 방식)
            current_price = pred_price
            # 특징 업데이트 (마지막 캔들 정보를 예측값으로 업데이트)
            if len(current_features) >= 5:
                current_features = current_features[5:] + [pred_price, pred_price, pred_price, pred_price, 0]
                current_features[-3] = nb_max
                current_features[-2] = nb_min
                current_features[-1] = interval_value
        # 예측 손실률: 예측된 n개 중 현재 가격보다 낮은 비율
        try:
            if current_price is not None:
                pred_loss_count = sum(1 for p in predictions if p.get('price', 0) < float(current_price))
                predicted_loss_rate = float(pred_loss_count) / max(1, len(predictions))
            else:
                predicted_loss_rate = None
        except Exception:
            predicted_loss_rate = None

        resp = {
            'success': True,
            'predictions': predictions,
            'predicted_loss_rate': predicted_loss_rate,
            'nb_max': nb_max,
            'nb_min': nb_min,
            'interval': interval,
            'model_type': model_type
        }
        if current_price is not None:
            resp['current_price'] = float(current_price)

        return jsonify(resp)
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# 카드 기반 AI 제거됨

# 카드 기반 AI 학습 API
@app.route('/api/card-ai/train', methods=['POST'])
def card_ai_train():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 카드 기반 AI 예측 API
@app.route('/api/card-ai/predict', methods=['POST'])
def card_ai_predict():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 카드 기반 AI 모델 정보 API
@app.route('/api/card-ai/info', methods=['GET'])
def card_ai_info():
    """AI 학습 기능 제거됨"""
    return jsonify({'error': 'AI 학습 기능이 제거되었습니다.'}), 410

# 헬스 체크
@app.route('/api/health', methods=['GET'])
def health():
    """헬스 체크"""
    return jsonify({
        'status': 'ok',
        'nbverse_initialized': nbverse_storage is not None,
        'prediction_model_available': False,  # AI 학습 기능 제거됨
        'card_ai_available': False,  # AI 학습 기능 제거됨
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    init_app()
    print("\n" + "="*60)
    print("🚀 Trading Bot API 서버 시작 (Waitress - 프로덕션 모드)")
    print("="*60)
    print(f"📍 서버 주소: http://localhost:5000")
    print(f"📍 API 엔드포인트: http://localhost:5000/api")
    print(f"📍 헬스 체크: http://localhost:5000/api/health")
    print(f"⚡ 멀티스레딩: 4 threads")
    print("="*60 + "\n")
    
    # Waitress 프로덕션 서버 사용 (Windows 최적화, 개발 서버보다 10-20배 빠름)
    try:
        from waitress import serve
        serve(app, host='0.0.0.0', port=5000, threads=4, channel_timeout=300)
    except ImportError:
        print("⚠️ Waitress가 설치되지 않았습니다. 개발 서버로 실행합니다.")
        print("   빠른 실행을 원하면: pip install waitress")
        app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)


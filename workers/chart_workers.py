"""차트 관련 워커 클래스들"""
from PyQt6.QtCore import QThread, pyqtSignal
from datetime import datetime
import pyupbit
import numpy as np


class ChartDataWorker(QThread):
    """차트 데이터를 백그라운드에서 가져오는 워커 스레드"""
    data_ready = pyqtSignal(dict)  # 데이터 준비 시그널
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, timeframe, count=200):
        super().__init__()
        self.timeframe = timeframe
        self.count = count
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            # 타임프레임을 pyupbit 형식으로 변환
            interval_map = {
                '1m': 'minute1',
                '3m': 'minute3',
                '5m': 'minute5',
                '15m': 'minute15',
                '30m': 'minute30',
                '60m': 'minute60',
                '1d': 'day'
            }
            
            pyupbit_interval = interval_map.get(self.timeframe)
            if not pyupbit_interval:
                self.error_occurred.emit(f"지원하지 않는 타임프레임: {self.timeframe}")
                return
            
            # 가격 데이터 조회 (백그라운드에서 실행)
            df = pyupbit.get_ohlcv("KRW-BTC", interval=pyupbit_interval, count=self.count)
            
            if df is None or df.empty:
                self.error_occurred.emit("차트 데이터를 가져올 수 없습니다.")
                return
            
            # 차트 데이터 구성
            chart_data = {
                'timeframe': self.timeframe,
                'prices': df['close'].tolist(),
                'timestamps': df.index.strftime('%Y-%m-%d %H:%M:%S').tolist(),
                'volumes': df['volume'].tolist(),
                'highs': df['high'].tolist(),
                'lows': df['low'].tolist(),
                'opens': df['open'].tolist(),
                'current_price': float(df['close'].iloc[-1]),
                'min_price': float(df['low'].min()),
                'max_price': float(df['high'].max()),
                'generated_at': datetime.now().isoformat()
            }
            
            # 데이터 준비 완료 시그널 발생
            self.data_ready.emit(chart_data)
        except Exception as e:
            self.error_occurred.emit(f"차트 데이터 조회 오류: {str(e)}")


class ChartAIAnalysisWorker(QThread):
    """차트 AI 분석을 백그라운드에서 실행하는 워커 스레드"""
    analysis_ready = pyqtSignal(dict)  # AI 분석 결과 준비 완료 시그널 (signal, message)
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, chart_data, timeframe, ml_enabled, load_ml_model_func):
        super().__init__()
        self.chart_data = chart_data
        self.timeframe = timeframe
        self.ml_enabled = ml_enabled
        self.load_ml_model_func = load_ml_model_func
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            if not self.ml_enabled:
                self.analysis_ready.emit({
                    'signal': 'HOLD',
                    'message': 'AI 분석 비활성화됨'
                })
                return
            
            # 타임프레임을 pyupbit 형식으로 변환
            interval_map = {
                '1m': 'minute1',
                '3m': 'minute3',
                '5m': 'minute5',
                '15m': 'minute15',
                '30m': 'minute30',
                '60m': 'minute60',
                '1d': 'day'
            }
            pyupbit_interval = interval_map.get(self.timeframe, 'minute10')
            
            # ML 모델 로드
            model_pack = self.load_ml_model_func(pyupbit_interval)
            if not model_pack:
                self.analysis_ready.emit({
                    'signal': 'HOLD',
                    'message': 'ML 모델 로드 실패'
                })
                return
            
            # 차트 데이터에서 가격 정보 추출
            current_price = self.chart_data.get('current_price', 0)
            if current_price <= 0:
                self.analysis_ready.emit({
                    'signal': 'HOLD',
                    'message': '가격 데이터 없음'
                })
                return
            
            # pyupbit으로 최신 데이터 가져오기 (더 정확한 분석을 위해)
            df = pyupbit.get_ohlcv("KRW-BTC", interval=pyupbit_interval, count=200)
            if df is None or df.empty:
                self.analysis_ready.emit({
                    'signal': 'HOLD',
                    'message': '차트 데이터 없음'
                })
                return
            
            # 간단한 특징 계산
            window = model_pack.get('window', 50)
            ema_fast = model_pack.get('ema_fast', 10)
            ema_slow = model_pack.get('ema_slow', 30)
            
            # EMA 계산
            ema_f = df['close'].ewm(span=ema_fast, adjust=False).mean()
            ema_s = df['close'].ewm(span=ema_slow, adjust=False).mean()
            
            # r 값 계산
            price_changes = df['close'].pct_change().fillna(0)
            r_simple = (price_changes.rolling(window).mean() + 0.5).clip(0, 1)
            r_value = float(r_simple.iloc[-1]) if len(r_simple) > 0 else 0.5
            
            # Zone 판단
            HIGH = 0.55
            LOW = 0.45
            current_zone = 'BLUE' if r_value < 0.5 else 'ORANGE'
            
            # ML 예측 시도
            model = model_pack.get('model')
            predicted_action = 'HOLD'
            confidence = 50.0
            
            if model:
                try:
                    # 기본 특징 생성
                    close_val = float(df['close'].iloc[-1])
                    high_val = float(df['high'].iloc[-1])
                    low_val = float(df['low'].iloc[-1])
                    
                    w = (df['high'].rolling(window).max().iloc[-1] - df['low'].rolling(window).min().iloc[-1]) / ((high_val + low_val) / 2) if (high_val + low_val) > 0 else 0.0
                    
                    ema_f_val = float(ema_f.iloc[-1]) if len(ema_f) > 0 else close_val
                    ema_s_val = float(ema_s.iloc[-1]) if len(ema_s) > 0 else close_val
                    ema_diff = ema_f_val - ema_s_val
                    
                    r_ema3 = r_simple.ewm(span=3, adjust=False).mean().iloc[-1] if len(r_simple) > 0 else r_value
                    r_ema5 = r_simple.ewm(span=5, adjust=False).mean().iloc[-1] if len(r_simple) > 0 else r_value
                    dr = r_simple.diff().iloc[-1] if len(r_simple) > 0 else 0.0
                    
                    ret1 = df['close'].pct_change(1).iloc[-1] if len(df) > 0 else 0.0
                    ret3 = df['close'].pct_change(3).iloc[-1] if len(df) > 2 else 0.0
                    ret5 = df['close'].pct_change(5).iloc[-1] if len(df) > 4 else 0.0
                    
                    # Zone features
                    zone_flag = 1 if current_zone == 'BLUE' else -1
                    dist_high = max(0, r_value - HIGH)
                    dist_low = max(0, LOW - r_value)
                    extreme_gap = abs(r_value - 0.5)
                    zone_conf = 1.0 - (extreme_gap / 0.1) if extreme_gap < 0.1 else 0.0
                    
                    # 특징 딕셔너리
                    feature_dict = {
                        'r': r_value,
                        'w': w,
                        'ema_f': ema_f_val / close_val if close_val > 0 else 1.0,
                        'ema_s': ema_s_val / close_val if close_val > 0 else 1.0,
                        'ema_diff': ema_diff / close_val if close_val > 0 else 0.0,
                        'r_ema3': r_ema3,
                        'r_ema5': r_ema5,
                        'dr': dr,
                        'ret1': ret1,
                        'ret3': ret3,
                        'ret5': ret5,
                        'zone_flag': zone_flag,
                        'dist_high': dist_high,
                        'dist_low': dist_low,
                        'extreme_gap': extreme_gap,
                        'zone_conf': zone_conf,
                    }
                    
                    # 학습된 특징 순서대로 배열 생성
                    trained_cols = model_pack.get('feature_names', [])
                    if trained_cols:
                        feature_values = [feature_dict.get(col, 0.0) for col in trained_cols]
                    else:
                        base_features = ['r', 'w', 'ema_f', 'ema_s', 'ema_diff', 'r_ema3', 'r_ema5', 'dr', 'ret1', 'ret3', 'ret5']
                        feature_values = [feature_dict.get(col, 0.0) for col in base_features]
                    
                    # 모델 예측
                    features_array = np.array([feature_values], dtype=np.float32)
                    
                    if hasattr(model, 'predict_proba'):
                        proba = model.predict_proba(features_array)[0]
                        if len(proba) >= 3:
                            prob_buy = proba[2] if len(proba) > 2 else 0.0
                            prob_hold = proba[1] if len(proba) > 1 else 0.0
                            prob_sell = proba[0] if len(proba) > 0 else 0.0
                            
                            # 예측 액션 결정 (차트는 보유 전 상태로 가정)
                            if prob_buy > prob_hold:
                                predicted_action = 'BUY'
                                confidence = prob_buy * 100
                            else:
                                predicted_action = 'HOLD'
                                confidence = prob_hold * 100
                    else:
                        prediction = model.predict(features_array)[0]
                        if prediction == 1:
                            predicted_action = 'BUY'
                        elif prediction == -1:
                            predicted_action = 'SELL'
                        else:
                            predicted_action = 'HOLD'
                        confidence = 60.0
                except Exception as e:
                    print(f"⚠️ 차트 ML 예측 실패: {e}")
            
            # 메시지 생성
            messages = []
            
            # 시그널 정보
            if predicted_action == 'BUY':
                messages.append(f"🟢 AI 추천: 매수 (신뢰도 {confidence:.0f}%)")
            elif predicted_action == 'SELL':
                messages.append(f"🔴 AI 추천: 매도 (신뢰도 {confidence:.0f}%)")
            else:
                messages.append(f"🟡 AI 권장: 관망 (신뢰도 {confidence:.0f}%)")
            
            # Zone 정보
            if current_zone == 'BLUE':
                messages.append(f"🔵 BLUE 구역 (r={r_value:.3f})")
            else:
                messages.append(f"🟠 ORANGE 구역 (r={r_value:.3f})")
            
            # 현재 가격
            messages.append(f"💰 현재 가격: {current_price:,.0f} KRW")
            
            # 추세 정보
            ema_trend = "상승" if ema_diff > 0 else "하락" if ema_diff < 0 else "횡보"
            messages.append(f"📈 추세: {ema_trend}")
            
            # 변동성 정보
            volatility_level = "높음" if w > 0.05 else "중간" if w > 0.02 else "낮음"
            messages.append(f"⚡ 변동성: {volatility_level}")
            
            self.analysis_ready.emit({
                'signal': predicted_action,
                'message': ' | '.join(messages)
            })
            
        except Exception as e:
            print(f"⚠️ 차트 AI 분석 오류: {e}")
            import traceback
            traceback.print_exc()
            self.error_occurred.emit(str(e))
            self.analysis_ready.emit({
                'signal': 'HOLD',
                'message': f'AI 분석 오류: {str(e)}'
            })


class NBMaxMinWorker(QThread):
    """N/B MAX/MIN 계산을 백그라운드에서 실행하는 워커 스레드"""
    max_min_ready = pyqtSignal(float, float)  # MAX, MIN 준비 완료 시그널
    
    def __init__(self, chart_data, nbverse_converter, settings_manager):
        super().__init__()
        self.chart_data = chart_data
        self.nbverse_converter = nbverse_converter
        self.settings_manager = settings_manager
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            if not self.nbverse_converter:
                return
            
            # 가격 데이터를 텍스트로 변환 (최근 200개 사용)
            prices_str = ",".join([str(p) for p in self.chart_data['prices'][-200:]])
            
            # NBVerse로 변환
            result = self.nbverse_converter.text_to_nb(prices_str)
            bit_max = result.get('bitMax', 5.5)
            bit_min = result.get('bitMin', 5.5)
            
            # 설정된 소수점 자릿수로 반올림
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            bit_max = round(bit_max, decimal_places)
            bit_min = round(bit_min, decimal_places)
            
            self.max_min_ready.emit(bit_max, bit_min)
        except Exception as e:
            print(f"⚠️ MAX/MIN 계산 오류: {e}")


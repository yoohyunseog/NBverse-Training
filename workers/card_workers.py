"""카드 관련 워커 클래스들"""
from PyQt6.QtCore import QThread, pyqtSignal
import time


class CardLoadWorker(QThread):
    """생산 카드 데이터를 백그라운드에서 로드하는 워커 스레드"""
    cards_ready = pyqtSignal(list)  # 카드 데이터 준비 시그널
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, production_card_manager):
        super().__init__()
        self.production_card_manager = production_card_manager
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            # 파일 로드 (백그라운드에서 실행)
            self.production_card_manager.load()
            # 생산 카드 탭에는 활성 카드만 표시 (검증 완료된 카드 제외)
            cards = self.production_card_manager.get_active_cards()
            
            # 최신순으로 정렬 (생산 시간 기준)
            cards = sorted(cards, key=lambda x: x.get('production_time', ''), reverse=True)
            
            # 렉 방지를 위해 최대 4개만 표시
            MAX_DISPLAY_CARDS = 4
            if len(cards) > MAX_DISPLAY_CARDS:
                cards = cards[:MAX_DISPLAY_CARDS]
            
            # 카드 데이터 준비 완료 시그널 발생
            self.cards_ready.emit(cards)
        except Exception as e:
            self.error_occurred.emit(f"카드 로드 오류: {str(e)}")


class CardProductionWorker(QThread):
    """생산 카드를 백그라운드에서 생성하는 워커 스레드"""
    card_created = pyqtSignal(dict)  # 카드 생성 완료 시그널
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    log_message = pyqtSignal(str)  # 로그 메시지 시그널
    progress_updated = pyqtSignal(int, str)  # 진행률 업데이트 시그널 (진행률, 메시지)
    
    def __init__(self, settings_manager, production_card_manager, nbverse_storage, nbverse_converter, 
                 chart_max_nb=None, chart_min_nb=None, chart_nb_value=None, chart_timeframe=None):
        super().__init__()
        self.settings_manager = settings_manager
        self.production_card_manager = production_card_manager
        self.nbverse_storage = nbverse_storage
        self.nbverse_converter = nbverse_converter
        # 좌측 차트에서 계산한 MAX/MIN 값 (동일한 값 사용)
        self.chart_max_nb = chart_max_nb
        self.chart_min_nb = chart_min_nb
        self.chart_nb_value = chart_nb_value  # 좌측 차트에서 계산한 N/B 값
        self.chart_timeframe = chart_timeframe
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            import random
            import pyupbit
            from datetime import datetime
            from nbverse_helper import calculate_nb_value_from_chart
            
            # 중단 요청 체크
            if self.isInterruptionRequested():
                return
            
            # 프로그레스바 초기화
            self.progress_updated.emit(0, "카드 생산 시작...")
            
            # 생산 가능한 타임프레임 목록 가져오기
            self.progress_updated.emit(5, "타임프레임 목록 가져오는 중...")
            log_msg = "📊 타임프레임 목록 가져오는 중..."
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            timeframes = self.settings_manager.get("production_timeframes", ["1m", "3m", "5m", "15m", "30m", "60m", "1d"])
            log_msg = f"📊 사용 가능한 타임프레임: {timeframes}"
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            
            # 중단 요청 체크
            if self.isInterruptionRequested():
                return
            
            if not timeframes:
                error_msg = "생산 가능한 타임프레임이 없습니다."
                print(f"[카드 생산] ❌ {error_msg}")
                self.log_message.emit(f"❌ {error_msg}")
                self.error_occurred.emit(error_msg)
                return
            
            # 우선순위: 좌측 max/min 값의 카드가 있는지 확인
            use_left_chart_values = False
            selected_timeframe = None
            existing_cards = self.production_card_manager.get_all_cards()  # 기존 카드 목록 가져오기
            
            if (self.chart_max_nb is not None and self.chart_min_nb is not None and 
                self.chart_timeframe and self.chart_timeframe in timeframes):
                # 좌측 차트의 max/min 값으로 카드가 이미 있는지 확인
                decimal_places = self.settings_manager.get("nb_decimal_places", 10)
                
                left_max_rounded = round(self.chart_max_nb, decimal_places)
                left_min_rounded = round(self.chart_min_nb, decimal_places)
                
                has_left_chart_card = False
                for card in existing_cards:
                    card_max = card.get('nb_max')
                    card_min = card.get('nb_min')
                    if card_max is not None and card_min is not None:
                        card_max_rounded = round(float(card_max), decimal_places)
                        card_min_rounded = round(float(card_min), decimal_places)
                        if (card_max_rounded == left_max_rounded and 
                            card_min_rounded == left_min_rounded):
                            has_left_chart_card = True
                            card_id = card.get('card_id', 'N/A')
                            log_msg = f"📊 좌측 max/min 값의 카드가 이미 존재합니다. (카드 ID: {card_id}, MAX: {left_max_rounded:.{decimal_places}f}, MIN: {left_min_rounded:.{decimal_places}f})"
                            print(f"[카드 생산] {log_msg}")
                            self.log_message.emit(log_msg)
                            break
                
                if not has_left_chart_card:
                    # 좌측 max/min 값의 카드가 없으면 우선적으로 생산
                    use_left_chart_values = True
                    selected_timeframe = self.chart_timeframe
                    log_msg = f"🎯 우선순위: 좌측 max/min 값의 카드 생산 (타임프레임: {selected_timeframe}, MAX: {left_max_rounded:.{decimal_places}f}, MIN: {left_min_rounded:.{decimal_places}f})"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
            
            # 좌측 max/min 카드가 있거나 값이 없으면 랜덤하게 타임프레임 선택
            if not use_left_chart_values:
                selected_timeframe = random.choice(timeframes)
                log_msg = f"✅ 랜덤 선택된 타임프레임: {selected_timeframe}"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
            
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
            
            pyupbit_interval = interval_map.get(selected_timeframe)
            if not pyupbit_interval:
                error_msg = f"지원하지 않는 타임프레임: {selected_timeframe}"
                print(f"[카드 생산] ❌ {error_msg}")
                self.log_message.emit(f"❌ {error_msg}")
                self.error_occurred.emit(error_msg)
                return
            
            # 중단 요청 체크
            if self.isInterruptionRequested():
                return
            
            # 가격 차트 데이터 가져오기 (백그라운드에서 실행)
            log_msg = f"📊 차트 데이터 조회 중... (타임프레임: {selected_timeframe}, interval: {pyupbit_interval}, 백그라운드 실행)"
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            df = pyupbit.get_ohlcv("KRW-BTC", interval=pyupbit_interval, count=200)
            # 네트워크 요청은 백그라운드에서 실행되므로 msleep 불필요
            
            # 중단 요청 체크
            if self.isInterruptionRequested():
                return
            
            if df is None or df.empty:
                error_msg = f"{selected_timeframe} 타임프레임의 차트 데이터를 가져올 수 없습니다."
                print(f"[카드 생산] ❌ {error_msg}")
                self.log_message.emit(f"❌ {error_msg}")
                self.error_occurred.emit(error_msg)
                return
            
            log_msg = f"✅ 차트 데이터 조회 완료: {len(df)}개 데이터 포인트"
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            
            # 차트 데이터 통계 정보
            data_start_time = df.index[0].strftime('%Y-%m-%d %H:%M:%S')
            data_end_time = df.index[-1].strftime('%Y-%m-%d %H:%M:%S')
            price_min = float(df['low'].min())
            price_max = float(df['high'].max())
            price_current = float(df['close'].iloc[-1])
            price_avg = float(df['close'].mean())
            volume_total = float(df['volume'].sum())
            volume_avg = float(df['volume'].mean())
            
            print(f"[카드 생산] 📊 데이터 기간: {data_start_time} ~ {data_end_time}")
            print(f"[카드 생산] 📊 가격 범위: 최소 {price_min:,.0f}원, 최대 {price_max:,.0f}원, 현재 {price_current:,.0f}원, 평균 {price_avg:,.0f}원")
            print(f"[카드 생산] 📊 거래량: 총 {volume_total:,.2f}, 평균 {volume_avg:,.2f}")
            
            log_msg = "📊 차트 데이터 처리 중..."
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            
            # 차트 데이터 구성
            chart_data = {
                'timeframe': selected_timeframe,
                'prices': df['close'].tolist(),
                'timestamps': df.index.strftime('%Y-%m-%d %H:%M:%S').tolist(),
                'volumes': df['volume'].tolist(),
                'highs': df['high'].tolist(),
                'lows': df['low'].tolist(),
                'opens': df['open'].tolist(),
                'current_price': price_current,
                'min_price': price_min,
                'max_price': price_max,
                'generated_at': datetime.now().isoformat()
            }
            
            print(f"[카드 생산] ✅ 차트 데이터 구성 완료 (가격 {len(chart_data['prices'])}개, 타임스탬프 {len(chart_data['timestamps'])}개)")
            
            # MAX, MIN 값 계산
            self.progress_updated.emit(30, "MAX/MIN 값 계산 중...")
            calc_start_time = time.time()
            decimal_places = self.settings_manager.get("nb_decimal_places", 10)
            
            # 좌측 차트 값 우선 사용 (우선순위 생산인 경우)
            if use_left_chart_values and (self.chart_max_nb is not None and self.chart_min_nb is not None):
                log_msg = f"📊 좌측 차트의 MAX/MIN N/B 값 사용 중... (우선순위 생산, 타임프레임: {selected_timeframe}, MAX: {self.chart_max_nb:.{decimal_places}f}, MIN: {self.chart_min_nb:.{decimal_places}f})"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                bit_max = self.chart_max_nb
                bit_min = self.chart_min_nb
                log_msg = f"✅ 좌측 차트와 동일한 타임프레임({selected_timeframe}) 및 MAX/MIN 값 사용 (우선순위)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
            elif (self.chart_max_nb is not None and self.chart_min_nb is not None and 
                self.chart_timeframe and self.chart_timeframe == selected_timeframe):
                # 좌측 차트에서 계산한 MAX/MIN 값이 있고 타임프레임이 일치하면 사용 (동일한 값 보장)
                log_msg = f"📊 좌측 차트의 MAX/MIN N/B 값 사용 중... (타임프레임: {selected_timeframe}, MAX: {self.chart_max_nb:.{decimal_places}f}, MIN: {self.chart_min_nb:.{decimal_places}f})"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                bit_max = self.chart_max_nb
                bit_min = self.chart_min_nb
                log_msg = f"✅ 좌측 차트와 동일한 타임프레임({selected_timeframe}) 및 MAX/MIN 값 사용"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
            else:
                # 좌측 차트 값이 없거나 타임프레임이 다르면 새로 계산
                # 좌측 차트와 동일한 방식으로 최근 200개 데이터 사용
                if self.chart_timeframe and self.chart_timeframe != selected_timeframe:
                    log_msg = f"📊 타임프레임이 다릅니다 (좌측: {self.chart_timeframe}, 생산: {selected_timeframe}). 새로 계산합니다."
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
                else:
                    log_msg = f"📊 MAX/MIN N/B 값 계산 중... (가격 데이터: {len(chart_data['prices'])}개, 최근 200개 사용, 백그라운드 실행)"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
                
                # 좌측 차트와 동일한 방식: 최근 200개 데이터 사용
                prices_to_use = chart_data['prices'][-200:] if len(chart_data['prices']) > 200 else chart_data['prices']
                print(f"[카드 생산]    → 가격 문자열 변환 중... (전체: {len(chart_data['prices'])}개, 사용: {len(prices_to_use)}개)")
                prices_str = ",".join([str(p) for p in prices_to_use])
                print(f"[카드 생산]    → N/B 변환기 실행 중... (문자열 길이: {len(prices_str)}자)")
                result = self.nbverse_converter.text_to_nb(prices_str)
                # 백그라운드에서 실행되므로 msleep 불필요
                
                bit_max = result.get('bitMax', 5.5)
                bit_min = result.get('bitMin', 5.5)
                
                bit_max = round(bit_max, decimal_places)
                bit_min = round(bit_min, decimal_places)
            
            calc_end_time = time.time()
            calc_duration = calc_end_time - calc_start_time
            log_msg = f"✅ MAX: {bit_max:.{decimal_places}f}, MIN: {bit_min:.{decimal_places}f} (소요 시간: {calc_duration:.2f}초)"
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            # 백그라운드에서 실행되므로 msleep 불필요
            
            # 기존 생산 카드에서 동일한 MAX, MIN 값이 있는지 확인
            # 좌측 max/min 우선 생산인 경우는 이미 확인했으므로 건너뜀
            if not use_left_chart_values:
                self.progress_updated.emit(45, "중복 체크 중...")
                dup_check_start_time = time.time()
                log_msg = "📊 중복 체크 중... (백그라운드 실행)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                
                # MAX/MIN 값이 같으면 중복으로 처리
                print(f"[카드 생산] 📊 기존 카드 개수: {len(existing_cards)}개")
                
                checked_count = 0
                batch_size = 10
                for idx, card in enumerate(existing_cards, 1):
                    # 중단 요청 체크
                    if self.isInterruptionRequested():
                        return
                    
                    card_chart_data = card.get('chart_data', {})
                    if isinstance(card_chart_data, dict) and card_chart_data.get('prices'):
                        checked_count += 1
                        
                        if checked_count % 50 == 0 or checked_count == len(existing_cards):
                            log_msg = f"   → 진행 중... ({checked_count}/{len(existing_cards)}개 카드 체크 완료)"
                            print(f"[카드 생산] {log_msg}")
                            self.log_message.emit(log_msg)
                        
                        # 기존 카드의 전체 차트 데이터로 MAX, MIN 값 계산
                        existing_prices_str = ",".join([str(p) for p in card_chart_data['prices']])
                        existing_result = self.nbverse_converter.text_to_nb(existing_prices_str)
                        existing_max = round(existing_result.get('bitMax', 5.5), decimal_places)
                        existing_min = round(existing_result.get('bitMin', 5.5), decimal_places)
                        
                        # MAX, MIN 값이 같으면 중복으로 처리
                        if (bit_max == existing_max and bit_min == existing_min):
                            card_id = card.get('card_id', 'N/A')
                            card_timeframe = card.get('timeframe', 'N/A')
                            error_msg = f"동일한 MAX({bit_max:.{decimal_places}f}), MIN({bit_min:.{decimal_places}f}) 값을 가진 카드가 이미 존재합니다. (카드 ID: {card_id}, 타임프레임: {card_timeframe})"
                            print(f"[카드 생산] ⚠️ {error_msg}")
                            self.log_message.emit(f"⚠️ {error_msg}")
                            self.error_occurred.emit(error_msg)
                            return
                        
                        # 배치 처리 중에도 msleep 제거 (백그라운드 실행)
                
                dup_check_end_time = time.time()
                dup_check_duration = dup_check_end_time - dup_check_start_time
                log_msg = f"✅ 중복 체크 통과 (체크한 카드: {checked_count}개, 소요 시간: {dup_check_duration:.2f}초)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
            else:
                # 좌측 max/min 우선 생산인 경우는 이미 확인했으므로 중복 체크 건너뜀
                log_msg = "✅ 좌측 max/min 우선 생산: 중복 체크 완료 (이미 확인됨)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                existing_cards = self.production_card_manager.get_all_cards()  # N/B 체크를 위해 필요
            
            # N/B 값 처리
            # 좌측 MAX/MIN 값을 사용하는 경우, N/B 값도 좌측에서 계산된 값을 사용 (계산 불필요)
            if use_left_chart_values or (self.chart_max_nb is not None and self.chart_min_nb is not None and 
                self.chart_timeframe and self.chart_timeframe == selected_timeframe):
                # 좌측 MAX/MIN을 사용하는 경우, N/B 값도 좌측 값을 사용 (계산 불필요)
                if self.chart_nb_value is not None:
                    self.progress_updated.emit(70, "좌측 N/B 값 사용 중... (계산 불필요)")
                    log_msg = f"📊 좌측 차트의 N/B 값 사용 중... (N/B: {self.chart_nb_value:.{decimal_places}f}, 계산 불필요)"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
                    nb_value = self.chart_nb_value
                    log_msg = f"✅ N/B 값: {nb_value:.{decimal_places}f} (좌측 값 사용 - 계산 불필요)"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
                else:
                    # 좌측 MAX/MIN은 있지만 N/B 값이 없는 경우 생산 중단
                    error_msg = "좌측 MAX/MIN 값을 사용하는 경우, 좌측 N/B 값이 필요합니다. 좌측 N/B 값이 없어 생산을 중단합니다."
                    print(f"[카드 생산] ⚠️ {error_msg}")
                    self.log_message.emit(f"⚠️ {error_msg}")
                    self.progress_updated.emit(0, f"오류: {error_msg[:30]}...")
                    self.error_occurred.emit(error_msg)
                    return
            else:
                # 좌측 MAX/MIN을 사용하지 않는 경우에만 N/B 값 계산
                self.progress_updated.emit(60, "N/B 값 계산 중...")
                nb_calc_start_time = time.time()
                # 좌측 차트에서 계산한 N/B 값이 있으면 사용 (동일한 값 보장)
                if self.chart_nb_value is not None:
                    log_msg = f"📊 좌측 차트의 N/B 값 사용 중... (N/B: {self.chart_nb_value:.{decimal_places}f})"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
                    nb_value = self.chart_nb_value
                else:
                    # 좌측 차트 값이 없으면 기존 방식으로 계산
                    log_msg = "📊 N/B 값 계산 중... (백그라운드 실행)"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
                    
                    print(f"[카드 생산]    → 차트 데이터 기반 N/B 계산 함수 실행 중...")
                    nb_value = calculate_nb_value_from_chart(
                        chart_data,
                        nbverse_storage=self.nbverse_storage,
                        nbverse_converter=self.nbverse_converter,
                        settings_manager=self.settings_manager
                    )
                    # 백그라운드에서 실행되므로 msleep 불필요
                nb_calc_end_time = time.time()
                nb_calc_duration = nb_calc_end_time - nb_calc_start_time
                log_msg = f"✅ N/B 값: {nb_value:.{decimal_places}f} (소요 시간: {nb_calc_duration:.2f}초)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
            
            # N/B 값 중복 체크
            # 좌측 MAX/MIN 값을 사용하는 경우, MAX/MIN 값만 중복 체크하면 되므로 N/B 값 중복 체크는 건너뜀
            if use_left_chart_values or (self.chart_max_nb is not None and self.chart_min_nb is not None and 
                self.chart_timeframe and self.chart_timeframe == selected_timeframe):
                # 좌측 MAX/MIN 값을 사용하는 경우, N/B 값 중복 체크 건너뜀
                self.progress_updated.emit(75, "좌측 MAX/MIN 사용: N/B 중복 체크 건너뜀")
                log_msg = "✅ 좌측 MAX/MIN 값 사용: N/B 값 중복 체크 건너뜀 (MAX/MIN 값만 중복 체크함)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                nb_duplicate_found = False
            else:
                # 좌측 MAX/MIN 값을 사용하지 않는 경우에만 N/B 값 중복 체크
                self.progress_updated.emit(75, "N/B 값 중복 체크 중...")
                nb_dup_check_start_time = time.time()
                log_msg = "📊 N/B 값 중복 체크 중... (중첩 카드 방지, 백그라운드 실행)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                
                existing_cards_for_nb = existing_cards
                nb_checked_count = 0
                nb_duplicate_found = False
                
                if len(existing_cards_for_nb) > 0:
                    print(f"[카드 생산]    → 기존 카드들의 N/B 값과 비교 중... (기존 카드: {len(existing_cards_for_nb)}개)")
                    
                    for card in existing_cards_for_nb:
                        # 중단 요청 체크
                        if self.isInterruptionRequested():
                            return
                        
                        existing_nb_value = card.get('nb_value')
                        if existing_nb_value is not None:
                            nb_checked_count += 1
                            existing_nb_rounded = round(float(existing_nb_value), decimal_places)
                            current_nb_rounded = round(nb_value, decimal_places)
                            
                            if existing_nb_rounded == current_nb_rounded:
                                card_id = card.get('card_id', 'N/A')
                                card_timeframe = card.get('timeframe', 'N/A')
                                card_type_existing = card.get('card_type', 'N/A')
                                error_msg = f"동일한 N/B 값({nb_value:.{decimal_places}f})을 가진 카드가 이미 존재합니다. (카드 ID: {card_id}, 타임프레임: {card_timeframe}, 타입: {card_type_existing}) 중첩 카드 생산이 방지되었습니다."
                                print(f"[카드 생산] ⚠️ {error_msg}")
                                self.log_message.emit(f"⚠️ {error_msg}")
                                self.error_occurred.emit(error_msg)
                                nb_duplicate_found = True
                                return
                            
                            # 배치 처리 중에도 msleep 제거 (백그라운드 실행)
                
                if not nb_duplicate_found:
                    nb_dup_check_end_time = time.time()
                    nb_dup_check_duration = nb_dup_check_end_time - nb_dup_check_start_time
                    log_msg = f"✅ N/B 값 중복 체크 통과 (체크한 카드: {nb_checked_count}개, 소요 시간: {nb_dup_check_duration:.2f}초)"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
            
            # 카드 타입 결정
            self.progress_updated.emit(85, "카드 타입 결정 중...")
            log_msg = "📊 카드 타입 결정 중... (백그라운드 실행)"
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            
            card_type = 'normal'
            type_reason = ""
            
            # 좌측 MAX/MIN 값을 사용하는 경우, N/B 데이터베이스 조회하여 중첩 여부 확인
            is_overlap_detected = False
            if use_left_chart_values or (self.chart_max_nb is not None and self.chart_min_nb is not None and 
                self.chart_timeframe and self.chart_timeframe == selected_timeframe):
                # 좌측 MAX/MIN 값을 사용하는 경우
                self.progress_updated.emit(86, "N/B 데이터베이스 조회 중...")
                log_msg = "📊 N/B 데이터베이스에서 중첩 카드 확인 중... (좌측 MAX/MIN 사용)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                
                try:
                    # N/B 데이터베이스에서 유사한 카드 검색
                    if self.nbverse_storage:
                        # MAX/MIN 값 범위로 유사한 카드 검색 (범위 임계값: 0.1)
                        similar_cards = self.nbverse_storage.find_similar_by_nb_range(
                            nb_max=bit_max,
                            nb_min=bit_min,
                            range_threshold=0.1,  # 작은 범위로 정확한 중첩 확인
                            limit=10
                        )
                        
                        if similar_cards and len(similar_cards) > 0:
                            # 유사한 카드가 있으면 중첩 카드로 판단
                            is_overlap_detected = True
                            log_msg = f"✅ 중첩 카드 감지: N/B 데이터베이스에서 유사한 카드 {len(similar_cards)}개 발견 (MAX: {bit_max:.{decimal_places}f}, MIN: {bit_min:.{decimal_places}f})"
                            print(f"[카드 생산] {log_msg}")
                            self.log_message.emit(log_msg)
                        else:
                            log_msg = f"✅ 신규 카드: N/B 데이터베이스에서 유사한 카드 없음 (MAX: {bit_max:.{decimal_places}f}, MIN: {bit_min:.{decimal_places}f})"
                            print(f"[카드 생산] {log_msg}")
                            self.log_message.emit(log_msg)
                    else:
                        log_msg = "⚠️ N/B 데이터베이스가 없어 중첩 확인 불가 (일반 카드로 생성)"
                        print(f"[카드 생산] {log_msg}")
                        self.log_message.emit(log_msg)
                except Exception as e:
                    log_msg = f"⚠️ N/B 데이터베이스 조회 오류: {str(e)} (일반 카드로 생성)"
                    print(f"[카드 생산] {log_msg}")
                    self.log_message.emit(log_msg)
            
            # 카드 타입 결정
            if is_overlap_detected:
                # 중첩 카드로 판단된 경우
                card_type = 'overlap'
                type_reason = f"N/B 데이터베이스에서 중첩 카드 감지 (MAX: {bit_max:.{decimal_places}f}, MIN: {bit_min:.{decimal_places}f})"
            elif 0.4 <= nb_value <= 0.6:
                card_type = 'normal'
                type_reason = f"N/B 값이 정상 범위({nb_value:.{decimal_places}f})"
            elif random.random() < 0.2:
                if not nb_duplicate_found:
                    card_type = 'overlap'
                    type_reason = f"랜덤 확률로 오버랩 타입 선택 (N/B: {nb_value:.{decimal_places}f})"
                else:
                    card_type = 'normal'
                    type_reason = f"동일한 N/B 값이 존재하여 오버랩 타입 선택 취소, 일반 타입으로 변경 (N/B: {nb_value:.{decimal_places}f})"
            else:
                type_reason = f"기본 타입 (N/B: {nb_value:.{decimal_places}f})"
            
            log_msg = f"✅ 카드 타입: {card_type} ({type_reason})"
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            
            # 생산 카드 추가
            self.progress_updated.emit(90, "카드 저장 중...")
            save_start_time = time.time()
            log_msg = "📊 카드 저장 중... (백그라운드 실행)"
            print(f"[카드 생산] {log_msg}")
            self.log_message.emit(log_msg)
            
            print(f"[카드 생산]    → 카드 정보: 타임프레임={selected_timeframe}, N/B={nb_value:.{decimal_places}f}, 타입={card_type}")
            
            # generation 계산
            generation = 1
            if card_type == 'overlap':
                max_generation = 0
                for card in existing_cards:
                    for hist in card.get('history_list', []):
                        if hist.get('generation') and hist.get('generation') > max_generation:
                            max_generation = hist.get('generation')
                generation = max_generation + 1
            
            # nb_id 생성
            nb_id = f"nb_{selected_timeframe}_{round(nb_value, decimal_places)}"
            
            try:
                new_card = self.production_card_manager.add_card(
                    timeframe=selected_timeframe,
                    nb_value=nb_value,
                    nb_max=bit_max,
                    nb_min=bit_min,
                    card_type=card_type,
                    chart_data=chart_data,
                    status='active',
                    nb_id=nb_id,
                    generation=generation,
                    qty=0.0,
                    entry_price=0.0,
                    memo=f"카드 생성: {type_reason}"
                )
                # 백그라운드에서 실행되므로 msleep 불필요
                
                # add_card가 None을 반환하는 경우 처리 (같은 card_key를 가진 활성 카드가 이미 있거나 REMOVED 상태인 경우)
                if new_card is None:
                    error_msg = f"카드 생성 실패: 같은 card_key를 가진 활성 카드가 이미 있거나 REMOVED 상태의 카드가 존재합니다. (타임프레임: {selected_timeframe}, MAX: {bit_max:.{decimal_places}f}, MIN: {bit_min:.{decimal_places}f}, N/B: {nb_value:.{decimal_places}f})"
                    print(f"[카드 생산] ⚠️ {error_msg}")
                    self.log_message.emit(f"⚠️ {error_msg}")
                    self.progress_updated.emit(0, f"오류: 카드 생성 실패 (MAX: {bit_max:.{decimal_places}f}, MIN: {bit_min:.{decimal_places}f})")
                    self.error_occurred.emit(error_msg)
                    return
                
                save_end_time = time.time()
                save_duration = save_end_time - save_start_time
                card_id = new_card.get('card_id', 'N/A')
                log_msg = f"✅ 카드 저장 완료! (카드 ID: {card_id}, 소요 시간: {save_duration:.2f}초)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                
                # 최종 요약 정보
                total_duration = save_end_time - calc_start_time
                log_msg = f"🎉 카드 생산 완료! (총 소요 시간: {total_duration:.2f}초)"
                print(f"[카드 생산] {log_msg}")
                self.log_message.emit(log_msg)
                
                # 프로그레스바 완료
                self.progress_updated.emit(100, "카드 생산 완료!")
                
                print(f"[카드 생산]    → 요약: 타임프레임={selected_timeframe}, MAX={bit_max:.{decimal_places}f}, MIN={bit_min:.{decimal_places}f}, N/B={nb_value:.{decimal_places}f}, 타입={card_type}, ID={card_id}")
                
                # 카드 생성 완료 시그널 발생
                self.card_created.emit({
                    'card': new_card,
                    'timeframe': selected_timeframe,
                    'nb_value': nb_value,
                    'card_type': card_type,
                    'chart_data': chart_data
                })
            except Exception as add_card_error:
                # add_card에서 발생한 오류를 별도로 처리
                import traceback
                error_msg = f"카드 저장 중 오류: {str(add_card_error)}"
                print(f"[카드 생산] ❌ {error_msg}")
                self.log_message.emit(f"❌ {error_msg}")
                traceback.print_exc()
                self.error_occurred.emit(error_msg)
                return  # 워커 종료
        except Exception as e:
            import traceback
            error_msg = f"생산 카드 생성 오류: {str(e)}"
            print(f"[카드 생산] ❌ {error_msg}")
            self.log_message.emit(f"❌ {error_msg}")
            traceback.print_exc()
            # 프로그레스바 오류 표시
            self.progress_updated.emit(0, f"오류: {error_msg[:30]}...")
            self.error_occurred.emit(error_msg)


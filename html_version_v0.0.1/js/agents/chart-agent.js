/**
 * 차트 에이전트
 * 차트 데이터 수집, 분석, 시각화를 담당하는 에이전트
 */
class ChartAgent {
    constructor() {
        this.currentTimeframe = '1m';
        this.chartData = null;
        this.chartCanvas = null;
        this.chartContext = null;
        this.updateTimeout = null; // 자동 업데이트 타임아웃 (setTimeout ID)
        this.updateIntervalMs = 5000; // 자동 업데이트 간격
        
        // 타임프레임 순회 설정
        this.timeframes = ['1m', '3m', '5m', '15m', '30m', '60m', '1d'];
        this.currentTimeframeIndex = 0;
        this.cycleMode = false; // 순회 모드 비활성화 (기본값, 사용자가 활성화할 수 있음)
        this.cycleTimeout = null; // 타임프레임 순회 타임아웃 (setTimeout ID)
        this.cycleIntervalMs = 30000; // 기본 30초마다 타임프레임 변경
        this.isCycling = false; // 현재 자동 순회 중인지 여부 (이벤트 충돌 방지용)
    }
    
    /**
     * 차트 초기화
     */
    init() {
        const canvas = document.getElementById('main-chart');
        if (canvas) {
            this.chartCanvas = canvas;
            this.chartContext = canvas.getContext('2d');
            this.setupCanvas();
        }
    }
    
    /**
     * 캔버스 설정
     */
    setupCanvas() {
        if (!this.chartContext) return;
        
        const canvas = this.chartCanvas;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        
        this.chartContext.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    
    /**
     * 차트 데이터 가져오기
     * @param {string} timeframe - 타임프레임 (지정하지 않으면 현재 타임프레임 사용)
     * @param {boolean} forceRefresh - 강제 새로고침 여부
     * @returns {Promise<Object>} 차트 데이터
     */
    async fetchChartData(timeframe = null, forceRefresh = false) {
        try {
            const tf = timeframe || this.currentTimeframe;
            
            console.log(`📡 fetchChartData 호출: timeframe=${tf}, forceRefresh=${forceRefresh}, 현재 this.currentTimeframe=${this.currentTimeframe}`);
            
            // 설정에서 차트 포인트 수 가져오기
            let chartPoints = Config.get('CHART_POINTS', 200);
            try {
                const settings = await API.getSettings();
                chartPoints = settings.chart_points || chartPoints;
            } catch (error) {
                // 설정 로드 실패 시 기본값 사용
            }
            
            // API에서 최신 데이터 가져오기 (항상 서버에서 최신 데이터 요청)
            console.log(`📡 [${tf}] 차트 데이터 요청 중... (포인트: ${chartPoints}개)`);
            console.log(`   API 호출 파라미터: timeframe=${tf}, count=${chartPoints}`);
            console.log(`   현재 this.currentTimeframe: ${this.currentTimeframe}`);
            
            const result = await API.getChartData(tf, chartPoints);
            
            console.log(`   API 응답:`, {
                timeframe: result?.timeframe,
                prices_count: result?.prices?.length,
                current_price: result?.current_price,
                first_price: result?.prices?.[0],
                last_price: result?.prices?.[result?.prices?.length - 1]
            });
            
            if (result && result.prices && result.prices.length > 0) {
                // 타임프레임 정보 확인
                if (result.timeframe && result.timeframe !== tf) {
                    console.warn(`⚠️ 요청한 타임프레임(${tf})과 응답 타임프레임(${result.timeframe})이 다릅니다.`);
                }
                
                // 가격 데이터가 실제로 다른지 확인
                const previousPrices = this.chartData?.prices;
                const pricesChanged = !previousPrices || 
                    previousPrices.length !== result.prices.length ||
                    previousPrices[0] !== result.prices[0] ||
                    previousPrices[previousPrices.length - 1] !== result.prices[result.prices.length - 1];
                
                if (pricesChanged) {
                    console.log(`   ✅ 가격 데이터가 변경되었습니다. (이전: ${previousPrices?.length || 0}개, 현재: ${result.prices.length}개)`);
                } else {
                    console.warn(`   ⚠️ 가격 데이터가 동일합니다. (타임프레임: ${tf})`);
                }
                
                // 차트 데이터 업데이트
                this.chartData = {
                    ...result,
                    timeframe: tf, // 명시적으로 타임프레임 설정
                    prices: result.prices, // 가격 배열
                    current_price: result.current_price || result.prices[result.prices.length - 1]
                };

                // 캐시: 메인 차트에서 사용된 가격 배열을 localStorage에 저장 (다른 페이지에서 빠르게 사용 가능)
                try {
                    const cache = {
                        timeframe: tf,
                        prices: result.prices,
                        current_price: result.current_price || result.prices[result.prices.length - 1],
                        timestamp: Date.now()
                    };
                    localStorage.setItem('mainChartCache', JSON.stringify(cache));
                    console.log('✅ mainChartCache 저장 완료 (localStorage)');
                } catch (e) {
                    console.warn('⚠️ mainChartCache 저장 실패:', e);
                }
                
                // 타임프레임 업데이트 (fetchChartData 내부에서도 설정)
                this.currentTimeframe = tf;
                
                console.log(`✅ [${tf}] 차트 데이터 로드 완료: ${result.prices.length}개 가격, 현재가: ${this.chartData.current_price?.toLocaleString()} KRW`);
                console.log(`   this.currentTimeframe 업데이트: ${this.currentTimeframe}`);
                
                return this.chartData;
            }
            
            console.warn(`⚠️ [${tf}] 차트 데이터가 비어있습니다.`);
            return null;
        } catch (error) {
            console.error(`❌ [${timeframe || this.currentTimeframe}] 차트 데이터 가져오기 실패:`, error);
            return null;
        }
    }
    
    /**
     * 차트 그리기
     * @param {Array<number>} prices - 가격 배열
     */
    drawChart(prices) {
        if (!this.chartContext || !prices || prices.length === 0) {
            console.warn(`⚠️ [${this.currentTimeframe}] 차트 그리기 실패: 컨텍스트 또는 가격 데이터 없음`);
            return;
        }
        
        // 캔버스 크기 재설정 (리사이즈 대응)
        this.setupCanvas();
        
        if (!this.chartContext || !this.chartCanvas) {
            console.error(`❌ [${this.currentTimeframe}] 차트 컨텍스트 또는 캔버스가 없습니다.`);
            return;
        }
        
        const ctx = this.chartContext;
        const canvas = this.chartCanvas;
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        
        // 캔버스 완전히 클리어 (이전 차트 완전히 지우기)
        // 변환 행렬 초기화 후 클리어
        const transform = ctx.getTransform();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(transform); // 원래 변환 행렬 복원
        
        // 배경 다시 그리기
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, width, height);
        
        console.log(`🎨 [${this.currentTimeframe}] 차트 그리기 시작: ${prices.length}개 가격 데이터 (캔버스 크기: ${width}x${height})`);
        console.log(`   타임프레임: ${this.currentTimeframe}`);
        console.log(`   가격 범위: 최저=${Math.min(...prices).toLocaleString()} KRW, 최고=${Math.max(...prices).toLocaleString()} KRW`);
        console.log(`   첫 가격: ${prices[0].toLocaleString()} KRW, 마지막 가격: ${prices[prices.length - 1].toLocaleString()} KRW`);
        console.log(`   가격 데이터 샘플 (처음 3개): [${prices.slice(0, 3).map(p => p.toLocaleString()).join(', ')}]`);
        console.log(`   가격 데이터 샘플 (마지막 3개): [${prices.slice(-3).map(p => p.toLocaleString()).join(', ')}]`);
        
        if (prices.length < 2) return;
        
        // 가격 범위 계산
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || 1;
        
        // 패딩
        const padding = 20;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        // 그리드 그리기
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= 5; i++) {
            const y = padding + (chartHeight / 5) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // 가격 라인 그리기
        ctx.strokeStyle = '#00d1ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < prices.length; i++) {
            const x = padding + (chartWidth / (prices.length - 1)) * i;
            const normalizedPrice = (prices[i] - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // 영역 채우기
        ctx.fillStyle = 'rgba(0, 209, 255, 0.1)';
        ctx.lineTo(width - padding, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.closePath();
        ctx.fill();
        
        // 포인트 그리기
        ctx.fillStyle = '#00d1ff';
        for (let i = 0; i < prices.length; i += Math.max(1, Math.floor(prices.length / 20))) {
            const x = padding + (chartWidth / (prices.length - 1)) * i;
            const normalizedPrice = (prices[i] - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 가격 레이블
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`최고: ${maxPrice.toLocaleString()}`, padding, padding + 10);
        ctx.fillText(`최저: ${minPrice.toLocaleString()}`, padding, padding + 22);
        
        // 타임프레임 표시 (우측 상단)
        ctx.fillStyle = '#00d1ff';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`[${this.currentTimeframe}]`, width - padding, padding + 10);
        
        // 현재 가격 표시 (우측 상단, 타임프레임 아래)
        const currentPrice = prices[prices.length - 1];
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.fillText(`${currentPrice.toLocaleString()} KRW`, width - padding, padding + 22);
        
        console.log(`✅ [${this.currentTimeframe}] 차트 그리기 완료: 최고가=${maxPrice.toLocaleString()}, 최저가=${minPrice.toLocaleString()}, 현재가=${currentPrice.toLocaleString()}, 범위=${priceRange.toLocaleString()}`);
    }
    
    /**
     * 차트 업데이트
     * @param {string} timeframe - 타임프레임 (지정하지 않으면 현재 타임프레임 사용)
     * @param {boolean} forceRefresh - 강제 새로고침 여부
     */
    async update(timeframe = null, forceRefresh = false) {
        const tf = timeframe || this.currentTimeframe;
        const previousTimeframe = this.currentTimeframe;
        const timeframeChanged = tf !== previousTimeframe;
        
        console.log(`🔄 update 호출: timeframe=${tf}, previousTimeframe=${previousTimeframe}, timeframeChanged=${timeframeChanged}, forceRefresh=${forceRefresh}`);
        
        // 타임프레임이 변경되었거나 강제 새로고침인 경우
        if (forceRefresh || timeframeChanged) {
            if (timeframeChanged) {
                console.log(`🔄 타임프레임 변경 감지: ${previousTimeframe} → ${tf}`);
                // 타임프레임 변경 시 이전 차트 데이터 완전히 초기화 (캐시 무효화)
                this.chartData = null;
                // 현재 타임프레임 업데이트 (데이터 가져오기 전에 설정)
                this.currentTimeframe = tf;
            } else if (forceRefresh) {
                // 강제 새로고침인 경우에도 타임프레임 업데이트
                this.currentTimeframe = tf;
            }
        }
        
        // 이전 가격 저장 (비교용) - 타임프레임 변경 전 데이터
        const previousChartData = timeframeChanged ? null : this.chartData;
        const previousPrice = previousChartData?.prices?.[previousChartData.prices.length - 1];
        
        // 현재 타임프레임의 최신 데이터 가져오기 (강제 새로고침)
        console.log(`📡 [${tf}] 차트 데이터 요청 중... (이전 타임프레임: ${previousTimeframe}, 강제 새로고침: ${forceRefresh || timeframeChanged})`);
        console.log(`   현재 this.currentTimeframe: ${this.currentTimeframe}, 요청할 타임프레임: ${tf}`);
        const data = await this.fetchChartData(tf, true); // 항상 강제 새로고침 (타임프레임 변경 시)
        
        if (data && data.prices && data.prices.length > 0) {
            // 데이터가 실제로 변경되었는지 확인
            const currentPrice = data.prices[data.prices.length - 1];
            
            console.log(`📊 [${tf}] 차트 데이터 수신: ${data.prices.length}개 가격, 현재가: ${currentPrice?.toLocaleString()} KRW`);
            if (timeframeChanged) {
                console.log(`   타임프레임 변경: ${previousTimeframe} → ${tf}`);
                console.log(`   가격 범위: 최저=${Math.min(...data.prices).toLocaleString()} KRW, 최고=${Math.max(...data.prices).toLocaleString()} KRW`);
            } else if (previousPrice && previousPrice !== currentPrice) {
                console.log(`   가격 변경: ${previousPrice.toLocaleString()} → ${currentPrice.toLocaleString()} KRW`);
            }
            
            // 현재 타임프레임의 가격 데이터로 차트 그리기 (강제 재그리기)
            console.log(`🎨 [${tf}] 차트 그리기 시작...`);
            console.log(`   가격 데이터 샘플 (처음 5개):`, data.prices.slice(0, 5));
            console.log(`   가격 데이터 샘플 (마지막 5개):`, data.prices.slice(-5));
            console.log(`   타임프레임 변경 여부: ${timeframeChanged}, 이전 타임프레임: ${previousTimeframe}`);
            
            // 차트 그리기 (타임프레임이 변경되었으면 강제로 다시 그리기)
            // 타임프레임이 변경되었으면 확실히 다시 그리기 위해 약간의 지연 추가
            if (timeframeChanged) {
                console.log(`   ⚠️ 타임프레임 변경으로 인한 차트 재그리기`);
                console.log(`   이전 타임프레임: ${previousTimeframe}, 새 타임프레임: ${tf}`);
                console.log(`   가격 데이터 첫 값: ${data.prices[0]}, 마지막 값: ${data.prices[data.prices.length - 1]}`);
                // 캔버스 초기화를 위해 약간의 지연
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // 차트 그리기 (항상 다시 그리기)
            console.log(`   차트 그리기 실행: ${data.prices.length}개 가격 데이터`);
            this.drawChart(data.prices);
            
            // 현재 타임프레임의 가격 데이터로 N/B 값 계산 및 표시 (강제 재계산)
            console.log(`🔢 [${tf}] N/B 값 계산 시작: ${data.prices.length}개 가격 데이터 사용`);
            console.log(`   타임프레임 변경 여부: ${timeframeChanged}, 이전 타임프레임: ${previousTimeframe}`);
            console.log(`   현재 this.currentTimeframe: ${this.currentTimeframe}`);
            
            // 타임프레임이 변경되었으면 N/B 값도 강제로 재계산
            const nbResult = this.calculateAndDisplayNB(data.prices);
            if (nbResult) {
                console.log(`✅ [${tf}] N/B 값 계산 완료: VALUE=${nbResult.nb_value.toFixed(Config.NB_DECIMAL_PLACES)}, MAX=${nbResult.bit_max.toFixed(Config.NB_DECIMAL_PLACES)}, MIN=${nbResult.bit_min.toFixed(Config.NB_DECIMAL_PLACES)}`);
                console.log(`   N/B 값 상세:`, {
                    nb_value: nbResult.nb_value,
                    nb_max: nbResult.nb_max,
                    nb_min: nbResult.nb_min,
                    bit_max: nbResult.bit_max,
                    bit_min: nbResult.bit_min
                });
                
                // 타임프레임 변경 시 N/B 값이 다르다는 것을 명확히 표시
                if (timeframeChanged) {
                    console.log(`   ⚠️ 타임프레임 변경으로 인한 N/B 값 재계산 완료`);
                }
            } else {
                console.warn(`⚠️ [${tf}] N/B 값 계산 실패`);
            }
        } else {
            console.warn(`⚠️ [${tf}] 차트 데이터를 가져올 수 없습니다.`);
        }
    }
    
    /**
     * N/B 값 계산 및 표시 (bitCalculation.v.0.2.js 사용)
     * 현재 타임프레임의 가격 데이터를 사용하여 N/B 값을 계산합니다.
     * @param {Array<number>} prices - 현재 타임프레임의 가격 배열
     * @returns {Object|null} 계산된 N/B 값 정보
     */
    calculateAndDisplayNB(prices) {
        try {
            if (!prices || prices.length < 2) {
                console.warn(`[${this.currentTimeframe}] 가격 데이터가 부족합니다.`);
                return null;
            }
            
            // 현재 타임프레임의 가격 변화율 배열 생성 (N/B 계산용)
            const priceChanges = [];
            for (let i = 1; i < prices.length; i++) {
                if (prices[i-1] > 0) {
                    const change = (prices[i] - prices[i-1]) / prices[i-1];
                    priceChanges.push(change);
                }
            }
            
            if (priceChanges.length < 2) {
                console.warn(`[${this.currentTimeframe}] 가격 변화율 데이터가 부족합니다.`);
                return null;
            }
            
            // BIT_MAX_NB, BIT_MIN_NB 계산 (현재 타임프레임의 가격 데이터 사용)
            const bit = Config.get('NB_DEFAULT_VALUE', 5.5);
            const bitMax = BIT_MAX_NB(priceChanges, bit);
            const bitMin = BIT_MIN_NB(priceChanges, bit);
            
            // 0~1 범위로 정규화 (필요한 경우)
            const nbMax = Math.max(0.0, Math.min(1.0, bitMax / 10.0));
            const nbMin = Math.max(0.0, Math.min(1.0, bitMin / 10.0));
            const nbValue = (nbMax + nbMin) / 2.0;
            
            const nbResult = {
                nb_value: nbValue,
                nb_max: nbMax,
                nb_min: nbMin,
                bit_max: bitMax,
                bit_min: bitMin,
                timeframe: this.currentTimeframe, // 타임프레임 정보 포함
                price_count: prices.length // 가격 데이터 개수
            };
            
            // 표시 업데이트 (prices를 전달하여 사용된 데이터 표시)
            this.updateNBDisplay(nbResult, prices);
            
            // chartData에 N/B 값 저장 (카드 생산 시 재사용)
            // 현재 타임프레임의 N/B 값이 저장되므로, 카드 생산 시 해당 타임프레임의 N/B 값이 사용됨
            if (this.chartData) {
                this.chartData.nb_value = nbValue;
                this.chartData.nb_max = nbMax;
                this.chartData.nb_min = nbMin;
                this.chartData.bit_max = bitMax;
                this.chartData.bit_min = bitMin;
                this.chartData.timeframe = this.currentTimeframe; // 타임프레임 정보도 저장
            }
            
            return nbResult;
        } catch (error) {
            console.error(`[${this.currentTimeframe}] N/B 값 계산 실패:`, error);
            return null;
        }
    }
    
    /**
     * N/B 값 표시 업데이트
     * @param {Object} nbResult - N/B 값 결과
     */
    updateNBDisplay(nbResult, prices) {
        const maxNbEl = document.getElementById('chart-max-nb');
        const minNbEl = document.getElementById('chart-min-nb');
        const nbValueEl = document.getElementById('chart-nb-value');

        // New elements from chart-analysis.html
        const topNbValueEl = document.getElementById('nbValue');
        const topNbMaxEl = document.getElementById('nbMax');
        const topNbMinEl = document.getElementById('nbMin');
        const nbCurrentPriceEl = document.getElementById('nbCurrentPrice');
        const nbUsedDataEl = document.getElementById('nbUsedData');

        console.log(`📊 [${this.currentTimeframe}] N/B 값 DOM 업데이트 시작:`, {
            maxNbEl: !!maxNbEl,
            minNbEl: !!minNbEl,
            nbValueEl: !!nbValueEl,
            topNbValueEl: !!topNbValueEl,
            topNbMaxEl: !!topNbMaxEl,
            topNbMinEl: !!topNbMinEl,
            nbCurrentPriceEl: !!nbCurrentPriceEl,
            nbUsedDataEl: !!nbUsedDataEl,
            nbResult: nbResult
        });

        const decimalPlaces = Config.get('NB_DECIMAL_PLACES', 10);

        // chart elements (기존 유지) - show normalized nb or bit values where available
        if (maxNbEl) {
            if (nbResult.bit_max !== undefined) {
                maxNbEl.textContent = nbResult.bit_max.toFixed(decimalPlaces);
            } else if (nbResult.nb_max !== undefined) {
                maxNbEl.textContent = (nbResult.nb_max * 10).toFixed(decimalPlaces);
            } else {
                maxNbEl.textContent = '-';
            }
        }

        if (minNbEl) {
            if (nbResult.bit_min !== undefined) {
                minNbEl.textContent = nbResult.bit_min.toFixed(decimalPlaces);
            } else if (nbResult.nb_min !== undefined) {
                minNbEl.textContent = (nbResult.nb_min * 10).toFixed(decimalPlaces);
            } else {
                minNbEl.textContent = '-';
            }
        }

        // nb_value 표시 (정규화된 값)
        if (nbValueEl) {
            if (nbResult.nb_value !== undefined) {
                nbValueEl.textContent = nbResult.nb_value.toFixed(decimalPlaces);
            } else {
                nbValueEl.textContent = '-';
            }
        }

        // Top panel elements (chart-analysis.html) - show normalized nb values
        if (topNbValueEl) {
            topNbValueEl.textContent = nbResult.nb_value !== undefined ? nbResult.nb_value.toFixed(decimalPlaces) : '-';
        }
        if (topNbMaxEl) {
            topNbMaxEl.textContent = nbResult.nb_max !== undefined ? nbResult.nb_max.toFixed(decimalPlaces) : '-';
        }
        if (topNbMinEl) {
            topNbMinEl.textContent = nbResult.nb_min !== undefined ? nbResult.nb_min.toFixed(decimalPlaces) : '-';
        }

        // 현재 가격 표시 (마지막 가격)
        if (nbCurrentPriceEl) {
            try {
                const lastPrice = (Array.isArray(prices) && prices.length > 0) ? prices[prices.length - 1] : (this.chartData && this.chartData.prices && this.chartData.prices.length ? this.chartData.prices[this.chartData.prices.length-1] : null);
                nbCurrentPriceEl.textContent = lastPrice !== null && lastPrice !== undefined ? (typeof lastPrice === 'number' ? lastPrice.toLocaleString() : String(lastPrice)) : '-';
            } catch (e) {
                nbCurrentPriceEl.textContent = '-';
            }
        }

        // 사용된 차트 데이터 전체 표시
        if (nbUsedDataEl) {
            try {
                const usedPrices = Array.isArray(prices) && prices.length ? prices : (this.chartData && this.chartData.prices ? this.chartData.prices : []);
                // present as small objects to avoid huge DOM overhead
                const used = usedPrices.map((p, i) => ({index: i, price: p}));
                nbUsedDataEl.textContent = JSON.stringify(used, null, 2);
            } catch (e) {
                nbUsedDataEl.textContent = '-';
            }
        }

        console.log(`📊 [${this.currentTimeframe}] N/B 값 DOM 업데이트 완료`);
    }
    
    /**
     * 타임프레임 변경
     * @param {string} timeframe - 타임프레임
     * @param {boolean} updateIndex - 순회 인덱스 업데이트 여부 (기본값: true)
     * @param {boolean} isAutoCycle - 자동 순회에 의한 변경인지 여부 (기본값: false)
     */
    async changeTimeframe(timeframe, updateIndex = true, isAutoCycle = false) {
        const previousTimeframe = this.currentTimeframe;
        
        console.log(`🔄 changeTimeframe 호출: timeframe=${timeframe}, previousTimeframe=${previousTimeframe}, updateIndex=${updateIndex}, isAutoCycle=${isAutoCycle}`);
        
        // 타임프레임이 실제로 변경된 경우에만 처리
        if (previousTimeframe !== timeframe) {
            const changeType = isAutoCycle ? '[자동 순회]' : '[수동 변경]';
            console.log(`🔄 ${changeType} 타임프레임 변경 시작: ${previousTimeframe} → ${timeframe}`);
            
            // 순회 인덱스 업데이트 (수동 변경 시)
            if (updateIndex && this.timeframes.includes(timeframe)) {
                this.currentTimeframeIndex = this.timeframes.indexOf(timeframe);
                console.log(`   순회 인덱스 업데이트: ${this.currentTimeframeIndex}`);
            }
            
            // 이전 차트 데이터 완전히 초기화 (타임프레임 변경 전에)
            this.chartData = null;
            console.log(`   차트 데이터 초기화 완료`);
            
            // 타임프레임을 먼저 업데이트 (update 함수에서 변경 감지를 위해)
            // 하지만 update 함수 내부에서도 설정하므로 여기서는 설정하지 않음
            // update 함수에서 타임프레임 변경을 감지할 수 있도록 previousTimeframe 유지
            
            // 강제 새로고침으로 업데이트
            console.log(`   update 함수 호출: timeframe=${timeframe}, forceRefresh=true`);
            await this.update(timeframe, true);
            
            console.log(`✅ 타임프레임 변경 완료: ${previousTimeframe} → ${timeframe}`);
        } else {
            console.log(`   타임프레임이 동일하므로 일반 업데이트 실행`);
            // 같은 타임프레임이면 일반 업데이트
            await this.update(timeframe, false);
        }
    }
    
    /**
     * 가격 배열을 N/B 계산용 배열로 변환
     * @param {Array<number>} prices - 가격 배열
     * @returns {Array<number>} 변화율 배열
     */
    convertPricesToNBArray(prices) {
        if (!prices || prices.length < 2) {
            return [];
        }
        
        const changes = [];
        for (let i = 1; i < prices.length; i++) {
            if (prices[i-1] > 0) {
                const change = (prices[i] - prices[i-1]) / prices[i-1];
                changes.push(change);
            }
        }
        
        return changes;
    }
    
    /**
     * 타임프레임 순회 시작
     * @param {number} intervalMs - 순회 간격 (밀리초)
     */
    async startTimeframeCycle(intervalMs = null) {
        // 기존 순회 타임아웃 정리
        if (this.cycleTimeout) {
            clearTimeout(this.cycleTimeout);
            this.cycleTimeout = null;
        }
        
        // 순회 중 플래그 초기화
        this.isCycling = false;
        
        // 간격 가져오기
        let cycleInterval = intervalMs || this.cycleIntervalMs;
        if (!intervalMs) {
            try {
                const settings = await API.getSettings();
                cycleInterval = settings.chart_animation_interval_ms || 30000; // 기본 30초
            } catch (error) {
                console.warn('⚠️ 설정 로드 실패, 기본값 사용:', error);
                // 설정 로드 실패 시 기본값 사용
                cycleInterval = Config.get('CHART_ANIMATION_INTERVAL', 30000); // 기본 30초
            }
        }
        
        // 최소 간격 보장 (10초 이상)
        if (cycleInterval < 10000) {
            console.warn(`⚠️ 순회 간격이 너무 짧습니다 (${cycleInterval}ms). 최소값 10000ms로 조정합니다.`);
            cycleInterval = 10000;
        }
        
        this.cycleIntervalMs = cycleInterval;
        this.cycleMode = true;
        
        // 현재 타임프레임 인덱스 동기화
        if (this.timeframes.includes(this.currentTimeframe)) {
            this.currentTimeframeIndex = this.timeframes.indexOf(this.currentTimeframe);
        } else {
            this.currentTimeframeIndex = 0;
            this.currentTimeframe = this.timeframes[0];
        }
        
        console.log(`🔄 타임프레임 순회 시작: ${cycleInterval}ms 간격 (${this.timeframes.join(' → ')} 순회)`);
        console.log(`   현재 타임프레임: ${this.currentTimeframe} (인덱스: ${this.currentTimeframeIndex + 1}/${this.timeframes.length})`);
        
        // switch case를 사용한 순회 시작
        this.executeTimeframeCycle();
    }
    
    /**
     * switch case를 사용한 타임프레임 순회 실행
     */
    async executeTimeframeCycle() {
        if (!this.cycleMode) return;
        
        // 이미 순회 중이면 중복 실행 방지
        if (this.isCycling) {
            console.warn('⚠️ 타임프레임 순회가 이미 진행 중입니다. 중복 실행 방지.');
            return;
        }
        
        this.isCycling = true;
        
        try {
            // switch case로 타임프레임별 처리
            switch (this.currentTimeframeIndex) {
                case 0: // 1m
                    await this.switchToTimeframe('1m', 0);
                    break;
                case 1: // 3m
                    await this.switchToTimeframe('3m', 1);
                    break;
                case 2: // 5m
                    await this.switchToTimeframe('5m', 2);
                    break;
                case 3: // 15m
                    await this.switchToTimeframe('15m', 3);
                    break;
                case 4: // 30m
                    await this.switchToTimeframe('30m', 4);
                    break;
                case 5: // 60m
                    await this.switchToTimeframe('60m', 5);
                    break;
                case 6: // 1d
                    await this.switchToTimeframe('1d', 6);
                    break;
                default:
                    // 기본값: 1m로 리셋
                    this.currentTimeframeIndex = 0;
                    await this.switchToTimeframe('1m', 0);
                    break;
            }
        } catch (error) {
            console.error('❌ 타임프레임 순회 실행 중 오류:', error);
        } finally {
            this.isCycling = false;
        }
    }
    
    /**
     * 특정 타임프레임으로 전환하고 다음 타임프레임으로 이동
     * @param {string} timeframe - 타임프레임
     * @param {number} index - 타임프레임 인덱스
     */
    async switchToTimeframe(timeframe, index) {
        const previousTimeframe = this.currentTimeframe;
        
        console.log(`\n🔄 ===== 타임프레임 순회 시작 =====`);
        console.log(`   ${previousTimeframe} → ${timeframe} (${index + 1}/${this.timeframes.length})`);
        
        // 중요: changeTimeframe 호출 전에 this.currentTimeframe을 변경하지 않음
        // changeTimeframe 내부에서 변경을 감지할 수 있도록 이전 값을 유지
        
        // UI 업데이트 (select 요소) - 이벤트 발생 방지를 위해 일시적으로 이벤트 리스너 제거
        const selectEl = document.getElementById('chart-timeframe');
        if (selectEl) {
            const originalOnchange = selectEl.onchange;
            selectEl.onchange = null;
            selectEl.value = timeframe;
            selectEl.onchange = originalOnchange;
        }
        
        // 타임프레임 변경 (강제 새로고침으로 차트와 N/B 값 업데이트)
        // changeTimeframe 내부에서 this.currentTimeframe이 업데이트됨
        await this.changeTimeframe(timeframe, false, true);

        // 즉시 서버 기반 N/B 계산 요청: 좌측 메인 차트가 순회될 때마다 바로 호출
        try {
            if (typeof nbAgent !== 'undefined' && this.chartData && Array.isArray(this.chartData.prices) && this.chartData.prices.length > 1) {
                console.log(`📡 자동 순회: 서버 N/B 계산 요청 시작 (timeframe=${timeframe})`);
                (async () => {
                    try {
                        const serverNB = await nbAgent.calculateNB(this.chartData.prices, this.chartData);
                        if (serverNB && serverNB.nb_value !== undefined) {
                            // 차트 데이터에 서버 결과 반영
                            this.chartData.nb_value = serverNB.nb_value;
                            this.chartData.nb_max = serverNB.nb_max;
                            this.chartData.nb_min = serverNB.nb_min;
                            this.chartData.bit_max = serverNB.bit_max || this.chartData.bit_max;
                            this.chartData.bit_min = serverNB.bit_min || this.chartData.bit_min;
                            // UI 업데이트
                            this.updateNBDisplay({
                                nb_value: this.chartData.nb_value,
                                nb_max: this.chartData.nb_max,
                                nb_min: this.chartData.nb_min,
                                bit_max: this.chartData.bit_max,
                                bit_min: this.chartData.bit_min
                            }, this.chartData.prices);
                            // 이벤트 디스패치: 다른 모듈이 즉시 반응할 수 있도록 함
                            window.dispatchEvent(new CustomEvent('nb:fetched', { detail: { timeframe: timeframe, nb: serverNB } }));
                            console.log(`✅ 자동 순회: 서버 N/B 계산 완료 (timeframe=${timeframe})`);
                        }
                    } catch (e) {
                        console.warn('⚠️ 자동 순회 중 서버 N/B 계산 실패:', e);
                    }
                })();
            }
        } catch (e) {
            console.warn('⚠️ 자동 순회 N/B 호출 예외:', e);
        }
        
        // 인덱스 업데이트 (changeTimeframe 이후)
        this.currentTimeframeIndex = index;
        
        console.log(`✅ ===== 타임프레임 순회 완료: ${timeframe} =====\n`);
        
        // 순회 상태 표시 업데이트
        if (typeof setChartCycleIndicator === 'function') {
            setChartCycleIndicator(true);
        }
        const statusEl = document.getElementById('chart-cycle-status');
        if (statusEl && this.cycleMode) {
            const nextIndex = (index + 1) % this.timeframes.length;
            const nextTf = this.timeframes[nextIndex];
            statusEl.textContent = `분봉 순회 ON (${timeframe} → ${nextTf})`;
            statusEl.classList.add('on');
        }
        
        // 다음 타임프레임으로 이동 (재귀적 호출)
        if (this.cycleMode) {
            // 다음 인덱스 계산
            const nextIndex = (index + 1) % this.timeframes.length;
            this.currentTimeframeIndex = nextIndex;
            
            // setTimeout을 사용하여 다음 타임프레임으로 이동
            this.cycleTimeout = setTimeout(() => {
                this.executeTimeframeCycle();
            }, this.cycleIntervalMs);
        }
    }
    
    /**
     * 타임프레임 순회 중지
     */
    stopTimeframeCycle() {
        if (this.cycleTimeout) {
            clearTimeout(this.cycleTimeout);
            this.cycleTimeout = null;
        }
        this.cycleMode = false;
        this.isCycling = false; // 순회 플래그도 초기화
        console.log('⏸️ 타임프레임 순회 중지');
    }
    
    /**
     * 자동 업데이트 시작
     * @param {number} intervalMs - 업데이트 간격 (밀리초), 설정에서 가져옴
     */
    async startAutoUpdate(intervalMs = null) {
        // 기존 타임아웃 정리
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        
        // 간격 가져오기 (설정에서 동적으로)
        let updateInterval = intervalMs;
        if (!updateInterval) {
            try {
                const settings = await API.getSettings();
                updateInterval = settings.chart_update_interval_ms || 5000;
            } catch (error) {
                // 설정 로드 실패 시 기본값 사용
                updateInterval = Config.get('CHART_UPDATE_INTERVAL', 5000);
            }
        }
        
        this.updateIntervalMs = updateInterval;
        
        console.log(`📊 차트 자동 업데이트 시작: ${updateInterval}ms 간격`);
        
        // 초기 업데이트
        await this.update(this.currentTimeframe, true);
        
        // switch case를 사용한 자동 업데이트 시작
        this.executeAutoUpdate();
        
        // 타임프레임 순회 시작
        await this.startTimeframeCycle();
    }
    
    /**
     * switch case를 사용한 자동 업데이트 실행
     */
    async executeAutoUpdate() {
        // 현재 타임프레임에 따라 switch case로 분기
        switch (this.currentTimeframe) {
            case '1m':
                await this.updateChartData('1m');
                break;
            case '3m':
                await this.updateChartData('3m');
                break;
            case '5m':
                await this.updateChartData('5m');
                break;
            case '15m':
                await this.updateChartData('15m');
                break;
            case '30m':
                await this.updateChartData('30m');
                break;
            case '60m':
                await this.updateChartData('60m');
                break;
            case '1d':
                await this.updateChartData('1d');
                break;
            default:
                // 기본값: 1m
                await this.updateChartData('1m');
                break;
        }
    }
    
    /**
     * 차트 데이터 업데이트 (재귀적 호출)
     * @param {string} timeframe - 타임프레임
     */
    async updateChartData(timeframe) {
        try {
            // 현재 타임프레임의 최신 데이터로 업데이트
            await this.update(timeframe, false);
            
            // setTimeout을 사용하여 다음 업데이트 예약
            this.updateTimeout = setTimeout(() => {
                // 현재 타임프레임이 변경되었을 수 있으므로 다시 switch case 실행
                this.executeAutoUpdate();
            }, this.updateIntervalMs);
        } catch (error) {
            console.error('❌ 차트 데이터 업데이트 중 오류:', error);
            // 오류 발생 시에도 다음 업데이트 예약
            this.updateTimeout = setTimeout(() => {
                this.executeAutoUpdate();
            }, this.updateIntervalMs);
        }
    }
    
    /**
     * 자동 업데이트 간격 변경 (설정 변경 시 호출)
     */
    async restartAutoUpdate() {
        console.log('🔄 차트 자동 업데이트 재시작 (설정 변경)');
        await this.startAutoUpdate();
    }
    
    /**
     * 자동 업데이트 중지
     */
    stopAutoUpdate() {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }
        // 타임프레임 순회도 중지
        this.stopTimeframeCycle();
    }
    
    /**
     * 타임프레임 순회 간격 업데이트 (설정 변경 시)
     */
    async updateCycleInterval() {
        const wasCycling = this.cycleMode;
        if (wasCycling) {
            // 현재 순회 중이면 재시작
            console.log('🔄 타임프레임 순회 간격 업데이트 중...');
            this.stopTimeframeCycle();
            await this.startTimeframeCycle();
        }
    }
}

// 전역 인스턴스
const chartAgent = new ChartAgent();


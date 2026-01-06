    // 모듈 임포트
    import { CONFIG, STATE } from './modules/config.js';
    import { initMainChart, updateMainChart, createCardChart, addPredictedLine, clearPredictedLine } from './modules/chart-manager.js';
    import { saveCard, getAssetInfo, getCurrentPrice, getChartData } from './modules/nbverse-client.js';
    import { saveAnalysisData, loadAnalysisData, saveVerifiedCards, loadVerifiedCards } from './modules/storage-manager.js';
    import { initAIStatus, predictWithML, predictBasic, checkModel, retrainModelManually, updateAIStatus as updateAIStatusModule, calculateTrainingLevel, calculateTrainingSegment, calculateExperience, updateAIStatusLocal, updateAIPredictionStatusUI, updateAILearningStatusDisplayUI } from './modules/ai-prediction.js';
    import { createCard1, verifyCard, addVerifiedCard, renderVerifiedCards as renderVerifiedCardsModule, saveCardToNBVerse, getCachedChartSlice } from './modules/card-system.js';
    import progressTracker, { STAGES, initProgressTracker, startStage, completeStage, errorStage, skipStage, resetProgress } from './modules/progress-tracker.js';

    // perfDebug=1 (localStorage) 시 네트워크/차트 로깅 활성화
    const PERF_ENABLED = (() => {
      try { return typeof localStorage !== 'undefined' && localStorage.getItem('perfDebug') === '1'; }
      catch (_) { return false; }
    })();

    // 최근 OHLCV 응답 캐시 (interval별로 N초 내 중복 요청 스킵)
    const ohlcvCache = new Map(); // interval -> { ts, data, count }
    const MIN_FETCH_COOLDOWN_MS = 5000; // 동일 interval 재호출 최소 간격

    // 중복 요청 방지 플래그
    const activeRequests = {
      loadChartData: false,
      saveCard: new Set(),
      updateCard: new Set(),
      aiPredict: false
    };

    // interval별 기본 count (빠른 분봉은 더 작게)
    function getDefaultCountForInterval(interval) {
      const fast = { minute1: 120, minute3: 120, minute5: 120, minute10: 150, minute15: 150 };
      if (fast[interval]) return fast[interval];
      return CONFIG.CHART?.DEFAULT_COUNT || 150;
    }
    
    // N/B 프로그레스바 관리 함수들
    function showNBProgress(text, percent) {
      const container = document.getElementById('nbProgressContainer');
      const fill = document.getElementById('nbProgressFill');
      const textEl = document.getElementById('nbProgressText');
      const dataSection = document.getElementById('nbDataSection');

      if (container) container.style.display = 'block';
      if (dataSection) dataSection.style.opacity = '0.5';
      if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
      if (textEl) textEl.textContent = text;
    }
    
    function hideNBProgress() {
      const container = document.getElementById('nbProgressContainer');
      const dataSection = document.getElementById('nbDataSection');
      const fill = document.getElementById('nbProgressFill');
      const textEl = document.getElementById('nbProgressText');
      
      // 프로그레스바를 계속 표시하되 대기 상태로 리셋
      if (container) container.style.display = 'block';
      if (dataSection) dataSection.style.opacity = '1';
      if (fill) fill.style.width = '0%';
      if (textEl) textEl.textContent = 'N/B 데이터 대기 중...';
    }
    
    // 전역 객체로 내보내기 (기존 코드 호환)
    window.ChartAnalysis = {
      CONFIG, STATE,
      initMainChart, updateMainChart, createCardChart, addPredictedLine, clearPredictedLine,
      saveCard, getAssetInfo, getCurrentPrice, getChartData,
      saveAnalysisData, loadAnalysisData, saveVerifiedCards, loadVerifiedCards,
      initAIStatus, predictWithML, predictBasic, checkModel, retrainModelManually,
      createCard1, verifyCard, addVerifiedCard, renderVerifiedCards: renderVerifiedCardsModule,
      saveCardToNBVerse, getCachedChartSlice, updateAIStatusModule,
      showNBProgress, hideNBProgress
    };
    
    // API 기본 URL (기존 코드 호환성)
    const API_BASE_URL = CONFIG.API_BASE_URL;

    // 전역 상태/캐시 변수들
    const timeframeCardsArchive = {};
    let currentInterval = STATE.currentInterval || 'day';
    let previousInterval = null;

    // 분봉 순회/주기 제어
    const timeframes = ['minute1', 'minute3', 'minute5', 'minute10', 'minute15', 'minute30', 'minute60', 'day'];
    let currentTimeframeIndex = timeframes.indexOf(currentInterval);
    if (currentTimeframeIndex === -1) currentTimeframeIndex = timeframes.indexOf('minute10');
    let cycleMode = false;
    let cycleInterval = null;
    let cycleIntervalMs = 30000; // 기본 30초
    let updateInterval = null;

    let chart = null;
    let candleSeries = null;
    let emaFastSeries = null;
    let emaSlowSeries = null;
    let volumeSeries = null;
    let predictionSeries = null;

        // 안전한 setData 래퍼: series와 데이터 유효성 검증 후 setData 호출
        function safeSeriesSetData(seriesObj, data, name = 'series') {
          if (!seriesObj || typeof seriesObj.setData !== 'function') return;
          if (!data || !Array.isArray(data) || data.length === 0) {
            try { seriesObj.setData([]); } catch (e) { console.warn(`safeSeriesSetData: ${name} setData 빈배열 전달 실패`, e); }
            return;
          }

          const sanitized = [];
          for (const item of data) {
            if (!item || typeof item !== 'object') continue;

            // Coerce/normalize time values (allow ISO strings, Date objects, or numeric seconds)
            let time = item.time;
            if (typeof time === 'string') {
              const t = Date.parse(time);
              time = Number.isNaN(t) ? null : Math.floor(t / 1000);
            } else if (time instanceof Date) {
              time = Math.floor(time.getTime() / 1000);
            } else if (typeof time === 'number') {
              // if it looks like milliseconds (very large), convert to seconds
              if (time > 1e12) time = Math.floor(time / 1000);
              else time = Math.floor(time);
            } else {
              time = null;
            }

            if (!Number.isFinite(time)) continue;

            // Candlestick data
            if ('open' in item || 'high' in item || 'low' in item || 'close' in item) {
              const open = Number.parseFloat(item.open);
              const high = Number.parseFloat(item.high);
              const low = Number.parseFloat(item.low);
              const close = Number.parseFloat(item.close);
              if (![open, high, low, close].every(Number.isFinite)) continue;
              sanitized.push({ time, open, high, low, close });
              continue;
            }

            // Line/Histogram data
            if ('value' in item) {
              const value = Number.parseFloat(item.value);
              if (!Number.isFinite(value)) continue;
              const out = { time, value };
              if ('color' in item) out.color = item.color;
              sanitized.push(out);
              continue;
            }
          }

          if (sanitized.length === 0) {
            console.warn(`safeSeriesSetData: ${name} 필터링 결과 유효 데이터 없음`, { originalLength: data.length });
            try { seriesObj.setData([]); } catch (e) { console.warn(`safeSeriesSetData: ${name} setData 빈배열 전달 실패`, e); }
            return;
          }

          try {
            seriesObj.setData(sanitized);
          } catch (error) {
            console.error(`safeSeriesSetData: ${name} setData 실패`, error, { sample: sanitized[0] });
            try { seriesObj.setData([]); } catch (e) { /* swallow */ }
          }
        }

    // 전역 에러/Promise rejection 핸들러: 라이브차트에서 Value is null 발생시 스택과 관련 상태를 캡처
    window.addEventListener('error', (ev) => {
      try {
        console.error('⛔ 전역 에러 캡처:', ev.error || ev.message, ev.filename + ':' + ev.lineno + ':' + ev.colno);
        // 간단한 화면 오버레이 표시
        const existing = document.getElementById('globalErrorOverlay');
        if (!existing) {
          const overlay = document.createElement('div');
          overlay.id = 'globalErrorOverlay';
          overlay.style.position = 'fixed';
          overlay.style.right = '12px';
          overlay.style.bottom = '12px';
          overlay.style.padding = '8px 12px';
          overlay.style.background = 'rgba(246,70,93,0.95)';
          overlay.style.color = '#fff';
          overlay.style.zIndex = 99999;
          overlay.style.fontSize = '12px';
          overlay.style.borderRadius = '6px';
          overlay.textContent = `Error: ${ev.message || ev.error}`;
          document.body.appendChild(overlay);
          setTimeout(() => { try { overlay.remove(); } catch(e){} }, 10000);
        }
      } catch (e) {
        console.error('전역 에러 핸들러 내부 오류', e);
      }
    });

    window.addEventListener('unhandledrejection', (ev) => {
      try {
        console.warn('⚠️ Unhandled Rejection:', ev.reason);
      } catch (e) {
        console.error('unhandledrejection handler error', e);
      }
    });

    let card1 = null;
    let card2 = null;
    let card3 = null;
    let card1Prediction = null;
    let card2Data = null;
    let previousCard2Data = null;
    let previousPreviousCard2Data = null;
    let card3Data = null;
    let lastCandleTime = null;

    let aiStatus = {
      level: 1,
      experience: 0,
      totalTrainingCount: 0,
      totalProfit: 0,
      segment: '0-200',
      modelType: CONFIG.AI.DEFAULT_MODEL,
      trainR2: 0,
      valR2: 0,
      lastTrainingTime: null
    };

    // 카드/트레이드 상태
    let pendingCards = [];
    let verifiedCards = [];
    let boughtCards = [];
    let completedTrades = [];
    let currentBoughtCardsTab = 'bought';

    // 기본 매수 금액 (최소 5,000원)
    const DEFAULT_BUY_AMOUNT = 10000;
    let defaultBuyAmount = Math.max(5000, STATE.defaultBuyAmount || DEFAULT_BUY_AMOUNT);
    STATE.defaultBuyAmount = defaultBuyAmount;

    // 최근 차트 데이터 캐시 (학습 시 재사용)
    let cachedChartData = null;
    
    // 모델 학습 상태 추적 (전역 변수)
    let globalModelTrained = STATE.globalModelTrained;

    // 저장된 분석 데이터 복원
    function restoreAnalysisData() {
      try {
        // 기본 매수 금액 복원 (저장 데이터가 없을 때도 초기화)
        defaultBuyAmount = Math.max(5000, STATE.defaultBuyAmount || DEFAULT_BUY_AMOUNT);
        STATE.defaultBuyAmount = defaultBuyAmount;

        const saved = loadAnalysisData();

        if (!saved) {
          // 개별 저장된 검증 카드만이라도 복원
          const savedVerified = loadVerifiedCards();
          if (Array.isArray(savedVerified) && savedVerified.length > 0) {
            verifiedCards = savedVerified;
            STATE.verifiedCards = verifiedCards;
          }
          STATE.defaultBuyAmount = defaultBuyAmount;
          return;
        }

        currentInterval = saved.currentInterval || currentInterval;
        STATE.currentInterval = currentInterval;

        const savedDefaultBuyAmount = Math.max(5000, saved.defaultBuyAmount || defaultBuyAmount);
        defaultBuyAmount = savedDefaultBuyAmount;
        STATE.defaultBuyAmount = savedDefaultBuyAmount;

        pendingCards = Array.isArray(saved.pendingCards) ? saved.pendingCards : [];
        verifiedCards = Array.isArray(saved.verifiedCards) ? saved.verifiedCards : [];
        boughtCards = Array.isArray(saved.boughtCards) ? saved.boughtCards : [];

        STATE.pendingCards = pendingCards;
        STATE.verifiedCards = verifiedCards;
        STATE.boughtCards = boughtCards;
        STATE.currentPrice = saved.currentPrice || STATE.currentPrice;
        STATE.lastSaveTime = saved.lastSaveTime || STATE.lastSaveTime;

        // UI 반영 (정의 이후 실행되도록 호출만 남김)
        if (typeof renderVerifiedCardsLocal === 'function') {
          renderVerifiedCardsLocal('verifiedCardsContainer');
        }
        if (typeof renderBoughtCards === 'function') {
          renderBoughtCards();
        }
        if (typeof renderCompletedTrades === 'function') {
          renderCompletedTrades();
        }

        console.log('✅ 저장된 분석 데이터 복원 완료', {
          interval: currentInterval,
          pending: pendingCards.length,
          verified: verifiedCards.length,
          bought: boughtCards.length
        });
      } catch (error) {
        console.error('📂 분석 데이터 복원 실패:', error);
      }
    }

    // API 연결 확인
    async function checkAPIConnection() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) 
        });
        return response.ok;
      } catch (error) {
        console.error('API 서버 연결 실패:', error);
        return false;
      }
    }
    
    // 분봉별 카드 데이터 가져오기/초기화
    function getTimeframeCards(timeframe) {
      if (!timeframeCardsArchive[timeframe]) {
        timeframeCardsArchive[timeframe] = {
          card1: null,
          card2: null,
          card3: null,
          card1Prediction: null,
          card2Data: null,
          card3Data: null,
          previousCard2Data: null,
          previousPreviousCard2Data: null,
          lastCandleTime: null
        };
      }
      return timeframeCardsArchive[timeframe];
    }
    
    // 현재 분봉의 카드 데이터 저장
    function saveCurrentTimeframeCards() {
      if (!currentInterval) return;
      
      const cards = getTimeframeCards(currentInterval);
      cards.card1 = card1;
      cards.card2 = card2;
      cards.card3 = card3;
      cards.card1Prediction = card1Prediction ? JSON.parse(JSON.stringify(card1Prediction)) : null;
      cards.card2Data = card2Data ? JSON.parse(JSON.stringify(card2Data)) : null;
      cards.card3Data = card3Data ? JSON.parse(JSON.stringify(card3Data)) : null;
      cards.previousCard2Data = previousCard2Data ? JSON.parse(JSON.stringify(previousCard2Data)) : null;
      cards.previousPreviousCard2Data = previousPreviousCard2Data ? JSON.parse(JSON.stringify(previousPreviousCard2Data)) : null;
      cards.lastCandleTime = lastCandleTime;
      
      console.log(`💾 ${currentInterval} 분봉 카드 데이터 저장 완료`);
    }
    
    // 특정 분봉의 카드 데이터 복원
    function restoreTimeframeCards(timeframe) {
      const cards = getTimeframeCards(timeframe);
      card1 = cards.card1;
      card2 = cards.card2;
      card3 = cards.card3;
      card1Prediction = cards.card1Prediction ? JSON.parse(JSON.stringify(cards.card1Prediction)) : null;
      card2Data = cards.card2Data ? JSON.parse(JSON.stringify(cards.card2Data)) : null;
      card3Data = cards.card3Data ? JSON.parse(JSON.stringify(cards.card3Data)) : null;
      previousCard2Data = cards.previousCard2Data ? JSON.parse(JSON.stringify(cards.previousCard2Data)) : null;
      previousPreviousCard2Data = cards.previousPreviousCard2Data ? JSON.parse(JSON.stringify(cards.previousPreviousCard2Data)) : null;
      lastCandleTime = cards.lastCandleTime;
      
      console.log(`📂 ${timeframe} 분봉 카드 데이터 복원 완료`);
    }
    
    // 차트 초기화
    function initChart() {
      const container = document.getElementById('tvChart');
      if (!container) return;
      try {
        chart = LightweightCharts.createChart(container, {
        layout: { 
          background: { type: 'solid', color: '#0b1220' }, 
          textColor: '#e6eefc' 
        },
        grid: { 
          vertLines: { color: 'rgba(255,255,255,0.05)' }, 
          horzLines: { color: 'rgba(255,255,255,0.05)' } 
        },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
        timeScale: { borderColor: 'rgba(255,255,255,0.08)' },
        crosshair: { mode: LightweightCharts.CrosshairMode.Magnet },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
        autoSize: true,
      });
      } catch (error) {
        console.error('initChart: LightweightCharts.createChart 실패', error);
        try { container.innerHTML = '<div style="padding:20px;color:#ff6b6b;">차트 라이브러리 로드 실패</div>'; } catch(e){}
        return;
      }
      
      candleSeries = chart.addCandlestickSeries({
        upColor: '#0ecb81',
        downColor: '#f6465d',
        wickUpColor: '#0ecb81',
        wickDownColor: '#f6465d',
        borderVisible: false,
      });
      // 안전한 setData 래핑 (추가 방어)
      try { if (candleSeries) {
        const orig = candleSeries.setData.bind(candleSeries);
        candleSeries.setData = function(data) {
          try {
            if (!data || !Array.isArray(data) || data.length === 0) return orig([]);
            const filtered = data.filter(d => d && typeof d === 'object')
              .map(item => {
                let time = item.time;
                if (typeof time === 'string') {
                  const t = Date.parse(time);
                  time = Number.isNaN(t) ? null : Math.floor(t/1000);
                } else if (time instanceof Date) {
                  time = Math.floor(time.getTime()/1000);
                }
                const open = parseFloat(item.open);
                const high = parseFloat(item.high);
                const low = parseFloat(item.low);
                const close = parseFloat(item.close);
                if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
                return { time, open, high, low, close };
              })
              .filter(x => x !== null);
            if (!filtered || filtered.length === 0) return orig([]);
            return orig(filtered);
          } catch (e) { console.error('candleSeries.setData wrapper error', e); try { return orig([]); } catch(e){} }
        } }
      } catch(e) { console.warn('candleSeries wrapping failed', e); }
      
      emaFastSeries = chart.addLineSeries({ 
        color: 'rgba(14,203,129,0.9)', 
        lineWidth: 2,
        title: 'EMA Fast'
      });
      
      emaSlowSeries = chart.addLineSeries({ 
        color: 'rgba(246,70,93,0.9)', 
        lineWidth: 2,
        title: 'EMA Slow'
      });
      
      volumeSeries = chart.addHistogramSeries({ 
        priceScaleId: 'left', 
        color: 'rgba(76,201,240,0.5)', 
        lineWidth: 1 
      });
      
      // AI 예측 가격 시리즈 추가 (점선 - 여러 시점 예측)
      predictionSeries = chart.addLineSeries({
        color: 'rgba(76,201,240,0.8)',
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        title: 'AI 예측 가격',
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
      });
      
      chart.priceScale('left').applyOptions({ 
        scaleMargins: { top: 0.8, bottom: 0 }, 
        borderColor: 'rgba(255,255,255,0.08)' 
      });
      
      // 차트 데이터는 사용자가 명시적으로 요청할 때만 로드
      // 캐시된 데이터가 있으면 복원
      if (cachedChartData && cachedChartData.length > 0) {
        console.log('📦 캐시된 차트 데이터 복원:', cachedChartData.length, '개 캔들');
        updateMainChart(cachedChartData);
      } else {
        console.log('ℹ️ 차트 준비 완료. 새로고침 버튼을 눌러 데이터를 불러오세요.');
      }
    }
    
    // EMA 계산 함수
    function ema(values, period) {
      if (!values || values.length === 0) return [];
      const k = 2 / (period + 1);
      const out = [];
      let prev = values[0];
      for (let i = 0; i < values.length; i++) {
        prev = (values[i] * k) + (prev * (1 - k));
        out.push(prev);
      }
      return out;
    }
    
    // 분봉 이름 변환 함수
    function getTimeframeName(interval) {
      const names = {
        'minute1': '1분',
        'minute3': '3분',
        'minute5': '5분',
        'minute10': '10분',
        'minute15': '15분',
        'minute30': '30분',
        'minute60': '60분',
        'hour': '1시간',
        'day': '일봉'
      };
      return names[interval] || interval;
    }
    
    // 자산 정보 관련 변수
    let lastBalanceData = null; // 이전 자산 정보 저장
    let balanceCheckInterval = null; // 자산 변경 체크 인터벌
    let balanceUpdateInterval = null; // 정기 업데이트 인터벌
    let balanceUpdatePending = false; // 업데이트 대기 중 플래그
    
    // Throttle 헬퍼 함수 (성능 최적화)
    function throttle(func, delay) {
      let lastCall = 0;
      let timeout = null;
      return function(...args) {
        const now = Date.now();
        const remaining = delay - (now - lastCall);
        
        if (remaining <= 0) {
          if (timeout) {
            clearTimeout(timeout);
            timeout = null;
          }
          lastCall = now;
          return func.apply(this, args);
        } else if (!timeout) {
          timeout = setTimeout(() => {
            lastCall = Date.now();
            timeout = null;
            func.apply(this, args);
          }, remaining);
        }
      };
    }
    
    // 자산 정보 캐시
    let balanceDataCache = {
      data: null,
      timestamp: null
    };
    
    // 자산 정보를 UI에 표시하는 함수
    function displayBalanceData(data, isFromCache = false) {
      const balanceContent = document.getElementById('balanceContent');
      if (!balanceContent || !data) return;
      
      const krw = data.krw || 0;
      const btc = data.btc || 0;
      const total = data.total || 0;
      const allAssets = data.all_assets || [];
      
      // 이전 값과 비교하여 변경 감지
      let hasChanged = false;
      if (lastBalanceData) {
        const prevTotal = lastBalanceData.total || 0;
        const prevKrw = lastBalanceData.krw || 0;
        const prevBtc = lastBalanceData.btc || 0;
        
        // 총 자산, KRW, BTC 중 하나라도 변경되었으면 변경 감지
        if (Math.abs(total - prevTotal) > 0.01 || 
            Math.abs(krw - prevKrw) > 0.01 || 
            Math.abs(btc - prevBtc) > 0.01) {
          hasChanged = true;
          console.log('🔄 자산 변경 감지:', {
            total: `${prevTotal.toLocaleString()} → ${total.toLocaleString()}`,
            krw: `${prevKrw.toLocaleString()} → ${krw.toLocaleString()}`,
            btc: `${prevBtc.toFixed(8)} → ${btc.toFixed(8)}`
          });
        }
      } else {
        // 첫 로드
        hasChanged = true;
      }
      
      // 값이 변경되었거나 강제 업데이트인 경우에만 UI 업데이트
      if (hasChanged || !lastBalanceData) {
        let balanceHtml = `
          <div class="balance-total">
            ${total.toLocaleString()} KRW
            ${isFromCache ? '<small style="color: #ffc107; margin-left: 8px;">(캐시)</small>' : ''}
          </div>
          <div class="balance-items">
            <div class="balance-item">
              <span class="balance-item-label">KRW</span>
              <span class="balance-item-value krw">${krw.toLocaleString()} KRW</span>
            </div>
        `;
        
        // BTC 표시
        if (btc > 0) {
          const btcKrwValue = (data.all_assets || []).find(a => a.currency === 'BTC')?.krw_value || 0;
          balanceHtml += `
            <div class="balance-item">
              <span class="balance-item-label">BTC</span>
              <span class="balance-item-value btc">${btc.toFixed(8)} BTC (${btcKrwValue.toLocaleString()} KRW)</span>
            </div>
          `;
        }
        
        // 다른 코인 표시 (BTC, KRW 제외)
        const otherAssets = allAssets.filter(a => a.currency !== 'KRW' && a.currency !== 'BTC' && a.balance > 0);
        if (otherAssets.length > 0) {
          otherAssets.forEach(asset => {
            balanceHtml += `
              <div class="balance-item">
                <span class="balance-item-label">${asset.currency}</span>
                <span class="balance-item-value">${asset.balance.toFixed(8)} (${asset.krw_value.toLocaleString()} KRW)</span>
              </div>
            `;
          });
        }
        
        balanceHtml += `
          </div>
        `;
        
        balanceContent.innerHTML = balanceHtml;
        
        if (hasChanged && !isFromCache) {
          console.log('✅ 자산 정보 업데이트 완료 (변경 감지)');
        } else if (isFromCache) {
          console.log('✅ 캐시된 자산 정보 표시');
        }
      }
      
      // 현재 값을 이전 값으로 저장
      lastBalanceData = {
        krw: krw,
        btc: btc,
        total: total,
        all_assets: allAssets
      };
    }
    
    // 자산 정보 업데이트 함수
    async function updateBalance(forceUpdate = false) {
      const balanceContent = document.getElementById('balanceContent');
      if (!balanceContent) return;
      
      // 업데이트 중이면 스킵
      if (balanceUpdatePending && !forceUpdate) {
        return;
      }
      
      try {
        balanceUpdatePending = true;
        
        // 로딩 표시는 첫 로드나 강제 업데이트 시에만
        if (!lastBalanceData || forceUpdate) {
          balanceContent.innerHTML = '<div class="balance-loading">자산 정보를 불러오는 중...</div>';
        }
        
        const response = await fetch(`${API_BASE_URL}/balance`, {
          signal: AbortSignal.timeout(30000) // 30초로 증가 (서버 응답 지연 대응)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
          balanceContent.innerHTML = `
            <div class="balance-error">
              ⚠️ ${data.error}
            </div>
          `;
          balanceUpdatePending = false;
          return;
        }
        
        // 캐시에 저장
        balanceDataCache = {
          data: data,
          timestamp: Date.now()
        };
        
        // localStorage에도 저장
        try {
          localStorage.setItem('balanceDataCache', JSON.stringify(balanceDataCache));
        } catch (e) {
          console.warn('자산 정보 localStorage 저장 실패:', e);
        }
        
        // 자산 정보 표시
        displayBalanceData(data, false);
        
        balanceUpdatePending = false;
      } catch (error) {
        // 타임아웃 에러는 조용히 처리 (캐시 사용)
        const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError' || error.message?.includes('timeout');
        
        // 타임아웃이 아닌 다른 에러만 로그 (타임아웃은 정상적인 네트워크 상황일 수 있음)
        if (!isTimeout) {
          console.warn('⚠️ 자산 정보 로드 실패:', error.name, error.message);
        }
        
        // 캐시에서 데이터 로드 시도
        let cachedData = null;
        
        // 메모리 캐시 확인
        if (balanceDataCache.data) {
          const cacheAge = Date.now() - (balanceDataCache.timestamp || 0);
          // 캐시가 30분 이내면 사용
          if (cacheAge < 1800000) {
            cachedData = balanceDataCache.data;
          }
        }
        
        // localStorage 캐시 확인
        if (!cachedData) {
          try {
            const stored = localStorage.getItem('balanceDataCache');
            if (stored) {
              const storedCache = JSON.parse(stored);
              if (storedCache.data) {
                const cacheAge = Date.now() - (storedCache.timestamp || 0);
                if (cacheAge < 1800000) {
                  cachedData = storedCache.data;
                  balanceDataCache = storedCache;
                }
              }
            }
          } catch (e) {
            // 조용히 처리
          }
        }
        
        // 캐시된 데이터가 있으면 조용히 사용 (에러 표시 안 함)
        if (cachedData) {
          displayBalanceData(cachedData, true);
          // 조용히 처리 - 콘솔 로그도 최소화
        } else {
          // 캐시도 없고 기존 데이터도 없을 때만 로딩 상태 유지 (에러 표시 안 함)
          if (!lastBalanceData) {
            // 첫 로드이고 캐시도 없으면 로딩 상태 유지 (다음 업데이트에서 재시도)
            balanceContent.innerHTML = '<div class="balance-loading">자산 정보를 불러오는 중...</div>';
          }
          // 기존 데이터가 있으면 그대로 유지 (에러 표시 안 함)
        }
        
        balanceUpdatePending = false;
        // 조용히 실패 처리 - 다음 업데이트 주기에서 자동 재시도됨
      }
    }
    
    // 자산 변경 체크 함수 (30초마다 체크, 변경 시 즉시 업데이트)
    function checkBalanceChange() {
      updateBalance(false); // 강제 업데이트가 아니므로 변경 감지만 수행
    }
    
    // 자산 정보 자동 업데이트 시작
    function startBalanceUpdate() {
      // 기존 인터벌 정리
      if (balanceUpdateInterval) {
        clearInterval(balanceUpdateInterval);
      }
      if (balanceCheckInterval) {
        clearInterval(balanceCheckInterval);
      }
      
      // localStorage에서 캐시 로드 시도 (초기 로드)
      try {
        const stored = localStorage.getItem('balanceDataCache');
        if (stored) {
          const storedCache = JSON.parse(stored);
          if (storedCache.data) {
            const cacheAge = Date.now() - (storedCache.timestamp || 0);
            if (cacheAge < 1800000) { // 30분 이내
              balanceDataCache = storedCache;
              // 캐시된 데이터로 먼저 표시
              displayBalanceData(storedCache.data, true);
              console.log('✅ 초기 로드: 캐시된 자산 정보로 표시');
            }
          }
        }
      } catch (e) {
        console.warn('초기 자산 정보 캐시 로드 실패:', e);
      }
      
      // 즉시 한 번 실행 (최신 데이터로 업데이트 시도)
      updateBalance(true);
      
      // 정기 업데이트: 3분(180초)마다
      balanceUpdateInterval = setInterval(() => {
        updateBalance(true);
      }, 180000); // 3분 = 180초 = 180000ms
      
      // 자산 변경 체크: 30초마다 (값 변경 감지용)
      balanceCheckInterval = setInterval(() => {
        checkBalanceChange();
      }, 30000); // 30초마다 체크
      
      console.log('✅ 자산 정보 자동 업데이트 시작 (정기: 3분, 변경 체크: 30초)');
    }
    
    function stopBalanceUpdate() {
      if (balanceUpdateInterval) {
        clearInterval(balanceUpdateInterval);
        balanceUpdateInterval = null;
      }
      if (balanceCheckInterval) {
        clearInterval(balanceCheckInterval);
        balanceCheckInterval = null;
      }
    }
    
    // 카드 초기화 함수
    function resetCards() {
      card1 = null;
      card2 = null;
      card3 = null;
      card1Prediction = null;
      card2Data = null;
      previousCard2Data = null;
      previousPreviousCard2Data = null;
      card3Data = null;
      lastCandleTime = null;
      
      // 예측 가격 차트 초기화
      if (predictionSeries) {
        safeSeriesSetData(predictionSeries, [], 'predictionSeries');
        try { predictionSeries.setMarkers([]); } catch (e) { console.warn('predictionSeries.setMarkers 실패', e); }
      }
      
      // 카드 UI 초기화 (null 체크 추가)
      const safeSetText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };
      safeSetText('card1Timeframe', '-');
      safeSetText('card1Price', '-');
      safeSetText('card1Time', '-');
      safeSetText('card1EmaFast', '-');
      safeSetText('card1EmaSlow', '-');
      safeSetText('card1NBValue', '-');
      safeSetText('card1NBMax', '-');
      safeSetText('card1NBMin', '-');
      safeSetText('card1PredictedPrice', '-');
      safeSetText('card1Confidence', '신뢰도: -');
      safeSetText('card2Timeframe', '-');
      safeSetText('card2Price', '-');
      safeSetText('card2PredictedPrice', '-');
      safeSetText('card2ProductionDate', '-');
      safeSetText('card2ProductionPrice', '-');
      safeSetText('card2ProductionTimeframe', '-');
      safeSetText('card2EmaFast', '-');
      safeSetText('card2EmaSlow', '-');
      safeSetText('card2NBValue', '-');
      safeSetText('card2NBMax', '-');
      safeSetText('card2NBMin', '-');
      safeSetText('card2PredictedZone', '-');
      safeSetText('card2ActualZone', '-');
      safeSetText('card2PredictedPrice', '-');
      safeSetText('card2PredictedPriceDisplay', '-');
      safeSetText('card2Confidence', '신뢰도: -');
      
      // 카드 3 UI 초기화
      safeSetText('card3Timeframe', '-');
      safeSetText('card3PredictedPrice', '-');
      safeSetText('card3ActualPrice', '-');
      safeSetText('card3ProductionDate', '-');
      safeSetText('card3ProductionPrice', '-');
      safeSetText('card3ProductionTimeframe', '-');
      safeSetText('card3Error', '-');
      safeSetText('card3PriceChange', '-');
      safeSetText('card3NBValue', '-');
      safeSetText('card3NBMax', '-');
      safeSetText('card3NBMin', '-');
      safeSetText('card3ZoneAccuracy', '-');
      
      // 카드 차트 초기화
      const card2ChartContainer = document.getElementById('card2Chart');
      const card3ChartContainer = document.getElementById('card3Chart');
      if (card2ChartContainer) card2ChartContainer.innerHTML = '';
      if (card3ChartContainer) card3ChartContainer.innerHTML = '';
      
      const card1El = document.getElementById('card1');
      const card2El2 = document.getElementById('card2');
      const card3El2 = document.getElementById('card3');
      
      if (card1El) {
        card1El.classList.remove('active', 'waiting');
        card1El.classList.add('waiting');
      }
      if (card2El2) {
        card2El2.classList.remove('active', 'verified');
        card2El2.classList.add('waiting');
      }
      if (card3El2) {
        card3El2.classList.remove('active', 'verified');
        card3El2.classList.add('waiting');
      }

      const card3Status = document.getElementById('card3Status');
      if (card3Status) {
        card3Status.textContent = '대기 중';
        card3Status.className = 'card-status waiting';
        card3Status.style.color = '#9aa0a6';
      }
      
      // 타입 배지 초기화
      const card1Badge = document.getElementById('card1TypeBadge');
      const card2Badge = document.getElementById('card2TypeBadge');
      const card3Badge = document.getElementById('card3TypeBadge');
      if (card1Badge) {
        card1Badge.style.display = 'none';
        card1Badge.textContent = '';
      }
      if (card2Badge) {
        card2Badge.style.display = 'none';
        card2Badge.textContent = '';
      }
      if (card3Badge) {
        card3Badge.style.display = 'none';
        card3Badge.textContent = '';
      }
      
      const verificationSection = document.getElementById('card3Verification');
      if (verificationSection) {
        verificationSection.style.display = 'none';
      }
      
      console.log('✅ 카드 초기화 완료');
    }
    
    // 카드 UI 복원 (분봉 변경 시 저장된 데이터로 복원)
    function restoreCardsUI() {
      if (!card2Data && !card1Prediction) {
        resetCards();
        return;
      }
      
      // 카드 1 복원
      if (card1Prediction) {
        updateCard1UI(
          card1Prediction.predictedPrice,
          card1Prediction.nbValue ? {
            nbValue: card1Prediction.nbValue,
            nbMax: card1Prediction.nbMax,
            nbMin: card1Prediction.nbMin
          } : null
        );
        if (card1) {
          document.getElementById('card1').classList.remove('waiting');
          document.getElementById('card1').classList.add('active');
        }
      }
      
      // 카드 2 복원
      if (card2Data) {
        const timeframeName = getTimeframeName(card2Data.productionTimeframe || currentInterval);
        document.getElementById('card2Timeframe').textContent = timeframeName;
        document.getElementById('card2Price').textContent = card2Data.price ? card2Data.price.toLocaleString() + ' 원' : '-';
        if (card2Data.productionDate) {
          document.getElementById('card2ProductionDate').textContent = new Date(card2Data.productionDate).toLocaleString('ko-KR', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        }
        if (card2Data.productionPrice) {
          document.getElementById('card2ProductionPrice').textContent = card2Data.productionPrice.toLocaleString() + ' 원';
        }
        document.getElementById('card2ProductionTimeframe').textContent = timeframeName;
        if (card2Data.emaFast) {
          document.getElementById('card2EmaFast').textContent = card2Data.emaFast.toLocaleString() + ' 원';
        }
        if (card2Data.emaSlow) {
          document.getElementById('card2EmaSlow').textContent = card2Data.emaSlow.toLocaleString() + ' 원';
        }
        if (card2Data.nbValue !== undefined) {
          const decimalPlaces = 10;
          document.getElementById('card2NBValue').textContent = card2Data.nbValue.toFixed(decimalPlaces);
          document.getElementById('card2NBMax').textContent = card2Data.nbMax ? card2Data.nbMax.toFixed(decimalPlaces) : '-';
          document.getElementById('card2NBMin').textContent = card2Data.nbMin ? card2Data.nbMin.toFixed(decimalPlaces) : '-';
        }

        // 구역 계산/표시 (복원 시에도 보장)
        const restoredZone = determineZone(card2Data.nbValue !== undefined ? card2Data.nbValue : null, card2Data.previousZone || null);
        card2Data.actualZone = restoredZone;
        const predictedZoneRow = document.getElementById('card2PredictedZoneRow');
        const predictedZoneEl = document.getElementById('card2PredictedZone');
        const actualZoneEl = document.getElementById('card2ActualZone');

        // 카드 2에서는 예측 구역을 표시하지 않음
        if (predictedZoneRow) predictedZoneRow.style.display = 'none';
        if (predictedZoneEl) {
          predictedZoneEl.textContent = '-';
          predictedZoneEl.style.color = '#9aa0a6';
        }

        if (actualZoneEl) {
          if (restoredZone) {
            actualZoneEl.textContent = getZoneName(restoredZone);
            actualZoneEl.style.color = getZoneColor(restoredZone);
          } else {
            actualZoneEl.textContent = '-';
            actualZoneEl.style.color = '#9aa0a6';
          }
        }

        // 예측 가격 표시 (복원 시)
        const predictedPrice = card2Data.predictedPrice || (card1Prediction && card1Prediction.predictedPrice);
        if (predictedPrice) {
          const priceText = predictedPrice.toLocaleString() + ' 원';
          const predEl = document.getElementById('card2PredictedPrice');
          const predDispEl = document.getElementById('card2PredictedPriceDisplay');
          if (predEl) predEl.textContent = priceText;
          if (predDispEl) predDispEl.textContent = priceText;
          const confEl = document.getElementById('card2Confidence');
          if (confEl && card1Prediction && card1Prediction.confidence) {
            confEl.textContent = `신뢰도: ${(card1Prediction.confidence * 100).toFixed(1)}%`;
          }
        }
        if (card2) {
          document.getElementById('card2').classList.remove('waiting');
          document.getElementById('card2').classList.add('active');
        }
      }
      
      // 카드 3 복원 - 현재 분봉에 맞는 검증 완료 카드만 표시
      // 현재 분봉의 card3Data가 있으면 사용, 없으면 하단 영역에서 현재 분봉에 맞는 가장 최근 검증 완료 카드 찾기
      let card3ToDisplay = null;
      
      if (card3Data && card3Data.productionTimeframe === currentInterval) {
        // 현재 분봉의 card3Data가 있으면 사용
        card3ToDisplay = card3Data;
      } else {
        // 하단 영역에서 현재 분봉에 맞는 가장 최근 검증 완료 카드 찾기
        const currentTimeframeCards = verifiedCards
          .filter(card => card.timeframe === currentInterval)
          .sort((a, b) => {
            const timeA = new Date(a.verifiedTime || a.productionDate || 0).getTime();
            const timeB = new Date(b.verifiedTime || b.productionDate || 0).getTime();
            return timeB - timeA; // 최신순
          });
        
        if (currentTimeframeCards.length > 0) {
          // 가장 최근 검증 완료 카드를 card3Data 형식으로 변환
          const latestCard = currentTimeframeCards[0];
          card3ToDisplay = {
            actualPrice: latestCard.actualPrice,
            predictedPrice: latestCard.predictedPrice,
            time: new Date(latestCard.verifiedTime || latestCard.productionDate),
            error: latestCard.error,
            isAccurate: latestCard.isAccurate,
            isDirectionCorrect: latestCard.isDirectionCorrect,
            nbValue: latestCard.nbValue,
            nbMax: latestCard.nbMax,
            nbMin: latestCard.nbMin,
            productionDate: latestCard.productionDate,
            productionPrice: latestCard.productionPrice,
            productionTimeframe: latestCard.productionTimeframe,
            priceChangeRate: latestCard.priceChangeRate,
            data: latestCard.data || []
          };
          // card3Data도 업데이트
          card3Data = card3ToDisplay;
          console.log(`✅ 현재 분봉(${getTimeframeName(currentInterval)})에 맞는 검증 완료 카드로 카드 3 업데이트`);
        }
      }
      
      if (card3ToDisplay) {
        const timeframeName = getTimeframeName(card3ToDisplay.productionTimeframe || currentInterval);
        document.getElementById('card3Timeframe').textContent = timeframeName;
        if (card3ToDisplay.predictedPrice) {
          document.getElementById('card3PredictedPrice').textContent = card3ToDisplay.predictedPrice.toLocaleString() + ' 원';
        }
        if (card3ToDisplay.actualPrice) {
          document.getElementById('card3ActualPrice').textContent = card3ToDisplay.actualPrice.toLocaleString() + ' 원';
        }
        if (card3ToDisplay.productionDate) {
          document.getElementById('card3ProductionDate').textContent = new Date(card3ToDisplay.productionDate).toLocaleString('ko-KR', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          });
        }
        if (card3ToDisplay.productionPrice) {
          document.getElementById('card3ProductionPrice').textContent = card3ToDisplay.productionPrice.toLocaleString() + ' 원';
        }
        document.getElementById('card3ProductionTimeframe').textContent = timeframeName;
        if (card3ToDisplay.error !== undefined) {
          document.getElementById('card3Error').textContent = card3ToDisplay.error.toFixed(2) + '%';
          document.getElementById('card3Error').style.color = card3ToDisplay.error < 2 ? '#0ecb81' : card3ToDisplay.error < 5 ? '#ffc107' : '#f6465d';
        }
        if (card3ToDisplay.priceChangeRate !== undefined) {
          const priceChangeText = card3ToDisplay.priceChangeRate >= 0 
            ? `+${card3ToDisplay.priceChangeRate.toFixed(2)}%` 
            : `${card3ToDisplay.priceChangeRate.toFixed(2)}%`;
          const priceChangeColor = card3ToDisplay.priceChangeRate >= 0 ? '#0ecb81' : '#f6465d';
          document.getElementById('card3PriceChange').textContent = priceChangeText;
          document.getElementById('card3PriceChange').style.color = priceChangeColor;
        }
        if (card3ToDisplay.nbValue !== undefined) {
          const decimalPlaces = 10;
          document.getElementById('card3NBValue').textContent = card3ToDisplay.nbValue.toFixed(decimalPlaces);
          document.getElementById('card3NBMax').textContent = card3ToDisplay.nbMax ? card3ToDisplay.nbMax.toFixed(decimalPlaces) : '-';
          document.getElementById('card3NBMin').textContent = card3ToDisplay.nbMin ? card3ToDisplay.nbMin.toFixed(decimalPlaces) : '-';
        }
        // 생산 시점 그래프 복원
        if (card3ToDisplay.data && card3ToDisplay.data.length > 0) {
          createCardChart('card3Chart', card3ToDisplay.data.slice(-30));
        }
        if (card3) {
          document.getElementById('card3').classList.remove('waiting');
          document.getElementById('card3').classList.add('verified');
          const card3Status = document.getElementById('card3Status');
          if (card3Status) {
            card3Status.textContent = '검증 완료';
            card3Status.className = 'card-status verified';
          }
        }
        
        // 검증 결과 표시
        const verificationSection = document.getElementById('card3Verification');
        if (verificationSection) {
          verificationSection.style.display = 'block';
          
          const verificationIcon = document.getElementById('card3VerificationIcon');
          const verificationText = document.getElementById('card3VerificationText');
          const verificationDetails = document.getElementById('card3VerificationDetails');
          const accuracyBadge = document.getElementById('card3AccuracyBadge');
          
          if (card3ToDisplay.isAccurate && card3ToDisplay.isDirectionCorrect) {
            if (verificationIcon) verificationIcon.textContent = '✅';
            if (verificationText) {
              verificationText.textContent = '예측 성공';
              verificationText.className = 'verification-text correct';
            }
            if (verificationDetails) {
              verificationDetails.textContent = 
                `예측: ${card3ToDisplay.predictedPrice.toLocaleString()}원 | 실제: ${card3ToDisplay.actualPrice.toLocaleString()}원\n` +
                `오차: ${card3ToDisplay.error.toFixed(2)}% | 방향: 정확`;
            }
            if (accuracyBadge) {
              accuracyBadge.textContent = '높은 정확도';
              accuracyBadge.className = 'accuracy-badge high';
              accuracyBadge.style.display = 'block';
            }
          } else if (card3ToDisplay.isDirectionCorrect) {
            if (verificationIcon) verificationIcon.textContent = '⚠️';
            if (verificationText) {
              verificationText.textContent = '방향 정확';
              verificationText.className = 'verification-text correct';
            }
            if (verificationDetails) {
              verificationDetails.textContent = 
                `예측: ${card3ToDisplay.predictedPrice.toLocaleString()}원 | 실제: ${card3ToDisplay.actualPrice.toLocaleString()}원\n` +
                `오차: ${card3ToDisplay.error.toFixed(2)}% | 방향: 정확`;
            }
            if (accuracyBadge) {
              accuracyBadge.textContent = '중간 정확도';
              accuracyBadge.className = 'accuracy-badge medium';
              accuracyBadge.style.display = 'block';
            }
          } else {
            if (verificationIcon) verificationIcon.textContent = '❌';
            if (verificationText) {
              verificationText.textContent = '예측 실패';
              verificationText.className = 'verification-text incorrect';
            }
            if (verificationDetails) {
              verificationDetails.textContent = 
                `예측: ${card3ToDisplay.predictedPrice.toLocaleString()}원 | 실제: ${card3ToDisplay.actualPrice.toLocaleString()}원\n` +
                `오차: ${card3ToDisplay.error.toFixed(2)}% | 방향: 오류`;
            }
            if (accuracyBadge) {
              accuracyBadge.textContent = '낮은 정확도';
              accuracyBadge.className = 'accuracy-badge low';
              accuracyBadge.style.display = 'block';
            }
          }
        }
        
        // 카드 3이 검증 완료 상태라면 하단 영역에 등록되어 있는지 확인하고 없으면 추가
        if (card3ToDisplay && card3ToDisplay.predictedPrice && card3ToDisplay.actualPrice && card3ToDisplay.productionTimeframe === currentInterval) {
          const card3Timeframe = card3ToDisplay.productionTimeframe || currentInterval;
          const card3TimeframeName = getTimeframeName(card3Timeframe);
          
          // 하단 영역에 이미 같은 카드가 있는지 확인
          const isDuplicate = verifiedCards.some(existingCard => {
            return existingCard.timeframe === card3Timeframe &&
                   existingCard.predictedPrice === card3ToDisplay.predictedPrice &&
                   existingCard.actualPrice === card3ToDisplay.actualPrice;
          });
          
          if (!isDuplicate) {
            // 하단 영역에 없으면 추가
            const verifiedCard = {
              id: `verified-${Date.now()}`,
              timeframe: card3Timeframe,
              timeframeName: card3TimeframeName,
              predictedPrice: card3ToDisplay.predictedPrice,
              actualPrice: card3ToDisplay.actualPrice,
              error: card3ToDisplay.error || 0,
              errorRate: card3ToDisplay.errorRate || 0,
              isAccurate: card3ToDisplay.isAccurate || false,
              isDirectionCorrect: card3ToDisplay.isDirectionCorrect || false,
              productionDate: card3ToDisplay.productionDate || new Date(),
              productionPrice: card3ToDisplay.productionPrice || card3ToDisplay.actualPrice,
              productionTimeframe: card3Timeframe,
              priceChangeRate: card3ToDisplay.priceChangeRate || 0,
              nbValue: card3ToDisplay.nbValue || null,
              nbMax: card3ToDisplay.nbMax || null,
              nbMin: card3ToDisplay.nbMin || null,
              verifiedTime: new Date().toISOString(),
              data: card3ToDisplay.data || []
            };
            
            verifiedCards.push(verifiedCard);
            console.log('✅ 카드 3 복원 시 하단 영역에 추가:', {
              timeframe: card3TimeframeName,
              predictedPrice: card3ToDisplay.predictedPrice,
              actualPrice: card3ToDisplay.actualPrice
            });
            
            // 최근 10장만 유지
            if (verifiedCards.length > 10) {
              verifiedCards.shift();
            }
            
            // localStorage에 저장
            saveAnalysisData();
            
            // 하단 영역 업데이트
            renderVerifiedCardsLocal('verifiedCardsContainer');
          } else {
            console.log('ℹ️ 카드 3이 이미 하단 영역에 등록되어 있습니다.');
          }
        }
      } else {
        // 현재 분봉에 맞는 검증 완료 카드가 없으면 카드 3 숨기기
        const card3Element = document.getElementById('card3');
        if (card3Element) {
          card3Element.classList.remove('verified');
          card3Element.classList.add('waiting');
        }
        const card3Status = document.getElementById('card3Status');
        if (card3Status) {
          card3Status.textContent = '대기 중';
          card3Status.className = 'card-status waiting';
          card3Status.style.color = '#9aa0a6';
        }
        const verificationSection = document.getElementById('card3Verification');
        if (verificationSection) {
          verificationSection.style.display = 'none';
        }
        console.log(`ℹ️ 현재 분봉(${getTimeframeName(currentInterval)})에 맞는 검증 완료 카드가 없습니다.`);
      }
      
      // 매수 버튼 상태 업데이트
      updateCardBuyButtons();
      
      console.log('✅ 카드 UI 복원 완료');
    }
    
    // 분봉별 카드 히스토리 영역 업데이트
    function updateTimeframeHistory(timeframe = null) {
      const container = document.getElementById('timeframeCardsHistoryContainer');
      if (!container) return;
      
      // 특정 분봉만 업데이트하거나 전체 업데이트
      const timeframesToUpdate = timeframe ? [timeframe] : Object.keys(timeframeCardsArchive);
      
      timeframesToUpdate.forEach(tf => {
        const cards = timeframeCardsArchive[tf];
        if (!cards) return;
        
        let groupEl = document.getElementById(`timeframe-history-${tf}`);
        if (!groupEl) {
          // 새 그룹 생성
          groupEl = document.createElement('div');
          groupEl.id = `timeframe-history-${tf}`;
          groupEl.className = `timeframe-history-group ${tf === currentInterval ? 'active' : ''}`;
          container.appendChild(groupEl);
        } else {
          // 활성 분봉 표시 업데이트
          if (tf === currentInterval) {
            groupEl.classList.add('active');
          } else {
            groupEl.classList.remove('active');
          }
        }
        
        // 헤더
        let headerEl = groupEl.querySelector('.timeframe-history-header');
        if (!headerEl) {
          headerEl = document.createElement('div');
          headerEl.className = 'timeframe-history-header';
          groupEl.appendChild(headerEl);
        }
        headerEl.innerHTML = `<div class="timeframe-history-title">${getTimeframeName(tf)}</div>`;
        
        // 카드 컨테이너
        let cardsEl = groupEl.querySelector('.timeframe-history-cards');
        if (!cardsEl) {
          cardsEl = document.createElement('div');
          cardsEl.className = 'timeframe-history-cards';
          groupEl.appendChild(cardsEl);
        }
        cardsEl.innerHTML = '';
        
        // 카드 1 표시
        if (cards.card1Prediction) {
          const card1El = createHistoryCard('카드 1 (예측)', {
            '예측 가격': cards.card1Prediction.predictedPrice ? cards.card1Prediction.predictedPrice.toLocaleString() + ' 원' : '-',
            'N/B 데이타': cards.card1Prediction.nbValue ? cards.card1Prediction.nbValue.toFixed(4) : '-',
            '신뢰도': cards.card1Prediction.confidence ? (cards.card1Prediction.confidence * 100).toFixed(1) + '%' : '-'
          });
          cardsEl.appendChild(card1El);
        }
        
        // 카드 2 표시
        if (cards.card2Data) {
          const card2El = createHistoryCard('카드 2 (현재)', {
            '현재 가격': cards.card2Data.price ? cards.card2Data.price.toLocaleString() + ' 원' : '-',
            'N/B 데이타': cards.card2Data.nbValue ? cards.card2Data.nbValue.toFixed(4) : '-',
            '생산 시점': cards.card2Data.productionDate ? new Date(cards.card2Data.productionDate).toLocaleString('ko-KR') : '-'
          });
          cardsEl.appendChild(card2El);
        }
        
        // 카드 3 표시
        if (cards.card3Data) {
          const card3El = createHistoryCard('카드 3 (검증)', {
            '예측 가격': cards.card3Data.predictedPrice ? cards.card3Data.predictedPrice.toLocaleString() + ' 원' : '-',
            '실제 가격': cards.card3Data.actualPrice ? cards.card3Data.actualPrice.toLocaleString() + ' 원' : '-',
            '오차율': cards.card3Data.error !== undefined ? cards.card3Data.error.toFixed(2) + '%' : '-',
            'N/B 데이타': cards.card3Data.nbValue ? cards.card3Data.nbValue.toFixed(4) : '-'
          });
          cardsEl.appendChild(card3El);
        }
      });
    }
    
    // 히스토리 카드 생성 헬퍼 함수
    function createHistoryCard(title, data) {
      const cardEl = document.createElement('div');
      cardEl.className = 'timeframe-history-card';
      
      const headerEl = document.createElement('div');
      headerEl.className = 'timeframe-history-card-header';
      headerEl.innerHTML = `<div class="timeframe-history-card-title">${title}</div>`;
      cardEl.appendChild(headerEl);
      
      const contentEl = document.createElement('div');
      contentEl.className = 'timeframe-history-card-content';
      
      Object.entries(data).forEach(([label, value]) => {
        const itemEl = document.createElement('div');
        itemEl.innerHTML = `<div class="card-item-label">${label}</div><div class="card-item-value">${value}</div>`;
        contentEl.appendChild(itemEl);
      });
      
      cardEl.appendChild(contentEl);
      return cardEl;
    }
    
    // 차트 데이터 로드
    async function loadChartData() {
      // 중복 호출 방지
      if (activeRequests.loadChartData) {
        console.warn('⚠️ loadChartData 이미 실행 중, 중복 호출 무시');
        return;
      }
      
      activeRequests.loadChartData = true;
      
      try {
        // 진행 단계: 차트 데이터 로드 시작
        const stageStartTime = performance.now();
        startStage(STAGES.CHART_LOAD, `📊 ${currentInterval} 분봉 데이터 로딩 중...`);
        
        // 분봉이 변경되었는지 확인 (previousInterval 업데이트 전에 체크)
        const isIntervalChanged = previousInterval !== null && previousInterval !== currentInterval;
        if (isIntervalChanged) {
          console.log(`📍 분봉 변경: ${previousInterval} → ${currentInterval}`);
          
          // 이전 분봉의 카드 데이터 저장
          if (previousInterval) {
            saveCurrentTimeframeCards();
            // 히스토리 영역 업데이트
            updateTimeframeHistory(previousInterval);
          }
          
          // 새 분봉의 카드 데이터 복원 또는 초기화
          const restoredCards = getTimeframeCards(currentInterval);
          if (restoredCards.card2 || restoredCards.card1Prediction) {
            // 저장된 데이터가 있으면 복원
            restoreTimeframeCards(currentInterval);
            // UI 복원
            restoreCardsUI();
          } else {
            // 저장된 데이터가 없으면 초기화
            resetCards();
          }
          
          // 히스토리 영역 업데이트
          updateTimeframeHistory(currentInterval);
        }
        previousInterval = currentInterval;
        
        // 분봉 변경 시에는 최신 데이터 1개만 로드 (빠른 전환)
        // 일반 업데이트 시에는 기본 count 로드 (차트 그리기)
        const dataCount = isIntervalChanged ? 1 : getDefaultCountForInterval(currentInterval);
        
        console.log(`📊 ${currentInterval} 분봉 데이터 로드: ${dataCount}개 ${isIntervalChanged ? '(분봉 전환)' : '(일반 업데이트)'}`);
        
        // OHLCV API 사용 (간소화된 재시도)
        async function fetchOhlcvWithRetries(interval, count, attempts = 2) {
          const apiTimeout = CONFIG.TIMEOUTS.API_REQUEST || 60000;
          let lastErr = null;
          
          for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
              const resp = await fetch(`${API_BASE_URL}/ohlcv?market=KRW-BTC&interval=${interval}&count=${count}`, {
                signal: AbortSignal.timeout(apiTimeout)
              });
              if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
              const json = await resp.json();
              return json;
            } catch (err) {
              console.warn(`OHLCV fetch 실패 (attempt ${attempt}/${attempts}) interval=${interval}:`, err.message || err);
              lastErr = err;
              if (attempt < attempts) {
                // 재시도 전 짧은 대기
                await new Promise(r => setTimeout(r, 1000 * attempt));
              }
            }
          }
          throw lastErr;
        }

        const tFetchStart = PERF_ENABLED ? performance.now() : 0;

        // 캐시 재사용: 동일 interval 최근 응답이 MIN_FETCH_COOLDOWN_MS 내이면 재사용
        let data = null;
        const cached = ohlcvCache.get(currentInterval);
        const now = performance.now();
        if (cached && (now - cached.ts) < MIN_FETCH_COOLDOWN_MS && cached.count >= dataCount) {
          data = cached.data;
          const cacheAge = ((now - cached.ts) / 1000).toFixed(2);
          const apiTime = ((now - (apiStart || now)) / 1000).toFixed(2);
          startStage(STAGES.CHART_LOAD, `📦 캐시 사용 (${apiTime}초, 나이: ${cacheAge}초, ${cached.count}개 캔들)`);
          if (PERF_ENABLED) console.log(`OHLCV 캐시 사용 interval=${currentInterval} count=${cached.count}`);
        } else {
          const fetchStart = performance.now();
          startStage(STAGES.CHART_LOAD, `⏳ API 호출 중... (${currentInterval}, ${dataCount}개 캔들)`);
          
          data = await fetchOhlcvWithRetries(currentInterval, dataCount).catch(err => {
            console.error(`❌ OHLCV 데이터 로드 실패 (${currentInterval}):`, err.message || err);
            const fetchTime = ((performance.now() - fetchStart) / 1000).toFixed(2);
            errorStage(STAGES.CHART_LOAD, `❌ API 요청 실패 (${fetchTime}초): ${err.message || err.name}`);
            if (PERF_ENABLED) {
              const dt = performance.now() - tFetchStart;
              console.error(`OHLCV 실패 interval=${currentInterval} count=${dataCount} ${dt.toFixed(1)}ms`, err);
            }
            return null;
          });
          
          if (data) {
            const fetchTime = ((performance.now() - fetchStart) / 1000).toFixed(2);
            const isServerCache = data.cached ? ' (서버 캐시)' : ' (신규)';
            const serverTime = data.response_time_ms ? ` 서버:${(data.response_time_ms/1000).toFixed(2)}초` : '';
            const dataCount = data.data?.length || 0;
            startStage(STAGES.CHART_LOAD, `✅ API 응답 완료 (${fetchTime}초)${isServerCache}${serverTime} → ${dataCount}개 캔들`);
            
            ohlcvCache.set(currentInterval, { ts: performance.now(), data, count: dataCount });
            if (PERF_ENABLED) {
              const dt = performance.now() - tFetchStart;
              console.log(`OHLCV 성공 interval=${currentInterval} count=${dataCount} ${dt.toFixed(1)}ms${isServerCache}${serverTime}`);
            }
          }
        }
        
        if (data && data.ok && data.data && Array.isArray(data.data)) {
          // 분봉 변경 시 (데이터 1개)와 일반 업데이트 시 (데이터 200개) 처리 구분
          if (isIntervalChanged) {
            // 분봉 변경 시: 기존 캐시에 최신 데이터 1개만 추가
            if (!cachedChartData) cachedChartData = [];
            if (cachedChartData.length > 0 && data.data.length > 0) {
              // 기존 데이터의 마지막 항목을 새로운 데이터로 교체
              cachedChartData[cachedChartData.length - 1] = data.data[0];
            } else {
              cachedChartData = data.data;
            }
          } else {
            // 일반 업데이트 시: 전체 데이터 200개 캐시
            cachedChartData = data.data;
          }
          
          const candles = cachedChartData.map(item => ({
            time: Math.floor(new Date(item.time).getTime() / 1000),
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
          }));
          
          safeSeriesSetData(candleSeries, candles, 'candleSeries');
          
          // EMA 계산
          const closes = candles.map(c => c.close);
          const emaFast = ema(closes, 12);
          const emaSlow = ema(closes, 30);
          
          const emaFastData = candles.map((c, i) => ({
            time: c.time,
            value: emaFast[i] || c.close
          }));
          
          const emaSlowData = candles.map((c, i) => ({
            time: c.time,
            value: emaSlow[i] || c.close
          }));
          
          safeSeriesSetData(emaFastSeries, emaFastData, 'emaFastSeries');
          safeSeriesSetData(emaSlowSeries, emaSlowData, 'emaSlowSeries');
          
          // 거래량 데이터
          const volumes = cachedChartData.map(item => ({
            time: Math.floor(new Date(item.time).getTime() / 1000),
            value: parseFloat(item.volume || 0),
            color: parseFloat(item.close) >= parseFloat(item.open) 
              ? 'rgba(14,203,129,0.5)' 
              : 'rgba(246,70,93,0.5)'
          }));
          safeSeriesSetData(volumeSeries, volumes, 'volumeSeries');
          
          // fitContent throttle 적용 (과도한 호출 방지)
          const throttledFitContent = throttle(() => {
            if (chart && chart.timeScale) {
              chart.timeScale().fitContent();
            }
          }, 500);
          
          // 분봉 전환 시 차트 위치 유지 (최신 데이터에 맞춤)
          if (isIntervalChanged) {
            // 분봉 변경 시: fitContent 후 최신 데이터로 스크롤
            console.log(`✅ ${currentInterval} 분봉 전환 완료 (${cachedChartData.length}개 데이터)`);
            throttledFitContent();
            // 최신 데이터(오른쪽 끝)로 스크롤
            setTimeout(() => {
              if (chart && chart.timeScale) {
                try {
                  // LightweightCharts의 scrollToRealTime 사용
                  chart.timeScale().scrollToRealTime();
                } catch (e) {
                  // scrollToRealTime이 없거나 실패하면 마지막 캔들 시간으로 스크롤
                  if (candles.length > 0) {
                    const lastTime = candles[candles.length - 1].time;
                    try {
                      chart.timeScale().scrollToPosition(lastTime, false);
                    } catch (e2) {
                      // scrollToPosition도 실패하면 fitContent만 사용
                      console.warn('차트 스크롤 실패, fitContent만 사용:', e2);
                    }
                  }
                }
              }
            }, 100);
          } else {
            // 일반 업데이트: fitContent throttle 적용
            throttledFitContent();
          }
          
          // 카드 시스템 업데이트
          startStage(STAGES.CARD_CREATE, `🎴 카드 데이터 생성 중...`);
          updateCardSystem(cachedChartData);
          completeStage(STAGES.CARD_CREATE, `✅ 카드 생성 완료`);

          // 페이지를 새로 열었을 때 저장된 lastCandleTime과 동일해
          // updateCardSystem가 아무 것도 하지 않는 경우가 있다.
          // 카드 1 예측값이 비어 있고 카드 2 데이터가 이미 있을 때는
          // 한 번 강제로 예측을 돌려서 UI가 "-"로 남지 않도록 한다.
          if (!card1Prediction && card2Data) {
            try {
              startStage(STAGES.AI_PREDICT, `🔮 AI 예측 계산 중...`);
              await predictCard1(data.data);
              completeStage(STAGES.AI_PREDICT, `✅ AI 예측 완료`);
            } catch (e) {
              console.warn('⚠️ 초기 예측 강제 실행 실패:', e);
              errorStage(STAGES.AI_PREDICT, `❌ AI 예측 실패`);
            }
          }
          
          // 진행 단계: 차트 데이터 로드 완료
          const totalTime = ((performance.now() - stageStartTime) / 1000).toFixed(2);
          completeStage(STAGES.CHART_LOAD, `✅ 완료 (${totalTime}초)`);
          
          // N/B 값 계산
          startStage(STAGES.NB_CALC, '🧮 N/B 값 계산 중...');
          calculateNBValue(data.data);
          completeStage(STAGES.NB_CALC, '✅ N/B 계산 완료');
          
          // AI 예측 로드 (백그라운드 실행, 메인 플로우 차단 안함)
          // 예측 작업 진행을 추적하지만 완료 대기하지 않음
          startStage(STAGES.AI_TRAIN, `🤖 AI 학습 중...`);
          loadAIPrediction(data.data).then(() => {
            completeStage(STAGES.AI_TRAIN, `✅ AI 학습 완료`);
          }).catch(err => {
            console.warn('⚠️ 백그라운드 AI 예측 중 에러:', err);
            errorStage(STAGES.AI_TRAIN, `❌ AI 학습 실패`);
          });
        } else {
          // 데이터 형식 오류
          console.warn('⚠️ 차트 데이터 형식 오류:', data);
          errorStage(STAGES.CHART_LOAD, '데이터 형식 오류 - 재시도 중...');
        }
      } catch (error) {
        // 에러 발생 시 진행 단계 업데이트
        console.error('❌ 차트 데이터 로드 실패:', error);
        errorStage(STAGES.CHART_LOAD, `로드 실패: ${error.message || error.name}`);
        
        // 차트에 기존 데이터가 있으면 그대로 유지
        const currentData = candleSeries.data();
        if (!currentData || currentData.length === 0) {
          // 차트가 완전히 비어있을 때만 에러 표시
          console.error('차트가 비어있습니다. API 서버를 확인하세요.');
        }
        // 다음 업데이트 주기에서 자동으로 재시도됨
      } finally {
        // 플래그 해제
        activeRequests.loadChartData = false;
      }
    }
    
    // 분봉 순환 인덱스
    let timeframeRotationIndex = 0;
    let isTimeframeUpdateRunning = false; // 동시 업데이트 방지 플래그
    let timeframeUpdateTimer = null; // setInterval 대신 setTimeout 사용
    
    // 모든 분봉에서 카드 생산 시작 (분봉 1개씩 순차적으로)
    function startAllTimeframeCardProduction() {
      console.log('🚀 모든 분봉에서 카드 생산 시작 (분봉 1개씩 순차적으로, 60초마다, 동시 호출 방지, setInterval 미사용)');
      
      // 다음 주기 스케줄러 (setInterval 대신 setTimeout 활용)
      const scheduleNextUpdate = () => {
        timeframeUpdateTimer = setTimeout(runTimeframeUpdate, 60000); // 20초 → 60초
      };
      
      // 분봉 업데이트 실행 함수
      const runTimeframeUpdate = async () => {
        // 이미 실행 중이면 스킵하고 다음 주기 예약
        if (isTimeframeUpdateRunning) {
          console.log('⏸️ 이전 분봉 업데이트가 진행 중, 이번 주기 스킵');
          return scheduleNextUpdate();
        }
        
        try {
          isTimeframeUpdateRunning = true;
          
          // 1. 현재 선택된 분봉 우선 업데이트
          if (currentInterval) {
            console.log(`🎯 현재 분봉 업데이트 시작: ${currentInterval}`);
            await updateTimeframeCardSystem(currentInterval);
            console.log(`✅ 현재 분봉 업데이트 완료: ${currentInterval}`);
          }
          
          // 2. 나머지 분봉은 switch로 순환하며 1개씩 업데이트
          const otherTimeframes = timeframes.filter(tf => tf !== currentInterval);
          if (otherTimeframes.length > 0) {
            const idx = timeframeRotationIndex % otherTimeframes.length;
            let timeframeToUpdate = otherTimeframes[idx];
            // switch를 사용해 순서를 명확히 표현
            switch (idx) {
              case 0:
                timeframeToUpdate = otherTimeframes[0];
                break;
              case 1:
                timeframeToUpdate = otherTimeframes[1];
                break;
              case 2:
                timeframeToUpdate = otherTimeframes[2];
                break;
              case 3:
                timeframeToUpdate = otherTimeframes[3];
                break;
              case 4:
                timeframeToUpdate = otherTimeframes[4];
                break;
              case 5:
                timeframeToUpdate = otherTimeframes[5];
                break;
              case 6:
                timeframeToUpdate = otherTimeframes[6];
                break;
              case 7:
                timeframeToUpdate = otherTimeframes[7];
                break;
              default:
                timeframeToUpdate = otherTimeframes[idx];
            }
            console.log(`🔄 다른 분봉 업데이트 시작: ${timeframeToUpdate}`);
            await updateTimeframeCardSystem(timeframeToUpdate);
            timeframeRotationIndex++;
            console.log(`✅ 다른 분봉 업데이트 완료: ${timeframeToUpdate} (${timeframeRotationIndex} / ${otherTimeframes.length})`);
          }
        } catch (error) {
          console.warn(`⚠️ 분봉 업데이트 실패:`, error);
        } finally {
          isTimeframeUpdateRunning = false;
          scheduleNextUpdate(); // 다음 주기 예약
        }
      };
      
      // 첫 실행 즉시 시작
      runTimeframeUpdate();
    }
    
    // 특정 분봉의 카드 시스템 업데이트 (필요한 분봉만 로드)
    async function updateTimeframeCardSystem(timeframe) {
      try {
        console.log(`📊 ${timeframe} 분봉 데이터 로드 시작...`);
        
        // 해당 분봉의 데이터 가져오기 (200개만)
        const response = await fetch(`${API_BASE_URL}/ohlcv?market=KRW-BTC&interval=${timeframe}&count=200`, {
          signal: AbortSignal.timeout(10000)
        });
        
        if (!response.ok) {
          console.warn(`⚠️ ${timeframe} 분봉 데이터 로드 실패: ${response.status}`);
          return;
        }
        
        const data = await response.json();
        if (!data || !data.ok || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
          console.warn(`⚠️ ${timeframe} 분봉 데이터 없음`);
          return;
        }
        
        console.log(`✅ ${timeframe} 분봉 데이터 로드 완료 (${data.data.length}개)`);
        
        // 해당 분봉의 카드 데이터 가져오기
        const cards = getTimeframeCards(timeframe);
        const latest = data.data[data.data.length - 1];
        const latestTime = new Date(latest.time).getTime();
        
        // 새로운 캔들이 생성되었는지 확인
        if (cards.lastCandleTime !== latestTime) {
          const previousCandleTime = cards.lastCandleTime;
          cards.lastCandleTime = latestTime;
          
          // 카드 2가 없으면 초기 생성
          if (!cards.card2) {
            // 카드 2 생성 로직 (백그라운드)
            const currentPrice = parseFloat(latest.close);
            const currentTime = new Date(latest.time);
            
            // EMA 계산
            const closes = data.data.map(d => parseFloat(d.close));
            const emaFast = ema(closes, 12);
            const emaSlow = ema(closes, 30);
            const emaFastValue = emaFast[emaFast.length - 1];
            const emaSlowValue = emaSlow[emaSlow.length - 1];
            
            // N/B 값 계산
            const nbResult = calculateNBValueForCard(data.data);
            
            cards.card2Data = {
              price: currentPrice,
              time: currentTime,
              emaFast: emaFastValue,
              emaSlow: emaSlowValue,
              nbValue: nbResult ? nbResult.nbValue : null,
              nbMax: nbResult ? nbResult.nbMax : null,
              nbMin: nbResult ? nbResult.nbMin : null,
              productionDate: currentTime,
              productionPrice: currentPrice,
              productionTimeframe: timeframe,
              data: data.data
            };
            cards.card2 = true;
            
            console.log(`✅ ${timeframe} 분봉: 카드 2 생성`);
          } else {
            // 새로운 캔들이 나왔을 때
            // 1. 카드 3 생성 (검증)
            if (cards.previousPreviousCard2Data && cards.previousCard2Data && cards.card2Data) {
              // 검증 로직 실행
              const pastCard2PredictedPrice = cards.previousCard2Data.predictedPrice || cards.previousCard2Data.price;
              const currentCardActualPrice = cards.card2Data.price;
              const predictedPrice = pastCard2PredictedPrice;
              const actualPrice = currentCardActualPrice;
              
              const error = Math.abs(actualPrice - predictedPrice) / predictedPrice * 100;
              const isAccurate = error < 2.0;
              
              const pastCard1Price = cards.previousPreviousCard2Data.price;
              const pastCard2Price = cards.previousCard2Data.price;
              const averagePastPrice = (pastCard1Price + pastCard2Price) / 2;
              const isDirectionCorrect = (actualPrice > averagePastPrice && predictedPrice > averagePastPrice) ||
                                        (actualPrice < averagePastPrice && predictedPrice < averagePastPrice);
              
              // 검증 완료 카드 생성
              const timeframeName = getTimeframeName(timeframe);
              const nbResult = calculateNBValueForCard(data.data);
              
              const verifiedCard = {
                id: `verified-${timeframe}-${Date.now()}`,
                timeframe: timeframe,
                timeframeName: timeframeName,
                predictedPrice: predictedPrice,
                actualPrice: actualPrice,
                error: error,
                errorRate: ((actualPrice - predictedPrice) / predictedPrice * 100),
                isAccurate: isAccurate,
                isDirectionCorrect: isDirectionCorrect,
                productionDate: cards.card2Data.productionDate || new Date(),
                productionPrice: cards.card2Data.productionPrice || actualPrice,
                productionTimeframe: timeframe,
                priceChangeRate: cards.card2Data.productionPrice ? ((actualPrice - cards.card2Data.productionPrice) / cards.card2Data.productionPrice) * 100 : 0,
                nbValue: nbResult ? nbResult.nbValue : null,
                nbMax: nbResult ? nbResult.nbMax : null,
                nbMin: nbResult ? nbResult.nbMin : null,
                verifiedTime: new Date().toISOString(),
                data: data.data
              };
              
              // 중복 체크
              const isDuplicate = verifiedCards.some(existingCard => {
                return existingCard.timeframe === verifiedCard.timeframe &&
                       existingCard.predictedPrice === verifiedCard.predictedPrice &&
                       existingCard.actualPrice === verifiedCard.actualPrice;
              });
              
              if (!isDuplicate) {
                verifiedCards.push(verifiedCard);
                // console.log 제거로 성능 개선
                // console.log(`✅ ${timeframe} 분봉: 검증 완료 카드 생성 및 하단 영역에 추가`);
                
                // 최근 10장만 유지
                if (verifiedCards.length > 10) {
                  verifiedCards.shift();
                }
                
                // localStorage에 저장 (디바운싱 적용)
                saveAnalysisData();
                
                // 하단 영역 업데이트 (렌더링은 최소화)
                renderVerifiedCardsLocal('verifiedCardsContainer');
              } else {
                console.log(`⚠️ ${timeframe} 분봉: 중복 검증 카드 (추가하지 않음)`);
              }
              
              // 카드 3 데이터 저장
              cards.card3Data = {
                actualPrice: actualPrice,
                predictedPrice: predictedPrice,
                time: new Date(latest.time),
                error: error,
                isAccurate: isAccurate,
                isDirectionCorrect: isDirectionCorrect,
                nbValue: nbResult ? nbResult.nbValue : null,
                nbMax: nbResult ? nbResult.nbMax : null,
                nbMin: nbResult ? nbResult.nbMin : null,
                productionDate: cards.card2Data.productionDate,
                productionPrice: cards.card2Data.productionPrice,
                productionTimeframe: timeframe,
                priceChangeRate: verifiedCard.priceChangeRate,
                data: data.data
              };
              cards.card3 = true;
            }
            
            // 2. 과거 카드 데이터 저장 (검증용)
            if (cards.previousCard2Data) {
              cards.previousPreviousCard2Data = JSON.parse(JSON.stringify(cards.previousCard2Data));
            }
            if (cards.card2Data) {
              cards.previousCard2Data = JSON.parse(JSON.stringify(cards.card2Data));
            }
            
            // 3. 카드 2 업데이트
            const currentPrice = parseFloat(latest.close);
            const currentTime = new Date(latest.time);
            const closes = data.data.map(d => parseFloat(d.close));
            const emaFast = ema(closes, 12);
            const emaSlow = ema(closes, 30);
            const emaFastValue = emaFast[emaFast.length - 1];
            const emaSlowValue = emaSlow[emaSlow.length - 1];
            const nbResult = calculateNBValueForCard(data.data);
            
            cards.card2Data = {
              price: currentPrice,
              time: currentTime,
              emaFast: emaFastValue,
              emaSlow: emaSlowValue,
              nbValue: nbResult ? nbResult.nbValue : null,
              nbMax: nbResult ? nbResult.nbMax : null,
              nbMin: nbResult ? nbResult.nbMin : null,
              productionDate: cards.card2Data ? cards.card2Data.productionDate : currentTime,
              productionPrice: cards.card2Data ? cards.card2Data.productionPrice : currentPrice,
              productionTimeframe: timeframe,
              data: data.data
            };
            
            console.log(`✅ ${timeframe} 분봉: 카드 시스템 업데이트 완료`);
          }
          
          // 현재 분봉의 카드 데이터 저장
          if (timeframe === currentInterval) {
            saveCurrentTimeframeCards();
          }
        }
      } catch (error) {
        // 조용히 실패
      }
    }
    
    // 카드 시스템 업데이트
    function updateCardSystem(data) {
      if (!data || data.length === 0) return;
      
      const latest = data[data.length - 1];
      const latestTime = new Date(latest.time).getTime();
      
      // 새로운 캔들이 생성되었는지 확인
      if (lastCandleTime !== latestTime) {
        const previousCandleTime = lastCandleTime;
        lastCandleTime = latestTime;
        
        // 카드 2가 없으면 초기 생성 (현재 카드)
        if (!card2) {
          createCard2(latest, data);
          // 카드 2 생성 후 카드 1 예측 (다음 카드)
          predictCard1(data);
        } else {
          // 새로운 캔들이 나왔을 때:
          // 1. 카드 3 생성 (과거 카드 2장 + 현재 카드로 검증)
          // 과거 카드 2장(previousPreviousCard2Data, previousCard2Data)과 현재 카드(card2Data)가 모두 있어야 검증 가능
          console.log('🔄 새로운 캔들 생성 - 검증 조건 확인:', {
            hasPreviousPrevious: !!previousPreviousCard2Data,
            hasPrevious: !!previousCard2Data,
            hasCurrent: !!card2Data,
            canVerify: !!(previousPreviousCard2Data && previousCard2Data && card2Data)
          });
          
          if (previousPreviousCard2Data && previousCard2Data && card2Data) {
            console.log('✅ 검증 조건 만족 - 카드 3 생성 시작');
            createCard3(latest, data);
          } else {
            console.log('⚠️ 검증 조건 불만족 - 카드 3 생성 불가:', {
              missing: [
                !previousPreviousCard2Data && 'previousPreviousCard2Data',
                !previousCard2Data && 'previousCard2Data',
                !card2Data && 'card2Data'
              ].filter(Boolean)
            });
          }
          
          // 2. 과거 카드 데이터 저장 (검증용)
          // 이전 이전 카드 2 데이터를 이전 이전으로 이동
          if (previousCard2Data) {
            previousPreviousCard2Data = JSON.parse(JSON.stringify(previousCard2Data)); // 깊은 복사
          }
          // 이전 카드 2 데이터를 이전으로 이동
          if (card2Data) {
            previousCard2Data = JSON.parse(JSON.stringify(card2Data)); // 깊은 복사
          }
          
          // 3. 카드 2 업데이트 (이전 카드 1의 예측이 실제로 나타남)
          if (card1 && card1Prediction) {
            createCard2FromPrediction(latest, data);
          } else {
            // 카드 1 예측이 없으면 현재 상태로 카드 2 생성
            createCard2(latest, data);
          }
          
          // 4. 카드 1 예측 (다음 카드 예측) - 대기 상태
          predictCard1(data);
        }
        
        // 현재 분봉의 카드 데이터 저장 (자동 저장)
        saveCurrentTimeframeCards();
        // 히스토리 영역 업데이트
        updateTimeframeHistory(currentInterval);
        
        // localStorage에 저장
        saveAnalysisData();
      }
    }
    
    // 카드 2 생성 (현재 카드)
    async function createCard2(currentData, allData) {
      const currentPrice = parseFloat(currentData.close);
      const currentTime = new Date(currentData.time);
      
      // EMA 계산
      const closes = allData.map(d => parseFloat(d.close));
      const emaFast = ema(closes, 12);
      const emaSlow = ema(closes, 30);
      const emaFastValue = emaFast[emaFast.length - 1];
      const emaSlowValue = emaSlow[emaSlow.length - 1];
      
      // N/B 값 계산 (중복 체크를 위해 먼저)
      const nbResult = calculateNBValueForCard(allData);
      
      // 이미 동일한 N/B 값으로 card2가 생성되었는지 확인
      if (card2Data && nbResult) {
        const existingNbValue = card2Data.nbValue;
        const newNbValue = nbResult.nbValue;
        
        if (existingNbValue !== null && existingNbValue !== undefined &&
            newNbValue !== null && newNbValue !== undefined) {
          const isSameNB = Math.abs(existingNbValue - newNbValue) < 0.00000001;
          
          if (isSameNB) {
            console.log(`⏭️ card2 생성 스킵: 동일한 N/B 값 (${newNbValue.toFixed(8)})`);
            return;
          }
        }
      }
      
      // 카드 2 데이터 저장 (현재 카드)
      card2Data = {
        price: currentPrice,
        time: currentTime,
        emaFast: emaFastValue,
        emaSlow: emaSlowValue,
        data: allData,
        chartData: allData.slice(-30),
        nbValue: nbResult ? nbResult.nbValue : null,
        nbMax: nbResult ? nbResult.nbMax : null,
        nbMin: nbResult ? nbResult.nbMin : null
      };
      
      // 분봉 이름 변환 함수
      const timeframeName = getTimeframeName(currentInterval);
      
      // 생산 날짜 저장
      const productionDate = new Date();
      card2Data.productionDate = productionDate;
      card2Data.productionPrice = currentPrice;
      card2Data.productionTimeframe = currentInterval;
      
      // 카드 2 UI 업데이트 (현재 카드)
      document.getElementById('card2Timeframe').textContent = timeframeName;
      document.getElementById('card2Price').textContent = currentPrice.toLocaleString() + ' 원';
      document.getElementById('card2ProductionDate').textContent = productionDate.toLocaleString('ko-KR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      document.getElementById('card2ProductionPrice').textContent = currentPrice.toLocaleString() + ' 원';
      document.getElementById('card2ProductionTimeframe').textContent = timeframeName;
      document.getElementById('card2EmaFast').textContent = emaFastValue.toLocaleString() + ' 원';
      document.getElementById('card2EmaSlow').textContent = emaSlowValue.toLocaleString() + ' 원';
      
      // 생산 시점 그래프 생성
      createCardChart('card2Chart', allData.slice(-30)); // 최근 30개 캔들만 표시
      
      // 카드 2 N/B 값 표시
      if (nbResult) {
        const decimalPlaces = 10;
        document.getElementById('card2NBValue').textContent = nbResult.nbValue.toFixed(decimalPlaces);
        document.getElementById('card2NBMax').textContent = nbResult.nbMax.toFixed(decimalPlaces);
        document.getElementById('card2NBMin').textContent = nbResult.nbMin.toFixed(decimalPlaces);
      } else {
        document.getElementById('card2NBValue').textContent = '-';
        document.getElementById('card2NBMax').textContent = '-';
        document.getElementById('card2NBMin').textContent = '-';
      }
      
      // 카드 2 데이터에 N/B 값 저장
      if (nbResult) {
        card2Data.nbValue = nbResult.nbValue;
        card2Data.nbMax = nbResult.nbMax;
        card2Data.nbMin = nbResult.nbMin;
        // 백엔드가 snake_case만 읽으므로 저장 시에는 nb_max/nb_min 필드도 함께 포함
        card2Data.nb_max = nbResult.nbMax;
        card2Data.nb_min = nbResult.nbMin;
        card2Data.nb_value = nbResult.nbValue;
      }
      
      // 구역 판단 (실제 구역)
      const actualZone = determineZone(nbResult ? nbResult.nbValue : null, card2Data.previousZone);
      card2Data.actualZone = actualZone;
      card2Data.previousZone = actualZone; // 다음 판단을 위해 저장
      
      // 예측 구역 (카드 1 예측이 있으면 사용)
      const predictedZone = card1Prediction && card1Prediction.predictedZone ? 
        card1Prediction.predictedZone : null;
      card2Data.predictedZone = predictedZone;
      
      // 카드 2 UI에 구역 표시
      const predictedZoneRow = document.getElementById('card2PredictedZoneRow');
      const predictedZoneEl = document.getElementById('card2PredictedZone');
      const actualZoneEl = document.getElementById('card2ActualZone');

      // 카드 2에서는 예측 구역을 표시하지 않음
      if (predictedZoneRow) predictedZoneRow.style.display = 'none';
      if (predictedZoneEl) {
        predictedZoneEl.textContent = '-';
        predictedZoneEl.style.color = '#9aa0a6';
      }
      
      if (actualZoneEl) {
        actualZoneEl.textContent = getZoneName(actualZone);
        actualZoneEl.style.color = getZoneColor(actualZone);
      }
      
      // 카드 2를 N/B database에 저장 (await로 완료 대기)
      const saveResult = await saveCardToDatabase('card2', {
        price: currentPrice,
        time: currentTime.toISOString(),
        emaFast: emaFastValue,
        emaSlow: emaSlowValue,
        nb_value: nbResult ? nbResult.nbValue : null,
        nb_max: nbResult ? nbResult.nbMax : null,
        nb_min: nbResult ? nbResult.nbMin : null,
        productionDate: productionDate.toISOString(),
        productionPrice: currentPrice,
        productionTimeframe: currentInterval,
        prices: closes.slice(-50), // 최근 50개 가격만 저장
        chartData: getCachedChartSlice(30) // 좌측 차트 캐시 사용
      });
      
      if (saveResult && saveResult.card_id) {
        if (card2Data) card2Data.savedCardId = saveResult.card_id;
        console.log('✅ 카드2 저장 완료, card_id:', saveResult.card_id);
      }
      
      card2 = true;
      
      // 카드 2 상태 업데이트
      const card2El = document.getElementById('card2');
      if (card2El) {
        card2El.classList.remove('waiting');
        card2El.classList.add('active');
      }
      
      // localStorage에 저장
      saveAnalysisData();
    }
    
    // 카드 1 AI 예측 실패 처리 (모듈화된 헬퍼를 사용)
    import { handleCard1AIPredictionFailure } from './modules/prediction-fallback.js';

    // 카드 1 가격 예측 (AI 모델 사용) - 다음 카드 예측
    async function predictCard1WithAI(currentPrice, emaFast, emaSlow, allData, nbResult = null) {
      try {
        setCard1Status('AI 예측 중', '#ffc107');

        const mlResult = await predictWithML({
          currentPrice,
          allData,
          nbResult,
          // NB-only 모드: 가격을 보내지 않고 nbMax/nbMin 만 전송하여 예측
          sendNbOnly: true
        });

        if (!mlResult || !Number.isFinite(mlResult.predictedPrice)) {
          throw new Error('유효한 AI 예측 결과가 없습니다.');
        }

        // 모델 상태 플래그 업데이트
        globalModelTrained = true;

        const predictedZone = mlResult.predictedZone || determineZone(nbResult ? nbResult.nbValue : null, null);
        const confidence = mlResult.confidence ?? 0.7;
        const nbForDisplay = {
          nbValue: mlResult.nbValue ?? (nbResult ? nbResult.nbValue : null),
          nbMax: mlResult.nbMax ?? (nbResult ? nbResult.nbMax : null),
          nbMin: mlResult.nbMin ?? (nbResult ? nbResult.nbMin : null)
        };

        card1Prediction = {
          predictedPrice: mlResult.predictedPrice,
          predictedChangeRate: mlResult.predictedChangeRate,
          confidence: confidence,
          nbValue: nbForDisplay.nbValue,
          nbMax: nbForDisplay.nbMax,
          nbMin: nbForDisplay.nbMin,
          predictedZone: predictedZone,
          isAIPrediction: mlResult.isAIPrediction !== false,
          modelType: mlResult.modelType || getSelectedModelType(),
          trainR2: mlResult.trainR2 ?? null,
          valR2: mlResult.valR2 ?? null
        };

        updateCard1UI(card1Prediction.predictedPrice, nbForDisplay, confidence, true, predictedZone);

        await saveCardToDatabase('card1', {
          predictedPrice: card1Prediction.predictedPrice,
          predictedChangeRate: card1Prediction.predictedChangeRate,
          confidence: card1Prediction.confidence,
          nb_value: card1Prediction.nbValue,
          nb_max: card1Prediction.nbMax,
          nb_min: card1Prediction.nbMin,
          predictedZone: card1Prediction.predictedZone,
          modelType: card1Prediction.modelType,
          trainR2: card1Prediction.trainR2,
          valR2: card1Prediction.valR2,
          time: new Date().toISOString(),
          chartData: getCachedChartSlice(30)
        });

        const card1El = document.getElementById('card1');
        if (card1El) {
          card1El.classList.remove('waiting');
          card1El.classList.add('active');
        }

        saveAnalysisData();

        console.log('✅ 카드 1 AI 예측 완료 (모듈):', {
          price: card1Prediction.predictedPrice,
          changeRate: card1Prediction.predictedChangeRate,
          confidence: (card1Prediction.confidence * 100).toFixed(1) + '%',
          modelType: card1Prediction.modelType
        });

        return;
      } catch (error) {
        handleCard1AIPredictionFailure(error);
      }
      
      // AI 예측 실패 시 기본 예측 로직 사용 (fallback)
      predictCard1Basic(currentPrice, emaFast, emaSlow, allData, nbResult);
    }
    
    // 카드 1 가격 예측 (기본 통계 기반 - fallback)
    function predictCard1Basic(currentPrice, emaFast, emaSlow, allData, nbResult = null) {
      // 예측 로직
      const recentPrices = allData.slice(-20).map(d => parseFloat(d.close));
      const priceChanges = [];
      for (let i = 1; i < recentPrices.length; i++) {
        priceChanges.push((recentPrices[i] - recentPrices[i-1]) / recentPrices[i-1]);
      }
      
      // 평균 변동률 계산
      const avgChangeRate = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
      
      // N/B 값 기반 예측 조정
      let nbAdjustment = 0;
      if (nbResult && nbResult.nbValue !== null) {
        // N/B 값이 0.5보다 크면 상승 추세, 작으면 하락 추세
        // N/B 값이 0.5에서 멀어질수록 더 강한 조정
        nbAdjustment = (nbResult.nbValue - 0.5) * 0.02; // 최대 ±1% 조정
      }
      
      // EMA 추세 기반 예측
      let predictedChangeRate = 0;
      if (emaFast > emaSlow) {
        // 상승 추세
        predictedChangeRate = avgChangeRate * 1.2 + nbAdjustment; // 추세 가속 + N/B 조정
      } else {
        // 하락 추세
        predictedChangeRate = avgChangeRate * 1.2 + nbAdjustment; // 추세 가속 + N/B 조정
      }
      
      // 변동성 조정
      const volatility = Math.sqrt(
        priceChanges.reduce((sum, change) => sum + Math.pow(change - avgChangeRate, 2), 0) / priceChanges.length
      );
      predictedChangeRate = Math.max(-0.05, Math.min(0.05, predictedChangeRate)); // ±5% 제한
      
      // 예측 가격 계산
      const predictedPrice = currentPrice * (1 + predictedChangeRate);
      
      // 신뢰도 계산
      const confidence = Math.min(1.0, Math.max(0.3, 1 - volatility * 10));
      
      // 구역 예측 (N/B 값 기반)
      const predictedZone = determineZone(nbResult ? nbResult.nbValue : null, null);
      
      // 예측 데이터 저장 (N/B 값 및 구역 포함)
      card1Prediction = {
        predictedPrice: predictedPrice,
        predictedChangeRate: predictedChangeRate * 100,
        confidence: confidence,
        nbValue: nbResult ? nbResult.nbValue : null,
        nbMax: nbResult ? nbResult.nbMax : null,
        nbMin: nbResult ? nbResult.nbMin : null,
        predictedZone: predictedZone, // 구역 예측 추가
        isAIPrediction: false // 기본 예측임을 표시
      };
      
      // 카드 1 UI 업데이트 (예측만 표시)
      updateCard1UI(predictedPrice, nbResult, confidence, false, predictedZone);
      
      // NBVerse 저장 (기본 예측 카드)
      saveCardToDatabase('card1', {
        predictedPrice: predictedPrice,
        predictedChangeRate: predictedChangeRate * 100,
        confidence: confidence,
        nbValue: nbResult ? nbResult.nbValue : null,
        nbMax: nbResult ? nbResult.nbMax : null,
        nbMin: nbResult ? nbResult.nbMin : null,
        predictedZone: predictedZone,
        time: new Date().toISOString(),
        chartData: getCachedChartSlice(30)
      });
      
      // 카드 1 상태 업데이트
      document.getElementById('card1').classList.remove('waiting');
      document.getElementById('card1').classList.add('active');
      
      // localStorage에 저장
      saveAnalysisData();
    }
    
    // 카드 1 UI 업데이트 함수 (다음 카드 예측)
    function updateCard1UI(predictedPrice, nbResult, confidence = null, isAIPrediction = false, predictedZone = null) {
      if (!card2Data) return;
      
      const timeframeEl = document.getElementById('card1Timeframe');
      const priceEl = document.getElementById('card1PredictedPrice');
      const confidenceEl = document.getElementById('card1Confidence');
      const card1StatusEl = document.getElementById('card1Status');
      const card1BadgeEl = document.getElementById('card1TypeBadge');
      
      if (timeframeEl) {
        timeframeEl.textContent = getTimeframeName(currentInterval);
      }
      
      if (priceEl) {
        priceEl.textContent = predictedPrice.toLocaleString() + ' 원';
        // AI 예측인 경우 색상 강조
        if (isAIPrediction) {
          priceEl.style.color = '#0ecb81';
          priceEl.style.fontWeight = 'bold';
        } else {
          priceEl.style.color = '#e6eefc';
          priceEl.style.fontWeight = 'normal';
        }
      }
      
      // 신뢰도 표시
      if (confidenceEl) {
        if (confidence !== null) {
          const confidencePercent = (confidence * 100).toFixed(1);
          confidenceEl.textContent = `신뢰도: ${confidencePercent}% ${isAIPrediction ? '(AI 예측)' : ''}`;
          confidenceEl.style.color = confidence >= 0.7 ? '#0ecb81' : confidence >= 0.5 ? '#ffc107' : '#f6465d';
        } else {
          confidenceEl.textContent = '신뢰도: -';
          confidenceEl.style.color = '#9aa0a6';
        }
      }
      
      // 카드 상태 표시
      if (card1StatusEl) {
        if (isAIPrediction) {
          card1StatusEl.textContent = 'AI 예측';
          card1StatusEl.className = 'card-status current';
          card1StatusEl.style.color = '#0ecb81';
        } else {
          card1StatusEl.textContent = '기본 예측';
          card1StatusEl.className = 'card-status predicted';
        }
      }

      // 배지 표시 (AI/기본)
      if (card1BadgeEl) {
        if (isAIPrediction) {
          card1BadgeEl.textContent = 'AI';
          card1BadgeEl.style.display = 'inline-block';
          card1BadgeEl.style.backgroundColor = '#0ecb81';
          card1BadgeEl.style.color = '#0b1220';
          card1BadgeEl.style.padding = '2px 8px';
          card1BadgeEl.style.borderRadius = '4px';
          card1BadgeEl.style.fontSize = '11px';
          card1BadgeEl.style.marginLeft = '8px';
        } else {
          card1BadgeEl.textContent = '기본';
          card1BadgeEl.style.display = 'inline-block';
          card1BadgeEl.style.backgroundColor = '#ffc107';
          card1BadgeEl.style.color = '#0b1220';
          card1BadgeEl.style.padding = '2px 8px';
          card1BadgeEl.style.borderRadius = '4px';
          card1BadgeEl.style.fontSize = '11px';
          card1BadgeEl.style.marginLeft = '8px';
        }
      }
      
      if (nbResult && nbResult.nbValue !== null) {
        const decimalPlaces = 10;
        const nbValueEl = document.getElementById('card1NBValue');
        const nbMaxEl = document.getElementById('card1NBMax');
        const nbMinEl = document.getElementById('card1NBMin');
        
        if (nbValueEl) nbValueEl.textContent = nbResult.nbValue.toFixed(decimalPlaces);
        if (nbMaxEl) nbMaxEl.textContent = nbResult.nbMax.toFixed(decimalPlaces);
        if (nbMinEl) nbMinEl.textContent = nbResult.nbMin.toFixed(decimalPlaces);
      } else {
        const nbValueEl = document.getElementById('card1NBValue');
        const nbMaxEl = document.getElementById('card1NBMax');
        const nbMinEl = document.getElementById('card1NBMin');
        
        if (nbValueEl) nbValueEl.textContent = '-';
        if (nbMaxEl) nbMaxEl.textContent = '-';
        if (nbMinEl) nbMinEl.textContent = '-';
      }
      
      // 구역 예측 표시
      const zoneEl = document.getElementById('card1PredictedZone');
      if (zoneEl) {
        // nbResult로부터 구역 계산(없으면 전달된 predictedZone 사용)
        const zoneToUse = predictedZone || determineZone(nbResult ? nbResult.nbValue : null, null);
        if (zoneToUse) {
          zoneEl.textContent = getZoneName(zoneToUse);
          zoneEl.style.color = getZoneColor(zoneToUse);
        } else {
          zoneEl.textContent = '-';
          zoneEl.style.color = '#9aa0a6';
        }
      }
    }

    // 카드 1 상태를 간단히 업데이트하는 헬퍼
    function setCard1Status(text, color = '#9aa0a6') {
      const card1StatusEl = document.getElementById('card1Status');
      if (card1StatusEl) {
        card1StatusEl.textContent = text;
        card1StatusEl.style.color = color;
      }
      const card1BadgeEl = document.getElementById('card1TypeBadge');
      if (card1BadgeEl) {
        card1BadgeEl.style.display = 'none';
      }
    }
    
    // AI 예측 상태 UI 업데이트 (모듈 헬퍼 사용)
    function updateAIPredictionStatus(status, data = null) {
      updateAIPredictionStatusUI(status, data, aiStatus, {
        calculateTrainingLevelFn: calculateTrainingLevel,
        calculateTrainingSegmentFn: calculateTrainingSegment,
        onAfterDataUpdate: updateAILearningStatusDisplay
      });
    }
    
    // AI 예측 API 호출 및 차트 표시
    async function loadAIPrediction(allData) {
      // AI 학습 기능 재활성화
      
      if (!predictionSeries || !allData || allData.length === 0) {
        updateAIPredictionStatus('error', { error: '차트 데이터 없음' });
        return;
      }
      
      // 모델이 없으면 즉시 자동 학습 시작 (중복 방지)
      if (!globalModelTrained && !isTrainingInProgress && allData && allData.length > 0) {
        console.log('🔄 모델이 없음. 자동 학습 시작...');
        startStage(STAGES.AI_TRAIN, '모델 자동 학습 중...');
        updateAIPredictionStatus('loading', { message: '모델 자동 학습 중...' });
        trainAIModelAuto(allData).catch(err => {
          console.warn('⚠️ 자동 학습 실패:', err);
          errorStage(STAGES.AI_TRAIN, `학습 실패: ${err.message}`);
        });
        return; // 학습 중이면 예측은 나중에
      }
      
      // 학습 중이면 예측 시도하지 않음
      if (isTrainingInProgress) {
        return;
      }
      
      // 진행 단계: AI 예측 시작
      startStage(STAGES.AI_PREDICT, 'AI 예측 진행 중...');
      updateAIPredictionStatus('loading');
      
      try {
        // 이미 가져온 차트 데이터를 POST로 전달하여 API에서 pyupbit 재호출 방지
        // 데이터 형식 변환 (API가 기대하는 형식으로)
        const ohlcvData = allData.map(item => ({
          time: item.time,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume || 0)
        }));
        
        // 선택된 모델 타입 가져오기 (ML 모델만)
        const modelTypeSelect = document.getElementById('aiModelTypeSelect');
        const selectedModelType = modelTypeSelect ? modelTypeSelect.value : 'RandomForest';

        // 예측에 사용할 기준 가격 준비 (폴백용)
        const fallbackCurrentPrice = (allData && allData.length > 0) ? parseFloat(allData[allData.length - 1].close) : (STATE.currentPrice || 0);
        
        // 서버는 최근 200개 데이터가 필요함. 부족하면 한 번 추가로 200개를 받아오고, 그래도 부족하면 기본 예측으로 폴백.
        if (!ohlcvData || ohlcvData.length < 200) {
          try {
            const fresh = await getChartData('KRW-BTC', currentInterval, 200);
            if (fresh && fresh.data && Array.isArray(fresh.data) && fresh.data.length >= 200) {
              ohlcvData = fresh.data.slice(-200).map(item => ({
                time: item.time,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
                volume: parseFloat(item.volume || 0)
              }));
              console.log(`✅ AI 예측용 200개 데이터 확보 (${ohlcvData.length}개)`);
            }
          } catch (fetchErr) {
            console.warn('⚠️ AI 예측용 추가 데이터 확보 실패:', fetchErr);
          }

          if (!ohlcvData || ohlcvData.length < 200) {
            console.warn('예측을 위한 OHLCV 데이터가 부족합니다 (필요:200):', ohlcvData ? ohlcvData.length : 0);
            updateAIPredictionStatus('fallback', { message: '데이터 부족으로 기본 예측 사용' });
            try {
              const basicResult = predictBasic({ currentPrice: fallbackCurrentPrice, emaFast: null, emaSlow: null, allData: allData, nbResult: null });
              if (basicResult) {
                updateAIPredictionStatus('ready', { result: basicResult });
              }
            } catch (e) {
              console.error('기본 예측 실패:', e);
              updateAIPredictionStatus('error', { error: '예측 실패' });
            }
            return;
          }
        }

        const response = await fetch(`${API_BASE_URL}/ai/predict`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            ohlcv_data: ohlcvData.slice(-200), // 최근 200개만 사용
            market: 'KRW-BTC',
            interval: currentInterval,
            count: 200,
            n: 10,
            model_type: selectedModelType,
            train: false  // 예측만 수행
          }),
          signal: AbortSignal.timeout(60000) // 60초 타임아웃 (모델 학습 시간 고려)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          
          // 410 에러는 AI 학습 기능이 제거된 경우 - 조용히 처리
          if (response.status === 410) {
            updateAIPredictionStatus('disabled', { 
              error: 'AI 학습 기능이 제거되었습니다.' 
            });
            return;
          }
          
          // 500 에러는 Darts 라이브러리 문제일 수 있음
          if (response.status === 500) {
            console.warn('⚠️ AI 예측 API 오류:', response.status, errorText);
            try {
              const errorData = JSON.parse(errorText);
              if (errorData.error && (
                errorData.error.includes('Darts') || 
                errorData.error.includes('라이브러리') ||
                errorData.error.includes('초기화')
              )) {
                updateAIPredictionStatus('error', { 
                  error: 'Darts 라이브러리가 필요합니다. 서버에 설치해주세요: pip install darts' 
                });
                return;
              }
            } catch (e) {
              // JSON 파싱 실패 시 일반 에러 처리
            }
          }
          
          // 404 에러는 API 경로 오류
          if (response.status === 404) {
            updateAIPredictionStatus('error', { error: 'API 경로 오류 (404)' });
            return;
          }
          
          updateAIPredictionStatus('error', { error: `HTTP ${response.status}` });
          return;
        }
        
        const result = await response.json();
        
        if (!result.success) {
          console.warn('⚠️ AI 예측 실패:', result.error);
          errorStage(STAGES.AI_PREDICT, `예측 실패: ${result.error}`);
          
          // Darts 라이브러리 없음 에러는 자동 학습 불가
          const isDartsError = result.error && (
            result.error.includes('Darts') || 
            result.error.includes('라이브러리') ||
            result.error.includes('설치')
          );
          
          if (isDartsError) {
            updateAIPredictionStatus('error', { 
              error: 'Darts 라이브러리가 필요합니다. 서버에 설치해주세요: pip install darts' 
            });
            return;
          }
          
          // 모델이 없거나 학습되지 않은 경우 자동 학습 시도
          const needsTraining = result.error && (
            result.error.includes('학습') || 
            result.error.includes('모델') || 
            result.error.includes('초기화') ||
            result.error.includes('trained') ||
            result.error.includes('not trained')
          );
          
          if (needsTraining || !result.model_trained) {
            // AI 학습 기능 제거됨
            console.log('⚠️ AI 학습 기능이 제거되었습니다.');
            updateAIPredictionStatus('error', { error: 'AI 학습 기능이 제거되었습니다.' });
            return;
          } else {
            // 다른 에러는 표시
            updateAIPredictionStatus('error', { error: result.error || '예측 실패' });
            return;
          }
        }
        
        if (!result.predicted_prices || result.predicted_prices.length === 0) {
          errorStage(STAGES.AI_PREDICT, '예측 데이터 없음');
          updateAIPredictionStatus('error', { error: '예측 데이터 없음' });
          return;
        }

        // 예측 결과에 null/NaN 등이 포함되면 LightweightCharts가 "Value is null"을 던지므로, 안전한 값만 사용
        const sanitizedPredictedPrices = (result.predicted_prices || [])
          .map((price, index) => {
            const numericPrice = Number(price);
            if (!Number.isFinite(numericPrice)) {
              console.warn('⚠️ 예측 결과에 유효하지 않은 값이 있어 건너뜀:', { index, price });
              return null;
            }
            return numericPrice;
          })
          .filter(price => price !== null);

        if (sanitizedPredictedPrices.length === 0) {
          updateAIPredictionStatus('error', { error: '예측 데이터 형식 오류' });
          return;
        }
        
        // 예측 데이터 준비
        // 차트에 표시된 실제 마지막 캔들 데이터 사용 (정확한 시간 보장)
        const chartCandles = candleSeries.data();
        let lastCandle, currentTime, currentPrice;
        
        if (chartCandles && chartCandles.length > 0) {
          // 차트의 마지막 캔들 사용 (가장 정확함)
          const lastChartCandle = chartCandles[chartCandles.length - 1];
          currentTime = lastChartCandle.time;
          currentPrice = lastChartCandle.close;
        } else {
          // 차트 데이터가 없으면 allData 사용
          lastCandle = allData[allData.length - 1];
          currentTime = Math.floor(new Date(lastCandle.time).getTime() / 1000);
          currentPrice = parseFloat(lastCandle.close);
        }

        // 기준 시각/가격이 유효하지 않으면 차트 업데이트를 중단 (경험상 여기서 null이면 lightweight-charts가 즉시 오류를 던짐)
        const baseTime = Number(currentTime);
        const basePrice = Number(currentPrice);
        if (!Number.isFinite(baseTime) || !Number.isFinite(basePrice)) {
          console.warn('⚠️ 예측 데이터에 사용할 기준 시각/가격이 유효하지 않아 건너뜀:', { currentTime, currentPrice });
          updateAIPredictionStatus('error', { error: '예측 기준 시각/가격 오류' });
          return;
        }
        
        // 예측 가격 데이터 생성
        const predictionData = [];
        
        // 현재 가격부터 시작 (차트의 마지막 캔들과 정확히 일치)
        predictionData.push({
          time: baseTime,
          value: basePrice
        });
        
        // 예측된 가격들 추가
        sanitizedPredictedPrices.forEach((price, index) => {
          const nextTime = calculateNextCandleTime(currentInterval, baseTime, index + 1);
          if (!Number.isFinite(nextTime) || !Number.isFinite(price)) {
            console.warn('⚠️ 예측 시간/가격이 유효하지 않아 건너뜀:', { index, nextTime, price });
            return;
          }
          predictionData.push({
            time: nextTime,
            value: price
          });
        });

        if (predictionData.length < 2) {
          updateAIPredictionStatus('error', { error: '예측 데이터가 부족합니다' });
          return;
        }
        
        // 차트에 표시 (전달 전에 유효성 검증)
        const sanitizedPredictionData = predictionData.filter(pt => {
          return pt && Number.isFinite(pt.time) && Number.isFinite(pt.value);
        });

        if (!sanitizedPredictionData || sanitizedPredictionData.length < 2) {
          console.warn('⚠️ 예측 데이터 유효성 검사 실패 또는 데이터 부족, 차트 표시 생략', { predictionData, sanitizedPredictionData });
          updateAIPredictionStatus('error', { error: '예측 데이터 유효성 실패' });
          return;
        }

        safeSeriesSetData(predictionSeries, sanitizedPredictionData, 'predictionSeries');

        // 마커 추가 (첫 번째와 마지막 예측 가격) - 마커 값 유효성 확인
        if (Array.isArray(sanitizedPredictedPrices) && sanitizedPredictedPrices.length > 0) {
          const firstPredPrice = sanitizedPredictedPrices[0];
          const lastPredPrice = sanitizedPredictedPrices[sanitizedPredictedPrices.length - 1];
          const firstPredTime = calculateNextCandleTime(currentInterval, baseTime, 1);
          const lastPredTime = calculateNextCandleTime(currentInterval, baseTime, sanitizedPredictedPrices.length);

          const markers = [];
          if (Number.isFinite(firstPredTime) && Number.isFinite(firstPredPrice)) {
            markers.push({
              time: firstPredTime,
              position: 'belowBar',
              color: '#ffc107',
              shape: 'circle',
              size: 1,
              text: `AI 예측: ${Number(firstPredPrice).toLocaleString()}원`
            });
          }
          if (Number.isFinite(lastPredTime) && Number.isFinite(lastPredPrice)) {
            markers.push({
              time: lastPredTime,
              position: 'belowBar',
              color: '#ffc107',
              shape: 'circle',
              size: 1,
              text: `AI 예측: ${Number(lastPredPrice).toLocaleString()}원`
            });
          }

          if (markers.length > 0) {
            try {
              if (predictionSeries && typeof predictionSeries.setMarkers === 'function') {
                predictionSeries.setMarkers(markers);
              }
            } catch (e) {
              console.warn('predictionSeries.setMarkers 실패', e, { markersSample: markers[0] });
            }
          }
        }
        
        // 다음 예측 가격과 변화율 계산
        const nextPredictedPrice = parseFloat(result.predicted_prices[0]);
        const predictedChange = ((nextPredictedPrice - currentPrice) / currentPrice) * 100;
        
        // 전역 변수에 학습 상태 저장 (예측 성공 시)
        globalModelTrained = true;
        
        // 상태 업데이트 (N/B 값 및 검증 확률 포함)
        updateAIPredictionStatus('success', {
          model_trained: true,
          model_type: result.model_type || 'RandomForest',
          prediction_count: result.prediction_count || result.predicted_prices.length,
          current_price: currentPrice,
          next_predicted_price: nextPredictedPrice,
          predicted_change: predictedChange,
          // 학습 데이터 정보
          training_data_count: result.training_data_count,
          train_r2: result.train_r2,
          val_r2: result.val_r2,
          train_mse: result.train_mse,
          val_mse: result.val_mse,
          train_mae: result.train_mae,
          val_mae: result.val_mae,
          training_time: result.training_time,
          // N/B 값 정보
          current_nb_value: result.current_nb_value,
          predicted_nb_value: result.predicted_nb_value,
          nb_direction: result.nb_direction,
          nb_change_pct: result.nb_change_pct,
          // 예측 방향 정보
          price_direction: result.price_direction,
          price_change_pct: result.price_change_pct,
          // 검증 확률 정보
          verification_probability: result.verification_probability,
          up_verification_prob: result.up_verification_prob,
          down_verification_prob: result.down_verification_prob
        });
        
        console.log('✅ AI 예측 가격 차트에 표시:', {
          model_type: result.model_type,
          prediction_count: result.prediction_count,
          current_price: result.current_price
        });
        
      } catch (error) {
        // 타임아웃 또는 기타 오류 발생 시 기본 예측값 생성 (예측 실패 방지)
        const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError' || error.message?.includes('timeout');
        
        if (isTimeout) {
          console.warn('⚠️ AI 예측 타임아웃, 기본 예측값 생성:', error);
        } else {
          console.warn('⚠️ AI 예측 로드 실패, 기본 예측값 생성:', error);
        }
        
        // 기본 예측값 생성
        try {
          const chartCandles = candleSeries.data();
          let currentPrice, currentTime;
          
          if (chartCandles && chartCandles.length > 0) {
            const lastChartCandle = chartCandles[chartCandles.length - 1];
            currentTime = lastChartCandle.time;
            currentPrice = lastChartCandle.close;
          } else if (allData && allData.length > 0) {
            const lastCandle = allData[allData.length - 1];
            currentTime = Math.floor(new Date(lastCandle.time).getTime() / 1000);
            currentPrice = parseFloat(lastCandle.close);
          } else {
            throw new Error('차트 데이터 없음');
          }
          
          // 기본 예측값 (현재 가격 유지)
          const predictedPrices = [currentPrice];
          const predictionData = [{
            time: currentTime,
            value: currentPrice
          }];
          
          // 간단한 방향 예측 (최근 추세 기반)
          let priceDirection = '보합';
          let priceChangePct = 0.0;
          if (allData && allData.length >= 5) {
            const recentPrices = allData.slice(-5).map(item => parseFloat(item.close));
            const priceTrend = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100;
            if (priceTrend > 0.1) {
              priceDirection = '상승';
              priceChangePct = Math.abs(priceTrend) * 0.5;
            } else if (priceTrend < -0.1) {
              priceDirection = '하락';
              priceChangePct = -Math.abs(priceTrend) * 0.5;
            }
          }
          
          // N/B 값 가져오기
          const nbValueEl = document.getElementById('nbValue');
          const currentNBValue = nbValueEl && nbValueEl.textContent !== '-' ? 
            parseFloat(nbValueEl.textContent.replace(/[^0-9.]/g, '')) : 0.5;
          
          let nbDirection = '보합';
          let nbChangePct = 0.0;
          if (currentNBValue > 0.55) {
            nbDirection = '상승';
            nbChangePct = (currentNBValue - 0.5) * 20;
          } else if (currentNBValue < 0.45) {
            nbDirection = '하락';
            nbChangePct = (currentNBValue - 0.5) * 20;
          }
          
          // 검증 확률 계산
          const priceChangeAbs = Math.abs(priceChangePct);
          const nbExtreme = Math.abs(currentNBValue - 0.5) * 2;
          const directionMatch = (priceDirection === nbDirection) ? 1.0 : 0.5;
          const verificationProbability = Math.min(100, Math.max(0, (
            (priceChangeAbs / 10.0) * 30 +
            nbExtreme * 30 +
            directionMatch * 40
          )));
          
          let upVerificationProb = 50.0;
          let downVerificationProb = 50.0;
          if (priceDirection === '상승') {
            upVerificationProb = verificationProbability;
            downVerificationProb = 100 - verificationProbability;
          } else if (priceDirection === '하락') {
            upVerificationProb = 100 - verificationProbability;
            downVerificationProb = verificationProbability;
          }
          
          // 차트에 기본 예측값 표시 (유효성 검사 후 전달)
          if (predictionSeries) {
            safeSeriesSetData(predictionSeries, predictionData, 'predictionSeries-basic');
          }
          
          // 상태 업데이트 (기본 예측값)
          // 모델이 학습된 경우 학습 상태 유지
          updateAIPredictionStatus('success', {
            model_trained: globalModelTrained, // 전역 변수 확인
            model_type: globalModelTrained ? 'RandomForest' : '기본 예측',
            prediction_count: 1,
            current_price: currentPrice,
            next_predicted_price: currentPrice,
            predicted_change: priceChangePct,
            // N/B 값 정보
            current_nb_value: currentNBValue,
            predicted_nb_value: currentNBValue + (nbChangePct / 100),
            nb_direction: nbDirection,
            nb_change_pct: nbChangePct,
            // 예측 방향 정보
            price_direction: priceDirection,
            price_change_pct: priceChangePct,
            // 검증 확률 정보
            verification_probability: verificationProbability,
            up_verification_prob: upVerificationProb,
            down_verification_prob: downVerificationProb
          });
          
          console.log('✅ 기본 예측값 생성 완료 (타임아웃/오류 대응)');
        } catch (fallbackError) {
          // 기본 예측값 생성도 실패한 경우에만 에러 표시
          console.error('❌ 기본 예측값 생성 실패:', fallbackError);
          updateAIPredictionStatus('error', { 
            error: `예측 실패: ${error.message || error.name}`,
            message: '기본 예측값 생성도 실패했습니다.'
          });
        }
      }
    }
    
    // 모델 자동 학습 (버튼 없이 자동으로 호출)
    async function trainAIModelAuto(allData = null) {
      // 이미 학습 중이면 중복 실행 방지
      if (isTrainingInProgress) {
        console.log('⏸️ 이미 학습 중입니다. 중복 실행 방지');
        return;
      }
      
      isTrainingInProgress = true;
      updateAIPredictionStatus('loading', { message: '모델 자동 학습 중...' });
      
      try {
        // 전달된 데이터가 있으면 사용, 없으면 API에서 가져오기
        let ohlcvData = null;
        
        if (allData && Array.isArray(allData) && allData.length > 0) {
          // 이미 가져온 차트 데이터 사용
          ohlcvData = allData.map(item => ({
            time: item.time,
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            volume: parseFloat(item.volume || 0)
          }));
        }

        // 확보된 데이터가 200개 미만이면 API에서 추가 확보 시도
        if (!ohlcvData || ohlcvData.length < 200) {
          try {
            const fresh = await getChartData('KRW-BTC', currentInterval, 200);
            if (fresh && fresh.data && Array.isArray(fresh.data) && fresh.data.length >= 200) {
              ohlcvData = fresh.data.slice(-200).map(item => ({
                time: item.time,
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
                volume: parseFloat(item.volume || 0)
              }));
              console.log(`✅ 자동 학습용 200개 데이터 확보 (${ohlcvData.length}개)`);
            }
          } catch (freshErr) {
            console.warn('⚠️ 자동 학습용 데이터 추가 확보 실패:', freshErr);
          }
        }

        // 여전히 부족하면 학습을 중단하고 오류 표시
        if (!ohlcvData || ohlcvData.length < 200) {
          throw new Error(`학습 데이터 부족 (${ohlcvData ? ohlcvData.length : 0}/200)`);
        }
        
        // N/B 값 계산
        const nbResult = calculateNBValueForCard(ohlcvData);
        const nbMax = nbResult ? nbResult.nbMax : null;
        const nbMin = nbResult ? nbResult.nbMin : null;
        const nbValue = nbResult ? nbResult.nbValue : null;
        
        const requestBody = {
          market: 'KRW-BTC',
          interval: currentInterval,
          count: 200,
          n: 10,
          train: true,
          model_type: 'RandomForest',
          ohlcv_data: ohlcvData.slice(-200) // 최근 200개만 사용
        };
        
        // N/B 데이터가 있으면 학습 요청에 포함 (화면에 표시된 N/B를 AI 학습에 활용)
        if (nbMax !== null && nbMin !== null) {
          requestBody.nbMax = nbMax;
          requestBody.nbMin = nbMin;
          requestBody.nbValue = nbValue;
          requestBody.currentPrice = ohlcvData[ohlcvData.length - 1].close;
          console.log(`📊 AI 학습 데이터: N/B Max=${nbMax.toFixed(6)}, Min=${nbMin.toFixed(6)}, Value=${nbValue?.toFixed(6)}`);
        } else {
          console.warn('⚠️ N/B 데이터 없이 AI 학습 진행 (정확도 저하 가능)');
        }
        
        const response = await fetch(`${API_BASE_URL}/ai/predict`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000) // 120초 타임아웃 (학습은 시간이 걸림)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          completeStage(STAGES.AI_TRAIN, `모델 학습 완료: ${result.model_type}`);
          console.log('✅ 모델 자동 학습 완료:', result.model_type);
          // 전역 변수에 학습 상태 저장
          globalModelTrained = true;
          
          // AI 상태 업데이트 (레벨, 경험치, 세그먼트)
          updateAIStatus(result);
          
          // 학습 레벨과 세그먼트 계산
          const level = aiStatus.level;
          const segment = aiStatus.segment;
          
          updateAIPredictionStatus('success', {
            model_trained: true,
            model_type: result.model_type || selectedModelType,
            training_data_count: result.training_data_count,
            train_r2: result.train_r2,
            val_r2: result.val_r2,
            training_level: level,
            training_segment: segment,
            ai_level: aiStatus.level,
            ai_experience: aiStatus.experience,
            ai_total_training_count: aiStatus.totalTrainingCount
          });
          
          // 모델 저장 확인
          if (result.model_saved) {
            console.log('💾 모델 저장 완료');
          }
          // 학습 후 차트 데이터를 다시 로드하여 예측 수행 (loadChartData가 자동으로 loadAIPrediction 호출)
          setTimeout(() => {
            loadChartData();
          }, 1000);
        } else {
          throw new Error(result.error || '학습 실패');
        }
      } catch (error) {
        console.warn('⚠️ 모델 자동 학습 실패:', error);
        errorStage(STAGES.AI_TRAIN, `학습 실패: ${error.message || error.name}`);
        updateAIPredictionStatus('error', { error: error.message || error.name });
        globalModelTrained = false; // 학습 실패 시 상태 초기화
        throw error; // 상위로 전파하여 재시도 가능하도록
      } finally {
        isTrainingInProgress = false; // 학습 완료/실패 후 플래그 해제
      }
    }
    
    // 수동 학습 함수 제거됨 (자동 학습만 사용)
    
    // 학습된 모델 확인 함수
    async function checkTrainedModel() {
      const infoEl = document.getElementById('trainedModelInfo');
      const statusEl = document.getElementById('trainedModelStatus');
      const btnEl = document.getElementById('btnCheckTrainedModel');
      
      if (infoEl) infoEl.style.display = 'block';
      if (statusEl) {
        statusEl.innerHTML = '<div style="color: #9aa0a6;">확인 중...</div>';
      }
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.textContent = '확인 중...';
      }
      
      try {
        // 모델 타입 가져오기
        const modelTypeSelect = document.getElementById('aiModelTypeSelect');
        const selectedModelType = modelTypeSelect ? modelTypeSelect.value : 'RandomForest';
        
        // 모델 상태 확인은 내부 헬퍼 사용 (서버의 엔드포인트/메서드 변경으로 인한 400 방지)
        const modelCheck = await checkModel(currentInterval, selectedModelType);

        if (modelCheck && modelCheck.exists) {
          const info = modelCheck.info || {};
          const modelType = info.model_type || selectedModelType;
          const trainingDataCount = info.training_data_count || 0;
          const trainR2 = info.train_r2 || 0;
          const valR2 = info.val_r2 || 0;

          if (statusEl) {
            statusEl.innerHTML = `
              <div style="color: #0ecb81; font-weight: bold; margin-bottom: 5px;">✅ 학습된 모델 발견!</div>
              <div>모델 타입: ${modelType}</div>
              <div>학습 데이터 수: ${trainingDataCount.toLocaleString()}개</div>
              <div>학습 R²: ${trainR2 ? trainR2.toFixed(4) : 'N/A'}</div>
              <div>검증 R²: ${valR2 ? valR2.toFixed(4) : 'N/A'}</div>
            `;
          }

          globalModelTrained = true;
          updateAIPredictionStatus('success', {
            model_trained: true,
            model_type: modelType,
            training_data_count: trainingDataCount,
            train_r2: trainR2,
            val_r2: valR2
          });
          console.log('✅ 학습된 모델 확인 완료:', modelType);
        } else {
          if (modelCheck && modelCheck.not_found) {
            if (statusEl) {
              statusEl.innerHTML = `
                <div style="color: #f6465d; font-weight: bold; margin-bottom: 5px;">⚠️ 모델 상태 엔드포인트 없음 (404)</div>
                <div>서버 API 경로를 확인하세요.</div>
              `;
            }
            globalModelTrained = false;
            return;
          }

          if (modelCheck && modelCheck.removed) {
            if (statusEl) {
              statusEl.innerHTML = `
                <div style="color: #9aa0a6; font-weight: bold; margin-bottom: 5px;">ℹ️ AI 학습 기능 제거됨</div>
                <div>AI 학습 기능이 서버에서 제거되었습니다.</div>
              `;
            }
            globalModelTrained = false;
            return;
          }

          // 모델 없음
          if (statusEl) {
            statusEl.innerHTML = `
              <div style="color: #ffc107; font-weight: bold; margin-bottom: 5px;">⚠️ 학습된 모델 없음</div>
              <div>모델이 학습되지 않았습니다. 자동 학습이 실행됩니다.</div>
            `;
          }
          globalModelTrained = false;
          console.log('⚠️ 학습된 모델이 없습니다.');
        }
      } catch (error) {
        // 410 에러는 AI 학습 기능이 제거된 경우 - 조용히 처리
        if (error.message && error.message.includes('410')) {
          if (statusEl) {
            statusEl.innerHTML = `
              <div style="color: #9aa0a6; font-weight: bold; margin-bottom: 5px;">ℹ️ AI 학습 기능 제거됨</div>
              <div>AI 학습 기능이 서버에서 제거되었습니다.</div>
            `;
          }
          globalModelTrained = false;
          return;
        }
        
        // 타임아웃이나 네트워크 오류는 조용히 처리 (자동 학습이 처리함)
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
          console.warn('⚠️ 모델 확인 타임아웃 (자동 학습이 처리합니다)');
          if (statusEl) {
            statusEl.innerHTML = `
              <div style="color: #ffc107; font-weight: bold; margin-bottom: 5px;">⏳ 확인 중...</div>
              <div>자동 학습이 진행됩니다.</div>
            `;
          }
        } else {
          // 410 에러가 아닌 경우에만 에러 로그 출력 (500 등은 이미 UI로 안내했으므로 warn)
          if (!error.message || !error.message.includes('410')) {
            console.warn('❌ 학습된 모델 확인 실패:', error);
          }
          if (statusEl) {
            statusEl.innerHTML = `
              <div style="color: #f6465d; font-weight: bold; margin-bottom: 5px;">❌ 확인 실패</div>
              <div>${error.message || error.name}</div>
            `;
          }
        }
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.textContent = '🔍 학습된 모델 확인';
        }
      }
    }
    
    // 점진적 학습 함수 제거됨 (사용하지 않음)

    // AI 상태 업데이트 및 저장 (모듈 헬퍼 사용)
    function updateAIStatus(trainingResult) {
      if (!trainingResult || !trainingResult.success) return;

      updateAIStatusLocal(aiStatus, trainingResult);
      saveAnalysisData();
      updateAILearningStatusDisplay();

      console.log('✅ AI 상태 업데이트:', {
        level: aiStatus.level,
        experience: aiStatus.experience,
        totalTrainingCount: aiStatus.totalTrainingCount,
        segment: aiStatus.segment,
        trainR2: aiStatus.trainR2,
        valR2: aiStatus.valR2
      });
    }
    
    // 우측 분석 영역의 AI 학습 상태 표시 업데이트
    function updateAILearningStatusDisplay() {
      // 모델 상태
      const modelStatusEl = document.getElementById('aiModelStatus');
      if (modelStatusEl) {
        modelStatusEl.textContent = globalModelTrained ? '학습됨' : '미학습';
        modelStatusEl.style.color = globalModelTrained ? '#0ecb81' : '#ffc107';
      }
      
      // 레벨
      const levelEl = document.getElementById('aiLevel');
      if (levelEl) {
        const level = aiStatus.level || 1;
        
        // 레벨 표시 형식 (LV 100 이후는 마스터 레벨로 표시)
        let levelText = '';
        let levelColor = '#9aa0a6';
        
        if (level <= 100) {
          levelText = `LV ${level}`;
          levelColor = level >= 10 ? '#0ecb81' : level >= 5 ? '#ffc107' : '#9aa0a6';
        } else {
          const masterLevel = level - 100;
          levelText = `LV 100+${masterLevel} (마스터)`;
          levelColor = '#9c27b0'; // 보라색
        }
        
        levelEl.textContent = levelText;
        levelEl.style.color = levelColor;
      }
      
      // 경험치
      const experienceEl = document.getElementById('aiExperience');
      if (experienceEl) {
        experienceEl.textContent = `EXP ${aiStatus.experience.toLocaleString()}`;
        experienceEl.style.color = '#0ecb81';
      }
      
      // 세그먼트
      const segmentEl = document.getElementById('aiSegment');
      if (segmentEl) {
        segmentEl.textContent = aiStatus.segment;
        segmentEl.style.color = '#9aa0a6';
      }
      
      // 모델 타입
      const modelTypeEl = document.getElementById('aiModelType');
      if (modelTypeEl) {
        modelTypeEl.textContent = aiStatus.modelType || '-';
        modelTypeEl.style.color = '#9aa0a6';
      }
      
      // 학습 데이터 수
      const trainingDataCountEl = document.getElementById('aiTrainingDataCount');
      if (trainingDataCountEl) {
        trainingDataCountEl.textContent = `${aiStatus.totalTrainingCount.toLocaleString()} 개`;
        trainingDataCountEl.style.color = '#9aa0a6';
      }
      
      // 학습 정확도
      const accuracyEl = document.getElementById('aiTrainingAccuracy');
      if (accuracyEl) {
        if (aiStatus.trainR2 > 0) {
          const r2 = (aiStatus.trainR2 * 100).toFixed(2);
          accuracyEl.textContent = `${r2}%`;
          accuracyEl.style.color = aiStatus.trainR2 >= 0.7 ? '#0ecb81' : aiStatus.trainR2 >= 0.5 ? '#ffc107' : '#f6465d';
        } else {
          accuracyEl.textContent = '-';
          accuracyEl.style.color = '#9aa0a6';
        }
      }
      
      // 마지막 학습 시간
      const lastTrainingTimeEl = document.getElementById('aiLastTrainingTime');
      if (lastTrainingTimeEl && aiStatus.lastTrainingTime) {
        const lastTime = new Date(aiStatus.lastTrainingTime);
        const now = new Date();
        const diffMs = now - lastTime;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        let timeText = '';
        if (diffDays > 0) {
          timeText = `${diffDays}일 전`;
        } else if (diffHours > 0) {
          timeText = `${diffHours}시간 전`;
        } else if (diffMins > 0) {
          timeText = `${diffMins}분 전`;
        } else {
          timeText = '방금 전';
        }
        
        lastTrainingTimeEl.textContent = timeText;
        lastTrainingTimeEl.style.color = '#9aa0a6';
      } else if (lastTrainingTimeEl) {
        lastTrainingTimeEl.textContent = '-';
        lastTrainingTimeEl.style.color = '#9aa0a6';
      }
    }
    
    // 실시간 학습 관련 변수
    // AI 학습 기능 제거됨
    let realtimeTrainingEnabled = false; // 실시간 학습 비활성화
    let lastTrainingTime = 0;
    let lastDataHash = '';
    let isTrainingInProgress = false;
    const REALTIME_TRAINING_INTERVAL = 30000;
    
    // 실시간 학습 함수 (비활성화됨)
    async function realtimeTraining_disabled(allData) {
      if (!realtimeTrainingEnabled || !allData || allData.length === 0) {
        return;
      }
      
      // 이미 학습 중이면 중복 실행 방지
      if (isTrainingInProgress) {
        return;
      }
      
      try {
        // 현재 시간 확인
        const now = Date.now();
        const timeSinceLastTraining = now - lastTrainingTime;
        
        // 최소 간격 확인 (30초)
        if (timeSinceLastTraining < REALTIME_TRAINING_INTERVAL) {
          return; // 아직 학습 시간이 되지 않음
        }
        
        // 모델이 없으면 즉시 학습 (하지만 trainAIModelAuto가 이미 처리했을 수 있음)
        if (!globalModelTrained && !isTrainingInProgress) {
          console.log('🔄 모델이 없음. 실시간 학습 즉시 시작...');
        } else if (globalModelTrained) {
          // 모델이 있으면 실시간 학습은 주기적으로만 실행
          return;
        }
        
        // 데이터 해시 생성 (중복 학습 방지)
        const dataHash = JSON.stringify(allData.slice(-10).map(d => d.time + d.close));
        if (dataHash === lastDataHash) {
          return; // 데이터가 변경되지 않음
        }
        
        lastDataHash = dataHash;
        lastTrainingTime = now;
        isTrainingInProgress = true; // 학습 시작 플래그 설정
        
        console.log('🔄 실시간 학습 시작...');
        
        // 모델 타입 가져오기
        const modelTypeSelect = document.getElementById('aiModelTypeSelect');
        const selectedModelType = modelTypeSelect ? modelTypeSelect.value : 'RandomForest';
        
        // OHLCV 데이터 준비
        const ohlcvData = allData.map(item => ({
          time: item.time,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.volume || 0)
        }));
        
        const requestBody = {
          market: 'KRW-BTC',
          interval: currentInterval,
          count: allData.length,
          n: 10,
          train: true,
          model_type: selectedModelType,
          ohlcv_data: ohlcvData,
          save_model: true // 모델 저장 요청
        };
        
        const response = await fetch(`${API_BASE_URL}/ai/predict`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120000) // 120초 타임아웃
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          console.log('✅ 실시간 학습 완료:', result.model_type);
          // 전역 변수에 학습 상태 저장
          globalModelTrained = true;
          lastTrainingTime = Date.now(); // 학습 시간 업데이트
          
          // AI 상태 업데이트 (레벨, 경험치, 세그먼트)
          updateAIStatus(result);
          
          // 학습 레벨과 세그먼트 계산
          const level = aiStatus.level;
          const segment = aiStatus.segment;
          
          updateAIPredictionStatus('success', {
            model_trained: true,
            model_type: result.model_type || selectedModelType,
            training_data_count: result.training_data_count,
            train_r2: result.train_r2,
            val_r2: result.val_r2,
            training_level: level,
            training_segment: segment,
            ai_level: aiStatus.level,
            ai_experience: aiStatus.experience,
            ai_total_training_count: aiStatus.totalTrainingCount
          });
          
          // 모델 저장 확인
          if (result.model_saved) {
            console.log('💾 모델 저장 완료');
          }
        } else {
          throw new Error(result.error || '실시간 학습 실패');
        }
      } catch (error) {
        console.warn('⚠️ 실시간 학습 실패:', error);
        // 실시간 학습 실패는 조용히 처리 (다음 주기에 재시도)
      } finally {
        isTrainingInProgress = false; // 학습 완료/실패 후 플래그 해제
      }
    }
    
    // 다음 캔들 시간 계산 함수
    function calculateNextCandleTime(interval, currentTime, offset = 1) {
      const currentDate = new Date(currentTime * 1000);
      let nextDate = new Date(currentDate);
      
      // interval에 따라 다음 시간 계산
      switch (interval) {
        case 'minute1':
          nextDate.setMinutes(nextDate.getMinutes() + (1 * offset));
          break;
        case 'minute3':
          nextDate.setMinutes(nextDate.getMinutes() + (3 * offset));
          break;
        case 'minute5':
          nextDate.setMinutes(nextDate.getMinutes() + (5 * offset));
          break;
        case 'minute10':
          nextDate.setMinutes(nextDate.getMinutes() + (10 * offset));
          break;
        case 'minute15':
          nextDate.setMinutes(nextDate.getMinutes() + (15 * offset));
          break;
        case 'minute30':
          nextDate.setMinutes(nextDate.getMinutes() + (30 * offset));
          break;
        case 'minute60':
        case 'hour':
          nextDate.setHours(nextDate.getHours() + (1 * offset));
          break;
        case 'day':
          nextDate.setDate(nextDate.getDate() + (1 * offset));
          break;
        default:
          nextDate.setMinutes(nextDate.getMinutes() + (10 * offset)); // 기본값: 10분
      }
      
      return Math.floor(nextDate.getTime() / 1000);
    }
    
    // 카드 2 생성 (카드 1의 예측이 실제로 나타남)
    async function createCard2FromPrediction(currentData, allData) {
      if (!card1Prediction) return;
      
      const actualPrice = parseFloat(currentData.close);
      const actualTime = new Date(currentData.time);
      
      // EMA 계산
      const closes = allData.map(d => parseFloat(d.close));
      const emaFast = ema(closes, 12);
      const emaSlow = ema(closes, 30);
      const emaFastValue = emaFast[emaFast.length - 1];
      const emaSlowValue = emaSlow[emaSlow.length - 1];
      
      // N/B 값 계산
      const nbResult = calculateNBValueForCard(allData);
      
      // 구역 판단
      const actualZone = determineZone(nbResult ? nbResult.nbValue : null, card2Data ? card2Data.previousZone : null);
      const predictedZone = card1Prediction.predictedZone || null;
      
      // 카드 2 데이터 저장 (카드 1의 예측이 실제로 나타남)
      card2Data = {
        price: actualPrice,
        time: actualTime,
        emaFast: emaFastValue,
        emaSlow: emaSlowValue,
        data: allData,
        chartData: allData.slice(-30),
        predictedPrice: card1Prediction.predictedPrice, // 예측 가격 저장
        prediction: card1Prediction, // 전체 예측 데이터 저장
        predictedZone: predictedZone, // 예측 구역
        actualZone: actualZone, // 실제 구역
        previousZone: actualZone // 다음 판단을 위해 저장
      };
      
      // 분봉 이름 변환 함수
      const timeframeName = getTimeframeName(currentInterval);
      
      // 생산 날짜 저장
      const productionDate = new Date();
      card2Data.productionDate = productionDate;
      card2Data.productionPrice = actualPrice;
      card2Data.productionTimeframe = currentInterval;
      
      // 카드 2 UI 업데이트
      document.getElementById('card2Timeframe').textContent = timeframeName;
      document.getElementById('card2Price').textContent = actualPrice.toLocaleString() + ' 원';
      document.getElementById('card2ProductionDate').textContent = productionDate.toLocaleString('ko-KR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      document.getElementById('card2ProductionPrice').textContent = actualPrice.toLocaleString() + ' 원';
      document.getElementById('card2ProductionTimeframe').textContent = timeframeName;
      document.getElementById('card2EmaFast').textContent = emaFastValue.toLocaleString() + ' 원';
      document.getElementById('card2EmaSlow').textContent = emaSlowValue.toLocaleString() + ' 원';
      
      // 생산 시점 그래프 생성
      createCardChart('card2Chart', allData.slice(-30)); // 최근 30개 캔들만 표시
      
      // 카드 2 N/B 값 표시
      if (nbResult) {
        const decimalPlaces = 10;
        document.getElementById('card2NBValue').textContent = nbResult.nbValue.toFixed(decimalPlaces);
        document.getElementById('card2NBMax').textContent = nbResult.nbMax.toFixed(decimalPlaces);
        document.getElementById('card2NBMin').textContent = nbResult.nbMin.toFixed(decimalPlaces);
      } else {
        document.getElementById('card2NBValue').textContent = '-';
        document.getElementById('card2NBMax').textContent = '-';
        document.getElementById('card2NBMin').textContent = '-';
      }
      
      // 카드 2 데이터에 N/B 값 저장
      if (nbResult) {
        card2Data.nbValue = nbResult.nbValue;
        card2Data.nbMax = nbResult.nbMax;
        card2Data.nbMin = nbResult.nbMin;
      }
      
      // 카드 2 UI에 구역 표시 (예측 구역은 숨김)
      const predictedZoneRow = document.getElementById('card2PredictedZoneRow');
      const predictedZoneEl = document.getElementById('card2PredictedZone');
      const actualZoneEl = document.getElementById('card2ActualZone');

      if (predictedZoneRow) predictedZoneRow.style.display = 'none';
      if (predictedZoneEl) {
        predictedZoneEl.textContent = '-';
        predictedZoneEl.style.color = '#9aa0a6';
      }
      
      if (actualZoneEl) {
        actualZoneEl.textContent = getZoneName(actualZone);
        actualZoneEl.style.color = getZoneColor(actualZone);
      }
      
      // 현재 가격 표시
      document.getElementById('card2Price').textContent = actualPrice.toLocaleString() + ' 원';
      
      // 생산 정보 표시
      document.getElementById('card2ProductionDate').textContent = productionDate.toLocaleString('ko-KR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      document.getElementById('card2ProductionPrice').textContent = actualPrice.toLocaleString() + ' 원';
      document.getElementById('card2ProductionTimeframe').textContent = timeframeName;
      
      // 예측 정보 표시
      document.getElementById('card2PredictedPrice').textContent = card1Prediction.predictedPrice.toLocaleString() + ' 원';
      document.getElementById('card2PredictedPriceDisplay').textContent = card1Prediction.predictedPrice.toLocaleString() + ' 원';
      document.getElementById('card2Confidence').textContent = `신뢰도: ${(card1Prediction.confidence * 100).toFixed(1)}%`;
      
      // 생산 시점 그래프 생성
      createCardChart('card2Chart', allData.slice(-30)); // 최근 30개 캔들만 표시
      
      // 카드 2를 N/B database에 저장 (await로 완료 대기)
      const saveResult = await saveCardToDatabase('card2', {
        price: actualPrice,
        time: actualTime.toISOString(),
        emaFast: emaFastValue,
        emaSlow: emaSlowValue,
        nb_value: nbResult ? nbResult.nbValue : null,
        nb_max: nbResult ? nbResult.nbMax : null,
        nb_min: nbResult ? nbResult.nbMin : null,
        productionDate: productionDate.toISOString(),
        productionPrice: actualPrice,
        productionTimeframe: currentInterval,
        predictedPrice: card1Prediction.predictedPrice,
        prices: closes.slice(-50), // 최근 50개 가격만 저장
        chartData: allData.slice(-30) // 그래프용 차트 데이터
      });
      
      if (saveResult && saveResult.card_id) {
        card2Data.savedCardId = saveResult.card_id;
        console.log('✅ 카드2 저장 완료(예측 기반), card_id:', saveResult.card_id);
      }
      
      card2 = true;
      
      // 카드 2 상태 업데이트
      document.getElementById('card2').classList.remove('waiting');
      document.getElementById('card2').classList.add('active');
      
      // localStorage에 저장
      saveAnalysisData();
    }
    
    // 카드 1 예측 (다음 카드 예측)
    async function predictCard1(allData) {
      if (!card2Data || !allData || allData.length === 0) return;
      
      const currentPrice = card2Data.price;
      const emaFast = card2Data.emaFast;
      const emaSlow = card2Data.emaSlow;
      const nbResult = {
        nbValue: card2Data.nbValue,
        nbMax: card2Data.nbMax,
        nbMin: card2Data.nbMin
      };
      
      // AI 예측 시도
      await predictCard1WithAI(currentPrice, emaFast, emaSlow, allData, nbResult);
      
      // 카드 1이 생성되었는지 확인
      if (card1Prediction) {
        card1 = true; // 카드 1 생성됨
      }
    }
    
    // 카드 3 생성 (검증 완료 카드) - 과거 카드 2장 + 현재 카드로 검증
    function createCard3(currentData, allData) {
      // 과거 카드 2장과 현재 카드가 모두 있어야 검증 가능
      if (!previousPreviousCard2Data || !previousCard2Data || !card2Data) {
        console.log('⚠️ 검증 불가: 과거 카드 2장과 현재 카드가 모두 필요합니다.', {
          hasPreviousPrevious: !!previousPreviousCard2Data,
          hasPrevious: !!previousCard2Data,
          hasCurrent: !!card2Data
        });
        return;
      }
      
      console.log('✅ 검증 시작:', {
        previousPreviousCard2Data: previousPreviousCard2Data ? {
          price: previousPreviousCard2Data.price,
          predictedPrice: previousPreviousCard2Data.predictedPrice
        } : null,
        previousCard2Data: previousCard2Data ? {
          price: previousCard2Data.price,
          predictedPrice: previousCard2Data.predictedPrice
        } : null,
        card2Data: card2Data ? {
          price: card2Data.price
        } : null
      });
      
      // 과거 카드 2장의 데이터를 기반으로 검증
      // 과거 카드 1 (previousPreviousCard2Data)과 과거 카드 2 (previousCard2Data)의 예측을 현재 카드 (card2Data)와 비교
      const pastCard1Price = previousPreviousCard2Data.price;
      const pastCard2PredictedPrice = previousCard2Data.predictedPrice || previousCard2Data.price;
      const currentCardActualPrice = card2Data.price;
      const currentCardTime = card2Data.time;
      
      // 예측 가격: 과거 카드 2의 예측 가격
      const predictedPrice = pastCard2PredictedPrice;
      // 실제 가격: 현재 카드의 실제 가격
      const actualPrice = currentCardActualPrice;
      const actualTime = currentCardTime;
      
      // N/B 값 계산
      const nbResult = calculateNBValueForCard(allData);
      
      // 분봉 이름 변환 함수
      const timeframeName = getTimeframeName(currentInterval);
      
      // 오차 계산
      const error = Math.abs(actualPrice - predictedPrice) / predictedPrice * 100;
      const errorRate = ((actualPrice - predictedPrice) / predictedPrice * 100);
      
      // 과거 카드 2장의 가격 (검증 기준) - pastCard1Price는 이미 위에서 선언됨
      const pastCard2Price = previousCard2Data.price;
      
      // 구역 판단
      const actualZone = determineZone(nbResult ? nbResult.nbValue : null, card2Data ? card2Data.previousZone : null);
      const predictedZone = previousCard2Data.predictedZone || (previousCard2Data.prediction && previousCard2Data.prediction.predictedZone) || null;
      
      // 구역 예측 정확도 검증
      const isZoneCorrect = predictedZone && actualZone && predictedZone === actualZone;
      
      // 검증 결과
      const isAccurate = error < 2.0; // 2% 이내면 정확
      // 방향성 검증: 예측 가격과 실제 가격이 과거 카드들의 가격 대비 같은 방향인지 확인
      // 과거 카드 1과 과거 카드 2의 평균 가격을 기준으로 검증
      const averagePastPrice = (pastCard1Price + pastCard2Price) / 2;
      const isDirectionCorrect = (actualPrice > averagePastPrice && predictedPrice > averagePastPrice) ||
                                  (actualPrice < averagePastPrice && predictedPrice < averagePastPrice);
      
      // 생산 날짜 (현재 카드의 생산 날짜 사용)
      const productionDate = card2Data.productionDate || new Date();
      const productionPrice = card2Data.productionPrice || actualPrice;
      const productionTimeframe = card2Data.productionTimeframe || currentInterval;
      
      // 카드 3 UI 업데이트
      document.getElementById('card3Timeframe').textContent = timeframeName;
      document.getElementById('card3PredictedPrice').textContent = predictedPrice.toLocaleString() + ' 원';
      document.getElementById('card3ActualPrice').textContent = actualPrice.toLocaleString() + ' 원';
      document.getElementById('card3ProductionDate').textContent = productionDate.toLocaleString('ko-KR', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      document.getElementById('card3ProductionPrice').textContent = productionPrice.toLocaleString() + ' 원';
      document.getElementById('card3ProductionTimeframe').textContent = getTimeframeName(productionTimeframe);
      document.getElementById('card3Error').textContent = error.toFixed(2) + '%';
      document.getElementById('card3Error').style.color = error < 2 ? '#0ecb81' : error < 5 ? '#ffc107' : '#f6465d';
      
      // 가격 변화율 계산 (생산 시점 가격 대비 실제 가격)
      const priceChangeRate = ((actualPrice - productionPrice) / productionPrice) * 100;
      const priceChangeText = priceChangeRate >= 0 
        ? `+${priceChangeRate.toFixed(2)}%` 
        : `${priceChangeRate.toFixed(2)}%`;
      const priceChangeColor = priceChangeRate >= 0 ? '#0ecb81' : '#f6465d';
      document.getElementById('card3PriceChange').textContent = priceChangeText;
      document.getElementById('card3PriceChange').style.color = priceChangeColor;
      
      // 생산 시점 그래프 생성
      const chartData = card2Data.data || allData;
      createCardChart('card3Chart', chartData.slice(-30)); // 최근 30개 캔들만 표시
      
      // 카드 3 N/B 값 표시
      if (nbResult) {
        const decimalPlaces = 10;
        document.getElementById('card3NBValue').textContent = nbResult.nbValue.toFixed(decimalPlaces);
        document.getElementById('card3NBMax').textContent = nbResult.nbMax.toFixed(decimalPlaces);
        document.getElementById('card3NBMin').textContent = nbResult.nbMin.toFixed(decimalPlaces);
      } else {
        document.getElementById('card3NBValue').textContent = '-';
        document.getElementById('card3NBMax').textContent = '-';
        document.getElementById('card3NBMin').textContent = '-';
      }
      
      // 카드 3 구역 표시
      const card3PredictedZoneEl = document.getElementById('card3PredictedZone');
      const card3ActualZoneEl = document.getElementById('card3ActualZone');
      const card3ZoneAccuracyEl = document.getElementById('card3ZoneAccuracy');
      
      if (card3PredictedZoneEl) {
        if (predictedZone) {
          card3PredictedZoneEl.textContent = getZoneName(predictedZone);
          card3PredictedZoneEl.style.color = getZoneColor(predictedZone);
        } else {
          card3PredictedZoneEl.textContent = '-';
          card3PredictedZoneEl.style.color = '#9aa0a6';
        }
      }
      
      if (card3ActualZoneEl) {
        card3ActualZoneEl.textContent = getZoneName(actualZone);
        card3ActualZoneEl.style.color = getZoneColor(actualZone);
      }
      
      if (card3ZoneAccuracyEl) {
        if (predictedZone && actualZone) {
          if (isZoneCorrect) {
            card3ZoneAccuracyEl.textContent = '✅ 정확';
            card3ZoneAccuracyEl.style.color = '#0ecb81';
          } else {
            card3ZoneAccuracyEl.textContent = '❌ 오류';
            card3ZoneAccuracyEl.style.color = '#f6465d';
          }
        } else {
          card3ZoneAccuracyEl.textContent = '-';
          card3ZoneAccuracyEl.style.color = '#9aa0a6';
        }
      }
      
      // 검증 결과 표시
      const verificationSection = document.getElementById('card3Verification');
      verificationSection.style.display = 'block';
      
      const verificationIcon = document.getElementById('card3VerificationIcon');
      const verificationText = document.getElementById('card3VerificationText');
      const verificationDetails = document.getElementById('card3VerificationDetails');
      const accuracyBadge = document.getElementById('card3AccuracyBadge');
      
      if (isAccurate && isDirectionCorrect) {
        verificationIcon.textContent = '✅';
        verificationText.textContent = '예측 성공';
        verificationText.className = 'verification-text correct';
        verificationDetails.textContent = 
          `과거 카드 1: ${pastCard1Price.toLocaleString()}원 | 과거 카드 2: ${pastCard2Price.toLocaleString()}원\n` +
          `예측: ${predictedPrice.toLocaleString()}원 | 실제: ${actualPrice.toLocaleString()}원\n` +
          `오차: ${error.toFixed(2)}% | 방향: ${isDirectionCorrect ? '정확' : '오류'}`;
        accuracyBadge.textContent = '높은 정확도';
        accuracyBadge.className = 'accuracy-badge high';
        accuracyBadge.style.display = 'block';
      } else if (isDirectionCorrect) {
        verificationIcon.textContent = '⚠️';
        verificationText.textContent = '방향 정확';
        verificationText.className = 'verification-text correct';
        verificationDetails.textContent = 
          `과거 카드 1: ${pastCard1Price.toLocaleString()}원 | 과거 카드 2: ${pastCard2Price.toLocaleString()}원\n` +
          `예측: ${predictedPrice.toLocaleString()}원 | 실제: ${actualPrice.toLocaleString()}원\n` +
          `오차: ${error.toFixed(2)}% | 방향: 정확`;
        accuracyBadge.textContent = '중간 정확도';
        accuracyBadge.className = 'accuracy-badge medium';
        accuracyBadge.style.display = 'block';
      } else {
        verificationIcon.textContent = '❌';
        verificationText.textContent = '예측 실패';
        verificationText.className = 'verification-text incorrect';
        verificationDetails.textContent = 
          `과거 카드 1: ${pastCard1Price.toLocaleString()}원 | 과거 카드 2: ${pastCard2Price.toLocaleString()}원\n` +
          `예측: ${predictedPrice.toLocaleString()}원 | 실제: ${actualPrice.toLocaleString()}원\n` +
          `오차: ${error.toFixed(2)}% | 방향: 오류`;
        accuracyBadge.textContent = '낮은 정확도';
        accuracyBadge.className = 'accuracy-badge low';
        accuracyBadge.style.display = 'block';
      }
      
      // 카드 3 데이터 저장
      card3Data = {
        actualPrice: actualPrice,
        predictedPrice: predictedPrice,
        time: actualTime,
        error: error,
        isAccurate: isAccurate,
        isDirectionCorrect: isDirectionCorrect,
        predictedZone: predictedZone, // 예측 구역
        actualZone: actualZone, // 실제 구역
        isZoneCorrect: isZoneCorrect, // 구역 예측 정확도
        nbValue: nbResult ? nbResult.nbValue : null,
        nbMax: nbResult ? nbResult.nbMax : null,
        nbMin: nbResult ? nbResult.nbMin : null,
        productionDate: productionDate,
        productionPrice: productionPrice,
        productionTimeframe: productionTimeframe,
        priceChangeRate: priceChangeRate,
        data: chartData
      };
      
      // 검증 완료된 카드를 목록에 추가 (최근 10장만 유지)
      const verifiedCard = {
        id: `verified-${Date.now()}`,
        timeframe: currentInterval,
        timeframeName: timeframeName,
        predictedPrice: predictedPrice,
        actualPrice: actualPrice,
        error: error,
        errorRate: errorRate,
        isAccurate: isAccurate,
        isDirectionCorrect: isDirectionCorrect,
        predictedZone: predictedZone, // 예측 구역
        actualZone: actualZone, // 실제 구역
        isZoneCorrect: isZoneCorrect, // 구역 예측 정확도
        productionDate: productionDate,
        productionPrice: productionPrice,
        productionTimeframe: productionTimeframe,
        priceChangeRate: priceChangeRate,
        nbValue: nbResult ? nbResult.nbValue : null,
        nbMax: nbResult ? nbResult.nbMax : null,
        nbMin: nbResult ? nbResult.nbMin : null,
        verifiedTime: new Date().toISOString(),
        data: chartData
      };
      
      console.log('✅ 검증 완료:', {
        timeframe: currentInterval,
        timeframeName: timeframeName,
        predictedPrice: predictedPrice.toLocaleString() + '원',
        actualPrice: actualPrice.toLocaleString() + '원',
        error: error.toFixed(2) + '%',
        isAccurate: isAccurate,
        isDirectionCorrect: isDirectionCorrect,
        accuracyText: isAccurate && isDirectionCorrect ? '높은 정확도' : isDirectionCorrect ? '중간 정확도' : '낮은 정확도'
      });
      
      // 검증 완료 카드 추가 전 확인
      console.log('📝 검증 완료 카드 추가 전:', {
        currentCount: verifiedCards.length,
        newCard: {
          id: verifiedCard.id,
          timeframe: verifiedCard.timeframe,
          timeframeName: verifiedCard.timeframeName,
          predictedPrice: verifiedCard.predictedPrice,
          actualPrice: verifiedCard.actualPrice
        }
      });
      
      // 하단 영역에 이미 같은 카드가 있는지 확인
      // 같은 분봉, 같은 예측 가격, 같은 실제 가격을 가진 카드가 있으면 중복으로 간주
      const isDuplicate = verifiedCards.some(existingCard => {
        return existingCard.timeframe === verifiedCard.timeframe &&
               existingCard.predictedPrice === verifiedCard.predictedPrice &&
               existingCard.actualPrice === verifiedCard.actualPrice;
      });
      
      if (isDuplicate) {
        console.log('⚠️ 검증 완료 카드 중복: 이미 하단 영역에 등록된 카드입니다.', {
          timeframe: verifiedCard.timeframeName,
          predictedPrice: verifiedCard.predictedPrice,
          actualPrice: verifiedCard.actualPrice
        });
      } else {
        verifiedCards.push(verifiedCard);
        
        // 최근 10장만 유지
        if (verifiedCards.length > 10) {
          verifiedCards.shift(); // 가장 오래된 카드 제거
        }
        
        // localStorage에 저장 (디바운싱 적용)
        saveAnalysisData();
        
        // 검증 완료된 카드 영역 업데이트
        renderVerifiedCardsLocal('verifiedCardsContainer');
      }
      
      card3 = true;
      
      // 카드 3 상태 업데이트
      const card3El = document.getElementById('card3');
      if (card3El) {
        card3El.classList.remove('waiting');
        card3El.classList.add('active', 'verified');
      }
      const card3StatusEl = document.getElementById('card3Status');
      if (card3StatusEl) {
        card3StatusEl.textContent = '검증 완료';
        card3StatusEl.className = 'card-status verified';
      }
      
      // 검증 완료 시 기존 카드2 레코드를 업데이트
      const closes = allData.map(d => parseFloat(d.close));
      // actualTime이 Date 객체인지 확인
      const verificationTime = actualTime && typeof actualTime.toISOString === 'function' 
        ? actualTime.toISOString() 
        : (new Date()).toISOString();
      const verificationData = {
        actualPrice: actualPrice,
        predictedPrice: predictedPrice,
        verificationTime: verificationTime,
        error: error,
        isAccurate: isAccurate,
        isDirectionCorrect: isDirectionCorrect,
        priceChangeRate: priceChangeRate,
        verified: true,
        verificationChartData: chartData.slice(-30)
      };
      
      // card2Data에 savedCardId가 있으면 업데이트, 없으면 새로 저장
      if (card2Data && card2Data.savedCardId) {
        updateCardInDatabase(card2Data.savedCardId, verificationData).then(result => {
          if (result && result.success) {
            console.log('✅ 카드2 검증 완료 업데이트:', card2Data.savedCardId);
          }
        });
      } else {
        // savedCardId가 없으면 card3로 새로 저장 (fallback)
        saveCardToDatabase('card3', {
          actualPrice: actualPrice,
          predictedPrice: predictedPrice,
          time: actualTime.toISOString(),
          error: error,
          isAccurate: isAccurate,
          isDirectionCorrect: isDirectionCorrect,
          nb_value: nbResult ? nbResult.nbValue : null,
          nb_max: nbResult ? nbResult.nbMax : null,
          nb_min: nbResult ? nbResult.nbMin : null,
          productionDate: productionDate.toISOString(),
          productionPrice: productionPrice,
          productionTimeframe: productionTimeframe,
          priceChangeRate: priceChangeRate,
          prices: closes.slice(-50),
          chartData: chartData && chartData.length > 0 ? chartData.slice(-30) : getCachedChartSlice(30)
        });
      }
    }
    
    // N/B max/min 값으로 카드 조회
    async function queryCardsByNB(nbMax, nbMin, limit = 10) {
      try {
        const response = await fetch(`${API_BASE_URL}/cards/chart-analysis/query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            nb_max: nbMax,
            nb_min: nbMin,
            limit: limit
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
          console.log(`✅ N/B 조회 완료: ${result.cards?.length || 0}개 카드 발견`);
          return result.cards || [];
        } else {
          console.error('❌ N/B 조회 실패:', result.error);
          return [];
        }
      } catch (error) {
        console.error('❌ N/B 조회 오류:', error);
        return [];
      }
    }
    
    // 최근 저장된 카드 N/B 값 캐시 (중복 방지용)
    const recentSavedCards = new Map(); // cardType -> {nbValue, nbMax, nbMin, timestamp}
    const CARD_DUPLICATE_WINDOW_MS = 60000; // 1분 내 동일 N/B 값 중복 방지

    // 카드를 N/B database에 저장하는 함수 (재시도 로직 포함)
    async function saveCardToDatabase(cardType, cardData, retryCount = 0) {
      const maxRetries = 2; // 최대 2번 재시도
      
      // card3(검증 완료 카드)는 중복 저장 허용
      if (cardType !== 'card3') {
        // card1, card2는 N/B 값 기반 중복 저장 방지
        const nbValue = cardData.nb_value;
        const nbMax = cardData.nb_max;
        const nbMin = cardData.nb_min;
        
        if (nbValue !== null && nbValue !== undefined && nbMax !== null && nbMin !== null) {
          const recent = recentSavedCards.get(cardType);
          const now = Date.now();
          
          if (recent && (now - recent.timestamp) < CARD_DUPLICATE_WINDOW_MS) {
            // N/B 값이 동일한지 확인 (소수점 8자리까지 비교)
            const isSameNB = Math.abs(recent.nbValue - nbValue) < 0.00000001 &&
                            Math.abs(recent.nbMax - nbMax) < 0.00000001 &&
                            Math.abs(recent.nbMin - nbMin) < 0.00000001;
            
            if (isSameNB) {
              console.warn(`⚠️ ${cardType} 중복 저장 방지: 동일한 N/B 값 (nb=${nbValue.toFixed(8)})`);
              return null;
            }
          }
          
          // 새로운 N/B 값 저장
          recentSavedCards.set(cardType, {
            nbValue,
            nbMax,
            nbMin,
            timestamp: now
          });
        }
      }
      
      // 중복 요청 방지 (API 호출 중복 방지)
      const saveKey = `${cardType}_${cardData.productionDate || Date.now()}`;
      if (activeRequests.saveCard.has(saveKey)) {
        console.warn(`⚠️ ${cardType} 저장 이미 진행 중, 중복 호출 무시`);
        return null;
      }
      
      activeRequests.saveCard.add(saveKey);
      
      try {
        console.log(`📡 ${cardType} 저장 요청 시작 (시도 ${retryCount + 1}/${maxRetries + 1}):`);
        console.log(`📦 카드 타입: ${cardType}`);
        console.log(`💾 저장 데이터:`, JSON.stringify(cardData).substring(0, 200) + '...');
        
        const payload = {
          card_type: cardType,
          card_data: cardData,
          timeframe: currentInterval
        };
        
        console.log(`📤 API 전송: ${API_BASE_URL}/cards/chart-analysis/save`);
        
        const response = await fetch(`${API_BASE_URL}/cards/chart-analysis/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(120000) // 120초 타임아웃 (카드 저장 지연 완화)
        });
        
        console.log(`📥 API 응답 수신: status=${response.status} (${response.statusText})`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ HTTP 에러! status: ${response.status}`);
          console.error(`❌ 응답 본문:`, errorText);
          
          // 재시도 가능한 에러인 경우 (타임아웃, 502, 503)
          if ((response.status === 502 || response.status === 503 || response.status === 408) && retryCount < maxRetries) {
            console.log(`⏳ ${2 * (retryCount + 1)}초 후 재시도...`);
            await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
            return saveCardToDatabase(cardType, cardData, retryCount + 1);
          }
          
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`📥 API 응답 JSON:`, result);
        
        if (result.success) {
          console.log(`✅ ${cardType} 저장 완료! card_id: ${result.card_id}`);
          
          // 중첩 카드 여부 표시
          const isOverlap = result.is_overlap || false;
          const badgeId = cardType === 'card1' ? 'card1TypeBadge' : 'card2TypeBadge';
          const badgeEl = document.getElementById(badgeId);
          
          if (badgeEl) {
            if (isOverlap) {
              badgeEl.textContent = '🔄 중첩 카드';
              badgeEl.style.display = 'inline-block';
              badgeEl.style.backgroundColor = '#9c27b0';
              badgeEl.style.color = '#fff';
              badgeEl.style.padding = '2px 8px';
              badgeEl.style.borderRadius = '4px';
              badgeEl.style.fontSize = '11px';
              badgeEl.style.marginLeft = '8px';
            } else {
              badgeEl.textContent = '✨ 새 카드';
              badgeEl.style.display = 'inline-block';
              badgeEl.style.backgroundColor = '#4caf50';
              badgeEl.style.color = '#fff';
              badgeEl.style.padding = '2px 8px';
              badgeEl.style.borderRadius = '4px';
              badgeEl.style.fontSize = '11px';
              badgeEl.style.marginLeft = '8px';
            }
          }
          return result;
        } else {
          console.error(`❌ ${cardType} 저장 실패! 오류:`, result.error);
          throw new Error(`API says: ${result.error}`);
        }
      } catch (error) {
        console.error(`❌ ${cardType} 저장 오류 (시도 ${retryCount + 1}/${maxRetries + 1}):`, error.message || error);
        
        // 네트워크 에러나 타임아웃인 경우 재시도
        if (retryCount < maxRetries && (error.name === 'AbortError' || error instanceof TypeError)) {
          console.log(`⏳ 네트워크 오류, ${2 * (retryCount + 1)}초 후 재시도...`);
          await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)));
          return saveCardToDatabase(cardType, cardData, retryCount + 1);
        }
        
        // 모든 재시도 실패 시에도 카드 생성은 계속 진행
        console.warn(`⚠️ ${cardType} 저장 최종 실패, 카드는 로컬에만 유지됨`);
        return null;
      } finally {
        // 플래그 해제
        const saveKey = `${cardType}_${cardData.productionDate || Date.now()}`;
        activeRequests.saveCard.delete(saveKey);
      }
    }
    
    // 카드 업데이트 함수 (검증 완료 시 사용)
    async function updateCardInDatabase(cardId, updateData) {
      // 중복 업데이트 방지
      if (activeRequests.updateCard.has(cardId)) {
        console.warn(`⚠️ 카드 ${cardId} 업데이트 이미 진행 중, 중복 호출 무시`);
        return null;
      }
      
      activeRequests.updateCard.add(cardId);
      
      try {
        const response = await fetch(`${API_BASE_URL}/cards/${cardId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success) {
          console.log(`✅ 카드 업데이트 완료:`, cardId);
          return result;
        } else {
          console.error(`❌ 카드 업데이트 실패:`, result.error);
          return null;
        }
      } catch (error) {
        console.error(`❌ 카드 업데이트 오류:`, error);
        return null;
      } finally {
        activeRequests.updateCard.delete(cardId);
      }
    }
    
    // 구역 판단 함수 (N/B 값 기반)
    // ORANGE: 매도가 강한 구역 (r >= 0.5 또는 HIGH = 0.60 이상)
    // BLUE: 매수가 강한 구역 (r < 0.5 또는 LOW = 0.40 이하)
    function determineZone(nbValue, previousZone = null) {
      if (nbValue === null || nbValue === undefined) {
        return previousZone || 'UNKNOWN';
      }
      
      const HIGH = 0.60;
      const LOW = 0.40;
      
      // 히스테리시스 적용 (이전 구역이 있으면)
      if (previousZone === 'BLUE') {
        // BLUE에서 HIGH 이상이면 ORANGE로 전환
        if (nbValue >= HIGH) {
          return 'ORANGE';
        }
        return 'BLUE';
      } else if (previousZone === 'ORANGE') {
        // ORANGE에서 LOW 이하면 BLUE로 전환
        if (nbValue <= LOW) {
          return 'BLUE';
        }
        return 'ORANGE';
      } else {
        // 이전 구역이 없으면 초기 판단
        return nbValue >= 0.5 ? 'ORANGE' : 'BLUE';
      }
    }
    
    // 구역 이름 한글 변환
    function getZoneName(zone) {
      if (zone === 'ORANGE') {
        return '🍊 ORANGE (매도 강한 구역)';
      } else if (zone === 'BLUE') {
        return '🔵 BLUE (매수 강한 구역)';
      }
      return '❓ UNKNOWN';
    }
    
    // 구역 색상 반환
    function getZoneColor(zone) {
      if (zone === 'ORANGE') {
        return '#ff9800'; // 주황색
      } else if (zone === 'BLUE') {
        return '#2196f3'; // 파란색
      }
      return '#9aa0a6'; // 회색
    }
    
    // 카드용 N/B 값 계산 함수
    function calculateNBValueForCard(data) {
      try {
        // 가격 배열 추출
        const prices = data.map(item => parseFloat(item.close));
        
        if (!prices || prices.length < 2) {
          console.warn('카드 N/B 계산: 가격 데이터가 부족합니다.');
          return null;
        }
        
        // 가격 변화율 배열 생성 (N/B 계산용)
        const priceChanges = [];
        for (let i = 1; i < prices.length; i++) {
          if (prices[i-1] > 0) {
            const change = (prices[i] - prices[i-1]) / prices[i-1];
            priceChanges.push(change);
          }
        }
        
        if (priceChanges.length < 2) {
          console.warn('카드 N/B 계산: 가격 변화율 데이터가 부족합니다.');
          return null;
        }
        
        // BIT_MAX_NB, BIT_MIN_NB 계산 (기존 방식)
        const bit = 5.5; // 기본값
        const bitMax = BIT_MAX_NB(priceChanges, bit);
        const bitMin = BIT_MIN_NB(priceChanges, bit);
        
        // 0~1 범위로 정규화
        const nbMax = Math.max(0.0, Math.min(1.0, bitMax / 10.0));
        const nbMin = Math.max(0.0, Math.min(1.0, bitMin / 10.0));
        const nbValue = (nbMax + nbMin) / 2.0;
        
        return {
          nbValue: nbValue,
          nbMax: nbMax,
          nbMin: nbMin,
          bitMax: bitMax,
          bitMin: bitMin
        };
      } catch (error) {
        console.error('카드 N/B 값 계산 실패:', error);
        return null;
      }
    }
    
    // N/B 값 계산 (기존 index.html 방식 사용)
    function calculateNBValue(data) {
      // N/B 처리 프로그레스 시작
      showNBProgress('N/B 데이터 로딩 중...', 20);
      
      try {
        // 우선: 좌측 메인 차트에서 저장한 캐시를 사용 (localStorage: mainChartCache)
        let prices = null;
        try {
          const cacheStr = localStorage.getItem('mainChartCache');
          if (cacheStr) {
            const cache = JSON.parse(cacheStr);
            if (cache && Array.isArray(cache.prices) && cache.prices.length > 0) {
              prices = cache.prices.map(p => typeof p === 'object' && p.close !== undefined ? parseFloat(p.close) : parseFloat(p));
              console.log('✅ calculateNBValue: mainChartCache 사용, 가격 개수=', prices.length);
            }
          }
        } catch (e) {
          console.warn('⚠️ mainChartCache 파싱 실패, 로컬 데이터 사용:', e);
        }

        // 캐시가 없으면 전달된 데이터에서 추출
        if (!prices) {
          prices = data.map(item => parseFloat(item.close));
        }
        
        // 프로그레스 업데이트
        showNBProgress('가격 데이터 추출 완료', 40);

        if (!prices || prices.length < 2) {
          console.warn('N/B 계산: 가격 데이터가 부족합니다.');
          hideNBProgress();
          // UI에 빈값 표시
          const nbCurrentPriceEl = document.getElementById('nbCurrentPrice');
          const nbUsedDataEl = document.getElementById('nbUsedData');
          if (nbCurrentPriceEl) nbCurrentPriceEl.textContent = '-';
          if (nbUsedDataEl) nbUsedDataEl.textContent = '-';
          return;
        }
        
        // 가격 변화율 배열 생성 (N/B 계산용)
        const priceChanges = [];
        for (let i = 1; i < prices.length; i++) {
          if (prices[i-1] > 0) {
            const change = (prices[i] - prices[i-1]) / prices[i-1];
            priceChanges.push(change);
          }
        }
        
        // 프로그레스 업데이트
        showNBProgress('가격 변화율 계산 완료', 60);
        
        if (priceChanges.length < 2) {
          console.warn('N/B 계산: 가격 변화율 데이터가 부족합니다.');
          hideNBProgress();
          return;
        }
        
        // BIT_MAX_NB, BIT_MIN_NB 계산 (기존 방식)
        const bit = 5.5; // 기본값
        const bitMax = BIT_MAX_NB(priceChanges, bit);
        const bitMin = BIT_MIN_NB(priceChanges, bit);
        
        // 프로그레스 업데이트
        showNBProgress('N/B MAX/MIN 계산 중...', 80);
        
        // 0~1 범위로 정규화
        const nbMax = Math.max(0.0, Math.min(1.0, bitMax / 10.0));
        const nbMin = Math.max(0.0, Math.min(1.0, bitMin / 10.0));
        const nbValue = (nbMax + nbMin) / 2.0;
        
        // N/B 값 UI 업데이트 (BIT 표시 제거)
        const decimalPlaces = 10;
        const nbIntervalEl = document.getElementById('nbInterval');
        const nbValueEl = document.getElementById('nbValue');
        const nbMaxEl = document.getElementById('nbMax');
        const nbMinEl = document.getElementById('nbMin');
        const nbCurrentPriceEl = document.getElementById('nbCurrentPrice');
        const nbUsedDataEl = document.getElementById('nbUsedData');

        // 분봉 정보 표시
        if (nbIntervalEl) {
          const intervalName = getTimeframeName(currentInterval);
          nbIntervalEl.textContent = intervalName || currentInterval;
        }

        if (nbValueEl) nbValueEl.textContent = nbValue.toFixed(decimalPlaces);
        if (nbMaxEl) nbMaxEl.textContent = nbMax.toFixed(decimalPlaces);
        if (nbMinEl) nbMinEl.textContent = nbMin.toFixed(decimalPlaces);

        // N/B 프로그레스바 업데이트
        const nbMinLabel = document.getElementById('nbMinLabel');
        const nbMaxLabel = document.getElementById('nbMaxLabel');
        const nbValueMarker = document.getElementById('nbValueMarker');
        const nbValueLabel = document.getElementById('nbValueLabel');
        const nbRangeFill = document.getElementById('nbRangeFill');

        if (nbMinLabel) nbMinLabel.textContent = nbMin.toFixed(4);
        if (nbMaxLabel) nbMaxLabel.textContent = nbMax.toFixed(4);

        // N/B 값이 0~1 범위에서 어디에 위치하는지 계산 (퍼센트)
        const nbPosition = nbValue * 100; // 0~100%
        
        if (nbValueMarker) {
          nbValueMarker.style.left = `${nbPosition}%`;
        }
        
        if (nbValueLabel) {
          nbValueLabel.style.left = `${nbPosition}%`;
          nbValueLabel.textContent = `N/B: ${nbValue.toFixed(4)}`;
        }

        // MIN~MAX 범위 바 표시
        const rangeStart = nbMin * 100; // MIN 시작 위치 (%)
        const rangeWidth = (nbMax - nbMin) * 100; // MIN~MAX 폭 (%)
        
        if (nbRangeFill) {
          nbRangeFill.style.left = `${rangeStart}%`;
          nbRangeFill.style.width = `${rangeWidth}%`;
        }

        // 현재 가격 (마지막 캔들 가격)
        try {
          const lastPrice = prices[prices.length - 1];
          if (nbCurrentPriceEl) nbCurrentPriceEl.textContent = lastPrice !== undefined && lastPrice !== null ? (typeof lastPrice === 'number' ? lastPrice.toLocaleString() : String(lastPrice)) : '-';
        } catch (e) {
          if (nbCurrentPriceEl) nbCurrentPriceEl.textContent = '-';
        }

        // 사용된 차트 데이터 전체 표시 (간단화: 인덱스+가격)
        try {
          if (nbUsedDataEl) {
            const used = prices.map((p, i) => ({index: i, price: p}));
            nbUsedDataEl.textContent = JSON.stringify(used, null, 2);
          }
        } catch (e) {
          if (nbUsedDataEl) nbUsedDataEl.textContent = '-';
        }

        console.log('✅ N/B 값 계산 완료:', {
          nb_value: nbValue,
          nb_max: nbMax,
          nb_min: nbMin,
          used_count: prices.length
        });
        
        // 프로그레스 완료
        showNBProgress('N/B 계산 완료', 100);
        setTimeout(() => hideNBProgress(), 500);
        
      } catch (error) {
        console.error('N/B 값 계산 실패:', error);
        hideNBProgress();
        // 오류 시 기본값 표시
        document.getElementById('nbValue').textContent = '-';
        document.getElementById('nbMax').textContent = '-';
        document.getElementById('nbMin').textContent = '-';
        
        // 프로그레스바도 초기화
        const nbValueMarker = document.getElementById('nbValueMarker');
        const nbValueLabel = document.getElementById('nbValueLabel');
        const nbRangeFill = document.getElementById('nbRangeFill');
        const nbMinLabel = document.getElementById('nbMinLabel');
        const nbMaxLabel = document.getElementById('nbMaxLabel');
        
        if (nbValueMarker) nbValueMarker.style.left = '0%';
        if (nbValueLabel) {
          nbValueLabel.style.left = '0%';
          nbValueLabel.textContent = 'N/B: -';
        }
        if (nbRangeFill) {
          nbRangeFill.style.left = '0%';
          nbRangeFill.style.width = '0%';
        }
        if (nbMinLabel) nbMinLabel.textContent = '0.0';
        if (nbMaxLabel) nbMaxLabel.textContent = '1.0';
      }
    }
    
    // 분봉 순회 시작
    function startTimeframeCycle() {
      if (cycleInterval) {
        clearInterval(cycleInterval);
      }
      
      cycleInterval = setInterval(() => {
        if (cycleMode) {
          // 다음 분봉으로 이동
          currentTimeframeIndex = (currentTimeframeIndex + 1) % timeframes.length;
          const nextInterval = timeframes[currentTimeframeIndex];
          
          // 선택 박스 업데이트
          const timeframeSelect = document.getElementById('timeframe');
          if (timeframeSelect) {
            timeframeSelect.value = nextInterval;
            currentInterval = nextInterval;
            loadChartData();
            
            // 분봉 변경 시 검증 완료 카드도 현재 분봉에 맞게 업데이트
            renderVerifiedCardsLocal('verifiedCardsContainer');
          }
        }
      }, cycleIntervalMs);
    }
    
    // 분봉 순회 중지
    function stopTimeframeCycle() {
      if (cycleInterval) {
        clearInterval(cycleInterval);
        cycleInterval = null;
      }
    }
    
    // 카드 2 검증 (더 이상 사용하지 않음 - createCard3로 대체)
    function verifyCard2(currentData, allData) {
      // createCard3로 대체됨
      createCard3(currentData, allData);
      if (!card2Prediction || !card2) return;
      
      const predictedPrice = card2Prediction.predictedPrice;
      const actualPrice = card2.actualPrice;
      
      // 오차 계산
      const error = Math.abs(actualPrice - predictedPrice) / predictedPrice * 100;
      const errorRate = ((actualPrice - predictedPrice) / predictedPrice * 100);
      
      // 검증 결과
      const isAccurate = error < 2.0; // 2% 이내면 정확
      const isDirectionCorrect = (actualPrice > card1Data.price && predictedPrice > card1Data.price) ||
                                  (actualPrice < card1Data.price && predictedPrice < card1Data.price);
      
      // 검증 UI 업데이트
      document.getElementById('card2Error').textContent = error.toFixed(2) + '%';
      document.getElementById('card2Error').style.color = error < 2 ? '#0ecb81' : error < 5 ? '#ffc107' : '#f6465d';
      
      const verificationSection = document.getElementById('card2Verification');
      verificationSection.style.display = 'block';
      
      const verificationIcon = document.getElementById('verificationIcon');
      const verificationText = document.getElementById('verificationText');
      const verificationDetails = document.getElementById('verificationDetails');
      const accuracyBadge = document.getElementById('accuracyBadge');
      
      if (isAccurate && isDirectionCorrect) {
        verificationIcon.textContent = '✅';
        verificationText.textContent = '예측 성공';
        verificationText.className = 'verification-text correct';
        verificationDetails.textContent = 
          `예측: ${predictedPrice.toLocaleString()}원 | 실제: ${actualPrice.toLocaleString()}원\n` +
          `오차: ${error.toFixed(2)}% | 방향: ${isDirectionCorrect ? '정확' : '오류'}`;
        accuracyBadge.textContent = '높은 정확도';
        accuracyBadge.className = 'accuracy-badge high';
        accuracyBadge.style.display = 'block';
      } else if (isDirectionCorrect) {
        verificationIcon.textContent = '⚠️';
        verificationText.textContent = '방향 정확';
        verificationText.className = 'verification-text correct';
        verificationDetails.textContent = 
          `예측: ${predictedPrice.toLocaleString()}원 | 실제: ${actualPrice.toLocaleString()}원\n` +
          `오차: ${error.toFixed(2)}% | 방향: 정확`;
        accuracyBadge.textContent = '중간 정확도';
        accuracyBadge.className = 'accuracy-badge medium';
        accuracyBadge.style.display = 'block';
      } else {
        verificationIcon.textContent = '❌';
        verificationText.textContent = '예측 실패';
        verificationText.className = 'verification-text incorrect';
        verificationDetails.textContent = 
          `예측: ${predictedPrice.toLocaleString()}원 | 실제: ${actualPrice.toLocaleString()}원\n` +
          `오차: ${error.toFixed(2)}% | 방향: 오류`;
        accuracyBadge.textContent = '낮은 정확도';
        accuracyBadge.className = 'accuracy-badge low';
        accuracyBadge.style.display = 'block';
      }
      
      // 통계 업데이트
      predictionHistory.push({
        predicted: predictedPrice,
        actual: actualPrice,
        error: error,
        isAccurate: isAccurate && isDirectionCorrect
      });
      
      const successCount = predictionHistory.filter(p => p.isAccurate).length;
      const totalCount = predictionHistory.length;
      const accuracy = totalCount > 0 ? (successCount / totalCount * 100).toFixed(1) : 0;
      
      document.getElementById('predictionCount').textContent = totalCount;
      document.getElementById('successCount').textContent = successCount;
      document.getElementById('overallAccuracy').textContent = accuracy + '%';
      
      // 카드 2 상태 업데이트
      document.getElementById('card2').classList.remove('active');
      document.getElementById('card2').classList.add('verified');
      document.getElementById('card2Status').textContent = '검증됨';
      document.getElementById('card2Status').className = 'card-status verified';
    }
    
    // 이벤트 리스너
    // 모델 학습 버튼 제거 (자동 학습만 사용)
    
    // 학습된 모델 확인 버튼 이벤트 리스너
    const btnCheckTrainedModel = document.getElementById('btnCheckTrainedModel');
    if (btnCheckTrainedModel) {
      btnCheckTrainedModel.addEventListener('click', () => {
        checkTrainedModel();
      });
    }
    
    document.getElementById('timeframe').addEventListener('change', (e) => {
      currentInterval = e.target.value;
      // 현재 인덱스 업데이트
      currentTimeframeIndex = timeframes.indexOf(currentInterval);
      if (currentTimeframeIndex === -1) currentTimeframeIndex = 3;
      loadChartData();
      
      // 분봉 변경 시 검증 완료 카드도 현재 분봉에 맞게 업데이트
      renderVerifiedCardsLocal('verifiedCardsContainer');
    });
    
    document.getElementById('btnReset').addEventListener('click', () => {
      if (chart) {
        chart.timeScale().fitContent();
      }
    });
    
    // 분봉 순회 모드 토글
    document.getElementById('cycleMode').addEventListener('change', (e) => {
      cycleMode = e.target.checked;
      if (cycleMode) {
        startTimeframeCycle();
        console.log('✅ 분봉 자동 순회 시작');
      } else {
        stopTimeframeCycle();
        console.log('⏸️ 분봉 자동 순회 중지');
      }
    });
    
    // 분봉 순회 간격 변경
    document.getElementById('cycleInterval').addEventListener('change', (e) => {
      const intervalSeconds = parseInt(e.target.value);
      if (intervalSeconds >= 10 && intervalSeconds <= 300) {
        cycleIntervalMs = intervalSeconds * 1000;
        if (cycleMode) {
          stopTimeframeCycle();
          startTimeframeCycle();
        }
        console.log(`🔄 분봉 순회 간격: ${intervalSeconds}초`);
      } else {
        e.target.value = 30;
        cycleIntervalMs = 30000;
      }
    });
    
    // 전역 함수 노출 (onclick 핸들러에서 사용)
    window.updateBalance = updateBalance;
    window.handleCardBuy = handleCardBuy;
    window.switchBoughtCardsTab = switchBoughtCardsTab;
    
    // 초기화
    window.addEventListener('load', async () => {
      // 진행 추적 초기화
      initProgressTracker('progressTracker');
      resetProgress();
      
      // API 연결 확인
      const isConnected = await checkAPIConnection();
      if (!isConnected) {
        const container = document.getElementById('tvChart');
        if (container) {
          container.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #f6465d; flex-direction: column; gap: 12px;">
              <div style="font-size: 24px;">⚠️</div>
              <div style="font-size: 14px; text-align: center; padding: 0 20px;">
                API 서버에 연결할 수 없습니다.<br/>
                서버가 실행 중인지 확인하세요.<br/>
                <small style="color: #9aa0a6; margin-top: 8px; display: block;">${API_BASE_URL}</small>
                <button onclick="location.reload()" style="margin-top: 12px; padding: 8px 16px; background: #2b3139; color: #e6eefc; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; cursor: pointer;">
                  다시 시도
                </button>
              </div>
            </div>
          `;
        }
        return;
      }
      
      // 저장된 데이터 복원
      restoreAnalysisData();
      
      initChart();
      
      // 초기 히스토리 영역 렌더링
      setTimeout(() => {
        updateTimeframeHistory();
      }, 1000);
      
      // 초기 매수된 카드 영역 렌더링
      renderBoughtCards();
      
      // 초기 트레이드 완료된 카드 영역 렌더링
      renderCompletedTrades();
      
      // 초기 매수 버튼 상태 업데이트
      setTimeout(() => {
        updateCardBuyButtons();
      }, 200);
      
      // 초기 검증 완료된 카드 영역 렌더링 (요소가 준비된 후)
      // verifiedCardsContainer 요소가 준비될 때까지 약간의 지연 후 렌더링
      setTimeout(() => {
        renderVerifiedCardsLocal('verifiedCardsContainer');
        console.log('✅ 검증 완료 카드 렌더링 완료:', {
          count: verifiedCards.length,
          containerExists: !!document.getElementById('verifiedCardsContainer')
        });
      }, 100);
      
      // 초기 AI 학습 상태 표시 업데이트
      setTimeout(() => {
        updateAILearningStatusDisplay();
      }, 200);
      
      // 자산 정보 업데이트 시작
      startBalanceUpdate();
      
      // 분봉 순회 모드 기본 활성화
      const cycleModeCheckbox = document.getElementById('cycleMode');
      if (cycleModeCheckbox) {
        cycleModeCheckbox.checked = true;
        cycleMode = true;
        startTimeframeCycle();
      }
      
      // 주기적 업데이트 (30초마다) - 현재 선택된 분봉 (빈도 감소)
      updateInterval = setInterval(() => {
        if (!activeRequests.loadChartData) {
          //loadChartData();
        } else {
          console.log('⏭️ 차트 데이터 로드 진행 중, 업데이트 건너뜀');
        }
      }, 30000);
      
      // 모든 분봉에서 카드 생산 (각 분봉별로 독립적으로)
      // 1분봉: 1분마다, 3분봉: 3분마다, 5분봉: 5분마다 등
      startAllTimeframeCardProduction();
      
      // 페이지 로드 시 학습된 모델 자동 확인 및 자동 학습
      setTimeout(async () => {
        try {
          await checkTrainedModel();
          
          // 모델이 없고 데이터가 충분하면 자동 학습 시작
          if (!globalModelTrained && !isTrainingInProgress && cachedChartData && cachedChartData.length >= 200) {
            console.log('🔄 초기 로드: 모델이 없어 자동 학습 시작...');
            try {
              await trainAIModelAuto(cachedChartData);
              console.log('✅ 자동 학습 완료');
            } catch (err) {
              console.warn('⚠️ 초기 자동 학습 실패:', err);
            }
          } else if (!globalModelTrained) {
            console.log(`⏸️ 자동 학습 대기 중... (데이터: ${cachedChartData?.length || 0}/200개)`);
          }
        } catch (err) {
          console.warn('⚠️ 모델 확인 실패:', err);
        }
      }, 3000); // 3초 후 확인 (차트 로드 완료 대기)
    });
    
    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      stopBalanceUpdate();
      stopTimeframeCycle();
      // 페이지 종료 시 즉시 저장
      saveAnalysisData(true);
    });
    
    // 카드 고유 식별자 생성 (중복 매수 방지용)
    function getCardUniqueId(cardData, cardId) {
      if (!cardData) return null;
      const productionDate = cardData.productionDate ? new Date(cardData.productionDate).toISOString() : '';
      const timeframe = cardData.productionTimeframe || currentInterval;
      const predictedPrice = cardData.predictedPrice || '';
      // productionDate, timeframe, predictedPrice를 조합하여 고유 ID 생성
      return `${cardId}-${timeframe}-${productionDate}-${predictedPrice}`;
    }
    
    // 카드가 이미 매수되었는지 확인
    function isCardAlreadyBought(cardData, cardId) {
      if (!cardData) return false;
      const uniqueId = getCardUniqueId(cardData, cardId);
      if (!uniqueId) return false;
      
      // 매수된 카드 중에서 같은 고유 ID를 가진 카드가 있는지 확인
      // boughtCard에 uniqueId가 저장되어 있으면 그것을 사용, 없으면 계산
      return boughtCards.some(boughtCard => {
        if (boughtCard.uniqueId) {
          return boughtCard.uniqueId === uniqueId;
        }
        // 기존 매수된 카드(uniqueId가 없는 경우)는 계산하여 비교
        const boughtUniqueId = getCardUniqueId(boughtCard, boughtCard.cardId);
        return boughtUniqueId === uniqueId;
      });
    }
    
    // 카드 매수 처리 (실제 거래)
    async function handleCardBuy(cardId) {
      let cardData = null;
      let cardType = '';
      
      if (cardId === 'card2' && card2Data) {
        cardData = card2Data;
        cardType = '현재 카드';
      } else if (cardId === 'card3' && card3Data) {
        cardData = card3Data;
        cardType = '검증 완료 카드';
      } else {
        alert('매수할 수 있는 카드가 없습니다.');
        return;
      }
      
      // 이미 매수된 카드인지 확인
      if (isCardAlreadyBought(cardData, cardId)) {
        alert('이미 매수된 카드입니다. 같은 카드는 한 번만 매수할 수 있습니다.');
        return;
      }
      
      // NBVerse에서 저장된 카드 정보 조회 (optional)
      if (cardData.savedCardId) {
        try {
          console.log('🔍 NBVerse에서 저장된 카드 조회:', cardData.savedCardId);
          const queryResponse = await fetch(`${API_BASE_URL}/cards/${cardData.savedCardId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (queryResponse.ok) {
            const queryResult = await queryResponse.json();
            console.log('✅ NBVerse 카드 조회 완료:', queryResult);
            
            // 저장된 정보로 카드 데이터 병합
            const savedData = queryResult.card || queryResult.card_data || queryResult;
            if (savedData) {
              cardData = {
                ...cardData,
                ...savedData,
                savedCardId: cardData.savedCardId
              };
              console.log('✅ 카드 데이터 병합 완료');
            }
          } else {
            console.log('⚠️ NBVerse 조회 실패 (404 - 첫 생성 카드):', queryResponse.status);
          }
        } catch (error) {
          console.log('⚠️ NBVerse 조회 중 오류 (계속 진행):', error);
        }
      }
      
      // 설정된 매수 금액 사용
      const amount = defaultBuyAmount;
      
      if (amount < 5000) {
        alert('최소 매수 금액은 5,000원입니다.');
        return;
      }
      
      try {
        // 실제 매수 API 호출
        const response = await fetch(`${API_BASE_URL}/trade/buy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            market: 'KRW-BTC',
            price: amount
          })
        });
        
        const result = await response.json();
        
        if (!response.ok || !result.success) {
          alert(`매수 실패: ${result.error || '알 수 없는 오류'}`);
          return;
        }
        
        // 현재 가격 가져오기
        const currentPrice = cardData.price || cardData.actualPrice || 0;
        const qty = amount / currentPrice;
        
        // 매수된 카드 정보 생성
        const boughtCard = {
          id: `bought-${Date.now()}`,
          cardId: cardId,
          cardType: cardType,
          uniqueId: getCardUniqueId(cardData, cardId), // 고유 ID 저장
          timeframe: cardData.productionTimeframe || currentInterval,
          timeframeName: getTimeframeName(cardData.productionTimeframe || currentInterval),
          buyPrice: currentPrice,
          buyAmount: amount,
          qty: qty,
          buyTime: new Date().toISOString(),
          productionDate: cardData.productionDate || new Date(),
          productionPrice: cardData.productionPrice || cardData.price || 0,
          predictedPrice: cardData.predictedPrice || card1Prediction?.predictedPrice || null,
          actualPrice: cardData.actualPrice || cardData.price || null,
          nbValue: cardData.nbValue || null,
          nbMax: cardData.nbMax || null,
          nbMin: cardData.nbMin || null,
          emaFast: cardData.emaFast || null,
          emaSlow: cardData.emaSlow || null,
          predictedZone: cardData.predictedZone || card1Prediction?.predictedZone || null,
          actualZone: cardData.actualZone || null,
          confidence: (cardData.prediction && cardData.prediction.confidence) || card1Prediction?.confidence || null,
          chartData: cardData.chartData || cardData.data || [],
          error: cardData.error || null,
          orderUuid: result.uuid || null,
          savedCardId: cardData.savedCardId || null  // NBVerse 저장 ID 저장
        };
        
        // 매수된 카드 목록에 추가
        boughtCards.push(boughtCard);
        
        // 매수된 카드 영역 업데이트
        renderBoughtCards();
        
        // 매수 버튼 상태 업데이트
        updateCardBuyButtons();
        
        // localStorage에 저장
        saveAnalysisData();
        
        alert(`✅ 매수 완료!\n금액: ${amount.toLocaleString()}원\n수량: ${qty.toFixed(8)} BTC`);
        console.log('✅ 카드 매수 완료:', boughtCard);
      } catch (error) {
        console.error('❌ 매수 오류:', error);
        alert(`매수 중 오류가 발생했습니다: ${error.message}`);
      }
    }
    
    // 매수 버튼 상태 업데이트 (매수된 카드는 버튼 비활성화)
    function updateCardBuyButtons() {
      // card2 매수 버튼 업데이트
      const card2BuyBtn = document.querySelector('#card2 .card-actions button');
      if (card2BuyBtn && card2Data) {
        if (isCardAlreadyBought(card2Data, 'card2')) {
          card2BuyBtn.disabled = true;
          card2BuyBtn.textContent = '이미 매수됨';
          card2BuyBtn.style.opacity = '0.5';
          card2BuyBtn.style.cursor = 'not-allowed';
        } else {
          card2BuyBtn.disabled = false;
          card2BuyBtn.textContent = '매수';
          card2BuyBtn.style.opacity = '1';
          card2BuyBtn.style.cursor = 'pointer';
        }
      }
      
      // card3 매수 버튼 업데이트
      const card3BuyBtn = document.querySelector('#card3 .card-actions button');
      if (card3BuyBtn && card3Data) {
        if (isCardAlreadyBought(card3Data, 'card3')) {
          card3BuyBtn.disabled = true;
          card3BuyBtn.textContent = '이미 매수됨';
          card3BuyBtn.style.opacity = '0.5';
          card3BuyBtn.style.cursor = 'not-allowed';
        } else {
          card3BuyBtn.disabled = false;
          card3BuyBtn.textContent = '매수';
          card3BuyBtn.style.opacity = '1';
          card3BuyBtn.style.cursor = 'pointer';
        }
      }
    }
    
    // 매수된 카드 렌더링
    function renderBoughtCards() {
      const container = document.getElementById('boughtCardsContainer');
      if (!container) return;
      
      // 매수 가격 설정 영역 추가
      let html = `
        <div style="background: rgba(14, 203, 129, 0.1); border: 1px solid rgba(14, 203, 129, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <label style="color: #0ecb81; font-size: 12px; font-weight: 600; white-space: nowrap;">매수 가격 설정:</label>
            <input 
              type="number" 
              id="defaultBuyAmountInput" 
              value="${defaultBuyAmount}" 
              min="5000"
              step="1000"
              style="flex: 1; background: rgba(14, 203, 129, 0.15); border: 1px solid rgba(14, 203, 129, 0.4); border-radius: 4px; padding: 6px 10px; color: #0ecb81; font-size: 13px; text-align: right;"
              onchange="updateDefaultBuyAmount(this.value)"
              onblur="updateDefaultBuyAmount(this.value)"
            />
            <span style="color: #0ecb81; font-size: 12px; white-space: nowrap;">원</span>
          </div>
        </div>
      `;
      
      if (boughtCards.length === 0) {
        html += '<div style="color: #9aa0a6; text-align: center; padding: 20px;">매수된 카드가 없습니다.</div>';
        container.innerHTML = html;
        return;
      }
      
      container.innerHTML = html;
      
      boughtCards.forEach((boughtCard, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'bought-card card';
        cardEl.id = boughtCard.id;
        cardEl.style.textAlign = 'left';
        
        const buyTime = new Date(boughtCard.buyTime);
        const productionTime = new Date(boughtCard.productionDate);

        // 손익 계산 시 카드2의 최신 현재가를 우선 사용 (현재 카드 매수 기준)
        const latestCard2Price = (boughtCard.cardId === 'card2' && card2Data && card2Data.price) ? card2Data.price : null;
        const referencePrice = (latestCard2Price || boughtCard.actualPrice || boughtCard.predictedPrice || boughtCard.buyPrice || 0);
        const costBasis = boughtCard.buyPrice * (boughtCard.qty || 0);
        const currentValue = referencePrice * (boughtCard.qty || 0);
        const pnl = currentValue - costBasis;
        const pnlRate = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
        
        cardEl.innerHTML = `
          <div class="card-header">
            <div class="card-title">${boughtCard.cardType}</div>
            <div class="card-status verified">매수됨</div>
          </div>
          <div class="card-content">
            <div class="card-item">
              <div class="card-item-label">요약</div>
              <div class="card-item-value" style="display: flex; flex-wrap: wrap; gap: 6px;">
                <span style="background: rgba(95, 99, 104, 0.15); color: #e6eefc; border: 1px solid rgba(95, 99, 104, 0.3); padding: 4px 8px; border-radius: 6px; font-weight: 600;">${boughtCard.cardId === 'card3' ? '검증 완료' : '현재 카드'}</span>
                <span style="background: rgba(14, 203, 129, 0.15); color: #0ecb81; border: 1px solid rgba(14, 203, 129, 0.3); padding: 4px 8px; border-radius: 6px; font-weight: 600;">분봉 ${boughtCard.timeframeName}</span>
                <span style="background: rgba(14, 203, 129, 0.1); color: #0ecb81; border: 1px solid rgba(14, 203, 129, 0.25); padding: 4px 8px; border-radius: 6px;">매수가 ${boughtCard.buyPrice.toLocaleString()} 원</span>
                ${boughtCard.predictedPrice ? `<span style="background: rgba(66, 133, 244, 0.1); color: #4285f4; border: 1px solid rgba(66, 133, 244, 0.25); padding: 4px 8px; border-radius: 6px;">예측 ${boughtCard.predictedPrice.toLocaleString()} 원</span>` : ''}
                ${boughtCard.actualPrice ? `<span style="background: rgba(66, 133, 244, 0.1); color: #4285f4; border: 1px solid rgba(66, 133, 244, 0.25); padding: 4px 8px; border-radius: 6px;">현재 ${boughtCard.actualPrice.toLocaleString()} 원</span>` : ''}
                ${boughtCard.nbValue !== null && boughtCard.nbValue !== undefined ? `<span style="background: rgba(154, 160, 166, 0.12); color: #5f6368; border: 1px solid rgba(154, 160, 166, 0.3); padding: 4px 8px; border-radius: 6px;">N/B ${boughtCard.nbValue.toFixed(4)}</span>` : ''}
                ${boughtCard.predictedZone ? `<span style="background: rgba(66, 133, 244, 0.1); color: ${getZoneColor(boughtCard.predictedZone)}; border: 1px solid rgba(66, 133, 244, 0.25); padding: 4px 8px; border-radius: 6px;">구역 ${getZoneName(boughtCard.predictedZone)}</span>` : ''}
              </div>
            </div>
            <div class="card-item">
              <div class="card-item-label">분봉</div>
              <div class="card-item-value">${boughtCard.timeframeName}</div>
            </div>
            <div class="card-item">
              <div class="card-item-label">매수가</div>
              <input 
                type="number" 
                id="buyPrice-${boughtCard.id}" 
                class="card-item-value buy-price-input" 
                value="${boughtCard.buyPrice}" 
                style="color: #0ecb81; background: rgba(14, 203, 129, 0.1); border: 1px solid rgba(14, 203, 129, 0.3); border-radius: 4px; padding: 4px 8px; width: 150px; text-align: right;"
                min="0"
                step="1000"
                onchange="updateBoughtCardPrice('${boughtCard.id}', this.value)"
                onblur="updateBoughtCardPrice('${boughtCard.id}', this.value)"
              />
              <span style="color: #0ecb81; margin-left: 4px;">원</span>
            </div>
            <div class="card-item">
              <div class="card-item-label">매수 수량</div>
              <div class="card-item-value">${boughtCard.qty ? boughtCard.qty.toFixed(8) : '-'} BTC</div>
            </div>
            ${(boughtCard.qty && referencePrice) ? `
            <div class="card-item">
              <div class="card-item-label">현재 손익</div>
              <div class="card-item-value" style="font-weight: 700; color: ${pnl >= 0 ? '#0ecb81' : '#f6465d'};">
                ${pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { maximumFractionDigits: 0 })} 원 (${pnlRate >= 0 ? '+' : ''}${pnlRate.toFixed(2)}%)
              </div>
            </div>
            ` : ''}
            <div class="card-item">
              <div class="card-item-label">매수 시간</div>
              <div class="card-item-value">${buyTime.toLocaleString('ko-KR', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</div>
            </div>
            ${boughtCard.predictedPrice ? `
            <div class="card-item">
              <div class="card-item-label">예측 가격</div>
              <div class="card-item-value">${boughtCard.predictedPrice.toLocaleString()} 원</div>
            </div>
            ` : ''}
            ${boughtCard.actualPrice ? `
            <div class="card-item">
              <div class="card-item-label">실제 가격</div>
              <div class="card-item-value">${boughtCard.actualPrice.toLocaleString()} 원</div>
            </div>
            ` : ''}
            ${boughtCard.nbValue !== null && boughtCard.nbValue !== undefined ? `
            <div class="card-item">
              <div class="card-item-label">N/B 값</div>
              <div class="card-item-value">${boughtCard.nbValue.toFixed(10)}</div>
            </div>
            ` : ''}
            ${boughtCard.nbMax !== null && boughtCard.nbMax !== undefined ? `
            <div class="card-item">
              <div class="card-item-label">N/B Max</div>
              <div class="card-item-value">${boughtCard.nbMax.toFixed(10)}</div>
            </div>
            ` : ''}
            ${boughtCard.nbMin !== null && boughtCard.nbMin !== undefined ? `
            <div class="card-item">
              <div class="card-item-label">N/B Min</div>
              <div class="card-item-value">${boughtCard.nbMin.toFixed(10)}</div>
            </div>
            ` : ''}
            ${boughtCard.emaFast !== null && boughtCard.emaFast !== undefined ? `
            <div class="card-item">
              <div class="card-item-label">EMA Fast</div>
              <div class="card-item-value">${boughtCard.emaFast.toLocaleString()} 원</div>
            </div>
            ` : ''}
            ${boughtCard.emaSlow !== null && boughtCard.emaSlow !== undefined ? `
            <div class="card-item">
              <div class="card-item-label">EMA Slow</div>
              <div class="card-item-value">${boughtCard.emaSlow.toLocaleString()} 원</div>
            </div>
            ` : ''}
            ${boughtCard.predictedZone ? `
            <div class="card-item">
              <div class="card-item-label">예측 구역</div>
              <div class="card-item-value" style="font-weight: 700; color: ${getZoneColor(boughtCard.predictedZone)};">${getZoneName(boughtCard.predictedZone)}</div>
            </div>
            ` : ''}
            ${boughtCard.actualZone ? `
            <div class="card-item">
              <div class="card-item-label">실제 구역</div>
              <div class="card-item-value" style="font-weight: 700; color: ${getZoneColor(boughtCard.actualZone)};">${getZoneName(boughtCard.actualZone)}</div>
            </div>
            ` : ''}
            ${boughtCard.confidence !== null && boughtCard.confidence !== undefined ? `
            <div class="card-item">
              <div class="card-item-label">신뢰도</div>
              <div class="card-item-value">${(boughtCard.confidence * 100).toFixed(1)}%</div>
            </div>
            ` : ''}
            ${boughtCard.error !== null ? `
            <div class="card-item">
              <div class="card-item-label">오차율</div>
              <div class="card-item-value" style="color: ${boughtCard.error < 2 ? '#0ecb81' : '#f6465d'};">${boughtCard.error.toFixed(2)}%</div>
            </div>
            ` : ''}
            <div class="card-item">
              <div class="card-item-label">생산 시점</div>
              <div class="card-item-value">${productionTime.toLocaleString('ko-KR', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</div>
            </div>
          </div>
          <div class="card-actions" style="margin-top: 12px;">
            <button class="btn btn-danger card-btn" onclick="handleCardSell('${boughtCard.id}')">매도</button>
          </div>
        `;
        
        container.appendChild(cardEl);

        // 생산 시점 그래프 렌더링 (데이터가 있을 때만, 레이아웃 안정화 후)
        if (boughtCard.chartData && boughtCard.chartData.length > 0) {
          const chartElId = `boughtCardChart-${boughtCard.id}`;
          setTimeout(() => createCardChart(chartElId, boughtCard.chartData.slice(-30)), 0);
        }
      });
    }
    
    // 기본 매수 금액 업데이트
    function updateDefaultBuyAmount(newAmount) {
      const amount = parseFloat(newAmount);
      if (isNaN(amount) || amount < 5000) {
        alert('최소 매수 금액은 5,000원입니다.');
        const input = document.getElementById('defaultBuyAmountInput');
        if (input) {
          input.value = defaultBuyAmount;
        }
        return;
      }
      
      defaultBuyAmount = amount;
      STATE.defaultBuyAmount = amount;
      // localStorage에 저장
      saveAnalysisData();
      console.log(`✅ 기본 매수 금액 업데이트: ${amount.toLocaleString()}원`);
    }
    
    // 매수 가격 업데이트
    function updateBoughtCardPrice(cardId, newPrice) {
      const price = parseFloat(newPrice);
      if (isNaN(price) || price <= 0) {
        alert('올바른 가격을 입력해주세요.');
        // 원래 가격으로 복원
        const card = boughtCards.find(c => c.id === cardId);
        if (card) {
          const input = document.getElementById(`buyPrice-${cardId}`);
          if (input) {
            input.value = card.buyPrice;
          }
        }
        return;
      }
      
      const index = boughtCards.findIndex(card => card.id === cardId);
      if (index === -1) {
        console.warn('매수 가격 업데이트: 카드를 찾을 수 없습니다.', cardId);
        return;
      }
      
      // 가격 업데이트
      const oldPrice = boughtCards[index].buyPrice;
      boughtCards[index].buyPrice = price;
      
      // 수량은 체결 시점 기준으로 유지 (가격 편집 시 재계산하지 않음)
      
      // localStorage에 저장 (디바운싱 적용)
      saveAnalysisData();
      
      console.log(`✅ 매수 가격 업데이트: ${oldPrice.toLocaleString()}원 → ${price.toLocaleString()}원`);
    }
    
    // 카드 매도 처리
    function handleCardSell(boughtCardId) {
      const index = boughtCards.findIndex(card => card.id === boughtCardId);
      if (index === -1) {
        alert('매도할 카드를 찾을 수 없습니다.');
        return;
      }
      
      const soldCard = boughtCards[index];
      boughtCards.splice(index, 1);
      
      // 현재 가격 가져오기 (실제 매도 가격)
      const currentPrice = soldCard.buyPrice; // 일단 매수가를 매도가로 사용 (실제로는 API에서 가져와야 함)
      const buyPrice = soldCard.buyPrice;
      const qty = soldCard.qty || 0;
      
      // 수익 계산
      const profit = (currentPrice - buyPrice) * qty;
      const profitRate = buyPrice > 0 ? ((currentPrice - buyPrice) / buyPrice) * 100 : 0;
      
      // 트레이드 완료된 카드에 추가 (매도 정보 포함)
      const completedTrade = {
        ...soldCard,
        sellTime: new Date().toISOString(),
        sellPrice: currentPrice,
        profit: profit,
        profitRate: profitRate
      };
      
      // 최근 50개만 유지
      completedTrades.push(completedTrade);
      if (completedTrades.length > 50) {
        completedTrades.shift();
      }
      
      // LV 100 이후 레벨 계산을 위한 누적 수익 업데이트
      if (profit > 0) {
        aiStatus.totalProfit += profit;
        
        // 레벨 재계산 (수익 기반)
        const newLevel = calculateTrainingLevel(aiStatus.totalTrainingCount, aiStatus.totalProfit);
        const oldLevel = aiStatus.level;
        aiStatus.level = newLevel;
        
        // 레벨업 알림
        if (newLevel > oldLevel) {
          console.log(`🎉 레벨업! LV ${oldLevel} → LV ${newLevel} (수익: +${profit.toLocaleString()}원)`);
        }
        
        // AI 상태 저장 및 UI 업데이트
        saveAnalysisData();
        updateAILearningStatusDisplay();
      }
      
      // 매수된 카드 영역 업데이트
      renderBoughtCards();
      
      // 트레이드 완료된 카드 영역 업데이트 (현재 탭이 완료 탭이면)
      if (currentBoughtCardsTab === 'completed') {
        renderCompletedTrades();
      }
      
      // 매수 버튼 상태 업데이트 (매도 후 다시 매수 가능하도록)
      updateCardBuyButtons();
      
      // localStorage에 저장
      saveAnalysisData();
      
      console.log('✅ 카드 매도 완료:', {
        card: soldCard,
        profit: profit.toLocaleString() + '원',
        profitRate: profitRate.toFixed(2) + '%',
        totalProfit: aiStatus.totalProfit.toLocaleString() + '원',
        level: aiStatus.level
      });
      
      const profitText = profit >= 0 ? `+${profit.toLocaleString()}원` : `${profit.toLocaleString()}원`;
      alert(`✅ 매도 완료!\n수익: ${profitText} (${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%)\n카드가 트레이드 완료된 카드 목록에 추가되었습니다.`);
    }
    
    // 탭 전환 함수
    function switchBoughtCardsTab(tab) {
      currentBoughtCardsTab = tab;
      
      const boughtTab = document.getElementById('boughtCardsTab');
      const completedTab = document.getElementById('completedTradesTab');
      const boughtContainer = document.getElementById('boughtCardsContainer');
      const completedContainer = document.getElementById('completedTradesContainer');
      
      if (tab === 'bought') {
        // 매수된 카드 탭 활성화
        if (boughtTab) {
          boughtTab.classList.add('active');
          boughtTab.style.background = 'rgba(14, 203, 129, 0.2)';
          boughtTab.style.borderBottom = '2px solid #0ecb81';
          boughtTab.style.color = '#0ecb81';
        }
        if (completedTab) {
          completedTab.classList.remove('active');
          completedTab.style.background = 'transparent';
          completedTab.style.borderBottom = '2px solid transparent';
          completedTab.style.color = '#9aa0a6';
        }
        if (boughtContainer) boughtContainer.style.display = 'block';
        if (completedContainer) completedContainer.style.display = 'none';
        renderBoughtCards();
      } else if (tab === 'completed') {
        // 트레이드 완료된 카드 탭 활성화
        if (completedTab) {
          completedTab.classList.add('active');
          completedTab.style.background = 'rgba(14, 203, 129, 0.2)';
          completedTab.style.borderBottom = '2px solid #0ecb81';
          completedTab.style.color = '#0ecb81';
        }
        if (boughtTab) {
          boughtTab.classList.remove('active');
          boughtTab.style.background = 'transparent';
          boughtTab.style.borderBottom = '2px solid transparent';
          boughtTab.style.color = '#9aa0a6';
        }
        if (boughtContainer) boughtContainer.style.display = 'none';
        if (completedContainer) completedContainer.style.display = 'block';
        renderCompletedTrades();
      }
    }
    
    // 트레이드 완료된 카드 렌더링
    function renderCompletedTrades() {
      const container = document.getElementById('completedTradesContainer');
      if (!container) return;
      
      if (completedTrades.length === 0) {
        container.innerHTML = '<div style="color: #9aa0a6; text-align: center; padding: 20px;">트레이드 완료된 카드가 없습니다.</div>';
        return;
      }
      
      container.innerHTML = '';
      
      // 최신순으로 정렬 (매도 시간 기준)
      const sortedTrades = [...completedTrades].sort((a, b) => {
        const timeA = new Date(a.sellTime || a.buyTime || 0).getTime();
        const timeB = new Date(b.sellTime || b.buyTime || 0).getTime();
        return timeB - timeA; // 내림차순 (최신이 먼저)
      });
      
      sortedTrades.forEach((trade) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'completed-trade-card card';
        cardEl.id = `completed-${trade.id}`;
        
        const buyTime = new Date(trade.buyTime);
        const sellTime = new Date(trade.sellTime || trade.buyTime);
        const productionTime = new Date(trade.productionDate);
        
        // 수익 계산
        const profit = trade.sellPrice - trade.buyPrice;
        const profitRate = trade.buyPrice > 0 ? (profit / trade.buyPrice) * 100 : 0;
        const profitColor = profit >= 0 ? '#0ecb81' : '#f6465d';
        
        cardEl.innerHTML = `
          <div class="card-header">
            <div class="card-title">${trade.cardType}</div>
            <div class="card-status" style="color: ${profitColor};">
              ${profit >= 0 ? '수익' : '손실'}
            </div>
          </div>
          <div class="card-content">
            <div class="card-item">
              <div class="card-item-label">분봉</div>
              <div class="card-item-value">${trade.timeframeName}</div>
            </div>
            <div class="card-item">
              <div class="card-item-label">매수가</div>
              <div class="card-item-value" style="color: #0ecb81;">${trade.buyPrice.toLocaleString()} 원</div>
            </div>
            <div class="card-item">
              <div class="card-item-label">매도가</div>
              <div class="card-item-value" style="color: #f6465d;">${trade.sellPrice.toLocaleString()} 원</div>
            </div>
            <div class="card-item">
              <div class="card-item-label">수량</div>
              <div class="card-item-value">${trade.qty ? trade.qty.toFixed(8) : '-'} BTC</div>
            </div>
            <div class="card-item">
              <div class="card-item-label">수익</div>
              <div class="card-item-value" style="color: ${profitColor}; font-weight: 700;">
                ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} 원
              </div>
            </div>
            <div class="card-item">
              <div class="card-item-label">수익률</div>
              <div class="card-item-value" style="color: ${profitColor}; font-weight: 700;">
                ${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%
              </div>
            </div>
            <div class="card-item">
              <div class="card-item-label">매수 시간</div>
              <div class="card-item-value" style="font-size: 11px;">${buyTime.toLocaleString('ko-KR', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</div>
            <div class="card-item">
              <div class="card-item-label">생산 시점 그래프</div>
              <div class="card-item-value" style="width: 100%;">
                <div id="boughtCardChart-${boughtCard.id}" style="width: 100%; height: 140px;"></div>
              </div>
            </div>
            </div>
            <div class="card-item">
              <div class="card-item-label">매도 시간</div>
              <div class="card-item-value" style="font-size: 11px;">${sellTime.toLocaleString('ko-KR', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit', 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</div>
            </div>
            ${trade.predictedPrice ? `
            <div class="card-item">
              <div class="card-item-label">예측 가격</div>
              <div class="card-item-value">${trade.predictedPrice.toLocaleString()} 원</div>
            </div>
            ` : ''}
            ${trade.productionPrice ? `
            <div class="card-item">
              <div class="card-item-label">생산 가격</div>
              <div class="card-item-value">${trade.productionPrice.toLocaleString()} 원</div>
            </div>
            ` : ''}
          </div>
        `;
        
        container.appendChild(cardEl);
      });
    }
    
    // 검증 완료된 카드 렌더링 (로컬 UI 버전)
    function renderVerifiedCardsLocal(containerId = 'verifiedCardsContainer') {
      const container = document.getElementById(containerId);
      
      if (!container) {
        console.warn('⚠️ verifiedCardsContainer를 찾을 수 없습니다. 재시도 중...');
        // 요소가 아직 준비되지 않았을 수 있으므로 잠시 후 재시도
        setTimeout(() => {
          const retryContainer = document.getElementById(containerId);
          if (retryContainer) {
            console.log('✅ verifiedCardsContainer 찾음. 재시도 렌더링...');
            renderVerifiedCardsLocal(containerId);
          } else {
            console.error('❌ verifiedCardsContainer를 찾을 수 없습니다. DOM 구조를 확인하세요.');
          }
        }, 500);
        return;
      }
      
      // 모든 검증 완료 카드 표시 (분봉 필터링 제거)
      // 검증 시간 기준으로 최신순 정렬 (가장 최근에 검증된 카드가 맨 위)
      const sortedCards = [...verifiedCards].sort((a, b) => {
        const timeA = new Date(a.verifiedTime || a.productionDate || 0).getTime();
        const timeB = new Date(b.verifiedTime || b.productionDate || 0).getTime();
        return timeB - timeA; // 내림차순 (최신이 먼저)
      });
      
      // console.log 제거로 성능 개선
      
      if (sortedCards.length === 0) {
        container.innerHTML = `<div style="color: #9aa0a6; text-align: center; padding: 20px; font-size: 12px;">검증 완료된 카드가 없습니다.</div>`;
        return;
      }
      
      container.innerHTML = '';
      
      // 모든 검증 완료된 카드 렌더링 (최신순)
      sortedCards.forEach((verifiedCard) => {
        const cardEl = createVerifiedCardElement(verifiedCard);
        container.appendChild(cardEl);
      });
      
      // 저장은 디바운싱으로 처리 (별도 호출 불필요 - verifiedCards 변경 시 이미 저장됨)
    }
    
    // 검증 완료된 카드 요소 생성
    function createVerifiedCardElement(verifiedCard) {
      const cardEl = document.createElement('div');
      cardEl.className = 'verified-card';
      cardEl.id = verifiedCard.id;
      
      const verifiedTime = new Date(verifiedCard.verifiedTime);
      const productionTime = new Date(verifiedCard.productionDate);
      
      const accuracyColor = verifiedCard.isAccurate ? '#0ecb81' : verifiedCard.isDirectionCorrect ? '#ffc107' : '#f6465d';
      const accuracyText = verifiedCard.isAccurate ? '높은 정확도' : verifiedCard.isDirectionCorrect ? '방향 정확' : '예측 실패';
      
      // 가격 변화율 계산 (생산 시점 가격 대비 실제 가격)
      let priceChangeRate = null;
      if (verifiedCard.productionPrice && verifiedCard.actualPrice) {
        priceChangeRate = ((verifiedCard.actualPrice - verifiedCard.productionPrice) / verifiedCard.productionPrice) * 100;
      } else if (verifiedCard.priceChangeRate !== undefined) {
        priceChangeRate = verifiedCard.priceChangeRate;
      }
      
      // 가격 차이 계산
      const priceDifference = verifiedCard.actualPrice - verifiedCard.predictedPrice;
      const priceDifferenceAbs = Math.abs(priceDifference);
      
      // 예측 방향과 실제 방향 계산
      const predictedDirection = verifiedCard.predictedPrice > verifiedCard.productionPrice ? '상승' : 
                                 verifiedCard.predictedPrice < verifiedCard.productionPrice ? '하락' : '보합';
      const actualDirection = verifiedCard.actualPrice > verifiedCard.productionPrice ? '상승' : 
                              verifiedCard.actualPrice < verifiedCard.productionPrice ? '하락' : '보합';
      
      // 정확도 등급 계산
      let accuracyGrade = '';
      let accuracyScore = 0;
      if (verifiedCard.isAccurate && verifiedCard.isDirectionCorrect) {
        accuracyGrade = 'S급 (매우 우수)';
        accuracyScore = 100;
      } else if (verifiedCard.isAccurate) {
        accuracyGrade = 'A급 (우수)';
        accuracyScore = 85;
      } else if (verifiedCard.isDirectionCorrect && verifiedCard.error < 5) {
        accuracyGrade = 'B급 (양호)';
        accuracyScore = 70;
      } else if (verifiedCard.isDirectionCorrect) {
        accuracyGrade = 'C급 (보통)';
        accuracyScore = 50;
      } else {
        accuracyGrade = 'D급 (미흡)';
        accuracyScore = 20;
      }
      
      // 검증 결과 상세 정보
      const verificationResult = verifiedCard.isAccurate && verifiedCard.isDirectionCorrect 
        ? '✅ 예측 성공 (높은 정확도)' 
        : verifiedCard.isDirectionCorrect 
        ? '⚠️ 방향 정확 (중간 정확도)' 
        : '❌ 예측 실패 (낮은 정확도)';
      
      const verificationDetails = verifiedCard.isAccurate && verifiedCard.isDirectionCorrect
        ? `예측 가격과 실제 가격의 오차가 2% 이내이며, 가격 방향도 정확하게 예측했습니다.`
        : verifiedCard.isDirectionCorrect
        ? `가격 방향은 정확하게 예측했지만, 오차율이 2%를 초과했습니다. (오차: ${verifiedCard.error.toFixed(2)}%)`
        : `예측 가격과 실제 가격의 방향이 일치하지 않았습니다. 예측: ${predictedDirection}, 실제: ${actualDirection}`;
      
      // 시간 차이 계산
      const timeDiff = verifiedTime.getTime() - productionTime.getTime();
      const timeDiffMinutes = Math.floor(timeDiff / (1000 * 60));
      const timeDiffHours = Math.floor(timeDiffMinutes / 60);
      const timeDiffDays = Math.floor(timeDiffHours / 24);
      let timeDiffText = '';
      if (timeDiffDays > 0) {
        timeDiffText = `${timeDiffDays}일 ${timeDiffHours % 24}시간`;
      } else if (timeDiffHours > 0) {
        timeDiffText = `${timeDiffHours}시간 ${timeDiffMinutes % 60}분`;
      } else {
        timeDiffText = `${timeDiffMinutes}분`;
      }
      
      cardEl.innerHTML = `
        <div class="card-header">
          <div class="card-title">검증 완료</div>
          <div class="card-status verified" style="color: ${accuracyColor};">${accuracyText}</div>
        </div>
        <div class="card-content">
          <!-- 검증 결과 헤더 -->
          <div style="background: ${accuracyColor === '#0ecb81' ? 'rgba(14, 203, 129, 0.15)' : accuracyColor === '#ffc107' ? 'rgba(255, 193, 7, 0.15)' : 'rgba(246, 70, 93, 0.15)'}; border-left: 3px solid ${accuracyColor}; border-radius: 4px; padding: 8px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <div style="font-size: 11px; font-weight: 700; color: ${accuracyColor};">${verificationResult}</div>
              <div style="font-size: 9px; font-weight: 700; color: ${accuracyColor}; background: ${accuracyColor}25; padding: 2px 6px; border-radius: 3px;">${accuracyGrade}</div>
            </div>
            <div style="font-size: 9px; color: #9aa0a6; line-height: 1.3;">${verificationDetails}</div>
          </div>
          
          <!-- 핵심 지표 -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 4px; padding: 6px; text-align: center;">
              <div style="font-size: 8px; color: #9aa0a6; margin-bottom: 2px;">정확도 점수</div>
              <div style="font-size: 14px; font-weight: 700; color: ${accuracyColor};">${accuracyScore}</div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.05); border-radius: 4px; padding: 6px; text-align: center;">
              <div style="font-size: 8px; color: #9aa0a6; margin-bottom: 2px;">오차율</div>
              <div style="font-size: 14px; font-weight: 700; color: ${accuracyColor};">${verifiedCard.error.toFixed(2)}%</div>
            </div>
          </div>
          
          <!-- 가격 흐름 -->
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 4px; padding: 6px; margin-bottom: 6px;">
            <div style="font-size: 9px; font-weight: 600; color: #9aa0a6; margin-bottom: 4px; text-transform: uppercase;">가격 흐름</div>
            <div style="display: flex; align-items: center; gap: 4px; font-size: 11px;">
              <div style="flex: 1; text-align: center; padding: 4px; background: rgba(255, 255, 255, 0.05); border-radius: 3px;">
                <div style="font-size: 8px; color: #9aa0a6; margin-bottom: 1px;">생산</div>
                <div style="font-weight: 600; color: #e6eefc;">${verifiedCard.productionPrice ? (verifiedCard.productionPrice / 1000000).toFixed(1) + 'M' : '-'}</div>
              </div>
              <div style="color: #9aa0a6;">→</div>
              <div style="flex: 1; text-align: center; padding: 4px; background: rgba(255, 193, 7, 0.1); border-radius: 3px;">
                <div style="font-size: 8px; color: #ffc107; margin-bottom: 1px;">예측</div>
                <div style="font-weight: 600; color: #ffc107;">${(verifiedCard.predictedPrice / 1000000).toFixed(1)}M</div>
              </div>
              <div style="color: #9aa0a6;">→</div>
              <div style="flex: 1; text-align: center; padding: 4px; background: ${accuracyColor}20; border-radius: 3px;">
                <div style="font-size: 8px; color: ${accuracyColor}; margin-bottom: 1px;">실제</div>
                <div style="font-weight: 600; color: ${accuracyColor};">${(verifiedCard.actualPrice / 1000000).toFixed(1)}M</div>
              </div>
            </div>
          </div>
          
          <!-- 방향 및 오차 -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
            <div style="background: rgba(255, 255, 255, 0.03); border-radius: 4px; padding: 6px;">
              <div style="font-size: 9px; color: #9aa0a6; margin-bottom: 3px;">방향</div>
              <div style="font-size: 10px; font-weight: 600;">
                <span style="color: ${predictedDirection === '상승' ? '#0ecb81' : predictedDirection === '하락' ? '#f6465d' : '#9aa0a6'};">
                  ${predictedDirection === '상승' ? '📈' : predictedDirection === '하락' ? '📉' : '➡️'} 예측: ${predictedDirection}
                </span><br>
                <span style="color: ${actualDirection === '상승' ? '#0ecb81' : actualDirection === '하락' ? '#f6465d' : '#9aa0a6'};">
                  ${actualDirection === '상승' ? '📈' : actualDirection === '하락' ? '📉' : '➡️'} 실제: ${actualDirection}
                </span>
              </div>
              <div style="margin-top: 3px; font-size: 9px; color: ${verifiedCard.isDirectionCorrect ? '#0ecb81' : '#f6465d'};">
                ${verifiedCard.isDirectionCorrect ? '✅ 일치' : '❌ 불일치'}
              </div>
            </div>
            <div style="background: rgba(255, 255, 255, 0.03); border-radius: 4px; padding: 6px;">
              <div style="font-size: 9px; color: #9aa0a6; margin-bottom: 3px;">가격 차이</div>
              <div style="font-size: 12px; font-weight: 700; color: ${priceDifference >= 0 ? '#0ecb81' : '#f6465d'};">
                ${priceDifference >= 0 ? '+' : ''}${(priceDifference / 1000000).toFixed(2)}M
              </div>
              ${verifiedCard.errorRate !== undefined ? `
              <div style="margin-top: 3px; font-size: 9px; color: ${verifiedCard.errorRate >= 0 ? '#0ecb81' : '#f6465d'};">
                ${verifiedCard.errorRate >= 0 ? '+' : ''}${verifiedCard.errorRate.toFixed(2)}%
              </div>
              ` : ''}
            </div>
          </div>
          
          <div class="card-item">
            <div class="card-item-label">분봉</div>
            <div class="card-item-value">${verifiedCard.timeframeName}</div>
          </div>
          ${priceChangeRate !== null ? `
          <div class="card-item">
            <div class="card-item-label">변화율 (생산→실제)</div>
            <div class="card-item-value" style="color: ${priceChangeRate >= 0 ? '#0ecb81' : '#f6465d'}; font-size: 11px;">
              ${priceChangeRate >= 0 ? '+' : ''}${priceChangeRate.toFixed(3)}%
            </div>
          </div>
          ` : ''}
          
          <!-- N/B 분석 (있을 때만) -->
          ${verifiedCard.nbValue !== null || verifiedCard.nbMax !== null || verifiedCard.nbMin !== null ? `
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 4px; padding: 6px; margin-top: 4px;">
            <div style="font-size: 9px; font-weight: 600; color: #9aa0a6; margin-bottom: 4px;">N/B 분석</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; font-size: 10px;">
              ${verifiedCard.nbValue !== null ? `
              <div style="text-align: center;">
                <div style="color: #9aa0a6; font-size: 8px; margin-bottom: 2px;">값</div>
                <div style="color: #e6eefc; font-weight: 600;">${verifiedCard.nbValue.toFixed(4)}</div>
              </div>
              ` : ''}
              ${verifiedCard.nbMax !== null ? `
              <div style="text-align: center;">
                <div style="color: #9aa0a6; font-size: 8px; margin-bottom: 2px;">Max</div>
                <div style="color: #0ecb81; font-weight: 600;">${verifiedCard.nbMax.toFixed(4)}</div>
              </div>
              ` : ''}
              ${verifiedCard.nbMin !== null ? `
              <div style="text-align: center;">
                <div style="color: #9aa0a6; font-size: 8px; margin-bottom: 2px;">Min</div>
                <div style="color: #f6465d; font-weight: 600;">${verifiedCard.nbMin.toFixed(4)}</div>
              </div>
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          <!-- 구역 예측 및 검증 (있을 때만) -->
          ${verifiedCard.predictedZone || verifiedCard.actualZone ? `
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 4px; padding: 6px; margin-top: 4px;">
            <div style="font-size: 9px; font-weight: 600; color: #9aa0a6; margin-bottom: 4px;">구역 예측 및 검증</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 10px;">
              <div style="text-align: center;">
                <div style="color: #9aa0a6; font-size: 8px; margin-bottom: 2px;">예측 구역</div>
                <div style="font-weight: 600; color: ${verifiedCard.predictedZone ? getZoneColor(verifiedCard.predictedZone) : '#9aa0a6'};">
                  ${verifiedCard.predictedZone ? getZoneName(verifiedCard.predictedZone) : '-'}
                </div>
              </div>
              <div style="text-align: center;">
                <div style="color: #9aa0a6; font-size: 8px; margin-bottom: 2px;">실제 구역</div>
                <div style="font-weight: 600; color: ${verifiedCard.actualZone ? getZoneColor(verifiedCard.actualZone) : '#9aa0a6'};">
                  ${verifiedCard.actualZone ? getZoneName(verifiedCard.actualZone) : '-'}
                </div>
              </div>
            </div>
            ${verifiedCard.isZoneCorrect !== undefined ? `
            <div style="margin-top: 4px; text-align: center; font-size: 9px;">
              <span style="color: ${verifiedCard.isZoneCorrect ? '#0ecb81' : '#f6465d'}; font-weight: 600;">
                ${verifiedCard.isZoneCorrect ? '✅ 구역 예측 정확' : '❌ 구역 예측 오류'}
              </span>
            </div>
            ` : ''}
          </div>
          ` : ''}
          
          <!-- 시간 정보 (컴팩트) -->
          <div style="background: rgba(255, 255, 255, 0.03); border-radius: 4px; padding: 6px; margin-top: 4px;">
            <div style="font-size: 9px; font-weight: 600; color: #9aa0a6; margin-bottom: 4px;">시간 정보</div>
            <div class="card-item" style="padding: 2px 0;">
              <div class="card-item-label" style="font-size: 9px;">생산</div>
              <div class="card-item-value" style="font-size: 9px; color: #9aa0a6;">
                ${productionTime.toLocaleString('ko-KR', { 
                  month: '2-digit', 
                  day: '2-digit', 
                  hour: '2-digit', 
                  minute: '2-digit'
                })}
              </div>
            </div>
            <div class="card-item" style="padding: 2px 0;">
              <div class="card-item-label" style="font-size: 9px;">검증</div>
              <div class="card-item-value" style="font-size: 9px; color: #9aa0a6;">
                ${verifiedTime.toLocaleString('ko-KR', { 
                  month: '2-digit', 
                  day: '2-digit', 
                  hour: '2-digit', 
                  minute: '2-digit'
                })}
              </div>
            </div>
            <div class="card-item" style="padding: 2px 0;">
              <div class="card-item-label" style="font-size: 9px;">경과</div>
              <div class="card-item-value" style="font-size: 9px; color: #9aa0a6;">${timeDiffText}</div>
            </div>
          </div>
        </div>
        ${verifiedCard.data ? `
        <div class="card-chart-section" style="margin-top: 8px;">
          <div class="chart-label" style="font-size: 10px; margin-bottom: 4px;">생산 시점 그래프</div>
          <div id="verifiedChart-${verifiedCard.id}" style="width: 100%; height: 100px;"></div>
        </div>
        ` : ''}
      `;
      
      // 그래프 생성 (데이터가 있는 경우) - null 값 안전 검증
      if (verifiedCard.data && Array.isArray(verifiedCard.data) && verifiedCard.data.length > 0) {
        setTimeout(() => {
          const chartContainer = document.getElementById(`verifiedChart-${verifiedCard.id}`);
          if (chartContainer) {
            // 유효한 데이터만 필터링하여 전달
            const validData = verifiedCard.data
              .slice(-30)
              .filter(item => item && item.time && item.open && item.high && item.low && item.close);
            if (validData.length > 0) {
              createCardChart(`verifiedChart-${verifiedCard.id}`, validData);
            }
          }
        }, 100);
      }
      
      return cardEl;
    }
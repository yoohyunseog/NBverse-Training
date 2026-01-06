/**
 * 차트 관리 모듈
 * - 메인 차트 및 카드 차트 생성/업데이트
 * - LightweightCharts 통합
 */

import { CONFIG, STATE, formatPrice } from './config.js';

// 성능 측정을 위한 토글 (localStorage에 perfDebug=1 설정 시 활성화)
const PERF_ENABLED = (() => {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem('perfDebug') === '1'; }
  catch (_) { return false; }
})();

// 차트 인스턴스 저장소
const charts = {
  main: null,
  cards: {}
};

// 시리즈 저장소
const series = {
  candlestick: null,
  emaFast: null,
  emaSlow: null,
  predicted: null
};

// 시리즈의 setData를 감싸서 안전하게 호출하는 헬퍼
function wrapSeriesSetData(s, name = 'series') {
  if (!s || typeof s.setData !== 'function') return;
  const orig = s.setData.bind(s);
  s.setData = function(data) {
    try {
      if (!data || !Array.isArray(data) || data.length === 0) {
        return orig([]);
      }
      const filtered = data.filter(item => item && typeof item === 'object')
        .map(item => {
          // normalize time
          let time = item.time;
          if (typeof time === 'string' || time instanceof String) {
            const t = Date.parse(time);
            time = Number.isNaN(t) ? null : Math.floor(t/1000);
          } else if (time instanceof Date) {
            time = Math.floor(time.getTime()/1000);
          }
          if ('open' in item && 'close' in item) {
            const open = parseFloat(item.open);
            const high = parseFloat(item.high);
            const low = parseFloat(item.low);
            const close = parseFloat(item.close);
            if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) return null;
            return { time, open, high, low, close };
          }
          // line/histogram
          const value = 'value' in item ? parseFloat(item.value) : ( 'price' in item ? parseFloat(item.price) : NaN );
          if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
          return { time, value };
        })
        .filter(x => x !== null);

      if (!filtered || filtered.length === 0) return orig([]);
      return orig(filtered);
    } catch (err) {
      console.error(`wrapSeriesSetData: ${name} setData 실패`, err);
      try { return orig([]); } catch(e){}
    }
  };
}

// 안전한 setData 헬퍼 (null/NaN 데이터가 LightweightCharts까지 가지 않도록 강제 방어)
function safeSetData(targetSeries, data, name = 'series') {
  if (!targetSeries) return;
  if (!data || !Array.isArray(data) || data.length === 0) {
    try { targetSeries.setData([]); } catch (e) { console.warn(`safeSetData: ${name} setData 빈배열 전달 실패`, e); }
    return;
  }

  // time/open/high/low/close/value를 모두 검증하여 완전 무결한 캔들만 통과시킨다.
  const filtered = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;

    const time = Number.isFinite(item.time) ? item.time : null;
    if (time === null || time <= 0) continue;

    if ('open' in item || 'close' in item || 'high' in item || 'low' in item) {
      const open = Number.isFinite(item.open) ? item.open : null;
      const high = Number.isFinite(item.high) ? item.high : null;
      const low = Number.isFinite(item.low) ? item.low : null;
      const close = Number.isFinite(item.close) ? item.close : null;
      if ([open, high, low, close].some(v => v === null)) continue;
      if (!(high >= low && open >= low && open <= high && close >= low && close <= high)) continue;
      filtered.push({ time, open, high, low, close });
      continue;
    }

    if ('value' in item) {
      const value = Number.isFinite(item.value) ? item.value : null;
      if (value === null) continue;
      filtered.push({ time, value, color: item.color });
    }
  }

  if (!filtered || filtered.length === 0) {
    try { targetSeries.setData([]); } catch (e) { console.warn(`safeSetData: ${name} 필터링 후 빈배열 전달 실패`, e, (new Error()).stack); }
    return;
  }

  // 시간순 정렬 + 중복 제거 (동일 time 존재 시 마지막 값 사용)
  const deduped = [];
  const seen = new Set();
  filtered
    .sort((a, b) => a.time - b.time)
    .forEach((candle) => {
      if (seen.has(candle.time)) {
        deduped[deduped.length - 1] = candle; // 가장 최신 값을 유지
      } else {
        seen.add(candle.time);
        deduped.push(candle);
      }
    });

  try {
    targetSeries.setData(deduped);
  } catch (e) {
    console.error(`safeSetData: ${name} setData 실패`, e, { sample: deduped[0], stack: (new Error()).stack });
    try { targetSeries.setData([]); } catch (inner) { /* swallow */ }
  }
}

/**
 * 메인 차트 초기화
 */
export function initMainChart(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`차트 컨테이너를 찾을 수 없습니다: ${containerId}`);
    return null;
  }

  // 기존 차트 제거
  if (charts.main) {
    charts.main.remove();
  }

  // 차트 생성
  try {
    charts.main = LightweightCharts.createChart(container, {
    layout: {
      background: { type: 'solid', color: CONFIG.COLORS.BACKGROUND },
      textColor: CONFIG.COLORS.NEUTRAL
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.05)' },
      horzLines: { color: 'rgba(255,255,255,0.05)' }
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.1)',
      scaleMargins: { top: 0.1, bottom: 0.1 }
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.1)',
      timeVisible: true,
      secondsVisible: false
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: 'rgba(255,255,255,0.3)', width: 1, style: 2 },
      horzLine: { color: 'rgba(255,255,255,0.3)', width: 1, style: 2 }
    },
    width: container.clientWidth,
    height: 600,
    });
  } catch (error) {
    console.error('initMainChart: LightweightCharts.createChart 실패', error);
    try { container.innerHTML = '<div style="padding:20px;color:#ff6b6b;">차트 라이브러리 로드 실패</div>'; } catch(e){}
    return null;
  }

  // 캔들스틱 시리즈
  series.candlestick = charts.main.addCandlestickSeries({
    upColor: CONFIG.COLORS.UP,
    downColor: CONFIG.COLORS.DOWN,
    wickUpColor: CONFIG.COLORS.UP,
    wickDownColor: CONFIG.COLORS.DOWN,
    borderVisible: false,
  });

  // 안전한 setData 래핑
  wrapSeriesSetData(series.candlestick, 'candlestick');

  // EMA Fast 라인
  series.emaFast = charts.main.addLineSeries({
    color: '#ffc107',
    lineWidth: 2,
    title: 'EMA Fast',
    priceLineVisible: false,
    lastValueVisible: true,
  });
  wrapSeriesSetData(series.emaFast, 'emaFast');

  // EMA Slow 라인
  series.emaSlow = charts.main.addLineSeries({
    color: '#9c27b0',
    lineWidth: 2,
    title: 'EMA Slow',
    priceLineVisible: false,
    lastValueVisible: true,
  });
  wrapSeriesSetData(series.emaSlow, 'emaSlow');

  // 예측 라인 (점선)
  series.predicted = charts.main.addLineSeries({
    color: CONFIG.COLORS.BLUE_ZONE,
    lineWidth: 2,
    lineStyle: 2, // dashed
    title: 'Predicted',
    priceLineVisible: true,
    lastValueVisible: true,
  });
  wrapSeriesSetData(series.predicted, 'predicted');

  // 반응형 처리
  window.addEventListener('resize', () => {
    if (charts.main && container) {
      charts.main.applyOptions({ width: container.clientWidth });
    }
  });

  return charts.main;
}

/**
 * 메인 차트 데이터 업데이트
 */
export function updateMainChart(chartData) {
  if (!series.candlestick || !chartData || chartData.length === 0) return;

  try {
    // 캔들 데이터 정제
    const candles = sanitizeChartData(chartData);
    if (candles.length === 0) {
      console.warn('유효한 차트 데이터가 없습니다');
      return;
    }

    safeSetData(series.candlestick, candles, 'candlestick');

    // EMA 데이터 추출 및 설정
    const emaFastData = chartData
      .filter(item => item.emaFast && isFinite(item.emaFast))
      .map(item => ({
        time: Math.floor(new Date(item.time).getTime() / 1000),
        value: parseFloat(item.emaFast)
      }));

    const emaSlowData = chartData
      .filter(item => item.emaSlow && isFinite(item.emaSlow))
      .map(item => ({
        time: Math.floor(new Date(item.time).getTime() / 1000),
        value: parseFloat(item.emaSlow)
      }));

    if (emaFastData.length > 0) safeSetData(series.emaFast, emaFastData, 'emaFast');
    if (emaSlowData.length > 0) safeSetData(series.emaSlow, emaSlowData, 'emaSlow');

    // 차트 크기 조정
    charts.main.timeScale().fitContent();

  } catch (error) {
    console.error('메인 차트 업데이트 실패:', error);
  }
}

/**
 * 예측 라인 추가
 */
export function addPredictedLine(currentTime, currentPrice, predictedPrice) {
  if (!series.predicted) return;

  try {
    const currentTimestamp = Math.floor(new Date(currentTime).getTime() / 1000);
    const nextTimestamp = currentTimestamp + getNextCandleTime(STATE.currentInterval);

    const predictedData = [
      { time: currentTimestamp, value: currentPrice },
      { time: nextTimestamp, value: predictedPrice }
    ];

    safeSetData(series.predicted, predictedData, 'predicted');
  } catch (error) {
    console.error('예측 라인 추가 실패:', error);
  }
}

/**
 * 예측 라인 제거
 */
export function clearPredictedLine() {
  if (series.predicted) {
    safeSetData(series.predicted, [], 'predicted');
  }
}

/**
 * 카드용 미니 차트 생성 (리팩토링 버전)
 */
export function createCardChart(containerId, chartData) {
  const container = document.getElementById(containerId);
  
  // 1단계: 컨테이너와 데이터 유효성 검증
  if (!container) {
    console.warn(`createCardChart: 컨테이너를 찾을 수 없음 (ID: ${containerId})`);
    return null;
  }
  
  if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
    console.warn(`createCardChart: 유효하지 않은 차트 데이터 (containerId: ${containerId})`);
    container.innerHTML = '<div style="color: #9aa0a6; text-align: center; padding: 20px; font-size: 12px;">차트 데이터 없음</div>';
    return null;
  }
  
  // 기존 차트가 있으면 제거
  container.innerHTML = '';
  
  try {
    // 2단계: 데이터 정제
    const validCandles = sanitizeChartData(chartData);
    
    // 3단계: 정제된 데이터가 충분한지 확인
    if (validCandles.length === 0) {
      console.warn(`createCardChart: 유효한 캔들 데이터 없음 (containerId: ${containerId}, 원본: ${chartData.length}개)`);
      container.innerHTML = '<div style="color: #f6465d; text-align: center; padding: 20px; font-size: 11px;">유효한 차트 데이터 없음</div>';
      return null;
    }
    
    if (validCandles.length < chartData.length) {
      console.warn(`createCardChart: 일부 데이터 필터링됨 (${chartData.length} → ${validCandles.length})`);
    }
    
    // 4단계: LightweightCharts 차트 생성
    const miniChart = LightweightCharts.createChart(container, {
      layout: { 
        background: { type: 'solid', color: '#1e2329' }, 
        textColor: '#9aa0a6' 
      },
      grid: { 
        vertLines: { visible: false }, 
        horzLines: { visible: false } 
      },
      rightPriceScale: { 
        borderColor: 'rgba(255,255,255,0.05)',
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: { 
        borderColor: 'rgba(255,255,255,0.05)',
        timeVisible: false,
        secondsVisible: false
      },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: false, axisPressedMouseMove: false },
      width: container.clientWidth || 300,
      height: 150,
    });
    
    // 5단계: 캔들 시리즈 추가 및 데이터 설정
    const candleSeries = miniChart.addCandlestickSeries({
      upColor: CONFIG.COLORS.UP,
      downColor: CONFIG.COLORS.DOWN,
      wickUpColor: CONFIG.COLORS.UP,
      wickDownColor: CONFIG.COLORS.DOWN,
      borderVisible: false,
    });
    
    safeSetData(candleSeries, validCandles, 'card-candles');
    
    // 6단계: 차트 크기 조정
    miniChart.timeScale().fitContent();
    
    // 7단계: 차트 인스턴스 저장
    charts.cards[containerId] = miniChart;
    
    return miniChart;
    
  } catch (error) {
    console.error(`createCardChart 실패 (containerId: ${containerId}):`, error);
    container.innerHTML = '<div style="color: #f6465d; text-align: center; padding: 20px; font-size: 11px;">차트 로드 실패</div>';
    return null;
  }
}

/**
 * 차트 데이터 정제 (null/invalid 값 필터링)
 */
let sanitizeWarnCount = 0;

function sanitizeChartData(chartData) {
  if (!Array.isArray(chartData) || chartData.length === 0) return [];

  const t0 = PERF_ENABLED ? performance.now() : 0;
  const sanitized = [];
  const dropped = [];
  let prevTime = null;
  let needSort = false;
  let hasDuplicate = false;
  const timeSeen = new Set();

  for (const item of chartData) {
    if (!item || typeof item !== 'object') {
      dropped.push({ reason: 'not-object', sample: item });
      continue;
    }

    // 시간 파싱: ISO 문자열 / Date / 초 단위 / ms 단위를 모두 허용
    let timestamp = null;
    try {
      if (typeof item.time === 'number') {
        timestamp = item.time > 1e12 ? Math.floor(item.time / 1000) : Math.floor(item.time);
      } else if (typeof item.time === 'string') {
        const numeric = Number(item.time);
        if (Number.isFinite(numeric)) {
          timestamp = numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
        } else {
          const parsed = Date.parse(item.time);
          timestamp = Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
        }
      } else if (item.time instanceof Date) {
        timestamp = Math.floor(item.time.getTime() / 1000);
      }
    } catch (e) {
      timestamp = null;
    }

    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      dropped.push({ reason: 'invalid-time', sample: item.time });
      continue;
    }

    if (prevTime !== null && timestamp <= prevTime) {
      needSort = true; // 비정렬 또는 중복 탐지
    }
    prevTime = timestamp;
    if (timeSeen.has(timestamp)) hasDuplicate = true;
    timeSeen.add(timestamp);

    // OHLC 값 파싱
    const open = parseFloat(item.open);
    const high = parseFloat(item.high);
    const low = parseFloat(item.low);
    const close = parseFloat(item.close);

    if (![open, high, low, close].every(Number.isFinite)) {
      dropped.push({ reason: 'invalid-price', sample: { open: item.open, high: item.high, low: item.low, close: item.close } });
      continue;
    }

    if (!(high >= low && open >= low && open <= high && close >= low && close <= high)) {
      dropped.push({ reason: 'out-of-range', sample: { open, high, low, close } });
      continue;
    }

    sanitized.push({ time: timestamp, open, high, low, close });
  }

  // 이미 정렬/유니크이면 바로 반환하여 O(n log n) 정렬을 회피
  if (!needSort && !hasDuplicate) {
    if (PERF_ENABLED) {
      const dt = performance.now() - t0;
      if (dt > 1) console.log(`sanitizeChartData fast-path ${sanitized.length}건 ${dt.toFixed(2)}ms`);
    }
    if (dropped.length > 0 && sanitizeWarnCount < 3) {
      console.warn(`sanitizeChartData: ${dropped.length}개 항목 필터링됨`, dropped.slice(0, 3));
      sanitizeWarnCount += 1;
    }
    return sanitized;
  }

  // 시간순 정렬 및 중복 제거
  const deduped = [];
  const seen = new Set();
  sanitized
    .sort((a, b) => a.time - b.time)
    .forEach((candle) => {
      if (seen.has(candle.time)) {
        deduped[deduped.length - 1] = candle;
      } else {
        seen.add(candle.time);
        deduped.push(candle);
      }
    });

  if (dropped.length > 0 && sanitizeWarnCount < 3) {
    console.warn(`sanitizeChartData: ${dropped.length}개 항목 필터링됨`, dropped.slice(0, 3));
    sanitizeWarnCount += 1;
  }

  if (PERF_ENABLED) {
    const dt = performance.now() - t0;
    if (dt > 1) console.log(`sanitizeChartData sort-path ${deduped.length}건 ${dt.toFixed(2)}ms (dropped ${dropped.length})`);
  }

  return deduped;
}

/**
 * 다음 캔들 시간 계산 (초 단위)
 */
function getNextCandleTime(interval) {
  const intervals = {
    'minute1': 60,
    'minute3': 180,
    'minute5': 300,
    'minute10': 600,
    'minute15': 900,
    'minute30': 1800,
    'minute60': 3600,
    'minute240': 14400,
    'day': 86400,
    'week': 604800,
    'month': 2592000
  };
  return intervals[interval] || 60;
}

/**
 * 모든 차트 제거
 */
export function removeAllCharts() {
  if (charts.main) {
    charts.main.remove();
    charts.main = null;
  }
  
  Object.values(charts.cards).forEach(chart => {
    if (chart) chart.remove();
  });
  charts.cards = {};
}

/**
 * 차트 인스턴스 가져오기
 */
export function getMainChart() {
  return charts.main;
}

export function getCardChart(containerId) {
  return charts.cards[containerId];
}

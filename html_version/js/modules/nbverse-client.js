/**
 * NBVerse API 클라이언트
 * - 카드 저장/조회
 * - 자산 정보 조회
 * - AI 예측 API
 */

import { CONFIG, STATE } from './config.js';

/**
 * API 요청 래퍼 (재시도 로직 포함)
 */
async function apiRequest(url, options = {}, retries = CONFIG.RETRY.MAX_ATTEMPTS) {
  const timeout = options.timeout || CONFIG.TIMEOUTS.API_REQUEST;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(timeout)
      });
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      
      return await response.json();
      
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      
      // AbortError는 타임아웃이므로 더 긴 대기 시간 적용
      const isTimeout = error.name === 'AbortError' || error.message.includes('timed out');
      const delay = isTimeout 
        ? CONFIG.RETRY.RETRY_DELAY * 2 * Math.pow(CONFIG.RETRY.BACKOFF_MULTIPLIER, attempt - 1)
        : CONFIG.RETRY.RETRY_DELAY * Math.pow(CONFIG.RETRY.BACKOFF_MULTIPLIER, attempt - 1);
      
      console.warn(`API 요청 실패 (${attempt}/${retries}), ${delay}ms 후 재시도:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * 카드 저장 API
 */
export async function saveCard(cardType, cardData) {
  console.log(`📡 ${cardType} 저장 요청 시작`);
  console.log('📦 카드 타입:', cardType);
  console.log('💾 저장 데이터:', JSON.stringify(cardData).substring(0, 200) + '...');
  
  const url = `${CONFIG.API_BASE_URL}/cards/chart-analysis/save`;
  console.log('📤 API 전송:', url);
  
  try {
    const result = await apiRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        card_type: cardType,
        timeframe: STATE.currentInterval,
        card_data: cardData
      })
    });
    
    console.log('📥 API 응답 수신: status=200 (OK)');
    console.log('📥 API 응답 JSON:', result);
    
    if (result.success) {
      console.log(`✅ ${cardType} 저장 완료! card_id: ${result.card_id}`);
      return result;
    } else {
      throw new Error(result.error || '카드 저장 실패');
    }
  } catch (error) {
    console.error(`❌ ${cardType} 저장 실패:`, error);
    throw error;
  }
}

/**
 * 카드 조회 API
 */
export async function queryCards(nbMin, nbMax, limit = 20) {
  const url = `${CONFIG.API_BASE_URL}/cards/chart-analysis/query`;
  
  try {
    const result = await apiRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nb_min: nbMin,
        nb_max: nbMax,
        limit: limit
      })
    });
    
    return result;
  } catch (error) {
    console.error('카드 조회 실패:', error);
    throw error;
  }
}

/**
 * 자산 정보 조회 API
 */
export async function getAssetInfo() {
  const url = `${CONFIG.API_BASE_URL}/get_asset_info`;
  
  try {
    const result = await apiRequest(url, {
      method: 'GET'
    });
    
    return result;
  } catch (error) {
    console.error('자산 정보 조회 실패:', error);
    throw error;
  }
}

/**
 * 현재 가격 조회 API
 */
export async function getCurrentPrice(market = 'KRW-BTC') {
  const url = `${CONFIG.API_BASE_URL}/get_current_price?market=${market}`;
  
  try {
    const result = await apiRequest(url, {
      method: 'GET'
    });
    
    return result.currentPrice;
  } catch (error) {
    console.error('현재 가격 조회 실패:', error);
    throw error;
  }
}

/**
 * 차트 데이터 조회 API (OHLCV 엔드포인트 사용)
 */
export async function getChartData(market = 'KRW-BTC', interval = 'day', count = 200) {
  const url = `${CONFIG.API_BASE_URL}/ohlcv?market=${market}&interval=${interval}&count=${count}`;
  
  try {
    const result = await apiRequest(url, {
      method: 'GET'
    });
    
    return result;
  } catch (error) {
    console.error('차트 데이터 조회 실패:', error);
    throw error;
  }
}

/**
 * AI 예측 API
 */
export async function predictWithAI(options = {}) {
  const {
    market = 'KRW-BTC',
    interval = 'day',
    count = 200,
    n = 1,
    train = false,
    modelType = 'RandomForest',
    ohlcvData = [],
    nbMax = null,
    nbMin = null
  } = options;
  
  const url = `${CONFIG.API_BASE_URL}/ai/predict`;
  
  console.log(`🤖 AI 예측 요청: ${modelType}, train=${train}, n=${n}`);
  
  try {
    // body 구성: nbMax/nbMin 우선, 없으면 ohlcv_data 포함
    const body = {
      market,
      interval,
      count,
      n,
      train,
      model_type: modelType
    };
    if (nbMax !== null && nbMin !== null) {
      body.nb_max = nbMax;
      body.nb_min = nbMin;
      // If this is a training request, include the chart that was used to compute N/B
      if (train && Array.isArray(ohlcvData) && ohlcvData.length > 0) {
        body.ohlcv_data = ohlcvData;
      }
    } else if (Array.isArray(ohlcvData) && ohlcvData.length > 0) {
      body.ohlcv_data = ohlcvData;
    }

    const result = await apiRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: CONFIG.TIMEOUTS.AI_PREDICT
    }, 1); // AI 예측은 재시도 1회만
    
    if (result.success) {
      console.log('✅ AI 예측 성공:', result);
      return result;
    } else {
      throw new Error(result.error || 'AI 예측 실패');
    }
  } catch (error) {
    console.error('❌ AI 예측 실패:', error);
    throw error;
  }
}

/**
 * 모델 학습 상태 확인 API
 */
export async function checkModelStatus(interval = 'day', modelType = 'RandomForest') {
  const url = `${CONFIG.API_BASE_URL}/ai/model/status?interval=${interval}&model_type=${modelType}`;

  console.log(`🔍 모델 상태 확인 요청: ${url}`);
  try {
    const result = await apiRequest(url, {
      method: 'GET'
    });

    return result;
  } catch (error) {
    // 410 에러는 AI 학습 기능 제거
    if (error.message && error.message.includes('410')) {
      console.log('ℹ️ AI 학습 기능이 제거되었습니다');
      return { success: false, model_exists: false, removed: true };
    }
    // 404는 엔드포인트가 없거나 경로가 변경된 경우로 처리
    if (error.message && error.message.includes('404')) {
      console.warn('⚠️ 모델 상태 엔드포인트를 찾을 수 없습니다 (404). 서버 API가 변경되었을 수 있습니다:', url);
      return { success: false, model_exists: false, not_found: true };
    }

    // 그 외 에러는 호출자에서 처리
    throw error;
  }
}

/**
 * 모델 재학습 API
 */
export async function retrainModel(options = {}) {
  const {
    market = 'KRW-BTC',
    interval = 'day',
    count = 200,
    modelType = 'RandomForest',
    ohlcvData = []
  } = options;
  
  const url = `${CONFIG.API_BASE_URL}/ai/retrain`;
  
  console.log(`🔄 모델 재학습 요청: ${modelType}`);
  
  try {
    const result = await apiRequest(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        market,
        interval,
        count,
        model_type: modelType,
        ohlcv_data: ohlcvData
      }),
      timeout: CONFIG.TIMEOUTS.AI_PREDICT
    }, 1);
    
    if (result.success) {
      console.log('✅ 모델 재학습 완료:', result);
      return result;
    } else {
      throw new Error(result.error || '모델 재학습 실패');
    }
  } catch (error) {
    console.error('❌ 모델 재학습 실패:', error);
    throw error;
  }
}

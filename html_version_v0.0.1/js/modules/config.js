/**
 * 차트 분석 시스템 설정 및 상수
 */

export const CONFIG = {
  // API 설정
  API_BASE_URL: 'http://localhost:5000/api',
  
  // 타임아웃 설정 (밀리초)
  TIMEOUTS: {
    AI_PREDICT: 180000,      // AI 예측: 180초 (증가)
    API_REQUEST: 60000,      // 일반 API: 60초 (증가)
    SAVE_CARD: 120000,       // 카드 저장: 120초
    RETRY_DELAY: 2000        // 재시도 지연: 2초
  },
  
  // 재시도 설정
  RETRY: {
    MAX_ATTEMPTS: 3,         // 최대 재시도 횟수
    BACKOFF_MULTIPLIER: 1.5  // 백오프 배율
  },
  
  // 차트 설정
  CHART: {
    DEFAULT_COUNT: 150,      // 기본 캔들 개수 (네트워크 부하 완화)
    CARD_CHART_COUNT: 30,    // 카드 차트 캔들 개수
    UPDATE_INTERVAL: 60000,  // 차트 업데이트 간격 (1분)
    MIN_CANDLES: 10          // 최소 캔들 개수
  },
  
  // 카드 검증 설정
  VERIFICATION: {
    ERROR_THRESHOLD_STRICT: 2,   // 엄격한 오차 기준 (%)
    ERROR_THRESHOLD_LOOSE: 5,    // 느슨한 오차 기준 (%)
    MIN_CONFIDENCE: 0.5          // 최소 신뢰도
  },
  
  // 자산 업데이트 설정
  ASSET: {
    UPDATE_INTERVAL: 180000,     // 정기 업데이트: 3분
    CHANGE_CHECK_INTERVAL: 30000 // 변경 체크: 30초
  },
  
  // 저장 설정
  STORAGE: {
    DEBOUNCE_DELAY: 1000,        // 디바운스 지연 (1초)
    AUTO_SAVE: true              // 자동 저장 활성화
  },
  
  // 분봉 설정
  INTERVALS: {
    minute1: { name: '1분', value: 'minute1', seconds: 60 },
    minute3: { name: '3분', value: 'minute3', seconds: 180 },
    minute5: { name: '5분', value: 'minute5', seconds: 300 },
    minute10: { name: '10분', value: 'minute10', seconds: 600 },
    minute15: { name: '15분', value: 'minute15', seconds: 900 },
    minute30: { name: '30분', value: 'minute30', seconds: 1800 },
    minute60: { name: '60분', value: 'minute60', seconds: 3600 },
    minute240: { name: '4시간', value: 'minute240', seconds: 14400 },
    day: { name: '일봉', value: 'day', seconds: 86400 },
    week: { name: '주봉', value: 'week', seconds: 604800 },
    month: { name: '월봉', value: 'month', seconds: 2592000 }
  },
  
  // AI 모델 설정
  AI: {
    DEFAULT_MODEL: 'RandomForest',
    MODELS: ['RandomForest', 'XGBoost', 'LSTM'],
    TRAINING_DATA_MIN: 50        // 학습에 필요한 최소 데이터 개수
  },
  
  // 색상 테마
  COLORS: {
    UP: '#0ecb81',
    DOWN: '#f6465d',
    BLUE_ZONE: '#4285f4',
    ORANGE_ZONE: '#ff9800',
    NEUTRAL: '#9aa0a6',
    BACKGROUND: '#0b1220',
    PANEL: '#161c2b'
  }
};

// 전역 상태 (모듈에서 공유)
export const STATE = {
  currentInterval: 'day',
  currentPrice: 0,
  allData: [],
  globalModelTrained: false,
  isTrainingInProgress: false,
  pendingCards: [],
  verifiedCards: [],
  boughtCards: [],
  defaultBuyAmount: 10000,
  card1Prediction: null,
  lastSaveTime: 0,
  saveDebounceTimer: null
};

// LocalStorage 키
export const STORAGE_KEYS = {
  ANALYSIS_DATA: 'chartAnalysisData_v3',
  VERIFIED_CARDS: 'verifiedCards_v2',
  AI_STATUS: 'aiStatus_v1',
  ASSET_INFO: 'assetInfo_v1',
  SETTINGS: 'userSettings_v1'
};

// 유틸리티 함수
export function getIntervalName(interval) {
  return CONFIG.INTERVALS[interval]?.name || interval;
}

export function getIntervalSeconds(interval) {
  return CONFIG.INTERVALS[interval]?.seconds || 60;
}

export function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  return num.toLocaleString('ko-KR');
}

export function formatPrice(price) {
  if (price === null || price === undefined) return '-';
  return `${formatNumber(Math.round(price))} 원`;
}

export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatNBValue(value, decimals = 10) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toFixed(decimals);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

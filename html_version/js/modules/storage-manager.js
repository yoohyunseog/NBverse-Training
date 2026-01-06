/**
 * LocalStorage 관리 모듈
 * - 데이터 저장/로드
 * - 디바운싱 처리
 */

import { CONFIG, STATE, STORAGE_KEYS } from './config.js';

/**
 * 분석 데이터 저장 (디바운싱)
 */
export function saveAnalysisData(immediate = false) {
  if (!CONFIG.STORAGE.AUTO_SAVE && !immediate) return;
  
  // 디바운싱: 마지막 호출 후 1초 뒤에 저장
  if (STATE.saveDebounceTimer) {
    clearTimeout(STATE.saveDebounceTimer);
  }
  
  if (immediate) {
    performSave();
  } else {
    STATE.saveDebounceTimer = setTimeout(performSave, CONFIG.STORAGE.DEBOUNCE_DELAY);
  }
}

/**
 * 실제 저장 수행
 */
function performSave() {
  try {
    const dataToSave = {
      currentInterval: STATE.currentInterval,
      pendingCards: STATE.pendingCards,
      verifiedCards: STATE.verifiedCards,
      boughtCards: STATE.boughtCards,
      defaultBuyAmount: STATE.defaultBuyAmount ?? 10000,
      currentPrice: STATE.currentPrice,
      lastSaveTime: Date.now(),
      version: 3
    };
    
    localStorage.setItem(STORAGE_KEYS.ANALYSIS_DATA, JSON.stringify(dataToSave));
    STATE.lastSaveTime = Date.now();
    
  } catch (error) {
    console.error('💾 저장 실패:', error);
  }
}

/**
 * 분석 데이터 로드
 */
export function loadAnalysisData() {
  try {
    const savedData = localStorage.getItem(STORAGE_KEYS.ANALYSIS_DATA);
    if (!savedData) return null;
    
    const data = JSON.parse(savedData);
    
    // 버전 체크
    if (data.version !== 3) {
      console.warn('⚠️ 저장된 데이터 버전이 다릅니다. 초기화합니다.');
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('📂 로드 실패:', error);
    return null;
  }
}

/**
 * 검증 완료 카드 저장
 */
export function saveVerifiedCards(cards) {
  try {
    localStorage.setItem(STORAGE_KEYS.VERIFIED_CARDS, JSON.stringify(cards));
  } catch (error) {
    console.error('검증 완료 카드 저장 실패:', error);
  }
}

/**
 * 검증 완료 카드 로드
 */
export function loadVerifiedCards() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.VERIFIED_CARDS);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error('검증 완료 카드 로드 실패:', error);
    return [];
  }
}

/**
 * AI 상태 저장
 */
export function saveAIStatus(status) {
  try {
    localStorage.setItem(STORAGE_KEYS.AI_STATUS, JSON.stringify(status));
  } catch (error) {
    console.error('AI 상태 저장 실패:', error);
  }
}

/**
 * AI 상태 로드
 */
export function loadAIStatus() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.AI_STATUS);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('AI 상태 로드 실패:', error);
    return null;
  }
}

/**
 * 자산 정보 저장
 */
export function saveAssetInfo(assetInfo) {
  try {
    localStorage.setItem(STORAGE_KEYS.ASSET_INFO, JSON.stringify({
      ...assetInfo,
      cachedTime: Date.now()
    }));
  } catch (error) {
    console.error('자산 정보 저장 실패:', error);
  }
}

/**
 * 자산 정보 로드
 */
export function loadAssetInfo() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.ASSET_INFO);
    if (!saved) return null;
    
    const data = JSON.parse(saved);
    
    // 캐시 유효 기간 체크 (3분)
    const age = Date.now() - (data.cachedTime || 0);
    if (age > 180000) {
      return null; // 오래된 캐시
    }
    
    return data;
  } catch (error) {
    console.error('자산 정보 로드 실패:', error);
    return null;
  }
}

/**
 * 분봉별 카드 데이터 저장
 */
export function saveCardsByTimeframe(timeframe, cards) {
  try {
    const key = `${STORAGE_KEYS.ANALYSIS_DATA}_${timeframe}`;
    localStorage.setItem(key, JSON.stringify({
      timeframe,
      cards,
      savedTime: Date.now()
    }));
    console.log(`💾 ${timeframe} 분봉 카드 데이터 저장 완료`);
  } catch (error) {
    console.error(`${timeframe} 카드 저장 실패:`, error);
  }
}

/**
 * 분봉별 카드 데이터 로드
 */
export function loadCardsByTimeframe(timeframe) {
  try {
    const key = `${STORAGE_KEYS.ANALYSIS_DATA}_${timeframe}`;
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    
    const data = JSON.parse(saved);
    console.log(`📂 ${timeframe} 분봉 카드 데이터 복원 완료`);
    return data;
  } catch (error) {
    console.error(`${timeframe} 카드 로드 실패:`, error);
    return null;
  }
}

/**
 * 모든 저장 데이터 삭제
 */
export function clearAllData() {
  try {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    
    // 분봉별 데이터도 삭제
    const intervals = Object.keys(CONFIG.INTERVALS);
    intervals.forEach(interval => {
      const key = `${STORAGE_KEYS.ANALYSIS_DATA}_${interval}`;
      localStorage.removeItem(key);
    });
    
    console.log('🗑️ 모든 저장 데이터 삭제 완료');
  } catch (error) {
    console.error('데이터 삭제 실패:', error);
  }
}

/**
 * 저장소 용량 확인
 */
export function getStorageUsage() {
  try {
    let total = 0;
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return {
      used: total,
      usedMB: (total / 1024 / 1024).toFixed(2),
      percentage: ((total / (5 * 1024 * 1024)) * 100).toFixed(1)
    };
  } catch (error) {
    console.error('저장소 용량 확인 실패:', error);
    return null;
  }
}

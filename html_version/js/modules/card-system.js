/**
 * 카드 시스템 모듈
 * - 카드 생성/검증
 * - 카드 렌더링
 */

import { CONFIG, STATE, formatPrice, formatPercent, formatNBValue, getIntervalName } from './config.js';
import { createCardChart } from './chart-manager.js';
import { saveCard } from './nbverse-client.js';
import { saveAnalysisData, saveVerifiedCards, saveCardsByTimeframe } from './storage-manager.js';

/**
 * 카드 생성 (Card2 - 현재 상태)
 */
export function createCard2(data) {
  const {
    currentPrice,
    currentTime,
    emaFast,
    emaSlow,
    nbResult,
    chartData
  } = data;
  
  return {
    price: currentPrice,
    time: currentTime,
    emaFast: emaFast,
    emaSlow: emaSlow,
    nb_value: nbResult.nbValue,
    nb_max: nbResult.nbMax,
    nb_min: nbResult.nbMin,
    productionDate: new Date().toISOString(),
    productionTimeframe: STATE.currentInterval,
    chartData: chartData || []
  };
}

/**
 * 카드 생성 (Card1 - 예측)
 */
export function createCard1(prediction, chartData) {
  return {
    predictedPrice: prediction.predictedPrice,
    predictedChangeRate: prediction.predictedChangeRate,
    confidence: prediction.confidence,
    nb_value: prediction.nbValue,
    nb_max: prediction.nbMax,
    nb_min: prediction.nbMin,
    predictedZone: prediction.predictedZone,
    modelType: prediction.modelType,
    trainR2: prediction.trainR2,
    valR2: prediction.valR2,
    productionDate: new Date().toISOString(),
    productionTimeframe: STATE.currentInterval,
    chartData: chartData || []
  };
}

/**
 * 카드 검증
 */
export function verifyCard(previousCard2, currentCard2, prediction) {
  const actualPrice = currentCard2.price;
  const predictedPrice = prediction.predictedPrice;
  const productionPrice = previousCard2.price;
  
  // 오차 계산
  const error = Math.abs(((actualPrice - predictedPrice) / predictedPrice) * 100);
  
  // 방향 확인
  const predictedDirection = predictedPrice > productionPrice ? 'up' : 'down';
  const actualDirection = actualPrice > productionPrice ? 'up' : 'down';
  const isDirectionCorrect = predictedDirection === actualDirection;
  
  // 정확도 판정
  const isAccurate = error < CONFIG.VERIFICATION.ERROR_THRESHOLD_STRICT;
  
  // 가격 변화율
  const priceChangeRate = ((actualPrice - productionPrice) / productionPrice) * 100;
  
  return {
    id: `verified_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timeframe: STATE.currentInterval,
    timeframeName: getIntervalName(STATE.currentInterval),
    productionDate: prediction.productionDate,
    verifiedTime: new Date().toISOString(),
    productionPrice: productionPrice,
    predictedPrice: predictedPrice,
    actualPrice: actualPrice,
    error: error,
    isAccurate: isAccurate,
    isDirectionCorrect: isDirectionCorrect,
    priceChangeRate: priceChangeRate,
    confidence: prediction.confidence,
    modelType: prediction.modelType || 'Basic',
    nbValue: prediction.nb_value,
    nbMax: prediction.nb_max,
    nbMin: prediction.nb_min,
    data: prediction.chartData || []
  };
}

/**
 * 검증 완료 카드 추가
 */
export function addVerifiedCard(verifiedCard) {
  console.log('📝 검증 완료 카드 추가 전:', {
    currentCount: STATE.verifiedCards.length,
    newCard: verifiedCard
  });
  
  // 중복 방지
  const exists = STATE.verifiedCards.some(card => 
    card.productionDate === verifiedCard.productionDate &&
    card.timeframe === verifiedCard.timeframe
  );
  
  if (exists) {
    console.warn('⚠️ 이미 존재하는 검증 카드입니다');
    return false;
  }
  
  // 최신순으로 추가
  STATE.verifiedCards.unshift(verifiedCard);
  
  // 최대 100개 유지
  if (STATE.verifiedCards.length > 100) {
    STATE.verifiedCards = STATE.verifiedCards.slice(0, 100);
  }
  
  // 저장
  saveVerifiedCards(STATE.verifiedCards);
  saveAnalysisData();
  
  console.log('✅ 검증 완료 카드 추가 완료:', {
    totalCount: STATE.verifiedCards.length,
    cardId: verifiedCard.id
  });
  
  return true;
}

/**
 * 검증 완료 카드 렌더링
 */
export function renderVerifiedCards(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // 최신순 정렬
  const sortedCards = [...STATE.verifiedCards].sort((a, b) => 
    new Date(b.verifiedTime) - new Date(a.verifiedTime)
  );
  
  if (sortedCards.length === 0) {
    container.innerHTML = `<div style="color: #9aa0a6; text-align: center; padding: 20px; font-size: 12px;">검증 완료된 카드가 없습니다.</div>`;
    return;
  }
  
  container.innerHTML = '';
  
  sortedCards.forEach((verifiedCard) => {
    const cardEl = createVerifiedCardElement(verifiedCard);
    container.appendChild(cardEl);
  });
}

/**
 * 검증 완료 카드 요소 생성
 */
function createVerifiedCardElement(verifiedCard) {
  const cardEl = document.createElement('div');
  cardEl.className = 'verified-card';
  cardEl.id = verifiedCard.id;
  
  const accuracyColor = verifiedCard.isAccurate ? CONFIG.COLORS.UP : 
                        verifiedCard.isDirectionCorrect ? '#ffc107' : CONFIG.COLORS.DOWN;
  const accuracyText = verifiedCard.isAccurate ? '높은 정확도' : 
                       verifiedCard.isDirectionCorrect ? '방향 정확' : '예측 실패';
  
  cardEl.innerHTML = `
    <div class="verified-card-header">
      <div class="verified-badge" style="background: ${accuracyColor};">
        ${accuracyText}
      </div>
      <div class="verified-time">${new Date(verifiedCard.verifiedTime).toLocaleString('ko-KR')}</div>
    </div>
    <div class="verified-card-body">
      <div class="verified-stat">
        <span class="stat-label">분봉:</span>
        <span class="stat-value">${verifiedCard.timeframeName}</span>
      </div>
      <div class="verified-stat">
        <span class="stat-label">예측 가격:</span>
        <span class="stat-value">${formatPrice(verifiedCard.predictedPrice)}</span>
      </div>
      <div class="verified-stat">
        <span class="stat-label">실제 가격:</span>
        <span class="stat-value">${formatPrice(verifiedCard.actualPrice)}</span>
      </div>
      <div class="verified-stat">
        <span class="stat-label">오차:</span>
        <span class="stat-value" style="color: ${accuracyColor};">${verifiedCard.error.toFixed(2)}%</span>
      </div>
      <div class="verified-stat">
        <span class="stat-label">가격 변화:</span>
        <span class="stat-value" style="color: ${verifiedCard.priceChangeRate >= 0 ? CONFIG.COLORS.UP : CONFIG.COLORS.DOWN};">
          ${formatPercent(verifiedCard.priceChangeRate)}
        </span>
      </div>
      <div class="verified-stat">
        <span class="stat-label">신뢰도:</span>
        <span class="stat-value">${(verifiedCard.confidence * 100).toFixed(1)}%</span>
      </div>
    </div>
    ${verifiedCard.data && verifiedCard.data.length > 0 ? `
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

/**
 * 카드 NBVerse 저장
 */
export async function saveCardToNBVerse(cardType, cardData) {
  try {
    const result = await saveCard(cardType, cardData);
    return result;
  } catch (error) {
    console.error(`카드 저장 실패 (${cardType}):`, error);
    throw error;
  }
}

/**
 * 캐시된 차트 슬라이스 가져오기
 */
export function getCachedChartSlice(count = 30) {
  if (!STATE.allData || STATE.allData.length === 0) return [];
  return STATE.allData.slice(-count);
}

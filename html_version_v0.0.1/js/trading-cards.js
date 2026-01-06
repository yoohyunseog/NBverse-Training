// 트레이딩 카드 관련 모듈 (8단계)
// Note: tradingCards, ownedCards, and tradingCardsGenerated are declared in globals.js

// 카드 가격 예측 방향 판단
function predictPriceDirection(card) {
  // N/B 값으로 가격 방향 예측
  const nbValue = card.nb_value || 0;
  
  // N/B 값이 0.5 이상이면 상승 예측, 미만이면 하락 예측
  // (기준값은 조정 가능)
  const direction = nbValue >= 0.5 ? 'up' : 'down';
  const confidence = Math.abs(nbValue - 0.5) * 100; // 신뢰도
  
  return {
    direction: direction, // 'up' or 'down'
    nbValue: nbValue,
    confidence: confidence,
    label: direction === 'up' ? '📈 상승예측' : '📉 하락예측'
  };
}

// 카드 검증 함수 (가격 방향 포함)
function verifyCard(card) {
  const currentPrice = window.collectedData?.chart?.current_price || 0;
  const cardPrice = card.price || 0;
  
  // 가격 변동 방향
  const priceChange = currentPrice - cardPrice;
  const priceChangePercent = ((priceChange / cardPrice) * 100).toFixed(2);
  const actualDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'flat';
  
  // 예측 방향
  const prediction = predictPriceDirection(card);
  
  // 검증: 예측 방향과 실제 방향이 일치하는가?
  const isDirectionMatched = prediction.direction === actualDirection;
  
  // 가격 범위 검증 (5% 범위)
  const priceRange = Math.abs(cardPrice * 0.05);
  const isInRange = Math.abs(currentPrice - cardPrice) <= priceRange;
  
  // 최종 검증 결과 (방향 일치 AND 범위 내)
  const isVerified = isDirectionMatched && isInRange;
  
  console.log('📊 카드 검증 상세:', {
    cardPrice: cardPrice,
    currentPrice: currentPrice,
    priceChange: priceChange,
    priceChangePercent: priceChangePercent + '%',
    prediction: prediction.label + ` (신뢰도: ${prediction.confidence.toFixed(1)}%)`,
    actualDirection: actualDirection === 'up' ? '📈 상승' : actualDirection === 'down' ? '📉 하락' : '➡️ 보합',
    isDirectionMatched: isDirectionMatched ? '✅ 방향 일치' : '❌ 방향 불일치',
    isInRange: isInRange ? '✅ 범위 내' : '❌ 범위 외',
    isVerified: isVerified ? '✅ 검증 성공' : '⚠️ 검증 실패'
  });
  
  return {
    isVerified: isVerified,
    prediction: prediction,
    actualDirection: actualDirection,
    priceChange: priceChange,
    priceChangePercent: parseFloat(priceChangePercent),
    isDirectionMatched: isDirectionMatched,
    isInRange: isInRange
  };
}

// 검증 완료된 카드를 저장하는 함수 (상세 정보 포함)
async function saveVerifiedCard(card) {
  try {
    const now = new Date();
    
    // 저장할 카드 정보 (상세 버전)
    const detailedCard = {
      // 기본 카드 정보
      card_id: card.card_id,
      card_type: card.card_type,
      duplicate_tag: card.duplicate_tag,
      status: card.status,
      
      // 가격 정보
      price: card.price,
      verified_price: card.verified_price,
      
      // 기술 지표
      nb_value: card.nb_value,
      bit_max: card.bit_max,
      bit_min: card.bit_min,
      
      // 거래량 정보
      volume: card.volume,
      volume_bit_max: card.volume_bit_max,
      volume_bit_min: card.volume_bit_min,
      
      // 거래대금 정보
      trade_amount: card.trade_amount,
      trade_amount_bit_max: card.trade_amount_bit_max,
      trade_amount_bit_min: card.trade_amount_bit_min,
      
      // 타임프레임 정보
      timeframe: card.timeframe,
      
      // 검증 정보
      verification_status: card.verification_status,
      verified_at: card.verified_at,
      
      // 시간 정보
      created_at: card.created_at,
      
      // 저장 정보
      saved_at: now.toLocaleString('ko-KR'),
      saved_timestamp: now.getTime(),
      version: '1.0'
    };
    
    // 로컬 스토리지에서 기존 저장된 카드 가져오기
    const savedCardsKey = 'verified_trading_cards';
    const existingCards = JSON.parse(localStorage.getItem(savedCardsKey) || '[]');
    
    // 중복 체크 (같은 card_id가 있으면 업데이트)
    const existingIndex = existingCards.findIndex(c => c.card_id === card.card_id);
    
    if (existingIndex >= 0) {
      existingCards[existingIndex] = detailedCard;
      console.log('🔄 카드 업데이트:', card.card_id);
    } else {
      existingCards.push(detailedCard);
      console.log('💾 새 카드 저장:', card.card_id);
    }
    
    // 로컬 스토리지에 저장
    localStorage.setItem(savedCardsKey, JSON.stringify(existingCards));
    
    // 상세 저장 로그 추가
    const saveLog = {
      card_id: card.card_id,
      action: existingIndex >= 0 ? 'update' : 'create',
      timestamp: now.getTime(),
      saved_at: now.toLocaleString('ko-KR')
    };
    
    // 저장 로그 기록
    const logsKey = 'card_save_logs';
    const existingLogs = JSON.parse(localStorage.getItem(logsKey) || '[]');
    existingLogs.push(saveLog);
    // 최근 100개의 로그만 유지
    if (existingLogs.length > 100) {
      existingLogs.shift();
    }
    localStorage.setItem(logsKey, JSON.stringify(existingLogs));
    
    // 통계 업데이트
    const stats = JSON.parse(localStorage.getItem('card_statistics') || '{"total": 0, "verified": 0}');
    stats.total = existingCards.length;
    stats.verified = existingCards.filter(c => c.verification_status === '검증완료').length;
    stats.lastSaved = now.toLocaleString('ko-KR');
    stats.lastSavedTimestamp = now.getTime();
    localStorage.setItem('card_statistics', JSON.stringify(stats));
    
    console.log('✅ 카드 저장 완료:', {
      cardId: card.card_id,
      totalCards: stats.total,
      verifiedCards: stats.verified,
      savedAt: stats.lastSaved
    });
    
    return true;
  } catch (error) {
    console.error('❌ 카드 저장 실패:', error);
    return false;
  }
}

// 가격 기반 max 카드 자동 생성
async function generateTradingCards(auto = false) {
  const predictionCard = window.getLatestPredictionCard();
  
  if (!predictionCard && !window.lastNBResult && !window.currentPayloadForAnalysis?.card_data) {
    if (!auto) alert('N/B 계산 또는 카드 데이터가 없습니다.');
    console.log('⚠️ generateTradingCards: 데이터 없음');
    return;
  }

  if (auto && window.tradingCardsGenerated) {
    console.log('⚠️ generateTradingCards: 이미 생성됨');
    return;
  }

  console.log('✅ generateTradingCards: 시작', { predictionCard, lastNBResult: window.lastNBResult });

  window.updateFlowStep('trade-flow-start', 'active');
  window.updateFlowStep('trade-flow-start', 'completed');

  window.updateFlowStep('trade-flow-import', 'active');
  const sourceCard = predictionCard || window.currentPayloadForAnalysis?.card_data || {};
  const currentPrice = sourceCard.price ?? window.collectedData?.chart?.current_price ?? 0;
  
  if (currentPrice <= 0) {
    if (!auto) alert('유효한 가격 정보가 없습니다.');
    window.updateFlowStep('trade-flow-import', 'error');
    console.log('⚠️ generateTradingCards: 가격 정보 없음', currentPrice);
    return;
  }
  
  window.updateFlowStep('trade-flow-import', 'completed');

  // 차트 드로잉 단계
  window.updateFlowStep('trade-flow-chart', 'active');
  
  // 차트 렌더링
  if (window.updateUpbitChartDisplay && typeof window.updateUpbitChartDisplay === 'function') {
    try {
      window.updateUpbitChartDisplay();
      console.log('✅ 8단계: 차트 렌더링 완료');
    } catch (err) {
      console.warn('⚠️ 8단계: 차트 렌더링 실패', err);
    }
  }
  
  window.updateFlowStep('trade-flow-chart', 'completed');

  window.updateFlowStep('trade-flow-generate', 'active');

  const serverCardId = sourceCard.card_id || window.lastCardResponse?.card_id || sourceCard.card_key || `basic_nb_card2_${Date.now()}`;
  const duplicateTag = sourceCard.duplicate_tag || (window.currentAnalysisDuplicate ? '중첩 카드' : sourceCard.card_type) || '매매 카드';
  const cardTypeLabel = sourceCard.card_type || (predictionCard ? '예측 카드' : 'basic_nb_card2');

  const newCard = {
    card_id: serverCardId,
    card_type: cardTypeLabel,
    duplicate_tag: duplicateTag,
    price: currentPrice,
    nb_value: sourceCard.nb_value ?? window.lastNBResult?.nb_value ?? 0,
    bit_max: sourceCard.bit_max ?? window.lastNBResult?.bit_max ?? 0,
    bit_min: sourceCard.bit_min ?? window.lastNBResult?.bit_min ?? 0,
    volume: sourceCard.volume ?? window.collectedData?.chart?.volume ?? 0,
    trade_amount: sourceCard.trade_amount ?? window.collectedData?.chart?.trade_amount ?? 0,
    volume_bit_max: sourceCard.volume_bit_max,
    volume_bit_min: sourceCard.volume_bit_min,
    trade_amount_bit_max: sourceCard.trade_amount_bit_max,
    trade_amount_bit_min: sourceCard.trade_amount_bit_min,
    timeframe: sourceCard.timeframe || window.currentPayloadForAnalysis?.timeframe || window.selectedTimeframeValue,
    created_at: sourceCard.created_at || new Date().toLocaleString('ko-KR'),
    status: '미보유'
  };

  window.tradingCards.push(newCard);
  window.tradingCardsGenerated = true;
  
  // 검증 플로우 시작
  window.updateFlowStep('trade-flow-verify', 'active');
  
  // 카드 검증 (예측 방향과 실제 가격 변동 비교)
  const verificationResult = verifyCard(newCard);
  
  // 검증 결과 카드에 저장
  newCard.verification_result = verificationResult;
  newCard.prediction_direction = verificationResult.prediction.label;
  newCard.prediction_nb_value = verificationResult.prediction.nbValue;
  newCard.prediction_confidence = verificationResult.prediction.confidence;
  
  if (verificationResult.isVerified) {
    newCard.verification_status = '검증완료';
    newCard.verified_at = new Date().toLocaleString('ko-KR');
    newCard.verified_price = verificationResult.actualDirection;
    console.log('✅ 카드 검증 완료:', {
      cardId: newCard.card_id,
      prediction: verificationResult.prediction.label,
      actualDirection: verificationResult.actualDirection === 'up' ? '📈 상승' : '📉 하락',
      directionMatch: verificationResult.isDirectionMatched ? '✅' : '❌',
      priceChange: verificationResult.priceChangePercent + '%'
    });
  } else {
    newCard.verification_status = '검증대기';
    console.log('⏳ 카드 검증 대기:', {
      cardId: newCard.card_id,
      reason: !verificationResult.isDirectionMatched ? '예측 방향 불일치' : '가격 범위 초과',
      prediction: verificationResult.prediction.label,
      actual: verificationResult.actualDirection === 'up' ? '📈 상승' : '📉 하락'
    });
  }
  
  window.updateFlowStep('trade-flow-verify', 'completed');
  renderTradingCards();
  
  // 저장 플로우 시작 (검증 완료된 카드만 저장)
  window.updateFlowStep('trade-flow-save', 'active');
  
  if (verificationResult.isVerified) {
    // 검증 완료 카드를 로컬 스토리지에 저장
    await saveVerifiedCard(newCard);
  } else {
    console.log('⏭️ 검증대기 카드는 저장하지 않습니다:', newCard.card_id);
  }
  
  window.updateFlowStep('trade-flow-save', 'completed');
  
  // 카드 생성 통계 업데이트
  if (typeof window.incrementCardCount === 'function') {
    window.incrementCardCount();
  }

  window.updateFlowStep('trade-flow-generate', 'completed');
  
  // 8단계 완료 후 9단계 자동 활성화
  setTimeout(() => {
    window.updateProgressStep('step8', 'completed');
    window.updateProgressStep('step9', 'active');
    
    // 자동 순회 모드일 경우 플로우 리셋 후 다음 분봉으로 이동
    if (window.isAutoLooping) {
      console.log('🔄 자동 순회 모드: 9단계 플로우 리셋 시작');
      
      setTimeout(async () => {
        await window.runFlowReset();
        // 플로우 리셋 완료 후 다음 분봉으로 이동
        setTimeout(() => {
          window.moveToNextTimeframe();
        }, 1000);
      }, 1500);
    }
  }, 300);
}

// 트레이딩 카드 렌더링
function renderTradingCards() {
  const container = document.getElementById('tradingCardList');
  if (!container) return;

  if (window.tradingCards.length === 0) {
    container.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 20px;">생성된 카드가 없습니다. 위의 버튼을 클릭해 카드를 생성하세요.</div>';
    return;
  }

  container.innerHTML = window.tradingCards.map((card, idx) => {
    const vResult = card.verification_result;
    const verificationDisplay = vResult ? `
      <div style="margin-top: 8px; padding: 8px; background: rgba(88,166,255,0.05); border-left: 2px solid rgba(88,166,255,0.3); font-size: 11px; color: #c9d1d9;">
        <div style="margin-bottom: 4px;">
          <strong>📊 예측:</strong> ${vResult.prediction.label} (신뢰도: ${vResult.prediction.confidence.toFixed(1)}%)
        </div>
        <div style="margin-bottom: 4px;">
          <strong>📈 실제:</strong> ${vResult.actualDirection === 'up' ? '📈 상승' : vResult.actualDirection === 'down' ? '📉 하락' : '➡️ 보합'} (${vResult.priceChangePercent}%)
        </div>
        <div style="margin-bottom: 4px;">
          <strong>✓ 방향:</strong> ${vResult.isDirectionMatched ? '✅ 일치' : '❌ 불일치'}
        </div>
        <div>
          <strong>📍 범위:</strong> ${vResult.isInRange ? '✅ 범위내' : '❌ 범위외'}
        </div>
      </div>
    ` : '';

    return `
      <div style="background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.2); border-radius: 8px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: 700; color: #58a6ff; font-size: 13px;">
            📌 ${card.card_type || '기본 카드'} (${card.duplicate_tag || '신규'})
            ${card.verification_status === '검증완료' ? '<span style="color: #3fb950; margin-left: 8px;">✅ 검증완료</span>' : '<span style="color: #d29922; margin-left: 8px;">⏳ 검증대기</span>'}
          </div>
          <button onclick="window.buyCard(${idx})" style="background: #3fb950; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 600;">💰 매수</button>
        </div>
        <div style="display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12px; color: #c9d1d9;">
          <div style="color: #8b949e;">카드 ID</div><div>${card.card_id}</div>
          <div style="color: #8b949e;">가격</div><div>${card.price?.toLocaleString('ko-KR') || '-'}</div>
          <div style="color: #8b949e;">검증상태</div><div>${card.verification_status || '검증대기'}</div>
          ${card.verified_at ? `<div style="color: #8b949e;">검증시각</div><div>${card.verified_at}</div>` : ''}
          <div style="color: #8b949e;">N/B 값</div><div>${Number(card.nb_value).toFixed(10)}</div>
          <div style="color: #8b949e;">bit_max/min</div><div>${Number(card.bit_max).toFixed(10)} / ${Number(card.bit_min).toFixed(10)}</div>
          <div style="color: #8b949e;">거래량</div><div>${card.volume?.toLocaleString('ko-KR') || '-'}</div>
          <div style="color: #8b949e;">거래대금</div><div>${card.trade_amount?.toLocaleString('ko-KR') || '-'}</div>
          <div style="color: #8b949e;">거래량 bit_max/min</div><div>${card.volume_bit_max !== undefined ? Number(card.volume_bit_max).toFixed(10) : '-'} / ${card.volume_bit_min !== undefined ? Number(card.volume_bit_min).toFixed(10) : '-'}</div>
          <div style="color: #8b949e;">거래대금 bit_max/min</div><div>${card.trade_amount_bit_max !== undefined ? Number(card.trade_amount_bit_max).toFixed(10) : '-'} / ${card.trade_amount_bit_min !== undefined ? Number(card.trade_amount_bit_min).toFixed(10) : '-'}</div>
          <div style="color: #8b949e;">타임프레임</div><div>${card.timeframe || '-'}</div>
          <div style="color: #8b949e;">생성 시각</div><div>${card.created_at}</div>
        </div>
        ${verificationDisplay}
      </div>
    `;
  }).join('');
}

// 카드 매수
function buyCard(index) {
  if (index < 0 || index >= window.tradingCards.length) return;
  const card = window.tradingCards[index];
  card.status = '보유중';
  window.ownedCards.push(card);
  window.tradingCards.splice(index, 1);
  
  renderTradingCards();
  renderOwnedCards();
}

// 보유 카드 렌더링
function renderOwnedCards() {
  const container = document.getElementById('ownedCardList');
  if (!container) return;

  if (window.ownedCards.length === 0) {
    container.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 20px;">매수된 카드가 없습니다.</div>';
    return;
  }

  container.innerHTML = window.ownedCards.map((card, idx) => `
    <div style="background: rgba(63,185,80,0.08); border: 1px solid rgba(63,185,80,0.2); border-radius: 8px; padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 700; color: #3fb950; font-size: 13px;">💳 보유중 (${card.card_type || '기본 카드'})</div>
        <button onclick="window.sellCard(${idx})" style="background: #f85149; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 600;">📤 매도</button>
      </div>
      <div style="display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12px; color: #c9d1d9;">
        <div style="color: #8b949e;">카드 ID</div><div>${card.card_id}</div>
        <div style="color: #8b949e;">중복 태그</div><div>${card.duplicate_tag || '신규'}</div>
        <div style="color: #8b949e;">매수 가격</div><div>${card.price?.toLocaleString('ko-KR') || '-'}</div>
        <div style="color: #8b949e;">N/B 값</div><div>${Number(card.nb_value).toFixed(10)}</div>
        <div style="color: #8b949e;">bit_max/min</div><div>${Number(card.bit_max).toFixed(10)} / ${Number(card.bit_min).toFixed(10)}</div>
        <div style="color: #8b949e;">거래량</div><div>${card.volume?.toLocaleString('ko-KR') || '-'}</div>
        <div style="color: #8b949e;">거래대금</div><div>${card.trade_amount?.toLocaleString('ko-KR') || '-'}</div>
        <div style="color: #8b949e;">거래량 bit_max/min</div><div>${card.volume_bit_max !== undefined ? Number(card.volume_bit_max).toFixed(10) : '-'} / ${card.volume_bit_min !== undefined ? Number(card.volume_bit_min).toFixed(10) : '-'}</div>
        <div style="color: #8b949e;">거래대금 bit_max/min</div><div>${card.trade_amount_bit_max !== undefined ? Number(card.trade_amount_bit_max).toFixed(10) : '-'} / ${card.trade_amount_bit_min !== undefined ? Number(card.trade_amount_bit_min).toFixed(10) : '-'}</div>
        <div style="color: #8b949e;">타임프레임</div><div>${card.timeframe || '-'}</div>
        <div style="color: #8b949e;">매수 시각</div><div>${card.created_at}</div>
      </div>
    </div>
  `).join('');
}

// 카드 매도
function sellCard(index) {
  if (index < 0 || index >= ownedCards.length) return;
  const card = ownedCards[index];
  const currentPrice = window.collectedData?.chart?.current_price || card.price;
  const profit = currentPrice - card.price;
  const profitRate = ((profit / card.price) * 100).toFixed(2);
  
  alert(`매도 완료!\n매수가: ${card.price?.toLocaleString('ko-KR')}\n현재가: ${currentPrice?.toLocaleString('ko-KR')}\n수익: ${profit?.toLocaleString('ko-KR')} (${profitRate}%)`);
  
  window.ownedCards.splice(index, 1);
  renderOwnedCards();
}

// 저장된 검증 카드 조회 (상세 정보 포함)
function getVerifiedCards() {
  try {
    const savedCardsKey = 'verified_trading_cards';
    const cards = JSON.parse(localStorage.getItem(savedCardsKey) || '[]');
    console.log('📋 저장된 카드 조회:', {
      total: cards.length,
      verified: cards.filter(c => c.verification_status === '검증완료').length,
      cards: cards
    });
    return cards;
  } catch (error) {
    console.error('❌ 카드 조회 실패:', error);
    return [];
  }
}

// 저장된 카드 통계 조회
function getCardStatistics() {
  try {
    const stats = JSON.parse(localStorage.getItem('card_statistics') || '{"total": 0, "verified": 0}');
    const logs = JSON.parse(localStorage.getItem('card_save_logs') || '[]');
    return {
      ...stats,
      recentLogs: logs.slice(-10) // 최근 10개 로그
    };
  } catch (error) {
    console.error('❌ 통계 조회 실패:', error);
    return { total: 0, verified: 0 };
  }
}

// 특정 카드 ID로 저장된 카드 상세 조회
function getCardById(cardId) {
  try {
    const cards = JSON.parse(localStorage.getItem('verified_trading_cards') || '[]');
    const card = cards.find(c => c.card_id === cardId);
    if (card) {
      console.log('📌 카드 상세 정보 조회 성공:', card);
      return card;
    } else {
      console.log('⚠️ 카드를 찾을 수 없습니다:', cardId);
      return null;
    }
  } catch (error) {
    console.error('❌ 카드 상세 조회 실패:', error);
    return null;
  }
}

// 저장 로그 조회
function getSaveHistory() {
  try {
    const logs = JSON.parse(localStorage.getItem('card_save_logs') || '[]');
    console.log('📜 카드 저장 로그:', logs);
    return logs;
  } catch (error) {
    console.error('❌ 로그 조회 실패:', error);
    return [];
  }
}

// 페이지 로드 시 트레이딩 플로우 초기화
document.addEventListener('DOMContentLoaded', function() {
  ['trade-flow-start', 'trade-flow-generate', 'trade-flow-import'].forEach(id => {
    const step = document.getElementById(id);
    if (step) {
      step.className = 'flow-step';
      const statusIcon = step.querySelector('.flow-status');
      if (statusIcon) statusIcon.textContent = '⏳';
      const timeElement = step.querySelector('.flow-time');
      if (timeElement) timeElement.textContent = '';
    }
  });
  
  // 저장된 카드 통계 콘솔 출력
  const stats = getCardStatistics();
  if (stats.total > 0) {
    console.log('💾 저장된 카드 통계:', stats);
  }
});

// Export
window.generateTradingCards = generateTradingCards;
window.renderTradingCards = renderTradingCards;
window.buyCard = buyCard;
window.renderOwnedCards = renderOwnedCards;
window.sellCard = sellCard;
window.getVerifiedCards = getVerifiedCards;
window.getCardStatistics = getCardStatistics;
window.saveVerifiedCard = saveVerifiedCard;
window.getCardById = getCardById;
window.getSaveHistory = getSaveHistory;

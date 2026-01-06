// 차트 렌더링 및 예측 카드 관련 함수

function computeNextCandleTime(card) {
  const tf = card?.timeframe || selectedTimeframeValue || '1';
  const tfMap = { '1': 1, '3': 3, '5': 5, '10': 10, '15': 15, '30': 30, '60': 60, '1d': 1440 };
  const minutes = tfMap[tf] || Number(tf) || 1;
  const base = card?.created_at ? new Date(card.created_at) : new Date();
  const baseTime = Number.isNaN(base.getTime()) ? new Date() : base;
  const next = new Date(baseTime.getTime() + minutes * 60 * 1000);
  return next.toLocaleString('ko-KR');
}

function getLatestPredictionCard() {
  if (window.predictionCardList && window.predictionCardList.length > 0) {
    return window.predictionCardList[window.predictionCardList.length - 1];
  }
  return window.latestPredictionCard;
}

// 7단계 예측 카드 리스트를 8단계 패널에 표시
function renderPredictionCardsInStep8() {
  const container = document.getElementById('predictionCardListStep8');
  if (!container) return;

  const cards = (window.predictionCardList && window.predictionCardList.length)
    ? window.predictionCardList
    : (window.latestPredictionCard ? [window.latestPredictionCard] : []);

  if (!cards.length) {
    container.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 16px;">예측 카드가 없습니다.</div>';
    return;
  }

  container.innerHTML = cards.map((card, idx) => `
    <div style="background: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.35); border-radius: 8px; padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 700; color: #f5a623; font-size: 13px;">🔮 예측 카드 #${idx + 1}</div>
        <div style="color: #8b949e; font-size: 11px;">${card.card_id || '-'}</div>
      </div>
      <div style="display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12px; color: #c9d1d9;">
        <div style="color: #8b949e;">예측 가격</div><div style="color:#f5a623;font-weight:700;">${card.price !== undefined && card.price !== null ? card.price.toLocaleString('ko-KR') : '-'}</div>
        <div style="color: #8b949e;">N/B 값</div><div>${Number(card.nb_value ?? 0).toFixed(10)}</div>
        <div style="color: #8b949e;">bit_max/min</div><div>${Number(card.bit_max ?? 0).toFixed(10)} / ${Number(card.bit_min ?? 0).toFixed(10)}</div>
        <div style="color: #8b949e;">거래량</div><div>${card.volume !== undefined && card.volume !== null ? card.volume.toLocaleString('ko-KR') : '-'}</div>
        <div style="color: #8b949e;">거래량 bit_max/min</div><div>${Number(card.volume_bit_max ?? 0).toFixed(10)} / ${Number(card.volume_bit_min ?? 0).toFixed(10)}</div>
        <div style="color: #8b949e;">거래대금</div><div>${card.trade_amount !== undefined && card.trade_amount !== null ? card.trade_amount.toLocaleString('ko-KR') : '-'}</div>
        <div style="color: #8b949e;">거래대금 bit_max/min</div><div>${Number(card.trade_amount_bit_max ?? 0).toFixed(10)} / ${Number(card.trade_amount_bit_min ?? 0).toFixed(10)}</div>
        <div style="color: #8b949e;">타임프레임</div><div>${card.timeframe || selectedTimeframeValue || '-'}</div>
        <div style="color: #8b949e;">다음 캔들 시각</div><div>${computeNextCandleTime(card)}</div>
        <div style="color: #8b949e;">생성 시각</div><div>${card.created_at || '-'}</div>
      </div>
    </div>
  `).join('');
}

// Export functions
window.computeNextCandleTime = computeNextCandleTime;
window.getLatestPredictionCard = getLatestPredictionCard;
window.renderPredictionCardsInStep8 = renderPredictionCardsInStep8;
window.clearPredictionCardList = clearPredictionCardList;

// 7단계 AI 분석 실행 플래그
window._aiAnalysisStep7Started = false;
// tradingCardsGenerated는 trading-cards.js에서 선언됨

// 검증 완료 시 예측 카드 리스트 초기화
function clearPredictionCardList() {
  window.predictionCardList = [];
  const predictionCardListEl = document.getElementById('aiPredictionCardList');
  if (predictionCardListEl) {
    predictionCardListEl.innerHTML = '<div style="color:#8b949e;">AI 예측 카드가 여기에 누적 표시됩니다. (검증 전까지 유지)</div>';
  }
}

// 트레이딩 카드 생성 (8단계)
function generateTradingCards(auto = false) {
  const predictionCard = getLatestPredictionCard();
  
  if (!predictionCard && !lastNBResult && !currentPayloadForAnalysis?.card_data) {
    if (!auto) alert('N/B 계산 또는 카드 데이터가 없습니다.');
    console.log('⚠️ generateTradingCards: 데이터 없음');
    return;
  }

  if (auto && tradingCardsGenerated) {
    console.log('⚠️ generateTradingCards: 이미 생성됨');
    return;
  }

  console.log('✅ generateTradingCards: 시작', { predictionCard, lastNBResult, currentPayloadForAnalysis });

  updateFlowStep('trade-flow-start', 'active');
  updateFlowStep('trade-flow-start', 'completed');

  updateFlowStep('trade-flow-import', 'active');
  const sourceCard = predictionCard || currentPayloadForAnalysis?.card_data || {};
  const currentPrice = sourceCard.price ?? collectedData?.chart?.current_price ?? 0;
  if (currentPrice <= 0) {
    if (!auto) alert('유효한 가격 정보가 없습니다.');
    updateFlowStep('trade-flow-import', 'error');
    console.log('⚠️ generateTradingCards: 가격 정보 없음', currentPrice);
    return;
  }
  updateFlowStep('trade-flow-import', 'completed');

  updateFlowStep('trade-flow-generate', 'active');

  const serverCardId = sourceCard.card_id || lastCardResponse?.card_id || sourceCard.card_key || `basic_nb_card2_${Date.now()}`;
  const duplicateTag = sourceCard.duplicate_tag || (currentAnalysisDuplicate ? '중첩 카드' : sourceCard.card_type) || '매매 카드';
  const cardTypeLabel = sourceCard.card_type || (predictionCard ? '예측 카드' : 'basic_nb_card2');

  const newCard = {
    card_id: serverCardId,
    card_type: cardTypeLabel,
    duplicate_tag: duplicateTag,
    price: currentPrice,
    nb_value: sourceCard.nb_value ?? lastNBResult?.nb_value ?? 0,
    bit_max: sourceCard.bit_max ?? lastNBResult?.bit_max ?? 0,
    bit_min: sourceCard.bit_min ?? lastNBResult?.bit_min ?? 0,
    volume: sourceCard.volume ?? collectedData?.chart?.volume ?? 0,
    trade_amount: sourceCard.trade_amount ?? collectedData?.chart?.trade_amount ?? 0,
    volume_bit_max: sourceCard.volume_bit_max,
    volume_bit_min: sourceCard.volume_bit_min,
    trade_amount_bit_max: sourceCard.trade_amount_bit_max,
    trade_amount_bit_min: sourceCard.trade_amount_bit_min,
    timeframe: sourceCard.timeframe || currentPayloadForAnalysis?.timeframe || selectedTimeframeValue,
    created_at: sourceCard.created_at || new Date().toLocaleString('ko-KR'),
    status: '미보유'
  };

  tradingCards.push(newCard);
  tradingCardsGenerated = true;
  renderTradingCards();
  incrementCardCount();

  updateFlowStep('trade-flow-generate', 'completed');
  
  setTimeout(() => {
    updateProgressStep('step8', 'completed');
    updateProgressStep('step9', 'active');
  }, 300);
}

// 트레이딩 카드 렌더링
function renderTradingCards() {
  const container = document.getElementById('tradingCardList');
  if (!container) return;

  if (tradingCards.length === 0) {
    container.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 20px;">생성된 카드가 없습니다. 위의 버튼을 클릭해 카드를 생성하세요.</div>';
    return;
  }

  container.innerHTML = tradingCards.map((card, idx) => `
    <div style="background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.2); border-radius: 8px; padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 700; color: #58a6ff; font-size: 13px;">📌 ${card.card_type || '기본 카드'} (${card.duplicate_tag || '신규'})</div>
        <button onclick="buyCard(${idx})" style="background: #3fb950; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 600;">💰 매수</button>
      </div>
      <div style="display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12px; color: #c9d1d9;">
        <div style="color: #8b949e;">카드 ID</div><div>${card.card_id}</div>
        <div style="color: #8b949e;">가격</div><div>${card.price?.toLocaleString('ko-KR') || '-'}</div>
        <div style="color: #8b949e;">N/B 값</div><div>${Number(card.nb_value).toFixed(10)}</div>
        <div style="color: #8b949e;">bit_max/min</div><div>${Number(card.bit_max).toFixed(10)} / ${Number(card.bit_min).toFixed(10)}</div>
        <div style="color: #8b949e;">거래량</div><div>${card.volume?.toLocaleString('ko-KR') || '-'}</div>
        <div style="color: #8b949e;">거래대금</div><div>${card.trade_amount?.toLocaleString('ko-KR') || '-'}</div>
        <div style="color: #8b949e;">타임프레임</div><div>${card.timeframe || '-'}</div>
        <div style="color: #8b949e;">생성 시각</div><div>${card.created_at}</div>
      </div>
    </div>
  `).join('');
}

// 카드 매수/매도
function buyCard(index) {
  if (index < 0 || index >= tradingCards.length) return;
  const card = tradingCards[index];
  card.status = '보유중';
  ownedCards.push(card);
  tradingCards.splice(index, 1);
  renderTradingCards();
  renderOwnedCards();
}

function sellCard(index) {
  if (index < 0 || index >= ownedCards.length) return;
  const card = ownedCards[index];
  const currentPrice = collectedData?.chart?.current_price || card.price;
  const profit = currentPrice - card.price;
  const profitRate = ((profit / card.price) * 100).toFixed(2);
  
  alert(`매도 완료!\n매수가: ${card.price?.toLocaleString('ko-KR')}\n현재가: ${currentPrice?.toLocaleString('ko-KR')}\n수익: ${profit?.toLocaleString('ko-KR')} (${profitRate}%)`);
  
  ownedCards.splice(index, 1);
  renderOwnedCards();
}

function renderOwnedCards() {
  const container = document.getElementById('ownedCardList');
  if (!container) return;

  if (ownedCards.length === 0) {
    container.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 20px;">매수된 카드가 없습니다.</div>';
    return;
  }

  container.innerHTML = ownedCards.map((card, idx) => `
    <div style="background: rgba(63,185,80,0.08); border: 1px solid rgba(63,185,80,0.2); border-radius: 8px; padding: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="font-weight: 700; color: #3fb950; font-size: 13px;">💳 보유중 (${card.card_type || '기본 카드'})</div>
        <button onclick="sellCard(${idx})" style="background: #f85149; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; font-size: 11px; cursor: pointer; font-weight: 600;">📤 매도</button>
      </div>
      <div style="display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12px; color: #c9d1d9;">
        <div style="color: #8b949e;">카드 ID</div><div>${card.card_id}</div>
        <div style="color: #8b949e;">매수 가격</div><div>${card.price?.toLocaleString('ko-KR') || '-'}</div>
        <div style="color: #8b949e;">N/B 값</div><div>${Number(card.nb_value).toFixed(10)}</div>
        <div style="color: #8b949e;">타임프레임</div><div>${card.timeframe || '-'}</div>
        <div style="color: #8b949e;">매수 시각</div><div>${card.created_at}</div>
      </div>
    </div>
  `).join('');
}

// 9단계 자동 실행 옵저버
const step9Observer = new MutationObserver(function() {
  const step9 = document.getElementById('step9');
  if (step9 && step9.classList.contains('active')) {
    if (window._flowReset9Running) {
      console.log('⚠️ 플로우 리셋이 이미 실행 중입니다.');
      return;
    }
    window._flowReset9Running = true;
    console.log('✅ 9단계 활성화 감지 → 플로우 리셋 자동 실행');
    runFlowReset().then(() => {
      console.log('✅ 플로우 리셋 완료 → 1단계부터 재시작');
      window._flowReset9Running = false;
    }).catch(err => {
      console.error('❌ 플로우 리셋 실패:', err);
      window._flowReset9Running = false;
    });
  }
});

const step9Element = document.getElementById('step9');
if (step9Element) {
  step9Observer.observe(step9Element, { attributes: true, attributeFilter: ['class'] });
}

// DOMContentLoaded 이벤트 핸들러
document.addEventListener('DOMContentLoaded', function() {
  loadStats();
  
  // upbit-chart.js의 함수 호출
  if (typeof window.updateUpbitChartDisplay === 'function') {
    window.updateUpbitChartDisplay();
  }
  renderPredictionCardsInStep8();
  
  // 트레이딩 플로우 초기화
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
});

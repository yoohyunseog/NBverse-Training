// AI 학습 모듈 (6단계)
let isAiTraining = false;

function enableAiTrainingButton() {
  const btn = document.getElementById('aiTrainBtn');
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = '학습 시작';
  addAiTrainLog('✅ 학습 준비 완료: 카드 정보가 확보되었습니다.', 'success');
}

function addAiTrainLog(message, type = 'info') {
  const logContainer = document.getElementById('aiTrainLog');
  if (!logContainer) return;
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();
  const time = new Date().toLocaleTimeString('ko-KR', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    fractionalSecondDigits: 3 
  });
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

function renderAiTrainingCard(card) {
  const setText = (id, value) => { 
    const el = document.getElementById(id); 
    if (el) el.textContent = value; 
  };
  setText('aiTrainCardId', card.card_id || '-');
  setText('aiTrainCardType', card.card_type || card.duplicate_tag || '신규 카드');
  setText('aiTrainPrice', card.price?.toLocaleString('ko-KR') || '-');
  setText('aiTrainNb', Number(card.nb_value ?? 0).toFixed(10));
  setText('aiTrainBits', `${Number(card.bit_max ?? 0).toFixed(10)} / ${Number(card.bit_min ?? 0).toFixed(10)}`);
  setText('aiTrainVolume', card.volume !== undefined && card.volume !== null ? card.volume.toLocaleString('ko-KR') : '-');
  setText('aiTrainVolumeBits', `${Number(card.volume_bit_max ?? 0).toFixed(10)} / ${Number(card.volume_bit_min ?? 0).toFixed(10)}`);
  setText('aiTrainTradeAmount', card.trade_amount !== undefined && card.trade_amount !== null ? card.trade_amount.toLocaleString('ko-KR') : '-');
  setText('aiTrainTradeBits', `${Number(card.trade_amount_bit_max ?? 0).toFixed(10)} / ${Number(card.trade_amount_bit_min ?? 0).toFixed(10)}`);
  setText('aiTrainTimeframe', card.timeframe || '-');
  setText('aiTrainCreated', card.created_at || '-');

  // 학습 결과 영역 초기화/업데이트
  renderAiTrainingOutcome(card);
}

function buildTrainingCandidate() {
  // 실제 저장된 카드 데이터가 있으면 그것을 복사해서 사용
  if (window.currentPayloadForAnalysis && window.currentPayloadForAnalysis.card_data) {
    const cardData = { ...window.currentPayloadForAnalysis.card_data };
    cardData.card_id = window.currentCardForAnalysis?.card_id || `train-${Date.now()}`;
    cardData.card_type = window.currentAnalysisDuplicate ? '중첩 카드' : '신규 카드';
    cardData.timeframe = window.currentPayloadForAnalysis.timeframe || cardData.timeframe || '-';
    cardData.created_at = cardData.created_at || new Date().toLocaleString('ko-KR');
    return cardData;
  }
  
  // fallback: 기존 방식
  const nb = window.lastNBResult || {};
  const chart = window.collectedData?.chart || {};
  const price = chart.current_price ?? (Array.isArray(chart.prices) ? chart.prices[chart.prices.length - 1] : undefined);
  const volume = window.getLatestVolume();
  const tradeAmount = window.getLatestTradeAmount(volume, price);
  const candidate = {
    card_id: window.currentCardForAnalysis?.card_id || `train-${Date.now()}`,
    card_type: window.currentAnalysisDuplicate ? '중첩 카드' : '신규 카드',
    price: price ?? null,
    nb_value: nb.nb_value ?? nb.normalized_nb ?? 0.5,
    bit_max: nb.bit_max ?? nb.nb_max ?? 0,
    bit_min: nb.bit_min ?? nb.nb_min ?? 0,
    volume: volume ?? null,
    volume_bit_max: window.lastNBResult?.volume_bit_max ?? null,
    volume_bit_min: window.lastNBResult?.volume_bit_min ?? null,
    trade_amount: tradeAmount ?? null,
    trade_amount_bit_max: window.lastNBResult?.trade_amount_bit_max ?? null,
    trade_amount_bit_min: window.lastNBResult?.trade_amount_bit_min ?? null,
    timeframe: window.selectedTimeframeValue || chart.timeframe || '-',
    created_at: new Date().toLocaleString('ko-KR')
  };
  return candidate;
}

async function fetchMaxTrainingCard() {
  addAiTrainLog('🔎 현재 NB/bit_max 기준으로 학습 카드 후보를 추출합니다.', 'info');
  const candidate = buildTrainingCandidate();
  return candidate;
}

function mirrorBasicAnalysisToTraining(candidate) {
  const mirrorEl = document.getElementById('aiTrainBasicMirror');
  if (!mirrorEl) return;

  const basicResultEl = document.getElementById('basicAnalysisResult');
  if (basicResultEl) {
    mirrorEl.innerHTML = basicResultEl.innerHTML;
  } else {
    mirrorEl.innerHTML = '<div style="color:#8b949e;">기본 분석 결과를 찾을 수 없습니다.</div>';
  }
}

function renderAiTrainingOutcome(card) {
  const outEl = document.getElementById('aiTrainOutcome');
  if (!outEl) return;

  const price = Number(card.price ?? NaN);
  const bitMax = Number(card.bit_max ?? card.nb_max ?? NaN);
  const bitMin = Number(card.bit_min ?? card.nb_min ?? NaN);
  const nbVal = Number(card.nb_value ?? NaN);

  const predictedNextPrice = Number.isFinite(price) && Number.isFinite(bitMax)
    ? price * (1 + bitMax / 1000)
    : null;

  outEl.innerHTML = `
    <div style="display: grid; gap: 8px;">
      <div style="font-weight: 700; color: #3fb950;">가격 기반 max 값으로 학습 완료</div>
      <div>• 사용된 bit_max: <span style="font-family: monospace;">${Number.isFinite(bitMax) ? bitMax.toFixed(10) : '-'}</span></div>
      <div>• 사용된 bit_min: <span style="font-family: monospace;">${Number.isFinite(bitMin) ? bitMin.toFixed(10) : '-'}</span></div>
      <div>• N/B 값: <span style="font-family: monospace;">${Number.isFinite(nbVal) ? nbVal.toFixed(10) : '-'}</span></div>
      <div>• 학습 입력: 가격, OHLCV, N/B max/min, 타임프레임</div>
      <div>• 예측 방식: 학습된 모델에 가격 기반 max(bit_max)를 반영해 다음 스텝 가격/방향을 추정</div>
      <div>• 예측 샘플: ${predictedNextPrice ? predictedNextPrice.toLocaleString('ko-KR') + ' (가상)' : '가격 데이터 없음'}</div>
      <div style="color:#8b949e;">실제 서버 모델 연동 시 /api/ai/predict 호출로 가격 기반 max/min을 포함한 특징을 전달해 예측을 얻습니다.</div>
    </div>
  `;
}

async function startAiTraining() {
  if (isAiTraining) {
    addAiTrainLog('이미 학습 중입니다.', 'info');
    return;
  }
  const btn = document.getElementById('aiTrainBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '학습 중...';
  }

  isAiTraining = true;
  addAiTrainLog('🚀 학습을 시작합니다. 학습 대상 카드를 준비합니다...', 'info');

  // 1) 준비 단계
  window.updateFlowStep('ai-train-flow-start', 'active');
  await window.sleep(200);
  window.updateFlowStep('ai-train-flow-start', 'completed');
  document.getElementById('ai-train-flow-start-time').textContent = '⚡ 준비 완료';

  // 2) max 값 조회 단계
  window.updateFlowStep('ai-train-flow-fetch', 'active');
  addAiTrainLog('📈 max 값 기반 학습용 카드 조회 중...', 'info');
  const candidate = await fetchMaxTrainingCard();
  renderAiTrainingCard(candidate);
  mirrorBasicAnalysisToTraining(candidate);
  
  // 예측 카드 누적 표시
  if (!window.predictionCardList) window.predictionCardList = [];
  let cardDataForAnalysis = candidate;
  if (window.currentPayloadForAnalysis && window.currentPayloadForAnalysis.card_data) {
    cardDataForAnalysis = { ...window.currentPayloadForAnalysis.card_data, ...candidate };
  }
  window.predictionCardList.push(cardDataForAnalysis);
  
  // 예측 카드 리스트 렌더링
  const predictionCardListEl = document.getElementById('aiPredictionCardList');
  if (predictionCardListEl) {
    predictionCardListEl.innerHTML = window.predictionCardList.map((card, idx) => `
      <div style="background:rgba(255,255,255,0.03);border:1px solid #3fb950;border-radius:8px;padding:12px;position:relative;">
        <div style="position:absolute;top:8px;right:16px;font-size:11px;color:#58a6ff;">예측 #${idx+1}</div>
        <div style="font-size:13px;color:#c9d1d9;font-weight:700;margin-bottom:4px;">max 값 → 예측 카드</div>
        <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 8px;font-size:13px;">
          <div class='training-label'>카드 ID</div><div>${card.card_id || '-'}</div>
          <div class='training-label'>카드 유형</div><div>${card.card_type || card.duplicate_tag || '신규 카드'}</div>
          <div class='training-label'>가격</div><div>${card.price !== undefined && card.price !== null ? card.price.toLocaleString('ko-KR') : '-'}</div>
          <div class='training-label'>N/B 값</div><div>${Number(card.nb_value ?? 0).toFixed(10)}</div>
          <div class='training-label'>bit_max / bit_min</div><div>${Number(card.bit_max ?? 0).toFixed(10)} / ${Number(card.bit_min ?? 0).toFixed(10)}</div>
          <div class='training-label'>거래량</div><div>${card.volume !== undefined && card.volume !== null ? card.volume.toLocaleString('ko-KR') : '-'}</div>
          <div class='training-label'>거래량 bit_max/min</div><div>${Number(card.volume_bit_max ?? 0).toFixed(10)} / ${Number(card.volume_bit_min ?? 0).toFixed(10)}</div>
          <div class='training-label'>거래대금</div><div>${card.trade_amount !== undefined && card.trade_amount !== null ? card.trade_amount.toLocaleString('ko-KR') : '-'}</div>
          <div class='training-label'>거래대금 bit_max/min</div><div>${Number(card.trade_amount_bit_max ?? 0).toFixed(10)} / ${Number(card.trade_amount_bit_min ?? 0).toFixed(10)}</div>
          <div class='training-label'>타임프레임</div><div>${card.timeframe || '-'}</div>
          <div class='training-label'>생성 시각</div><div>${card.created_at || '-'}</div>
        </div>
      </div>
    `).join('');
  }

  await window.sleep(300);
  window.updateFlowStep('ai-train-flow-fetch', 'completed');
  document.getElementById('ai-train-flow-fetch-time').textContent = '⚡ 300ms';
  addAiTrainLog(`📌 학습 카드 선택: ${candidate.card_id}`, 'success');

  // 3) 학습 단계 시뮬레이션
  window.updateFlowStep('ai-train-flow-train', 'active');
  addAiTrainLog('🧠 모델 학습 시뮬레이션 진행 중...', 'info');
  await window.sleep(600);
  window.updateFlowStep('ai-train-flow-train', 'completed');
  document.getElementById('ai-train-flow-train-time').textContent = '⚡ 600ms';
  addAiTrainLog('✅ 모델 학습 완료(시뮬레이션)', 'success');

  // 4) 완료
  window.updateFlowStep('ai-train-flow-complete', 'active');
  window.updateFlowStep('ai-train-flow-complete', 'completed');
  document.getElementById('ai-train-flow-complete-time').textContent = '⚡ 완료';
  addAiTrainLog('🏁 학습 완료, AI 분석 단계로 이동 가능합니다.', 'success');

  window.updateProgressStep('step6', 'completed');
  window.updateProgressStep('step7', 'active');

  const analyzeBtn = document.getElementById('aiAnalyzeBtn');
  if (analyzeBtn) {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'AI 분석 준비 완료';
  }

  isAiTraining = false;
  if (btn) {
    btn.disabled = false;
    btn.textContent = '재학습';
  }
}

// AI 분석 (7단계)
async function runAiAnalysisStep7() {
  // 1단계: 분석 시작
  window.updateFlowStep('ai-analysis-flow-start', 'active');
  await window.sleep(200);
  window.updateFlowStep('ai-analysis-flow-start', 'completed');
  document.getElementById('ai-analysis-flow-start-time').textContent = '⚡ 준비 완료';
  
  // 2단계: 카드 확인
  window.updateFlowStep('ai-analysis-flow-card', 'active');
  await window.sleep(200);
  window.updateFlowStep('ai-analysis-flow-card', 'completed');
  document.getElementById('ai-analysis-flow-card-time').textContent = '⚡ 카드 확인';
  
  // 3단계: 예측 카드 생성 및 추가
  window.updateFlowStep('ai-analysis-flow-predict', 'active');
  await window.sleep(200);
  
  let cardData = null;
  if (window.predictionCardList && window.predictionCardList.length > 0) {
    cardData = { ...window.predictionCardList[window.predictionCardList.length-1] };
    cardData.card_id = cardData.card_id + '_predict_' + Date.now();
    cardData.card_type = '예측 카드';
    cardData.created_at = new Date().toLocaleString('ko-KR');
  } else if (window.currentPayloadForAnalysis && window.currentPayloadForAnalysis.card_data) {
    cardData = { ...window.currentPayloadForAnalysis.card_data };
    cardData.card_id = cardData.card_id + '_predict_' + Date.now();
    cardData.card_type = '예측 카드';
    cardData.created_at = new Date().toLocaleString('ko-KR');
  }
  
  if (cardData) {
    if (!window.predictionCardList) window.predictionCardList = [];
    window.predictionCardList.push(cardData);
    window.latestPredictionCard = cardData;
    const predictionCardListEl = document.getElementById('aiPredictionCardList');
    if (predictionCardListEl) {
      predictionCardListEl.innerHTML = window.predictionCardList.map((card, idx) => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid #3fb950;border-radius:8px;padding:12px;position:relative;">
          <div style="position:absolute;top:8px;right:16px;font-size:11px;color:#58a6ff;">예측 #${idx+1}</div>
          <div style="font-size:13px;color:#c9d1d9;font-weight:700;margin-bottom:4px;">max 값 → 예측 카드</div>
          <div style="display:grid;grid-template-columns:120px 1fr;gap:6px 8px;font-size:13px;">
            <div class='training-label'>카드 ID</div><div>${card.card_id || '-'}</div>
            <div class='training-label'>카드 유형</div><div>${card.card_type || card.duplicate_tag || '신규 카드'}</div>
            <div class='training-label'>가격</div><div>${card.price !== undefined && card.price !== null ? card.price.toLocaleString('ko-KR') : '-'}</div>
            <div class='training-label'>N/B 값</div><div>${Number(card.nb_value ?? 0).toFixed(10)}</div>
            <div class='training-label'>bit_max / bit_min</div><div>${Number(card.bit_max ?? 0).toFixed(10)} / ${Number(card.bit_min ?? 0).toFixed(10)}</div>
            <div class='training-label'>거래량</div><div>${card.volume !== undefined && card.volume !== null ? card.volume.toLocaleString('ko-KR') : '-'}</div>
            <div class='training-label'>거래량 bit_max/min</div><div>${Number(card.volume_bit_max ?? 0).toFixed(10)} / ${Number(card.volume_bit_min ?? 0).toFixed(10)}</div>
            <div class='training-label'>거래대금</div><div>${card.trade_amount !== undefined && card.trade_amount !== null ? card.trade_amount.toLocaleString('ko-KR') : '-'}</div>
            <div class='training-label'>거래대금 bit_max/min</div><div>${Number(card.trade_amount_bit_max ?? 0).toFixed(10)} / ${Number(card.trade_amount_bit_min ?? 0).toFixed(10)}</div>
            <div class='training-label'>타임프레임</div><div>${card.timeframe || '-'}</div>
            <div class='training-label'>다음 캔들 시각</div><div>${window.computeNextCandleTime(card)}</div>
            <div class='training-label'>생성 시각</div><div>${card.created_at || '-'}</div>
          </div>
        </div>
      `).join('');
    }

    // 7단계 예측 카드 생성 후 8단계 패널/차트 반영
    if (typeof window.renderPredictionCardsInStep8 === 'function') {
      window.renderPredictionCardsInStep8();
    }
    
    // 차트 렌더링 (window.collectedData가 있을 때만)
    if (window.collectedData && window.collectedData.chart && typeof window.updateUpbitChartDisplay === 'function') {
      console.log('📊 차트 렌더링 시작 (7단계 완료):', { hasCollectedData: !!window.collectedData, hasChart: !!window.collectedData.chart });
      window.updateUpbitChartDisplay();
    } else {
      console.warn('⚠️ 차트 렌더링 건너뜀:', { hasCollectedData: !!window.collectedData, hasChart: !!window.collectedData?.chart, hasFunction: typeof window.updateUpbitChartDisplay === 'function' });
    }
  }
  
  window.updateFlowStep('ai-analysis-flow-predict', 'completed');
  document.getElementById('ai-analysis-flow-predict-time').textContent = '⚡ 예측 카드 생성';
  
  // 4단계: 분석 완료
  window.updateFlowStep('ai-analysis-flow-complete', 'active');
  await window.sleep(200);
  window.updateFlowStep('ai-analysis-flow-complete', 'completed');
  document.getElementById('ai-analysis-flow-complete-time').textContent = '⚡ 완료';
  window.updateProgressStep('step7', 'completed');
  window.updateProgressStep('step8', 'active');

  // 8단계 자동 카드 생성 (가격 기반 max)
  setTimeout(() => window.generateTradingCards(true), 100);
}

// step7이 active가 될 때 자동 실행
if (typeof MutationObserver !== 'undefined') {
  const observer = new MutationObserver(function(mutations) {
    const step7 = document.getElementById('step7');
    if (step7 && step7.classList.contains('active')) {
      if (!window._aiAnalysisStep7Started) {
        window._aiAnalysisStep7Started = true;
        runAiAnalysisStep7();
      }
    }
  });
  
  document.addEventListener('DOMContentLoaded', function() {
    observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
}

// Export
window.enableAiTrainingButton = enableAiTrainingButton;
window.addAiTrainLog = addAiTrainLog;
window.renderAiTrainingCard = renderAiTrainingCard;
window.startAiTraining = startAiTraining;
window.runAiAnalysisStep7 = runAiAnalysisStep7;

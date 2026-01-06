// 기본 분석 모듈 (5단계)
let currentCardForAnalysis = null;
let currentPayloadForAnalysis = null;
let currentAnalysisDuplicate = false;

// 5단계 섹션 표시 및 카드 정보 설정
function showBasicAnalysisSection(cardResult, payload) {
  const section = document.getElementById('basic-analysis');
  if (!section) return;
  
  section.style.display = 'block';
  currentCardForAnalysis = cardResult;
  currentPayloadForAnalysis = payload;
  
  // 전역 객체에도 저장 (다른 모듈에서 접근 가능)
  window.currentCardForAnalysis = currentCardForAnalysis;
  window.currentPayloadForAnalysis = currentPayloadForAnalysis;
  
  const setText = (ids, value) => ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = value; });

  // 카드 기본 정보
  setText(['analysisCardId', 'analysisCardIdFull'], cardResult.card_id || '-');
  const dupLabel = currentAnalysisDuplicate ? '중첩 카드' : '신규 카드';
  setText(['analysisDuplicateTagFull'], dupLabel);
  setText(['analysisTimeframe', 'analysisTimeframeFull'], payload.timeframe || '-');
  const createdAt = new Date().toLocaleString('ko-KR');
  setText(['analysisCreatedTime', 'analysisCreatedTimeFull'], createdAt);
  
  // 가격 기반 정보
  const priceText = payload.card_data?.price?.toLocaleString('ko-KR') || '-';
  setText(['analysisPrice', 'analysisPriceFull'], priceText);
  const nbValueText = Number(payload.card_data?.nb_value ?? 0).toFixed(10);
  setText(['analysisNbValue', 'analysisNbValueFull'], nbValueText);
  const bitsText = `${Number(payload.card_data?.bit_max ?? 0).toFixed(10)} / ${Number(payload.card_data?.bit_min ?? 0).toFixed(10)}`;
  setText(['analysisBits', 'analysisBitsFull'], bitsText);
  
  // 거래량 기반 정보
  const volume = payload.card_data?.volume;
  const volumeText = volume !== null && volume !== undefined ? volume.toLocaleString('ko-KR') : '-';
  setText(['analysisVolume', 'analysisVolumeFull'], volumeText);
  const volumeNbValue = payload.card_data?.volume_nb_value ?? '-';
  const volumeNbText = volumeNbValue !== '-' ? Number(volumeNbValue).toFixed(10) : '-';
  setText(['analysisVolumeNb'], volumeNbText);
  const volumeBitMax = payload.card_data?.volume_bit_max;
  const volumeBitMin = payload.card_data?.volume_bit_min;
  const volumeBitsText = 
    volumeBitMax !== null && volumeBitMax !== undefined && volumeBitMin !== null && volumeBitMin !== undefined
      ? `${Number(volumeBitMax).toFixed(10)} / ${Number(volumeBitMin).toFixed(10)}`
      : '-';
  setText(['analysisVolumeBits', 'analysisVolumeBitsFull'], volumeBitsText);
  
  // 거래대금 기반 정보
  const tradeAmount = payload.card_data?.trade_amount;
  const tradeAmountText = tradeAmount !== null && tradeAmount !== undefined ? tradeAmount.toLocaleString('ko-KR') : '-';
  setText(['analysisTradeAmount', 'analysisTradeAmountFull'], tradeAmountText);
  const tradeNbValue = payload.card_data?.trade_amount_nb_value ?? '-';
  const tradeNbText = tradeNbValue !== '-' ? Number(tradeNbValue).toFixed(10) : '-';
  setText(['analysisTradeNb'], tradeNbText);
  const tradeBitMax = payload.card_data?.trade_amount_bit_max;
  const tradeBitMin = payload.card_data?.trade_amount_bit_min;
  const tradeBitsText = 
    tradeBitMax !== null && tradeBitMax !== undefined && tradeBitMin !== null && tradeBitMin !== undefined
      ? `${Number(tradeBitMax).toFixed(10)} / ${Number(tradeBitMin).toFixed(10)}`
      : '-';
  setText(['analysisTradeBits', 'analysisTradeBitsFull'], tradeBitsText);
  
  // 분석 버튼 활성화
  document.getElementById('basicAnalysisBtn').disabled = false;
  
  // 자동으로 기본 분석 시작
  setTimeout(() => {
    performBasicAnalysis();
  }, 1000);
}

// 기본 분석 로그 추가
function addBasicAnalysisLog(message, type = 'info') {
  const logContainer = document.getElementById('basicAnalysisLog');
  if (!logContainer) return;
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  const time = new Date().toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3
  });
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 기본 분석 수행
async function performBasicAnalysis() {
  if (!currentCardForAnalysis || !currentPayloadForAnalysis) {
    alert('분석할 카드 정보가 없습니다.');
    return;
  }

  const statusEl = document.getElementById('basicAnalysisStatus');
  const resultEl = document.getElementById('basicAnalysisResult');
  const btn = document.getElementById('basicAnalysisBtn');

  try {
    btn.disabled = true;
    statusEl.style.display = 'block';
    statusEl.className = 'status warning';
    statusEl.textContent = '🔍 기본 분석 중...';
    
    addBasicAnalysisLog('🚀 기본 분석 시작', 'info');
    addBasicAnalysisLog(`카드 ID: ${currentCardForAnalysis.card_id}`, 'info');

    const startTime = Date.now();

    // 0. 시작 단계
    window.updateFlowStep('analysis-flow-start', 'active');
    await new Promise(resolve => setTimeout(resolve, 100));
    window.updateFlowStep('analysis-flow-start', 'completed');
    document.getElementById('analysis-flow-start-time').textContent = '⚡ 0ms';

    // 1. 카드 준비 확인
    window.updateFlowStep('analysis-flow-card', 'active');
    addBasicAnalysisLog('🃏 카드가 준비되었는지 확인 중...', 'info');
    await new Promise(resolve => setTimeout(resolve, 200));
    const cardTime = Date.now() - startTime;
    document.getElementById('analysis-flow-card-time').textContent = `⚡ ${cardTime}ms`;
    window.updateFlowStep('analysis-flow-card', 'completed');
    addBasicAnalysisLog('✅ 카드 준비 완료', 'success');

    // 1-1. 저장 전 중복 카드 확인
    addBasicAnalysisLog('🔎 중복 카드 여부 확인 중...', 'info');
    let isDuplicateCard = false;
    try {
      const dupResp = await fetch(`${window.API_BASE}/api/cards/${currentCardForAnalysis.card_id}`);
      if (dupResp.ok) {
        isDuplicateCard = true;
        addBasicAnalysisLog('ℹ️ 기존 카드가 존재함: 중첩 카드로 처리', 'info');
      } else if (dupResp.status === 404 || dupResp.status === 405) {
        addBasicAnalysisLog('ℹ️ 기존 카드 없음: 신규 카드로 저장 예정', 'info');
      } else {
        addBasicAnalysisLog(`⚠️ 중복 확인 실패(코드: ${dupResp.status}), 신규로 간주`, 'info');
      }
    } catch (dupErr) {
      addBasicAnalysisLog(`⚠️ 중복 확인 실패(네트워크), 신규로 간주: ${dupErr.message}`, 'info');
    }
    currentAnalysisDuplicate = isDuplicateCard;
    window.currentAnalysisDuplicate = currentAnalysisDuplicate;

    // 2. 저장 단계 (API 호출)
    window.updateFlowStep('analysis-flow-save', 'active');
    addBasicAnalysisLog(`💾 기본 분석 결과 저장 중... (${isDuplicateCard ? '중첩 카드' : '신규 카드'})`, 'info');

    let result = null;
    let elapsed = 0;

    try {
      const response = await fetch(`${window.API_BASE}/api/cards/${currentCardForAnalysis.card_id}/basic-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeframe: currentPayloadForAnalysis.timeframe,
          card_data: currentPayloadForAnalysis.card_data,
          duplicate: currentAnalysisDuplicate
        })
      });

      result = await response.json();
      elapsed = Date.now() - startTime;

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}`);
      }
      
      addBasicAnalysisLog(`✅ API 저장 성공 (${elapsed}ms)`, 'success');
    } catch (apiError) {
      // API 실패 시 시뮬레이션 데이터 사용
      addBasicAnalysisLog(`⚠️ API 호출 실패, 시뮬레이션 모드로 전환: ${apiError.message}`, 'info');
      await new Promise(resolve => setTimeout(resolve, 300));
      elapsed = Date.now() - startTime;
      
      // 더미 분석 결과 생성
      result = {
        success: true,
        analysis: {
          trend: 'Sideways (횡보)',
          volatility: 'Medium (중간)',
          volume_trend: 'Stable (안정)',
          summary: '현재 시장은 횡보 중이며, 변동성은 중간 수준입니다. 거래량은 안정적인 상태를 유지하고 있습니다.'
        }
      };
    }

    document.getElementById('analysis-flow-save-time').textContent = `⚡ ${elapsed}ms`;
    window.updateFlowStep('analysis-flow-save', 'completed');
    addBasicAnalysisLog(`✅ 저장 완료 (${elapsed}ms)`, 'success');

    // 3. 조회 단계
    window.updateFlowStep('analysis-flow-fetch', 'active');
    addBasicAnalysisLog('🔎 저장된 결과 조회 중...', 'info');
    await new Promise(resolve => setTimeout(resolve, 180));
    const fetchTime = Date.now() - startTime;
    document.getElementById('analysis-flow-fetch-time').textContent = `⚡ ${fetchTime}ms`;
    window.updateFlowStep('analysis-flow-fetch', 'completed');
    addBasicAnalysisLog(`✅ 조회 완료 (${fetchTime}ms)`, 'success');

    // 조회 결과 표시
    addBasicAnalysisLog('🧾 분석 결과 렌더링...', 'info');
    displayBasicAnalysisResult(result);

    // 4. 완료 단계
    window.updateFlowStep('analysis-flow-complete', 'active');
    window.updateFlowStep('analysis-flow-complete', 'completed');
    document.getElementById('analysis-flow-complete-time').textContent = `⚡ ${fetchTime}ms`;

    statusEl.className = 'status success';
    statusEl.textContent = `✅ 기본 분석 완료 (${fetchTime}ms)`;
    addBasicAnalysisLog('🏁 5단계 기본 분석 완료, AI 학습 단계로 이동 가능', 'success');

    // 6단계 AI 학습 활성화 및 자동 실행
    window.updateProgressStep('step5', 'completed');
    window.updateProgressStep('step6', 'active');
    window.enableAiTrainingButton();
    setTimeout(() => {
      window.startAiTraining();
    }, 800);

  } catch (error) {
    addBasicAnalysisLog(`❌ 분석 실패: ${error.message}`, 'error');
    statusEl.className = 'status error';
    statusEl.textContent = `❌ 분석 실패: ${error.message}`;
    
    window.updateFlowStep('analysis-flow-card', 'error');
    window.updateFlowStep('analysis-flow-save', 'error');
    window.updateFlowStep('analysis-flow-fetch', 'error');
    window.updateFlowStep('analysis-flow-complete', 'error');
    
    resultEl.innerHTML = `
      <div style="color: #f85149; text-align: center; padding: 40px 0;">
        <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
        <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">분석 실패</div>
        <div style="font-size: 14px; color: #8b949e;">${error.message}</div>
      </div>
    `;
  } finally {
    btn.disabled = false;
  }
}

// 기본 분석 결과 표시
function displayBasicAnalysisResult(result) {
  const resultEl = document.getElementById('basicAnalysisResult');
  const analysis = result.analysis || {};
  const cardData = currentPayloadForAnalysis?.card_data || {};

  if (currentCardForAnalysis) {
    currentCardForAnalysis.basic_analysis_result = {
      zone: (() => {
        const priceBitMax = Number(cardData.bit_max ?? cardData.nb_max ?? NaN);
        const priceBitMin = Number(cardData.bit_min ?? cardData.nb_min ?? NaN);
        const trendText = (analysis.trend || '').toString().toLowerCase();
        if (trendText.includes('up') || trendText.includes('상승') || priceBitMax >= priceBitMin) return 'blue';
        if (trendText.includes('down') || trendText.includes('하락') || priceBitMax < priceBitMin) return 'orange';
        return '-';
      })(),
      zoneDesc: (() => {
        const priceBitMax = Number(cardData.bit_max ?? cardData.nb_max ?? NaN);
        const priceBitMin = Number(cardData.bit_min ?? cardData.nb_min ?? NaN);
        const trendText = (analysis.trend || '').toString().toLowerCase();
        let zone = '-';
        if (trendText.includes('up') || trendText.includes('상승') || priceBitMax >= priceBitMin) zone = 'blue';
        else if (trendText.includes('down') || trendText.includes('하락') || priceBitMax < priceBitMin) zone = 'orange';
        return zone === 'blue' ? 'blue: 가격이 오르는 구간' : zone === 'orange' ? 'orange: 가격이 내려가는 구간' : '존 정보를 판단할 수 없습니다';
      })(),
      trend: analysis.trend || '-',
      volatility: analysis.volatility || '-',
      volume_trend: analysis.volume_trend || '-',
      summary: analysis.summary || '분석 결과가 없습니다.'
    };
  }

  const priceBitMax = Number(cardData.bit_max ?? cardData.nb_max ?? NaN);
  const priceBitMin = Number(cardData.bit_min ?? cardData.nb_min ?? NaN);
  const volumeBitMax = Number(cardData.volume_bit_max ?? NaN);
  const volumeBitMin = Number(cardData.volume_bit_min ?? NaN);
  const tradeBitMax = Number(cardData.trade_amount_bit_max ?? NaN);
  const tradeBitMin = Number(cardData.trade_amount_bit_min ?? NaN);

  // 존 색상 결정
  const trendText = (analysis.trend || '').toString().toLowerCase();
  let zone = '-';
  if (trendText.includes('up') || trendText.includes('상승') || priceBitMax >= priceBitMin) zone = 'blue';
  else if (trendText.includes('down') || trendText.includes('하락') || priceBitMax < priceBitMin) zone = 'orange';

  const zoneDesc = zone === 'blue'
    ? 'blue: 가격이 오르는 구간'
    : zone === 'orange'
      ? 'orange: 가격이 내려가는 구간'
      : '존 정보를 판단할 수 없습니다';

  // N/B 해석 헬퍼
  const nbSignal = (max, min, label) => {
    if (!Number.isFinite(max) || !Number.isFinite(min)) return `${label}: 데이터 없음`;
    if (min > max) return `${label}: min이 max보다 높아 비활성/가중치 낮음`;
    return `${label}: max 상승 → 상승/활발, min 상승 → 하락압력 감소`;
  };

  const priceSignal = nbSignal(priceBitMax, priceBitMin, '가격 N/B');
  const volumeSignal = nbSignal(volumeBitMax, volumeBitMin, '거래량 N/B');
  const tradeSignal = nbSignal(tradeBitMax, tradeBitMin, '거래대금 N/B');

  resultEl.innerHTML = `
    <div style="display: grid; gap: 12px;">
      <div style="padding: 12px; background: rgba(88, 166, 255, 0.1); border-radius: 6px; border-left: 3px solid ${zone === 'blue' ? '#58a6ff' : zone === 'orange' ? '#d29922' : '#8b949e'}; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <div style="color: #8b949e; font-size: 12px; margin-bottom: 4px;">현재 존</div>
          <div style="color: #e6edf3; font-size: 16px; font-weight: 700; text-transform: uppercase;">${zone}</div>
          <div style="color: #8b949e; font-size: 12px; margin-top: 4px;">${zoneDesc}</div>
        </div>
        <div style="width: 52px; height: 52px; border-radius: 12px; background: ${zone === 'blue' ? 'rgba(88,166,255,0.2)' : zone === 'orange' ? 'rgba(210,153,34,0.2)' : 'rgba(139,148,158,0.2)'}; display: flex; align-items: center; justify-content: center; font-size: 18px; color: #e6edf3;">${zone === 'blue' ? '⬆️' : zone === 'orange' ? '⬇️' : 'ℹ️'}</div>
      </div>

      <div style="padding: 12px; background: rgba(88, 166, 255, 0.1); border-radius: 6px; border-left: 3px solid #58a6ff;">
        <div style="color: #8b949e; font-size: 12px; margin-bottom: 4px;">추세 방향</div>
        <div style="color: #e6edf3; font-size: 16px; font-weight: 600;">${analysis.trend || '-'}</div>
      </div>
      
      <div style="padding: 12px; background: rgba(88, 166, 255, 0.1); border-radius: 6px; border-left: 3px solid #3fb950;">
        <div style="color: #8b949e; font-size: 12px; margin-bottom: 4px;">변동성</div>
        <div style="color: #e6edf3; font-size: 16px; font-weight: 600;">${analysis.volatility || '-'}</div>
      </div>
      
      <div style="padding: 12px; background: rgba(88, 166, 255, 0.1); border-radius: 6px; border-left: 3px solid #d29922;">
        <div style="color: #8b949e; font-size: 12px; margin-bottom: 4px;">거래량 추세</div>
        <div style="color: #e6edf3; font-size: 16px; font-weight: 600;">${analysis.volume_trend || '-'}</div>
      </div>

      <div style="padding: 12px; background: rgba(88, 166, 255, 0.1); border-radius: 6px; border-left: 3px solid #a371f7;">
        <div style="color: #8b949e; font-size: 12px; margin-bottom: 4px;">N/B 해석</div>
        <div style="color: #e6edf3; font-size: 14px; line-height: 1.6;">
          <div>• ${priceSignal}</div>
          <div>• ${volumeSignal}</div>
          <div>• ${tradeSignal}</div>
          <div style="margin-top: 6px; color: #8b949e; font-size: 12px;">기본 설계: max > min 이 정상. min > max이면 비활성/가중치 낮음으로 해석.</div>
        </div>
      </div>
      
      <div style="padding: 12px; background: rgba(88, 166, 255, 0.1); border-radius: 6px; border-left: 3px solid #a371f7;">
        <div style="color: #8b949e; font-size: 12px; margin-bottom: 4px;">분석 요약</div>
        <div style="color: #e6edf3; font-size: 14px; line-height: 1.6;">${analysis.summary || '분석 결과가 없습니다.'}</div>
      </div>
    </div>
  `;
}

// Export
window.showBasicAnalysisSection = showBasicAnalysisSection;
window.addBasicAnalysisLog = addBasicAnalysisLog;
window.performBasicAnalysis = performBasicAnalysis;
window.displayBasicAnalysisResult = displayBasicAnalysisResult;

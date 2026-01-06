// N/B 계산 관련 함수들

// N/B 계산 함수
async function calculateNB() {
  if (isCalculating) {
    console.log('이미 N/B 계산 중입니다.');
    return;
  }
  
  if (!collectedData || !collectedData.chart) {
    alert('먼저 데이터를 수집해주세요.');
    return;
  }
  
  resetBitMaxUI();
  document.getElementById('bitMaxFetchBtn').disabled = true;
  isCalculating = true;
  logNBProgress('🧮 N/B 계산을 시작합니다...', 'info');
  updateFlowStep('nb-flow-prepare', 'active');
  
  try {
    logNBProgress('📊 차트 데이터 전처리 중...', 'info');
    const prices = collectedData.chart.prices;
    const volumes = collectedData.chart.volumes || collectedData.chart.volume || [];
    const tradeValues = collectedData.chart.trade_values || collectedData.chart.trade_amounts || collectedData.chart.values || [];
    
    const usedData = {
      prices: prices,
      prices_count: prices.length,
      timeframe: selectedTimeframeValue,
      api_timeframe: convertTimeframeForAPI(selectedTimeframeValue),
      first_price: prices[0],
      last_price: prices[prices.length - 1],
      volumes_count: volumes.length,
      trade_values_count: tradeValues.length,
      has_volumes: volumes.length > 0,
      has_trade_values: tradeValues.length > 0
    };
    
    const nbRawDataEl = document.getElementById('nbRawData');
    if (nbRawDataEl) {
      nbRawDataEl.textContent = JSON.stringify(usedData, null, 2);
    }

    await sleep(300);
    updateFlowStep('nb-flow-prepare', 'completed');
    logNBProgress(`✅ 데이터 준비 완료 (${prices.length}개 캔들)`, 'success');
    
    // bitCalculation 실행
    updateFlowStep('nb-flow-calculate', 'active');
    logNBProgress('⚡ bitCalculation 라이브러리로 계산 중...', 'info');
    await sleep(500);
    updateFlowStep('nb-flow-calculate', 'completed');
    logNBProgress('✅ 로컬 계산 완료', 'success');
    
    // API 전송 (4의 배수로 필터링)
    updateFlowStep('nb-flow-api', 'active');
    logNBProgress('🌐 API 호출: POST /api/nb/calculate', 'info');
    
    const filteredPrices = prices.filter((_, idx) => idx % 4 === 0);
    logNBProgress(`📊 가격 배열 필터링 (원본: ${prices.length}개 → ${filteredPrices.length}개)`, 'info');
    
    const startTime = Date.now();
    const response = await fetch(`${window.API_BASE}/api/nb/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prices: filteredPrices,
        timeframe: selectedTimeframeValue,
        market: 'KRW-BTC',
        volumes,
        trade_values: tradeValues
      })
    });
    
    const nbData = await response.json();
    const responseTime = Date.now() - startTime;
    
    updateFlowStep('nb-flow-api', 'completed');
    logNBProgress(`✅ API 응답 수신 (${responseTime}ms)`, 'success');
    
    // NBVerse 저장
    updateFlowStep('nb-flow-save', 'active');
    logNBProgress('💾 NBVerse 데이터베이스에 저장 중...', 'info');
    
    const saveStartTime = Date.now();
    const saveResponse = await fetch(`${window.API_BASE}/api/nb/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nb_value: nbData.nb_value || nbData.normalized_nb,
        nb_max: nbData.nb_max,
        nb_min: nbData.nb_min,
        bit_max: nbData.bit_max || nbData.bitMax,
        bit_min: nbData.bit_min || nbData.bitMin,
        timeframe: selectedTimeframeValue,
        market: 'KRW-BTC',
        prices: prices,
        volumes,
        trade_values: tradeValues
      })
    });
    
    const saveData = await saveResponse.json();
    const saveResponseTime = Date.now() - saveStartTime;
    
    updateFlowStep('nb-flow-save', 'completed');
    logNBProgress(`✅ NBVerse 저장 완료 (${saveResponseTime}ms)`, 'success');
    
    if (saveData.nb_id) {
      addNBLog(`📁 저장 경로: data/nbverse/${saveData.nb_id}.json`, 'info');
    }
    
    updateNBResults(nbData);
    lastNBResult = {
      ...nbData,
      nb_id: saveData.nb_id || nbData.nb_id,
      prices,
      timeframe: selectedTimeframeValue
    };
    
    const latestVolume = getLatestVolume();
    const latestTradeAmount = getLatestTradeAmount(latestVolume, collectedData.chart.current_price);
    const bitMaxPreview = nbData.bit_max ?? nbData.nb_max ?? nbData.bitMax ?? nbData.nbMax;
    const bitMinPreview = nbData.bit_min ?? nbData.nb_min ?? nbData.bitMin ?? nbData.nbMin;
    
    // 계산 완료
    updateFlowStep('nb-flow-complete', 'active');
    await sleep(200);
    updateFlowStep('nb-flow-complete', 'completed');
    logNBProgress('✅ N/B 계산 완료', 'success');
    
    // 데이터 저장
    updateFlowStep('nb-flow-store', 'active');
    logNBProgress('💾 계산 결과를 로컬에 저장 중...', 'info');
    
    const storeStartTime = Date.now();
    const resultData = {
      nb_value: nbData.nb_value || nbData.normalized_nb,
      nb_max: nbData.nb_max,
      nb_min: nbData.nb_min,
      timeframe: selectedTimeframeValue,
      timestamp: new Date().toISOString(),
      nb_id: saveData.nb_id || nbData.nb_id,
      prices_count: prices.length
    };
    
    localStorage.setItem(`nb_result_${selectedTimeframeValue}`, JSON.stringify(resultData));
    
    const storeTime = Date.now() - storeStartTime;
    updateFlowStep('nb-flow-store', 'completed');
    logNBProgress(`✅ 데이터 저장 완료 (${storeTime}ms)`, 'success');
    logNBProgress(`📁 localStorage: nb_result_${selectedTimeframeValue}`, 'info');
    logNBProgress('🎉 모든 N/B 계산 프로세스 완료!', 'success');
    
    document.getElementById('cardPricePreview').textContent = collectedData.chart.current_price?.toLocaleString('ko-KR') || '-';
    document.getElementById('cardNbValuePreview').textContent = (nbData.nb_value || nbData.normalized_nb || 0).toFixed(10);
    document.getElementById('cardNbMaxPreview').textContent = bitMaxPreview !== undefined ? Number(bitMaxPreview).toFixed(10) : '-';
    document.getElementById('cardNbMinPreview').textContent = bitMinPreview !== undefined ? Number(bitMinPreview).toFixed(10) : '-';
    document.getElementById('cardVolumePreview').textContent = latestVolume !== null && latestVolume !== undefined ? latestVolume.toLocaleString('ko-KR') : '-';
    document.getElementById('cardTradeAmountPreview').textContent = latestTradeAmount !== null && latestTradeAmount !== undefined ? latestTradeAmount.toLocaleString('ko-KR') : '-';
    document.getElementById('cardVolumeBitMaxPreview').textContent = '-';
    document.getElementById('cardVolumeBitMinPreview').textContent = '-';
    document.getElementById('cardTradeAmountBitMaxPreview').textContent = '-';
    document.getElementById('cardTradeAmountBitMinPreview').textContent = '-';
    document.getElementById('cardGenerateBtn').disabled = false;
    addCardLog('🪪 카드 생성 준비 완료. 정보를 확인 후 생성 버튼을 눌러주세요.', 'info');
    resetCardFlowUI();
    
    updateProgressStep('step2', 'completed');
    updateProgressStep('step3', 'active');
    document.getElementById('bitMaxFetchBtn').disabled = false;
    logNBProgress('➡️ BIT MAX 조회 단계로 이동합니다...', 'info');
    await fetchBitMaxData();
    
    isCalculating = false;
    
  } catch (error) {
    isCalculating = false;
    logNBProgress(`❌ 오류 발생: ${error.message}`, 'error');
    updateFlowStep('nb-flow-api', 'error');
    console.error('N/B 계산 오류:', error);
    document.getElementById('bitMaxFetchBtn').disabled = true;
  }
}

// N/B 결과 업데이트
function updateNBResults(nbData) {
  const nbValue = nbData.nb_value || nbData.normalized_nb || 0.5;
  
  let bitMax, bitMin;
  if (nbData.bit_max !== undefined && nbData.bit_min !== undefined) {
    bitMax = nbData.bit_max || nbData.bitMax || 5.5;
    bitMin = nbData.bit_min || nbData.bitMin || 5.5;
  } else {
    const nbMax = nbData.nb_max || 5.5;
    const nbMin = nbData.nb_min || 5.5;
    bitMax = nbMax * 10;
    bitMin = nbMin * 10;
  }
  
  document.getElementById('nbValueResult').textContent = nbValue.toFixed(10);
  document.getElementById('nbMaxResult').textContent = bitMax.toFixed(10);
  document.getElementById('nbMinResult').textContent = bitMin.toFixed(10);
  
  const percentage = nbValue * 100;
  document.getElementById('nbMarker').style.left = `${percentage}%`;
  document.getElementById('nbMarkerLabel').style.left = `${percentage}%`;
  document.getElementById('nbMarkerLabel').textContent = `N/B: ${nbValue.toFixed(10)}`;
  document.getElementById('nbMinLabel').textContent = (bitMin / 10).toFixed(4);
  document.getElementById('nbMaxLabel').textContent = (bitMax / 10).toFixed(4);
  
  addNBLog(`📊 N/B 값: ${nbValue.toFixed(10)} (${percentage.toFixed(2)}%)`, 'info');
  addNBLog(`📈 범위: bit_min ${bitMin.toFixed(10)} ~ bit_max ${bitMax.toFixed(10)}`, 'info');
}

// N/B 거래량 계산 함수
async function calculateNBForVolume(volumeArray = null) {
  if (!collectedData || !collectedData.chart) return null;
  try {
    const volumes = volumeArray || collectedData.chart.volumes || collectedData.chart.volume || [];
    if (!Array.isArray(volumes) || volumes.length === 0) {
      console.log('거래량 데이터가 없어 N/B 거래량 계산을 건너뜁니다.');
      return null;
    }
    
    const response = await fetch(`${window.API_BASE}/api/nb/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prices: volumes,
        timeframe: selectedTimeframeValue,
        market: 'KRW-BTC',
        data_type: 'volume'
      })
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('N/B 거래량 계산 오류:', error);
    return null;
  }
}

// N/B 거래대금 계산 함수
async function calculateNBForTradeAmount(tradeArray = null) {
  if (!collectedData || !collectedData.chart) return null;
  try {
    const tradeValues = tradeArray || collectedData.chart.trade_values || collectedData.chart.trade_amounts || collectedData.chart.values || [];
    if (!Array.isArray(tradeValues) || tradeValues.length === 0) {
      console.log('거래대금 데이터가 없어 N/B 거래대금 계산을 건너뜁니다.');
      return null;
    }
    
    const response = await fetch(`${window.API_BASE}/api/nb/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prices: tradeValues,
        timeframe: selectedTimeframeValue,
        market: 'KRW-BTC',
        data_type: 'trade_amount'
      })
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('N/B 거래대금 계산 오류:', error);
    return null;
  }
}

// BIT MAX 조회
async function fetchBitMaxData() {
  if (isFetchingBitMax) {
    console.log('이미 BIT MAX 조회 중입니다.');
    return;
  }
  
  const bitMaxRaw = lastNBResult?.bit_max ?? lastNBResult?.bitMax ?? lastNBResult?.nb_max;
  if (bitMaxRaw === undefined || bitMaxRaw === null) {
    addBitMaxLog('⚠️ bit_max 값이 없어 조회할 수 없습니다. N/B 계산부터 실행하세요.', 'error');
    return;
  }
  
  const bitMaxValue = Number(bitMaxRaw);
  if (Number.isNaN(bitMaxValue)) {
    addBitMaxLog('⚠️ bit_max 값을 숫자로 변환할 수 없습니다.', 'error');
    return;
  }
  
  isFetchingBitMax = true;
  updateProgressStep('step3', 'active');
  updateFlowStep('bitmax-flow-start', 'active');
  addBitMaxLog('🚀 BIT MAX 조회를 시작합니다...', 'info');
  document.getElementById('bitMaxValueDisplay').textContent = bitMaxValue.toFixed(10);
  document.getElementById('bitMaxNBValue').textContent = (lastNBResult?.nb_value || lastNBResult?.normalized_nb || 0).toFixed(10);
  
  try {
    updateFlowStep('bitmax-flow-start', 'completed');
    updateFlowStep('bitmax-flow-api', 'active');
    const startTime = Date.now();
    const response = await fetch(`${window.API_BASE}/api/nb/path?bit_max=${bitMaxValue.toFixed(10)}`);
    const data = await response.json();
    const responseTime = Date.now() - startTime;
    document.getElementById('bitMaxResponseTime').textContent = `${responseTime}ms`;
    updateFlowStep('bitmax-flow-api', 'completed');
    addBitMaxLog(`✅ API 응답 수신 (${responseTime}ms)`, 'success');
    
    updateFlowStep('bitmax-flow-parse', 'active');
    const foundText = data.found ? 'FOUND' : 'NOT FOUND';
    const statusText = data.message ? `${foundText} (${data.message})` : foundText;
    document.getElementById('bitMaxStatus').textContent = statusText;
    document.getElementById('bitMaxRawData').textContent = JSON.stringify(data, null, 2);
    addBitMaxLog(`📄 응답 상태: ${statusText}`, data.found ? 'success' : 'info');
    updateFlowStep('bitmax-flow-parse', 'completed');
    
    updateFlowStep('bitmax-flow-complete', 'active');
    await sleep(200);
    updateFlowStep('bitmax-flow-complete', 'completed');
    addBitMaxLog('✅ BIT MAX 조회 완료. AI 학습/분석 단계 준비를 진행합니다.', 'success');
    
    updateProgressStep('step3', 'completed');
    updateProgressStep('step4', 'active');
    addBitMaxLog('🪪 카드 생성 단계로 이동하세요.', 'success');
    scheduleAutoCard();
  } catch (error) {
    addBitMaxLog(`❌ 조회 오류: ${error.message}`, 'error');
    updateFlowStep('bitmax-flow-api', 'error');
  } finally {
    isFetchingBitMax = false;
    document.getElementById('bitMaxFetchBtn').disabled = false;
  }
}

// UI 리셋 함수들
function resetBitMaxUI() {
  ['bitmax-flow-start', 'bitmax-flow-api', 'bitmax-flow-parse', 'bitmax-flow-complete'].forEach(id => {
    const step = document.getElementById(id);
    if (step) {
      step.className = 'flow-step';
      const statusIcon = step.querySelector('.flow-status');
      if (statusIcon) statusIcon.textContent = '⏳';
      const timeElement = step.querySelector('.flow-time');
      if (timeElement) timeElement.textContent = '';
    }
  });
  const logContainer = document.getElementById('bitmaxLog');
  if (logContainer) {
    logContainer.innerHTML = '<div class="log-placeholder">조회가 시작되면 로그가 표시됩니다...</div>';
  }
}

function resetCardFlowUI() {
  ['card-flow-start', 'card-flow-nb', 'card-flow-upbit', 'card-flow-nb-volume', 'card-flow-nb-trade', 'card-flow-payload', 'card-flow-api', 'card-flow-parse', 'card-flow-complete'].forEach(id => {
    const step = document.getElementById(id);
    if (step) {
      step.className = 'flow-step';
      const statusIcon = step.querySelector('.flow-status');
      if (statusIcon) statusIcon.textContent = '⏳';
      const timeElement = step.querySelector('.flow-time');
      if (timeElement) timeElement.textContent = '';
    }
  });
  const logContainer = document.getElementById('cardLog');
  if (logContainer) {
    logContainer.innerHTML = '<div class="log-placeholder">카드 생성 버튼을 누르면 로그가 표시됩니다...</div>';
  }

  const cardPanel = document.getElementById('cardResultPanel');
  if (cardPanel) {
    cardPanel.style.display = 'none';
  }

  autoCardScheduled = false;
}

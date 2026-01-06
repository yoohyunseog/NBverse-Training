// 데이터 수집 관련 함수들

// 데이터 수집 함수
async function collectData() {
  if (isCollecting) {
    console.log('이미 데이터 수집 중입니다.');
    return;
  }
  
  isCollecting = true;
  autoCardScheduled = false;
  addLog('🚀 데이터 수집을 시작합니다...', 'info');
  updateFlowStep('flow-start', 'active');
  
  try {
    updateFlowStep('flow-start', 'completed');
    updateFlowStep('flow-api', 'active');
    const apiTimeframe = convertTimeframeForAPI(selectedTimeframeValue);
    addLog(`📡 API 호출: GET /api/chart?timeframe=${apiTimeframe}&count=200`, 'info');
    
    const startTime = Date.now();
    const chartResponse = await fetch(`${window.API_BASE}/api/chart?timeframe=${apiTimeframe}&count=200`);
    const chartData = await chartResponse.json();
    const chartResponseTime = Date.now() - startTime;
    
    console.log('📊 API 응답 데이터:', chartData);
    
    // 홀수 인덱스만 추출
    const originalPrices = chartData.prices;
    const oddIndexPrices = originalPrices.filter((_, index) => index % 2 === 1);
    chartData.prices = oddIndexPrices;
    chartData.current_price = oddIndexPrices[oddIndexPrices.length - 1];

    // volumes, trade_values, trade_amounts, values 필터링
    if (Array.isArray(chartData.volumes) && chartData.volumes.length === originalPrices.length) {
      chartData.volumes = chartData.volumes.filter((_, index) => index % 2 === 1);
    }
    if (Array.isArray(chartData.trade_values) && chartData.trade_values.length === originalPrices.length) {
      chartData.trade_values = chartData.trade_values.filter((_, index) => index % 2 === 1);
    }
    if (Array.isArray(chartData.trade_amounts) && chartData.trade_amounts.length === originalPrices.length) {
      chartData.trade_amounts = chartData.trade_amounts.filter((_, index) => index % 2 === 1);
    }
    if (Array.isArray(chartData.values) && chartData.values.length === originalPrices.length) {
      chartData.values = chartData.values.filter((_, index) => index % 2 === 1);
    } else {
      chartData.values = [];
    }
    
    updateFlowStep('flow-api', 'completed');
    addLog(`✅ 차트 데이터 수신 완료 (${chartResponseTime}ms)`, 'success');
    addLog(`📊 홀수 인덱스 추출: ${originalPrices.length}개 → ${oddIndexPrices.length}개`, 'info');
    
    updateFlowStep('flow-receive', 'active');
    addLog(`📦 데이터 파싱 중... (${chartData.prices?.length || 0}개 캔들)`, 'info');
    
    await sleep(500);
    updateFlowStep('flow-receive', 'completed');
    addLog('✅ 데이터 파싱 완료', 'success');
    
    // 자산 정보 수집
    addLog('📡 API 호출: GET /api/balance', 'info');
    const balanceStartTime = Date.now();
    const balanceResponse = await fetch(`${window.API_BASE}/api/balance`);
    const balanceData = await balanceResponse.json();
    const balanceResponseTime = Date.now() - balanceStartTime;
    
    addLog(`✅ 자산 정보 수신 완료 (${balanceResponseTime}ms)`, 'success');
    
    // 데이터 검증
    updateFlowStep('flow-validate', 'active');
    addLog('🔍 데이터 유효성 검사 중...', 'info');
    
    if (!chartData.prices || chartData.prices.length === 0) {
      throw new Error('차트 데이터가 비어있습니다');
    }
    
    await sleep(300);
    updateFlowStep('flow-validate', 'completed');
    addLog('✅ 데이터 검증 완료', 'success');
    
    // 완료
    updateFlowStep('flow-complete', 'active');
    await sleep(300);
    updateFlowStep('flow-complete', 'completed');
    addLog('🎉 데이터 수집 완료!', 'success');
    
    collectedData = {
      chart: chartData,
      balance: balanceData,
      chartResponseTime,
      balanceResponseTime
    };
    
    // window 객체에도 할당하여 다른 모듈에서 접근 가능하게 함
    window.collectedData = collectedData;

    updateUpbitChartDisplay();
    
    const volumes = chartData.volumes || chartData.volume || [];
    const tradeValues = chartData.trade_values || chartData.trade_amounts || chartData.values || [];
    
    document.getElementById('volumeRawData').textContent = JSON.stringify(volumes, null, 2);
    document.getElementById('tradeAmountRawData').textContent = JSON.stringify(tradeValues, null, 2);
    
    addLog(`📊 거래량 배열: ${volumes.length}개 항목`, 'info');
    addLog(`💰 거래대금 배열: ${tradeValues.length}개 항목`, 'info');
    
    updateDataPreview(collectedData);
    updateProgressStep('step1', 'completed');
    updateProgressStep('step2', 'active');
    
    document.getElementById('nbCalculateBtn').disabled = false;
    
    addLog('⏭️ N/B 계산을 자동으로 시작합니다...', 'info');
    await sleep(1000);
    await calculateNB();
    
    isCollecting = false;
    
  } catch (error) {
    isCollecting = false;
    addLog(`❌ 오류 발생: ${error.message}`, 'error');
    updateFlowStep('flow-api', 'error');
    console.error('데이터 수집 오류:', error);
  }
}

function startAnalysis() {
  console.log('분석 시작 버튼 클릭');
  if (!isCollecting) {
    collectData();
  }
}

function refreshData() {
  console.log('데이터 새로고침');
  collectData();
}

// 메인 데이터 수집 및 분석 함수들

// 데이터 수집 함수
async function collectData() {
  if (isCollecting) {
    console.log('이미 데이터 수집 중입니다.');
    return;
  }
  
  isCollecting = true;
  window.autoCardScheduled = false;
  addLog('🚀 데이터 수집을 시작합니다...', 'info');
  updateFlowStep('flow-start', 'active');
  
  try {
    // 1. 차트 데이터 수집
    updateFlowStep('flow-start', 'completed');
    updateFlowStep('flow-api', 'active');
    const apiTimeframe = convertTimeframeForAPI(window.selectedTimeframeValue);
    addLog(`📡 API 호출: GET /api/chart?timeframe=${apiTimeframe}&count=200`, 'info');
    
    const startTime = Date.now();
    const chartResponse = await fetch(`${API_BASE}/api/chart?timeframe=${apiTimeframe}&count=200`);
    const chartData = await chartResponse.json();
    const chartResponseTime = Date.now() - startTime;
    
    // 디버그: API 응답 로깅
    console.log('📊 API 응답 데이터:', chartData);
    console.log('📊 volumes 필드:', chartData.volumes);
    console.log('📊 trade_values 필드:', chartData.trade_values);
    console.log('📊 trade_amounts 필드:', chartData.trade_amounts);
    
    // 홀수 인덱스만 추출 (0, 2, 4, 6, ... -> 제거하고 1, 3, 5, 7, ... 만 사용)
    const originalPrices = chartData.prices;
    const oddIndexPrices = originalPrices.filter((_, index) => index % 2 === 1);
    chartData.prices = oddIndexPrices;
    chartData.current_price = oddIndexPrices[oddIndexPrices.length - 1];

    if (Array.isArray(chartData.volumes) && chartData.volumes.length === originalPrices.length) {
      chartData.volumes = chartData.volumes.filter((_, index) => index % 2 === 1);
      console.log(`✅ volumes 필터링 완료: ${chartData.volumes.length}개 항목`);
    } else if (Array.isArray(chartData.volumes)) {
      console.log(`⚠️ volumes 길이 불일치: originalPrices=${originalPrices.length}, volumes=${chartData.volumes.length}`);
    } else {
      console.log('⚠️ volumes는 배열이 아님');
    }
    
    if (Array.isArray(chartData.trade_values) && chartData.trade_values.length === originalPrices.length) {
      chartData.trade_values = chartData.trade_values.filter((_, index) => index % 2 === 1);
      console.log(`✅ trade_values 필터링 완료: ${chartData.trade_values.length}개 항목`);
    } else if (Array.isArray(chartData.trade_values)) {
      console.log(`⚠️ trade_values 길이 불일치: originalPrices=${originalPrices.length}, trade_values=${chartData.trade_values.length}`);
    } else {
      console.log('⚠️ trade_values는 배열이 아님');
    }
    
    if (Array.isArray(chartData.trade_amounts) && chartData.trade_amounts.length === originalPrices.length) {
      chartData.trade_amounts = chartData.trade_amounts.filter((_, index) => index % 2 === 1);
      console.log(`✅ trade_amounts 필터링 완료: ${chartData.trade_amounts.length}개 항목`);
    } else if (Array.isArray(chartData.trade_amounts)) {
      console.log(`⚠️ trade_amounts 길이 불일치: originalPrices=${originalPrices.length}, trade_amounts=${chartData.trade_amounts.length}`);
    } else {
      console.log('⚠️ trade_amounts는 배열이 아님');
    }
    
    if (Array.isArray(chartData.values) && chartData.values.length === originalPrices.length) {
      chartData.values = chartData.values.filter((_, index) => index % 2 === 1);
      console.log(`✅ values 필터링 완료: ${chartData.values.length}개 항목`);
    } else if (Array.isArray(chartData.values)) {
      console.log(`⚠️ values 길이 불일치: originalPrices=${originalPrices.length}, values=${chartData.values.length}`);
    } else {
      chartData.values = [];
      console.log('ℹ️ values가 배열이 아니어서 빈 배열로 대체합니다');
    }
    
    updateFlowStep('flow-api', 'completed');
    addLog(`✅ 차트 데이터 수신 완료 (${chartResponseTime}ms)`, 'success');
    addLog(`📊 홀수 인덱스 추출: ${originalPrices.length}개 → ${oddIndexPrices.length}개`, 'info');
    
    // 2. 데이터 수신
    updateFlowStep('flow-receive', 'active');
    addLog(`📦 데이터 파싱 중... (${chartData.prices?.length || 0}개 캔들)`, 'info');
    
    await sleep(500);
    updateFlowStep('flow-receive', 'completed');
    addLog('✅ 데이터 파싱 완료', 'success');
    
    // 3. 자산 정보 수집
    addLog('📡 API 호출: GET /api/balance', 'info');
    const balanceStartTime = Date.now();
    const balanceResponse = await fetch(`${API_BASE}/api/balance`);
    const balanceData = await balanceResponse.json();
    const balanceResponseTime = Date.now() - balanceStartTime;
    
    addLog(`✅ 자산 정보 수신 완료 (${balanceResponseTime}ms)`, 'success');
    
    // 4. 데이터 검증
    updateFlowStep('flow-validate', 'active');
    addLog('🔍 데이터 유효성 검사 중...', 'info');
    
    if (!chartData.prices || chartData.prices.length === 0) {
      throw new Error('차트 데이터가 비어있습니다');
    }
    
    await sleep(300);
    updateFlowStep('flow-validate', 'completed');
    addLog('✅ 데이터 검증 완료', 'success');
    
    // 5. 완료
    updateFlowStep('flow-complete', 'active');
    await sleep(300);
    updateFlowStep('flow-complete', 'completed');
    addLog('🎉 데이터 수집 완료!', 'success');
    
    // 수집된 데이터 저장 (전역 window 객체에 저장)
    window.collectedData = {
      chart: chartData,
      balance: balanceData,
      chartResponseTime,
      balanceResponseTime
    };

    // 차트 및 가격 정보 갱신
    updateUpbitChartDisplay();
    
    // 거래량/거래대금 원시 데이터 표시
    const volumes = chartData.volumes || chartData.volume || [];
    const tradeValues = chartData.trade_values || chartData.trade_amounts || chartData.values || [];
    
    console.log('📝 최종 저장 전 데이터:');
    console.log('  - volumes:', volumes, '길이:', volumes.length);
    console.log('  - tradeValues:', tradeValues, '길이:', tradeValues.length);
    
    document.getElementById('volumeRawData').textContent = JSON.stringify(volumes, null, 2);
    document.getElementById('tradeAmountRawData').textContent = JSON.stringify(tradeValues, null, 2);
    
    addLog(`📊 거래량 배열: ${volumes.length}개 항목`, 'info');
    addLog(`💰 거래대금 배열: ${tradeValues.length}개 항목`, 'info');
    
    // 데이터 미리보기 업데이트
    updateDataPreview(window.collectedData);
    
    // 진행 단계 추적 업데이트
    updateProgressStep('step1', 'completed');
    updateProgressStep('step2', 'active');
    
    // N/B 계산 버튼 활성화
    document.getElementById('nbCalculateBtn').disabled = false;
    
    // 자동으로 N/B 계산 시작
    addLog('⏭️ N/B 계산을 자동으로 시작합니다...', 'info');
    await sleep(1000);
    await calculateNB();
    
    isCollecting = false; // 플래그 해제
    
  } catch (error) {
    isCollecting = false; // 오류 시에도 플래그 해제
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

// 데이터 미리보기 업데이트
function updateDataPreview(data) {
  document.getElementById('chartDataCount').textContent = data.chart.prices?.length || 0;
  document.getElementById('currentPrice').textContent = 
    data.chart.current_price?.toLocaleString('ko-KR') + ' KRW' || '-';
  document.getElementById('balanceTotal').textContent = 
    data.balance.total?.toLocaleString('ko-KR') + ' KRW' || '-';
  document.getElementById('responseTime').textContent = 
    `${data.chartResponseTime}ms`;
  
  // 원시 데이터 표시
  document.getElementById('rawData').textContent = 
    JSON.stringify({
      chart: {
        timeframe: data.chart.timeframe,
        prices_count: data.chart.prices?.length,
        current_price: data.chart.current_price,
        first_price: data.chart.prices?.[0],
        last_price: data.chart.prices?.[data.chart.prices.length - 1],
        last_volume: getLatestVolume(),
        last_trade_amount: getLatestTradeAmount()
      },
      balance: {
        krw: data.balance.krw,
        btc: data.balance.btc,
        total: data.balance.total
      },
      performance: {
        chart_response_time: `${data.chartResponseTime}ms`,
        balance_response_time: `${data.balanceResponseTime}ms`
      }
    }, null, 2);
}

// 분봉 값을 API 형식으로 변환
function convertTimeframeForAPI(timeframe) {
  if (timeframe === '1d') return '1d';
  return `${timeframe}m`;
}

// 분봉 선택 함수
function selectTimeframe(timeframe) {
  window.selectedTimeframeValue = timeframe;
  
  // 모든 버튼에서 active 제거
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 선택된 버튼에 active 추가
  document.querySelector(`[data-timeframe="${timeframe}"]`).classList.add('active');
  
  // 선택된 분봉 정보 업데이트
  document.getElementById('selectedTimeframe').textContent = timeframeNames[timeframe];
  
  // 진행 단계 업데이트
  const step0 = document.getElementById('step0');
  step0.querySelector('.step-description').textContent = `${timeframeNames[timeframe]} 선택됨`;
  step0.classList.add('completed');
  
  console.log(`분봉 선택: ${timeframeNames[timeframe]}`);
  
  // 데이터 수집 및 분석 다시 시작
  if (!isCollecting) {
    collectData();
  }
}

// 다음 분봉으로 이동
function moveToNextTimeframe() {
  const currentIndex = window.timeframeOrder.indexOf(window.selectedTimeframeValue);
  if (currentIndex < timeframeOrder.length - 1) {
    const nextTimeframe = timeframeOrder[currentIndex + 1];
    addLog(`⏭️ 다음 분봉으로 이동: ${timeframeNames[nextTimeframe]}`, 'success');
    setTimeout(() => {
      selectTimeframe(nextTimeframe);
    }, 2000);
  } else {
    // 1d 분봉 완료 후 다시 1분봉부터 시작
    addLog('🎉 모든 분봉 분석이 완료되었습니다!', 'success');
    addLog('🔄 1분봉부터 다시 시작합니다...', 'info');
    setTimeout(() => {
      selectTimeframe(timeframeOrder[0]); // 1분봉으로 돌아가기
    }, 2000);
  }
}

function refreshData() {
  console.log('데이터 새로고침');
  collectData();
}

// Export functions to window
window.collectData = collectData;
window.startAnalysis = startAnalysis;
window.updateDataPreview = updateDataPreview;
window.selectTimeframe = selectTimeframe;
window.moveToNextTimeframe = moveToNextTimeframe;
window.convertTimeframeForAPI = convertTimeframeForAPI;
window.refreshData = refreshData;

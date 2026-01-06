// UI 업데이트 및 렌더링 함수들

// 로그 추가 함수
function addLog(message, type = 'info') {
  const logContainer = document.getElementById('apiLog');
  if (!logContainer) return;
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();
  
  const time = new Date().toLocaleTimeString('ko-KR', { 
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// BIT MAX 로그
function addBitMaxLog(message, type = 'info') {
  const logContainer = document.getElementById('bitmaxLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();
  
  const time = new Date().toLocaleTimeString('ko-KR', { 
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// N/B 로그
function addNBLog(message, type = 'info') {
  const logContainer = document.getElementById('nbLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();
  
  const time = new Date().toLocaleTimeString('ko-KR', { 
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 카드 로그
function addCardLog(message, type = 'info') {
  const logContainer = document.getElementById('cardLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();
  
  const time = new Date().toLocaleTimeString('ko-KR', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 기본 분석 로그
function addBasicAnalysisLog(message, type = 'info') {
  const logContainer = document.getElementById('basicAnalysisLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();
  
  const time = new Date().toLocaleTimeString('ko-KR', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// N/B 계산 로그 (메인/전용 패널 모두)
function logNBProgress(message, type = 'info') {
  addNBLog(message, type);
  addLog(message, type);
}

// 플로우 단계 업데이트
function updateFlowStep(stepId, status) {
  const step = document.getElementById(stepId);
  if (!step) return;
  step.className = `flow-step ${status}`;
  
  const statusIcon = step.querySelector('.flow-status');
  const timeElement = step.querySelector('.flow-time');
  
  if (status === 'active') {
    statusIcon.textContent = '⏳';
    flowTimers[stepId] = Date.now();
    if (timeElement) timeElement.textContent = '';
  } else if (status === 'completed') {
    statusIcon.textContent = '✅';
    if (flowTimers[stepId] && timeElement) {
      const elapsed = Date.now() - flowTimers[stepId];
      timeElement.textContent = `⚡ ${elapsed}ms`;
    }
  } else if (status === 'error') {
    statusIcon.textContent = '❌';
  }
}

// 진행 단계 업데이트
function updateProgressStep(stepId, status) {
  const step = document.getElementById(stepId);
  if (!step) return;
  step.className = `progress-step ${status}`;
  
  const statusText = step.querySelector('.step-status');
  if (status === 'active') {
    statusText.textContent = '진행 중';
  } else if (status === 'completed') {
    statusText.textContent = '완료';
  }
}

// 데이터 미리보기 업데이트
function updateDataPreview(data) {
  document.getElementById('chartDataCount').textContent = data.chart.prices?.length || 0;
  document.getElementById('currentPrice').textContent = 
    data.chart.current_price?.toLocaleString('ko-KR') + ' KRW' || '-';
  document.getElementById('balanceTotal').textContent = 
    data.balance.total?.toLocaleString('ko-KR') + ' KRW' || '-';
  document.getElementById('responseTime').textContent = `${data.chartResponseTime}ms`;
  
  document.getElementById('rawData').textContent = JSON.stringify({
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

// 복사 함수들
function copyRawData() {
  const rawData = document.getElementById('rawData').textContent;
  navigator.clipboard.writeText(rawData).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => btn.textContent = originalText, 2000);
  });
}

function copyNBData() {
  const nbData = document.getElementById('nbRawData').textContent;
  navigator.clipboard.writeText(nbData).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => btn.textContent = originalText, 2000);
  });
}

function copyBitMaxData() {
  const raw = document.getElementById('bitMaxRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => btn.textContent = originalText, 2000);
  });
}

function copyCardData() {
  const raw = document.getElementById('cardRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => btn.textContent = originalText, 2000);
  });
}

function copyVolumeData() {
  const raw = document.getElementById('volumeRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => btn.textContent = originalText, 2000);
  });
}

function copyTradeAmountData() {
  const raw = document.getElementById('tradeAmountRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => btn.textContent = originalText, 2000);
  });
}

// 섹션으로 스크롤 이동
function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    const headerHeight = document.querySelector('.header-container').offsetHeight;
    const progressHeight = document.querySelector('.progress-tracker').offsetHeight;
    const offset = headerHeight + progressHeight + 20;
    
    const elementPosition = section.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;
    
    window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    
    section.style.transition = 'all 0.3s';
    section.style.boxShadow = '0 0 20px rgba(88, 166, 255, 0.5)';
    setTimeout(() => section.style.boxShadow = '', 1000);
  }
}

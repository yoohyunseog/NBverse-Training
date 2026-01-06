// 로그 및 UI 업데이트 관련 함수들

// BIT MAX 로그 추가 함수
function addBitMaxLog(message, type = 'info') {
  const logContainer = document.getElementById('bitmaxLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const time = new Date().toLocaleTimeString('ko-KR', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit'
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// N/B 로그 추가 함수
function addNBLog(message, type = 'info') {
  const logContainer = document.getElementById('nbLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const time = new Date().toLocaleTimeString('ko-KR', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit'
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// N/B 계산 로그를 메인/전용 패널 모두에 남김
function logNBProgress(message, type = 'info') {
  addNBLog(message, type);
  addLog(message, type);
}

// 카드 생성 로그 추가
function addCardLog(message, type = 'info') {
  const logContainer = document.getElementById('cardLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  const time = new Date().toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

// 기본 분석 로그 추가
function addBasicAnalysisLog(message, type = 'info') {
  const logContainer = document.getElementById('basicAnalysisLog');
  const placeholder = logContainer.querySelector('.log-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  const time = new Date().toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
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
    flowTimers[stepId] = Date.now(); // 시작 시간 기록
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

// BIT MAX 플로우 상태 초기화
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

// 카드 생성 플로우 초기화
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

// 분봉 선택 및 관리

// 분봉 선택 함수
function selectTimeframe(timeframe) {
  selectedTimeframeValue = timeframe;
  
  // 모든 버튼에서 active 제거
  document.querySelectorAll('.timeframe-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // 선택된 버튼에 active 추가
  const selectedBtn = document.querySelector(`[data-timeframe="${timeframe}"]`);
  if (selectedBtn) selectedBtn.classList.add('active');
  
  // 선택된 분봉 정보 업데이트
  const selectedEl = document.getElementById('selectedTimeframe');
  if (selectedEl) selectedEl.textContent = timeframeNames[timeframe];
  
  // 진행 단계 업데이트
  const step0 = document.getElementById('step0');
  if (step0) {
    const desc = step0.querySelector('.step-description');
    if (desc) desc.textContent = `${timeframeNames[timeframe]} 선택됨`;
    step0.classList.add('completed');
  }
  
  console.log(`분봉 선택: ${timeframeNames[timeframe]}`);
  
  // 데이터 수집 및 분석 다시 시작
  if (!isCollecting) {
    collectData();
  }
}

// 다음 분봉으로 이동
function moveToNextTimeframe() {
  const currentIndex = timeframeOrder.indexOf(selectedTimeframeValue);
  if (currentIndex < timeframeOrder.length - 1) {
    const nextTimeframe = timeframeOrder[currentIndex + 1];
    addLog(`⏭️ 다음 분봉으로 이동: ${timeframeNames[nextTimeframe]}`, 'success');
    setTimeout(() => {
      selectTimeframe(nextTimeframe);
    }, 2000);
  } else {
    addLog('🎉 모든 분봉 분석이 완료되었습니다!', 'success');
    if (isAutoLooping) {
      addLog('🔄 1분봉부터 다시 시작합니다...', 'info');
      setTimeout(() => {
        selectTimeframe(timeframeOrder[0]);
      }, 2000);
    } else {
      addLog('🔄 수동 모드: 1분봉부터 다시 시작합니다...', 'info');
      setTimeout(() => {
        selectTimeframe(timeframeOrder[0]);
      }, 2000);
    }
  }
}

// 자동 순회 토글
function toggleAutoLoop() {
  isAutoLooping = !isAutoLooping;
  const btn = document.getElementById('autoLoopBtn');
  
  if (isAutoLooping) {
    btn.classList.add('active');
    btn.textContent = '⏸️ 순회 중지';
    btn.style.background = 'linear-gradient(135deg, #3fb950 0%, #2ea043 100%)';
    addLog('🔁 자동 순회가 시작되었습니다. 모든 분봉을 순회하며 분석합니다.', 'success');
    
    // 현재 분봉에서 바로 시작
    if (!isCollecting) {
      collectData();
    }
  } else {
    btn.classList.remove('active');
    btn.textContent = '🔁 자동 순회';
    btn.style.background = '';
    addLog('⏸️ 자동 순회가 중지되었습니다.', 'info');
    
    if (autoLoopTimer) {
      clearTimeout(autoLoopTimer);
      autoLoopTimer = null;
    }
  }
}

// Export
window.toggleAutoLoop = toggleAutoLoop;

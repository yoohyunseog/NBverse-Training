// 플로우 리셋 및 초기화

// 플로우만 리셋 후 0/1단계 상태로 복귀 (데이터/카드 유지)
async function runFlowReset() {
  console.log('🔄 플로우 리셋 시작 - 순회 모드');
  updateFlowStep('reset-flow-start', 'active');
  
  return new Promise((resolve) => {
    setTimeout(() => {
      updateFlowStep('reset-flow-start', 'completed');
      updateFlowStep('reset-flow-progress', 'active');
      
      ['step0','step1','step2','step3','step4','step5','step6','step7','step8','step9'].forEach((id, idx) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('completed', 'active');
        const status = el.querySelector('.step-status');
        if (idx === 0) {
          el.classList.add('completed');
          if (status) status.textContent = '완료';
        } else {
          if (status) status.textContent = '대기';
        }
      });
      
      collectedData = null;
      lastNBResult = null;
      lastCardResponse = null;
      autoCardScheduled = false;
      latestPredictionCard = null;
      tradingCards = [];
      ownedCards = [];
      isCollecting = false;
      isCalculating = false;
      isFetchingBitMax = false;
      isGeneratingCard = false;
      window._aiAnalysisStep7Started = false;
      tradingCardsGenerated = false;
      
      setTimeout(() => {
        updateFlowStep('reset-flow-progress', 'completed');
        updateFlowStep('reset-flow-data', 'active');
        
        ['flow-start','flow-validate','flow-complete'].forEach(id => {
          const step = document.getElementById(id);
          if (step) {
            step.className = 'flow-step';
            const statusIcon = step.querySelector('.flow-status');
            if (statusIcon) statusIcon.textContent = '⏳';
            const timeElement = step.querySelector('.flow-time');
            if (timeElement) timeElement.textContent = '';
          }
        });
        
        setTimeout(() => {
          updateFlowStep('reset-flow-data', 'completed');
          updateFlowStep('reset-flow-card', 'active');
          
          ['card-flow-start','card-flow-nb','card-flow-upbit','card-flow-nb-volume','card-flow-nb-trade','card-flow-payload','card-flow-api','card-flow-parse','card-flow-complete'].forEach(id => {
            const step = document.getElementById(id);
            if (step) {
              step.className = 'flow-step';
              const statusIcon = step.querySelector('.flow-status');
              if (statusIcon) statusIcon.textContent = '⏳';
              const timeElement = step.querySelector('.flow-time');
              if (timeElement) timeElement.textContent = '';
            }
          });
          
          setTimeout(() => {
            updateFlowStep('reset-flow-card', 'completed');
            updateFlowStep('reset-flow-ai', 'active');
            
            ['ai-analysis-flow-start','ai-analysis-flow-card','ai-analysis-flow-predict','ai-analysis-flow-complete','trade-flow-start','trade-flow-import','trade-flow-generate'].forEach(id => {
              const step = document.getElementById(id);
              if (step) {
                step.className = 'flow-step';
                const statusIcon = step.querySelector('.flow-status');
                if (statusIcon) statusIcon.textContent = '⏳';
                const timeElement = step.querySelector('.flow-time');
                if (timeElement) timeElement.textContent = '';
              }
            });
            
            setTimeout(() => {
              updateFlowStep('reset-flow-ai', 'completed');
              updateFlowStep('reset-flow-restart', 'active');
              
              document.getElementById('chartDataCount').textContent = '0';
              document.getElementById('currentPrice').textContent = '-';
              document.getElementById('balanceTotal').textContent = '-';
              document.getElementById('responseTime').textContent = '-';
              document.getElementById('rawData').textContent = '';
              
              const apiLog = document.getElementById('apiLog');
              if (apiLog) apiLog.innerHTML = '<div class="log-placeholder">데이터 수집 버튼을 누르면 로그가 표시됩니다...</div>';
              
              setTimeout(() => {
                updateFlowStep('reset-flow-restart', 'completed');
                updateFlowStep('reset-flow-complete', 'completed');
                
                const step1 = document.getElementById('step1');
                if (step1) {
                  step1.classList.add('active');
                  const status = step1.querySelector('.step-status');
                  if (status) status.textContent = '진행 중';
                }
                
                setTimeout(() => {
                  collectData();
                  console.log('[FLOW] Reset complete - Starting next cycle');
                  resolve();
                }, 300);
              }, 150);
            }, 150);
          }, 150);
        }, 150);
      }, 150);
    });
  });
}

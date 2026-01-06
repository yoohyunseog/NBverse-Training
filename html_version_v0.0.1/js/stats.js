// 카드 통계 관리
let cardStats = {
  totalCards: 0,
  totalPredictions: 0,
  successfulPredictions: 0,
  failedPredictions: 0,
  accuracy: 0,
  aiLevel: 1,
  lastUpdated: null
};

// localStorage에서 통계 로드
function loadStats() {
  try {
    const saved = localStorage.getItem('cardStats');
    if (saved) {
      cardStats = JSON.parse(saved);
      updateStatsDisplay();
    }
  } catch (e) {
    console.error('통계 로드 실패:', e);
  }
}
window.loadStats = loadStats;

// localStorage에 통계 저장
function saveStats() {
  try {
    cardStats.lastUpdated = new Date().toISOString();
    localStorage.setItem('cardStats', JSON.stringify(cardStats));
    updateStatsDisplay();
  } catch (e) {
    console.error('통계 저장 실패:', e);
  }
}
window.saveStats = saveStats;

// 상단 헤더 통계 업데이트
function updateStatsDisplay() {
  const totalEl = document.getElementById('totalCards');
  const accEl = document.getElementById('accuracy');
  const levelEl = document.getElementById('aiLevel');
  if (!totalEl || !accEl || !levelEl) return;
  totalEl.textContent = cardStats.totalCards;
  accEl.textContent = cardStats.accuracy.toFixed(1) + '%';
  levelEl.textContent = 'LV ' + cardStats.aiLevel;
}
window.updateStatsDisplay = updateStatsDisplay;

// 카드 생성 시 통계 업데이트
function incrementCardCount() {
  cardStats.totalCards++;
  saveStats();
}
window.incrementCardCount = incrementCardCount;

// 예측 결과 기록
function recordPrediction(success) {
  cardStats.totalPredictions++;
  if (success) {
    cardStats.successfulPredictions++;
  } else {
    cardStats.failedPredictions++;
  }
  cardStats.accuracy = cardStats.totalPredictions > 0 
    ? (cardStats.successfulPredictions / cardStats.totalPredictions) * 100 
    : 0;
  cardStats.aiLevel = Math.floor(cardStats.successfulPredictions / 10) + 1;
  saveStats();
}
window.recordPrediction = recordPrediction;

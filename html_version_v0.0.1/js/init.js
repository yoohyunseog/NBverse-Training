// 페이지 초기화 및 예측 카드 렌더링

// 예측 카드 렌더링 함수
function renderPredictionCards(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const cards =
    (window.predictionCardList && window.predictionCardList.length)
      ? window.predictionCardList
      : (window.latestPredictionCard ? [window.latestPredictionCard] : []);

  if (!cards.length) {
    container.innerHTML = '<div style="color: #8b949e; text-align: center; padding: 16px;">예측 카드가 없습니다.</div>';
    return;
  }

  const tf = window.selectedTimeframeValue || '-';

  container.innerHTML = cards.map((card, idx) => {
    const price = (card.price !== undefined && card.price !== null) ? Number(card.price).toLocaleString('ko-KR') : '-';
    const nb = (card.nb_value !== undefined && card.nb_value !== null) ? Number(card.nb_value).toFixed(10) : '-';

    const bitMax = (card.bit_max !== undefined && card.bit_max !== null) ? Number(card.bit_max).toFixed(10) : '-';
    const bitMin = (card.bit_min !== undefined && card.bit_min !== null) ? Number(card.bit_min).toFixed(10) : '-';

    const volume = (card.volume !== undefined && card.volume !== null) ? Number(card.volume).toLocaleString('ko-KR') : '-';
    const vMax = (card.volume_bit_max !== undefined && card.volume_bit_max !== null) ? Number(card.volume_bit_max).toFixed(10) : '-';
    const vMin = (card.volume_bit_min !== undefined && card.volume_bit_min !== null) ? Number(card.volume_bit_min).toFixed(10) : '-';

    const trade = (card.trade_amount !== undefined && card.trade_amount !== null) ? Number(card.trade_amount).toLocaleString('ko-KR') : '-';
    const tMax = (card.trade_amount_bit_max !== undefined && card.trade_amount_bit_max !== null) ? Number(card.trade_amount_bit_max).toFixed(10) : '-';
    const tMin = (card.trade_amount_bit_min !== undefined && card.trade_amount_bit_min !== null) ? Number(card.trade_amount_bit_min).toFixed(10) : '-';

    const nextCandle = (typeof window.computeNextCandleTime === 'function') ? window.computeNextCandleTime(card) : '-';
    const created = card.created_at || '-';

    return `
      <div style="background: rgba(245,166,35,0.08); border: 1px solid rgba(245,166,35,0.35); border-radius: 8px; padding: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: 700; color: #f5a623; font-size: 13px;">🔮 예측 카드 #${idx + 1}</div>
          <div style="color: #8b949e; font-size: 11px;">${card.card_id || '-'}</div>
        </div>

        <div style="display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12px; color: #c9d1d9;">
          <div style="color: #8b949e;">예측 가격</div><div style="color:#f5a623;font-weight:700;">${price}</div>
          <div style="color: #8b949e;">N/B 값</div><div>${nb}</div>
          <div style="color: #8b949e;">bit_max/min</div><div>${bitMax} / ${bitMin}</div>

          <div style="color: #8b949e;">거래량</div><div>${volume}</div>
          <div style="color: #8b949e;">거래량 bit_max/min</div><div>${vMax} / ${vMin}</div>

          <div style="color: #8b949e;">거래대금</div><div>${trade}</div>
          <div style="color: #8b949e;">거래대금 bit_max/min</div><div>${tMax} / ${tMin}</div>

          <div style="color: #8b949e;">타임프레임</div><div>${card.timeframe || tf}</div>
          <div style="color: #8b949e;">다음 캔들 시각</div><div>${nextCandle}</div>
          <div style="color: #8b949e;">생성 시각</div><div>${created}</div>
        </div>
      </div>
    `;
  }).join('');
}

// 페이지 로드 시 자동 실행
window.addEventListener('DOMContentLoaded', () => {
  console.log('페이지 로드 완료');
  
  // 예측 카드 렌더링
  renderPredictionCards('aiPredictionCardList');
  renderPredictionCards('predictionCardListStep8');
  
  // 스크롤 효과 (그림자 강조)
  window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const progressTracker = document.querySelector('.progress-tracker');
    
    if (progressTracker) {
      if (scrollTop > 50) {
        progressTracker.classList.add('scrolled');
      } else {
        progressTracker.classList.remove('scrolled');
      }
    }
  });
});

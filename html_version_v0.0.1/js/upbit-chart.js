// Upbit 차트 및 표시 관련 모듈
function renderPredictionCardInfo(predictionCard) {
  const summaryEl = document.getElementById('predictionCardSummary');
  if (!summaryEl) return;

  if (!predictionCard) {
    summaryEl.textContent = '예측 카드가 아직 없습니다.';
    return;
  }

  const priceText = predictionCard.price !== undefined && predictionCard.price !== null
    ? predictionCard.price.toLocaleString('ko-KR')
    : '-';
  const nbText = Number(predictionCard.nb_value ?? 0).toFixed(10);
  const timeframeText = predictionCard.timeframe || window.selectedTimeframeValue || '-';
  const createdAtText = predictionCard.created_at || '-';
  const cardId = predictionCard.card_id || '-';
  const nextCandle = window.computeNextCandleTime(predictionCard);

  summaryEl.innerHTML = `
    <div style="display:grid;grid-template-columns:110px 1fr;gap:6px 10px;">
      <div style="color:#8b949e;">카드 ID</div><div>${cardId}</div>
      <div style="color:#8b949e;">예측 가격</div><div style="color:#f5a623;font-weight:700;">${priceText}</div>
      <div style="color:#8b949e;">N/B 값</div><div>${nbText}</div>
      <div style="color:#8b949e;">타임프레임</div><div>${timeframeText}</div>
      <div style="color:#8b949e;">다음 캔들 시각</div><div>${nextCandle}</div>
      <div style="color:#8b949e;">생성 시각</div><div>${createdAtText}</div>
    </div>`;
}

// 간단한 라인 차트 렌더링 (Canvas)
function renderUpbitChart(prices, predictionPrice = null) {
  const canvas = document.getElementById('upbitChartCanvas');
  const placeholder = document.getElementById('upbitChartPlaceholder');
  
  if (!canvas) {
    console.warn('⚠️ canvas 요소를 찾을 수 없습니다. ID: upbitChartCanvas');
    return;
  }
  
  // prices를 숫자 배열로 변환
  let validPrices = [];
  if (Array.isArray(prices)) {
    validPrices = prices.map(p => Number(p)).filter(p => !isNaN(p));
  }
  
  const hasPrices = validPrices.length >= 2;
  const hasPrediction = typeof predictionPrice === 'number' && !Number.isNaN(predictionPrice);

  if (!hasPrices && !hasPrediction) {
    console.log('⚠️ 차트 그리기 데이터 부족:', { hasPrices, hasPrediction, pricesLength: validPrices.length, predictionPrice });
    if (placeholder) placeholder.style.display = 'flex';
    return;
  }

  console.log('✅ 차트 그리기 시작:', { hasPrices, pricesLength: validPrices.length, hasPrediction, predictionPrice });
  
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const padding = 24;
  const w = rect.width - padding * 2;
  const h = rect.height - padding * 2;
  
  // 상단에 분봉 정보 표시
  const timeframeMap = { 
    '1': '1분봉', '3': '3분봉', '5': '5분봉', '10': '10분봉', 
    '15': '15분봉', '30': '30분봉', '60': '60분봉', '1d': '일봉' 
  };
  const timeframeText = timeframeMap[window.selectedTimeframeValue] || `${window.selectedTimeframeValue}분봉`;
  ctx.fillStyle = '#8b949e';
  ctx.font = 'bold 13px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(timeframeText, padding, padding - 8);
  
  const merged = hasPrices ? [...validPrices] : [];
  if (hasPrediction) merged.push(predictionPrice);
  const minP = Math.min(...merged);
  const maxP = Math.max(...merged);
  const range = Math.max(maxP - minP, 1e-6);

  if (hasPrices) {
    ctx.strokeStyle = '#58a6ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    validPrices.forEach((p, i) => {
      const x = padding + (w * i) / (validPrices.length - 1);
      const y = padding + h - ((p - minP) / range) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // 그라데이션 영역
    const grad = ctx.createLinearGradient(0, padding, 0, padding + h);
    grad.addColorStop(0, 'rgba(88,166,255,0.35)');
    grad.addColorStop(1, 'rgba(88,166,255,0)');
    ctx.fillStyle = grad;
    ctx.lineTo(padding + w, padding + h);
    ctx.lineTo(padding, padding + h);
    ctx.closePath();
    ctx.fill();
  }

  if (hasPrediction) {
    const clampedPrice = Math.max(minP, Math.min(maxP, predictionPrice));
    const yPred = padding + h - ((clampedPrice - minP) / range) * h;
    
    const label = `예측 ${predictionPrice.toLocaleString('ko-KR')}`;
    const textWidth = ctx.measureText(label).width + 16;
    const boxWidth = Math.max(140, textWidth);
    const countForSpacing = validPrices.length > 0 ? validPrices.length : 1;
    const spacing = w / countForSpacing;
    const markerX = padding + spacing * countForSpacing;
    const markerY = yPred;
    const textX = Math.max(padding + 4, markerX - boxWidth - 8);
    const textY = markerY - 12;

    // 라벨 박스
    ctx.fillStyle = 'rgba(245,166,35,0.9)';
    ctx.fillRect(textX, textY - 12, boxWidth, 24);
    ctx.fillStyle = '#0d1117';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.fillText(label, textX + 8, textY + 4);

    // 마커 원 (다음 캔들 위치)
    ctx.beginPath();
    ctx.fillStyle = '#f5a623';
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 1.4;
    ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (placeholder) placeholder.style.display = 'none';
}

// Upbit 차트 표시 업데이트
function updateUpbitChartDisplay() {
  // 안전한 변수 참조
  const collectedData = window.collectedData;
  
  console.log('📊 updateUpbitChartDisplay 호출:', {
    hasCollectedData: !!collectedData,
    hasChart: !!collectedData?.chart,
    pricesLength: collectedData?.chart?.prices?.length || 0
  });
  
  if (!collectedData || !collectedData.chart) {
    console.warn('⚠️ 차트 데이터 없음:', { hasCollectedData: !!collectedData, hasChart: !!collectedData?.chart });
    return;
  }
  
  const chart = collectedData.chart;
  const price = chart.current_price || 0;
  const prices = Array.isArray(chart.prices) ? chart.prices : [];
  const minP = prices.length ? Math.min(...prices) : 0;
  const maxP = prices.length ? Math.max(...prices) : 0;
  const closeP = prices.length ? prices[prices.length - 1] : price;
  const low = prices.length ? minP : (chart.low_price || 0);

  const predictionCard = window.getLatestPredictionCard ? window.getLatestPredictionCard() : null;
  const predictionPrice = (predictionCard && typeof predictionCard.price === 'number') ? predictionCard.price : null;

  const currentPriceEl = document.getElementById('currentPriceDisplay');
  const priceBandEl = document.getElementById('priceBandDisplay');
  const closePriceEl = document.getElementById('closePriceDisplay');
  const lowPriceEl = document.getElementById('lowPriceDisplay');
  
  if (currentPriceEl) currentPriceEl.textContent = price?.toLocaleString('ko-KR') || '-';
  if (priceBandEl) {
    const band = prices.length ? `${minP.toLocaleString('ko-KR')} ~ ${maxP.toLocaleString('ko-KR')}` : '-';
    priceBandEl.textContent = band;
  }
  if (closePriceEl) closePriceEl.textContent = closeP?.toLocaleString('ko-KR') || '-';
  if (lowPriceEl) lowPriceEl.textContent = low?.toLocaleString('ko-KR') || '-';

  renderPredictionCardInfo(predictionCard);
  console.log('🎨 차트 렌더링:', { pricesLength: prices.length, predictionPrice });
  renderUpbitChart(chart.prices || [], predictionPrice);
}

// Export
window.renderPredictionCardInfo = renderPredictionCardInfo;
window.renderUpbitChart = renderUpbitChart;
window.updateUpbitChartDisplay = updateUpbitChartDisplay;

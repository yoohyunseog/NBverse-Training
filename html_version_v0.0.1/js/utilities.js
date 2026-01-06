// 유틸리티 함수들

// 유틸리티 함수
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 섹션으로 스크롤 이동
function scrollToSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) {
    const headerHeight = document.querySelector('.header-container').offsetHeight;
    const progressHeight = document.querySelector('.progress-tracker').offsetHeight;
    const offset = headerHeight + progressHeight + 20; // 20px 여유 공간
    
    const elementPosition = section.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;
    
    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
    
    // 시각적 피드백
    section.style.transition = 'all 0.3s';
    section.style.boxShadow = '0 0 20px rgba(88, 166, 255, 0.5)';
    setTimeout(() => {
      section.style.boxShadow = '';
    }, 1000);
  }
}

// 원시 데이터 복사
function copyRawData() {
  const rawData = document.getElementById('rawData').textContent;
  navigator.clipboard.writeText(rawData).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

// N/B 데이터 복사
function copyNBData() {
  const nbData = document.getElementById('nbRawData').textContent;
  navigator.clipboard.writeText(nbData).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

// BIT MAX 응답 복사
function copyBitMaxData() {
  const raw = document.getElementById('bitMaxRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

// 카드 생성 응답 복사
function copyCardData() {
  const raw = document.getElementById('cardRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

function copyVolumeData() {
  const raw = document.getElementById('volumeRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

function copyTradeAmountData() {
  const raw = document.getElementById('tradeAmountRawData').textContent;
  navigator.clipboard.writeText(raw).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '✅ 복사됨';
    setTimeout(() => {
      btn.textContent = originalText;
    }, 2000);
  });
}

// 최신 거래량 가져오기
function getLatestVolume() {
  const chart = collectedData?.chart;
  if (!chart) return null;
  const price = Number(chart.current_price ?? (Array.isArray(chart.prices) ? chart.prices[chart.prices.length - 1] : null));

  const volumeArray = [chart.volumes, chart.volume, chart.vols]
    .find(arr => Array.isArray(arr));
  if (volumeArray && volumeArray.length > 0) {
    const raw = Number(volumeArray[volumeArray.length - 1]);
    if (Number.isFinite(raw)) return raw;
  }

  const tradeArray = [chart.trade_values, chart.trade_amounts, chart.values, chart.tradeAmount, chart.tradeValue]
    .find(arr => Array.isArray(arr));
  if (tradeArray && tradeArray.length > 0 && Number.isFinite(price)) {
    const lastTrade = Number(tradeArray[tradeArray.length - 1]);
    if (Number.isFinite(lastTrade)) {
      return lastTrade / price;
    }
  }

  return null;
}

// 최신 거래대금 가져오기
function getLatestTradeAmount(volume = null, price = null) {
  const chart = collectedData?.chart;
  if (!chart) return null;
  const numericPrice = Number(price ?? chart.current_price ?? (Array.isArray(chart.prices) ? chart.prices[chart.prices.length - 1] : null));

  const valueArray = [chart.trade_values, chart.trade_amounts, chart.values, chart.tradeAmount, chart.tradeValue]
    .find(arr => Array.isArray(arr));
  if (valueArray && valueArray.length > 0) {
    const raw = Number(valueArray[valueArray.length - 1]);
    if (Number.isFinite(raw)) return raw;
  }

  if (volume === null || volume === undefined || !Number.isFinite(numericPrice)) return null;
  return volume * numericPrice;
}

// UPBIT 최신 메트릭 가져오기
async function fetchLatestUpbitMetrics(timeframeValue) {
  const apiTimeframe = convertTimeframeForAPI(timeframeValue ?? selectedTimeframeValue);
  const start = Date.now();
  const response = await fetch(`${API_BASE}/api/chart?timeframe=${apiTimeframe}&count=1`);
  const data = await response.json();
  const elapsed = Date.now() - start;

  const price = Number(
    data.current_price ??
    (Array.isArray(data.prices) ? data.prices[data.prices.length - 1] : null)
  );

  const volumeArr = [data.volumes, data.volume, data.vols].find(arr => Array.isArray(arr));
  const volume = volumeArr && volumeArr.length > 0 ? Number(volumeArr[volumeArr.length - 1]) : null;

  const tradeArr = [data.trade_values, data.trade_amounts, data.values, data.tradeAmount, data.tradeValue].find(arr => Array.isArray(arr));
  const tradeAmount = tradeArr && tradeArr.length > 0 ? Number(tradeArr[tradeArr.length - 1]) : null;

  return {
    elapsed,
    price: Number.isFinite(price) ? price : null,
    volume: Number.isFinite(volume) ? volume : null,
    tradeAmount: Number.isFinite(tradeAmount) ? tradeAmount : (Number.isFinite(price) && Number.isFinite(volume) ? price * volume : null)
  };
}

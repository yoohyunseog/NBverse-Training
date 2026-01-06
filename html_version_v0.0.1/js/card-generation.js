// 카드 생성 및 관리

// 최신 거래량/대금 조회 헬퍼
function getLatestVolume() {
  const chart = collectedData?.chart;
  if (!chart) return null;
  const price = Number(chart.current_price ?? (Array.isArray(chart.prices) ? chart.prices[chart.prices.length - 1] : null));

  const volumeArray = [chart.volumes, chart.volume, chart.vols].find(arr => Array.isArray(arr));
  if (volumeArray && volumeArray.length > 0) {
    const raw = Number(volumeArray[volumeArray.length - 1]);
    if (Number.isFinite(raw)) return raw;
  }

  const tradeArray = [chart.trade_values, chart.trade_amounts, chart.values, chart.tradeAmount, chart.tradeValue].find(arr => Array.isArray(arr));
  if (tradeArray && tradeArray.length > 0 && Number.isFinite(price)) {
    const lastTrade = Number(tradeArray[tradeArray.length - 1]);
    if (Number.isFinite(lastTrade)) return lastTrade / price;
  }

  return null;
}

function getLatestTradeAmount(volume = null, price = null) {
  const chart = collectedData?.chart;
  if (!chart) return null;
  const numericPrice = Number(price ?? chart.current_price ?? (Array.isArray(chart.prices) ? chart.prices[chart.prices.length - 1] : null));

  const valueArray = [chart.trade_values, chart.trade_amounts, chart.values, chart.tradeAmount, chart.tradeValue].find(arr => Array.isArray(arr));
  if (valueArray && valueArray.length > 0) {
    const raw = Number(valueArray[valueArray.length - 1]);
    if (Number.isFinite(raw)) return raw;
  }

  if (volume === null || volume === undefined || !Number.isFinite(numericPrice)) return null;
  return volume * numericPrice;
}

async function fetchLatestUpbitMetrics(timeframeValue) {
  const apiTimeframe = convertTimeframeForAPI(timeframeValue ?? selectedTimeframeValue);
  const start = Date.now();
  const response = await fetch(`${window.API_BASE}/api/chart?timeframe=${apiTimeframe}&count=1`);
  const data = await response.json();
  const elapsed = Date.now() - start;

  const price = Number(data.current_price ?? (Array.isArray(data.prices) ? data.prices[data.prices.length - 1] : null));
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

function scheduleAutoCard() {
  if (autoCardScheduled) return;
  const button = document.getElementById('cardGenerateBtn');
  if (!button || button.disabled) {
    setTimeout(() => scheduleAutoCard(), 500);
    return;
  }
  autoCardScheduled = true;
  addCardLog('⏭️ 4단계를 자동 실행합니다. 카드 생성 중...', 'info');
  setTimeout(() => {
    generateCard().catch(err => addCardLog(`자동 카드 생성 실패: ${err.message}`, 'error'));
  }, 400);
}

// 카드 생성
async function generateCard() {
  if (isGeneratingCard) {
    addCardLog('이미 카드 생성 중입니다.', 'warning');
    return;
  }
  if (!lastNBResult || !collectedData) {
    addCardLog('⚠️ N/B 계산 이후에 카드 생성이 가능합니다.', 'error');
    return;
  }

  const price = collectedData.chart?.current_price;
  const nbValue = lastNBResult.nb_value || lastNBResult.normalized_nb;
  const bitMax = lastNBResult.bit_max ?? lastNBResult.nb_max;
  const bitMin = lastNBResult.bit_min ?? lastNBResult.nb_min;
  const derivedVolume = getLatestVolume();
  const derivedTradeAmount = getLatestTradeAmount(derivedVolume, price);

  if (!Number.isFinite(price) || !Number.isFinite(nbValue) || !Number.isFinite(bitMax) || !Number.isFinite(bitMin)) {
    addCardLog('⚠️ 카드 생성에 필요한 값이 부족합니다. 데이터를 다시 수집/계산해 주세요.', 'error');
    return;
  }

  let statusEl;
  try {
    resetCardFlowUI();
    isGeneratingCard = true;
    document.getElementById('cardGenerateBtn').disabled = true;
    statusEl = document.getElementById('cardGenerateStatus');
    statusEl.style.display = 'block';
    statusEl.className = 'status warning';
    statusEl.textContent = '💫 카드 생성 중...';
    addCardLog('💫 카드 생성 요청을 시작합니다.', 'info');
    updateFlowStep('card-flow-start', 'active');

    const nbSummary = `N/B ${nbValue.toFixed(10)} | vol ${derivedVolume ?? '-'} | amt ${derivedTradeAmount ?? '-'}`;
    updateFlowStep('card-flow-start', 'completed');
    updateFlowStep('card-flow-nb', 'active');
    const nbTimeEl = document.getElementById('card-flow-nb-time');
    if (nbTimeEl) nbTimeEl.textContent = nbSummary;
    addCardLog(`📊 카드용 N/B 확정: ${nbSummary}`, 'info');
    updateFlowStep('card-flow-nb', 'completed');

    updateFlowStep('card-flow-upbit', 'active');
    addCardLog('🔄 UPBIT에서 최신 거래량/대금 조회...', 'info');
    const upbitMetrics = await fetchLatestUpbitMetrics(selectedTimeframeValue);
    const upbitSummary = `UPBIT vol ${upbitMetrics.volume ?? '-'} | amt ${upbitMetrics.tradeAmount ?? '-'} | t ${upbitMetrics.elapsed}ms`;
    const upbitTimeEl = document.getElementById('card-flow-upbit-time');
    if (upbitTimeEl) upbitTimeEl.textContent = upbitSummary;
    addCardLog(`✅ UPBIT 최신값 적용: ${upbitSummary}`, 'success');
    
    const upbitVolumes = collectedData.chart.volumes || collectedData.chart.volume || [];
    const upbitTradeAmounts = collectedData.chart.trade_values || collectedData.chart.trade_amounts || collectedData.chart.values || [];
    const upbitRawVolumes = [...upbitVolumes, ...(upbitMetrics.volume ? [upbitMetrics.volume] : [])];
    const upbitRawTradeAmounts = [...upbitTradeAmounts, ...(upbitMetrics.tradeAmount ? [upbitMetrics.tradeAmount] : [])];
    
    const filteredVolumes = upbitRawVolumes.filter((_, idx) => idx % 4 === 0);
    const filteredTradeAmounts = upbitRawTradeAmounts.filter((_, idx) => idx % 4 === 0);
    
    document.getElementById('volumeRawData').textContent = JSON.stringify(upbitRawVolumes, null, 2);
    document.getElementById('tradeAmountRawData').textContent = JSON.stringify(upbitRawTradeAmounts, null, 2);
    addCardLog(`📊 UPBIT 실시간 거래량 배열 업데이트 (원본: ${upbitRawVolumes.length}개 → 필터링: ${filteredVolumes.length}개 항목)`, 'info');
    addCardLog(`💰 UPBIT 실시간 거래대금 배열 업데이트 (원본: ${upbitRawTradeAmounts.length}개 → 필터링: ${filteredTradeAmounts.length}개 항목)`, 'info');
    
    updateFlowStep('card-flow-upbit', 'completed');

    const finalPrice = price;
    const finalVolume = upbitMetrics.volume ?? derivedVolume;
    const finalTradeAmount = upbitMetrics.tradeAmount ?? derivedTradeAmount ?? (Number.isFinite(finalPrice) && Number.isFinite(finalVolume) ? finalPrice * finalVolume : null);

    updateFlowStep('card-flow-nb-volume', 'active');
    addCardLog('📊 거래량 배열 기반 N/B 계산 중...', 'info');
    const volumeNBStartTime = Date.now();
    const volumeNBData = await calculateNBForVolume(filteredVolumes);
    const volumeNBTime = Date.now() - volumeNBStartTime;
    const volumeBitMax = volumeNBData?.bit_max ?? volumeNBData?.nb_max ?? bitMax;
    const volumeBitMin = volumeNBData?.bit_min ?? volumeNBData?.nb_min ?? bitMin;
    const volumeNBTimeEl = document.getElementById('card-flow-nb-volume-time');
    if (volumeNBTimeEl) volumeNBTimeEl.textContent = `bit_max ${Number(volumeBitMax).toFixed(4)} | ${volumeNBTime}ms`;
    addCardLog(`✅ N/B 거래량 계산 완료 (bit_max: ${Number(volumeBitMax).toFixed(6)}) (${volumeNBTime}ms)`, 'success');
    updateFlowStep('card-flow-nb-volume', 'completed');

    updateFlowStep('card-flow-nb-trade', 'active');
    addCardLog('💰 거래대금 배열 기반 N/B 계산 중...', 'info');
    const tradeNBStartTime = Date.now();
    const tradeAmountNBData = await calculateNBForTradeAmount(filteredTradeAmounts);
    const tradeNBTime = Date.now() - tradeNBStartTime;
    const tradeAmountBitMax = tradeAmountNBData?.bit_max ?? tradeAmountNBData?.nb_max ?? bitMax;
    const tradeAmountBitMin = tradeAmountNBData?.bit_min ?? tradeAmountNBData?.nb_min ?? bitMin;
    const tradeNBTimeEl = document.getElementById('card-flow-nb-trade-time');
    if (tradeNBTimeEl) tradeNBTimeEl.textContent = `bit_max ${Number(tradeAmountBitMax).toFixed(4)} | ${tradeNBTime}ms`;
    addCardLog(`✅ N/B 거래대금 계산 완료 (bit_max: ${Number(tradeAmountBitMax).toFixed(6)}) (${tradeNBTime}ms)`, 'success');
    updateFlowStep('card-flow-nb-trade', 'completed');

    document.getElementById('cardVolumePreview').textContent = finalVolume !== null && finalVolume !== undefined ? Number(finalVolume).toLocaleString('ko-KR') : '-';
    document.getElementById('cardTradeAmountPreview').textContent = finalTradeAmount !== null && finalTradeAmount !== undefined ? Number(finalTradeAmount).toLocaleString('ko-KR') : '-';
    document.getElementById('cardVolumeBitMaxPreview').textContent = volumeBitMax !== undefined ? Number(volumeBitMax).toFixed(10) : '-';
    document.getElementById('cardVolumeBitMinPreview').textContent = volumeBitMin !== undefined ? Number(volumeBitMin).toFixed(10) : '-';
    document.getElementById('cardTradeAmountBitMaxPreview').textContent = tradeAmountBitMax !== undefined ? Number(tradeAmountBitMax).toFixed(10) : '-';
    document.getElementById('cardTradeAmountBitMinPreview').textContent = tradeAmountBitMin !== undefined ? Number(tradeAmountBitMin).toFixed(10) : '-';

    updateFlowStep('card-flow-payload', 'active');
    const payload = {
      card_type: 'card2',
      timeframe: convertTimeframeForAPI(selectedTimeframeValue),
      card_data: {
        price: finalPrice,
        nb_value: nbValue,
        bit_max: bitMax,
        bit_min: bitMin,
        volume: finalVolume ?? null,
        volume_bit_max: volumeBitMax ?? null,
        volume_bit_min: volumeBitMin ?? null,
        trade_amount: finalTradeAmount ?? null,
        trade_amount_bit_max: tradeAmountBitMax ?? null,
        trade_amount_bit_min: tradeAmountBitMin ?? null,
        timestamp: new Date().toISOString(),
        ema_fast: null,
        ema_slow: null,
        production_date: new Date().toISOString()
      }
    };

    updateFlowStep('card-flow-payload', 'completed');
    updateFlowStep('card-flow-api', 'active');
    const startTime = Date.now();
    const response = await fetch(`${window.API_BASE}/api/cards/chart-analysis/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    const elapsed = Date.now() - startTime;
    lastCardResponse = result;

    updateFlowStep('card-flow-api', 'completed');
    updateFlowStep('card-flow-parse', 'active');

    if (!response.ok || !result.success) {
      throw new Error(result.error || `HTTP ${response.status}`);
    }

    updateFlowStep('card-flow-parse', 'completed');
    updateFlowStep('card-flow-complete', 'active');
    addCardLog(`✅ 카드 생성 완료 (${elapsed}ms)`, 'success');
    addCardLog(`카드 ID: ${result.card_id}`, 'success');
    
    const cardRawDataEl = document.getElementById('cardRawData');
    if (cardRawDataEl) {
      cardRawDataEl.textContent = JSON.stringify(result, null, 2);
    }
    
    showCardPreview(result, payload, elapsed, volumeNBData, tradeAmountNBData);
    statusEl.className = 'status success';
    statusEl.textContent = `✅ 카드 생성 성공 (card_id: ${result.card_id})`;

    updateProgressStep('step4', 'completed');
    updateProgressStep('step5', 'active');

    updateFlowStep('card-flow-complete', 'completed');
    
    showBasicAnalysisSection(result, payload);
  } catch (error) {
    addCardLog(`❌ 생성 실패: ${error.message}`, 'error');
    if (statusEl) {
      statusEl.className = 'status error';
      statusEl.textContent = `❌ 카드 생성 실패: ${error.message}`;
    }
    updateFlowStep('card-flow-api', 'error');
    updateFlowStep('card-flow-parse', 'error');
  } finally {
    isGeneratingCard = false;
    document.getElementById('cardGenerateBtn').disabled = false;
  }
}

function showCardPreview(result, payload, elapsedMs, volumeNBData = null, tradeAmountNBData = null) {
  const panel = document.getElementById('cardResultPanel');
  if (!panel) return;
  panel.style.display = 'block';
  
  document.getElementById('cardResultId').textContent = result.card_id || '-';
  document.getElementById('cardResultKey').textContent = result.card_key || '-';
  document.getElementById('cardResultPrice').textContent = payload.card_data?.price?.toLocaleString('ko-KR') || '-';
  const latestVolume = getLatestVolume() ?? payload.card_data?.volume ?? null;
  const latestTradeAmount = getLatestTradeAmount(latestVolume, payload.card_data?.price) ?? payload.card_data?.trade_amount ?? null;
  document.getElementById('cardResultVolume').textContent = latestVolume !== null && latestVolume !== undefined ? latestVolume.toLocaleString('ko-KR') : '-';
  document.getElementById('cardResultTradeAmount').textContent = latestTradeAmount !== null && latestTradeAmount !== undefined ? latestTradeAmount.toLocaleString('ko-KR') : '-';
  document.getElementById('cardResultNbValue').textContent = Number(payload.card_data?.nb_value ?? 0).toFixed(10);
  document.getElementById('cardResultBitMax').textContent = Number(payload.card_data?.bit_max ?? 0).toFixed(10);
  document.getElementById('cardResultBitMin').textContent = Number(payload.card_data?.bit_min ?? 0).toFixed(10);
  document.getElementById('cardResultTimeframe').textContent = payload.timeframe || '-';
  document.getElementById('cardResultCreated').textContent = new Date().toLocaleString('ko-KR');
  
  const flowSection = document.getElementById('cardResultSection');
  if (flowSection) {
    flowSection.style.display = 'block';
    document.getElementById('cardResultFlowId').textContent = result.card_id || '-';
    document.getElementById('cardResultFlowKey').textContent = result.card_key || '-';
    document.getElementById('cardResultFlowPrice').textContent = payload.card_data?.price?.toLocaleString('ko-KR') || '-';
    document.getElementById('cardResultFlowNbValue').textContent = Number(payload.card_data?.nb_value ?? 0).toFixed(10);
    document.getElementById('cardResultFlowBits').textContent = `${Number(payload.card_data?.bit_max ?? 0).toFixed(10)} / ${Number(payload.card_data?.bit_min ?? 0).toFixed(10)}`;
    document.getElementById('cardResultFlowVolume').textContent = latestVolume !== null && latestVolume !== undefined ? latestVolume.toLocaleString('ko-KR') : '-';
    const volumeNbValue = volumeNBData?.nb_value ?? volumeNBData?.value ?? '-';
    document.getElementById('cardResultFlowVolumeNb').textContent = volumeNbValue !== '-' ? Number(volumeNbValue).toFixed(10) : '-';
    const volumeBitMax = volumeNBData?.bit_max ?? volumeNBData?.nb_max ?? '-';
    const volumeBitMin = volumeNBData?.bit_min ?? volumeNBData?.nb_min ?? '-';
    document.getElementById('cardResultFlowVolumeBits').textContent = volumeBitMax !== '-' && volumeBitMin !== '-' ? `${Number(volumeBitMax).toFixed(10)} / ${Number(volumeBitMin).toFixed(10)}` : '-';
    document.getElementById('cardResultFlowTradeAmount').textContent = latestTradeAmount !== null && latestTradeAmount !== undefined ? latestTradeAmount.toLocaleString('ko-KR') : '-';
    const tradeAmountNbValue = tradeAmountNBData?.nb_value ?? tradeAmountNBData?.value ?? '-';
    document.getElementById('cardResultFlowTradeNb').textContent = tradeAmountNbValue !== '-' ? Number(tradeAmountNbValue).toFixed(10) : '-';
    const tradeAmountBitMax = tradeAmountNBData?.bit_max ?? tradeAmountNBData?.nb_max ?? '-';
    const tradeAmountBitMin = tradeAmountNBData?.bit_min ?? tradeAmountNBData?.nb_min ?? '-';
    document.getElementById('cardResultFlowTradeBits').textContent = tradeAmountBitMax !== '-' && tradeAmountBitMin !== '-' ? `${Number(tradeAmountBitMax).toFixed(10)} / ${Number(tradeAmountBitMin).toFixed(10)}` : '-';
    document.getElementById('cardResultFlowTimeframe').textContent = payload.timeframe || '-';
    document.getElementById('cardResultFlowCreated').textContent = new Date().toLocaleString('ko-KR');
  }
  
  addCardLog(`🃏 카드 프리뷰 업데이트 (소요 ${elapsedMs}ms)`, 'info');
}

// 강화학습 AI 분석 큐 시스템 (순차 실행 보장)
const RLAIAnalysisQueue = {
    queue: [],
    processing: false,
    
    /**
     * 큐에 분석 요청 추가
     */
    enqueue(cardId) {
        // 이미 큐에 있으면 추가하지 않음
        if (this.queue.includes(cardId)) {
            return;
        }
        this.queue.push(cardId);
        console.log(`📋 강화학습 AI 분석 큐에 추가: ${cardId} (대기 중: ${this.queue.length}개)`);
        this.process();
    },
    
    /**
     * 큐에서 순차적으로 처리
     */
    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const cardId = this.queue.shift();
            console.log(`🔄 강화학습 AI 분석 시작: ${cardId} (남은 큐: ${this.queue.length}개)`);
            
            try {
                await CardRenderer._executeAIAnalysis(cardId);
                console.log(`✅ 강화학습 AI 분석 완료: ${cardId}`);
            } catch (error) {
                console.error(`❌ 강화학습 AI 분석 실패: ${cardId}`, error);
            }
            
            // 다음 분석 전 대기 (서버 부하 방지 및 순회 속도 조절)
            if (this.queue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 3000));  // 3초 대기
            }
        }
        
        this.processing = false;
        console.log(`✅ 강화학습 AI 분석 큐 처리 완료`);
    },
    
    /**
     * 큐 초기화
     */
    clear() {
        this.queue = [];
        this.processing = false;
    }
};

const sellMetricsCache = {};

async function fetchSellMetrics(cardId) {
    const cached = sellMetricsCache[cardId];
    const now = Date.now();
    if (cached && now - cached.fetchedAt < 30000) {
        return cached.data;
    }

    try {
        const metrics = await API.get(`/cards/${cardId}/sell/metrics`);
        if (metrics && metrics.success) {
            sellMetricsCache[cardId] = { data: metrics, fetchedAt: now };
            return metrics;
        }
    } catch (error) {
        console.error('SELL metrics 조회 실패:', error);
    }
    return null;
}

function renderSellMetrics(cardId, messageEl, metrics) {
    if (!messageEl || !metrics) return;

    const containerId = `sell-metrics-${cardId}`;
    const marketVolume = metrics.market_volume || 0;
    const marketValue = metrics.market_trade_value || 0;
    const tradeVolume = metrics.trade_volume || 0;
    const tradeValue = metrics.trade_value || 0;
    const intervalLabel = metrics.market_interval || metrics.interval || '';
    const candleCount = metrics.market_candle_count || metrics.candle_count || 0;

    const html = `
        <div class="rl-ai-info-item" id="${containerId}" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.08);">
            <span class="rl-ai-label">거래량/거래대금</span>
            <span class="rl-ai-value">${tradeVolume.toFixed(8)} BTC / ${Math.round(tradeValue).toLocaleString()} KRW</span>
            <div class="rl-ai-info-item" style="padding-left: 12px;">
                <span class="rl-ai-value" style="color: #aaa; font-size: 12px;">시장 ${candleCount}개 캔들 합계: ${marketVolume.toFixed(4)} BTC / ${Math.round(marketValue).toLocaleString()} KRW (${intervalLabel})</span>
            </div>
        </div>`;

    const existing = messageEl.querySelector(`#${containerId}`);
    if (existing) {
        existing.outerHTML = html;
    } else {
        messageEl.insertAdjacentHTML('beforeend', html);
    }
}

function requestSellMetricsAndRender(cardId) {
    const messageEl = document.getElementById(`rl-ai-message-${cardId}`);
    fetchSellMetrics(cardId)
        .then(metrics => {
            if (metrics && metrics.success) {
                renderSellMetrics(cardId, messageEl, metrics);
            }
        })
        .catch(error => {
            console.error('SELL metrics 렌더링 실패:', error);
        });
}

// 카드 렌더링 및 관리
const CardRenderer = {
    // 순차 분석 실행 중 플래그 (중첩 방지)
    isSequentialAnalysisRunning: false,
    // 대기 카드 제거 진행 중 플래그 (중복 방지)
    isRemovingWaitingCard: false,
    
    /**
     * 예측 카드 저장 (최대 50개까지 누적)
     */
    savePredictionCard(cardData) {
        try {
            const storageKey = 'prediction_cards_history';
            let predictionCards = [];
            
            // 기존 데이터 로드
            try {
                const stored = localStorage.getItem(storageKey);
                if (stored) {
                    predictionCards = JSON.parse(stored);
                    if (!Array.isArray(predictionCards)) {
                        predictionCards = [];
                    }
                }
            } catch (e) {
                console.warn('예측 카드 로드 실패:', e);
                predictionCards = [];
            }
            
            // 새 카드 추가
            const newCard = {
                ...cardData,
                saved_timestamp: new Date().toISOString()
            };
            
            predictionCards.unshift(newCard); // 최신 카드를 앞에
            
            // 50개 제한
            if (predictionCards.length > 50) {
                predictionCards = predictionCards.slice(0, 50);
            }
            
            // 저장
            localStorage.setItem(storageKey, JSON.stringify(predictionCards));
            console.log(`✅ 예측 카드 저장 완료 (총 ${predictionCards.length}개)`);
            
            return true;
        } catch (e) {
            console.error('예측 카드 저장 실패:', e);
            return false;
        }
    },
    
    /**
     * 예측 카드 로드
     */
    loadPredictionCards() {
        try {
            const storageKey = 'prediction_cards_history';
            const stored = localStorage.getItem(storageKey);
            
            if (!stored) {
                return [];
            }
            
            const predictionCards = JSON.parse(stored);
            if (Array.isArray(predictionCards)) {
                console.log(`✅ 예측 카드 로드 완료 (${predictionCards.length}개)`);
                return predictionCards;
            }
            
            return [];
        } catch (e) {
            console.error('예측 카드 로드 실패:', e);
            return [];
        }
    },
    
    /**
     * 예측 카드 초기화 (페이지 로드 시 호출)
     */
    initializePredictionCards() {
        try {
            const cards = this.loadPredictionCards();
            
            if (cards.length > 0) {
                console.log(`🔄 저장된 예측 카드 ${cards.length}개 복구 완료`);
                // 전역 변수에 저장 (필요시 UI에 표시)
                window.savedPredictionCards = cards;
            }
        } catch (e) {
            console.error('예측 카드 초기화 실패:', e);
        }
    },
    
    /**
     * 생산 카드 렌더링
     */
    renderProductionCard(card) {
        if (!card) {
            console.warn('❌ 카드 데이터가 없습니다:', card);
            return null;
        }
        
        // card_id가 없으면 생성 (임시 ID)
        if (!card.card_id) {
            console.warn('⚠️ card_id가 없는 카드 발견, 임시 ID 생성:', card);
            card.card_id = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
        
        // nb_value가 없으면 기본값 사용 (렌더링은 가능하도록)
        // card-agent에서 이미 검증했지만, 안전을 위해 다시 확인
        if (card.nb_value === undefined || card.nb_value === null) {
            // nb_max나 nb_min이 있으면 사용, 없으면 기본값
            if (card.nb_max !== undefined && card.nb_max !== null) {
                card.nb_value = card.nb_max;
            } else if (card.nb_min !== undefined && card.nb_min !== null) {
                card.nb_value = card.nb_min;
            } else {
                card.nb_value = 0.5;
                card.nb_max = card.nb_max || 5.5;
                card.nb_min = card.nb_min || 5.5;
            }
        }
        
        // nb_max, nb_min이 없으면 기본값 설정
        if (card.nb_max === undefined || card.nb_max === null) {
            card.nb_max = card.nb_value || 5.5;
        }
        if (card.nb_min === undefined || card.nb_min === null) {
            card.nb_min = card.nb_value || 5.5;
        }
        
        const decimalPlaces = Config.get('NB_DECIMAL_PLACES', 10);
        
        // 카드 타입 확인 (새 카드 vs 중첩 카드)
        const isOverlap = card.card_state === 'OVERLAP_ACTIVE' || card.card_type === 'overlap';
        const cardTypeLabel = isOverlap ? '🔄 중첩 카드' : '✨ 새 카드';
        const cardTypeClass = isOverlap ? 'overlap' : 'new';
        
        const cardEl = document.createElement('div');
        cardEl.className = `card production-card card-type-${cardTypeClass}`;
        cardEl.id = `card-${card.card_id}`;
        
        // 손익률 계산 (SOLD 히스토리가 있으면 SOLD 히스토리 사용, 없으면 실시간 계산)
        const historyList = card.history_list || [];
        let pnlPercent = 0.0;
        let entryPrice = 0.0;
        let exitPrice = 0.0;
        let currentPrice = 0.0;
        let pnlAmount = 0.0;
        let soldHistory = this.getLatestSoldHistory(card);
        
        // SOLD 히스토리가 있으면 손실률 기록 사용
        if (soldHistory) {
            entryPrice = soldHistory.entry_price || 0;
            exitPrice = soldHistory.exit_price || 0;
            pnlPercent = soldHistory.pnl_percent || 0;
            pnlAmount = soldHistory.pnl_amount || 0;
            
            // pnl이 없으면 계산
            if ((pnlPercent === 0 && pnlAmount === 0) && entryPrice > 0 && exitPrice > 0) {
                pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
            }
        } else {
            // BUY 히스토리에서 진입 가격 찾기
            for (const hist of historyList) {
                if (hist.type === 'BUY' && hist.entry_price) {
                    entryPrice = hist.entry_price;
                    break;
                }
            }
            
            // 현재 가격 가져오기 (차트 데이터에서)
            if (card.chart_data && card.chart_data.prices && card.chart_data.prices.length > 0) {
                currentPrice = card.chart_data.prices[card.chart_data.prices.length - 1];
            }
            
            // 손익률 계산
            if (entryPrice > 0 && currentPrice > 0) {
                pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            }
        }
        
        // 생산 시점 가격 (차트 데이터에서)
        const productionPrices = card.chart_data?.prices || [];
        const productionPrice = productionPrices.length > 0 ? productionPrices[productionPrices.length - 1] : 0;
        
        // 생산 가격 기준 손익률 계산 (진입 가격이 없는 경우)
        let productionPnlPercent = 0.0;
        if (productionPrice > 0 && currentPrice > 0) {
            productionPnlPercent = ((currentPrice - productionPrice) / productionPrice) * 100;
        }
        
        // 현재 손익률 계산 (진입 가격이 있으면 진입 기준, 없으면 생산 기준)
        let currentPnlPercent = 0.0;
        if (entryPrice > 0 && currentPrice > 0) {
            currentPnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else if (productionPrice > 0 && currentPrice > 0) {
            currentPnlPercent = productionPnlPercent;
        }
        
        // 점수 색상
        const score = card.score || 100.0;
        const scoreColor = CardChart.getScoreColor(score);
        
        // 등급 색상
        const rank = card.rank || 'C';
        const rankColor = this.getRankColor(rank);
        
        // 생산 날짜 및 시간 표시 (절대 시간 형식)
        const productionTime = card.production_time ? new Date(card.production_time) : null;
        let timeText = '🕐 생산 시간: 확인 불가';
        let productionDateText = '생산 날짜: 확인 불가';
        let isOldCard = false;
        if (productionTime) {
            // 생산 날짜 (YYYY-MM-DD)
            const productionDate = productionTime.toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            
            // 생산 시간 (HH:MM:SS)
            const productionTimeStr = productionTime.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            // 전체 생산 일시
            const fullDateTime = productionTime.toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            timeText = `🕐 생산 시간: ${fullDateTime}`;
            productionDateText = `📅 생산 날짜: ${productionDate}`;
            
            // 오래된 카드 체크 (7일 이상)
            const now = new Date();
            const diffMs = now - productionTime;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays >= 7) {
                isOldCard = true;
            }
        }
        
        // 상태 텍스트 및 색상
        const status = card.card_state || 'ACTIVE';
        const statusText = status === 'ACTIVE' || status === 'OVERLAP_ACTIVE' ? '활성' : 
                          status === 'REMOVED' ? '종료' : status;
        const statusColor = (status === 'ACTIVE' || status === 'OVERLAP_ACTIVE') ? '#0ecb81' : '#888888';
        
        // 생산 순서 번호 표시
        const productionNumber = card.production_number || 0;
        const productionNumberText = productionNumber > 0 ? `#${productionNumber}` : '';
        
        cardEl.innerHTML = `
            ${this.renderAISection(card, decimalPlaces)}
            ${this.renderZonePredictionSection(card) || ''}
            <div class="card-header">
                <div class="card-title">
                    ${isOverlap ? '🔄 중첩 생산 카드' : '🆕 신규 생산 카드'}
                    ${productionNumberText ? `<span style="color: #00d1ff; font-weight: bold; margin-left: 8px;">${productionNumberText}</span>` : ''}
                </div>
                <div class="card-id">${card.card_id.split('_').pop()}</div>
            </div>
            <div class="production-time ${isOldCard ? 'old-card' : ''}" style="color: ${isOldCard ? '#f6465d' : '#00d1ff'}; font-weight: bold; padding: 3px; margin-bottom: 5px;">
                ${timeText}
            </div>
            <div class="production-date" style="color: #00d1ff; font-weight: bold; padding: 3px; margin-bottom: 5px;">
                ${productionDateText}
            </div>
            <div class="card-info">
                <div class="info-item">
                    <div class="info-label">타임프레임</div>
                    <div class="info-value">${card.timeframe || '-'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">N/B 값</div>
                    <div class="info-value nb-value">${card.nb_value?.toFixed(decimalPlaces) || '0'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">N/B MAX</div>
                    <div class="info-value nb-value">${card.bit_max !== undefined ? card.bit_max.toFixed(decimalPlaces) : (card.nb_max !== undefined ? (card.nb_max * 10).toFixed(decimalPlaces) : '0')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">N/B MIN</div>
                    <div class="info-value nb-value">${card.bit_min !== undefined ? card.bit_min.toFixed(decimalPlaces) : (card.nb_min !== undefined ? (card.nb_min * 10).toFixed(decimalPlaces) : '0')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">점수</div>
                    <div class="info-value" style="color: ${scoreColor}">${score.toFixed(2)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">등급</div>
                    <div class="info-value" style="color: ${rankColor}; font-weight: bold; font-size: 14px;">${rank}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">상태</div>
                    <div class="info-value" style="color: ${statusColor}; font-weight: bold;">${statusText}</div>
                </div>
                ${entryPrice > 0 ? `
                <div class="info-item">
                    <div class="info-label">진입 가격</div>
                    <div class="info-value">${entryPrice.toLocaleString()} KRW</div>
                </div>
                ` : ''}
                ${exitPrice > 0 ? `
                <div class="info-item">
                    <div class="info-label">청산 가격</div>
                    <div class="info-value">${exitPrice.toLocaleString()} KRW</div>
                </div>
                ` : ''}
                <div class="info-item">
                    <div class="info-label">생산 시점 가격</div>
                    <div class="info-value">${productionPrice > 0 ? productionPrice.toLocaleString() : '-'} KRW</div>
                </div>
                ${card.chart_data?.production_candle ? `
                <div class="info-item" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div class="info-label" style="font-weight: bold; color: #00d1ff;">📊 생산 시점 분봉 데이터</div>
                </div>
                <div class="info-item">
                    <div class="info-label">시가 (Open)</div>
                    <div class="info-value">${card.chart_data.production_candle.open.toLocaleString()} KRW</div>
                </div>
                <div class="info-item">
                    <div class="info-label">고가 (High)</div>
                    <div class="info-value" style="color: #0ecb81;">${card.chart_data.production_candle.high.toLocaleString()} KRW</div>
                </div>
                <div class="info-item">
                    <div class="info-label">저가 (Low)</div>
                    <div class="info-value" style="color: #f6465d;">${card.chart_data.production_candle.low.toLocaleString()} KRW</div>
                </div>
                <div class="info-item">
                    <div class="info-label">종가 (Close)</div>
                    <div class="info-value">${card.chart_data.production_candle.close.toLocaleString()} KRW</div>
                </div>
                <div class="info-item">
                    <div class="info-label">거래량 (Volume)</div>
                    <div class="info-value">${card.chart_data.production_candle.volume.toLocaleString()}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">분봉 시간</div>
                    <div class="info-value" style="font-size: 11px; color: #888;">
                        ${new Date(card.chart_data.production_candle.time).toLocaleString('ko-KR')}
                    </div>
                </div>
                ` : ''}
                <div class="info-item">
                    <div class="info-label">현재 가격</div>
                    <div class="info-value" id="current-price-${card.card_id}">${currentPrice > 0 ? currentPrice.toLocaleString() : '계산 중...'} KRW</div>
                </div>
                <div class="info-item">
                    <div class="info-label">현재 손익률</div>
                    <div class="info-value ${currentPnlPercent >= 0 ? 'profit' : 'loss'}" id="current-pnl-percent-${card.card_id}">
                        ${currentPrice > 0 ? (currentPnlPercent >= 0 ? '+' : '') + currentPnlPercent.toFixed(2) + '%' : '계산 중...'}
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-label">생산 기준 손익률</div>
                    <div class="info-value ${productionPnlPercent >= 0 ? 'profit' : 'loss'}" id="production-pnl-percent-${card.card_id}">
                        ${productionPnlPercent >= 0 ? '+' : ''}${productionPnlPercent.toFixed(2)}%
                    </div>
                </div>
                ${entryPrice > 0 ? `
                <div class="info-item">
                    <div class="info-label">진입 기준 손익률</div>
                    <div class="info-value ${pnlPercent >= 0 ? 'profit' : 'loss'}" id="entry-pnl-percent-${card.card_id}">
                        ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%
                    </div>
                </div>
                ` : ''}
                ${pnlAmount !== 0 ? `
                <div class="info-item">
                    <div class="info-label">손익 금액</div>
                    <div class="info-value ${pnlAmount >= 0 ? 'profit' : 'loss'}">
                        ${pnlAmount >= 0 ? '+' : ''}${pnlAmount.toLocaleString()} KRW
                    </div>
                </div>
                ` : ''}
                ${soldHistory ? `
                <div class="info-item">
                    <div class="info-label">검증 상태</div>
                    <div class="info-value" style="color: #9d4edd; font-weight: bold;">✅ 검증 완료</div>
                </div>
                ` : ''}
            ${this.renderHistorySection(card) || ''}
            </div>
            ${productionPrices.length > 0 ? `
            <div class="chart-section">
                <div class="chart-label">📈 생산 시점 가격 차트 (생산일: ${productionTime ? productionTime.toLocaleDateString('ko-KR') : '확인 불가'})</div>
                <canvas id="production-chart-${card.card_id}" class="card-chart"></canvas>
            </div>
            ` : ''}
            <div class="chart-section">
                <div class="chart-label">📊 실시간 가격 차트</div>
                <canvas id="realtime-chart-${card.card_id}" class="card-chart realtime"></canvas>
            </div>
            <div class="chart-section">
                <div class="chart-label">📈 실시간 점수 차트</div>
                <canvas id="score-chart-${card.card_id}" class="card-chart score"></canvas>
            </div>
            ${soldHistory && soldHistory.exit_price ? `
            <div class="chart-section">
                <div class="chart-label">📉 매도 시점 가격 차트</div>
                <canvas id="sell-chart-${card.card_id}" class="card-chart sell"></canvas>
            </div>
            ` : ''}
            ${this.renderProfitLossSection(card, productionPrice, currentPrice, entryPrice, pnlPercent, pnlAmount)}
            ${this.renderVerificationSection(card, soldHistory)}
            <div class="card-actions">
                <button class="card-btn primary" onclick="handleCardAction('${card.card_id}', 'buy')">매수</button>
            </div>
        `;
        
        // 차트 그리기 (DOM에 추가된 후)
        setTimeout(() => {
            // 생산 시점 차트
            if (productionPrices.length > 0) {
                CardChart.drawProductionChart(`production-chart-${card.card_id}`, productionPrices);
            }
            
            // 실시간 가격 차트 (초기값: 생산 가격)
            const realtimePrices = [productionPrice].filter(p => p > 0);
            CardChart.drawRealtimePriceChart(`realtime-chart-${card.card_id}`, realtimePrices, productionPrice);
            
            // 점수 차트 (기존 히스토리 로드 또는 초기값)
            const scoreKey = `realtime_scores_${card.card_id}`;
            let scores = [];
            try {
                scores = JSON.parse(localStorage.getItem(scoreKey) || '[]');
            } catch (e) {
                scores = [];
            }
            // 기존 히스토리가 없으면 현재 점수로 시작
            if (scores.length === 0) {
                scores = [score];
            }
            CardChart.drawScoreChart(`score-chart-${card.card_id}`, scores);
            
            // 실시간 손실률 차트 (항상 표시)
            const pnlKey = `realtime_pnl_${card.card_id}`;
            let pnlHistory = JSON.parse(localStorage.getItem(pnlKey) || '[]');
            
            if (entryPrice > 0) {
                // 진입 가격이 있는 경우: 진입 가격 기준 손익률
                const initialPrice = productionPrice || currentPrice || entryPrice;
                const initialPnl = ((initialPrice - entryPrice) / entryPrice) * 100;
                if (pnlHistory.length === 0) {
                    pnlHistory = [initialPnl];
                }
            } else if (productionPrice > 0) {
                // 진입 가격이 없는 경우: 생산 가격 기준 손익률 (0%로 시작)
                if (pnlHistory.length === 0) {
                    pnlHistory = [0];
                }
            }
            
            // localStorage에 저장 및 차트 그리기
            if (pnlHistory.length > 0) {
                localStorage.setItem(pnlKey, JSON.stringify(pnlHistory));
                CardChart.drawPnlPercentChart(`pnl-chart-${card.card_id}`, pnlHistory);
            }
            
            // 최종 손실률 차트 (매도 완료된 경우)
            if (soldHistory && soldHistory.exit_price) {
                const sellPrices = productionPrices.length >= 10 
                    ? productionPrices.slice(-10) 
                    : productionPrices;
                sellPrices.push(soldHistory.exit_price);
                CardChart.drawPnlChart(`final-pnl-chart-${card.card_id}`, sellPrices);
            }
            
            // AI 분석은 순차적으로 실행 (updateProductionCards에서 처리)
            // 여기서는 즉시 실행하지 않음
            
            // 분석 완료 후 검증 상태에 따라 프로그레스바 업데이트
            this.updateProgressBarForVerification(card.card_id, card);
        }, 100);
        
        return cardEl;
    },
    
    /**
     * 분석 완료 후 검증 상태 및 매도 대기 상태에 따라 프로그레스바 업데이트
     */
    updateProgressBarForVerification(cardId, card) {
        try {
            const progressEl = document.getElementById(`rl-ai-progress-${cardId}`);
            const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
            const messageEl = document.getElementById(`rl-ai-message-${cardId}`);
            
            if (!progressEl || !statusEl) {
                return;
            }
            
            // 분석 완료 여부 확인 (RL AI 분석이 완료되었는지)
            // statusEl이 '검증 중'이 아니고, 프로그레스바가 100%인 경우 분석 완료로 간주
            const currentStatus = statusEl.textContent || '';
            const currentProgress = parseFloat(progressEl.style.width) || 0;
            
            // 예측 정보 확인
            const hasPrediction = card?.predicted_next_zone || card?.predicted_next_price;
            const isVerified = card?.prediction_verified === true;
            const waitingSell = card?.waiting_sell === true || card?.sell_waiting_status === 'ready';
            
            // 검증 완료 + 매도 대기 상태인 경우
            if (isVerified && waitingSell) {
                // 매도 대기 상태 표시
                if (statusEl.textContent !== '매도 대기 중' && statusEl.textContent !== '매도 판정 확인 중') {
                    statusEl.textContent = '매도 대기 중';
                    statusEl.className = 'rl-ai-status action-sell';
                    statusEl.style.color = '#ffa500';
                }
                
                // step-4(매도) 활성화
                const step4El = document.getElementById(`step-4-${cardId}`);
                if (step4El) {
                    step4El.classList.add('active');
                    const step4Label = step4El.querySelector('.step-label');
                    if (step4Label && step4Label.textContent !== '매도 대기' && step4Label.textContent !== '매도 판정 확인 중') {
                        step4Label.textContent = '매도 대기';
                    }
                }
                
                // 프로그레스바는 95%로 설정 (매도 판정 대기 중)
                if (currentProgress < 95) {
                    progressEl.style.width = '95%';
                    progressEl.style.backgroundColor = '#ffa500'; // 주황색
                    progressEl.style.background = 'linear-gradient(90deg, #ffa500 0%, #ff8c00 100%)';
                }
                
                // 매도 대기 메시지 업데이트 (메시지가 없거나 오래된 경우만)
                if (messageEl) {
                    const currentMessage = messageEl.innerHTML || '';
                    if (!currentMessage.includes('매도 대기 중') || !currentMessage.includes('timestamp')) {
                        // 현재 시간 기록
                        const now = new Date();
                        const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                        const dateStr = now.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
                        const timestamp = `${dateStr} ${timeStr}`;
                        
                        // 매도 대기 메시지 구성
                        let messageHtml = '<div class="rl-ai-message-content">';
                        messageHtml += `<div class="rl-ai-info-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,165,0,0.3);">`;
                        messageHtml += `<span class="rl-ai-label" style="font-weight: bold; color: #ffa500;">⏳ 매도 대기 중</span>`;
                        messageHtml += `<span class="rl-ai-value" style="color: #888; font-size: 11px; margin-left: 8px;">${timestamp}</span>`;
                        messageHtml += `</div>`;
                        
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">상태</span><span class="rl-ai-value" style="color: #ffa500;">실시간 손익률 모니터링 중</span></div>`;
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">다음 확인</span><span class="rl-ai-value" style="color: #888;">강화학습 AI가 매도 판정 확인 중...</span></div>`;
                        
                        messageHtml += '</div>';
                        messageEl.innerHTML = messageHtml;

                        requestSellMetricsAndRender(cardId);
                    }
                }
            }
            // 분석이 완료되었지만 검증이 안된 경우
            else if (hasPrediction && !isVerified && currentProgress >= 90) {
                // 프로그레스바를 90%로 유지하고 주황색으로 표시
                progressEl.style.width = '90%';
                progressEl.style.backgroundColor = '#ffa500'; // 주황색
                progressEl.style.background = 'linear-gradient(90deg, #ffa500 0%, #ff8c00 100%)';
                
                // 상태 메시지 업데이트
                if (statusEl.textContent !== '검증 대기 중') {
                    statusEl.textContent = '검증 대기 중';
                    statusEl.className = 'rl-ai-status action-hold';
                    statusEl.style.color = '#ffa500';
                }
                
                // 메시지 업데이트
                if (messageEl) {
                    const predictedZone = card?.predicted_next_zone || null;
                    const predictedPrice = card?.predicted_next_price || 0;
                    const nextCardNumber = (card?.production_number || 0) + 1;
                    
                    let messageHtml = '<div class="rl-ai-message-content">';
                    messageHtml += '<div class="rl-ai-info-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">';
                    messageHtml += '<span class="rl-ai-label" style="font-weight: bold; color: #ffa500;">⏳ 검증 대기 중</span>';
                    messageHtml += '</div>';
                    
                    if (predictedZone) {
                        const zoneName = predictedZone === 'BLUE' ? 'BLUE (상승 예상)' : 'ORANGE (하락 예상)';
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">예측 Zone</span><span class="rl-ai-value" style="color: ${predictedZone === 'BLUE' ? '#00d1ff' : '#ffa500'};">${zoneName}</span></div>`;
                    }
                    
                    if (predictedPrice > 0) {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">예측 가격</span><span class="rl-ai-value">${predictedPrice.toLocaleString()} KRW</span></div>`;
                    }
                    
                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">대기 중</span><span class="rl-ai-value" style="color: #ffa500;">다음 카드 (#${nextCardNumber}) 생산 대기</span></div>`;
                    messageHtml += '</div>';
                    
                    messageEl.innerHTML = messageHtml;
                }
            } else if (isVerified && currentProgress === 90) {
                // 검증이 완료된 경우 프로그레스바를 100%로 업데이트
                progressEl.style.width = '100%';
                progressEl.style.backgroundColor = '#0ecb81'; // 초록색
                progressEl.style.background = 'linear-gradient(90deg, #0ecb81 0%, #10b981 100%)';
            }
        } catch (error) {
            console.error(`프로그레스바 검증 상태 업데이트 실패: ${cardId}`, error);
        }
    },
    
    /**
     * 현재 생산해야 할 N/B MAX/MIN 값 표시
     */
    renderCurrentProductionNB(card, decimalPlaces) {
        // 메인 차트의 현재 N/B 값 가져오기
        const maxNbEl = document.getElementById('chart-max-nb');
        const minNbEl = document.getElementById('chart-min-nb');
        const nbValueEl = document.getElementById('chart-nb-value');
        
        let currentMaxNB = null;
        let currentMinNB = null;
        let currentNBValue = null;
        
        if (maxNbEl && maxNbEl.textContent && maxNbEl.textContent !== '0') {
            try {
                // bit_max 값을 nb_max로 변환 (0~1 범위)
                const bitMax = parseFloat(maxNbEl.textContent);
                currentMaxNB = bitMax / 10.0; // 0~1 범위로 정규화
            } catch (e) {
                console.warn('현재 MAX N/B 값 파싱 실패:', e);
            }
        }
        
        if (minNbEl && minNbEl.textContent && minNbEl.textContent !== '0') {
            try {
                // bit_min 값을 nb_min으로 변환 (0~1 범위)
                const bitMin = parseFloat(minNbEl.textContent);
                currentMinNB = bitMin / 10.0; // 0~1 범위로 정규화
            } catch (e) {
                console.warn('현재 MIN N/B 값 파싱 실패:', e);
            }
        }
        
        if (nbValueEl && nbValueEl.textContent && nbValueEl.textContent !== '0') {
            try {
                currentNBValue = parseFloat(nbValueEl.textContent);
            } catch (e) {
                console.warn('현재 N/B 값 파싱 실패:', e);
            }
        }
        
        // 현재 생산해야 할 값이 있으면 표시
        if (currentMaxNB !== null || currentMinNB !== null || currentNBValue !== null) {
            return `
                <div class="info-item" style="border-top: 2px solid #00d1ff; margin-top: 10px; padding-top: 10px;">
                    <div class="info-label" style="color: #00d1ff; font-weight: bold;">📊 현재 생산해야 할 값</div>
                </div>
                ${currentNBValue !== null ? `
                <div class="info-item">
                    <div class="info-label">현재 N/B 값</div>
                    <div class="info-value nb-value" style="color: #00d1ff; font-weight: bold;">${currentNBValue.toFixed(decimalPlaces)}</div>
                </div>
                ` : ''}
                ${currentMaxNB !== null ? `
                <div class="info-item">
                    <div class="info-label">현재 N/B MAX</div>
                    <div class="info-value nb-value" style="color: #0ecb81; font-weight: bold;">${currentMaxNB.toFixed(decimalPlaces)}</div>
                </div>
                ` : ''}
                ${currentMinNB !== null ? `
                <div class="info-item">
                    <div class="info-label">현재 N/B MIN</div>
                    <div class="info-value nb-value" style="color: #ff6b6b; font-weight: bold;">${currentMinNB.toFixed(decimalPlaces)}</div>
                </div>
                ` : ''}
            `;
        }
        
        return '';
    },
    
    /**
     * 카드 히스토리 섹션 렌더링 (최신 5개)
     */
    renderHistorySection(card) {
        const historyList = card.history_list || card.history || [];
        if (!historyList || historyList.length === 0) return '';
        
        const latest = historyList
            .slice(0, 5)
            .map(hist => {
                const type = hist.type || hist.get?.('type') || '';
                const ts = hist.timestamp || hist.time || '';
                const price = hist.entry_price ?? hist.price ?? hist.buy_price ?? hist.exit_price ?? hist.production_price ?? 0;
                const qty = hist.qty ?? hist.quantity ?? '';
                const pnl = hist.pnl_percent ?? hist.pnl ?? '';
                const tsText = ts ? ts.split('T')[0] + ' ' + (ts.split('T')[1] || '').slice(0, 8) : '';
                const priceText = price ? `${Number(price).toLocaleString()} KRW` : '';
                const qtyText = qty ? `${qty}` : '';
                const pnlText = pnl || pnl === 0 ? `${Number(pnl).toFixed(2)}%` : '';
                return `
                    <div class="history-row">
                        <span class="hist-type">${type}</span>
                        <span class="hist-ts">${tsText}</span>
                        <span class="hist-price">${priceText}</span>
                        <span class="hist-qty">${qtyText}</span>
                        <span class="hist-pnl">${pnlText}</span>
                    </div>
                `;
            }).join('');
        
        return `
            <div class="history-section">
                <div class="history-label">🕘 최근 히스토리 (최신 5개)</div>
                <div class="history-list">
                    ${latest}
                </div>
            </div>
        `;
    },
    
    /**
     * 기존 ML AI 섹션 렌더링 (제거됨 - Zone 분석 영역 제거)
     */
    renderMLAISection(card) {
        return '';  // Zone 분석 영역 제거
    },
    
    /**
     * 폐기 버튼 렌더링 (예측 성공 여부와 관계없이 제거 가능)
     */
    renderDiscardButton(card) {
        // 예측 성공 여부와 관계없이 항상 폐기 버튼 활성화
        // 일반 폐기 버튼
        return `<button class="card-btn danger" onclick="handleCardAction('${card.card_id}', 'discard')">폐기</button>`;
    },
    
    /**
     * AI 섹션 렌더링 (강화학습 AI)
     */
    renderAISection(card, decimalPlaces) {
        const nbMax = card.nb_max || 0;
        const nbMin = card.nb_min || 0;
        
        return `
            <div class="rl-ai-container" id="rl-ai-${card.card_id}">
                <div class="rl-ai-header">
                    <div class="rl-ai-header-row">
                        <div class="rl-ai-title">🧠 강화학습 AI 검증 (현재 카드)</div>
                        <button class="rl-update-btn" id="rl-update-btn-${card.card_id}" onclick="updateRLAnalysis('${card.card_id}')" title="AI 검증 업데이트">
                            🔄
                        </button>
                    </div>
                    <div class="rl-ai-status-row">
                        <div class="rl-ai-status" id="rl-ai-status-${card.card_id}">검증 중...</div>
                        <div class="rl-ai-reason" id="rl-ai-reason-${card.card_id}"></div>
                    </div>
                </div>
                <div class="rl-ai-progress">
                    <div class="rl-ai-progress-fill" id="rl-ai-progress-${card.card_id}" style="width: 0%"></div>
                </div>
                <div class="rl-ai-message" id="rl-ai-message-${card.card_id}">
                    <div class="rl-ai-message-content">
                            <div class="rl-ai-info-item"><span class="rl-ai-label">검증 상태</span><span class="rl-ai-value">준비 중</span></div>
                    </div>
                </div>
                <div class="card-status-steps" id="card-status-steps-${card.card_id}">
                    <div class="status-step" id="step-1-${card.card_id}">
                        <span class="step-number">1</span>
                        <span class="step-label">상태 생성</span>
                    </div>
                    <div class="status-step" id="step-2-${card.card_id}">
                        <span class="step-number">2</span>
                        <span class="step-label">AI 검증</span>
                    </div>
                    <div class="status-step" id="step-3-${card.card_id}">
                        <span class="step-number">3</span>
                        <span class="step-label">매수</span>
                    </div>
                    <div class="status-step" id="step-4-${card.card_id}">
                        <span class="step-number">4</span>
                        <span class="step-label">매도</span>
                    </div>
                    <div class="status-step" id="step-5-${card.card_id}">
                        <span class="step-number">5</span>
                        <span class="step-label">판정</span>
                    </div>
                    <div class="status-step" id="step-6-${card.card_id}">
                        <span class="step-number">6</span>
                        <span class="step-label">검증 완료</span>
                    </div>
                    <div class="status-step" id="step-7-${card.card_id}">
                        <span class="step-number">7</span>
                        <span class="step-label">다음 카드 예측</span>
                    </div>
                </div>
                <div class="prediction-cards-container" id="prediction-cards-${card.card_id}" style="display: none;">
                    <div>
                        <!-- 기존 카드 -->
                        <div class="existing-card-slot" id="existing-card-${card.card_id}">
                            <div style="font-size: 12px; color: #0ecb81; font-weight: 600; margin-bottom: 8px;">📊 기존 카드</div>
                            <div style="font-size: 11px; color: #9aa0a6;">로드 중...</div>
                        </div>
                        <!-- 예측 카드 1 -->
                        <div class="prediction-card-slot prediction-card-1" id="prediction-card-1-${card.card_id}">
                            <div style="font-size: 12px; color: #58a6ff; font-weight: 600; margin-bottom: 8px;">🔮 예측 카드 1</div>
                            <div style="font-size: 11px; color: #9aa0a6;">예측 중...</div>
                        </div>
                        <!-- 예측 카드 2 -->
                        <div class="prediction-card-slot prediction-card-2" id="prediction-card-2-${card.card_id}">
                            <div style="font-size: 12px; color: #ffa500; font-weight: 600; margin-bottom: 8px;">🔮 예측 카드 2</div>
                            <div style="font-size: 11px; color: #9aa0a6;">예측 중...</div>
                        </div>
                    </div>
                </div>
            </div>
            ${this.renderPnlChart(card)}
        `;
    },
    
    /**
     * 등급 색상 가져오기
     */
    getRankColor(rank) {
        const rankColors = {
            '+SS': '#ff00ff',  // 자홍색
            '++S': '#ff00ff',  // 자홍색
            '+S': '#ff00ff',   // 자홍색
            'S': '#ffd700',    // 금색
            'A': '#00d1ff',    // 청록색
            'B': '#0ecb81',   // 초록색
            'C': '#ffffff',   // 흰색
            'D': '#ffa500',   // 주황색
            'E': '#ff6b6b',   // 연한 빨간색
            'F': '#f6465d'    // 빨간색
        };
        return rankColors[rank] || '#ffffff';
    },
    
    /**
     * 손익 정보 섹션 렌더링
     */
    renderProfitLossSection(card, productionPrice, currentPrice, entryPrice, pnlPercent, pnlAmount) {
        const minBuyAmount = Config.get('MIN_BUY_AMOUNT', 5000);
        const feeRate = Config.get('FEE_RATE', 0.1) / 100.0;
        const buyFee = minBuyAmount * (feeRate / 2);
        const buyTotal = minBuyAmount + buyFee;
        
        return `
            <div class="profit-loss-section">
                <div class="profit-loss-item">
                    <span class="profit-loss-label">생산 시점:</span>
                    <span class="profit-loss-value">${productionPrice > 0 ? productionPrice.toLocaleString() : '-'} KRW</span>
                </div>
                <div class="profit-loss-item" id="current-profit-loss-${card.card_id}">
                    <span class="profit-loss-label">현재:</span>
                    <span class="profit-loss-value">계산 중...</span>
                </div>
                <div class="profit-loss-item">
                    <span class="profit-loss-label">매수 금액:</span>
                    <span class="profit-loss-value">${minBuyAmount.toLocaleString()} KRW (수수료 포함: ${buyTotal.toLocaleString()} KRW)</span>
                </div>
            </div>
        `;
    },
    
    /**
     * 검증 완료 섹션 렌더링 (매도 완료된 경우)
     */
    renderZonePredictionSection(card, rlAnalysisDetails = null) {
        try {
            // Zone 및 가격 예측 정보
            const predictedZone = card?.predicted_next_zone || null;
            const predictedPrice = card?.predicted_next_price || 0;
            const predictedPriceChangePercent = card?.predicted_next_price_change_percent || 0;
            const predictionConfidence = card?.prediction_confidence || 0;
            const predictionReason = card?.prediction_reason || '';
            const predictedRValue = card?.predicted_r_value || 0.5;
            const predictionTime = card?.prediction_time || null;
            
            // RL AI 예상 정보 (통합)
            const rlExpectedTime = rlAnalysisDetails?.expected_time_seconds || null;
            const rlExpectedPnl = rlAnalysisDetails?.expected_pnl_percent || null;
            const rlExpectedPrice = rlAnalysisDetails?.expected_price || null;
            const rlVerificationProb = rlAnalysisDetails?.verification_probability || null;
            
            // 예측 검증 정보
            const predictionVerified = card?.prediction_verified || false;
            const zoneCorrect = card?.zone_prediction_correct || false;
            const priceCorrect = card?.price_prediction_correct || false;
            const actualZone = card?.prediction_actual_zone || null;
            const actualPrice = card?.prediction_actual_price || 0;
            const priceErrorPercent = card?.prediction_price_error_percent || 0;
            const verificationTime = card?.prediction_verification_time || null;
            const verificationStatus = card?.verification_status || null; // 검증 상태 (waiting_next_card, waiting_zone, no_prediction 등)
            
            // 예측 정보가 없고 RL AI 예상 정보도 없으면 표시하지 않음
            if (!predictedZone && !predictionVerified && !rlExpectedTime && !rlExpectedPrice) {
                return '';
            }
            
            // predictionHtml 변수 초기화 (항상 문자열로 유지)
            let predictionHtml = '';
        
        // 다음 카드 Zone 및 가격 예측 표시
        if (predictedZone) {
            // 검증 상태 확인
            const verificationStatus = predictionVerified ? '✅ 검증 완료' : '⏳ 검증 대기 중';
            const verificationStatusColor = predictionVerified ? '#0ecb81' : '#ffa500';
            const zoneEmoji = predictedZone === 'BLUE' ? '🔵' : '🟠';
            const zoneName = predictedZone === 'BLUE' ? 'BLUE (상승 예상)' : 'ORANGE (하락 예상)';
            const zoneColor = predictedZone === 'BLUE' ? '#00d1ff' : '#ffa500';
            const confidencePercent = (predictionConfidence * 100).toFixed(1);
            const priceChangeColor = predictedPriceChangePercent >= 0 ? '#0ecb81' : '#f6465d';
            const priceChangeIcon = predictedPriceChangePercent >= 0 ? '📈' : '📉';
            
            // 다음 카드 번호 계산
            const currentProductionNumber = card?.production_number || 0;
            const nextCardNumber = currentProductionNumber + 1;
            const nextCardNumberText = nextCardNumber > 0 ? ` (다음 카드: #${nextCardNumber})` : '';
            
            predictionHtml += `
                <div class="zone-prediction-section" style="margin-top: 15px; padding: 10px; background: rgba(0, 209, 255, 0.1); border-radius: 8px; border-left: 3px solid ${zoneColor};">
                    <div class="zone-prediction-header" style="font-weight: bold; margin-bottom: 8px; color: ${zoneColor};">
                        🔮 다음 카드가 생산되었을 때의 예측 (Zone & 가격)
                    </div>
                    <div class="zone-prediction-content">
                        <div class="info-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            <div class="info-label" style="font-weight: bold; color: ${verificationStatusColor};">${verificationStatus}</div>
                            ${!predictionVerified ? `
                            <div class="info-value" style="font-size: 11px; color: #888; margin-top: 4px;">
                                ${verificationStatus === 'waiting_next_card' ? `다음 카드가 생산되면 자동으로 검증됩니다.${nextCardNumberText}` : 
                                  verificationStatus === 'waiting_zone' ? '다음 카드의 Zone 정보가 필요합니다.' : 
                                  verificationStatus === 'no_prediction' ? '예측 정보가 없어 검증할 수 없습니다.' : 
                                  verificationStatus === 'no_next_card' ? '다음 카드가 없어 검증할 수 없습니다.' : 
                                  `다음 카드가 생산되면 자동으로 검증됩니다.${nextCardNumberText}`}
                            </div>
                            ` : ''}
                        </div>
                        <div class="info-item">
                            <div class="info-label">예측 Zone</div>
                            <div class="info-value" style="color: ${zoneColor}; font-weight: bold;">
                                ${zoneEmoji} ${zoneName}
                            </div>
                        </div>
                        ${predictedPrice > 0 ? `
                        <div class="info-item">
                            <div class="info-label">예측 가격</div>
                            <div class="info-value" style="color: ${priceChangeColor}; font-weight: bold;">
                                ${predictedPrice.toLocaleString()} KRW
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">예상 변동률</div>
                            <div class="info-value" style="color: ${priceChangeColor};">
                                ${priceChangeIcon} ${predictedPriceChangePercent >= 0 ? '+' : ''}${predictedPriceChangePercent.toFixed(2)}%
                            </div>
                        </div>
                        ` : ''}
                        <div class="info-item">
                            <div class="info-label">예측 신뢰도</div>
                            <div class="info-value" style="color: ${zoneColor};">
                                ${confidencePercent}%
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">예측 r값</div>
                            <div class="info-value">
                                ${predictedRValue.toFixed(4)}
                            </div>
                        </div>
                        ${predictionReason ? `
                        <div class="info-item">
                            <div class="info-label">예측 근거</div>
                            <div class="info-value" style="font-size: 11px; color: #888;">
                                ${predictionReason}
                            </div>
                        </div>
                        ` : ''}
                        ${rlExpectedPnl !== null ? `
                        <div class="info-item">
                            <div class="info-label">📉 예상 손익률</div>
                            <div class="info-value" style="color: ${rlExpectedPnl >= 0 ? '#0ecb81' : '#f6465d'};">
                                ${rlExpectedPnl >= 0 ? '+' : ''}${rlExpectedPnl.toFixed(2)}%
                            </div>
                        </div>
                        ` : ''}
                        ${rlExpectedPrice !== null && rlExpectedPrice > 0 ? `
                        <div class="info-item">
                            <div class="info-label">💰 예상 가격</div>
                            <div class="info-value" style="color: ${rlExpectedPrice >= (card.chart_data?.current_price || 0) ? '#0ecb81' : '#f6465d'}; font-weight: bold;">
                                ${rlExpectedPrice.toLocaleString()} KRW
                            </div>
                        </div>
                        ` : ''}
                        ${rlVerificationProb !== null ? `
                        <div class="info-item">
                            <div class="info-label">✅ 검증 확률</div>
                            <div class="info-value" style="color: ${rlVerificationProb >= 50 ? '#0ecb81' : '#f6465d'};">
                                ${rlVerificationProb.toFixed(1)}%
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        } else if (rlExpectedTime || rlExpectedPrice) {
            // Zone 예측은 없지만 RL AI 예상 정보가 있는 경우
            const zoneColor = '#00d1ff';
            predictionHtml += `
                <div class="zone-prediction-section" style="margin-top: 15px; padding: 10px; background: rgba(0, 209, 255, 0.1); border-radius: 8px; border-left: 3px solid ${zoneColor};">
                    <div class="zone-prediction-header" style="font-weight: bold; margin-bottom: 8px; color: ${zoneColor};">
                        🔮 다음 카드가 생산되었을 때의 예측 (Zone & 가격)
                    </div>
                    <div class="zone-prediction-content">
                        ${rlExpectedTime !== null ? `
                        <div class="info-item">
                            <div class="info-label">⏱️ 예상 시간</div>
                            <div class="info-value">
                                ${rlExpectedTime < 60 ? `${rlExpectedTime}초` : 
                                  rlExpectedTime < 3600 ? `${Math.floor(rlExpectedTime / 60)}분` : 
                                  `${Math.floor(rlExpectedTime / 3600)}시간 ${Math.floor((rlExpectedTime % 3600) / 60)}분`}
                            </div>
                        </div>
                        ` : ''}
                        ${rlExpectedPnl !== null ? `
                        <div class="info-item">
                            <div class="info-label">📉 예상 손익률</div>
                            <div class="info-value" style="color: ${rlExpectedPnl >= 0 ? '#0ecb81' : '#f6465d'};">
                                ${rlExpectedPnl >= 0 ? '+' : ''}${rlExpectedPnl.toFixed(2)}%
                            </div>
                        </div>
                        ` : ''}
                        ${rlExpectedPrice !== null && rlExpectedPrice > 0 ? `
                        <div class="info-item">
                            <div class="info-label">💰 예상 가격</div>
                            <div class="info-value" style="color: ${rlExpectedPrice >= (card.chart_data?.current_price || 0) ? '#0ecb81' : '#f6465d'}; font-weight: bold;">
                                ${rlExpectedPrice.toLocaleString()} KRW
                            </div>
                        </div>
                        ` : ''}
                        ${rlVerificationProb !== null ? `
                        <div class="info-item">
                            <div class="info-label">✅ 검증 확률</div>
                            <div class="info-value" style="color: ${rlVerificationProb >= 50 ? '#0ecb81' : '#f6465d'};">
                                ${rlVerificationProb.toFixed(1)}%
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        // 예측 검증 결과 표시 (다음 카드가 생산되었을 때만 표시)
        if (predictionVerified) {
            const zoneEmoji = zoneCorrect ? '✅' : '❌';
            const priceEmoji = priceCorrect ? '✅' : '❌';
            const zoneColor = zoneCorrect ? '#0ecb81' : '#f6465d';
            const priceColor = priceCorrect ? '#0ecb81' : '#f6465d';
            const zoneText = zoneCorrect ? '정확한 예측' : '예측 실패';
            const priceText = priceCorrect ? '정확한 예측' : '예측 실패';
            const actualZoneEmoji = actualZone === 'BLUE' ? '🔵' : '🟠';
            const actualZoneName = actualZone === 'BLUE' ? 'BLUE' : 'ORANGE';
            const overallCorrect = zoneCorrect && (priceCorrect || actualPrice === 0);
            const overallColor = overallCorrect ? '#0ecb81' : '#f6465d';
            
            predictionHtml += `
                <div class="zone-verification-section" style="margin-top: 10px; padding: 10px; background: ${overallCorrect ? 'rgba(14, 203, 129, 0.1)' : 'rgba(246, 70, 93, 0.1)'}; border-radius: 8px; border-left: 3px solid ${overallColor};">
                    <div class="zone-verification-header" style="font-weight: bold; margin-bottom: 8px; color: ${overallColor};">
                        ${overallCorrect ? '✅' : '❌'} 예측 검증 결과 (다음 카드 생산됨)
                    </div>
                    <div class="zone-verification-content">
                        <div class="info-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                            <div class="info-label" style="font-weight: bold; color: #00d1ff;">📊 다음 생산 카드 정보</div>
                        </div>
                        ${card.next_card_id ? `
                        <div class="info-item">
                            <div class="info-label">카드 ID</div>
                            <div class="info-value" style="font-size: 11px; color: #888;">
                                ${card.next_card_id}
                                ${card.next_card_production_number ? ` <span style="color: #00d1ff; font-weight: bold;">#${card.next_card_production_number}</span>` : ''}
                            </div>
                        </div>
                        ` : ''}
                        ${card.next_card_timeframe ? `
                        <div class="info-item">
                            <div class="info-label">타임프레임</div>
                            <div class="info-value">
                                ${card.next_card_timeframe}
                            </div>
                        </div>
                        ` : ''}
                        ${card.next_card_nb_value !== undefined ? `
                        <div class="info-item">
                            <div class="info-label">N/B 값</div>
                            <div class="info-value">
                                ${card.next_card_nb_value.toFixed(10)}
                            </div>
                        </div>
                        ` : ''}
                        ${actualZone ? `
                        <div class="info-item">
                            <div class="info-label">실제 Zone</div>
                            <div class="info-value" style="color: ${actualZone === 'BLUE' ? '#00d1ff' : '#ffa500'}; font-weight: bold;">
                                ${actualZoneEmoji} ${actualZoneName}
                            </div>
                        </div>
                        ` : ''}
                        ${actualPrice > 0 ? `
                        <div class="info-item">
                            <div class="info-label">실제 가격</div>
                            <div class="info-value" style="font-weight: bold;">
                                ${actualPrice.toLocaleString()} KRW
                            </div>
                        </div>
                        ` : ''}
                        ${card.next_card_production_time ? `
                        <div class="info-item">
                            <div class="info-label">생산 시간</div>
                            <div class="info-value" style="font-size: 11px; color: #888;">
                                ${new Date(card.next_card_production_time).toLocaleString('ko-KR')}
                            </div>
                        </div>
                        ` : ''}
                        <div class="info-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                            <div class="info-label" style="font-weight: bold; color: #00d1ff;">🔍 검증 결과</div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">Zone 예측</div>
                            <div class="info-value" style="color: ${zoneColor}; font-weight: bold;">
                                ${zoneEmoji} ${zoneText}
                            </div>
                        </div>
                        ${actualZone ? `
                        <div class="info-item">
                            <div class="info-label">예측 Zone</div>
                            <div class="info-value">
                                ${predictedZone === 'BLUE' ? '🔵' : '🟠'} ${predictedZone}
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">실제 Zone</div>
                            <div class="info-value">
                                ${actualZoneEmoji} ${actualZoneName}
                            </div>
                        </div>
                        ` : ''}
                        ${predictedPrice > 0 && actualPrice > 0 ? `
                        <div class="info-item">
                            <div class="info-label">가격 예측</div>
                            <div class="info-value" style="color: ${priceColor}; font-weight: bold;">
                                ${priceEmoji} ${priceText}
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">예측 가격</div>
                            <div class="info-value">
                                ${predictedPrice.toLocaleString()} KRW
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">실제 가격</div>
                            <div class="info-value">
                                ${actualPrice.toLocaleString()} KRW
                            </div>
                        </div>
                        <div class="info-item">
                            <div class="info-label">가격 오차율</div>
                            <div class="info-value" style="color: ${priceErrorPercent <= 2 ? '#0ecb81' : priceErrorPercent <= 5 ? '#ffa500' : '#f6465d'}; font-weight: bold;">
                                ${priceErrorPercent.toFixed(2)}%
                            </div>
                        </div>
                        ` : ''}
                        ${priceErrorPercent > 0 && (!predictedPrice || !actualPrice) ? `
                        <div class="info-item">
                            <div class="info-label">가격 오차율</div>
                            <div class="info-value" style="color: ${priceErrorPercent <= 2 ? '#0ecb81' : priceErrorPercent <= 5 ? '#ffa500' : '#f6465d'}; font-weight: bold;">
                                ${priceErrorPercent.toFixed(2)}%
                            </div>
                        </div>
                        ` : ''}
                        ${verificationTime ? `
                        <div class="info-item">
                            <div class="info-label">검증 시간</div>
                            <div class="info-value" style="font-size: 11px; color: #888;">
                                ${new Date(verificationTime).toLocaleString('ko-KR')}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
            return predictionHtml || '';
        } catch (error) {
            console.error('Zone 예측 섹션 렌더링 오류:', error);
            return '';
        }
    },
    
    /**
     * Zone 예측 섹션 업데이트 (RL AI 분석 완료 후 호출, 검증 결과 포함)
     */
    async updateZonePredictionSectionWithVerification(cardId, rlAnalysisDetails) {
        try {
            // 카드 요소 찾기
            const cardEl = document.getElementById(`card-${cardId}`);
            if (!cardEl) {
                return;
            }
            
            // 카드 데이터 가져오기
            const cardData = await this.getCardData(cardId);
            if (!cardData) {
                console.warn(`카드 데이터를 찾을 수 없습니다: ${cardId}`);
                return;
            }
            
            // 검증 결과 확인 (현재 카드의 예측이 다음 카드에 의해 검증되었는지 확인)
            // 다음 카드가 실제로 생산되었을 때만 검증 결과 표시
            try {
                const allCards = await cardAgent.getCards('production');
                if (allCards && allCards.length > 0) {
                    // 생산 순서 번호 기준 정렬 (번호가 없으면 생성 시간 기준)
                    const sortedCards = allCards.sort((a, b) => {
                        const numA = a.production_number || 0;
                        const numB = b.production_number || 0;
                        if (numA !== numB) {
                            return numA - numB; // 순서 번호 오름차순
                        }
                        // 순서 번호가 같으면 생성 시간 기준
                        const timeA = new Date(a.created_at || a.production_time || 0).getTime();
                        const timeB = new Date(b.created_at || b.production_time || 0).getTime();
                        return timeA - timeB;
                    });
                    
                    const currentProductionNumber = cardData.production_number || 0;
                    
                    // 다음 생산 카드 찾기 (순서 번호 + 1)
                    const nextCard = sortedCards.find(c => {
                        const nextNum = c.production_number || 0;
                        return nextNum === currentProductionNumber + 1;
                    });
                    
                    // 다음 카드가 생산되었고, 현재 카드에 예측이 있으면
                    // 다음 카드의 실제 Zone/가격으로 현재 카드의 예측을 검증
                    if (nextCard && cardData.predicted_next_zone) {
                        // 다음 카드의 실제 Zone 확인 (여러 소스에서 확인)
                        const nextCardZone = nextCard.zone || 
                                           nextCard.ml_ai_zone || 
                                           nextCard.basic_ai_zone ||
                                           nextCard.recent_ml_ai_analysis?.zone ||
                                           nextCard.recent_basic_ai_analysis?.zone ||
                                           nextCard.analysis_details?.zone ||
                                           null;
                        const nextCardPrice = nextCard.chart_data?.prices?.[nextCard.chart_data.prices.length - 1] || 
                                             nextCard.chart_data?.current_price || 
                                             nextCard.current_price ||
                                             0;
                        
                        console.log(`🔍 검증 시도: #${currentProductionNumber} ${cardId} → #${nextCard.production_number} ${nextCard.card_id}`);
                        console.log(`   다음 카드 Zone 소스 확인:`, {
                            zone: nextCard.zone,
                            ml_ai_zone: nextCard.ml_ai_zone,
                            basic_ai_zone: nextCard.basic_ai_zone,
                            recent_ml_ai_analysis: nextCard.recent_ml_ai_analysis?.zone,
                            recent_basic_ai_analysis: nextCard.recent_basic_ai_analysis?.zone,
                            analysis_details: nextCard.analysis_details?.zone,
                            최종_Zone: nextCardZone
                        });
                        
                        // Zone 또는 가격 정보 중 하나라도 있으면 검증 수행
                        const hasZoneInfo = nextCardZone && cardData.predicted_next_zone;
                        const hasPriceInfo = cardData.predicted_next_price > 0 && nextCardPrice > 0;
                        
                        if (hasZoneInfo || hasPriceInfo) {
                            // 검증 결과 계산 (항상 최신 정보로 업데이트)
                            const zoneCorrect = hasZoneInfo ? (cardData.predicted_next_zone === nextCardZone) : null;
                            const priceErrorPercent = hasPriceInfo
                                ? Math.abs((nextCardPrice - cardData.predicted_next_price) / cardData.predicted_next_price) * 100
                                : null;
                            const priceCorrect = hasPriceInfo 
                                ? (priceErrorPercent <= 2.0)
                                : null;
                            
                            // 검증 결과를 서버에 저장
                            try {
                                const updateData = {
                                    prediction_verified: true,
                                    prediction_verification_time: new Date().toISOString(),
                                    next_card_id: nextCard.card_id,
                                    next_card_timeframe: nextCard.timeframe,
                                    next_card_nb_value: nextCard.nb_value,
                                    next_card_production_time: nextCard.production_time || nextCard.created_at,
                                    next_card_production_number: nextCard.production_number,
                                    verification_status: 'verified'
                                };
                                
                                // Zone 검증 결과 추가
                                if (hasZoneInfo) {
                                    updateData.zone_prediction_correct = zoneCorrect;
                                    updateData.prediction_actual_zone = nextCardZone;
                                }
                                
                                // 가격 검증 결과 추가
                                if (hasPriceInfo) {
                                    updateData.price_prediction_correct = priceCorrect;
                                    updateData.prediction_actual_price = nextCardPrice;
                                    updateData.prediction_price_error_percent = priceErrorPercent;
                                }
                                
                                await API.updateCard(cardId, updateData);
                                
                                // 검증 결과를 카드 데이터에 반영 (표시용)
                                cardData.prediction_verified = true;
                                if (hasZoneInfo) {
                                    cardData.zone_prediction_correct = zoneCorrect;
                                    cardData.prediction_actual_zone = nextCardZone;
                                }
                                if (hasPriceInfo) {
                                    cardData.price_prediction_correct = priceCorrect;
                                    cardData.prediction_actual_price = nextCardPrice;
                                    cardData.prediction_price_error_percent = priceErrorPercent;
                                }
                                cardData.prediction_verification_time = new Date().toISOString();
                                cardData.next_card_id = nextCard.card_id;
                                cardData.next_card_timeframe = nextCard.timeframe;
                                cardData.next_card_nb_value = nextCard.nb_value;
                                cardData.next_card_production_time = nextCard.production_time || nextCard.created_at;
                                cardData.next_card_production_number = nextCard.production_number;
                                cardData.verification_status = 'verified';
                                
                                // 검증 결과를 강화학습 AI의 학습 데이터로 반영
                                try {
                                    const learnResult = await API.post('/ai/learn-from-verification', {
                                        card_id: cardId
                                    });
                                    if (learnResult && learnResult.success) {
                                        console.log(`📚 검증 결과 학습 데이터 반영 완료: reward=${learnResult.reward?.toFixed(4)}, buffer_size=${learnResult.experience_buffer_size}`);
                                    }
                                } catch (learnError) {
                                    console.error(`⚠️ 검증 결과 학습 데이터 반영 실패: ${cardId}`, learnError);
                                }
                                
                                const currentProductionNumber = cardData.production_number || 0;
                                console.log(`✅ 검증 완료 및 서버 저장: #${currentProductionNumber} ${cardId} → #${nextCard.production_number} ${nextCard.card_id}`);
                                if (hasZoneInfo) {
                                    console.log(`   Zone 예측: ${zoneCorrect ? '✅ 정확' : '❌ 실패'} (예측=${cardData.predicted_next_zone}, 실제=${nextCardZone})`);
                                }
                                if (hasPriceInfo) {
                                    console.log(`   가격 예측: ${priceCorrect ? '✅ 정확' : '❌ 실패'} (예측=${cardData.predicted_next_price?.toLocaleString()}, 실제=${nextCardPrice.toLocaleString()}, 오차=${priceErrorPercent.toFixed(2)}%)`);
                                }
                            } catch (error) {
                                console.error(`⚠️ 검증 결과 서버 저장 실패: ${cardId}`, error);
                                // 서버 저장 실패해도 로컬 데이터는 업데이트
                                cardData.prediction_verified = true;
                                if (hasZoneInfo) {
                                    cardData.zone_prediction_correct = zoneCorrect;
                                    cardData.prediction_actual_zone = nextCardZone;
                                }
                                if (hasPriceInfo) {
                                    cardData.price_prediction_correct = priceCorrect;
                                    cardData.prediction_actual_price = nextCardPrice;
                                    cardData.prediction_price_error_percent = priceErrorPercent;
                                }
                                cardData.prediction_verification_time = new Date().toISOString();
                                cardData.verification_status = 'verified';
                            }
                        } else {
                            // 다음 카드가 생산되었지만 Zone/가격 정보가 없으면 검증 불가
                            console.log(`⚠️ 다음 카드가 생산되었지만 검증 정보 부족: #${currentProductionNumber} ${cardId} → #${nextCard.production_number} ${nextCard.card_id}`);
                            console.log(`   예측 Zone: ${cardData.predicted_next_zone}, 예측 가격: ${cardData.predicted_next_price}`);
                            console.log(`   실제 Zone: ${nextCardZone}, 실제 가격: ${nextCardPrice}`);
                            console.log(`   다음 카드 전체 데이터:`, nextCard);
                            // 검증 결과 초기화 (다음 카드가 생산되지 않았거나 검증 정보가 없는 경우)
                            cardData.prediction_verified = false;
                            cardData.verification_status = 'waiting_info'; // 검증 정보 대기 중
                        }
                    } else {
                        // 다음 카드가 생산되지 않았거나, 예측이 없으면 검증 불가
                        if (!cardData.predicted_next_zone) {
                            console.log(`⚠️ 예측 정보가 없어 검증 불가: #${currentProductionNumber} ${cardId}`);
                            cardData.verification_status = 'no_prediction'; // 예측 정보 없음
                        } else {
                            console.log(`⚠️ 다음 생산 카드가 아직 생산되지 않아 검증 불가: #${currentProductionNumber} ${cardId} (다음 번호: ${currentProductionNumber + 1})`);
                            cardData.verification_status = 'waiting_next_card'; // 다음 카드 대기 중
                        }
                        // 검증 결과 초기화 (다음 카드가 생산되지 않은 경우)
                        cardData.prediction_verified = false;
                    }
                } else {
                    // 카드가 없으면 검증 불가
                    cardData.prediction_verified = false;
                    cardData.verification_status = 'no_cards'; // 카드 없음
                }
            } catch (error) {
                console.warn('검증 결과 확인 실패:', error);
                // 오류 발생 시 검증 결과 초기화
                cardData.prediction_verified = false;
            }
            
            // Zone 예측 섹션 렌더링 (예상 값 유지, 검증 결과 포함)
            const zonePredictionHtml = this.renderZonePredictionSection(cardData, rlAnalysisDetails);
            if (!zonePredictionHtml) {
                return;
            }
            
            // 기존 Zone 예측 섹션 찾기
            let zonePredictionEl = cardEl.querySelector('.zone-prediction-section');
            if (!zonePredictionEl) {
                // Zone 예측 섹션이 없으면 카드 정보 섹션 뒤에 추가
                const cardInfoEl = cardEl.querySelector('.card-info');
                if (cardInfoEl) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = zonePredictionHtml;
                    cardInfoEl.parentNode.insertBefore(tempDiv.firstChild, cardInfoEl.nextSibling);
                }
            } else {
                // Zone 예측 섹션 업데이트 (예상 값 유지, 검증 결과만 추가/업데이트)
                // 기존 예측 정보는 유지하고 검증 결과만 업데이트
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = zonePredictionHtml;
                
                // 기존 섹션의 예측 정보와 새 섹션의 검증 결과를 병합
                const newSection = tempDiv.firstChild;
                
                // newSection이 DOM 요소인지 확인
                if (!newSection || typeof newSection.querySelector !== 'function') {
                    console.warn('⚠️ newSection이 유효한 DOM 요소가 아닙니다. 전체 섹션 교체 시도.');
                    zonePredictionEl.outerHTML = zonePredictionHtml;
                    return;
                }
                
                const existingPredictionContent = zonePredictionEl.querySelector('.zone-prediction-content');
                const newPredictionContent = newSection.querySelector('.zone-prediction-content');
                
                if (existingPredictionContent && newPredictionContent) {
                    // 예측 정보는 기존 것 유지, 검증 결과는 새 것으로 업데이트
                    const existingVerification = zonePredictionEl.querySelector('.zone-verification-section');
                    const newVerification = newSection.querySelector('.zone-verification-section');
                    
                    if (newVerification) {
                        // 검증 결과가 있으면 추가 또는 업데이트
                        if (existingVerification) {
                            existingVerification.outerHTML = newVerification.outerHTML;
                        } else {
                            zonePredictionEl.appendChild(newVerification);
                        }
                    }
                    
                    // 예측 정보 업데이트 (RL AI 예상 정보 포함)
                    existingPredictionContent.outerHTML = newPredictionContent.outerHTML;
                } else {
                    // 전체 섹션 교체
                    zonePredictionEl.outerHTML = newSection.outerHTML;
                }
            }
        } catch (error) {
            console.error('Zone 예측 섹션 업데이트 실패:', error);
        }
    },
    
    /**
     * Zone 예측 섹션 업데이트 (RL AI 분석 완료 후 호출)
     */
    async updateZonePredictionSection(cardId, rlAnalysisDetails) {
        // 기존 함수는 호환성을 위해 유지
        return this.updateZonePredictionSectionWithVerification(cardId, rlAnalysisDetails);
    },
    
    /**
     * 예측 검증 결과가 없는 카드 조회
     * @returns {Promise<Array>} 예측은 있지만 검증이 안된 카드 배열
     */
    async getUnverifiedCards() {
        try {
            // 모든 생산 카드 가져오기
            const allCards = await cardAgent.getCards('production');
            if (!allCards || allCards.length === 0) {
                console.log('⚠️ 생산 카드가 없습니다.');
                return [];
            }
            
            // 검증이 안된 카드 찾기 (예측은 있지만 검증이 안된 카드)
            const unverifiedCards = allCards.filter(card => {
                const hasPrediction = card.predicted_next_zone || card.predicted_next_price;
                const isVerified = card.prediction_verified === true;
                return hasPrediction && !isVerified;
            });
            
            // 생산 순서 번호 기준 정렬
            unverifiedCards.sort((a, b) => {
                const numA = a.production_number || 0;
                const numB = b.production_number || 0;
                if (numA !== numB) {
                    return numA - numB;
                }
                const timeA = new Date(a.created_at || a.production_time || 0).getTime();
                const timeB = new Date(b.created_at || b.production_time || 0).getTime();
                return timeA - timeB;
            });
            
            return unverifiedCards;
        } catch (error) {
            console.error('❌ 예측 검증 결과가 없는 카드 조회 실패:', error);
            return [];
        }
    },
    
    /**
     * 검증이 안된 모든 카드 검증 완료 (순서 번호 기반)
     */
    async verifyAllUnverifiedCards() {
        try {
            console.log('🔍 검증이 안된 카드 검색 중...');
            
            // 모든 생산 카드 가져오기
            const allCards = await cardAgent.getCards('production');
            if (!allCards || allCards.length === 0) {
                console.log('⚠️ 생산 카드가 없습니다.');
                return;
            }
            
            // 생산 순서 번호 기준 정렬 (번호가 없으면 생성 시간 기준)
            const sortedCards = allCards.sort((a, b) => {
                const numA = a.production_number || 0;
                const numB = b.production_number || 0;
                if (numA !== numB) {
                    return numA - numB; // 순서 번호 오름차순
                }
                // 순서 번호가 같으면 생성 시간 기준
                const timeA = new Date(a.created_at || a.production_time || 0).getTime();
                const timeB = new Date(b.created_at || b.production_time || 0).getTime();
                return timeA - timeB;
            });
            
            // 기존 카드에 순서 번호가 없으면 부여 (마이그레이션)
            let maxProductionNumber = 0;
            for (let i = 0; i < sortedCards.length; i++) {
                const card = sortedCards[i];
                if (!card.production_number || card.production_number === 0) {
                    maxProductionNumber = Math.max(maxProductionNumber, i + 1);
                    card.production_number = maxProductionNumber;
                    console.log(`📝 순서 번호 부여: ${card.card_id} → #${card.production_number}`);
                } else {
                    maxProductionNumber = Math.max(maxProductionNumber, card.production_number);
                }
            }
            
            // 검증이 안된 카드 찾기 (예측은 있지만 검증이 안된 카드)
            const unverifiedCards = sortedCards.filter(card => {
                const hasPrediction = card.predicted_next_zone || card.predicted_next_price;
                const isVerified = card.prediction_verified === true;
                return hasPrediction && !isVerified;
            });
            
            if (unverifiedCards.length === 0) {
                console.log('✅ 검증이 필요한 카드가 없습니다.');
                return;
            }
            
            console.log(`📋 검증이 필요한 카드 ${unverifiedCards.length}개 발견`);
            
            // 각 카드에 대해 검증 수행
            for (const card of unverifiedCards) {
                const cardId = card.card_id;
                const currentProductionNumber = card.production_number || 0;
                
                // 다음 생산 카드 찾기 (순서 번호 + 1)
                const nextCard = sortedCards.find(c => {
                    const nextNum = c.production_number || 0;
                    return nextNum === currentProductionNumber + 1;
                });
                
                if (nextCard) {
                    // 다음 카드의 실제 Zone 확인 (여러 소스에서 확인)
                    const nextCardZone = nextCard.zone || 
                                       nextCard.ml_ai_zone || 
                                       nextCard.basic_ai_zone ||
                                       nextCard.recent_ml_ai_analysis?.zone ||
                                       nextCard.recent_basic_ai_analysis?.zone ||
                                       nextCard.analysis_details?.zone ||
                                       null;
                    const nextCardPrice = nextCard.chart_data?.prices?.[nextCard.chart_data.prices.length - 1] || 
                                         nextCard.chart_data?.current_price || 
                                         nextCard.current_price ||
                                         0;
                    
                    console.log(`🔍 검증 시도: #${currentProductionNumber} ${cardId} → #${nextCard.production_number} ${nextCard.card_id}`);
                    console.log(`   다음 카드 Zone 소스 확인:`, {
                        zone: nextCard.zone,
                        ml_ai_zone: nextCard.ml_ai_zone,
                        basic_ai_zone: nextCard.basic_ai_zone,
                        recent_ml_ai_analysis: nextCard.recent_ml_ai_analysis?.zone,
                        recent_basic_ai_analysis: nextCard.recent_basic_ai_analysis?.zone,
                        analysis_details: nextCard.analysis_details?.zone,
                        최종_Zone: nextCardZone,
                        가격: nextCardPrice
                    });
                    
                    // 다음 카드가 존재하면 검증 수행 (Zone 또는 가격 정보 중 하나라도 있으면)
                    const hasZoneInfo = nextCardZone && card.predicted_next_zone;
                    const hasPriceInfo = card.predicted_next_price > 0 && nextCardPrice > 0;
                    
                    if (hasZoneInfo || hasPriceInfo) {
                        // 검증 결과 계산
                        const zoneCorrect = hasZoneInfo ? (card.predicted_next_zone === nextCardZone) : null;
                        const priceErrorPercent = hasPriceInfo
                            ? Math.abs((nextCardPrice - card.predicted_next_price) / card.predicted_next_price) * 100
                            : null;
                        const priceCorrect = hasPriceInfo 
                            ? (priceErrorPercent <= 2.0)
                            : null;
                        
                        // 카드 존재 여부 확인 (404 오류 방지)
                        let cardExists = true;
                        try {
                            const cardCheck = await cardAgent.getCardById(cardId);
                            if (!cardCheck) {
                                cardExists = false;
                            }
                        } catch (checkError) {
                            // 카드 조회 실패 시에도 계속 진행 (카드가 제거되었을 수 있음)
                            if (checkError.status === 404 || checkError.statusCode === 404 || 
                                (checkError.message && checkError.message.includes('카드를 찾을 수 없습니다'))) {
                                cardExists = false;
                            }
                        }
                        
                        if (!cardExists) {
                            console.log(`⏭️ 카드가 이미 제거되어 검증 건너뜀: ${cardId}`);
                            continue; // 다음 카드로 진행
                        }
                        
                        // 검증 결과를 서버에 저장
                        try {
                            const updateData = {
                                prediction_verified: true,
                                prediction_verification_time: new Date().toISOString(),
                                next_card_id: nextCard.card_id,
                                next_card_timeframe: nextCard.timeframe,
                                next_card_nb_value: nextCard.nb_value,
                                next_card_production_time: nextCard.production_time || nextCard.created_at,
                                next_card_production_number: nextCard.production_number,
                                verification_status: 'verified'
                            };
                            
                            // Zone 검증 결과 추가
                            if (hasZoneInfo) {
                                updateData.zone_prediction_correct = zoneCorrect;
                                updateData.prediction_actual_zone = nextCardZone;
                            }
                            
                            // 가격 검증 결과 추가
                            if (hasPriceInfo) {
                                updateData.price_prediction_correct = priceCorrect;
                                updateData.prediction_actual_price = nextCardPrice;
                                updateData.prediction_price_error_percent = priceErrorPercent;
                            }
                            
                            await API.updateCard(cardId, updateData);
                            
                            // Zone 예측 섹션 업데이트 (서버에서 최신 데이터 가져오기)
                            await this.updateZonePredictionSectionWithVerification(cardId, null);
                            
                            // 검증 결과를 강화학습 AI의 학습 데이터로 반영
                            try {
                                const learnResult = await API.post('/ai/learn-from-verification', {
                                    card_id: cardId
                                });
                                if (learnResult && learnResult.success) {
                                    console.log(`📚 검증 결과 학습 데이터 반영 완료: reward=${learnResult.reward?.toFixed(4)}, buffer_size=${learnResult.experience_buffer_size}`);
                                }
                            } catch (learnError) {
                                console.error(`⚠️ 검증 결과 학습 데이터 반영 실패: ${cardId}`, learnError);
                            }
                            
                            const zoneResult = hasZoneInfo ? (zoneCorrect ? '정확' : '실패') : '정보없음';
                            const priceResult = hasPriceInfo ? (priceCorrect ? '정확' : '실패') : '정보없음';
                            console.log(`✅ 검증 완료 및 서버 저장: #${currentProductionNumber} ${cardId} → #${nextCard.production_number} ${nextCard.card_id} (Zone: ${zoneResult}, 가격: ${priceResult})`);
                        } catch (error) {
                            // 404 오류는 카드가 제거된 것으로 간주하고 건너뜀
                            if (error.status === 404 || error.statusCode === 404 || 
                                (error.message && error.message.includes('카드를 찾을 수 없습니다'))) {
                                console.log(`⏭️ 카드가 이미 제거되어 검증 건너뜀: ${cardId}`);
                                continue; // 다음 카드로 진행
                            }
                            console.error(`⚠️ 검증 결과 저장 실패: ${cardId}`, error);
                        }
                    } else {
                        console.log(`⚠️ 다음 카드 검증 정보 부족: #${currentProductionNumber} ${cardId} → #${nextCard.production_number} ${nextCard.card_id}`);
                        console.log(`   예측 Zone: ${card.predicted_next_zone}, 예측 가격: ${card.predicted_next_price}`);
                        console.log(`   실제 Zone: ${nextCardZone}, 실제 가격: ${nextCardPrice}`);
                        console.log(`   다음 카드 전체 데이터:`, nextCard);
                    }
                } else {
                    console.log(`⚠️ 다음 생산 카드 없음: #${currentProductionNumber} ${cardId} (다음 번호: ${currentProductionNumber + 1})`);
                }
            }
            
            // 검증 완료 후 통계 업데이트
            const updatedCards = await cardAgent.getCards('production');
            if (updatedCards && updatedCards.length > 0 && typeof this.updateProductionStats === 'function') {
                this.updateProductionStats(updatedCards);
            }
            
            console.log(`✅ 검증 완료 작업 종료`);
        } catch (error) {
            console.error('❌ 검증 완료 작업 실패:', error);
        }
    },
    
    /**
     * 카드 데이터 가져오기
     */
    async getCardData(cardId) {
        try {
            // cardAgent를 통해 카드 데이터 가져오기
            if (typeof cardAgent !== 'undefined' && cardAgent.getCardById) {
                return await cardAgent.getCardById(cardId);
            }
            return null;
        } catch (error) {
            console.error('카드 데이터 가져오기 실패:', error);
            return null;
        }
    },
    
    renderVerificationSection(card, soldHistory) {
        if (!soldHistory || !soldHistory.exit_price) {
            return '';
        }
        
        const pnlPercent = soldHistory.pnl_percent || 0;
        const pnlAmount = soldHistory.pnl_amount || 0;
        const exitPrice = soldHistory.exit_price || 0;
        
        // 손익률 기반 점수 계산
        const lossRateScore = this.calculateLossRateScore(pnlPercent);
        const scoreColor = CardChart.getScoreColor(lossRateScore);
        
        let resultText = '';
        let resultColor = '';
        if (pnlAmount > 0) {
            resultText = `✅ 승리: +${pnlPercent.toFixed(2)}% (+${pnlAmount.toLocaleString()} KRW)`;
            resultColor = '#0ecb81';
        } else if (pnlAmount < 0) {
            resultText = `❌ 손실: ${pnlPercent.toFixed(2)}% (${pnlAmount.toLocaleString()} KRW)`;
            resultColor = '#f6465d';
        } else {
            resultText = `➖ 무승부: ${pnlPercent.toFixed(2)}%`;
            resultColor = '#888888';
        }
        
        return `
            <div class="verification-section">
                <div class="verification-title">✅ 검증 완료</div>
                <div class="verification-result" style="color: ${resultColor}; font-weight: bold; font-size: 14px;">
                    ${resultText}
                </div>
                <div class="verification-score" style="color: ${scoreColor}; font-weight: bold; font-size: 13px; padding: 5px; background-color: #0a0a1a; border-radius: 3px;">
                    📊 검증 점수: ${lossRateScore.toFixed(1)}
                </div>
            </div>
        `;
    },
    
    /**
     * 손익률 기반 점수 계산
     */
    calculateLossRateScore(pnlPercent) {
        // PyQt6와 동일한 로직
        if (pnlPercent >= 10) return 100.0;
        if (pnlPercent >= 5) return 90.0;
        if (pnlPercent >= 2) return 80.0;
        if (pnlPercent >= 0) return 70.0;
        if (pnlPercent >= -2) return 60.0;
        if (pnlPercent >= -5) return 50.0;
        if (pnlPercent >= -10) return 40.0;
        return 30.0;
    },
    
    /**
     * 손실률 차트 렌더링 (매도 완료된 경우)
     */
    renderPnlChart(card) {
        const soldHistory = this.getLatestSoldHistory(card);
        if (!soldHistory || !soldHistory.exit_price) {
            return '';
        }
        
        const pnlPercent = soldHistory.pnl_percent || 0;
        const pnlAmount = soldHistory.pnl_amount || 0;
        const pnlColor = pnlAmount > 0 ? '#0ecb81' : pnlAmount < 0 ? '#ff6b6b' : '#888888';
        const pnlIcon = pnlAmount > 0 ? '✅' : pnlAmount < 0 ? '❌' : '➖';
        
        return `
            <div class="pnl-section">
                <div class="pnl-header">
                    <div class="pnl-title">${pnlIcon} 검증 완료</div>
                </div>
                <div class="pnl-result" style="color: ${pnlColor}">
                    ${pnlAmount > 0 ? '승리' : pnlAmount < 0 ? '손실' : '무승부'}: 
                    ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% 
                    (${pnlAmount >= 0 ? '+' : ''}${pnlAmount.toLocaleString()} KRW)
                </div>
                <div class="chart-section">
                    <div class="chart-label">📉 매도 시점 가격 차트</div>
                    <canvas id="pnl-chart-${card.card_id}" class="card-chart pnl"></canvas>
                </div>
            </div>
        `;
    },
    
    /**
     * 최신 매도 히스토리 가져오기
     */
    getLatestSoldHistory(card) {
        const historyList = card.history_list || [];
        for (const hist of historyList) {
            if (hist.type === 'SOLD' || hist.type === 'SELL') {
                return hist;
            }
        }
        return null;
    },
    
    /**
     * 가격 예측 계산 (차트 데이터 기반)
     */
    calculatePricePrediction(prices, timeframe = '1m') {
        if (!prices || prices.length < 10) {
            return null;
        }
        
        // 최근 가격 데이터 사용
        const recentPrices = prices.slice(-50);
        const currentPrice = recentPrices[recentPrices.length - 1];
        
        // 단순 이동평균 계산 (5, 10, 20 기간)
        const ma5 = this.calculateMA(recentPrices, 5);
        const ma10 = this.calculateMA(recentPrices, 10);
        const ma20 = this.calculateMA(recentPrices, 20);
        
        // 가격 변동률 계산 (최근 1분, 3분, 5분)
        const priceChange1 = recentPrices.length >= 2 ? 
            ((recentPrices[recentPrices.length - 1] - recentPrices[recentPrices.length - 2]) / recentPrices[recentPrices.length - 2]) * 100 : 0;
        const priceChange3 = recentPrices.length >= 4 ? 
            ((recentPrices[recentPrices.length - 1] - recentPrices[recentPrices.length - 4]) / recentPrices[recentPrices.length - 4]) * 100 : 0;
        const priceChange5 = recentPrices.length >= 6 ? 
            ((recentPrices[recentPrices.length - 1] - recentPrices[recentPrices.length - 6]) / recentPrices[recentPrices.length - 6]) * 100 : 0;
        
        // 평균 변동률 계산 (가중 평균: 최근 데이터에 더 높은 가중치)
        const avgChangeRate = (priceChange1 * 0.5 + priceChange3 * 0.3 + priceChange5 * 0.2) / 100;
        
        // 추세 방향 판단
        const trend = ma5 > ma10 && ma10 > ma20 ? 'up' : 
                     ma5 < ma10 && ma10 < ma20 ? 'down' : 'neutral';
        
        // 예측 시간 (분)
        const predictionMinutes = [5, 10, 15, 30, 60];
        const predictions = {};
        
        predictionMinutes.forEach(minutes => {
            // 선형 외삽 + 변동성 고려
            const basePrediction = currentPrice * (1 + avgChangeRate * minutes);
            
            // 변동성 조정 (최근 가격의 표준편차 사용)
            const volatility = this.calculateVolatility(recentPrices.slice(-20));
            const volatilityAdjustment = volatility * Math.sqrt(minutes / 10); // 시간에 따른 변동성 확대
            
            // 상한/하한 계산
            const upperBound = basePrediction * (1 + volatilityAdjustment);
            const lowerBound = basePrediction * (1 - volatilityAdjustment);
            
            predictions[minutes] = {
                price: basePrediction,
                upper: upperBound,
                lower: lowerBound,
                confidence: Math.max(0, Math.min(100, 100 - (volatility * 10))) // 변동성이 낮을수록 신뢰도 높음
            };
        });
        
        return {
            currentPrice: currentPrice,
            trend: trend,
            ma5: ma5,
            ma10: ma10,
            ma20: ma20,
            priceChange1: priceChange1,
            priceChange3: priceChange3,
            priceChange5: priceChange5,
            volatility: this.calculateVolatility(recentPrices.slice(-20)),
            predictions: predictions
        };
    },
    
    /**
     * 이동평균 계산
     */
    calculateMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
        return sum / period;
    },
    
    /**
     * 변동성 계산 (표준편차 기반)
     */
    calculateVolatility(prices) {
        if (prices.length < 2) return 0;
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        return Math.sqrt(variance);
    },
    
    /**
     * 특정 가격 도달 시간 예측
     */
    calculateTimeToPrice(currentPrice, targetPrice, avgChangeRate, volatility) {
        const priceDiff = targetPrice - currentPrice;
        const priceDiffPercent = (priceDiff / currentPrice) * 100;
        
        // 가격 차이가 변동성 범위 내에 있는지 확인
        if (Math.abs(priceDiffPercent) < volatility * 100) {
            return {
                minutes: 0,
                message: '목표 가격이 현재 변동성 범위 내에 있습니다',
                confidence: 50
            };
        }
        
        // avgChangeRate가 0이거나 매우 작으면 최소 변동률 사용
        const effectiveChangeRate = Math.abs(avgChangeRate) < 0.0001 ? 
            (volatility * 0.5) : Math.abs(avgChangeRate);
        
        // 예상 도달 시간 계산 (분)
        // 가격 차이와 변동률의 부호가 일치해야 함
        const directionMatch = (priceDiffPercent > 0 && avgChangeRate > 0) || 
                              (priceDiffPercent < 0 && avgChangeRate < 0);
        
        if (!directionMatch && Math.abs(avgChangeRate) > 0.0001) {
            // 반대 방향이면 도달 불가능
            return {
                minutes: -1,
                message: '현재 추세와 반대 방향입니다',
                confidence: 0
            };
        }
        
        const estimatedMinutes = Math.abs(priceDiffPercent) / (effectiveChangeRate * 100);
        
        // 변동성 고려한 신뢰 구간
        const confidenceMinutes = Math.abs(estimatedMinutes) * (1 + volatility * 2);
        
        // 신뢰도 계산 (변동성이 낮고 추세가 명확할수록 높음)
        const trendStrength = Math.abs(avgChangeRate) / (volatility + 0.001);
        const confidence = Math.max(0, Math.min(100, 50 + (trendStrength * 10) - (volatility * 20)));
        
        return {
            minutes: Math.max(1, Math.round(estimatedMinutes)),
            confidenceMinutes: Math.round(confidenceMinutes),
            confidence: Math.round(confidence)
        };
    },
    
    /**
     * 강화학습 AI 가격 예측 렌더링 (차트 그래프 + 텍스트 1개)
     */
    async renderRLPricePrediction(cardId, rlResult, analysisDetails, predictionEl) {
        try {
            if (!predictionEl) {
                console.warn(`예측 컨테이너를 찾을 수 없습니다: ml-ai-prediction-${cardId}`);
                return;
            }
            
            // 현재 가격 가져오기 (analysisDetails에서 없으면 API에서 가져오기)
            let currentPrice = analysisDetails.current_price || 0;
            if (currentPrice <= 0) {
                try {
                    const priceData = await API.getPrice();
                    currentPrice = priceData?.price || 0;
                } catch (error) {
                    console.warn('현재 가격 가져오기 실패:', error);
                }
            }
            
            if (currentPrice <= 0) {
                predictionEl.innerHTML = `
                    <div class="ml-ai-prediction-content">
                        <div class="ml-ai-prediction-title">🧠 강화학습 AI 가격 예측 차트</div>
                        <div style="padding: 20px; text-align: center; color: #888;">
                            현재 가격 정보를 가져올 수 없습니다
                        </div>
                    </div>
                `;
                predictionEl.style.display = 'block';
                return;
            }
            
            // 강화학습 AI 분석 결과에서 예측 정보 추출
            const baseOutput = analysisDetails.base_output || {};
            const emotionOutput = analysisDetails.emotion_output || {};
            const expectedPnlPercent = analysisDetails.expected_pnl_percent || 0;
            const expectedTimeSeconds = analysisDetails.expected_time_seconds || 0;
            const confidence = rlResult.confidence || 0;
            const action = rlResult.action || 'HOLD';
            
            // Base Model의 예측 수익률 사용 (없으면 기본값 사용)
            let predReturn = baseOutput.pred_return;
            if (predReturn === null || predReturn === undefined || predReturn === 0) {
                // 예측 수익률이 없으면 예상 손익률이나 액션 기반으로 추정
                if (expectedPnlPercent !== 0) {
                    predReturn = expectedPnlPercent / 100 / 60; // 60분 기준으로 변환
                } else if (action === 'BUY') {
                    predReturn = 0.002; // 기본값: 0.2% (상승 예상)
                } else if (action === 'SELL') {
                    predReturn = -0.002; // 기본값: -0.2% (하락 예상)
                } else {
                    predReturn = 0.001; // 기본값: 0.1% (중립)
                }
            }
            const baseConfidence = baseOutput.confidence || 0.5;
            
            // 예상 가격 계산 (expected_pnl_percent 기반)
            const expectedPrice = expectedPnlPercent !== 0 
                ? currentPrice * (1 + expectedPnlPercent / 100)
                : currentPrice * (1 + predReturn);
            
            // 예상 시간을 분으로 변환
            const expectedTimeMinutes = expectedTimeSeconds > 0 
                ? Math.round(expectedTimeSeconds / 60)
                : 30; // 기본값 30분
            
            // 가격 예측 계산 (강화학습 AI 기반)
            const predictionMinutes = [0, 5, 10, 15, 30, 60]; // 0분 = 현재
            const predictions = [];
            let expectedPricePoint = null; // 예상 가격 포인트
            
            predictionMinutes.forEach(minutes => {
                // 강화학습 AI의 예측 수익률을 기반으로 가격 예측
                const timeMultiplier = minutes / 60; // 60분 기준으로 정규화
                const predictedReturn = predReturn * timeMultiplier;
                
                // Base Model 신뢰도와 강화학습 AI 신뢰도 결합
                const combinedConfidence = (baseConfidence * 0.4 + (confidence / 100) * 0.6) * 100;
                
                // 예측 가격 계산
                let predictedPrice;
                if (minutes === 0) {
                    predictedPrice = currentPrice;
                } else if (expectedPnlPercent !== 0 && minutes === expectedTimeMinutes) {
                    // 예상 시간에 도달하면 예상 가격 사용
                    predictedPrice = expectedPrice;
                    expectedPricePoint = { minutes, price: expectedPrice };
                } else {
                    // 일반 예측 가격 계산
                    predictedPrice = currentPrice * (1 + predictedReturn);
                }
                
                // 변동성 고려 (Emotion Model의 표준편차 사용)
                const volatility = emotionOutput.std_dev || 0.01;
                const volatilityAdjustment = volatility * Math.sqrt(Math.max(1, minutes) / 10);
                
                const upperBound = predictedPrice * (1 + volatilityAdjustment);
                const lowerBound = predictedPrice * (1 - volatilityAdjustment);
                
                predictions.push({
                    minutes: minutes,
                    price: predictedPrice,
                    upper: upperBound,
                    lower: lowerBound,
                    confidence: Math.max(0, Math.min(100, combinedConfidence)),
                    isExpected: minutes === expectedTimeMinutes && expectedPnlPercent !== 0
                });
            });
            
            // 예상 시간이 예측 분에 없는 경우 추가
            if (expectedTimeMinutes > 0 && expectedTimeMinutes <= 60 && !predictions.find(p => p.minutes === expectedTimeMinutes)) {
                const expectedReturn = expectedPnlPercent / 100;
                const expectedPriceCalc = currentPrice * (1 + expectedReturn);
                const volatility = emotionOutput.std_dev || 0.01;
                const volatilityAdjustment = volatility * Math.sqrt(Math.max(1, expectedTimeMinutes) / 10);
                
                predictions.push({
                    minutes: expectedTimeMinutes,
                    price: expectedPriceCalc,
                    upper: expectedPriceCalc * (1 + volatilityAdjustment),
                    lower: expectedPriceCalc * (1 - volatilityAdjustment),
                    confidence: Math.max(0, Math.min(100, (baseConfidence * 0.4 + (confidence / 100) * 0.6) * 100)),
                    isExpected: true
                });
                
                expectedPricePoint = { minutes: expectedTimeMinutes, price: expectedPriceCalc };
                
                // 분 순서대로 정렬
                predictions.sort((a, b) => a.minutes - b.minutes);
            }
            
            // 차트 데이터 준비
            const chartLabels = predictions.map(p => p.minutes === 0 ? '현재' : `${p.minutes}분`);
            const chartPrices = predictions.map(p => p.price);
            const chartUpper = predictions.map(p => p.upper);
            const chartLower = predictions.map(p => p.lower);
            
            // 차트 컨테이너 HTML
            let predictionHtml = '<div class="ml-ai-prediction-content">';
            predictionHtml += '<div class="ml-ai-prediction-title">🧠 강화학습 AI 가격 예측 차트</div>';
            predictionHtml += `<div style="position: relative; height: 200px; width: 100%;">`;
            predictionHtml += `<canvas id="price-prediction-chart-${cardId}"></canvas>`;
            predictionHtml += `</div>`;
            predictionHtml += '</div>';
            
            predictionEl.innerHTML = predictionHtml;
            predictionEl.style.display = 'block';
            
            // Chart.js로 차트 렌더링 (더 긴 지연으로 DOM 준비 대기)
            const renderChart = () => {
                this.renderPricePredictionChart(cardId, chartLabels, chartPrices, chartUpper, chartLower, currentPrice, action, expectedPricePoint, expectedTimeMinutes);
            };
            
            // Chart.js가 로드되지 않은 경우 재시도
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js가 아직 로드되지 않았습니다. 재시도 중...');
                let retryCount = 0;
                const maxRetries = 20; // 최대 10초 대기
                const retryInterval = setInterval(() => {
                    retryCount++;
                    if (typeof Chart !== 'undefined') {
                        clearInterval(retryInterval);
                        setTimeout(renderChart, 100);
                    } else if (retryCount >= maxRetries) {
                        clearInterval(retryInterval);
                        console.error('Chart.js 로드 실패: 차트를 표시할 수 없습니다.');
                        const chartContainer = document.querySelector(`#price-prediction-chart-${cardId}`)?.parentElement;
                        if (chartContainer) {
                            chartContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #ff6b6b;">차트 라이브러리 로드 실패</div>';
                        }
                    }
                }, 500);
            } else {
                setTimeout(renderChart, 300);
            }
            
            // 예측 데이터 저장 (적중률 계산용)
            this.savePrediction(cardId, currentPrice, predictions, expectedTimeSeconds, action);
            
            // 적중률 계산
            const accuracy = this.calculatePredictionAccuracy(cardId, currentPrice, predictions);
            
            // 텍스트 예측 (30분 후 예상 가격만 표시 + 적중률)
            const predictionTextEl = document.getElementById(`ml-ai-prediction-text-${cardId}`);
            if (predictionTextEl) {
                const pred30 = predictions.find(p => p.minutes === 30);
                if (pred30) {
                    const priceDiff = pred30.price - currentPrice;
                    const priceDiffPercent = (priceDiff / currentPrice) * 100;
                    const color = priceDiffPercent > 0 ? '#0ecb81' : priceDiffPercent < 0 ? '#ff6b6b' : '#888888';
                    const icon = priceDiffPercent > 0 ? '📈' : priceDiffPercent < 0 ? '📉' : '➖';
                    
                    const actionIcon = action === 'BUY' ? '📈' : action === 'SELL' ? '📉' : '➖';
                    const actionColor = action === 'BUY' ? '#0ecb81' : action === 'SELL' ? '#ff6b6b' : '#888888';
                    
                    // 적중률 색상 결정
                    const accuracyColor = accuracy.priceAccuracy >= 70 ? '#0ecb81' : 
                                         accuracy.priceAccuracy >= 50 ? '#ffa500' : '#ff6b6b';
                    const timeAccuracyColor = accuracy.timeAccuracy >= 70 ? '#0ecb81' : 
                                             accuracy.timeAccuracy >= 50 ? '#ffa500' : '#ff6b6b';
                    
                    predictionTextEl.innerHTML = `
                        <div class="prediction-summary-card" style="border-left-color: ${actionColor};">
                            <div class="prediction-header" style="color: ${actionColor};">
                                ${actionIcon} ${action} 판정 (${confidence.toFixed(0)}%)
                            </div>
                            <div class="prediction-info-grid">
                                <div class="prediction-info-item">
                                    <span class="prediction-label">현재가</span>
                                    <span class="prediction-value">${currentPrice.toLocaleString()} KRW</span>
                                </div>
                                <div class="prediction-info-item">
                                    <span class="prediction-label">30분 후 예상</span>
                                    <span class="prediction-value" style="color: ${color};">
                                        ${pred30.price.toLocaleString()} KRW
                                        <small>(${priceDiffPercent >= 0 ? '+' : ''}${priceDiffPercent.toFixed(2)}%)</small>
                                    </span>
                                </div>
                                <div class="prediction-info-item">
                                    <span class="prediction-label">예측 범위</span>
                                    <span class="prediction-value" style="font-size: 11px; color: #888;">
                                        ${pred30.lower.toLocaleString()} ~ ${pred30.upper.toLocaleString()}
                                    </span>
                                </div>
                                ${expectedTimeSeconds > 0 ? `
                                    <div class="prediction-info-item">
                                        <span class="prediction-label">예상 시간</span>
                                        <span class="prediction-value">약 ${Math.round(expectedTimeSeconds / 60)}분</span>
                                    </div>
                                ` : ''}
                                ${accuracy.totalPredictions > 0 ? `
                                    <div class="prediction-info-item full-width">
                                        <span class="prediction-label">적중률 (${accuracy.totalPredictions}회)</span>
                                        <div class="accuracy-stats">
                                            <span class="accuracy-item">
                                                가격: <strong style="color: ${accuracyColor};">${accuracy.priceAccuracy.toFixed(1)}%</strong>
                                            </span>
                                            <span class="accuracy-item">
                                                시간: <strong style="color: ${timeAccuracyColor};">${accuracy.timeAccuracy.toFixed(1)}%</strong>
                                            </span>
                                        </div>
                                    </div>
                                ` : `
                                    <div class="prediction-info-item full-width">
                                        <span class="prediction-label" style="color: #888; font-style: italic;">
                                            예측 검증 대기 중
                                        </span>
                                    </div>
                                `}
                            </div>
                        </div>
                    `;
                    predictionTextEl.style.display = 'block';
                }
            }
            
        } catch (error) {
            console.error('강화학습 AI 가격 예측 렌더링 실패:', error);
            predictionEl.style.display = 'none';
        }
    },
    
    /**
     * 예측 데이터 저장 (적중률 계산용)
     */
    savePrediction(cardId, currentPrice, predictions, expectedTimeSeconds, action) {
        try {
            const predictionKey = `prediction_history_${cardId}`;
            const timestamp = Date.now();
            
            // 예측 데이터 구조
            const prediction = {
                timestamp: timestamp,
                currentPrice: currentPrice,
                predictedPrice30: predictions.find(p => p.minutes === 30)?.price || 0,
                predictedTime: expectedTimeSeconds > 0 ? Math.round(expectedTimeSeconds / 60) : null,
                action: action,
                predictions: predictions.map(p => ({
                    minutes: p.minutes,
                    price: p.price,
                    upper: p.upper,
                    lower: p.lower
                }))
            };
            
            // 기존 예측 히스토리 가져오기
            let history = [];
            try {
                const historyStr = localStorage.getItem(predictionKey);
                if (historyStr) {
                    history = JSON.parse(historyStr);
                }
            } catch (e) {
                console.warn('예측 히스토리 로드 실패:', e);
            }
            
            // 새 예측 추가
            history.push(prediction);
            
            // 최근 100개만 유지
            if (history.length > 100) {
                history = history.slice(-100);
            }
            
            // 저장
            localStorage.setItem(predictionKey, JSON.stringify(history));
            
        } catch (error) {
            console.error('예측 데이터 저장 실패:', error);
        }
    },
    
    /**
     * 예측 적중률 계산
     */
    /**
     * 차트용 검증 데이터 가져오기
     * @param {string} cardId - 카드 ID
     * @param {Array} labels - 시간 라벨 배열
     * @returns {Array} 검증 데이터 배열 (null로 채워진 배열)
     */
    getValidationDataForChart(cardId, labels) {
        try {
            const validationKey = `price_validation_${cardId}`;
            const validationStr = localStorage.getItem(validationKey);
            if (!validationStr) return [];
            
            const validations = JSON.parse(validationStr);
            if (!validations || validations.length === 0) return [];
            
            // 최근 검증 데이터만 사용 (최대 10개)
            const recentValidations = validations.slice(-10);
            
            // 라벨에 맞는 검증 데이터 매핑
            const validationData = labels.map(() => null);
            
            recentValidations.forEach(validation => {
                const minutes = validation.minutes || 30;
                const labelIndex = labels.findIndex(label => {
                    if (label === `${minutes}분`) return true;
                    if (label === '현재' && minutes === 0) return true;
                    return false;
                });
                
                if (labelIndex >= 0 && validation.actualPrice) {
                    validationData[labelIndex] = validation.actualPrice;
                }
            });
            
            return validationData;
        } catch (error) {
            console.error('검증 데이터 가져오기 실패:', error);
            return [];
        }
    },
    
    calculatePredictionAccuracy(cardId, currentPrice, currentPredictions) {
        try {
            const predictionKey = `prediction_history_${cardId}`;
            const validationKey = `prediction_validation_${cardId}`;
            
            // 예측 히스토리 가져오기
            let history = [];
            try {
                const historyStr = localStorage.getItem(predictionKey);
                if (historyStr) {
                    history = JSON.parse(historyStr);
                }
            } catch (e) {
                return { priceAccuracy: 0, timeAccuracy: 0, totalPredictions: 0 };
            }
            
            // 검증 데이터 가져오기 (실제 가격/시간 기록)
            let validations = [];
            try {
                const validationStr = localStorage.getItem(validationKey);
                if (validationStr) {
                    validations = JSON.parse(validationStr);
                }
            } catch (e) {
                return { priceAccuracy: 0, timeAccuracy: 0, totalPredictions: 0 };
            }
            
            if (history.length === 0 || validations.length === 0) {
                return { priceAccuracy: 0, timeAccuracy: 0, totalPredictions: 0 };
            }
            
            // 예측과 검증 매칭 (30분 후 예측 기준)
            let priceHits = 0;
            let timeHits = 0;
            let totalPriceChecks = 0;
            let totalTimeChecks = 0;
            
            // 각 예측에 대해 30분 후 실제 가격 확인
            history.forEach((pred, index) => {
                const predTime = pred.timestamp;
                const targetTime = predTime + (30 * 60 * 1000); // 30분 후
                
                // 해당 시간대의 검증 데이터 찾기
                const validation = validations.find(v => {
                    const timeDiff = Math.abs(v.timestamp - targetTime);
                    return timeDiff < 5 * 60 * 1000; // 5분 오차 허용
                });
                
                if (validation) {
                    // 가격 적중률 계산 (예측 범위 내에 실제 가격이 있는지)
                    const predictedPrice = pred.predictedPrice30;
                    const actualPrice = validation.actualPrice;
                    const pred30 = pred.predictions.find(p => p.minutes === 30);
                    
                    if (pred30 && actualPrice > 0) {
                        totalPriceChecks++;
                        // 예측 범위(하한 ~ 상한) 내에 실제 가격이 있으면 적중
                        if (actualPrice >= pred30.lower && actualPrice <= pred30.upper) {
                            priceHits++;
                        } else {
                            // 범위 밖이어도 오차율이 2% 이내면 적중으로 간주
                            const priceError = Math.abs(actualPrice - predictedPrice) / predictedPrice * 100;
                            if (priceError <= 2) {
                                priceHits++;
                            }
                        }
                    }
                    
                    // 시간 적중률 계산 (예상 시간과 실제 시간 차이)
                    if (pred.predictedTime && validation.actualTime) {
                        totalTimeChecks++;
                        const timeDiff = Math.abs(validation.actualTime - pred.predictedTime);
                        // 5분 이내 오차면 적중
                        if (timeDiff <= 5) {
                            timeHits++;
                        }
                    }
                }
            });
            
            const priceAccuracy = totalPriceChecks > 0 ? (priceHits / totalPriceChecks) * 100 : 0;
            const timeAccuracy = totalTimeChecks > 0 ? (timeHits / totalTimeChecks) * 100 : 0;
            
            return {
                priceAccuracy: priceAccuracy,
                timeAccuracy: timeAccuracy,
                totalPredictions: Math.max(totalPriceChecks, totalTimeChecks)
            };
            
        } catch (error) {
            console.error('적중률 계산 실패:', error);
            return { priceAccuracy: 0, timeAccuracy: 0, totalPredictions: 0 };
        }
    },
    
    /**
     * 실제 가격/시간 기록 (검증용)
     */
    recordActualPrice(cardId, actualPrice, actualTimeMinutes = null) {
        try {
            const validationKey = `price_validation_${cardId}`; // 차트용 검증 데이터
            const predictionValidationKey = `prediction_validation_${cardId}`; // 적중률 계산용
            const timestamp = Date.now();
            
            // 차트용 검증 데이터 저장 (간단한 구조)
            let chartValidations = [];
            try {
                const chartValidationStr = localStorage.getItem(validationKey);
                if (chartValidationStr) {
                    chartValidations = JSON.parse(chartValidationStr);
                }
            } catch (e) {
                chartValidations = [];
            }
            
            chartValidations.push({
                timestamp: timestamp,
                minutes: actualTimeMinutes || 30,
                actualPrice: actualPrice
            });
            
            // 최대 100개만 유지
            if (chartValidations.length > 100) {
                chartValidations = chartValidations.slice(-100);
            }
            
            localStorage.setItem(validationKey, JSON.stringify(chartValidations));
            
            // 적중률 계산용 검증 데이터 구조
            const validation = {
                timestamp: timestamp,
                actualPrice: actualPrice,
                actualTime: actualTimeMinutes
            };
            
            // 적중률 계산용 검증 데이터 저장
            let predictionValidations = [];
            try {
                const predictionValidationStr = localStorage.getItem(predictionValidationKey);
                if (predictionValidationStr) {
                    predictionValidations = JSON.parse(predictionValidationStr);
                }
            } catch (e) {
                console.warn('검증 데이터 로드 실패:', e);
            }
            
            // 새 검증 추가
            predictionValidations.push(validation);
            
            // 최근 100개만 유지
            if (predictionValidations.length > 100) {
                predictionValidations = predictionValidations.slice(-100);
            }
            
            // 저장
            localStorage.setItem(predictionValidationKey, JSON.stringify(predictionValidations));
            
        } catch (error) {
            console.error('실제 가격 기록 실패:', error);
        }
    },
    
    /**
     * 예측 검증 (30분 전 예측이 있으면 실제 가격 기록)
     */
    validatePrediction(cardId, currentPrice) {
        try {
            const predictionKey = `prediction_history_${cardId}`;
            
            // 예측 히스토리 가져오기
            let history = [];
            try {
                const historyStr = localStorage.getItem(predictionKey);
                if (historyStr) {
                    history = JSON.parse(historyStr);
                }
            } catch (e) {
                return;
            }
            
            if (history.length === 0) return;
            
            const now = Date.now();
            const thirtyMinutesAgo = now - (30 * 60 * 1000);
            
            // 30분 전 예측 찾기 (25-35분 사이 허용)
            const targetPrediction = history.find(pred => {
                const timeDiff = now - pred.timestamp;
                const minutesDiff = timeDiff / (60 * 1000);
                return minutesDiff >= 25 && minutesDiff <= 35; // 25-35분 사이
            });
            
            if (targetPrediction) {
                // 실제 가격 기록 (30분 후)
                this.recordActualPrice(cardId, currentPrice, 30);
                
                // 이미 검증된 예측은 제거 (중복 방지)
                const validatedTimestamp = targetPrediction.timestamp;
                history = history.filter(p => p.timestamp !== validatedTimestamp);
                localStorage.setItem(predictionKey, JSON.stringify(history));
            }
            
        } catch (error) {
            console.error('예측 검증 실패:', error);
        }
    },
    
    /**
     * 가격 예측 차트 렌더링 (Chart.js)
     * @param {string} cardId - 카드 ID
     * @param {Array} labels - 시간 라벨
     * @param {Array} prices - 예측 가격 배열
     * @param {Array} upper - 상한 가격 배열
     * @param {Array} lower - 하한 가격 배열
     * @param {number} currentPrice - 현재 가격
     * @param {string} action - 액션 (BUY/SELL/HOLD)
     * @param {Object} expectedPricePoint - 예상 가격 포인트 {minutes, price}
     * @param {number} expectedTimeMinutes - 예상 시간 (분)
     */
    renderPricePredictionChart(cardId, labels, prices, upper, lower, currentPrice, action, expectedPricePoint = null, expectedTimeMinutes = 0) {
        try {
            const canvas = document.getElementById(`price-prediction-chart-${cardId}`);
            if (!canvas) {
                console.warn(`가격 예측 차트 캔버스를 찾을 수 없습니다: price-prediction-chart-${cardId}`);
                return;
            }
            
            // 기존 차트가 있으면 제거
            const existingChart = window[`pricePredictionChart_${cardId}`];
            if (existingChart) {
                existingChart.destroy();
            }
            
            // Chart.js가 로드되어 있는지 확인
            if (typeof Chart === 'undefined') {
                console.warn('Chart.js가 로드되지 않았습니다. 차트를 렌더링할 수 없습니다.');
                return;
            }
            
            const ctx = canvas.getContext('2d');
            const actionColor = action === 'BUY' ? '#0ecb81' : action === 'SELL' ? '#ff6b6b' : '#888888';
            
            // 차트 영역 채우기 (예측 범위)
            const fillColor = actionColor + '15'; // 투명도 15%
            
            // 예상 가격 포인트 데이터 준비
            const expectedPriceData = labels.map((label, index) => {
                if (expectedPricePoint && labels[index] === `${expectedTimeMinutes}분`) {
                    return expectedPricePoint.price;
                }
                return null;
            });
            
            // 실제 가격 검증 데이터 가져오기
            const validationData = this.getValidationDataForChart(cardId, labels);
            
            const chart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: '예측 가격',
                            data: prices,
                            borderColor: actionColor,
                            backgroundColor: fillColor,
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            pointBackgroundColor: actionColor,
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            pointStyle: 'circle'
                        },
                        {
                            label: '상한',
                            data: upper,
                            borderColor: '#0ecb81',
                            backgroundColor: 'transparent',
                            borderWidth: 1.5,
                            borderDash: [5, 5],
                            fill: false,
                            pointRadius: 0,
                            tension: 0.4
                        },
                        {
                            label: '하한',
                            data: lower,
                            borderColor: '#ff6b6b',
                            backgroundColor: 'transparent',
                            borderWidth: 1.5,
                            borderDash: [5, 5],
                            fill: false,
                            pointRadius: 0,
                            tension: 0.4
                        },
                        // 예상 가격 포인트 (강조)
                        ...(expectedPricePoint ? [{
                            label: '예상 가격',
                            data: expectedPriceData,
                            borderColor: '#9d4edd',
                            backgroundColor: '#9d4edd',
                            borderWidth: 3,
                            fill: false,
                            pointRadius: 8,
                            pointHoverRadius: 10,
                            pointBackgroundColor: '#9d4edd',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 3,
                            pointStyle: 'star',
                            showLine: false
                        }] : []),
                        // 실제 가격 검증 포인트
                        ...(validationData.length > 0 ? [{
                            label: '실제 가격 (검증)',
                            data: validationData,
                            borderColor: '#00d1ff',
                            backgroundColor: '#00d1ff',
                            borderWidth: 2,
                            fill: false,
                            pointRadius: 6,
                            pointHoverRadius: 8,
                            pointBackgroundColor: '#00d1ff',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            pointStyle: 'triangle',
                            showLine: false
                        }] : [])
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    aspectRatio: 2,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: '#ffffff',
                                font: {
                                    size: 11
                                }
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#ffffff',
                            bodyColor: '#ffffff',
                            borderColor: '#444444',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    const value = context.parsed.y;
                                    if (value === null || value === undefined) return null;
                                    
                                    const datasetLabel = context.dataset.label;
                                    let label = `${datasetLabel}: ${value.toLocaleString()} KRW`;
                                    
                                    // 예상 가격 포인트에 추가 정보 표시
                                    if (datasetLabel === '예상 가격' && expectedPricePoint) {
                                        label += ` (${expectedTimeMinutes}분 후 예상)`;
                                    }
                                    
                                    // 검증 데이터에 오차율 표시
                                    if (datasetLabel === '실제 가격 (검증)') {
                                        const index = context.dataIndex;
                                        if (prices[index] && prices[index] !== null) {
                                            const error = Math.abs(value - prices[index]);
                                            const errorPercent = ((error / prices[index]) * 100).toFixed(2);
                                            label += ` (오차: ${errorPercent}%)`;
                                        }
                                    }
                                    
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#888888',
                                font: {
                                    size: 10
                                }
                            },
                            grid: {
                                color: '#333333'
                            }
                        },
                        y: {
                            ticks: {
                                color: '#888888',
                                font: {
                                    size: 10
                                },
                                callback: function(value) {
                                    return value.toLocaleString() + ' KRW';
                                }
                            },
                            grid: {
                                color: '#333333'
                            }
                        }
                    },
                    interaction: {
                        mode: 'index',
                        intersect: false
                    }
                }
            });
            
            // 전역 변수에 저장 (나중에 업데이트할 수 있도록)
            window[`pricePredictionChart_${cardId}`] = chart;
            
        } catch (error) {
            console.error('가격 예측 차트 렌더링 실패:', error);
        }
    },
    
    /**
     * 기존 ML AI 분석 시작 (Zone 분석만, 가격 예측은 강화학습 AI가 담당)
     */
    async startMLAIAnalysis(cardId, card) {
        try {
            const signalEl = document.getElementById(`ml-ai-signal-${cardId}`);
            const messageEl = document.getElementById(`ml-ai-message-${cardId}`);
            const predictionEl = document.getElementById(`ml-ai-prediction-${cardId}`);
            
            if (!signalEl || !messageEl) {
                console.warn(`ML AI 분석 UI 요소를 찾을 수 없습니다: cardId=${cardId}`);
                return;
            }
            
            // 카드 데이터가 없으면 서버에서 다시 가져오기
            if (!card) {
                try {
                    const cardData = await cardAgent.getCardById(cardId);
                    if (cardData) {
                        card = cardData;
                    }
                } catch (error) {
                    // 404 오류는 카드가 제거된 것으로 간주하고 조용히 처리
                    if (error.status !== 404 && error.statusCode !== 404) {
                        console.warn(`카드 데이터 가져오기 실패: ${cardId}`, error.message || error);
                    }
                }
            }
            
            // Zone 분석이 이미 완료되었는지 확인 (1번만 실행)
            const hasZoneAnalysis = card?.zone || card?.ml_ai_zone || card?.basic_ai_zone || 
                                   card?.recent_ml_ai_analysis?.zone || card?.recent_basic_ai_analysis?.zone;
            
            if (hasZoneAnalysis) {
                // 이미 Zone 분석이 완료된 경우, 저장된 값 표시
                const zone = card.zone || card.ml_ai_zone || card.basic_ai_zone || 
                           card.recent_ml_ai_analysis?.zone || card.recent_basic_ai_analysis?.zone;
                const rValue = card.r_value || card.ml_ai_r_value || card.basic_ai_r_value ||
                             card.recent_ml_ai_analysis?.r_value || card.recent_basic_ai_analysis?.r_value;
                
                if (zone) {
                    // Zone 의미: BLUE = 상승 구역, ORANGE = 하락 구역
                    const zoneText = zone === 'BLUE' ? '🔵 BLUE' : '🟠 ORANGE';
                    signalEl.textContent = zoneText;
                    signalEl.className = `ml-ai-signal signal-zone zone-${zone.toLowerCase()}`;
                    
                    const zoneColor = zone === 'BLUE' ? '#00d1ff' : '#ffa500';
                    const zoneName = zone === 'BLUE' ? '상승 구역' : '하락 구역';
                    const rValueText = rValue !== null && rValue !== undefined ? `r=${rValue.toFixed(4)}` : '';
                    
                    messageEl.innerHTML = `
                        <div class="ml-ai-message-content">
                            <div class="ml-ai-info-item">
                                <span class="ml-ai-label">Zone</span>
                                <span class="ml-ai-value" style="color: ${zoneColor};">${zoneName}</span>
                            </div>
                            ${rValueText ? `
                                <div class="ml-ai-info-item">
                                    <span class="ml-ai-label">r 값</span>
                                    <span class="ml-ai-value">${rValue.toFixed(6)}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                }
                console.log(`✅ Zone 분석 이미 완료: ${cardId} (${zone})`);
                return; // 이미 분석 완료되었으므로 재실행하지 않음
            }
            
            // 초기 상태
            signalEl.textContent = '분석 중';
            signalEl.className = 'ml-ai-signal signal-zone';
            messageEl.textContent = 'Zone 분석 중...';
            
            // Zone 정보만 가져오기 (가격 예측은 강화학습 AI가 담당, 1번만 실행)
            if (card && card.chart_data && card.chart_data.prices && card.chart_data.prices.length > 0) {
                console.log(`🔵 Zone 분석 시작: ${cardId} (차트 데이터: ${card.chart_data.prices.length}개 가격)`);
                
                try {
                    // 카드 데이터를 함께 전달하여 캐싱된 Zone 정보 활용
                    const result = await aiAgent.analyzeChart(card.chart_data, card);
                    console.log(`🔵 Zone 분석 결과: ${cardId}`, result);
                    
                    // Zone 정보 추출 (여러 경로 확인)
                    const zone = result?.zone || result?.analysis_details?.zone || null;
                    const rValue = (result?.r_value !== null && result?.r_value !== undefined) ? result.r_value :
                                  (result?.analysis_details?.r_value !== null && result?.analysis_details?.r_value !== undefined) ? result.analysis_details.r_value : null;
                    const zoneMessage = result?.zone_message || result?.analysis_details?.zone_message || 'Zone 분석 완료';
                    
                    console.log(`🔵 Zone 분석 결과 파싱: ${cardId} (zone=${zone}, rValue=${rValue})`);
                    
                    // Zone에 따른 신호 표시
                    if (zone && rValue !== null && rValue !== undefined) {
                        // Zone 의미: BLUE = 상승 구역, ORANGE = 하락 구역
                        const zoneText = zone === 'BLUE' ? '🔵 BLUE' : '🟠 ORANGE';
                        signalEl.textContent = zoneText;
                        signalEl.className = `ml-ai-signal signal-zone zone-${zone.toLowerCase()}`;
                        
                        const zoneColor = zone === 'BLUE' ? '#00d1ff' : '#ffa500';
                        const zoneName = zone === 'BLUE' ? '상승 구역' : '하락 구역';
                        const rValueText = `r=${rValue.toFixed(4)}`;
                        
                        messageEl.innerHTML = `
                            <div class="ml-ai-message-content">
                                <div class="ml-ai-info-item">
                                    <span class="ml-ai-label">Zone</span>
                                    <span class="ml-ai-value" style="color: ${zoneColor};">${zoneName}</span>
                                </div>
                                <div class="ml-ai-info-item">
                                    <span class="ml-ai-label">r 값</span>
                                    <span class="ml-ai-value">${rValue.toFixed(6)}</span>
                                </div>
                            </div>
                        `;
                        
                        console.log(`✅ Zone 분석 UI 업데이트 완료: ${cardId} (${zone}, r=${rValue})`);
                    } else {
                        // Zone 분석 결과가 없음 - 카드에서 다시 확인
                        console.warn(`⚠️ Zone 분석 결과 없음: ${cardId}`, result);
                        
                        // 카드 데이터에서 Zone 정보 재확인
                        const cardZone = card?.zone || card?.ml_ai_zone || card?.basic_ai_zone;
                        const cardRValue = card?.r_value || card?.ml_ai_r_value || card?.basic_ai_r_value;
                        
                        if (cardZone && cardRValue !== null && cardRValue !== undefined) {
                            // 카드에 Zone 정보가 있으면 사용
                            const zoneText = cardZone === 'BLUE' ? '🔵 BLUE' : '🟠 ORANGE';
                            signalEl.textContent = zoneText;
                            signalEl.className = `ml-ai-signal signal-zone zone-${cardZone.toLowerCase()}`;
                            
                            const zoneColor = cardZone === 'BLUE' ? '#00d1ff' : '#ffa500';
                            const zoneName = cardZone === 'BLUE' ? '상승 구역' : '하락 구역';
                            
                            messageEl.innerHTML = `
                                <div class="ml-ai-message-content">
                                    <div class="ml-ai-info-item">
                                        <span class="ml-ai-label">Zone</span>
                                        <span class="ml-ai-value" style="color: ${zoneColor};">${zoneName}</span>
                                    </div>
                                    <div class="ml-ai-info-item">
                                        <span class="ml-ai-label">r 값</span>
                                        <span class="ml-ai-value">${cardRValue.toFixed(6)}</span>
                                    </div>
                                </div>
                            `;
                            console.log(`✅ 카드에서 Zone 정보 사용: ${cardId} (${cardZone}, r=${cardRValue})`);
                        } else {
                            // Zone 분석 결과가 정말 없음
                            signalEl.textContent = 'ZONE';
                            signalEl.className = 'ml-ai-signal signal-zone';
                            messageEl.innerHTML = '<div class="ml-ai-message-content"><div class="ml-ai-info-item"><span class="ml-ai-label">상태</span><span class="ml-ai-value" style="color: #ff6b6b;">Zone 분석 실패</span></div></div>';
                        }
                    }
                } catch (error) {
                    console.error(`❌ Zone 분석 오류: ${cardId}`, error);
                    signalEl.textContent = 'ERROR';
                    signalEl.className = 'ml-ai-signal signal-zone';
                    messageEl.innerHTML = `<div class="ml-ai-message-content"><div class="ml-ai-info-item"><span class="ml-ai-label">오류</span><span class="ml-ai-value" style="color: #ff6b6b;">${error.message || 'Zone 분석 실패'}</span></div></div>`;
                }
                    
                // 가격 예측은 강화학습 AI가 표시하므로 여기서는 숨김
                if (predictionEl) {
                    predictionEl.style.display = 'none';
                }
                    
                    // Zone 정보를 카드에 저장 (서버에 업데이트 요청)
                    if (zone && rValue !== null && rValue !== undefined) {
                        try {
                            const updateResult = await API.put(`/cards/${cardId}`, {
                                zone: zone,
                                r_value: rValue,
                                ml_ai_zone: zone,
                                ml_ai_r_value: rValue,
                                basic_ai_zone: zone,
                                basic_ai_r_value: rValue,
                                recent_ml_ai_analysis: {
                                    zone: zone,
                                    r_value: rValue,
                                    zone_message: zoneMessage,
                                    timestamp: new Date().toISOString()
                                }
                            });
                            console.log(`✅ Zone 정보 저장 완료: ${cardId} (${zone}, r=${rValue})`);
                            
                            // 저장 성공 후 카드 데이터 새로고침하여 강화학습 AI에 반영
                            try {
                                const updatedCard = await cardAgent.getCardById(cardId);
                                if (updatedCard) {
                                    console.log(`✅ 카드 데이터 새로고침 완료: ${cardId}`);
                                }
                            } catch (refreshError) {
                                // 404 오류는 카드가 제거된 것으로 간주하고 조용히 처리
                                if (refreshError.status !== 404 && refreshError.statusCode !== 404) {
                                    console.warn(`⚠️ 카드 데이터 새로고침 실패: ${cardId}`, refreshError.message || refreshError);
                                }
                            }
                        } catch (error) {
                            console.error(`⚠️ Zone 정보 저장 실패: ${cardId}`, error);
                            // 저장 실패해도 UI는 업데이트됨
                        }
                    } else {
                        console.warn(`⚠️ Zone 분석 결과가 없어 저장하지 않음: ${cardId} (zone=${zone}, rValue=${rValue})`);
                    }
                } else {
                signalEl.textContent = 'ERROR';
                    messageEl.innerHTML = '<div class="ml-ai-message-content"><div class="ml-ai-info-item"><span class="ml-ai-label">오류</span><span class="ml-ai-value" style="color: #ff6b6b;">차트 데이터 없음</span></div></div>';
            }
        } catch (error) {
            console.error('ML AI 분석 실패:', error);
            const signalEl = document.getElementById(`ml-ai-signal-${cardId}`);
            const messageEl = document.getElementById(`ml-ai-message-${cardId}`);
            if (signalEl) signalEl.textContent = 'ERROR';
            if (messageEl) messageEl.textContent = 'AI 검증 오류: ' + error.message;
        }
    },
    
    /**
     * AI 분석 시작 (강화학습 AI) - 큐 시스템을 통한 순차 실행
     */
    async startAIAnalysis(cardId) {
        // 큐에 추가하여 순차 실행 보장
        RLAIAnalysisQueue.enqueue(cardId);
    },
    
    /**
     * AI 분석 실제 실행 (내부 함수, 큐에서 호출)
     */
    async _executeAIAnalysis(cardId) {
        try {
            // 프로그레스바 애니메이션
            const progressEl = document.getElementById(`rl-ai-progress-${cardId}`);
            const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
            const messageEl = document.getElementById(`rl-ai-message-${cardId}`);
            
            if (!progressEl || !statusEl || !messageEl) {
                console.warn(`강화학습 AI 분석 UI 요소를 찾을 수 없습니다: cardId=${cardId}`);
                return;
            }
            
            // 초기 상태 설정
            statusEl.textContent = '검증 중';
            // messageEl.innerHTML = '<div class="rl-ai-message-content"><div class="rl-ai-info-item"><span class="rl-ai-label">분석 상태</span><span class="rl-ai-value">AI 모델 실행 중</span></div></div>';
            
            // 프로그레스바 애니메이션 (0-90%, 실제 완료 시 100%)
            let progress = 0;
            const interval = setInterval(() => {
                progress += 0.5;
                if (progress > 90) progress = 90;  // 실제 완료 전까지는 90%까지만
                progressEl.style.width = `${progress}%`;
            }, 200);  // 200ms마다 0.5% 증가 (약 36초에 90% 도달)
            
            // AI 분석 요청 (타임아웃 240초)
            console.log(`🧠 강화학습 AI 분석 요청: cardId=${cardId}`);
            const analysisStartTime = Date.now();
            
            const result = await aiAgent.analyzeRL(cardId);
            
            const analysisDuration = (Date.now() - analysisStartTime) / 1000;
            console.log(`✅ 강화학습 AI 분석 완료: cardId=${cardId}, 소요 시간: ${analysisDuration.toFixed(2)}초`);
            
            clearInterval(interval);
            progressEl.style.width = '100%';
            
            if (result) {
                const action = result.action || result.action_name || 'HOLD';
                const message = result.message || '검증 완료';
                const reasoning = result.reasoning || '';
                const confidence = result.confidence || result.action_prob * 100 || 0;
                const analysisDetails = result.analysis_details || {};
                
                statusEl.textContent = action;
                statusEl.className = `rl-ai-status action-${action.toLowerCase()}`;
                    
                    // RL 점수 즉시 반영 (실시간 점수 차트 업데이트)
                    const rlScore = result.score !== undefined ? result.score : analysisDetails.score;
                    if (rlScore !== null && rlScore !== undefined) {
                        updateScoreHistory(cardId, rlScore);
                    }
                    
                // 간결한 분석 메시지 구성 (현재 카드 분석 정보만 표시)
                let messageHtml = '<div class="rl-ai-message-content">';
                messageHtml += `<div class="rl-ai-info-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);"><span class="rl-ai-label" style="font-weight: bold; color: #00d1ff;">📊 현재 카드 분석</span></div>`;
                
                // 현재가
                    if (analysisDetails.current_price !== null && analysisDetails.current_price !== undefined) {
                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">현재가</span><span class="rl-ai-value">${analysisDetails.current_price.toLocaleString()} KRW</span></div>`;
                    }
                    
                    // 보유 정보
                    if (analysisDetails.is_holding) {
                    const entryPrice = analysisDetails.entry_price || 0;
                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">상태</span><span class="rl-ai-value" style="color: #0ecb81;">보유 중</span></div>`;
                        if (analysisDetails.pnl_percent !== null && analysisDetails.pnl_percent !== undefined) {
                        const pnlColor = analysisDetails.pnl_percent >= 0 ? '#0ecb81' : '#ff6b6b';
                        const pnlSign = analysisDetails.pnl_percent >= 0 ? '+' : '';
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">손익률</span><span class="rl-ai-value" style="color: ${pnlColor};">${pnlSign}${analysisDetails.pnl_percent.toFixed(2)}%</span></div>`;
                        }
                    } else {
                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">상태</span><span class="rl-ai-value" style="color: #888;">미보유</span></div>`;
                }
                
                // 신뢰도
                if (confidence > 0) {
                    const confColor = confidence >= 70 ? '#0ecb81' : confidence >= 50 ? '#ffa500' : '#ff6b6b';
                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">신뢰도</span><span class="rl-ai-value" style="color: ${confColor};">${confidence.toFixed(1)}%</span></div>`;
                }
                
                // 예상 정보는 Zone 예측 섹션으로 이동 (제거)
                
                messageHtml += '</div>';
                
                messageEl.innerHTML = messageHtml;
                
                // Zone 예측 섹션 업데이트 (RL AI 예상 정보 통합)
                this.updateZonePredictionSection(cardId, analysisDetails).catch(error => {
                    console.error('Zone 예측 섹션 업데이트 실패:', error);
                });
                
                // 강화학습 AI 가격 예측 표시
                const predictionEl = document.getElementById(`ml-ai-prediction-${cardId}`);
                if (predictionEl) {
                    this.renderRLPricePrediction(cardId, result, analysisDetails, predictionEl).catch(error => {
                        console.error('가격 예측 차트 렌더링 실패:', error);
                    });
                }
                
                // 판정 결과를 한글로 변환
                let actionText = '';
                let reasonText = '';
                switch(action) {
                    case 'BUY':
                        actionText = '매수 판정';
                        reasonText = 'Base Model이 상승을 예측하거나 Policy Model이 매수 가치를 높게 평가';
                        break;
                    case 'SELL':
                        actionText = '매도 판정';
                        reasonText = '보유 중이며 Base Model이 하락을 예측하거나 Policy Model이 매도 가치를 높게 평가';
                        break;
                    case 'HOLD':
                        actionText = '대기 판정';
                        reasonText = '현재 시장 상황을 관찰 중이며 매수/매도 신호 대기';
                        break;
                    case 'DELETE':
                        actionText = '제거 판정';
                        reasonText = '카드 점수가 낮거나 성능이 저조';
                        break;
                    case 'FREEZE':
                        actionText = '동결 판정';
                        reasonText = '일시적으로 거래 중단 필요';
                        break;
                    default:
                        actionText = `${action} 판정`;
                        reasonText = 'AI 분석 결과에 따른 판정';
                }
                statusEl.textContent = actionText;
                
                // 판정 이유 표시
                const reasonEl = document.getElementById(`rl-ai-reason-${cardId}`);
                if (reasonEl) {
                    reasonEl.textContent = reasonText;
                }
                
                // 행동 버튼 활성화
                const actionButtons = document.querySelectorAll(`#rl-ai-${cardId} .rl-action-btn`);
                actionButtons.forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.id.includes(action)) {
                        btn.classList.add('active');
                    }
                });
                
                // 5단계: 판정 (실행하지 않고 판정만 표시)
                console.log(`✅ AI 분석 완료: ${cardId}, 판정: ${action}, 확률: ${confidence.toFixed(1)}%`);
                
                // 판정 결정 (buy/sell/fail/waiting)
                let judgment = 'waiting';
                let judgmentText = '대기';
                
                if (action === 'BUY' && !analysisDetails.is_holding) {
                    judgment = 'buy';
                    judgmentText = '매수 판정';
                    console.log(`🔔 판정: ${cardId} -> BUY (실행하지 않음, 판정만)`);
                    
                    // 매수 판정: step-3(매수) 완료, step-5(판정) 활성화
                    const step3El = document.getElementById(`step-3-${cardId}`);
                    if (step3El) {
                        step3El.classList.add('completed');
                        step3El.classList.remove('active');
                    }
                    
                } else if (action === 'SELL') {
                    // 매도 판정은 매수 완료 후에만 가능
                    if (analysisDetails.is_holding) {
                        // 매수 완료 후 매도 판정
                        judgment = 'sell';
                        judgmentText = '매도 판정';
                        console.log(`🔔 판정: ${cardId} -> SELL (실행하지 않음, 판정만)`);
                        
                        // 매도 판정: step-3(매수) 완료, step-4(매도) 완료, step-5(판정) 활성화
                        const step3El = document.getElementById(`step-3-${cardId}`);
                        const step4El = document.getElementById(`step-4-${cardId}`);
                        if (step3El) {
                            step3El.classList.add('completed');
                            step3El.classList.remove('active');
                        }
                        if (step4El) {
                            step4El.classList.add('completed');
                            step4El.classList.remove('active');
                        }
                    } else {
                        // 매수 이전에 매도 판정이 나오면 실패
                        judgment = 'fail';
                        judgmentText = '실패 판정 (매수 이전 매도)';
                        console.log(`❌ 판정: ${cardId} -> FAIL (매수 이전에 매도 판정 발생)`);
                        
                        // 실패 판정: 매수 이전에 실패하므로 step-3(매수) 건너뛰고 step-5(판정) 활성화
                        const step3El = document.getElementById(`step-3-${cardId}`);
                        if (step3El) {
                            step3El.classList.remove('active');
                            // 실패한 단계는 표시하지 않음 (건너뜀)
                        }
                    }
                    
                } else if (action === 'HOLD' || (action === 'HOLD' && !analysisDetails.is_holding)) {
                    judgment = 'waiting';
                    judgmentText = '대기 판정';
                    console.log(`⏸️ 판정: ${cardId} -> WAITING`);
                    
                    // 대기 판정: step-3(매수)는 활성 상태 유지, step-5(판정) 활성화
                    
                    // 대기 판정이 나온 카드는 예측 성공 여부와 관계없이 바로 제거
                    // 카드 데이터 확인 (로깅용)
                    let removeReason = '대기 판정';
                    
                    try {
                        const cardData = await cardAgent.getCardById(cardId);
                        if (!cardData) {
                            // 카드가 제거된 경우 함수 종료
                            console.log(`⏭️ 카드가 이미 제거되어 건너뜀: ${cardId}`);
                            return;
                        }
                        
                        const predictionVerified = cardData.prediction_verified === true;
                        const zoneCorrect = cardData.zone_prediction_correct === true;
                        const priceCorrect = cardData.price_prediction_correct === true;
                        const predictionSuccess = predictionVerified && (zoneCorrect || priceCorrect);
                        
                        // 매도 완료 여부 확인
                        const historyList = cardData.history_list || [];
                        const hasSold = historyList.some(hist => hist.type === 'SOLD');
                        
                        console.log(`🔍 대기 판정 카드 검사: ${cardId}`, {
                            predictionVerified,
                            zoneCorrect,
                            priceCorrect,
                            predictionSuccess,
                            hasSold
                        });
                        
                        // 예측 성공 여부와 관계없이 대기 판정이면 제거
                        if (predictionSuccess) {
                            removeReason = hasSold ? '대기 판정 (예측 성공, 매도 완료)' : '대기 판정 (예측 성공, 매도 미완료)';
                            console.log(`🗑️ 대기 판정 카드 자동 제거 (${removeReason}): ${cardId}`);
                        } else {
                            removeReason = '대기 판정 (예측 성공 없음)';
                            console.log(`🗑️ 대기 판정 카드 자동 제거 (${removeReason}): ${cardId}`);
                        }
                    } catch (error) {
                        console.error(`❌ 카드 데이터 확인 중 오류 발생, 기본적으로 제거: ${cardId}`, error);
                        // 오류 발생 시에도 기본 제거 이유 설정
                        removeReason = '대기 판정 (오류 발생)';
                    }
                    
                    // 제거 실행 (예측 성공 여부와 관계없이 무조건 제거)
                    console.log(`🗑️ 대기 판정 카드 자동 제거 (${removeReason}): ${cardId}`);
                    if (typeof startDeleteWithProgress === 'function') {
                        setTimeout(() => {
                            startDeleteWithProgress(cardId);
                        }, 1500);  // 1.5초 후 자동 실행
                    } else {
                        console.error(`❌ startDeleteWithProgress 함수를 찾을 수 없습니다: ${cardId}`);
                    }
                    
                } else if (action === 'DELETE' || action === 'FREEZE') {
                    judgment = 'fail';
                    judgmentText = '실패 판정';
                    console.log(`❌ 판정: ${cardId} -> FAIL (${action})`);
                    
                    // 실패 판정: 매수 이전에 실패하므로 step-3(매수) 건너뛰고 step-5(판정) 활성화
                    const step3El = document.getElementById(`step-3-${cardId}`);
                    if (step3El) {
                        step3El.classList.remove('active');
                        // 실패한 단계는 표시하지 않음 (건너뜀)
                    }
                }
                
                // 5단계 상태 업데이트
                const step5El = document.getElementById(`step-5-${cardId}`);
                if (step5El) {
                    step5El.classList.add('active');
                    
                    // 판정 결과 표시
                    const step5Label = step5El.querySelector('.step-label');
                    if (step5Label) {
                        step5Label.textContent = `판정: ${judgmentText}`;
                    }
                }
            } else {
                // result가 null이거나 에러인 경우 - fail 판정
                statusEl.textContent = '분석 실패';
                statusEl.className = 'rl-ai-status action-hold';
                
                // 5단계: fail 판정 표시
                const step5El = document.getElementById(`step-5-${cardId}`);
                if (step5El) {
                    step5El.classList.add('active');
                    
                    const step5Label = step5El.querySelector('.step-label');
                    if (step5Label) {
                        step5Label.textContent = '판정: 실패 판정';
                    }
                }
                
                // 실패 판정인 경우 6단계는 활성화하지 않음
                
                console.log(`❌ 판정: ${cardId} -> FAIL (분석 실패)`);
                
                if (result && result.error) {
                    // 에러 정보가 있는 경우
                    const errorMsg = result.message || 'AI 검증 실패';
                    messageEl.innerHTML = `
                        <div class="rl-ai-message-content">
                            <div class="rl-ai-info-item">
                                <span class="rl-ai-label">오류</span>
                                <span class="rl-ai-value" style="color: #ff6b6b;">${errorMsg}</span>
                            </div>
                        </div>
                    `;
                } else {
                    messageEl.innerHTML = `
                        <div class="rl-ai-message-content">
                            <div class="rl-ai-info-item">
                                <span class="rl-ai-label">상태</span>
                                <span class="rl-ai-value" style="color: #ff6b6b;">분석 실패</span>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error(`❌ 강화학습 AI 분석 실패: cardId=${cardId}`, error);
            
            // 에러 상태 표시
            const progressEl = document.getElementById(`rl-ai-progress-${cardId}`);
            const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
            const messageEl = document.getElementById(`rl-ai-message-${cardId}`);
            
            if (progressEl) progressEl.style.width = '0%';
            if (statusEl) {
                statusEl.textContent = '오류';
                statusEl.className = 'rl-ai-status action-hold';
            }
            
            // 5단계: fail 판정 표시
            const step5El = document.getElementById(`step-5-${cardId}`);
            if (step5El) {
                step5El.classList.add('active');
                
                const step5Label = step5El.querySelector('.step-label');
                if (step5Label) {
                    step5Label.textContent = '판정: 실패 판정';
                }
            }
            
            console.log(`❌ 판정: ${cardId} -> FAIL (예외 발생)`);
            
            if (messageEl) {
                let errorMsg = 'AI 검증 실패';
                if (error.message) {
                    if (error.message.includes('시간 초과') || error.message.includes('timeout')) {
                        errorMsg = '요청 시간 초과 (240초)';
                    } else {
                        errorMsg = error.message.length > 50 ? error.message.substring(0, 50) + '...' : error.message;
                    }
                }
                messageEl.innerHTML = `
                    <div class="rl-ai-message-content">
                        <div class="rl-ai-info-item">
                            <span class="rl-ai-label">오류</span>
                            <span class="rl-ai-value" style="color: #ff6b6b;">${errorMsg}</span>
                        </div>
                    </div>
                `;
            }
        }
    },
    
    /**
     * AI 분석 시작 (강화학습 AI) - 큐 시스템을 통한 순차 실행
     */
    async startAIAnalysis(cardId) {
        // 큐에 추가하여 순차 실행 보장
        RLAIAnalysisQueue.enqueue(cardId);
    },
    
    /**
     * AI 분석 실제 실행 (내부 함수, 큐에서 호출)
     */
    async _executeAIAnalysis(cardId) {
        try {
            // 프로그레스바 애니메이션
            const progressEl = document.getElementById(`rl-ai-progress-${cardId}`);
            const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
            const messageEl = document.getElementById(`rl-ai-message-${cardId}`);
            
            if (!progressEl || !statusEl || !messageEl) {
                console.warn(`강화학습 AI 분석 UI 요소를 찾을 수 없습니다: cardId=${cardId}`);
                return;
            }
            
            // 초기 상태 설정 - 상태 생성 단계
            statusEl.textContent = '상태 생성 중';
            statusEl.className = 'rl-ai-status';
            const reasonEl = document.getElementById(`rl-ai-reason-${cardId}`);
            if (reasonEl) {
                reasonEl.textContent = '카드 상태 정보 수집 중...';
            }
            messageEl.innerHTML = '<div class="rl-ai-message-content"><div class="rl-ai-info-item"><span class="rl-ai-label">분석 상태</span><span class="rl-ai-value">상태 생성 중</span></div></div>';
            
            // 단계 표시 업데이트
            const step1El = document.getElementById(`step-1-${cardId}`);
            if (step1El) step1El.classList.add('active');
            
            // 프로그레스바 애니메이션 (0-90%, 실제 완료 시 100%)
            let progress = 0;
            const interval = setInterval(() => {
                progress += 0.5;
                if (progress > 90) progress = 90;  // 실제 완료 전까지는 90%까지만
                progressEl.style.width = `${progress}%`;
            }, 200);  // 200ms마다 0.5% 증가 (약 36초에 90% 도달)
            
            // AI 분석 요청 (타임아웃 240초)
            console.log(`🧠 강화학습 AI 분석 요청: cardId=${cardId}`);
            const analysisStartTime = Date.now();
            
            // AI 분석 단계로 전환 (약간의 지연 후)
            setTimeout(() => {
                statusEl.textContent = 'AI 분석 중';
                if (reasonEl) {
                    reasonEl.textContent = 'Base Model, Emotion Model, Policy Model 실행 중...';
                }
                // messageEl.innerHTML = '<div class="rl-ai-message-content"><div class="rl-ai-info-item"><span class="rl-ai-label">분석 상태</span><span class="rl-ai-value">AI 모델 실행 중</span></div></div>';
                const step2El = document.getElementById(`step-2-${cardId}`);
                if (step2El) {
                    step2El.classList.add('active');
                    if (step1El) step1El.classList.add('completed');
                }
            }, 500);
            
            const result = await aiAgent.analyzeRL(cardId);
            
            const analysisDuration = (Date.now() - analysisStartTime) / 1000;
            console.log(`✅ 강화학습 AI 분석 완료: cardId=${cardId}, 소요 시간: ${analysisDuration.toFixed(2)}초`);
            
            clearInterval(interval);
            
            // 매수 단계로 전환
            const step3El = document.getElementById(`step-3-${cardId}`);
            if (step3El) {
                step3El.classList.add('active');
                const step2El = document.getElementById(`step-2-${cardId}`);
                if (step2El) step2El.classList.add('completed');
            }
            
            if (result) {
                // 분석 완료 후 검증 상태 확인하여 프로그레스바 업데이트
                // 카드 데이터 가져오기 (최신 데이터)
                try {
                    const cardData = await cardAgent.getCardById(cardId);
                    if (!cardData) {
                        // 카드가 제거된 경우 프로그레스바 숨기기
                        if (progressEl) {
                            progressEl.style.display = 'none';
                        }
                        return;
                    }
                    
                    const hasPrediction = cardData.predicted_next_zone || cardData.predicted_next_price;
                    const isVerified = cardData.prediction_verified === true;
                    
                    if (hasPrediction && !isVerified) {
                        // 분석 완료되었지만 검증이 안된 경우: 90%로 유지
                        progressEl.style.width = '90%';
                        progressEl.style.backgroundColor = '#ffa500';
                        progressEl.style.background = 'linear-gradient(90deg, #ffa500 0%, #ff8c00 100%)';
                        
                        // 상태 메시지 업데이트
                        if (statusEl.textContent !== '검증 대기 중') {
                            statusEl.textContent = '검증 대기 중';
                            statusEl.className = 'rl-ai-status action-hold';
                            statusEl.style.color = '#ffa500';
                        }
                    } else {
                        // 검증 완료 또는 예측이 없는 경우: 100%
                        progressEl.style.width = '100%';
                    }
                } catch (error) {
                    // 오류 발생 시: 100%로 설정
                    console.warn(`카드 데이터 가져오기 실패 (프로그레스바 업데이트): ${cardId}`, error);
                    if (progressEl) {
                        progressEl.style.width = '100%';
                    }
                }
                const action = result.action || result.action_name || 'HOLD';
                const message = result.message || '검증 완료';
                const reasoning = result.reasoning || '';
                const confidence = result.confidence || result.action_prob * 100 || 0;
                const analysisDetails = result.analysis_details || {};
                const actionProbs = result.action_probs || analysisDetails.action_probs || {};
                
                // 모든 액션 확률을 %로 변환
                const probBuy = (actionProbs.BUY || 0) * 100;
                const probSell = (actionProbs.SELL || 0) * 100;
                const probHold = (actionProbs.HOLD || 0) * 100;
                
                // 가장 높은 확률의 액션 찾기
                const allProbs = [
                    { name: 'BUY', prob: probBuy },
                    { name: 'SELL', prob: probSell },
                    { name: 'HOLD', prob: probHold }
                ];
                const highestProbAction = allProbs.reduce((max, curr) => curr.prob > max.prob ? curr : max, allProbs[0]);
                const highestProbActionText = highestProbAction.name === 'BUY' ? '매수 판정' : highestProbAction.name === 'SELL' ? '매도 판정' : '보유 판정';
                
                // reasoning에서 이미 표시된 정보 추적 (중복 방지)
                const displayedInfo = {
                    zone: false,
                    nbValue: false,
                    baseModel: false,
                    policyModel: false,
                    realtimeScore: false
                };
                
                // 상세 분석 메시지 구성 (검증 결과 중심)
                let messageHtml = '<div class="rl-ai-message-content">';
                
                // 검증 결과가 있으면 검증 결과를 우선 표시
                const cardData = await this.getCardData(cardId);
                if (cardData && cardData.prediction_verified) {
                    const zoneCorrect = cardData.zone_prediction_correct || false;
                    const priceCorrect = cardData.price_prediction_correct || false;
                    const priceErrorPercent = cardData.prediction_price_error_percent || 0;
                    const actualZone = cardData.prediction_actual_zone || null;
                    const actualPrice = cardData.prediction_actual_price || 0;
                    
                    messageHtml += `<div class="rl-ai-info-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);"><span class="rl-ai-label" style="font-weight: bold; color: #00d1ff;">✅ 검증 완료</span></div>`;
                    
                    // Zone 검증 결과
                    const zoneEmoji = zoneCorrect ? '✅' : '❌';
                    const zoneColor = zoneCorrect ? '#0ecb81' : '#f6465d';
                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">Zone 검증</span><span class="rl-ai-value" style="color: ${zoneColor}; font-weight: bold;">${zoneEmoji} ${zoneCorrect ? '정확' : '실패'} ${actualZone ? `(${actualZone})` : ''}</span></div>`;
                    
                    // 가격 검증 결과
                    if (actualPrice > 0) {
                        const priceEmoji = priceCorrect ? '✅' : '❌';
                        const priceColor = priceCorrect ? '#0ecb81' : '#f6465d';
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">가격 검증</span><span class="rl-ai-value" style="color: ${priceColor}; font-weight: bold;">${priceEmoji} ${priceCorrect ? '정확' : '실패'} (오차율: ${priceErrorPercent.toFixed(2)}%)</span></div>`;
                    }
                    
                    messageHtml += `<div class="rl-ai-info-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);"><span class="rl-ai-label" style="font-weight: bold; color: #00d1ff;">🧠 현재 판정</span></div>`;
                    
                    // 검증 완료 + 매수 판정인 경우 매도 대기 상태로 전환
                    if (action === 'BUY') {
                        // 매수 히스토리 확인
                        const historyList = cardData.history_list || [];
                        const hasBuyHistory = historyList.some(h => h.type === 'BUY' || h.type === 'NEW');
                        
                        // 매수 판정을 받았으면 매도 대기 상태로 전환 (매수 실행 여부와 관계없이)
                        try {
                            // 매도 대기 상태 설정 (서버에 저장)
                            await API.updateCard(cardId, {
                                waiting_sell: true,
                                sell_waiting_status: 'ready',
                                sell_waiting_reason: '검증 완료 및 매수 판정'
                            });
                            
                            // 상태 메시지 업데이트
                            if (statusEl) {
                                statusEl.textContent = '매도 대기 중';
                                statusEl.className = 'rl-ai-status action-sell';
                                statusEl.style.color = '#ffa500';
                            }
                            
                            // step-4(매도) 활성화
                            const step4El = document.getElementById(`step-4-${cardId}`);
                            if (step4El) {
                                step4El.classList.add('active');
                                const step4Label = step4El.querySelector('.step-label');
                                if (step4Label) {
                                    step4Label.textContent = hasBuyHistory ? '매도 대기' : '매도 대기 (매수 대기 중)';
                                }
                            }
                            
                            console.log(`✅ 매도 대기 상태로 전환: ${cardId} (검증 완료 + 매수 판정${hasBuyHistory ? ' + 매수 완료' : ''})`);
                            
                            // 매도 대기 메시지 추가
                            const waitingReason = hasBuyHistory ? '매도 신호 대기' : '매수 완료 후 매도 신호 대기';
                            messageHtml += `<div class="rl-ai-info-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,165,0,0.3);"><span class="rl-ai-label" style="font-weight: bold; color: #ffa500;">⏳ 매도 대기 중</span><span class="rl-ai-value" style="color: #ffa500;">${waitingReason}</span></div>`;
                        } catch (error) {
                            console.error(`매도 대기 상태 설정 실패: ${cardId}`, error);
                        }
                    }
                }
                
                // 검증 신호 (모든 확률 표시)
                messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">🧠 강화학습 AI 검증</span><span class="rl-ai-value" style="color: ${action === 'BUY' ? '#0ecb81' : action === 'SELL' ? '#f6465d' : '#888'};">${action} (확률: ${confidence.toFixed(1)}%, Q값: ${analysisDetails.q_value?.toFixed(4) || '0.0000'})</span></div>`;
                
                // 모든 액션 확률 표시
                messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📊 액션 확률</span><span class="rl-ai-value">BUY: ${probBuy.toFixed(1)}%, SELL: ${probSell.toFixed(1)}%, HOLD: ${probHold.toFixed(1)}%</span></div>`;
                
                // 판단 근거 (가장 높은 확률의 AI 판정 표시)
                messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 판단 근거</span><span class="rl-ai-value">${highestProbActionText} (신뢰도: ${highestProbAction.prob.toFixed(1)}%)</span></div>`;
                
                // 판단 근거
                if (reasoning) {
                    // reasoning을 파싱하여 각 항목을 한 줄씩 표시
                    const reasoningParts = reasoning.split(' | ');
                    reasoningParts.forEach(part => {
                        if (part.trim()) {
                            // 이모지가 있는 경우 (예: "🟠 Zone: ORANGE (하락 구역, r값: 0.8973)")
                            const emojiMatch = part.match(/^([^\s:]+)\s*(.+)$/);
                            if (emojiMatch && /[\u{1F300}-\u{1F9FF}]/u.test(emojiMatch[1])) {
                                const icon = emojiMatch[1];
                                const text = emojiMatch[2];
                                
                                // Zone 정보 추적
                                if (icon === '🟠' || icon === '🔵') {
                                    displayedInfo.zone = true;
                                }
                                // N/B 값 추적
                                if (icon === '📉' && text.includes('N/B 값')) {
                                    displayedInfo.nbValue = true;
                                }
                                // Base Model 추적
                                if (icon === '🤖' && text.includes('Base Model')) {
                                    displayedInfo.baseModel = true;
                                }
                                // Policy Model 추적
                                if (icon === '🎯' && text.includes('Policy Model')) {
                                    displayedInfo.policyModel = true;
                                }
                                // 실시간 점수 차트 추적
                                if (icon === '📊' && text.includes('실시간 점수 차트')) {
                                    displayedInfo.realtimeScore = true;
                                }
                                
                                // 라벨과 값 분리 (예: "Zone: ORANGE (하락 구역, r값: 0.8973)" -> "Zone" / "ORANGE (하락 구역, r값: 0.8973)")
                                const colonMatch = text.match(/^([^:]+):\s*(.+)$/);
                                if (colonMatch) {
                                    const label = colonMatch[1];
                                    const value = colonMatch[2];
                                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">${icon} ${label}</span><span class="rl-ai-value">${value}</span></div>`;
                                } else {
                                    messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">${icon}</span><span class="rl-ai-value">${text}</span></div>`;
                                }
                            } else {
                                // 이모지가 없는 경우
                                // "매수 판정", "매도 판정", "보유 판정" 같은 판단 근거는 이미 위에서 표시했으므로 건너뛰기
                                if (part.includes('매수 판정') || part.includes('매도 판정') || part.includes('보유 판정') || 
                                    part.includes('판정') && (part.includes('신뢰도') || part.includes('확률'))) {
                                    // 판단 근거 항목은 건너뛰기 (이미 위에서 표시함)
                                    return;
                                }
                                
                                // 확률을 %로 변환 (0.8462 -> 84.6%)
                                let processedPart = part;
                                // 0.0~1.0 범위의 확률을 %로 변환
                                processedPart = processedPart.replace(/(신뢰도|확률|confidence|prob)[:\s]*([0-9]+\.[0-9]+)/gi, (match, label, value) => {
                                    const numValue = parseFloat(value);
                                    if (numValue >= 0 && numValue <= 1) {
                                        return `${label}: ${(numValue * 100).toFixed(1)}%`;
                                    }
                                    return match;
                                });
                                // 기타 정보는 일반 항목으로 표시 (판단 근거 라벨 없이)
                                messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">•</span><span class="rl-ai-value">${processedPart}</span></div>`;
                            }
                        }
                    });
                }
                
                // 분석 상세 정보 (reasoning에서 표시되지 않은 정보만 추가)
                if (Object.keys(analysisDetails).length > 0) {
                    // N/B MAX, MIN (reasoning에 없으므로 항상 표시)
                    if (analysisDetails.nb_max !== null && analysisDetails.nb_max !== undefined) {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• N/B MAX</span><span class="rl-ai-value">${analysisDetails.nb_max.toFixed(10)}</span></div>`;
                    }
                    
                    if (analysisDetails.nb_min !== null && analysisDetails.nb_min !== undefined) {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• N/B MIN</span><span class="rl-ai-value">${analysisDetails.nb_min.toFixed(10)}</span></div>`;
                    }
                    
                    // 점수
                    if (analysisDetails.score !== null && analysisDetails.score !== undefined) {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• 점수</span><span class="rl-ai-value">${analysisDetails.score.toFixed(2)}</span></div>`;
                    }
                    
                    // 현재가
                    if (analysisDetails.current_price !== null && analysisDetails.current_price !== undefined) {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• 현재가</span><span class="rl-ai-value">${analysisDetails.current_price.toLocaleString()} KRW</span></div>`;
                    }
                    
                    // 보유 정보
                    if (analysisDetails.is_holding) {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• 💰 보유 중</span><span class="rl-ai-value">진입가 ${analysisDetails.entry_price?.toLocaleString() || 0} KRW</span></div>`;
                        if (analysisDetails.pnl_percent !== null && analysisDetails.pnl_percent !== undefined) {
                            const pnlIcon = analysisDetails.pnl_percent >= 0 ? '📈' : '📉';
                            const pnlColor = analysisDetails.pnl_percent >= 0 ? '#0ecb81' : '#f6465d';
                            messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• ${pnlIcon} 손익률</span><span class="rl-ai-value" style="color: ${pnlColor};">${analysisDetails.pnl_percent >= 0 ? '+' : ''}${analysisDetails.pnl_percent.toFixed(2)}%</span></div>`;
                        }
                    } else {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• 💰 보유 중</span><span class="rl-ai-value">진입가 0 KRW</span></div>`;
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• 📈 손익률</span><span class="rl-ai-value">+0.00%</span></div>`;
                    }
                    
                    // 히스토리
                    if (analysisDetails.history_count !== null && analysisDetails.history_count !== undefined) {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">• 히스토리</span><span class="rl-ai-value">${analysisDetails.history_count}개</span></div>`;
                    }
                    
                    // Base Model 출력 (reasoning에 없을 때만 표시)
                    if (!displayedInfo.baseModel && analysisDetails.base_output) {
                        const baseOutput = analysisDetails.base_output;
                        if (baseOutput.signal) {
                            messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">🔵 Base Model: 신호</span><span class="rl-ai-value">${baseOutput.signal}</span></div>`;
                        }
                    }
                    
                    // Policy Model 탐험 모드 (reasoning에 없을 때만 표시)
                    if (!displayedInfo.policyModel && analysisDetails.exploration !== null && analysisDetails.exploration !== undefined) {
                        const exploreIcon = analysisDetails.exploration ? '🔍' : '✅';
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">🎯 Policy Model: 탐험 모드</span><span class="rl-ai-value">${exploreIcon} ${analysisDetails.exploration ? 'ON (새로운 행동 탐색)' : 'OFF (학습된 정책 사용)'}</span></div>`;
                    }
                    
                    // 판정 요약
                    if (action === 'BUY') {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 판정</span><span class="rl-ai-value">매수 신호</span></div>`;
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 이유</span><span class="rl-ai-value">Base Model이 상승을 예측하거나 Policy Model이 매수 가치를 높게 평가</span></div>`;
                    } else if (action === 'SELL') {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 판정</span><span class="rl-ai-value">매도 신호</span></div>`;
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 이유</span><span class="rl-ai-value">보유 중이며 Base Model이 하락을 예측하거나 Policy Model이 매도 가치를 높게 평가</span></div>`;
                    } else if (action === 'HOLD') {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 판정</span><span class="rl-ai-value">대기 신호</span></div>`;
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 이유</span><span class="rl-ai-value">현재 시장 상황을 관찰 중이며 매수/매도 신호 대기</span></div>`;
                    } else if (action === 'DELETE') {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 판정</span><span class="rl-ai-value">제거 신호</span></div>`;
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 이유</span><span class="rl-ai-value">카드 점수가 낮거나 성능이 저조</span></div>`;
                    } else if (action === 'FREEZE') {
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 판정</span><span class="rl-ai-value">동결 신호</span></div>`;
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📋 이유</span><span class="rl-ai-value">일시적으로 거래 중단 필요</span></div>`;
                    }
                    
                    // 예상 시간, 예상 손익률, 예상 가격, 검증 확률은 Zone 예측 섹션으로 이동 (제거)
                }
                
                messageHtml += '</div>';
                messageEl.innerHTML = messageHtml;
                
                // Zone 예측 섹션 업데이트 (RL AI 예상 정보 통합 및 검증 결과 확인)
                this.updateZonePredictionSectionWithVerification(cardId, analysisDetails).catch(error => {
                    console.error('Zone 예측 섹션 업데이트 실패:', error);
                });
                
                // 판정 결과를 한글로 변환
                let actionText = '';
                let reasonText = '';
                switch(action) {
                    case 'BUY':
                        actionText = '매수 판정';
                        reasonText = 'Base Model이 상승을 예측하거나 Policy Model이 매수 가치를 높게 평가';
                        break;
                    case 'SELL':
                        actionText = '매도 판정';
                        reasonText = '보유 중이며 Base Model이 하락을 예측하거나 Policy Model이 매도 가치를 높게 평가';
                        break;
                    case 'HOLD':
                        actionText = '대기 판정';
                        reasonText = '현재 시장 상황을 관찰 중이며 매수/매도 신호 대기';
                        break;
                    case 'DELETE':
                        actionText = '제거 판정';
                        reasonText = '카드 점수가 낮거나 성능이 저조';
                        break;
                    case 'FREEZE':
                        actionText = '동결 판정';
                        reasonText = '일시적으로 거래 중단 필요';
                        break;
                    default:
                        actionText = `${action} 판정`;
                        reasonText = 'AI 분석 결과에 따른 판정';
                }
                statusEl.textContent = actionText;
                
                // 판정 이유 표시
                const reasonEl = document.getElementById(`rl-ai-reason-${cardId}`);
                if (reasonEl) {
                    reasonEl.textContent = reasonText;
                }
                
                // 행동 버튼 활성화
                const actionButtons = document.querySelectorAll(`#rl-ai-${cardId} .rl-action-btn`);
                actionButtons.forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.id.includes(action)) {
                        btn.classList.add('active');
                    }
                });
                
                // 5단계: 판정 (실행하지 않고 판정만 표시)
                console.log(`✅ AI 분석 완료: ${cardId}, 판정: ${action}, 확률: ${confidence.toFixed(1)}%`);
                
                // 판정 결정 (buy/sell/fail/waiting)
                let judgment = 'waiting';
                let judgmentText = '대기';
                
                if (action === 'BUY' && !analysisDetails.is_holding) {
                    judgment = 'buy';
                    judgmentText = '매수 판정';
                    console.log(`🔔 판정: ${cardId} -> BUY (실행하지 않음, 판정만)`);
                    
                    // 매수 판정: step-3(매수) 완료, step-5(판정) 활성화
                    const step3El = document.getElementById(`step-3-${cardId}`);
                    if (step3El) {
                        step3El.classList.add('completed');
                        step3El.classList.remove('active');
                    }
                    
                } else if (action === 'SELL') {
                    // 매도 판정은 매수 완료 후에만 가능
                    if (analysisDetails.is_holding) {
                        // 매수 완료 후 매도 판정
                        judgment = 'sell';
                        judgmentText = '매도 판정';
                        console.log(`🔔 판정: ${cardId} -> SELL (실행하지 않음, 판정만)`);
                        
                        // 매도 판정: step-3(매수) 완료, step-4(매도) 완료, step-5(판정) 활성화
                        const step3El = document.getElementById(`step-3-${cardId}`);
                        const step4El = document.getElementById(`step-4-${cardId}`);
                        if (step3El) {
                            step3El.classList.add('completed');
                            step3El.classList.remove('active');
                        }
                        if (step4El) {
                            step4El.classList.add('completed');
                            step4El.classList.remove('active');
                        }
                    } else {
                        // 매수 이전에 매도 판정이 나오면 실패
                        judgment = 'fail';
                        judgmentText = '실패 판정 (매수 이전 매도)';
                        console.log(`❌ 판정: ${cardId} -> FAIL (매수 이전에 매도 판정 발생)`);
                        
                        // 실패 판정: 매수 이전에 실패하므로 step-3(매수) 건너뛰고 step-5(판정) 활성화
                        const step3El = document.getElementById(`step-3-${cardId}`);
                        if (step3El) {
                            step3El.classList.remove('active');
                            // 실패한 단계는 표시하지 않음 (건너뜀)
                        }
                    }
                    
                } else if (action === 'HOLD' || (action === 'HOLD' && !analysisDetails.is_holding)) {
                    judgment = 'waiting';
                    judgmentText = '대기 판정';
                    console.log(`⏸️ 판정: ${cardId} -> WAITING`);
                    
                    // 대기 판정: step-3(매수)는 활성 상태 유지, step-5(판정) 활성화
                    
                    // 대기 판정이 나온 카드는 예측 성공 여부와 관계없이 바로 제거
                    // 카드 데이터 확인 (로깅용)
                    let removeReason = '대기 판정';
                    
                    try {
                        const cardData = await cardAgent.getCardById(cardId);
                        if (!cardData) {
                            // 카드가 제거된 경우 함수 종료
                            console.log(`⏭️ 카드가 이미 제거되어 건너뜀: ${cardId}`);
                            return;
                        }
                        
                        const predictionVerified = cardData.prediction_verified === true;
                        const zoneCorrect = cardData.zone_prediction_correct === true;
                        const priceCorrect = cardData.price_prediction_correct === true;
                        const predictionSuccess = predictionVerified && (zoneCorrect || priceCorrect);
                        
                        // 매도 완료 여부 확인
                        const historyList = cardData.history_list || [];
                        const hasSold = historyList.some(hist => hist.type === 'SOLD');
                        
                        console.log(`🔍 대기 판정 카드 검사: ${cardId}`, {
                            predictionVerified,
                            zoneCorrect,
                            priceCorrect,
                            predictionSuccess,
                            hasSold
                        });
                        
                        // 예측 성공 여부와 관계없이 대기 판정이면 제거
                        if (predictionSuccess) {
                            removeReason = hasSold ? '대기 판정 (예측 성공, 매도 완료)' : '대기 판정 (예측 성공, 매도 미완료)';
                            console.log(`🗑️ 대기 판정 카드 자동 제거 (${removeReason}): ${cardId}`);
                        } else {
                            removeReason = '대기 판정 (예측 성공 없음)';
                            console.log(`🗑️ 대기 판정 카드 자동 제거 (${removeReason}): ${cardId}`);
                        }
                    } catch (error) {
                        console.error(`❌ 카드 데이터 확인 중 오류 발생, 기본적으로 제거: ${cardId}`, error);
                        // 오류 발생 시에도 기본 제거 이유 설정
                        removeReason = '대기 판정 (오류 발생)';
                    }
                    
                    // 제거 실행 (예측 성공 여부와 관계없이 무조건 제거)
                    console.log(`🗑️ 대기 판정 카드 자동 제거 (${removeReason}): ${cardId}`);
                    if (typeof startDeleteWithProgress === 'function') {
                        setTimeout(() => {
                            startDeleteWithProgress(cardId);
                        }, 1500);  // 1.5초 후 자동 실행
                    } else {
                        console.error(`❌ startDeleteWithProgress 함수를 찾을 수 없습니다: ${cardId}`);
                    }
                    
                } else if (action === 'DELETE' || action === 'FREEZE') {
                    judgment = 'fail';
                    judgmentText = '실패 판정';
                    console.log(`❌ 판정: ${cardId} -> FAIL (${action})`);
                    
                    // 실패 판정: 매수 이전에 실패하므로 step-3(매수) 건너뛰고 step-5(판정) 활성화
                    const step3El = document.getElementById(`step-3-${cardId}`);
                    if (step3El) {
                        step3El.classList.remove('active');
                        // 실패한 단계는 표시하지 않음 (건너뜀)
                    }
                }
                
                // 5단계 상태 업데이트
                const step5El = document.getElementById(`step-5-${cardId}`);
                if (step5El) {
                    step5El.classList.add('active');
                    
                    // 판정 결과 표시
                    const step5Label = step5El.querySelector('.step-label');
                    if (step5Label) {
                        step5Label.textContent = `판정: ${judgmentText}`;
                    }
                }
                
                // 6단계 활성화 (판정 완료 후 검증 완료 단계)
                // 매수 판정 또는 매도 판정이 완료되면 6단계 활성화
                if (judgment === 'buy' || judgment === 'sell') {
                    const step6El = document.getElementById(`step-6-${cardId}`);
                    if (step6El) {
                        step6El.classList.add('active');
                        const step6Label = step6El.querySelector('.step-label');
                        if (step6Label) {
                            step6Label.textContent = '검증 완료';
                        }
                        // step-5 완료 표시
                        if (step5El) {
                            step5El.classList.add('completed');
                            step5El.classList.remove('active');
                        }
                        
                        // 7단계 활성화 (다음 카드 예측)
                        // 짧은 지연 후 step 7 활성화
                        setTimeout(() => {
                            const step7El = document.getElementById(`step-7-${cardId}`);
                            if (step7El) {
                                step7El.classList.add('active');
                                const step7Label = step7El.querySelector('.step-label');
                                if (step7Label) {
                                    step7Label.textContent = '다음 카드 예측';
                                }
                            }
                            
                            // 예측 카드 표시
                            const predictionCardsContainer = document.getElementById(`prediction-cards-${cardId}`);
                            if (predictionCardsContainer) {
                                predictionCardsContainer.style.display = 'block';
                                
                                // 기존 카드 정보 표시
                                const existingCardEl = document.getElementById(`existing-card-${cardId}`);
                                if (existingCardEl && cardData) {
                                    existingCardEl.innerHTML = `
                                        <div style="font-size: 12px; color: #0ecb81; font-weight: 600; margin-bottom: 8px;">📊 기존 카드</div>
                                        <div style="font-size: 11px; color: #c9d1d9;">가격: ${(cardData.current_price || cardData.price || 0).toLocaleString()}원</div>
                                        <div style="font-size: 11px; color: #c9d1d9;">생성: ${cardData.created_at ? new Date(cardData.created_at).toLocaleTimeString('ko-KR') : '-'}</div>
                                    `;
                                }
                                
                                // 예측 카드 1 정보 표시
                                if (result && result.predicted_next_price) {
                                    const predictionCard1El = document.getElementById(`prediction-card-1-${cardId}`);
                                    if (predictionCard1El) {
                                        // 예측 시간 계산 (초를 분으로 변환)
                                        const expectedTimeSeconds = result.expected_time_seconds || 300; // 기본값 5분
                                        const expectedTimeMinutes = Math.round(expectedTimeSeconds / 60);
                                        predictionCard1El.innerHTML = `
                                            <div style="font-size: 12px; color: #58a6ff; font-weight: 600; margin-bottom: 8px;">🔮 예측 카드 1</div>
                                            <div style="font-size: 11px; color: #c9d1d9;">예측가: ${(result.predicted_next_price || 0).toLocaleString()}원</div>
                                            <div style="font-size: 11px; color: #58a6ff;">신뢰도: ${(result.prediction_confidence * 100).toFixed(1)}%</div>
                                            <div style="font-size: 11px; color: #58a6ff;">⏱️ 예상 시간: ${expectedTimeMinutes}분</div>
                                        `;
                                    }
                                }
                                
                                // 예측 카드 2 정보 표시 (추가 예측)
                                const predictionCard2El = document.getElementById(`prediction-card-2-${cardId}`);
                                if (predictionCard2El) {
                                    if (result && result.predicted_next_price) {
                                        const variance = result.predicted_next_price * 0.02; // 2% 변동율 추정
                                        const predicted2 = result.predicted_next_price + variance;
                                        // 예측 시간 계산 (두 번째 카드는 더 늦음)
                                        const expectedTimeSeconds = result.expected_time_seconds || 300; // 기본값 5분
                                        const expectedTimeMinutes = Math.round(expectedTimeSeconds / 60);
                                        const delayedTimeMinutes = expectedTimeMinutes + 2; // 2분 추가
                                        predictionCard2El.innerHTML = `
                                            <div style="font-size: 12px; color: #ffa500; font-weight: 600; margin-bottom: 8px;">🔮 예측 카드 2</div>
                                            <div style="font-size: 11px; color: #c9d1d9;">예측가: ${(predicted2).toLocaleString()}원</div>
                                            <div style="font-size: 11px; color: #ffa500;">변동율: +2%</div>
                                            <div style="font-size: 11px; color: #ffa500;">⏱️ 예상 시간: ${delayedTimeMinutes}분</div>
                                        `;
                                    }
                                }
                            }
                            
                            // 예측 카드 정보 저장
                            if (result && result.predicted_next_price && cardData) {
                                const expectedTimeSeconds = result.expected_time_seconds || 300;
                                const expectedTimeMinutes = Math.round(expectedTimeSeconds / 60);
                                const variance = result.predicted_next_price * 0.02;
                                const predicted2 = result.predicted_next_price + variance;
                                
                                const predictionCardData = {
                                    card_id: cardId,
                                    original_price: cardData.current_price || cardData.price || 0,
                                    original_time: cardData.created_at || new Date().toISOString(),
                                    prediction_1: {
                                        price: result.predicted_next_price || 0,
                                        confidence: result.prediction_confidence || 0,
                                        expected_time_minutes: expectedTimeMinutes
                                    },
                                    prediction_2: {
                                        price: predicted2 || 0,
                                        variance_percent: 2,
                                        expected_time_minutes: expectedTimeMinutes + 2
                                    }
                                };
                                
                                // 저장
                                CardRenderer.savePredictionCard(predictionCardData);
                            }
                            
                            // step 6 완료 표시
                            if (step6El) {
                                step6El.classList.add('completed');
                                step6El.classList.remove('active');
                            }
                        }, 800);
                    }
                }
                
                // DELETE 판정은 판정만 표시 (실행하지 않음)
                if (action === 'DELETE') {
                    console.log(`❌ 판정: ${cardId} -> DELETE (실행하지 않음, 판정만)`);
                    if (typeof startDeleteWithProgress === 'function') {
                        setTimeout(() => {
                            startDeleteWithProgress(cardId);
                        }, 1500);  // 1.5초 후 자동 실행
                    }
                }
            } else {
                // result가 null이거나 에러인 경우
                statusEl.textContent = '분석 실패';
                if (result && result.error) {
                    // 에러 정보가 있는 경우
                    let errorMessage = result.message || '강화학습 AI 분석 실패';
                    if (result.errorDetails) {
                        errorMessage += `<br><small>${result.errorDetails}</small>`;
                    }
                    messageEl.innerHTML = errorMessage;
                } else {
                    messageEl.innerHTML = 'AI 분석 결과를 받을 수 없습니다.<br>서버 로그를 확인하세요.';
                }
            }
        } catch (error) {
            console.error(`❌ 강화학습 AI 분석 실패: cardId=${cardId}`, error);
            
            // 에러 상태 표시
            const progressEl = document.getElementById(`rl-ai-progress-${cardId}`);
            const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
            const messageEl = document.getElementById(`rl-ai-message-${cardId}`);
            
            if (progressEl) progressEl.style.width = '0%';
            if (statusEl) {
                statusEl.textContent = '오류';
                statusEl.className = 'rl-ai-status action-hold';
            }
            if (messageEl) {
                let errorMsg = 'AI 검증 실패';
                if (error.message) {
                    if (error.message.includes('시간 초과') || error.message.includes('timeout')) {
                        errorMsg = '요청 시간 초과 (240초)';
                    } else {
                        errorMsg = error.message.length > 50 ? error.message.substring(0, 50) + '...' : error.message;
                    }
                }
                messageEl.innerHTML = `
                    <div class="rl-ai-message-content">
                        <div class="rl-ai-info-item">
                            <span class="rl-ai-label">오류</span>
                            <span class="rl-ai-value" style="color: #ff6b6b;">${errorMsg}</span>
                        </div>
                    </div>
                `;
            }
        }
    },
    
    /**
     * 검증 카드 렌더링 (원본 PyQt6와 동일하게)
     */
    /**
     * 히스토리 카드 렌더링 (max, min 값만 표시)
     */
    renderHistoryCard(card) {
        if (!card) {
            console.warn('카드 데이터가 없습니다:', card);
            return null;
        }
        
        const decimalPlaces = Config.get('NB_DECIMAL_PLACES', 10);
        
        // max, min 값 가져오기
        let nbMax = card.nb_max;
        let nbMin = card.nb_min;
        
        // bit_max, bit_min이 있으면 변환
        if (card.bit_max !== undefined) {
            nbMax = card.bit_max / 10.0; // 0~1 범위로 정규화
        }
        if (card.bit_min !== undefined) {
            nbMin = card.bit_min / 10.0; // 0~1 범위로 정규화
        }
        
        // 값이 없으면 기본값 사용
        if (nbMax === undefined || nbMax === null) {
            nbMax = 0.55;
        }
        if (nbMin === undefined || nbMin === null) {
            nbMin = 0.55;
        }
        
        const cardEl = document.createElement('div');
        cardEl.className = 'card history-card';
        cardEl.id = `history-${card.card_id}`;
        cardEl.style.cursor = 'pointer';
        cardEl.style.padding = '15px';
        cardEl.style.border = '1px solid #333';
        cardEl.style.borderRadius = '8px';
        cardEl.style.marginBottom = '10px';
        cardEl.style.backgroundColor = '#1a1a1a';
        cardEl.style.transition = 'all 0.2s';
        
        // 호버 효과
        cardEl.addEventListener('mouseenter', () => {
            cardEl.style.backgroundColor = '#252525';
            cardEl.style.borderColor = '#0ecb81';
        });
        cardEl.addEventListener('mouseleave', () => {
            cardEl.style.backgroundColor = '#1a1a1a';
            cardEl.style.borderColor = '#333';
        });
        
        // 클릭 이벤트: N/B 값으로 조회
        cardEl.addEventListener('click', async () => {
            try {
                const nbValue = card.nb_value || 0.5;
                console.log(`🔍 히스토리 카드 클릭: N/B 값 ${nbValue}로 조회`);
                
                // N/B 값 조회
                const nbData = await nbAgent.getNB(nbValue);
                
                if (nbData) {
                    // 차트 업데이트를 위해 N/B 값 설정
                    const maxNbEl = document.getElementById('chart-max-nb');
                    const minNbEl = document.getElementById('chart-min-nb');
                    const nbValueEl = document.getElementById('chart-nb-value');
                    
                    if (maxNbEl && nbData.nb_max !== undefined) {
                        maxNbEl.textContent = (nbData.nb_max * 10).toFixed(decimalPlaces);
                    }
                    if (minNbEl && nbData.nb_min !== undefined) {
                        minNbEl.textContent = (nbData.nb_min * 10).toFixed(decimalPlaces);
                    }
                    if (nbValueEl && nbData.nb_value !== undefined) {
                        nbValueEl.textContent = nbData.nb_value.toFixed(decimalPlaces);
                    }
                    
                    // 차트 새로고침
                    if (typeof chartAgent !== 'undefined' && chartAgent.update) {
                        await chartAgent.update();
                    }
                    
                    // 생산 탭으로 전환
                    if (typeof switchTab === 'function') {
                        switchTab(0);
                    }
                    
                    showToast(`✅ N/B 값 ${nbValue.toFixed(decimalPlaces)} 조회 완료`, 'success');
                } else {
                    // N/B 값이 없으면 카드의 값으로 직접 설정
                    const maxNbEl = document.getElementById('chart-max-nb');
                    const minNbEl = document.getElementById('chart-min-nb');
                    const nbValueEl = document.getElementById('chart-nb-value');
                    
                    if (maxNbEl) {
                        maxNbEl.textContent = (nbMax * 10).toFixed(decimalPlaces);
                    }
                    if (minNbEl) {
                        minNbEl.textContent = (nbMin * 10).toFixed(decimalPlaces);
                    }
                    if (nbValueEl && card.nb_value !== undefined) {
                        nbValueEl.textContent = card.nb_value.toFixed(decimalPlaces);
                    }
                    
                    // 차트 새로고침
                    if (typeof chartAgent !== 'undefined' && chartAgent.update) {
                        await chartAgent.update();
                    }
                    
                    // 생산 탭으로 전환
                    if (typeof switchTab === 'function') {
                        switchTab(0);
                    }
                    
                    showToast(`✅ N/B 값 ${card.nb_value?.toFixed(decimalPlaces) || 'N/A'} 조회 완료`, 'success');
                }
            } catch (error) {
                console.error('N/B 값 조회 실패:', error);
                showToast('❌ N/B 값 조회 실패', 'error');
            }
        });
        
        // 카드 내용
        cardEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-size: 14px; color: #888; margin-bottom: 5px;">MAX / MIN</div>
                    <div style="font-size: 18px; font-weight: bold; color: #0ecb81;">
                        ${nbMax.toFixed(decimalPlaces)} / ${nbMin.toFixed(decimalPlaces)}
                    </div>
                </div>
                <div style="font-size: 12px; color: #666;">
                    ${card.card_id ? card.card_id.substring(0, 8) : 'N/A'}
                </div>
            </div>
        `;
        
        return cardEl;
    },
    
    renderVerificationCard(card) {
        if (!card || !card.nb_value) {
            console.warn('N/B 값이 없는 카드는 렌더링할 수 없습니다:', card);
            return null;
        }
        
        const cardEl = document.createElement('div');
        cardEl.className = 'card verification-card';
        cardEl.id = `verification-${card.card_id}`;
        
        const decimalPlaces = Config.get('NB_DECIMAL_PLACES', 10);
        const soldHistory = this.getLatestSoldHistory(card);
        
        if (!soldHistory) {
            console.warn('SOLD 히스토리가 없는 검증 카드:', card);
            return null;
        }
        
        // 검증 결과 계산
        const exitPrice = soldHistory.exit_price || 0;
        const entryPrice = soldHistory.entry_price || 0;
        const qty = soldHistory.qty || 0;
        const isSimulation = soldHistory.is_simulation || false;
        
        let pnlPercent = soldHistory.pnl_percent || 0;
        let pnlAmount = soldHistory.pnl_amount || 0;
        
        // pnl이 없으면 계산
        if ((pnlPercent === 0 && pnlAmount === 0) || (!pnlPercent && !pnlAmount)) {
            if (entryPrice > 0 && exitPrice > 0) {
                pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
                if (qty > 0) {
                    pnlAmount = (exitPrice - entryPrice) * qty;
                }
            }
        }
        
        // 검증 점수
        const verificationScore = card.verification_score || this.calculateLossRateScore(pnlPercent);
        const scoreColor = this.getScoreColor(verificationScore);
        
        // 검증 결과 텍스트
        let resultText = '';
        let resultColor = '#888888';
        const tradeType = isSimulation ? '🧪 모의 거래' : '💰 실제 거래';
        
        if (pnlAmount > 0) {
            resultText = `✅ 승리: +${pnlPercent.toFixed(2)}% (+${pnlAmount.toLocaleString()} KRW)`;
            resultColor = '#0ecb81';
        } else if (pnlAmount < 0) {
            resultText = `❌ 손실: ${pnlPercent.toFixed(2)}% (${pnlAmount.toLocaleString()} KRW)`;
            resultColor = '#f6465d';
        } else {
            resultText = `➖ 무승부: ${pnlPercent.toFixed(2)}%`;
            resultColor = '#888888';
        }
        
        // RL AI 행동 통계
        const actionStats = card.action_stats || this.calculateActionStats(card);
        
        // 생산 시간 포맷
        const productionTime = card.production_time ? new Date(card.production_time).toLocaleString('ko-KR') : '확인 불가';
        
        // 판정 시간 포맷
        const soldTime = soldHistory.timestamp ? new Date(soldHistory.timestamp).toLocaleString('ko-KR') : '';
        
        cardEl.innerHTML = `
            <div class="card-header">
                <div class="card-title">✅ 검증 완료</div>
                <div class="card-id">${card.card_id.split('_').pop()}</div>
            </div>
            
            <div class="verification-result-section">
                <div class="trade-type">${tradeType}</div>
                <div class="verification-result" style="color: ${resultColor};">${resultText}</div>
                <div class="verification-score" style="color: ${scoreColor};">📊 검증 점수: ${verificationScore.toFixed(1)}</div>
            </div>
            
            <div class="verification-details">
                <div class="detail-row">
                    <div class="detail-label">진입 가격:</div>
                    <div class="detail-value">${entryPrice.toLocaleString()} KRW</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">청산 가격:</div>
                    <div class="detail-value">${exitPrice.toLocaleString()} KRW</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">수량:</div>
                    <div class="detail-value">${qty.toFixed(8)} BTC</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">손익률:</div>
                    <div class="detail-value" style="color: ${pnlPercent >= 0 ? '#0ecb81' : '#f6465d'}">${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">손익 금액:</div>
                    <div class="detail-value" style="color: ${pnlAmount >= 0 ? '#0ecb81' : '#f6465d'}">${pnlAmount >= 0 ? '+' : ''}${pnlAmount.toLocaleString()} KRW</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">수수료:</div>
                    <div class="detail-value">${(soldHistory.fee_amount || 0).toLocaleString()} KRW</div>
                </div>
            </div>
            
            ${soldHistory.memo ? `<div class="verification-memo">📝 ${soldHistory.memo}</div>` : ''}
            ${soldTime ? `<div class="verification-time">판정 시간: ${soldTime}</div>` : ''}
            
            ${actionStats ? `
            <div class="action-stats-section">
                <div class="action-stats-title">📊 AI 판정 통계</div>
                <div class="action-stats-grid">
                    <div class="action-stat-item">
                        <div class="action-stat-label">BUY:</div>
                        <div class="action-stat-value" style="color: #0ecb81;">${actionStats.buy_count || 0}</div>
                    </div>
                    <div class="action-stat-item">
                        <div class="action-stat-label">SELL:</div>
                        <div class="action-stat-value" style="color: #f6465d;">${actionStats.sell_count || 0}</div>
                    </div>
                    <div class="action-stat-item">
                        <div class="action-stat-label">폐기:</div>
                        <div class="action-stat-value" style="color: #b0b0b0;">${actionStats.discard_count || 0}${actionStats.has_discard_decision ? ' (판정)' : actionStats.has_sell_decision ? ' (SELL)' : ''}</div>
                    </div>
                </div>
            </div>
            ` : ''}
            
            <div class="card-info">
                <div class="info-item">
                    <div class="info-label">타임프레임:</div>
                    <div class="info-value">${card.timeframe || '-'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">N/B 값:</div>
                    <div class="info-value nb-value">${card.nb_value?.toFixed(decimalPlaces) || '0'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">생산 시간:</div>
                    <div class="info-value">${productionTime}</div>
                </div>
            </div>
            
            <div class="verification-charts">
                <div class="chart-label">📈 매수 시점 가격 차트</div>
                <canvas id="verification-buy-chart-${card.card_id}" width="250" height="100"></canvas>
                <div class="chart-label">📉 매도 시점 가격 차트</div>
                <canvas id="verification-sell-chart-${card.card_id}" width="250" height="100"></canvas>
            </div>
        `;
        
        // 실시간 점수 차트 (있는 경우)
        const realtimeScores = card.realtime_scores || [];
        if (realtimeScores && realtimeScores.length > 1) {
            const scoreChartContainer = document.createElement('div');
            scoreChartContainer.className = 'verification-score-chart';
            scoreChartContainer.innerHTML = `
                <div class="chart-label">📈 실시간 점수 차트</div>
                <canvas id="verification-score-chart-${card.card_id}" width="250" height="100"></canvas>
            `;
            cardEl.appendChild(scoreChartContainer);
        }
        
        // 차트 렌더링 (비동기)
        setTimeout(() => {
            // 매수 시점 차트
            if (card.chart_data && card.chart_data.prices) {
                const buyCanvas = document.getElementById(`verification-buy-chart-${card.card_id}`);
                if (buyCanvas) {
                    const ctx = buyCanvas.getContext('2d');
                    const width = buyCanvas.width;
                    const height = buyCanvas.height;
                    ctx.clearRect(0, 0, width, height);
                    ctx.fillStyle = '#0a1a1a';
                    ctx.fillRect(0, 0, width, height);
                    
                    const prices = card.chart_data.prices;
                    if (prices && prices.length > 1) {
                        const minVal = Math.min(...prices);
                        const maxVal = Math.max(...prices);
                        const range = maxVal - minVal || 1;
                        const padding = 5;
                        const chartWidth = width - padding * 2;
                        const chartHeight = height - padding * 2;
                        
                        ctx.strokeStyle = '#0ecb81';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        for (let i = 0; i < prices.length; i++) {
                            const x = padding + (chartWidth / (prices.length - 1)) * i;
                            const normalizedVal = (prices[i] - minVal) / range;
                            const y = padding + chartHeight - (normalizedVal * chartHeight);
                            if (i === 0) {
                                ctx.moveTo(x, y);
                            } else {
                                ctx.lineTo(x, y);
                            }
                        }
                        ctx.stroke();
                    }
                }
            }
            
            // 매도 시점 차트
            if (exitPrice > 0) {
                const sellCanvas = document.getElementById(`verification-sell-chart-${card.card_id}`);
                if (sellCanvas) {
                    const buyPrices = card.chart_data?.prices || [];
                    const sellPrices = buyPrices.length >= 10 ? buyPrices.slice(-10) : buyPrices;
                    sellPrices.push(exitPrice);
                    
                    const ctx = sellCanvas.getContext('2d');
                    const width = sellCanvas.width;
                    const height = sellCanvas.height;
                    ctx.clearRect(0, 0, width, height);
                    ctx.fillStyle = '#0a1a1a';
                    ctx.fillRect(0, 0, width, height);
                    
                    if (sellPrices && sellPrices.length > 1) {
                        const minVal = Math.min(...sellPrices);
                        const maxVal = Math.max(...sellPrices);
                        const range = maxVal - minVal || 1;
                        const padding = 5;
                        const chartWidth = width - padding * 2;
                        const chartHeight = height - padding * 2;
                        
                        ctx.strokeStyle = '#f6465d';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        for (let i = 0; i < sellPrices.length; i++) {
                            const x = padding + (chartWidth / (sellPrices.length - 1)) * i;
                            const normalizedVal = (sellPrices[i] - minVal) / range;
                            const y = padding + chartHeight - (normalizedVal * chartHeight);
                            if (i === 0) {
                                ctx.moveTo(x, y);
                            } else {
                                ctx.lineTo(x, y);
                            }
                        }
                        ctx.stroke();
                    }
                }
            }
            
            // 실시간 점수 차트
            if (realtimeScores && realtimeScores.length > 1) {
                const scoreCanvas = document.getElementById(`verification-score-chart-${card.card_id}`);
                if (scoreCanvas) {
                    cardChartRenderer.renderChart(card.card_id, realtimeScores, 'score');
                }
            }
        }, 0);
        
        return cardEl;
    },
    
    /**
     * 손실률 기반 점수 계산
     */
    calculateLossRateScore(pnlPercent) {
        if (pnlPercent > 0) {
            return 50 + Math.min(pnlPercent * 2, 50);
        } else if (pnlPercent < 0) {
            return 50 + Math.max(pnlPercent * 2, -50);
        } else {
            return 50.0;
        }
    },
    
    /**
     * 점수에 따른 색상 반환
     */
    getScoreColor(score) {
        if (score >= 80) return '#0ecb81';  // 초록색 (우수)
        if (score >= 60) return '#00d1ff';  // 청록색 (양호)
        if (score >= 40) return '#ffa500';   // 주황색 (보통)
        return '#f6465d';  // 빨간색 (불량)
    },
    
    /**
     * AI 판정 횟수 통계 계산
     */
    calculateActionStats(card) {
        try {
            const historyList = card.history_list || [];
            
            let buyCount = 0;
            let sellCount = 0;
            let discardCount = 0;
            let hasDiscardDecision = false;
            let hasSellDecision = false;
            
            for (const hist of historyList) {
                const histType = hist.type || '';
                const memo = hist.memo || '';
                
                // BUY 횟수
                if (histType === 'NEW' || histType === 'BUY') {
                    buyCount++;
                }
                
                // SELL 판정과 폐기 판정 구분
                if (memo.includes('자동 폐기') && (memo.includes('FREEZE 판정') || memo.includes('DELETE 판정'))) {
                    hasDiscardDecision = true;
                } else if (memo.includes('자동 매도') && memo.includes('SELL 판정')) {
                    hasSellDecision = true;
                }
                
                // SOLD 히스토리 처리
                if (histType === 'SOLD') {
                    if (memo.includes('자동 폐기') && (memo.includes('FREEZE 판정') || memo.includes('DELETE 판정'))) {
                        discardCount = 1;
                    } else if (memo.includes('자동 매도') && memo.includes('SELL 판정')) {
                        sellCount++;
                    } else {
                        sellCount++;
                    }
                }
            }
            
            // 폐기 판정이 있지만 SOLD 히스토리가 없는 경우
            if (hasDiscardDecision && discardCount === 0) {
                for (const hist of historyList) {
                    const memo = hist.memo || '';
                    if (memo.includes('자동 폐기') && (memo.includes('FREEZE 판정') || memo.includes('DELETE 판정'))) {
                        discardCount = 1;
                        break;
                    }
                }
            }
            
            return {
                buy_count: buyCount,
                sell_count: sellCount,
                discard_count: discardCount,
                has_discard_decision: hasDiscardDecision,
                has_sell_decision: hasSellDecision
            };
        } catch (error) {
            console.error('판정 통계 계산 오류:', error);
            return {
                buy_count: 0,
                sell_count: 0,
                discard_count: 0,
                has_discard_decision: false,
                has_sell_decision: false
            };
        }
    },
    
    /**
     * 폐기 카드 렌더링
     */
    renderDiscardedCard(card) {
        const cardEl = document.createElement('div');
        cardEl.className = 'card discarded-card';
        cardEl.id = `discarded-${card.card_id}`;
        
        const decimalPlaces = Config.get('NB_DECIMAL_PLACES', 10);
        
        cardEl.innerHTML = `
            <div class="card-header">
                <div class="card-title">폐기 카드</div>
                <div class="discard-reason">${card.discard_reason || '알 수 없음'}</div>
            </div>
            <div class="card-info">
                <div class="info-item">
                    <div class="info-label">N/B 값</div>
                    <div class="info-value nb-value">${card.nb_value?.toFixed(decimalPlaces) || '0'}</div>
                </div>
            </div>
            <div class="card-actions">
                <button class="card-btn secondary" onclick="restoreCard('${card.card_id}')">복원</button>
            </div>
        `;
        
        return cardEl;
    },
    
    /**
     * 카드 목록 렌더링
     */
    async renderCardList(cards, containerId, type = 'production') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('❌ 컨테이너를 찾을 수 없습니다:', containerId);
            console.error('❌ DOM에서 확인:', document.querySelector(`#${containerId}`));
            return;
        }
        
        console.log(`🎴 ${type} 카드 렌더링 시작:`, cards?.length || 0, '개');
        console.log(`🎴 컨테이너 확인:`, container, 'ID:', containerId);
        
        if (!cards || cards.length === 0) {
            console.log(`⚠️ ${type} 카드가 없습니다. 컨테이너:`, containerId);
            console.log(`⚠️ API 응답 확인 필요 - 브라우저 콘솔의 "📦 production 카드 API 응답" 로그를 확인하세요.`);
            
            // API 직접 호출로 확인
            try {
                const directResponse = await fetch('/api/cards/production');
                const directData = await directResponse.json();
                console.log('📡 직접 API 호출 결과:', directData);
                console.log('📡 카드 수:', directData.count || directData.cards?.length || 0);
                
                if (directData.count > 0 || (directData.cards && directData.cards.length > 0)) {
                    container.innerHTML = `
                        <div style="color: #ff6b6b; text-align: center; padding: 20px; border: 2px solid #ff6b6b; border-radius: 8px; margin: 20px;">
                            <div style="font-size: 16px; margin-bottom: 10px;">⚠️ 카드 데이터 파싱 오류</div>
                            <div style="font-size: 12px; color: #888; margin-bottom: 10px;">
                                서버에는 ${directData.count || directData.cards?.length || 0}개의 카드가 있지만 표시되지 않습니다.
                            </div>
                            <div style="font-size: 11px; color: #666;">
                                브라우저 콘솔(F12)을 열어 "📦 production 카드 API 응답" 로그를 확인하세요.
                            </div>
                        </div>
                    `;
                } else {
                    container.innerHTML = `
                        <div style="color: #888; text-align: center; padding: 20px; border: 1px dashed #444; border-radius: 8px; margin: 20px;">
                            <div style="font-size: 16px; margin-bottom: 10px;">📭 카드가 없습니다</div>
                            <div style="font-size: 12px; color: #666; margin-bottom: 10px;">
                                서버에도 카드가 없습니다. (서버 응답: ${directData.count || 0}개)
                            </div>
                            <div style="font-size: 12px; color: #666;">
                                카드를 생산하려면 "카드 생산 시작" 버튼을 클릭하세요.
                            </div>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('❌ 직접 API 호출 실패:', error);
                container.innerHTML = `
                    <div style="color: #ff6b6b; text-align: center; padding: 20px; border: 2px solid #ff6b6b; border-radius: 8px; margin: 20px;">
                        <div style="font-size: 16px; margin-bottom: 10px;">❌ API 연결 오류</div>
                        <div style="font-size: 12px; color: #888;">
                            API 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.
                        </div>
                        <div style="font-size: 11px; color: #666; margin-top: 10px;">
                            오류: ${error.message}
                        </div>
                    </div>
                `;
            }
            return;
        }
        
        // 카드 데이터 검증 (card-agent에서 이미 검증했지만, 안전을 위해 다시 확인)
        // null/undefined만 필터링하고, card_id가 없어도 일단 렌더링 시도 (나중에 renderProductionCard에서 처리)
        const validCards = cards.filter(card => {
            if (!card) {
                console.warn('⚠️ null 또는 undefined 카드 발견');
                return false;
            }
            // card_id가 없어도 일단 통과 (renderProductionCard에서 처리)
            return true;
        });
        
        console.log(`✅ 유효한 카드: ${validCards.length}개 / 전체: ${cards.length}개`);
        
        if (validCards.length === 0) {
            console.error('❌ 유효한 카드가 없습니다');
            console.error('❌ 원본 카드 데이터:', cards);
            container.innerHTML = `
                <div style="color: #ff6b6b; text-align: center; padding: 20px; border: 2px solid #ff6b6b; border-radius: 8px; margin: 20px;">
                    <div style="font-size: 16px; margin-bottom: 10px;">❌ 유효한 카드가 없습니다</div>
                    <div style="font-size: 12px; color: #888;">카드 데이터에 문제가 있습니다. 브라우저 콘솔을 확인하세요.</div>
                </div>
            `;
            return;
        }
        
        // 생산 카드는 기존 카드 업데이트 방식 사용 (카드가 사라지지 않도록)
        if (type === 'production') {
            this.ensureProductionGridStyles();
            const sortedCards = this.sortProductionCards(validCards);
            console.log(`📋 정렬된 카드:`, sortedCards.length, '개');
            await this.updateProductionCards(sortedCards, container);
            // CSS Grid를 사용하므로 Masonry 레이아웃 불필요
            // await this.layoutMasonry(container);
            
            // 렌더링 확인
            const renderedCards = container.querySelectorAll('.production-card');
            console.log(`✅ 렌더링된 카드 수:`, renderedCards.length, '개');
            if (renderedCards.length === 0) {
                console.error('❌ 카드가 렌더링되지 않았습니다!');
                console.error('❌ 컨테이너:', container);
                console.error('❌ 컨테이너 ID:', container.id);
                console.error('❌ 컨테이너 클래스:', container.className);
                console.error('❌ 컨테이너 내용:', container.innerHTML.substring(0, 500));
                console.error('❌ 컨테이너 스타일:', window.getComputedStyle(container));
                
                // 에러 메시지 표시
                const errorMsg = document.createElement('div');
                errorMsg.style.cssText = 'color: #ff6b6b; text-align: center; padding: 20px; border: 2px solid #ff6b6b; border-radius: 8px; margin: 20px;';
                errorMsg.innerHTML = `
                    <div style="font-size: 16px; margin-bottom: 10px;">❌ 카드 렌더링 실패</div>
                    <div style="font-size: 12px; color: #888;">카드는 ${sortedCards.length}개 있지만 렌더링되지 않았습니다.</div>
                    <div style="font-size: 11px; color: #666; margin-top: 10px;">브라우저 콘솔을 확인하세요.</div>
                `;
                container.appendChild(errorMsg);
            }
        } else {
            // 다른 타입은 전체 재렌더링
            container.innerHTML = '';
            cards.forEach(card => {
                let cardEl = null;
                
                switch (type) {
                    case 'verification':
                        cardEl = this.renderVerificationCard(card);
                        break;
                    case 'discarded':
                        cardEl = this.renderDiscardedCard(card);
                        break;
                    case 'history':
                        // 히스토리 카드는 max, min 값으로 간단하게 표시
                        cardEl = this.renderHistoryCard(card);
                        break;
                }
                
                if (cardEl) {
                    container.appendChild(cardEl);
                }
            });
            
            // 히스토리 카드는 시간순 정렬
            if (type === 'history') {
                // 시간순 정렬 (최신순)
                const cardElements = Array.from(container.children);
                cardElements.sort((a, b) => {
                    const cardA = cards.find(c => {
                        const cardId = a.id.replace(/^(production-|verification-|discarded-|card-)/, '');
                        return c.card_id === cardId;
                    });
                    const cardB = cards.find(c => {
                        const cardId = b.id.replace(/^(production-|verification-|discarded-|card-)/, '');
                        return c.card_id === cardId;
                    });
                    
                    if (!cardA || !cardB) return 0;
                    
                    const timeA = new Date(cardA.created_at || 0).getTime();
                    const timeB = new Date(cardB.created_at || 0).getTime();
                    return timeB - timeA; // 최신순
                });
                
                // 정렬된 순서로 다시 추가
                cardElements.forEach(el => container.appendChild(el));
            }
            
            // 레이아웃 적용
            await this.layoutMasonry(container);
        }
    },
    
    /**
     * 생산 카드 정렬
     * 가장 최근 생산된 카드 순서로 정렬 (최신순)
     */
    sortProductionCards(cards = []) {
        if (!cards || cards.length === 0) return [];
        
        const parseTime = (c) => {
            const t = c.production_time || c.created_at;
            return t ? new Date(t).getTime() : 0;
        };
        
        // 최신순 정렬 (가장 최근 생산된 카드가 맨 앞)
        return [...cards].sort((a, b) => parseTime(b) - parseTime(a));
    },
    
    /**
     * 생산 카드 업데이트 (기존 카드 유지, 데이터만 갱신)
     */
    async updateProductionCards(cards, container) {
        console.log(`🔄 생산 카드 업데이트 시작:`, cards.length, '개');
        console.log(`🔄 컨테이너:`, container, 'ID:', container.id);
        
        const existingCardIds = new Set();
        const newCardIds = new Set(cards.map(c => c?.card_id).filter(id => id));
        
        // 기존 카드 ID 수집
        const existingCards = container.querySelectorAll('.production-card');
        console.log(`📋 기존 카드 수:`, existingCards.length, '개');
        existingCards.forEach(cardEl => {
            const cardId = cardEl.id.replace('card-', '');
            existingCardIds.add(cardId);
            
            // 새 카드 목록에 없으면 제거 (검증 완료된 카드)
            if (!newCardIds.has(cardId)) {
                console.log(`🗑️ 카드 제거:`, cardId);
                // 부드럽게 제거
                cardEl.style.opacity = '0';
                cardEl.style.transform = 'translateY(-20px)';
                setTimeout(() => {
                    if (cardEl.parentNode) {
                        cardEl.parentNode.removeChild(cardEl);
                    }
                }, 300);
            }
        });
        
        // 새 카드 추가 또는 기존 카드 업데이트
        let addedCount = 0;
        let updatedCount = 0;
        let failedCount = 0;
        
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            if (!card) {
                console.warn(`⚠️ null 또는 undefined 카드 건너뛰기`);
                failedCount++;
                continue;
            }
            
            const cardId = card.card_id;
            if (!cardId) {
                console.warn(`⚠️ card_id가 없는 카드 건너뛰기`);
                failedCount++;
                continue;
            }
            
            // 카드 존재 여부 확인 (404 오류 방지)
            try {
                const cardExists = await cardAgent.getCardById(cardId);
                if (!cardExists) {
                    // 카드가 제거된 경우 DOM에서도 제거
                    const existingCardEl = document.getElementById(`card-${cardId}`);
                    if (existingCardEl) {
                        existingCardEl.remove();
                        console.log(`🗑️ 제거된 카드 DOM 정리: ${cardId}`);
                    }
                    continue;
                }
            } catch (error) {
                // 404 오류는 카드가 제거된 것으로 간주
                if (error.status === 404 || error.statusCode === 404) {
                    const existingCardEl = document.getElementById(`card-${cardId}`);
                    if (existingCardEl) {
                        existingCardEl.remove();
                        console.log(`🗑️ 제거된 카드 DOM 정리: ${cardId}`);
                    }
                    continue;
                }
                // 다른 오류는 로그만 출력하고 계속 진행
                console.warn(`⚠️ 카드 존재 여부 확인 실패: ${cardId}`, error.message || error);
            }
            
            // renderProductionCard에서 card_id가 없으면 임시 ID 생성하므로 일단 렌더링 시도
            const cardEl = this.renderProductionCard(card);
            if (!cardEl) {
                console.error(`❌ 카드 렌더링 실패:`, card);
                failedCount++;
                continue;
            }
            
            const existingCardEl = document.getElementById(`card-${cardId}`);
            
            if (existingCardEl) {
                // 기존 카드 업데이트 (데이터만 갱신)
                console.log(`🔄 카드 업데이트:`, cardId);
                await this.updateProductionCardData(existingCardEl, card);
                // 프로그레스바 검증 상태 업데이트
                setTimeout(() => {
                    this.updateProgressBarForVerification(cardId, card);
                }, 100);
                updatedCount++;
            } else {
                // 새 카드 추가 (순차적 애니메이션)
                console.log(`➕ 새 카드 추가:`, cardId);
                container.appendChild(cardEl);
                addedCount++;
                console.log(`✅ 카드 추가 완료:`, cardId, '컨테이너 자식 수:', container.children.length);
                
                // 프로그레스바 검증 상태 업데이트 (렌더링 후)
                setTimeout(() => {
                    this.updateProgressBarForVerification(cardId, card);
                }, 200);
                
                // 강화학습 AI 분석만 실행 (Zone 분석은 생산 시 1번만 실행)
                setTimeout(async () => {
                    try {
                        await this.startAIAnalysis(cardId);
                    } catch (error) {
                        console.error(`❌ 카드 ${cardId} 강화학습 AI 분석 시작 실패:`, error);
                    }
                }, i * 500);  // 0.5초 간격
            }
        }
        
        console.log(`✅ 카드 업데이트 완료 - 추가: ${addedCount}, 업데이트: ${updatedCount}, 실패: ${failedCount}`);
        console.log(`✅ 최종 컨테이너 자식 수:`, container.children.length);
        
        // 카드 순서 재정렬 (최신 생산 순서)
        const sortedCardElements = Array.from(container.children).sort((a, b) => {
            const cardA = cards.find(c => c.card_id === a.id.replace('card-', ''));
            const cardB = cards.find(c => c.card_id === b.id.replace('card-', ''));
            if (!cardA || !cardB) return 0;
            
            const timeA = new Date(cardA.production_time || cardA.created_at || 0).getTime();
            const timeB = new Date(cardB.production_time || cardB.created_at || 0).getTime();
            return timeB - timeA; // 최신순
        });
        
        // DOM 순서 재정렬
        sortedCardElements.forEach((cardEl, index) => {
            if (cardEl.parentNode === container) {
                container.appendChild(cardEl);
            }
        });
        
        // 통계 업데이트
        this.updateProductionStats(cards);
        
        // 모든 카드에 대해 AI 분석 반복 실행 (기존 카드 포함, 주기적 업데이트)
        // 약간의 지연을 두어 DOM 업데이트가 완료된 후 실행
        setTimeout(async () => {
            await this.startSequentialAIAnalysis(cards);
            
            // 매수 판정이 나온 카드에 대해 매도 판정 확인 (실시간 손익률 모니터링)
            await this.checkSellDecisionForBuyCards(cards);
        }, 1000);
    },

    /**
     * Masonry 레이아웃 적용 (생산 카드)
     */
    async layoutMasonry(container) {
        try {
            await this.ensureMasonryLoaded();
            if (!container) return;
            
            if (!this._masonry || this._masonry.container !== container) {
                this._masonry = new Masonry(container, {
                    itemSelector: '.production-card',
                    columnWidth: '.production-card',
                    percentPosition: true,
                    transitionDuration: '0.3s',
                });
            } else {
                this._masonry.reloadItems();
                this._masonry.layout();
            }
        } catch (e) {
            console.warn('Masonry 레이아웃 초기화 실패:', e);
        }
    },
    
    async ensureMasonryLoaded() {
        if (window.Masonry) return;
        if (this._masonryLoading) {
            return this._masonryLoading;
        }
        this._masonryLoading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/masonry-layout@4/dist/masonry.pkgd.min.js';
            script.async = true;
            script.onload = () => resolve();
            script.onerror = (err) => reject(err);
            document.head.appendChild(script);
        });
        return this._masonryLoading;
    },

    /**
     * 생산 카드 그리드 스타일 (4열 기본, 태블릿 2열, 모바일 1열)
     */
    ensureProductionGridStyles() {
        if (document.getElementById('production-grid-styles')) return;
        const style = document.createElement('style');
        style.id = 'production-grid-styles';
        style.textContent = `
            #production-cards {
                position: relative;
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 20px;
                padding: 20px;
            }
            .production-card {
                width: 100%;
                margin-bottom: 0;
                background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%);
                border: 2px solid rgba(0, 209, 255, 0.2);
                border-radius: 16px;
                padding: 20px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3),
                            0 0 0 1px rgba(0, 209, 255, 0.1) inset,
                            0 4px 16px rgba(0, 209, 255, 0.1);
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }
            .production-card::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, #00d1ff, #0ecb81, #00d1ff);
                background-size: 200% 100%;
                animation: shimmer 3s infinite;
            }
            @keyframes shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
            }
            .production-card:hover {
                transform: translateY(-4px);
                border-color: rgba(0, 209, 255, 0.5);
                box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4),
                            0 0 0 1px rgba(0, 209, 255, 0.2) inset,
                            0 8px 24px rgba(0, 209, 255, 0.2);
            }
            .production-card .card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 2px solid rgba(0, 209, 255, 0.2);
            }
            .production-card .card-title {
                font-size: 18px;
                font-weight: 700;
                color: #00d1ff;
                text-shadow: 0 0 10px rgba(0, 209, 255, 0.5);
            }
            .production-card .card-id {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.5);
                font-family: 'Courier New', monospace;
            }
            .production-card .card-info {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-top: 16px;
            }
            .production-card .info-item {
                background: rgba(0, 0, 0, 0.3);
                padding: 10px;
                border-radius: 8px;
                border: 1px solid rgba(0, 209, 255, 0.1);
                transition: all 0.2s ease;
            }
            .production-card .info-item:hover {
                background: rgba(0, 209, 255, 0.1);
                border-color: rgba(0, 209, 255, 0.3);
            }
            .production-card .info-label {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.6);
                margin-bottom: 4px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .production-card .info-value {
                font-size: 14px;
                font-weight: 600;
                color: #ffffff;
            }
            .production-card .info-value.nb-value {
                color: #00d1ff;
                font-size: 16px;
            }
            .production-card .card-btn {
                background: linear-gradient(135deg, #00d1ff 0%, #0ecb81 100%);
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 209, 255, 0.3);
            }
            .production-card .card-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0, 209, 255, 0.4);
            }
            .production-card .card-btn.danger {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
            }
            .production-card .card-btn.danger:hover {
                box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4);
            }
            .production-card .card-actions {
                display: flex;
                gap: 12px;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 2px solid rgba(0, 209, 255, 0.2);
            }
            .production-card .card-btn.primary {
                flex: 1;
                background: linear-gradient(135deg, #00d1ff 0%, #0ecb81 100%);
            }
            .production-card .card-btn.secondary {
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
            }
            .production-card .card-btn.secondary:hover {
                box-shadow: 0 6px 20px rgba(99, 102, 241, 0.4);
            }
            .production-card .production-time {
                font-size: 13px;
                padding: 8px 12px;
                background: rgba(0, 209, 255, 0.1);
                border-radius: 8px;
                margin-bottom: 12px;
                border-left: 3px solid #00d1ff;
            }
            .production-card .production-time.old-card {
                background: rgba(246, 70, 93, 0.1);
                border-left-color: #f6465d;
            }
            @media (max-width: 1200px) {
                #production-cards {
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    padding: 16px;
                }
            }
            @media (max-width: 768px) {
                #production-cards {
                    grid-template-columns: 1fr;
                    gap: 16px;
                    padding: 12px;
                }
            }
            .history-section {
                margin-top: 10px;
                padding: 8px;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 6px;
                background: rgba(0,0,0,0.25);
            }
            .history-label {
                font-size: 12px;
                color: #00d1ff;
                margin-bottom: 6px;
                font-weight: 600;
            }
            .history-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .history-row {
                display: grid;
                grid-template-columns: 70px 120px 1fr 60px 70px;
                gap: 6px;
                font-size: 11px;
                color: #e5e7eb;
                background: rgba(255,255,255,0.03);
                padding: 6px 8px;
                border-radius: 4px;
            }
            .history-row .hist-type { font-weight: 700; color: #fbbf24; }
            .history-row .hist-pnl  { color: #0ecb81; }
        `;
        document.head.appendChild(style);
    },
    /**
     * 생산 카드 통계 업데이트
     */
    updateProductionStats(cards, currentIndex = -1) {
        const totalCards = cards ? cards.length : 0;
        
        // 전체 카드 Zone 분석 집계
        this.updateZoneAnalysisSummary(cards);
        
        // 분석 중인 카드 수 계산 (상태가 "분석 중", "상태 생성 중", "AI 분석 중", "매수 → 매도"인 카드)
        let analyzingCount = 0;
        let waitingCount = 0;
        
        if (cards && cards.length > 0) {
            cards.forEach(card => {
                const statusEl = document.getElementById(`rl-ai-status-${card.card_id}`);
                if (statusEl) {
                    const statusText = statusEl.textContent;
                    if (statusText.includes('분석 중') || statusText.includes('생성 중') || statusText.includes('결정 중')) {
                        analyzingCount++;
                    } else if (statusText === '분석 중...' || statusText.includes('판정')) {
                        // 판정 완료된 카드는 대기 중으로 간주
                        waitingCount++;
                    }
                } else {
                    // 상태 요소가 없으면 대기 중으로 간주
                    waitingCount++;
                }
            });
        }
        
        // 통계 업데이트
        const totalEl = document.getElementById('stat-total-cards');
        const analyzingEl = document.getElementById('stat-analyzing-cards');
        const waitingEl = document.getElementById('stat-waiting-cards');
        const indexEl = document.getElementById('stat-current-index');
        const updateEl = document.getElementById('stat-last-update');
        const availableEl = document.getElementById('stat-available-cards');
        
        // 현재 생산해야 할 N/B MAX/MIN 값 업데이트
        const currentMaxNbEl = document.getElementById('stat-current-nb-max');
        const currentMinNbEl = document.getElementById('stat-current-nb-min');
        
        // 메인 차트의 현재 N/B 값 가져오기
        const maxNbEl = document.getElementById('chart-max-nb');
        const minNbEl = document.getElementById('chart-min-nb');
        
        const decimalPlaces = Config.get('NB_DECIMAL_PLACES', 10);
        
        if (currentMaxNbEl && maxNbEl && maxNbEl.textContent && maxNbEl.textContent !== '0') {
            try {
                // 좌측 차트와 동일한 bit_max 값 표시 (0~10 범위)
                const bitMax = parseFloat(maxNbEl.textContent);
                currentMaxNbEl.textContent = bitMax.toFixed(decimalPlaces);
            } catch (e) {
                console.warn('현재 MAX N/B 값 파싱 실패:', e);
                currentMaxNbEl.textContent = '-';
            }
        } else if (currentMaxNbEl) {
            currentMaxNbEl.textContent = '-';
        }
        
        if (currentMinNbEl && minNbEl && minNbEl.textContent && minNbEl.textContent !== '0') {
            try {
                // 좌측 차트와 동일한 bit_min 값 표시 (0~10 범위)
                const bitMin = parseFloat(minNbEl.textContent);
                currentMinNbEl.textContent = bitMin.toFixed(decimalPlaces);
            } catch (e) {
                console.warn('현재 MIN N/B 값 파싱 실패:', e);
                currentMinNbEl.textContent = '-';
            }
        } else if (currentMinNbEl) {
            currentMinNbEl.textContent = '-';
        }
        
        if (totalEl) totalEl.textContent = totalCards;
        if (analyzingEl) analyzingEl.textContent = analyzingCount;
        if (waitingEl) waitingEl.textContent = waitingCount;
        if (indexEl) {
            if (currentIndex >= 0 && totalCards > 0) {
                indexEl.textContent = `${currentIndex + 1}/${totalCards}`;
            } else {
                indexEl.textContent = '-';
            }
        }
        if (updateEl) {
            const now = new Date();
            updateEl.textContent = now.toLocaleTimeString('ko-KR');
        }
        
        // 생산 가능 카드 개수 계산 및 업데이트
        if (availableEl) {
            const maxCards = Config.get('MAX_PRODUCTION_CARDS', 4);
            
            // 검증 대기 중인 카드 수 계산 (예측이 있지만 검증되지 않은 카드)
            let waitingVerificationCount = 0;
            if (cards && cards.length > 0) {
                waitingVerificationCount = cards.filter(card => {
                    const hasPrediction = card.predicted_next_zone || card.predicted_next_price;
                    const isVerified = card.prediction_verified;
                    const verificationStatus = card.verification_status;
                    // 예측이 있고 검증되지 않았으며, 다음 카드를 기다리는 상태인 경우
                    return hasPrediction && !isVerified && (verificationStatus === 'waiting_next_card' || !verificationStatus);
                }).length;
            }
            
            // 제거 대상 카드 찾기 (대기 판정 또는 매도 완료된 카드)
            let removableCardIds = [];
            let removableCardDetails = [];
            if (cards && cards.length > 0) {
                const removableCards = cards.filter(card => {
                    const cardId = card.card_id;
                    if (!cardId) return false;
                    
                    // 예측 성공 여부와 관계없이 제거 가능
                    // 1. 대기 판정(HOLD 판정) 확인
                    const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
                    let isWaiting = false;
                    if (statusEl) {
                        const statusText = statusEl.textContent || '';
                        isWaiting = statusText.includes('대기 판정');
                    }
                    
                    // 2. 매도 완료 확인 (히스토리에 SOLD 타입이 있는지)
                    const historyList = card.history_list || [];
                    const hasSold = historyList.some(hist => hist.type === 'SOLD');
                    
                    // 대기 판정이거나 매도 완료된 카드만 제거 대상
                    return isWaiting || hasSold;
                });
                
                // 가장 오래된 카드부터 정렬
                removableCards.sort((a, b) => {
                    const timeA = new Date(a.production_time || a.created_at || 0).getTime();
                    const timeB = new Date(b.production_time || b.created_at || 0).getTime();
                    return timeA - timeB; // 오래된 순서
                });
                
                // 제거 대상 카드 번호 및 상세 정보 추출
                removableCardDetails = removableCards.slice(0, 5).map(card => {
                    const cardId = card.card_id;
                    // 카드 번호 추출 (card_id에서 숫자 부분만)
                    const match = cardId.match(/\d+/);
                    const cardNumber = match ? match[0] : cardId.substring(0, 8);
                    
                    // 상태 확인
                    const historyList = card.history_list || [];
                    const hasSold = historyList.some(hist => hist.type === 'SOLD');
                    const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
                    const isWaiting = statusEl && (statusEl.textContent || '').includes('대기 판정');
                    
                    let reason = '';
                    if (hasSold && isWaiting) {
                        reason = '매도 완료 + 대기 판정';
                    } else if (hasSold) {
                        reason = '매도 완료';
                    } else if (isWaiting) {
                        reason = '대기 판정';
                    }
                    
                    return {
                        number: cardNumber,
                        cardId: cardId,
                        reason: reason,
                        productionTime: card.production_time || card.created_at
                    };
                });
                
                removableCardIds = removableCardDetails.map(detail => detail.number);
            }
            
            if (maxCards === 0 || maxCards === 999999) {
                // 제한 없음
                let content = '∞';
                if (waitingVerificationCount > 0) {
                    content += ` <span style="font-size: 11px; color: #ffa500; margin-left: 5px;">(검증 대기: ${waitingVerificationCount})</span>`;
                }
                if (removableCardIds.length > 0) {
                    content += ` <span style="font-size: 11px; color: #ff6b6b; margin-left: 5px;">(제거 대상: ${removableCardIds.join(', ')})</span>`;
                }
                availableEl.innerHTML = content;
                availableEl.style.color = '#51cf66';
            } else {
                const availableCount = Math.max(0, maxCards - totalCards);
                let content = availableCount.toString();
                
                if (waitingVerificationCount > 0) {
                    content += ` <span style="font-size: 11px; color: #ffa500; margin-left: 5px;">(검증 대기: ${waitingVerificationCount})</span>`;
                }
                
                if (removableCardIds.length > 0) {
                    content += ` <span style="font-size: 11px; color: #ff6b6b; margin-left: 5px;">(제거 대상: ${removableCardIds.join(', ')})</span>`;
                }
                
                availableEl.innerHTML = content;
                
                // 생산 가능 카드가 0개면 빨간색, 1-3개면 노란색, 4개 이상이면 초록색
                if (availableCount === 0) {
                    availableEl.style.color = '#ff6b6b';
                    
                    // 생산 가능 카드가 0일 때 대기 상태인 가장 오래된 카드 제거
                    if (cards && cards.length > 0) {
                        this.removeOldestWaitingCard(cards);
                    }
                } else if (availableCount <= 3) {
                    availableEl.style.color = '#ffd43b';
                } else {
                    availableEl.style.color = '#51cf66';
                }
            }
        }
        
        // 현재 카드 타입 표시 (가장 최근 카드)
        const cardTypeEl = document.getElementById('stat-card-type');
        const latestCardTimeEl = document.getElementById('stat-latest-card-time');
        
        if (cards && cards.length > 0) {
            // production_time 기준으로 정렬하여 가장 최근 카드 찾기
            const sortedCards = [...cards].sort((a, b) => {
                const timeA = a.production_time ? new Date(a.production_time).getTime() : 0;
                const timeB = b.production_time ? new Date(b.production_time).getTime() : 0;
                return timeB - timeA; // 최신순
            });
            
            const latestCard = sortedCards[0];
            
            // 카드 타입 표시
            if (cardTypeEl) {
                const isOverlap = latestCard.card_state === 'OVERLAP_ACTIVE' || latestCard.card_type === 'overlap';
                
                if (isOverlap) {
                    cardTypeEl.textContent = '🔄 중첩 카드';
                    cardTypeEl.style.color = '#9d4edd';
                } else {
                    cardTypeEl.textContent = '✨ 새 카드';
                    cardTypeEl.style.color = '#0ecb81';
                }
                cardTypeEl.style.fontWeight = 'bold';
            }
            
            // 최근 생성 시간 표시
            if (latestCardTimeEl) {
                const productionTime = latestCard.production_time || latestCard.created_at;
                if (productionTime) {
                    try {
                        const date = new Date(productionTime);
                        const now = new Date();
                        const diffMs = now - date;
                        const diffMins = Math.floor(diffMs / 60000);
                        const diffHours = Math.floor(diffMs / 3600000);
                        const diffDays = Math.floor(diffMs / 86400000);
                        
                        let timeText = '';
                        if (diffMins < 1) {
                            timeText = '방금 전';
                        } else if (diffMins < 60) {
                            timeText = `${diffMins}분 전`;
                        } else if (diffHours < 24) {
                            timeText = `${diffHours}시간 전`;
                        } else if (diffDays < 7) {
                            timeText = `${diffDays}일 전`;
                        } else {
                            timeText = date.toLocaleString('ko-KR', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                        }
                        
                        latestCardTimeEl.textContent = timeText;
                        latestCardTimeEl.title = date.toLocaleString('ko-KR');
                        latestCardTimeEl.style.color = '#00d1ff';
                    } catch (e) {
                        latestCardTimeEl.textContent = '시간 확인 불가';
                        latestCardTimeEl.style.color = '#888';
                    }
                } else {
                    latestCardTimeEl.textContent = '-';
                    latestCardTimeEl.style.color = '#888';
                }
            }
        } else {
            if (cardTypeEl) {
                cardTypeEl.textContent = '-';
                cardTypeEl.style.color = '';
                cardTypeEl.style.fontWeight = '';
            }
            if (latestCardTimeEl) {
                latestCardTimeEl.textContent = '-';
                latestCardTimeEl.style.color = '#888';
            }
        }
        
        // 생산 진행 상태 표시
        const productionStatusEl = document.getElementById('stat-production-status');
        const productionReasonEl = document.getElementById('stat-production-reason');
        
        if (productionStatusEl) {
            const progressEl = document.getElementById('production-progress');
            let isProducing = false;
            let reason = '';
            const maxCards = Config.get('MAX_PRODUCTION_CARDS', 4);
            const totalCards = cards ? cards.length : 0;
            const isMaxCardsReached = maxCards > 0 && totalCards >= maxCards;
            
            if (progressEl) {
                const width = progressEl.style.width || '0%';
                const widthPercent = parseInt(width) || 0;
                
                if (widthPercent > 0 && widthPercent < 100) {
                    productionStatusEl.textContent = '🔄 생산 중';
                    productionStatusEl.style.color = '#00d1ff';
                    productionStatusEl.style.fontWeight = 'bold';
                    isProducing = true;
                    reason = '카드 생산 진행 중...';
                } else if (widthPercent >= 100) {
                    productionStatusEl.textContent = '✅ 완료';
                    productionStatusEl.style.color = '#0ecb81';
                    productionStatusEl.style.fontWeight = 'bold';
                    reason = '생산 완료';
                } else if (isMaxCardsReached) {
                    // 최대 카드 수에 도달했으면 완료로 표시
                    productionStatusEl.textContent = '✅ 완료';
                    productionStatusEl.style.color = '#0ecb81';
                    productionStatusEl.style.fontWeight = 'bold';
                } else {
                    productionStatusEl.textContent = '⏸️ 대기 중';
                    productionStatusEl.style.color = '#888888';
                    productionStatusEl.style.fontWeight = '';
                }
            } else {
                // 프로그레스바가 없을 때도 최대 카드 수 확인
                if (isMaxCardsReached) {
                    productionStatusEl.textContent = '✅ 완료';
                    productionStatusEl.style.color = '#0ecb81';
                    productionStatusEl.style.fontWeight = 'bold';
                } else {
                    productionStatusEl.textContent = '⏸️ 대기 중';
                    productionStatusEl.style.color = '#888888';
                    productionStatusEl.style.fontWeight = '';
                }
            }
            
            // 생산이 안되는 이유 표시
            if (productionReasonEl && !isProducing) {
                if (isMaxCardsReached) {
                    reason = `최대 카드 수 제한 (${totalCards}/${maxCards})`;
                    productionReasonEl.style.color = '#0ecb81'; // 완료 상태이므로 초록색
                } else if (totalCards === 0) {
                    reason = '생산 가능 (카드 없음)';
                    productionReasonEl.style.color = '#0ecb81';
                } else {
                    reason = '생산 가능';
                    productionReasonEl.style.color = '#0ecb81';
                }
                
                productionReasonEl.textContent = reason || '-';
            } else if (productionReasonEl && isProducing) {
                productionReasonEl.textContent = reason || '카드 생산 진행 중...';
                productionReasonEl.style.color = '#00d1ff';
            } else if (productionReasonEl && isMaxCardsReached) {
                // 생산 완료 상태일 때도 제한 사유 표시
                reason = `최대 카드 수 제한 (${totalCards}/${maxCards})`;
                productionReasonEl.textContent = reason;
                productionReasonEl.style.color = '#0ecb81';
            }
        }
    },
    
    /**
     * 전체 카드 Zone 분석 집계 및 예측 표시
     */
    async updateZoneAnalysisSummary(cards) {
        const summaryEl = document.getElementById('zone-analysis-summary');
        if (!summaryEl) return;
        
        if (!cards || cards.length === 0) {
            summaryEl.innerHTML = '<div class="zone-summary-empty">분석할 카드가 없습니다.</div>';
            return;
        }
        
        // 제거 대상 카드 찾기 (가장 오래된 카드 중 대기 판정 또는 매도 완료된 카드)
        let removableCardDetails = [];
        if (cards && cards.length > 0) {
            const removableCards = cards.filter(card => {
                const cardId = card.card_id;
                if (!cardId) return false;
                
                // 예측 성공 여부와 관계없이 제거 가능
                // 1. 대기 판정(HOLD 판정) 확인
                const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
                let isWaiting = false;
                if (statusEl) {
                    const statusText = statusEl.textContent || '';
                    isWaiting = statusText.includes('대기 판정');
                }
                
                // 2. 매도 완료 확인 (히스토리에 SOLD 타입이 있는지)
                const historyList = card.history_list || [];
                const hasSold = historyList.some(hist => hist.type === 'SOLD');
                
                // 대기 판정이거나 매도 완료된 카드만 제거 대상
                return isWaiting || hasSold;
            });
            
            // 가장 오래된 카드부터 정렬
            removableCards.sort((a, b) => {
                const timeA = new Date(a.production_time || a.created_at || 0).getTime();
                const timeB = new Date(b.production_time || b.created_at || 0).getTime();
                return timeA - timeB; // 오래된 순서
            });
            
            // 제거 대상 카드 상세 정보 추출
            removableCardDetails = removableCards.slice(0, 5).map(card => {
                const cardId = card.card_id;
                // 카드 번호 추출 (card_id에서 숫자 부분만)
                const match = cardId.match(/\d+/);
                const cardNumber = match ? match[0] : cardId.substring(0, 8);
                
                // 상태 확인
                const historyList = card.history_list || [];
                const hasSold = historyList.some(hist => hist.type === 'SOLD');
                const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
                const isWaiting = statusEl && (statusEl.textContent || '').includes('대기 판정');
                
                let reason = '';
                if (hasSold && isWaiting) {
                    reason = '매도 완료 + 대기 판정';
                } else if (hasSold) {
                    reason = '매도 완료';
                } else if (isWaiting) {
                    reason = '대기 판정';
                }
                
                return {
                    number: cardNumber,
                    cardId: cardId,
                    reason: reason,
                    productionTime: card.production_time || card.created_at
                };
            });
        }
        
        // 강화학습 AI 시스템 정보 가져오기
        let rlInfo = null;
        let rlStatistics = null;
        try {
            const response = await fetch('/api/ai/rl-info');
            if (response.ok) {
                rlInfo = await response.json();
            }
            // 전체 통계 가져오기
            const statsResponse = await fetch('/api/ai/rl-statistics');
            if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                if (statsData.success && statsData.statistics) {
                    rlStatistics = statsData.statistics;
                }
            }
        } catch (error) {
            console.warn('강화학습 AI 시스템 정보 조회 실패:', error);
        }
        
        // Zone 분석 집계
        let blueCount = 0;
        let orangeCount = 0;
        let unknownCount = 0;
        let totalRValue = 0;
        let rValueCount = 0;
        
        // 강화학습 AI 검증 집계
        let rlBuyCount = 0;
        let rlSellCount = 0;
        let rlHoldCount = 0;
        let rlFreezeCount = 0;
        let rlDeleteCount = 0;
        
        // 강화학습 AI 확률 집계
        let totalBuyProb = 0;
        let totalSellProb = 0;
        let totalHoldProb = 0;
        let probCount = 0;
        
        // Q값 집계
        let totalQValue = 0;
        let qValueCount = 0;
        
        // 예측 수익률 집계
        let totalExpectedPnl = 0;
        let pnlCount = 0;
        
        cards.forEach(card => {
            // Zone 정보 추출
            const zone = card.zone || 
                       card.analysis_details?.zone || 
                       card.zone_analysis?.zone ||
                       card.recent_rl_ai_analysis?.analysis_details?.zone ||
                       card.rl_ai_analysis_details?.zone;
            
            const rValue = card.r_value || 
                          card.analysis_details?.r_value || 
                          card.zone_analysis?.r_value ||
                          card.recent_rl_ai_analysis?.analysis_details?.r_value ||
                          card.rl_ai_analysis_details?.r_value;
            
            if (zone === 'BLUE') {
                blueCount++;
            } else if (zone === 'ORANGE') {
                orangeCount++;
            } else {
                unknownCount++;
            }
            
            if (rValue !== null && rValue !== undefined) {
                totalRValue += rValue;
                rValueCount++;
            }
            
            // 강화학습 AI 검증 추출
            const rlAction = card.rl_ai_action || 
                            card.recent_rl_ai_analysis?.action ||
                            card.rl_ai_analysis_details?.action ||
                            card.recent_rl_ai_analysis?.action_name;
            
            if (rlAction === 'BUY') {
                rlBuyCount++;
            } else if (rlAction === 'SELL') {
                rlSellCount++;
            } else if (rlAction === 'HOLD') {
                rlHoldCount++;
            } else if (rlAction === 'FREEZE') {
                rlFreezeCount++;
            } else if (rlAction === 'DELETE') {
                rlDeleteCount++;
            }
            
            // 강화학습 AI 확률 추출
            const actionProbs = card.recent_rl_ai_analysis?.action_probs_all ||
                               card.rl_ai_analysis_details?.action_probs_all ||
                               card.recent_rl_ai_analysis?.analysis_details?.action_probs_all;
            
            if (actionProbs) {
                if (actionProbs.BUY !== undefined) {
                    totalBuyProb += actionProbs.BUY;
                }
                if (actionProbs.SELL !== undefined) {
                    totalSellProb += actionProbs.SELL;
                }
                if (actionProbs.HOLD !== undefined) {
                    totalHoldProb += actionProbs.HOLD;
                }
                probCount++;
            }
            
            // Q값 추출
            const qValue = card.recent_rl_ai_analysis?.q_value ||
                          card.rl_ai_analysis_details?.q_value ||
                          card.recent_rl_ai_analysis?.analysis_details?.q_value;
            
            if (qValue !== null && qValue !== undefined) {
                totalQValue += qValue;
                qValueCount++;
            }
            
            // 예측 수익률 추출
            const expectedPnl = card.recent_rl_ai_analysis?.analysis_details?.expected_pnl_percent ||
                               card.rl_ai_analysis_details?.expected_pnl_percent;
            
            if (expectedPnl !== null && expectedPnl !== undefined) {
                totalExpectedPnl += expectedPnl;
                pnlCount++;
            }
        });
        
        const totalAnalyzed = blueCount + orangeCount;
        const bluePercent = totalAnalyzed > 0 ? (blueCount / totalAnalyzed * 100).toFixed(1) : 0;
        const orangePercent = totalAnalyzed > 0 ? (orangeCount / totalAnalyzed * 100).toFixed(1) : 0;
        const avgRValue = rValueCount > 0 ? (totalRValue / rValueCount).toFixed(4) : '-';
        const avgExpectedPnl = pnlCount > 0 ? (totalExpectedPnl / pnlCount).toFixed(2) : '-';
        
        // 강화학습 AI 통계
        const totalRlActions = rlBuyCount + rlSellCount + rlHoldCount + rlFreezeCount + rlDeleteCount;
        const avgBuyProb = probCount > 0 ? (totalBuyProb / probCount).toFixed(1) : '-';
        const avgSellProb = probCount > 0 ? (totalSellProb / probCount).toFixed(1) : '-';
        const avgHoldProb = probCount > 0 ? (totalHoldProb / probCount).toFixed(1) : '-';
        const avgQValue = qValueCount > 0 ? (totalQValue / qValueCount).toFixed(4) : '-';
        
        // 예측 생성
        let prediction = '';
        if (totalAnalyzed > 0) {
            if (blueCount > orangeCount) {
                prediction = `🔵 BLUE 구역 우세 (${bluePercent}%) → 상승 추세 예상`;
            } else if (orangeCount > blueCount) {
                prediction = `🟠 ORANGE 구역 우세 (${orangePercent}%) → 하락 추세 예상`;
            } else {
                prediction = `⚖️ BLUE/ORANGE 균형 → 혼조 추세 예상`;
            }
        } else {
            prediction = '⚠️ Zone 분석 데이터 부족';
        }
        
        // 강화학습 AI 검증 예측
        let rlPrediction = '';
        if (totalRlActions > 0) {
            const rlBuyPercent = (rlBuyCount / totalRlActions * 100).toFixed(1);
            const rlSellPercent = (rlSellCount / totalRlActions * 100).toFixed(1);
            const rlHoldPercent = (rlHoldCount / totalRlActions * 100).toFixed(1);
            
            if (rlBuyCount > rlSellCount && rlBuyCount > rlHoldCount) {
                rlPrediction = `매수 우세 (${rlBuyPercent}%) → 상승 기대`;
            } else if (rlSellCount > rlBuyCount && rlSellCount > rlHoldCount) {
                rlPrediction = `매도 우세 (${rlSellPercent}%) → 하락 기대`;
            } else {
                rlPrediction = `보유 우세 (${rlHoldPercent}%) → 관망`;
            }
        }
        
        // 학습 정보 표시
        let learningInfoHtml = '';
        if (rlInfo && rlInfo.available) {
            const trainingStats = rlInfo.training_stats || {};
            const expBuffer = rlInfo.experience_buffer || {};
            const recentPerf = rlInfo.recent_performance || {};
            const stateVector = rlInfo.state_vector || {};
            const learningData = rlInfo.learning_data_types || {};
            const learningProcess = rlInfo.learning_process || {};
            const trainingStatus = learningProcess.training_status || {};
            
            // 마지막 학습 시간 포맷팅
            let lastTrainingTime = trainingStats.last_training_time || '아직 학습 없음';
            if (lastTrainingTime && lastTrainingTime !== '아직 학습 없음') {
                try {
                    const date = new Date(lastTrainingTime);
                    lastTrainingTime = date.toLocaleString('ko-KR');
                } catch (e) {
                    // 날짜 파싱 실패 시 그대로 사용
                }
            }
            
            // 레벨 정보
            const level = trainingStats.level || 1;
            const totalExpCount = trainingStats.total_experience_count || 0;
            const levelEffects = trainingStats.level_effects || {};
            const levelDesc = levelEffects.description || '';
            
            // 레벨 색상 결정
            let levelColor = '#888888';
            if (level >= 50) levelColor = '#ffd700';  // 골드
            else if (level >= 30) levelColor = '#9d4edd';  // 보라
            else if (level >= 20) levelColor = '#00d1ff';  // 파랑
            else if (level >= 10) levelColor = '#0ecb81';  // 초록
            else if (level >= 5) levelColor = '#ffa500';  // 주황
            
            learningInfoHtml = `
                <div class="rl-learning-section">
                    <div class="rl-learning-header">
                        <h4>🧠 강화학습 AI 학습 상태</h4>
                    </div>
                    <div class="rl-learning-body">
                        <div class="rl-learning-row">
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">레벨</div>
                                <div class="rl-learning-value" style="color: ${levelColor}; font-weight: bold; font-size: 16px;">
                                    LV.${level}
                                </div>
                                <div class="rl-learning-label" style="font-size: 10px; margin-top: 2px;">
                                    ${levelDesc}
                                </div>
                            </div>
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">학습 횟수</div>
                                <div class="rl-learning-value" style="color: #00d1ff; font-weight: bold;">
                                    ${trainingStats.training_count || 0}회
                                </div>
                            </div>
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">총 경험 수</div>
                                <div class="rl-learning-value" style="color: #0ecb81;">
                                    ${totalExpCount.toLocaleString()}개
                                </div>
                            </div>
                        </div>
                        <div class="rl-learning-row">
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">마지막 학습</div>
                                <div class="rl-learning-value" style="font-size: 11px;">
                                    ${lastTrainingTime}
                                </div>
                            </div>
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">다음 학습 트리거</div>
                                <div class="rl-learning-value" style="font-size: 11px; color: ${expBuffer.can_train ? '#0ecb81' : '#ff6b6b'};">
                                    ${trainingStats.next_training_trigger || trainingStatus.next_training_trigger || '-'}
                                </div>
                            </div>
                            ${levelEffects.epsilon !== undefined ? `
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">탐험률 (ε)</div>
                                <div class="rl-learning-value" style="font-size: 11px;">
                                    ${(levelEffects.epsilon * 100).toFixed(1)}%
                                </div>
                            </div>
                            ` : ''}
                        </div>
                        <div class="rl-learning-row">
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">경험 버퍼</div>
                                <div class="rl-learning-value">
                                    ${expBuffer.current_size || 0} / ${expBuffer.max_size || 10000} 
                                    (${expBuffer.usage_percent?.toFixed(1) || 0}%)
                                </div>
                            </div>
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">학습 가능</div>
                                <div class="rl-learning-value" style="color: ${expBuffer.can_train ? '#0ecb81' : '#ff6b6b'};">
                                    ${expBuffer.can_train ? '✅ 가능' : '❌ 불가 (경험 부족)'}
                                </div>
                            </div>
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">평균 보상</div>
                                <div class="rl-learning-value" style="color: ${recentPerf.avg_reward >= 0 ? '#0ecb81' : '#f6465d'};">
                                    ${recentPerf.avg_reward?.toFixed(4) || '0.0000'}
                                </div>
                            </div>
                        </div>
                        <div class="rl-learning-row">
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">최근 액션 분포</div>
                                <div class="rl-learning-value" style="font-size: 12px;">
                                    <span style="color: #0ecb81;">BUY ${recentPerf.action_distribution?.BUY || 0}</span> | 
                                    <span style="color: #f6465d;">SELL ${recentPerf.action_distribution?.SELL || 0}</span> | 
                                    <span style="color: #888888;">HOLD ${recentPerf.action_distribution?.HOLD || 0}</span>
                                    ${recentPerf.action_distribution?.FREEZE ? ` | <span style="color: #ffa500;">FREEZE ${recentPerf.action_distribution.FREEZE}</span>` : ''}
                                    ${recentPerf.action_distribution?.DELETE ? ` | <span style="color: #ff6b6b;">DELETE ${recentPerf.action_distribution.DELETE}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        ${rlStatistics ? `
                        <div class="rl-learning-row">
                            <div class="rl-learning-item" style="flex: 1;">
                                <div class="rl-learning-label">모의전/실제 거래 (전체)</div>
                                <div class="rl-learning-value" style="font-size: 12px;">
                                    <span style="color: #ffa500;">🧪 모의전 ${rlStatistics.simulation_count || 0}</span> | 
                                    <span style="color: #0ecb81;">💰 실제 ${rlStatistics.real_trading_count || 0}</span>
                                    ${rlStatistics.simulation_percent ? ` (모의전: ${rlStatistics.simulation_percent.toFixed(1)}%)` : ''}
                                </div>
                            </div>
                        </div>
                        ${rlStatistics.simulation_stats || rlStatistics.real_trading_stats ? `
                        <div class="rl-learning-row">
                            <div class="rl-learning-item" style="flex: 1;">
                                <div class="rl-learning-label">모의전 통계</div>
                                <div class="rl-learning-value" style="font-size: 11px; line-height: 1.5;">
                                    매수 ${rlStatistics.simulation_stats?.buy_count || 0}회 | 
                                    매도 ${rlStatistics.simulation_stats?.sell_count || 0}회 | 
                                    수익 ${rlStatistics.simulation_stats?.total_profit?.toFixed(0) || 0} | 
                                    손실 ${rlStatistics.simulation_stats?.total_loss?.toFixed(0) || 0} | 
                                    순손익 <span style="color: ${(rlStatistics.simulation_stats?.net_profit || 0) >= 0 ? '#0ecb81' : '#f6465d'};">${rlStatistics.simulation_stats?.net_profit?.toFixed(0) || 0}</span> | 
                                    승률 ${rlStatistics.simulation_stats?.win_rate?.toFixed(1) || 0}%
                                </div>
                            </div>
                        </div>
                        ${typeof getSimulationMessageForStats !== 'undefined' ? `
                        <div class="rl-learning-row">
                            <div class="rl-learning-item" style="flex: 1;">
                                <div class="rl-learning-label" style="font-size: 10px; color: #888;">💬 모의전 통계 설명</div>
                                <div class="rl-learning-value" style="font-size: 10px; line-height: 1.6; color: #aaa; font-style: italic; padding: 4px 0;">
                                    ${getSimulationMessageForStats(rlStatistics.simulation_stats)}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        <div class="rl-learning-row">
                            <div class="rl-learning-item" style="flex: 1;">
                                <div class="rl-learning-label">실제 거래 통계</div>
                                <div class="rl-learning-value" style="font-size: 11px; line-height: 1.5;">
                                    매수 ${rlStatistics.real_trading_stats?.buy_count || 0}회 | 
                                    매도 ${rlStatistics.real_trading_stats?.sell_count || 0}회 | 
                                    수익 ${rlStatistics.real_trading_stats?.total_profit?.toFixed(0) || 0} | 
                                    손실 ${rlStatistics.real_trading_stats?.total_loss?.toFixed(0) || 0} | 
                                    순손익 <span style="color: ${(rlStatistics.real_trading_stats?.net_profit || 0) >= 0 ? '#0ecb81' : '#f6465d'};">${rlStatistics.real_trading_stats?.net_profit?.toFixed(0) || 0}</span> | 
                                    승률 ${rlStatistics.real_trading_stats?.win_rate?.toFixed(1) || 0}%
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        ` : rlInfo.simulation_stats ? `
                        <div class="rl-learning-row">
                            <div class="rl-learning-item">
                                <div class="rl-learning-label">모의전/실제 거래 (최근)</div>
                                <div class="rl-learning-value" style="font-size: 12px;">
                                    <span style="color: #ffa500;">🧪 모의전 ${rlInfo.simulation_stats.simulation_count || 0}</span> | 
                                    <span style="color: #0ecb81;">💰 실제 ${rlInfo.simulation_stats.real_trading_count || 0}</span>
                                    ${rlInfo.simulation_stats.simulation_percent ? ` (모의전: ${rlInfo.simulation_stats.simulation_percent.toFixed(1)}%)` : ''}
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        <div class="rl-learning-process">
                            <div class="rl-process-label">📊 상태 벡터 구조:</div>
                            <div class="rl-process-value" style="font-size: 11px; line-height: 1.6;">
                                <strong>${stateVector.dimension || 32}차원 연속 벡터</strong> (세그먼트 데이터 아님)<br>
                                ${stateVector.components ? stateVector.components.map(comp => `• ${comp}`).join('<br>') : ''}
                            </div>
                            <div class="rl-process-label" style="margin-top: 8px;">📚 학습 데이터:</div>
                            <div class="rl-process-value" style="font-size: 11px; line-height: 1.6;">
                                • ${learningData.card_data || '카드 전체 데이터'}<br>
                                • ${learningData.base_output || 'Base Model 출력'}<br>
                                • ${learningData.emotion_output || 'Emotion Model 출력'}<br>
                                • ${learningData.basic_ai_output || '기본 AI 분석 (Zone, r값)'}<br>
                                • ${learningData.realtime_scores || '실시간 점수 차트 데이터'}<br>
                                • ${learningData.state || '상태 벡터 (종합)'}<br>
                                • ${learningData.reward || '보상 (수익률, Zone 매칭, 검증 결과)'}
                            </div>
                            <div class="rl-process-label" style="margin-top: 8px;">⚙️ 학습 과정:</div>
                            <div class="rl-process-value" style="font-size: 11px; line-height: 1.6;">
                                • ${learningProcess.trigger || '경험이 100개 이상 쌓일 때마다 자동 학습'}<br>
                                • ${learningProcess.batch_size || '최근 1000개 경험 사용'}<br>
                                • ${learningProcess.method || 'Policy Gradient (REINFORCE)'}<br>
                                • ${learningProcess.parallel_analysis || '학습과 동시에 실시간 분석 계속 실행 (비동기)'}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 제거 대상 카드 정보 HTML 생성
        let removableCardsHtml = '';
        if (removableCardDetails && removableCardDetails.length > 0) {
            const removableNumbers = removableCardDetails.map(detail => detail.number).join(', ');
            const removableReasons = removableCardDetails.map(detail => `${detail.number}(${detail.reason})`).join(', ');
            removableCardsHtml = `
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">🗑️ 제거 대상 카드</div>
                            <div class="zone-summary-value" style="color: #ff6b6b; font-weight: 600;">
                                ${removableNumbers}
                                <span style="font-size: 11px; color: #888; margin-left: 8px;">(${removableCardDetails.length}개)</span>
                            </div>
                            <div class="zone-summary-value" style="font-size: 11px; color: #aaa; margin-top: 4px;">
                                ${removableReasons}
                            </div>
                        </div>
            `;
        }
        
        // HTML 생성
        summaryEl.innerHTML = `
            <div class="zone-summary-content">
                <div class="zone-summary-header">
                    <h3>📊 전체 카드 Zone 분석 및 예측</h3>
                </div>
                <div class="zone-summary-body">
                    ${removableCardsHtml}
                    <div class="zone-summary-row">
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">🔵 BLUE 구역</div>
                            <div class="zone-summary-value" style="color: #00d1ff; font-weight: bold;">${blueCount}개 (${bluePercent}%)</div>
                        </div>
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">🟠 ORANGE 구역</div>
                            <div class="zone-summary-value" style="color: #ffa500; font-weight: bold;">${orangeCount}개 (${orangePercent}%)</div>
                        </div>
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">평균 r값</div>
                            <div class="zone-summary-value">${avgRValue}</div>
                        </div>
                        ${unknownCount > 0 ? `
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">미분석</div>
                            <div class="zone-summary-value" style="color: #888888;">${unknownCount}개</div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="zone-summary-row">
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">🧠 강화학습 AI 검증</div>
                            <div class="zone-summary-value" style="font-size: 12px;">
                                <span style="color: #0ecb81;">매수 ${rlBuyCount}</span> | 
                                <span style="color: #f6465d;">매도 ${rlSellCount}</span> | 
                                <span style="color: #888888;">보유 ${rlHoldCount}</span>
                                ${rlFreezeCount > 0 ? ` | <span style="color: #ffa500;">동결 ${rlFreezeCount}</span>` : ''}
                                ${rlDeleteCount > 0 ? ` | <span style="color: #ff6b6b;">삭제 ${rlDeleteCount}</span>` : ''}
                            </div>
                        </div>
                        ${avgBuyProb !== '-' ? `
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">평균 확률</div>
                            <div class="zone-summary-value" style="font-size: 12px;">
                                BUY ${avgBuyProb}% | SELL ${avgSellProb}% | HOLD ${avgHoldProb}%
                            </div>
                        </div>
                        ` : ''}
                        ${avgQValue !== '-' ? `
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">평균 Q값</div>
                            <div class="zone-summary-value">${avgQValue}</div>
                        </div>
                        ` : ''}
                        ${avgExpectedPnl !== '-' ? `
                        <div class="zone-summary-item">
                            <div class="zone-summary-label">평균 예상 수익률</div>
                            <div class="zone-summary-value" style="color: ${avgExpectedPnl >= 0 ? '#0ecb81' : '#f6465d'};">
                                ${avgExpectedPnl >= 0 ? '+' : ''}${avgExpectedPnl}%
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="zone-summary-prediction">
                        <div class="zone-prediction-label">🎯 Zone 예측:</div>
                        <div class="zone-prediction-value">${prediction}</div>
                        ${rlPrediction ? `
                        <div class="zone-prediction-value" style="margin-top: 5px;">🧠 강화학습 AI: ${rlPrediction}</div>
                        ` : ''}
                    </div>
                </div>
                ${learningInfoHtml}
            </div>
        `;
    },
    
    /**
     * 카드가 검증 완료되었는지 확인
     */
    isCardVerified(card) {
        const historyList = card.history_list || [];
        // SOLD 히스토리가 있으면 검증 완료된 카드
        const hasSold = historyList.some(hist => hist.type === 'SOLD');
        return hasSold;
    },
    
    /**
     * 카드의 분석이 완료되었는지 확인
     */
    isAnalysisCompleted(cardId) {
        const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
        if (!statusEl) {
            return false;  // 상태 요소가 없으면 분석 미완료로 간주
        }
        
        const statusText = statusEl.textContent;
        // "판정"으로 끝나면 분석 완료 (매수 판정, 매도 판정, 대기 판정 등)
        return statusText.includes('판정');
    },
    
    /**
     * 카드가 대기 상태인지 확인
     */
    isCardWaiting(cardId) {
        const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
        if (!statusEl) {
            return false;
        }
        
        const statusText = statusEl.textContent;
        // "대기 판정"이면 대기 상태
        return statusText.includes('대기 판정');
    },
    
    /**
     * 생산 가능 카드가 0일 때 대기 판정 또는 매도 완료된 가장 오래된 카드 제거
     * 제거 실패 시 다음 카드로 재시도
     */
    async removeOldestWaitingCard(cards) {
        // 이미 진행 중이면 중복 실행 방지
        if (this.isRemovingWaitingCard) {
            return;
        }
        
        try {
            this.isRemovingWaitingCard = true;
            
            // 대기 판정 또는 매도 완료된 카드만 필터링
            const removableCards = cards.filter(card => {
                const cardId = card.card_id;
                if (!cardId) return false;
                
                // 예측 성공 여부와 관계없이 대기 판정이면 제거 대상
                // 1. 대기 판정(HOLD 판정) 확인
                const isWaiting = this.isCardWaiting(cardId);
                
                // 2. 매도 완료 확인 (히스토리에 SOLD 타입이 있는지)
                const historyList = card.history_list || [];
                const hasSold = historyList.some(hist => hist.type === 'SOLD');
                
                // 대기 판정이거나 매도 완료된 카드만 제거 대상 (예측 성공 여부와 관계없이)
                return isWaiting || hasSold;
            });
            
            if (removableCards.length === 0) {
                this.isRemovingWaitingCard = false;
                return; // 제거 대상 카드가 없으면 종료
            }
            
            // 가장 오래된 카드 찾기 (생산 시간 또는 생성 시간 기준)
            removableCards.sort((a, b) => {
                const timeA = new Date(a.production_time || a.created_at || 0).getTime();
                const timeB = new Date(b.production_time || b.created_at || 0).getTime();
                return timeA - timeB; // 오래된 순서
            });
            
            // 제거 시도 (실패 시 다음 카드로 재시도)
            // 제거 실패한 카드 ID를 추적하여 같은 카드를 계속 시도하지 않도록 함
            const failedCardIds = new Set();
            let attemptIndex = 0;
            let removed = false;
            
            while (attemptIndex < removableCards.length && !removed) {
                const targetCard = removableCards[attemptIndex];
                const targetCardId = targetCard.card_id;
                
                // 이미 실패한 카드는 건너뛰기
                if (failedCardIds.has(targetCardId)) {
                    attemptIndex++;
                    continue;
                }
                
                // 카드 상태 확인
                const historyList = targetCard.history_list || [];
                const hasSold = historyList.some(hist => hist.type === 'SOLD');
                const isWaiting = this.isCardWaiting(targetCardId);
                
                let reason = '';
                if (hasSold && isWaiting) {
                    reason = '대기 판정 + 매도 완료';
                } else if (hasSold) {
                    reason = '매도 완료';
                } else if (isWaiting) {
                    reason = '대기 판정';
                }
                
                // 예측 성공 여부와 관계없이 대기 판정이면 제거 가능
                // (예측 성공한 카드도 대기 판정이면 제거됨)
                
                console.log(`🗑️ 생산 가능 카드가 0이므로 가장 오래된 카드 제거 시도 (${attemptIndex + 1}/${removableCards.length}): ${targetCardId} (${reason})`);
                
                try {
                    // 카드 제거 실행 (직접 API 호출)
                    const deleteResult = await API.delete(`/cards/${targetCardId}`);
                    
                    if (deleteResult && (deleteResult.success || deleteResult._status === 200 || deleteResult._status === 204)) {
                        console.log(`✅ 카드 제거 완료: ${targetCardId}`);
                        removed = true;
                        
                        if (typeof refreshCards === 'function') {
                            await refreshCards();
                        }
                    } else {
                        // 제거 실패 시 실패 목록에 추가하고 다음 카드로 재시도
                        console.log(`⚠️ 카드 제거 실패 (다음 카드로 재시도): ${targetCardId}`);
                        failedCardIds.add(targetCardId);
                        attemptIndex++;
                    }
                } catch (error) {
                    // 에러 발생 시 다음 카드로 재시도
                    const errorMsg = error?.response?.data?.error || error?.message || String(error);
                    console.error(`❌ 카드 제거 실패 (다음 카드로 재시도): ${targetCardId}`, errorMsg);
                    
                    // 예측 성공한 카드로 인한 실패인 경우: 실패 목록에 추가하고 다음 카드로 재시도
                    if (errorMsg && errorMsg.includes('예측 성공한 카드는 매도 완료 후에만 제거할 수 있습니다')) {
                        console.log(`⏭️ 예측 성공한 카드로 인한 제거 실패, 실패 목록에 추가하고 다음 카드로 재시도: ${targetCardId}`);
                        
                        // 제거 실패한 카드를 실패 목록에 추가 (같은 카드를 계속 시도하지 않도록)
                        failedCardIds.add(targetCardId);
                        attemptIndex++;
                        continue; // 다음 카드로 진행
                    } else {
                        // 다른 에러인 경우 재시도하지 않음
                        console.error(`❌ 예상치 못한 에러로 인한 제거 실패: ${targetCardId}`, error);
                        failedCardIds.add(targetCardId);
                        attemptIndex++;
                        continue; // 다음 카드로 진행
                    }
                }
            }
            
            if (!removed && attemptIndex >= removableCards.length) {
                console.warn(`⚠️ 모든 제거 대상 카드 제거 실패 (${removableCards.length}개 시도)`);
            }
            
            // 약간의 지연 후 플래그 해제 (중복 실행 방지)
            setTimeout(() => {
                this.isRemovingWaitingCard = false;
            }, 2000);
        } catch (error) {
            console.error('카드 제거 실패:', error);
            this.isRemovingWaitingCard = false;
        }
    },
    
    /**
     * 매수 판정이 나온 카드에 대해 매도 판정 확인 (실시간 손익률 모니터링)
     */
    async checkSellDecisionForBuyCards(cards) {
        // 매수 판정이 나온 카드만 필터링
        const buyJudgedCards = cards.filter(card => {
            const cardId = card.card_id;
            if (!cardId) return false;
            
            // AI 상태 확인
            const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
            if (!statusEl) return false;
            
            const statusText = statusEl.textContent;
            
            // 매수 판정이 나왔는지 확인
            const hasBuyJudgment = statusText.includes('매수 판정') || 
                                  statusText.includes('매도 대기 중') ||
                                  card.waiting_sell === true;
            
            // 매도 완료 여부 확인
            const historyList = card.history_list || [];
            const hasSold = historyList.some(hist => hist.type === 'SOLD');
            
            // 매수 판정이 나왔고 아직 매도하지 않은 카드만
            return hasBuyJudgment && !hasSold;
        });
        
        if (buyJudgedCards.length === 0) {
            return; // 매수 판정 카드가 없으면 종료
        }
        
        console.log(`🔍 매수 판정 카드 ${buyJudgedCards.length}개에 대해 매도 판정 확인 시작`);
        
        // 각 카드에 대해 매도 판정 확인
        for (const card of buyJudgedCards) {
            const cardId = card.card_id;
            
            try {
                // 프로그레스바 업데이트: 매도 판정 확인 중
                const progressEl = document.getElementById(`rl-ai-progress-${cardId}`);
                const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
                
                if (progressEl && statusEl) {
                    // 프로그레스바를 95%로 설정하고 애니메이션 효과
                    progressEl.style.width = '95%';
                    progressEl.style.backgroundColor = '#ffa500';
                    progressEl.style.background = 'linear-gradient(90deg, #ffa500 0%, #ff8c00 100%)';
                    
                    // 상태 메시지 업데이트
                    if (statusEl.textContent !== '매도 판정 확인 중') {
                        statusEl.textContent = '매도 판정 확인 중';
                        statusEl.className = 'rl-ai-status action-sell';
                        statusEl.style.color = '#ffa500';
                    }
                    
                    // step-4(매도) 업데이트
                    const step4El = document.getElementById(`step-4-${cardId}`);
                    if (step4El) {
                        step4El.classList.add('active');
                        const step4Label = step4El.querySelector('.step-label');
                        if (step4Label) {
                            step4Label.textContent = '매도 판정 확인 중';
                        }
                    }
                }
                
                // 강화학습 AI 분석 실행 (매도 판정 확인)
                const result = await aiAgent.analyzeRL(cardId);
                const messageEl = document.getElementById(`rl-ai-message-${cardId}`);
                
                // 현재 시간 기록
                const now = new Date();
                const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const dateStr = now.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' });
                const timestamp = `${dateStr} ${timeStr}`;
                
                if (result && result.action === 'SELL') {
                    console.log(`🔔 매수 판정 카드 ${cardId}에 대해 매도 판정 확인: SELL`);
                    
                    // 프로그레스바를 100%로 업데이트 (매도 판정 완료)
                    if (progressEl) {
                        progressEl.style.width = '100%';
                        progressEl.style.backgroundColor = '#0ecb81'; // 초록색
                        progressEl.style.background = 'linear-gradient(90deg, #0ecb81 0%, #10b981 100%)';
                    }
                    
                    // 매도 판정 처리
                    await this._executeAIAnalysis(cardId, result);
                } else {
                    // SELL 판정이 아니면 매도 대기 중으로 변경하고 이유 표시
                    if (statusEl && statusEl.textContent === '매도 판정 확인 중') {
                        statusEl.textContent = '매도 대기 중';
                        
                        const step4El = document.getElementById(`step-4-${cardId}`);
                        if (step4El) {
                            const step4Label = step4El.querySelector('.step-label');
                            if (step4Label) {
                                step4Label.textContent = '매도 대기';
                            }
                        }
                    }
                    
                    // 매도를 하지 않는 이유 메시지 업데이트
                    if (messageEl && result) {
                        const action = result.action || 'HOLD';
                        const reasoning = result.reasoning || '';
                        const confidence = result.confidence || result.action_prob * 100 || 0;
                        const analysisDetails = result.analysis_details || {};
                        const probBuy = result.action_probs?.BUY || 0;
                        const probSell = result.action_probs?.SELL || 0;
                        const probHold = result.action_probs?.HOLD || 0;
                        
                        // 매도를 하지 않는 이유 분석
                        let reasonText = '';
                        let reasonDetails = [];
                        
                        if (action === 'HOLD') {
                            reasonText = '매도 대기 중: 현재 시장 상황을 관찰 중';
                            if (probSell < 30) {
                                reasonDetails.push(`매도 확률 낮음 (${probSell.toFixed(1)}%)`);
                            }
                            if (probHold > 50) {
                                reasonDetails.push(`보유 확률 높음 (${probHold.toFixed(1)}%)`);
                            }
                        } else if (action === 'BUY') {
                            reasonText = '매도 대기 중: 추가 매수 기회 감지';
                            reasonDetails.push(`매수 확률 높음 (${probBuy.toFixed(1)}%)`);
                        } else {
                            reasonText = `매도 대기 중: ${action} 판정`;
                        }
                        
                        // 실시간 손익률 정보 추가
                        if (analysisDetails.pnl_percent !== null && analysisDetails.pnl_percent !== undefined) {
                            const pnlPercent = analysisDetails.pnl_percent;
                            if (pnlPercent > 0) {
                                reasonDetails.push(`수익률: +${pnlPercent.toFixed(2)}% (수익 보호 대기 중)`);
                            } else if (pnlPercent < -3) {
                                reasonDetails.push(`손실률: ${pnlPercent.toFixed(2)}% (손절 고려 중)`);
                            } else {
                                reasonDetails.push(`손익률: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`);
                            }
                        }
                        
                        // 판단 근거 추가
                        if (reasoning) {
                            const reasoningParts = reasoning.split(' | ').slice(0, 3); // 최대 3개만 표시
                            reasoningParts.forEach(part => {
                                if (part.trim() && !part.includes('매수 판정') && !part.includes('매도 판정')) {
                                    reasonDetails.push(part.trim());
                                }
                            });
                        }
                        
                        // 메시지 HTML 구성
                        let messageHtml = '<div class="rl-ai-message-content">';
                        messageHtml += `<div class="rl-ai-info-item" style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,165,0,0.3);">`;
                        messageHtml += `<span class="rl-ai-label" style="font-weight: bold; color: #ffa500;">⏳ 매도 대기 중</span>`;
                        messageHtml += `<span class="rl-ai-value" style="color: #888; font-size: 11px; margin-left: 8px;">${timestamp}</span>`;
                        messageHtml += `</div>`;
                        
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">상태</span><span class="rl-ai-value" style="color: #ffa500;">${reasonText}</span></div>`;
                        
                        // 현재 판정 정보
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">현재 판정</span><span class="rl-ai-value" style="color: ${action === 'BUY' ? '#0ecb81' : action === 'SELL' ? '#f6465d' : '#888'};">${action} (신뢰도: ${confidence.toFixed(1)}%)</span></div>`;
                        
                        // 액션 확률
                        messageHtml += `<div class="rl-ai-info-item"><span class="rl-ai-label">📊 액션 확률</span><span class="rl-ai-value">BUY: ${probBuy.toFixed(1)}%, SELL: ${probSell.toFixed(1)}%, HOLD: ${probHold.toFixed(1)}%</span></div>`;
                        
                        // 매도를 하지 않는 이유
                        if (reasonDetails.length > 0) {
                            messageHtml += `<div class="rl-ai-info-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">`;
                            messageHtml += `<span class="rl-ai-label" style="font-weight: bold; color: #ffa500;">❓ 매도 대기 이유</span>`;
                            messageHtml += `</div>`;
                            reasonDetails.forEach(detail => {
                                messageHtml += `<div class="rl-ai-info-item" style="padding-left: 12px;"><span class="rl-ai-value" style="color: #aaa; font-size: 12px;">• ${detail}</span></div>`;
                            });
                        }
                        
                        messageHtml += '</div>';
                        messageEl.innerHTML = messageHtml;

                        requestSellMetricsAndRender(cardId);
                    }
                }
            } catch (error) {
                console.error(`매도 판정 확인 실패: ${cardId}`, error);
                
                // 에러 발생 시 매도 대기 중으로 복구
                const statusEl = document.getElementById(`rl-ai-status-${cardId}`);
                if (statusEl && statusEl.textContent === '매도 판정 확인 중') {
                    statusEl.textContent = '매도 대기 중';
                }
            }
            
            // 순차 처리 (너무 빠르게 실행하지 않도록)
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    },
    
    /**
     * 생산 카드 AI 분석 순차 실행 (반복)
     * 강화학습 AI는 큐 시스템을 통해 순차 실행되며, 기본 AI는 병렬 실행 가능
     * 분석 완료되고 검증이 완료되지 않은 카드는 건너뜀
     */
    async startSequentialAIAnalysis(cards) {
        // 이미 실행 중이면 중복 실행 방지
        if (this.isSequentialAnalysisRunning) {
            console.log('⚠️ 순차 AI 분석이 이미 실행 중입니다. 중복 실행 방지.');
            return;
        }
        
        if (!cards || cards.length === 0) {
            if (typeof resetAIProgress === 'function') {
                resetAIProgress();
            }
            this.updateProductionStats([]);
            return;
        }
        
        // 실행 중 플래그 설정
        this.isSequentialAnalysisRunning = true;
        
        // 분석이 필요한 카드만 필터링 (분석 완료되었고 검증이 완료되지 않은 카드는 제외)
        const cardsToAnalyze = cards.filter(card => {
            const cardId = card.card_id;
            const isVerified = this.isCardVerified(card);
            const isCompleted = this.isAnalysisCompleted(cardId);
            
            // 분석 완료되었고 검증이 완료되지 않은 카드는 건너뛰기
            if (isCompleted && !isVerified) {
                console.log(`⏭️ 카드 ${cardId} 건너뛰기: 분석 완료되었으나 검증 대기 중`);
                return false;
            }
            
            return true;
        });
        
        console.log(`🧠 강화학습 AI 분석 시작: 총 ${cards.length}개 카드 중 ${cardsToAnalyze.length}개 분석 필요 (${cards.length - cardsToAnalyze.length}개 건너뜀)`);
        const total = cardsToAnalyze.length;
        
        if (total === 0) {
            console.log(`✅ 분석할 카드가 없습니다. 모든 카드가 분석 완료되었거나 검증 대기 중입니다.`);
            if (typeof updateAIProgress === 'function') {
                updateAIProgress(100, '✅ 모든 카드 분석 완료 또는 검증 대기 중');
            }
            this.updateProductionStats(cards, -1);
            this.isSequentialAnalysisRunning = false; // 플래그 해제
            return;
        }
        
        if (typeof updateAIProgress === 'function') {
            updateAIProgress(5, `🤖 강화학습 AI 분석 준비 중... (${total}개)`);
        }
        
        // 통계 업데이트
        this.updateProductionStats(cards, 0);
        
        // 각 카드마다 강화학습 AI 분석만 요청 (Zone 분석은 생산 시 1번만 실행)
        try {
            for (let i = 0; i < total; i++) {
                const card = cardsToAnalyze[i];
                const cardId = card.card_id;
                
                try {
                    console.log(`📋 [${i + 1}/${total}] 카드 ${cardId} 강화학습 AI 분석 요청...`);
                    
                    // 통계 업데이트 (현재 순회 인덱스)
                    this.updateProductionStats(cards, i);
                    
                    if (typeof updateAIProgress === 'function') {
                        const progress = 10 + Math.floor((i / total) * 80);
                        updateAIProgress(progress, `🤖 강화학습 AI 분석 중... (${i + 1}/${total})`);
                    }
                    
                    // Zone 분석은 생산 시 1번만 실행되므로 여기서는 제외
                    // 강화학습 AI 분석만 실행
                    
                    // 강화학습 AI 분석은 큐에 추가 (순차 실행 보장)
                    this.startAIAnalysis(cardId);
                    
                    // 다음 카드로 넘어가기 전 지연 (서버 부하 방지 및 순회 속도 조절)
                    if (i < total - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));  // 2초 대기
                    }
                    
                } catch (error) {
                    console.error(`❌ [${i + 1}/${total}] 카드 ${cardId} AI 분석 요청 실패:`, error);
                    // 개별 카드 실패는 전체를 중단하지 않음
                }
            }
        } catch (error) {
            console.error('❌ 순차 AI 분석 실행 중 오류:', error);
            // 에러 발생 시에도 플래그 해제
            this.isSequentialAnalysisRunning = false;
            throw error;
        }
        
        console.log(`✅ 모든 카드 AI 분석 요청 완료 (강화학습 AI는 큐에서 순차 처리 중)`);
        if (typeof updateAIProgress === 'function') {
            updateAIProgress(100, '✅ AI 분석 완료');
        }
        
        // 최종 통계 업데이트
        this.updateProductionStats(cards, -1);
        
        // 실행 중 플래그 해제
        this.isSequentialAnalysisRunning = false;
    },
    
    /**
     * 생산 카드 데이터 업데이트 (DOM 요소는 유지)
     */
    async updateProductionCardData(cardEl, card) {
        // 카드 정보 업데이트
        const infoItems = cardEl.querySelectorAll('.info-item');
        infoItems.forEach(item => {
            const label = item.querySelector('.info-label')?.textContent;
            const valueEl = item.querySelector('.info-value');
            
            if (label && valueEl) {
                switch (label.trim()) {
                    case '점수':
                        const score = card.score || 100.0;
                        const scoreColor = CardChart.getScoreColor(score);
                        valueEl.textContent = score.toFixed(2);
                        valueEl.style.color = scoreColor;
                        break;
                    case '손익률':
                        const historyList = card.history_list || [];
                        let entryPrice = 0.0;
                        let currentPrice = 0.0;
                        let pnlPercent = 0.0;
                        
                        // SOLD 히스토리 확인
                        const soldHistory = this.getLatestSoldHistory(card);
                        if (soldHistory) {
                            entryPrice = soldHistory.entry_price || 0;
                            currentPrice = soldHistory.exit_price || 0;
                            pnlPercent = soldHistory.pnl_percent || 0;
                        } else {
                            // BUY 히스토리에서 진입 가격 찾기
                            for (const hist of historyList) {
                                if (hist.type === 'BUY' && hist.entry_price) {
                                    entryPrice = hist.entry_price;
                                    break;
                                }
                            }
                            
                            // 현재 가격 가져오기
                            if (card.chart_data && card.chart_data.prices && card.chart_data.prices.length > 0) {
                                currentPrice = card.chart_data.prices[card.chart_data.prices.length - 1];
                            }
                            
                            if (entryPrice > 0 && currentPrice > 0) {
                                pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                            }
                        }
                        
                        if (pnlPercent !== 0) {
                            valueEl.textContent = `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`;
                            valueEl.className = `info-value ${pnlPercent >= 0 ? 'profit' : 'loss'}`;
                        }
                        break;
                }
            }
        });
        
        // 차트는 updateCardCharts에서 처리되므로 여기서는 스킵
    },
    
    /**
     * 생산 카드 순차 렌더링
     */
    async renderProductionCardsSequentially(cards, container) {
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i];
            
            // 카드 요소 생성
            const cardEl = this.renderProductionCard(card);
            
            if (cardEl) {
                // 초기에는 숨김 상태로 추가
                cardEl.style.opacity = '0';
                cardEl.style.transform = 'translateY(20px)';
                cardEl.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                
                container.appendChild(cardEl);
                
                // 약간의 지연 후 표시 (순차적 애니메이션)
                await new Promise(resolve => {
                    setTimeout(() => {
                        cardEl.style.opacity = '1';
                        cardEl.style.transform = 'translateY(0)';
                        resolve();
                    }, i * 150); // 각 카드마다 150ms 지연
                });
            }
        }
    }
};

// 카드 액션 핸들러
async function handleCardAction(cardId, action) {
    try {
        switch (action) {
            case 'buy':
                // BUY 로직
                console.log('BUY:', cardId);
                const buyResult = await API.post(`/cards/${cardId}/buy`, {});
                if (buyResult && buyResult.success) {
                    console.log(`✅ 매수 완료! 진입 가격: ${buyResult.entry_price?.toLocaleString()} KRW, 수량: ${buyResult.qty?.toFixed(8)} BTC`);
                    // 토스트 메시지 표시 (alert 대신)
                    showToast(`매수 완료! 진입 가격: ${buyResult.entry_price?.toLocaleString()} KRW`, 'success');
                }
                await refreshCards();
                break;
            case 'sell':
                // SELL 로직 (1분 대기 프로그레스바 포함)
                console.log('SELL:', cardId);
                if (!confirm('매도하시겠습니까? 매도 후 검증 완료 처리됩니다.\n\n1분간 대기 후 매도가 실행됩니다.')) {
                    return;
                }
                
                // SELL 시작
                await startSellWithProgress(cardId);
                break;
            case 'discard':
                // 폐기 로직 (1분 대기 프로그레스바 포함)
                console.log('DISCARD:', cardId);
                
                // 예측 성공 여부와 관계없이 제거 가능
                if (!confirm('이 카드를 폐기하시겠습니까?\n\n1분간 대기 후 카드가 제거됩니다.')) {
                    return;
                }
                
                // DELETE 시작
                await startDeleteWithProgress(cardId);
                break;
        }
    } catch (error) {
        console.error('카드 액션 실패:', error);
        const errorMessage = error.message || '알 수 없는 오류가 발생했습니다.';
        console.error('작업 실패:', errorMessage);
        // 토스트 메시지 표시 (alert 대신)
        showToast('작업 실패: ' + errorMessage, 'error');
    }
}

// SELL 진행 상태 추적
const sellProgressTrackers = {};  // {cardId: {statusInterval, sellInterval}}

// SELL 작업 시작 (1분 대기 프로그레스바 포함)
async function startSellWithProgress(cardId) {
    // 이미 진행 중이면 중복 실행 방지
    if (sellProgressTrackers[cardId]) {
        console.log(`⏸️ SELL 진행 중 중복 요청 차단: ${cardId}`);
        return;
    }
    
    try {
        // SELL 시작 API 호출
        const startResult = await API.post(`/cards/${cardId}/sell/start`, {});
        if (!startResult || !startResult.success) {
            showToast('SELL 시작 실패: ' + (startResult?.error || '알 수 없는 오류'), 'error');
            return;
        }
        
        // 프로그레스바 표시
        showSellProgressBar(cardId);
        
        // 상태 확인 주기적으로 실행
        const checkInterval = setInterval(async () => {
            try {
                const statusResult = await API.get(`/cards/${cardId}/sell/status`);
                if (statusResult && statusResult.success) {
                    const status = statusResult.status;
                    const progress = statusResult.progress || 0;
                    
                    // 프로그레스바 업데이트
                    updateSellProgressBar(cardId, progress, status);
                    
                    // 완료된 경우
                    if (status === 'completed') {
                        const tracker = sellProgressTrackers[cardId];
                        if (tracker) {
                            if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                            if (tracker.sellInterval) clearInterval(tracker.sellInterval);
                        }
                        delete sellProgressTrackers[cardId];
                        
                        // 프로그레스바를 완료 상태로 업데이트
                        updateSellProgressBar(cardId, 100, 'completed');
                        
                        // 1초 후 프로그레스바 숨기기 및 검증 완료 처리
                        setTimeout(async () => {
                            hideSellProgressBar(cardId);
                            
                            // 검증 완료 처리
                            console.log(`✅ 매도 완료: ${cardId}, 검증 완료 처리`);
                            
                            // 검증 카드 목록 먼저 새로고침 (매도 완료된 카드가 검증 카드에 표시되도록)
                            if (typeof refreshVerificationCards === 'function') {
                                console.log(`🔄 검증 카드 목록 새로고침 시작: ${cardId}`);
                                await refreshVerificationCards();
                                console.log(`✅ 검증 카드 목록 새로고침 완료: ${cardId}`);
                            }
                            
                            // 카드 목록 새로고침 (검증 완료된 카드는 생산 카드에서 제거됨)
                            await refreshCards();
                            
                            // 검증 탭으로 자동 이동하지 않음 (사용자가 원할 때 직접 이동)
                            
                            showToast('✅ 매도 완료! 검증 완료 처리되었습니다.', 'success');
                        }, 1000);
                    }
                    // 취소된 경우
                    else if (status === 'cancelled') {
                        const tracker = sellProgressTrackers[cardId];
                        if (tracker) {
                            if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                            if (tracker.sellInterval) clearInterval(tracker.sellInterval);
                        }
                        delete sellProgressTrackers[cardId];
                        hideSellProgressBar(cardId);
                        showToast('SELL 작업이 취소되었습니다.', 'warning');
                    }
                } else if (statusResult && statusResult.status === 'not_started') {
                    // 시작되지 않은 경우 (이미 완료되었을 수 있음)
                    const tracker = sellProgressTrackers[cardId];
                    if (tracker) {
                        if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                        if (tracker.sellInterval) clearInterval(tracker.sellInterval);
                    }
                    delete sellProgressTrackers[cardId];
                    hideSellProgressBar(cardId);
                }
            } catch (error) {
                console.error('SELL 상태 확인 실패:', error);
            }
        }, 500);  // 0.5초마다 확인
        
        // 주기적으로 SELL 실행 시도 (1분이 지나면 자동 실행)
        const sellInterval = setInterval(async () => {
            try {
                const sellResult = await API.post(`/cards/${cardId}/sell`, {});
                
                // 202 응답 (처리 중) 또는 success가 false인 경우
                if (sellResult && (sellResult._status === 202 || !sellResult.success)) {
                    if (sellResult.status === 'waiting' || sellResult.status === 'processing') {
                        // 아직 대기 중 또는 처리 중 - 프로그레스바만 업데이트
                        updateSellProgressBar(cardId, sellResult.progress || 0, sellResult.status);
                    } else if (sellResult.cancelled) {
                        // 취소됨
                        if (checkInterval) clearInterval(checkInterval);
                        if (sellInterval) clearInterval(sellInterval);
                        delete sellProgressTrackers[cardId];
                        hideSellProgressBar(cardId);
                        showToast('SELL 작업이 취소되었습니다.', 'warning');
                    } else if (sellResult.error) {
                        // 오류 발생
                        console.error('SELL 오류:', sellResult.error);
                        if (checkInterval) clearInterval(checkInterval);
                        if (sellInterval) clearInterval(sellInterval);
                        delete sellProgressTrackers[cardId];
                        hideSellProgressBar(cardId);
                        showToast('SELL 실패: ' + sellResult.error, 'error');
                    }
                }
                // success가 true인 경우 (완료)
                else if (sellResult && sellResult.success) {
                    // SELL 완료
                    console.log('✅ SELL 완료:', sellResult);
                    
                    // 프로그레스바를 완료 상태로 업데이트
                    updateSellProgressBar(cardId, 100, 'completed');
                    
                    // 인터벌 정리
                    if (checkInterval) clearInterval(checkInterval);
                    if (sellInterval) clearInterval(sellInterval);
                    delete sellProgressTrackers[cardId];
                    
                    // 완료 메시지
                    const message = `매도 완료! 청산 가격: ${sellResult.exit_price?.toLocaleString()} KRW, 손익률: ${sellResult.pnl_percent >= 0 ? '+' : ''}${sellResult.pnl_percent?.toFixed(2)}%`;
                    console.log(`✅ ${message}`);
                    console.log(`   손익 금액: ${sellResult.pnl_amount >= 0 ? '+' : ''}${sellResult.pnl_amount?.toLocaleString()} KRW`);
                    
                    // 1초 후 프로그레스바 숨기기 및 검증 완료 처리
                    setTimeout(async () => {
                        hideSellProgressBar(cardId);
                        
                        // 검증 완료 처리 (매도 완료 시 항상 검증 완료)
                        console.log(`✅ 매도 완료: ${cardId}, 검증 완료 처리`);
                        
                        // 검증 카드 목록 먼저 새로고침 (매도 완료된 카드가 검증 카드에 표시되도록)
                        if (typeof refreshVerificationCards === 'function') {
                            console.log(`🔄 검증 카드 목록 새로고침 시작: ${cardId}`);
                            await refreshVerificationCards();
                            console.log(`✅ 검증 카드 목록 새로고침 완료: ${cardId}`);
                        }
                        
                        // 카드 목록 새로고침 (검증 완료된 카드는 생산 카드에서 제거됨)
                        await refreshCards();
                        
                        // 검증 탭으로 자동 이동하지 않음 (사용자가 원할 때 직접 이동)
                        
                        showToast('✅ 매도 완료! 검증 완료 처리되었습니다.', 'success');
                    }, 1000);
                }
            } catch (error) {
                console.error('SELL 실행 시도 실패:', error);
                // 네트워크 오류 등은 무시하고 계속 시도
            }
        }, 2000);  // 2초마다 SELL 실행 시도
        
        sellProgressTrackers[cardId] = {
            statusInterval: checkInterval,
            sellInterval: sellInterval
        };
        
    } catch (error) {
        console.error('SELL 시작 실패:', error);
        showToast('SELL 시작 실패: ' + error.message, 'error');
    }
}

// 실제 SELL 실행 (완료 후 처리) - 이제 사용되지 않음 (startSellWithProgress에서 직접 처리)
async function executeSell(cardId) {
    // 이 함수는 더 이상 사용되지 않습니다.
    // startSellWithProgress에서 직접 완료 처리를 합니다.
    console.warn('executeSell 함수는 더 이상 사용되지 않습니다.');
}

// SELL 취소
async function cancelSell(cardId) {
    try {
        const cancelResult = await API.post(`/cards/${cardId}/sell/cancel`, {});
        
        if (cancelResult && cancelResult.success) {
            // 진행 추적 중지
            const tracker = sellProgressTrackers[cardId];
            if (tracker) {
                if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                if (tracker.sellInterval) clearInterval(tracker.sellInterval);
                delete sellProgressTrackers[cardId];
            }
            
            // 프로그레스바 숨기기
            hideSellProgressBar(cardId);
            
            showToast('SELL 작업이 취소되었습니다.', 'info');
        } else {
            showToast('SELL 취소 실패: ' + (cancelResult?.message || '알 수 없는 오류'), 'error');
        }
    } catch (error) {
        console.error('SELL 취소 실패:', error);
        showToast('SELL 취소 실패: ' + error.message, 'error');
    }
}

// SELL 프로그레스바 표시 (카드 내부에 표시)
function showSellProgressBar(cardId) {
    // 기존 프로그레스바 제거
    const existing = document.getElementById(`sell-progress-${cardId}`);
    if (existing) {
        existing.remove();
    }
    
    // 카드 요소 찾기
    const cardEl = document.getElementById(`card-${cardId}`);
    if (!cardEl) {
        console.warn(`카드를 찾을 수 없습니다: card-${cardId}`);
        return;
    }
    
    // card-actions 요소 찾기
    const cardActions = cardEl.querySelector('.card-actions');
    if (!cardActions) {
        console.warn(`card-actions를 찾을 수 없습니다: card-${cardId}`);
        return;
    }
    
    // 프로그레스바 생성
    const progressBar = document.createElement('div');
    progressBar.id = `sell-progress-${cardId}`;
    progressBar.className = 'sell-progress-container';
    progressBar.innerHTML = `
        <div class="sell-progress-content">
            <div class="sell-progress-header">
                <span class="sell-progress-title">📉 매도 진행 중...</span>
                <button class="sell-progress-cancel-btn" onclick="cancelSell('${cardId}')">취소</button>
            </div>
            <div class="sell-progress-bar-wrapper">
                <div class="sell-progress-bar" id="sell-progress-bar-${cardId}">
                    <div class="sell-progress-fill" id="sell-progress-fill-${cardId}" style="width: 0%"></div>
                </div>
                <div class="sell-progress-text" id="sell-progress-text-${cardId}">대기 중... 60초 남음</div>
            </div>
        </div>
    `;
    
    // card-actions 앞에 삽입
    cardActions.parentNode.insertBefore(progressBar, cardActions);
    
    // 스타일 추가 (한 번만)
    if (!document.getElementById('sell-progress-styles')) {
        const style = document.createElement('style');
        style.id = 'sell-progress-styles';
        style.textContent = `
            .sell-progress-container {
                margin: 15px 0;
                padding: 15px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(0, 209, 255, 0.3);
                border-radius: 8px;
            }
            .sell-progress-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .sell-progress-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .sell-progress-title {
                font-size: 14px;
                font-weight: 600;
                color: #00d1ff;
            }
            .sell-progress-cancel-btn {
                padding: 4px 12px;
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: background 0.2s;
            }
            .sell-progress-cancel-btn:hover {
                background: #dc2626;
            }
            .sell-progress-bar-wrapper {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .sell-progress-bar {
                width: 100%;
                height: 20px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                overflow: hidden;
                position: relative;
            }
            .sell-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #3b82f6, #10b981);
                border-radius: 10px;
                transition: width 0.3s ease;
                position: relative;
            }
            .sell-progress-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                animation: shimmer 1.5s infinite;
            }
            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            .sell-progress-text {
                text-align: center;
                font-size: 12px;
                color: #00d1ff;
                font-weight: 500;
            }
        `;
        document.head.appendChild(style);
    }
}

// 점수 히스토리 저장/차트 갱신 (RL 점수 또는 PnL 기반 점수 반영)
function updateScoreHistory(cardId, scoreValue) {
    const scoreKey = `realtime_scores_${cardId}`;
    let scores = [];
    try {
        scores = JSON.parse(localStorage.getItem(scoreKey) || '[]');
    } catch (e) {
        scores = [];
    }
    scores.push(scoreValue);
    if (scores.length > 200) {
        scores = scores.slice(-200); // 전 데이터 유지 (최대 200개까지)
    }
    localStorage.setItem(scoreKey, JSON.stringify(scores));
    
    const scoreCanvas = document.getElementById(`score-chart-${cardId}`);
    if (scoreCanvas) {
        CardChart.drawScoreChart(`score-chart-${cardId}`, scores);
    }
}

// SELL 프로그레스바 업데이트
function updateSellProgressBar(cardId, progress, status) {
    const fill = document.getElementById(`sell-progress-fill-${cardId}`);
    const text = document.getElementById(`sell-progress-text-${cardId}`);
    
    if (fill) {
        fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        
        // 완료 상태일 때는 초록색으로 변경
        if (status === 'completed') {
            fill.style.backgroundColor = '#4caf50';
        } else if (status === 'processing') {
            fill.style.backgroundColor = '#ff9800';
        } else {
            fill.style.backgroundColor = '#2196f3';
        }
    }
    
    if (text) {
        if (status === 'waiting') {
            const remaining = Math.max(0, 60 - Math.floor((progress / 100) * 60));
            text.textContent = `대기 중... ${remaining}초 남음`;
        } else if (status === 'processing') {
            text.textContent = `매도 처리 중... ${progress}%`;
        } else if (status === 'completed') {
            text.textContent = '✅ 매도 완료!';
        } else if (status === 'cancelled') {
            text.textContent = '❌ 취소됨';
        } else {
            text.textContent = `진행 중... ${progress}%`;
        }
    }
}

// SELL 프로그레스바 숨기기
function hideSellProgressBar(cardId) {
    const progressBar = document.getElementById(`sell-progress-${cardId}`);
    if (progressBar) {
        progressBar.remove();
    }
}

// 카드 제거 진행 상태 추적
const deleteProgressTrackers = {};  // {cardId: {statusInterval, deleteInterval}}

// 카드 제거 작업 시작 (1분 대기 프로그레스바 포함)
async function startDeleteWithProgress(cardId) {
    // 이미 진행 중이면 중복 실행 방지
    if (deleteProgressTrackers[cardId]) {
        console.log(`⏸️ DELETE 진행 중 중복 요청 차단: ${cardId}`);
        return;
    }
    
    try {
        // DELETE 시작 API 호출
        const startResult = await API.post(`/cards/${cardId}/delete/start`, {});
        if (!startResult || !startResult.success) {
            showToast('DELETE 시작 실패: ' + (startResult?.error || '알 수 없는 오류'), 'error');
            return;
        }
        
        // 프로그레스바 표시
        showDeleteProgressBar(cardId);
        
        // 상태 확인 주기적으로 실행
        const checkInterval = setInterval(async () => {
            try {
                const statusResult = await API.get(`/cards/${cardId}/delete/status`);
                if (statusResult && statusResult.success) {
                    const status = statusResult.status;
                    const progress = statusResult.progress || 0;
                    
                    // 프로그레스바 업데이트
                    updateDeleteProgressBar(cardId, progress, status);
                    
                    // 완료된 경우
                    if (status === 'completed') {
                        const tracker = deleteProgressTrackers[cardId];
                        if (tracker) {
                            if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                            if (tracker.deleteInterval) clearInterval(tracker.deleteInterval);
                        }
                        delete deleteProgressTrackers[cardId];
                        
                        // 프로그레스바를 완료 상태로 업데이트
                        updateDeleteProgressBar(cardId, 100, 'completed');
                        
                        // 1초 후 프로그레스바 숨기기
                        setTimeout(async () => {
                            hideDeleteProgressBar(cardId);
                            await refreshCards();
                            showToast('✅ 카드 제거 완료!', 'success');
                        }, 1000);
                    }
                    // 취소된 경우
                    else if (status === 'cancelled') {
                        const tracker = deleteProgressTrackers[cardId];
                        if (tracker) {
                            if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                            if (tracker.deleteInterval) clearInterval(tracker.deleteInterval);
                        }
                        delete deleteProgressTrackers[cardId];
                        hideDeleteProgressBar(cardId);
                        showToast('DELETE 작업이 취소되었습니다.', 'warning');
                    }
                } else if (statusResult && statusResult.status === 'not_started') {
                    // 시작되지 않은 경우 (이미 완료되었을 수 있음)
                    const tracker = deleteProgressTrackers[cardId];
                    if (tracker) {
                        if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                        if (tracker.deleteInterval) clearInterval(tracker.deleteInterval);
                    }
                    delete deleteProgressTrackers[cardId];
                    hideDeleteProgressBar(cardId);
                }
            } catch (error) {
                console.error('DELETE 상태 확인 실패:', error);
            }
        }, 500);  // 0.5초마다 확인
        
        // 주기적으로 DELETE 실행 시도 (1분이 지나면 자동 실행)
        const deleteInterval = setInterval(async () => {
            try {
                const deleteResult = await API.delete(`/cards/${cardId}`);
                
                // 성공적으로 제거된 경우
                if (deleteResult && (deleteResult.success || deleteResult._status === 200 || deleteResult._status === 204)) {
                    // DELETE 완료
                    console.log('✅ DELETE 완료:', deleteResult);
                    
                    // 프로그레스바를 완료 상태로 업데이트
                    updateDeleteProgressBar(cardId, 100, 'completed');
                    
                    // 인터벌 정리
                    if (checkInterval) clearInterval(checkInterval);
                    if (deleteInterval) clearInterval(deleteInterval);
                    delete deleteProgressTrackers[cardId];
                    
                    // 1초 후 프로그레스바 숨기기
                    setTimeout(async () => {
                        hideDeleteProgressBar(cardId);
                        await refreshCards();
                        showToast('✅ 카드 제거 완료!', 'success');
                    }, 1000);
                } else if (deleteResult && deleteResult._status === 202) {
                    // 202 응답 (처리 중) - 프로그레스바만 업데이트
                    updateDeleteProgressBar(cardId, deleteResult.progress || 0, deleteResult.status || 'processing');
                } else {
                    // 오류 발생
                    const errorMsg = deleteResult?.error || deleteResult?.message || '알 수 없는 오류';
                    console.error('DELETE 오류:', errorMsg);
                    
                    // 예측 성공 여부와 관계없이 모든 오류는 계속 시도 (네트워크 오류 등)
                    console.warn('DELETE 실행 시도 실패, 재시도 중:', errorMsg);
                }
            } catch (error) {
                const statusCode = error?.status || error?.statusCode;
                const errorData = error?.errorData || {};
                const errorMsg = errorData?.error || error?.message || String(error);
                const cardIdInError = errorData?.card_id || cardId;
                
                // 예측 성공 여부와 관계없이 모든 오류는 계속 시도 (네트워크 오류 등)
                // 403 오류도 재시도 (서버 측에서 예측 성공 체크를 제거했을 수 있음)
                console.error('DELETE 실행 시도 실패, 재시도 중:', error);
            }
        }, 2000);  // 2초마다 DELETE 실행 시도
        
        deleteProgressTrackers[cardId] = {
            statusInterval: checkInterval,
            deleteInterval: deleteInterval
        };
        
    } catch (error) {
        console.error('DELETE 시작 실패:', error);
        showToast('DELETE 시작 실패: ' + error.message, 'error');
    }
}

// DELETE 프로그레스바 표시 (카드 내부에 표시)
function showDeleteProgressBar(cardId) {
    // 기존 프로그레스바 제거
    const existing = document.getElementById(`delete-progress-${cardId}`);
    if (existing) {
        existing.remove();
    }
    
    // 카드 요소 찾기
    const cardEl = document.getElementById(`card-${cardId}`);
    if (!cardEl) {
        console.warn(`카드를 찾을 수 없습니다: card-${cardId}`);
        return;
    }
    
    // card-actions 요소 찾기
    const cardActions = cardEl.querySelector('.card-actions');
    if (!cardActions) {
        // card-actions가 없으면 rl-ai-container 앞에 삽입
        const rlAiContainer = cardEl.querySelector('.rl-ai-container');
        if (rlAiContainer) {
            const progressBar = document.createElement('div');
            progressBar.id = `delete-progress-${cardId}`;
            progressBar.className = 'delete-progress-container';
            progressBar.innerHTML = `
                <div class="delete-progress-content">
                    <div class="delete-progress-header">
                        <span class="delete-progress-title">🗑️ 카드 제거 진행 중...</span>
                        <button class="delete-progress-cancel-btn" onclick="cancelDelete('${cardId}')">취소</button>
                    </div>
                    <div class="delete-progress-bar-wrapper">
                        <div class="delete-progress-bar" id="delete-progress-bar-${cardId}">
                            <div class="delete-progress-fill" id="delete-progress-fill-${cardId}" style="width: 0%"></div>
                        </div>
                        <div class="delete-progress-text" id="delete-progress-text-${cardId}">대기 중... 60초 남음</div>
                    </div>
                </div>
            `;
            rlAiContainer.parentNode.insertBefore(progressBar, rlAiContainer);
        } else {
            console.warn(`rl-ai-container를 찾을 수 없습니다: card-${cardId}`);
            return;
        }
    } else {
        // card-actions 앞에 삽입
        const progressBar = document.createElement('div');
        progressBar.id = `delete-progress-${cardId}`;
        progressBar.className = 'delete-progress-container';
        progressBar.innerHTML = `
            <div class="delete-progress-content">
                <div class="delete-progress-header">
                    <span class="delete-progress-title">🗑️ 카드 제거 진행 중...</span>
                    <button class="delete-progress-cancel-btn" onclick="cancelDelete('${cardId}')">취소</button>
                </div>
                <div class="delete-progress-bar-wrapper">
                    <div class="delete-progress-bar" id="delete-progress-bar-${cardId}">
                        <div class="delete-progress-fill" id="delete-progress-fill-${cardId}" style="width: 0%"></div>
                    </div>
                    <div class="delete-progress-text" id="delete-progress-text-${cardId}">대기 중... 60초 남음</div>
                </div>
            </div>
        `;
        cardActions.parentNode.insertBefore(progressBar, cardActions);
    }
    
    // 스타일 추가 (한 번만)
    if (!document.getElementById('delete-progress-styles')) {
        const style = document.createElement('style');
        style.id = 'delete-progress-styles';
        style.textContent = `
            .delete-progress-container {
                margin: 15px 0;
                padding: 15px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 8px;
            }
            .delete-progress-content {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .delete-progress-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .delete-progress-title {
                font-size: 14px;
                font-weight: 600;
                color: #ef4444;
            }
            .delete-progress-cancel-btn {
                padding: 4px 12px;
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: background 0.2s;
            }
            .delete-progress-cancel-btn:hover {
                background: #dc2626;
            }
            .delete-progress-bar-wrapper {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .delete-progress-bar {
                width: 100%;
                height: 20px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                overflow: hidden;
                position: relative;
            }
            .delete-progress-fill {
                height: 100%;
                background: linear-gradient(90deg, #ef4444, #dc2626);
                border-radius: 10px;
                transition: width 0.3s ease;
                position: relative;
            }
            .delete-progress-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                animation: shimmer 1.5s infinite;
            }
            .delete-progress-text {
                text-align: center;
                font-size: 12px;
                color: #ef4444;
                font-weight: 500;
            }
        `;
        document.head.appendChild(style);
    }
}

// DELETE 프로그레스바 업데이트
function updateDeleteProgressBar(cardId, progress, status) {
    const fill = document.getElementById(`delete-progress-fill-${cardId}`);
    const text = document.getElementById(`delete-progress-text-${cardId}`);
    
    if (fill) {
        fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        
        // 완료 상태일 때는 초록색으로 변경
        if (status === 'completed') {
            fill.style.backgroundColor = '#4caf50';
        } else if (status === 'processing') {
            fill.style.backgroundColor = '#ff9800';
        } else {
            fill.style.backgroundColor = '#ef4444';
        }
    }
    
    if (text) {
        if (status === 'waiting') {
            const remaining = Math.max(0, 60 - Math.floor((progress / 100) * 60));
            text.textContent = `대기 중... ${remaining}초 남음`;
        } else if (status === 'processing') {
            text.textContent = `카드 제거 처리 중... ${progress}%`;
        } else if (status === 'completed') {
            text.textContent = '✅ 카드 제거 완료!';
        } else if (status === 'cancelled') {
            text.textContent = '❌ 취소됨';
        } else {
            text.textContent = `진행 중... ${progress}%`;
        }
    }
}

// DELETE 프로그레스바 숨기기
function hideDeleteProgressBar(cardId) {
    const progressBar = document.getElementById(`delete-progress-${cardId}`);
    if (progressBar) {
        progressBar.remove();
    }
}

// DELETE 취소
async function cancelDelete(cardId) {
    try {
        const cancelResult = await API.post(`/cards/${cardId}/delete/cancel`, {});
        
        if (cancelResult && cancelResult.success) {
            // 진행 추적 중지
            const tracker = deleteProgressTrackers[cardId];
            if (tracker) {
                if (tracker.statusInterval) clearInterval(tracker.statusInterval);
                if (tracker.deleteInterval) clearInterval(tracker.deleteInterval);
                delete deleteProgressTrackers[cardId];
            }
            
            // 프로그레스바 숨기기
            hideDeleteProgressBar(cardId);
            
            showToast('DELETE 작업이 취소되었습니다.', 'info');
        } else {
            showToast('DELETE 취소 실패: ' + (cancelResult?.message || '알 수 없는 오류'), 'error');
        }
    } catch (error) {
        console.error('DELETE 취소 실패:', error);
        showToast('DELETE 취소 실패: ' + error.message, 'error');
    }
}

// 강화학습 AI 행동 실행
async function executeRLAction(cardId, action) {
    try {
        console.log(`RL Action: ${action} for card ${cardId}`);
        
        // SELL 액션은 1분 대기 프로그레스바가 있는 startSellWithProgress 사용
        if (action === 'SELL') {
            console.log(`🔔 SELL 액션: 1분 대기 프로그레스바 시작`);
            await startSellWithProgress(cardId);
            return;
        }
        
        // DELETE 액션은 1분 대기 프로그레스바가 있는 startDeleteWithProgress 사용
        if (action === 'DELETE') {
            console.log(`🔔 DELETE 액션: 1분 대기 프로그레스바 시작`);
            await startDeleteWithProgress(cardId);
            return;
        }
        
        // 다른 액션은 기존 방식대로 처리
        const result = await API.executeRLAction(cardId, action);
        
        if (result && result.success) {
            // 행동 버튼 업데이트
            const actionButtons = document.querySelectorAll(`#rl-ai-${cardId} .rl-action-btn`);
            actionButtons.forEach(btn => {
                btn.classList.remove('active');
                if (btn.id.includes(action)) {
                    btn.classList.add('active');
                }
            });
            
            // 카드 목록 새로고침 (생산 카드와 검증 카드 모두)
            await refreshCards();
            await refreshVerificationCards();
        }
    } catch (error) {
        console.error('RL 행동 실행 실패:', error);
        console.error('작업 실패:', error.message);
        // 토스트 메시지 표시 (alert 대신)
        showToast('작업 실패: ' + error.message, 'error');
    }
}

// 카드 복원
async function restoreCard(cardId) {
    try {
        // 복원 로직
        console.log('카드 복원:', cardId);
    } catch (error) {
        console.error('카드 복원 실패:', error);
    }
}


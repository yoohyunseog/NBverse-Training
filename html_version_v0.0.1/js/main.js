// 메인 애플리케이션
let updateIntervals = {};
let currentTab = 0;
let realTradingEnabled = false;

// 토스트 메시지 표시 함수 (alert 대신 사용)
function showToast(message, type = 'info') {
    // 기존 토스트 제거
    const existingToast = document.querySelector('.toast-message');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 토스트 요소 생성
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.textContent = message;
    
    // 스타일 설정
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideIn 0.3s ease-out;
        max-width: 400px;
        word-wrap: break-word;
    `;
    
    // 타입별 색상
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6'
    };
    toast.style.backgroundColor = colors[type] || colors.info;
    
    // 애니메이션 추가
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    if (!document.querySelector('style[data-toast]')) {
        style.setAttribute('data-toast', 'true');
        document.head.appendChild(style);
    }
    
    // DOM에 추가
    document.body.appendChild(toast);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    }, 3000);
}

// 좌측 AI 진행 상태 업데이트 (PyQt 스타일)
function updateAIProgress(value, message = '🤖 AI 시스템 준비 중') {
    const percent = Math.max(0, Math.min(100, Math.round(value || 0)));
    const iconEl = document.getElementById('ai-status-icon');
    const labelEl = document.getElementById('ai-progress-label');
    const percentEl = document.getElementById('ai-progress-percent');
    
    if (labelEl && message) {
        labelEl.textContent = message;
    }
    if (percentEl) {
        percentEl.textContent = `${percent}%`;
    }
    if (iconEl) {
        if (percent === 0) {
            iconEl.textContent = '○';
            iconEl.style.color = '#888888';
        } else if (percent >= 100) {
            iconEl.textContent = '◉';
            iconEl.style.color = '#0ecb81';
        } else {
            iconEl.textContent = '◉';
            iconEl.style.color = '#00d1ff';
        }
    }
    
    // 완료 후 잠시 뒤 대기 상태로 리셋
    if (percent >= 100) {
        setTimeout(() => resetAIProgress(), 2500);
    }
}

function resetAIProgress(message = '🤖 AI 시스템 준비 중') {
    const iconEl = document.getElementById('ai-status-icon');
    const labelEl = document.getElementById('ai-progress-label');
    const percentEl = document.getElementById('ai-progress-percent');
    if (iconEl) {
        iconEl.textContent = '○';
        iconEl.style.color = '#888888';
    }
    if (labelEl) {
        labelEl.textContent = message;
    }
    if (percentEl) {
        percentEl.textContent = '0%';
    }
}

// 차트 순회 상태 표시
function setChartCycleIndicator(enabled) {
    const statusEl = document.getElementById('chart-cycle-status');
    if (!statusEl) return;
    statusEl.textContent = enabled ? '분봉 순회 ON' : '분봉 순회 OFF';
    statusEl.classList.toggle('on', !!enabled);
}

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
    console.log('애플리케이션 초기화 중...');
    
    // 예측 카드 초기화 (저장된 데이터 로드)
    if (typeof CardRenderer !== 'undefined' && CardRenderer.initializePredictionCards) {
        CardRenderer.initializePredictionCards();
    }
    
    // API 서버 연결 확인
    const isConnected = await API.checkConnection();
    if (!isConnected) {
        console.warn('⚠️ API 서버에 연결할 수 없습니다.');
        const statusEl = document.getElementById('process-status');
        if (statusEl) {
            statusEl.textContent = '⚠️ API 서버 연결 실패 - start_server.bat를 실행하세요';
            statusEl.style.color = '#ff6b6b';
        }
    } else {
        console.log('✅ API 서버 연결 성공');
    }
    
    // 설정 로드 및 초기화
    try {
        const settings = await API.getSettings();
        realTradingEnabled = settings.real_trading || false;
        
        // 사이드바 토글 상태 업데이트
        const toggleBtn = document.getElementById('trade-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = realTradingEnabled ? 'ON' : 'OFF';
            toggleBtn.className = `toggle-btn ${realTradingEnabled ? 'on' : 'off'}`;
        }
        
        // 서버에서 가져온 설정을 Config 객체에도 반영 (초기 로드 시)
        if (settings) {
            Config.set('NB_DECIMAL_PLACES', settings.nb_decimal_places || 10);
            Config.set('UPDATE_INTERVAL', (settings.update_cycle_seconds || 25) * 1000);
            Config.set('CHART_UPDATE_INTERVAL', settings.chart_update_interval_ms || 5000);
            Config.set('CHART_ANIMATION_INTERVAL', settings.chart_animation_interval_ms || 30000);
            Config.set('MAX_PRODUCTION_CARDS', settings.production_card_limit || 4);
            Config.set('MAX_HISTORY_PER_CARD', settings.max_history_per_card || 100);
            Config.set('CHART_POINTS', settings.chart_points || 200);
            Config.set('AI_UPDATE_INTERVAL', settings.ai_update_interval_ms || 60000);
            
            console.log('✅ 초기 설정이 Config 객체에 반영되었습니다:', {
                MAX_PRODUCTION_CARDS: Config.get('MAX_PRODUCTION_CARDS', 4),
                production_card_limit: settings.production_card_limit
            });
        }
    } catch (error) {
        console.error('설정 로드 실패:', error);
    }
    
    // 차트 초기화
    chartAgent.init();
    
    // 분봉 순회 설정 복원 및 기본 자동 순회 활성화
    restoreChartCycleSettings();
    ensureDefaultChartCycle();
    
    // 초기 데이터 로드
    await loadInitialData();
    
    // 생산 카드 탭이 기본으로 표시되도록
    switchTab(0);
    
    // 자동 업데이트 시작
    await startAutoUpdates();
    
    // 자동 카드 생산 시작
    startAutoProduction();
    
    // 생산 카드 로그 이벤트 리스너 설정
    const filterSelect = document.getElementById('log-card-filter');
    if (filterSelect) {
        filterSelect.addEventListener('change', () => {
            refreshHistoryCards();
        });
    }
    
    const refreshBtn = document.getElementById('refresh-logs-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            refreshHistoryCards();
        });
    }
    
    const clearBtn = document.getElementById('clear-logs-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const logsContent = document.getElementById('card-logs-content');
            if (logsContent) {
                logsContent.innerHTML = '<div class="logs-empty">로그가 지워졌습니다. 새로고침 버튼을 눌러 다시 로드하세요.</div>';
            }
        });
    }
    
    console.log('애플리케이션 초기화 완료');
});

// 초기 데이터 로드
async function loadInitialData() {
    try {
        updateProgress(0, '전체 초기화 중..');
        
        // 가격 정보
        await updatePrice();
        updateProgress(25, '가격 정보 로드 중..');
        
        // 잔고 정보
        await updateBalance();
        updateProgress(45, '잔고 정보 로드 중..');
        
        // 차트 데이터
        await chartAgent.update();
        updateProgress(65, '차트 데이터 로드 중..');
        
        // 카드 목록
        await refreshCards();
        updateProgress(80, '카드 목록 로드 중..');
        
        // AI 검증 카드도 초기 로드
        await refreshVerificationCards();
        updateProgress(90, 'AI 검증 카드 로드 중..');
        
        // 사이드바 설정 표시 업데이트
        await updateSidebarSettings();
        
        updateProgress(100, '초기화 완료');
    } catch (error) {
        console.error('초기 데이터 로드 실패:', error);
        updateProgress(0, '초기화 실패');
    }
}

// 설정 저장 후 사이드바 업데이트
async function refreshSidebarAfterSettingsSave() {
    await updateSidebarSettings();
    
    // 실제 트레이딩 토글 상태 업데이트
    try {
        const settings = await API.getSettings();
        realTradingEnabled = settings.real_trading || false;
        
        const toggleBtn = document.getElementById('trade-toggle');
        if (toggleBtn) {
            toggleBtn.textContent = realTradingEnabled ? 'ON' : 'OFF';
            toggleBtn.className = `toggle-btn ${realTradingEnabled ? 'on' : 'off'}`;
        }
    } catch (error) {
        console.error('사이드바 토글 업데이트 실패:', error);
    }
}

// 가격 업데이트
async function updatePrice() {
    try {
        const data = await API.getPrice();
        if (data && data.price) {
            const priceEl = document.getElementById('btc-price');
            if (priceEl) {
                priceEl.textContent = parseFloat(data.price).toLocaleString() + ' KRW';
            }
        }
    } catch (error) {
        console.error('가격 업데이트 실패:', error);
        // 에러가 발생해도 UI는 유지
    }
}

// 잔고 업데이트
async function updateBalance() {
    try {
        const data = await API.getBalance();
        if (data) {
            if (data.krw !== undefined) {
                const krwEl = document.getElementById('krw-balance');
                if (krwEl) {
                    krwEl.textContent = parseFloat(data.krw).toLocaleString() + ' KRW';
                }
            }
            if (data.btc !== undefined) {
                const btcEl = document.getElementById('btc-balance');
                if (btcEl) {
                    btcEl.textContent = parseFloat(data.btc).toFixed(8) + ' BTC';
                }
            }
            if (data.total !== undefined) {
                const totalEl = document.getElementById('total-value');
                if (totalEl) {
                    totalEl.textContent = parseFloat(data.total).toLocaleString() + ' KRW';
                }
            }
        }
    } catch (error) {
        console.error('잔고 업데이트 실패:', error);
        // 에러가 발생해도 UI는 유지
    }
}

// 업비트 자산 정보 새로고침 (탭용)
async function refreshUpbitBalance() {
    try {
        const contentEl = document.getElementById('upbit-balance-content');
        if (!contentEl) return;
        
        contentEl.innerHTML = '<div class="balance-loading">자산 정보를 불러오는 중...</div>';
        
        const data = await API.getBalance();
        
        if (data && data.error) {
            contentEl.innerHTML = `
                <div class="balance-error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-message">${data.error}</div>
                    <div class="error-hint">업비트 API 연결을 확인해주세요.</div>
                </div>
            `;
            return;
        }
        
        if (data) {
            const krw = parseFloat(data.krw || 0);
            const btc = parseFloat(data.btc || 0);
            const total = parseFloat(data.total || 0);
            const btcPrice = total > 0 && btc > 0 ? (total - krw) / btc : 0;
            
            // BTC 가격 가져오기
            let currentBtcPrice = btcPrice;
            try {
                const priceData = await API.getPrice();
                if (priceData && priceData.price) {
                    currentBtcPrice = parseFloat(priceData.price);
                }
            } catch (e) {
                console.warn('BTC 가격 조회 실패:', e);
            }
            
            const btcValue = btc * currentBtcPrice;
            const krwPercent = total > 0 ? (krw / total * 100) : 0;
            const btcPercent = total > 0 ? (btcValue / total * 100) : 0;
            
            // 모든 자산 정보 표시
            let allAssetsHtml = '';
            if (data.all_assets && Array.isArray(data.all_assets)) {
                // KRW와 BTC를 제외한 다른 코인들
                const otherAssets = data.all_assets.filter(asset => 
                    asset.currency !== 'KRW' && asset.currency !== 'BTC' && asset.krw_value > 0
                );
                
                if (otherAssets.length > 0) {
                    allAssetsHtml = `
                        <div class="balance-other-assets">
                            <div class="balance-other-assets-header">
                                <h3>기타 자산</h3>
                            </div>
                            <div class="balance-other-assets-list">
                                ${otherAssets.map(asset => {
                                    const assetPercent = total > 0 ? (asset.krw_value / total * 100) : 0;
                                    return `
                                        <div class="balance-other-asset-item">
                                            <div class="balance-other-asset-header">
                                                <span class="balance-other-asset-currency">${asset.currency}</span>
                                                <span class="balance-other-asset-value">${asset.krw_value.toLocaleString()} KRW</span>
                                            </div>
                                            <div class="balance-other-asset-details">
                                                <span>보유: ${asset.balance.toFixed(8)}</span>
                                                <span>사용가능: ${asset.available.toFixed(8)}</span>
                                                ${asset.price ? `<span>가격: ${asset.price.toLocaleString()} KRW</span>` : ''}
                                            </div>
                                            <div class="balance-other-asset-percent">${assetPercent.toFixed(2)}%</div>
                                            <div class="balance-item-bar">
                                                <div class="balance-item-bar-fill" style="width: ${assetPercent}%; background: linear-gradient(90deg, #9d4edd, #c77dff);"></div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            }
            
            contentEl.innerHTML = `
                <div class="balance-summary">
                    <div class="balance-total">
                        <div class="balance-total-label">총 자산</div>
                        <div class="balance-total-value">${total.toLocaleString()} KRW</div>
                    </div>
                    <div class="balance-breakdown">
                        <div class="balance-item krw-balance">
                            <div class="balance-item-header">
                                <span class="balance-item-icon">💵</span>
                                <span class="balance-item-label">KRW 잔고</span>
                            </div>
                            <div class="balance-item-value">${krw.toLocaleString()} KRW</div>
                            <div class="balance-item-percent">${krwPercent.toFixed(2)}%</div>
                            <div class="balance-item-bar">
                                <div class="balance-item-bar-fill" style="width: ${krwPercent}%; background: linear-gradient(90deg, #0ecb81, #00d1ff);"></div>
                            </div>
                        </div>
                        <div class="balance-item btc-balance">
                            <div class="balance-item-header">
                                <span class="balance-item-icon">₿</span>
                                <span class="balance-item-label">BTC 보유</span>
                            </div>
                            <div class="balance-item-value">${btc.toFixed(8)} BTC</div>
                            <div class="balance-item-krw">≈ ${btcValue.toLocaleString()} KRW</div>
                            <div class="balance-item-percent">${btcPercent.toFixed(2)}%</div>
                            <div class="balance-item-bar">
                                <div class="balance-item-bar-fill" style="width: ${btcPercent}%; background: linear-gradient(90deg, #f7931a, #ffa500);"></div>
                            </div>
                        </div>
                    </div>
                    ${allAssetsHtml}
                    <div class="balance-info">
                        <div class="balance-info-item">
                            <span class="balance-info-label">BTC 현재가:</span>
                            <span class="balance-info-value">${currentBtcPrice.toLocaleString()} KRW</span>
                        </div>
                        <div class="balance-info-item">
                            <span class="balance-info-label">마지막 업데이트:</span>
                            <span class="balance-info-value">${data.timestamp ? new Date(data.timestamp).toLocaleString('ko-KR') : new Date().toLocaleString('ko-KR')}</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            contentEl.innerHTML = `
                <div class="balance-error">
                    <div class="error-icon">⚠️</div>
                    <div class="error-message">자산 정보를 불러올 수 없습니다.</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('업비트 자산 정보 조회 실패:', error);
        const contentEl = document.getElementById('upbit-balance-content');
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="balance-error">
                    <div class="error-icon">❌</div>
                    <div class="error-message">자산 정보 조회 중 오류가 발생했습니다.</div>
                    <div class="error-detail">${error.message || error}</div>
                </div>
            `;
        }
    }
}

// 카드 목록 새로고침
async function refreshCards() {
    try {
        console.log('🔄 카드 목록 새로고침 시작...');
        
        // CardRenderer가 로드되었는지 확인
        if (typeof CardRenderer === 'undefined') {
            console.error('❌ CardRenderer가 로드되지 않았습니다. 페이지를 새로고침하세요.');
            return;
        }
        
        // 생산 카드 컨테이너 확인
        const container = document.getElementById('production-cards');
        if (!container) {
            console.error('❌ production-cards 컨테이너를 찾을 수 없습니다!');
            console.error('❌ DOM 확인:', document.querySelector('#production-cards'));
            return;
        }
        console.log('✅ production-cards 컨테이너 확인:', container);
        
        // 생산 카드 (순차적 렌더링)
        console.log('📡 API에서 생산 카드 가져오는 중...');
        const productionCards = await cardAgent.getCards('production');
        
        console.log('📋 생산 카드 가져오기 완료:', productionCards?.length || 0, '개');
        if (productionCards && productionCards.length > 0) {
            console.log('📋 첫 번째 카드 샘플:', productionCards[0]);
            console.log('📋 카드 ID 목록:', productionCards.map(c => c?.card_id));
        } else {
            console.warn('⚠️ 생산 카드가 없습니다. API 응답 확인 필요.');
            console.warn('⚠️ API 직접 호출 테스트...');
            // API 직접 호출로 확인
            try {
                const directResponse = await API.getProductionCards();
                console.log('📡 API 직접 응답:', directResponse);
                if (directResponse && directResponse.cards) {
                    console.log('📡 API 응답 카드 수:', directResponse.cards.length);
                    if (directResponse.cards.length > 0) {
                        console.log('📡 첫 번째 카드:', directResponse.cards[0]);
                    }
                }
            } catch (error) {
                console.error('❌ API 직접 호출 실패:', error);
            }
        }
        
        console.log('🎨 카드 렌더링 시작...');
        if (typeof CardRenderer !== 'undefined' && CardRenderer.renderCardList) {
            await CardRenderer.renderCardList(productionCards, 'production-cards', 'production');
        } else {
            console.error('❌ CardRenderer.renderCardList를 찾을 수 없습니다.');
            return;
        }
        
        // 렌더링 후 확인
        const renderedCards = document.querySelectorAll('#production-cards .production-card');
        console.log('✅ 렌더링 완료 - 표시된 카드 수:', renderedCards.length, '개');
        
        // 통계 업데이트
        if (typeof CardRenderer !== 'undefined' && CardRenderer.updateProductionStats) {
            CardRenderer.updateProductionStats(productionCards);
        }
        
        // 검증이 안된 카드 검증 완료
        if (productionCards && productionCards.length > 0 && typeof CardRenderer !== 'undefined' && CardRenderer.verifyAllUnverifiedCards) {
            setTimeout(async () => {
                await CardRenderer.verifyAllUnverifiedCards();
            }, 1000);
        }
        
        // 생산 카드 AI 분석 자동 실행 (렌더링 완료 후)
        if (productionCards && productionCards.length > 0 && typeof CardRenderer !== 'undefined' && CardRenderer.startSequentialAIAnalysis) {
            // 약간의 지연을 두어 DOM 업데이트가 완료된 후 실행
            setTimeout(async () => {
                await CardRenderer.startSequentialAIAnalysis(productionCards);
            }, 500);
        }
        
        // 검증 카드
        const verificationCards = await cardAgent.getCards('verification');
        if (typeof CardRenderer !== 'undefined' && CardRenderer.renderCardList) {
            await CardRenderer.renderCardList(verificationCards, 'verification-cards', 'verification');
        }
    } catch (error) {
        console.error('카드 목록 새로고침 실패:', error);
    }
}

// 카드 차트 실시간 업데이트 (순차적)
async function updateCardCharts() {
    try {
        // CardRenderer가 로드되었는지 확인
        if (typeof CardRenderer === 'undefined') {
            console.warn('⚠️ CardRenderer가 로드되지 않았습니다. updateCardCharts 건너뜀.');
            return;
        }
        
        // 생산 카드 가져오기
        const productionCards = await cardAgent.getCards('production');
        
        // 현재 가격 가져오기
        const priceData = await API.getPrice();
        const currentPrice = priceData?.price || 0;
        
        if (currentPrice <= 0) return;
        
        // 통계 업데이트
        if (typeof CardRenderer !== 'undefined' && CardRenderer.updateProductionStats) {
            CardRenderer.updateProductionStats(productionCards);
        }
        
        // 생산 카드 AI 분석 반복 실행 (순차적)
        if (productionCards && productionCards.length > 0 && typeof CardRenderer !== 'undefined' && CardRenderer.startSequentialAIAnalysis) {
            await CardRenderer.startSequentialAIAnalysis(productionCards);
            
            // 매수 판정이 나온 카드에 대해 매도 판정 확인 (실시간 손익률 모니터링)
            if (typeof CardRenderer !== 'undefined' && CardRenderer.checkSellDecisionForBuyCards) {
                await CardRenderer.checkSellDecisionForBuyCards(productionCards);
            }
        }
        
        // 각 카드를 순차적으로 업데이트
        for (let i = 0; i < productionCards.length; i++) {
            const card = productionCards[i];
            const cardId = card.card_id;
            
            // 카드 요소가 존재하는지 확인
            const cardEl = document.getElementById(`card-${cardId}`);
            if (!cardEl) continue;
            
            // 약간의 지연 후 업데이트 (순차적 효과)
            await new Promise(resolve => setTimeout(resolve, i * 100));
            
            // 예측 검증: 30분 전 예측이 있으면 실제 가격 기록
            if (typeof CardRenderer !== 'undefined' && CardRenderer.validatePrediction) {
                CardRenderer.validatePrediction(cardId, currentPrice);
            }
            
            // 실시간 가격 차트 업데이트
            const realtimeCanvas = document.getElementById(`realtime-chart-${cardId}`);
            if (realtimeCanvas) {
                // 기존 가격 히스토리 가져오기 (localStorage 또는 메모리)
                const priceKey = `realtime_prices_${cardId}`;
                let prices = JSON.parse(localStorage.getItem(priceKey) || '[]');
                
                // 현재 가격 추가 (최대 50개 유지)
                prices.push(currentPrice);
                if (prices.length > 50) {
                    prices = prices.slice(-50);
                }
                localStorage.setItem(priceKey, JSON.stringify(prices));
                
                // 생산 가격 가져오기
                const productionPrice = card.chart_data?.prices?.[card.chart_data.prices.length - 1] || 0;
                
                // 차트 그리기
                CardChart.drawRealtimePriceChart(`realtime-chart-${cardId}`, prices, productionPrice);
            }
            
            // 손익률 업데이트
            const historyList = card.history_list || [];
            let entryPrice = 0.0;
            for (const hist of historyList) {
                if (hist.type === 'BUY' && hist.entry_price) {
                    entryPrice = hist.entry_price;
                    break;
                }
            }
            
            // 현재 가격 업데이트
            const currentPriceEl = document.getElementById(`current-price-${cardId}`);
            if (currentPriceEl) {
                currentPriceEl.textContent = `${currentPrice.toLocaleString()} KRW`;
            }
            
            // 생산 가격 기준 손익률 계산 및 업데이트
            const productionPrice = card.chart_data?.prices?.[card.chart_data.prices.length - 1] || 0;
            if (productionPrice > 0 && currentPrice > 0) {
                const productionPnlPercent = ((currentPrice - productionPrice) / productionPrice) * 100;
                const productionPnlEl = document.getElementById(`production-pnl-percent-${cardId}`);
                if (productionPnlEl) {
                    productionPnlEl.textContent = `${productionPnlPercent >= 0 ? '+' : ''}${productionPnlPercent.toFixed(2)}%`;
                    productionPnlEl.className = `info-value ${productionPnlPercent >= 0 ? 'profit' : 'loss'}`;
                }
            }
            
            // 손익률 계산 (점수 차트용)
            let pnlPercent = 0;
            if (entryPrice > 0) {
                // 진입 가격이 있는 경우: 진입 가격 기준 손익률
                pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
                const entryPnlEl = document.getElementById(`entry-pnl-percent-${cardId}`);
                if (entryPnlEl) {
                    entryPnlEl.textContent = `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`;
                    entryPnlEl.className = `info-value ${pnlPercent >= 0 ? 'profit' : 'loss'}`;
                }
            } else if (productionPrice > 0) {
                // 진입 가격이 없는 경우: 생산 가격 기준 손익률
                pnlPercent = ((currentPrice - productionPrice) / productionPrice) * 100;
            }
            
            // 현재 손익률 업데이트 (진입 가격이 있으면 진입 기준, 없으면 생산 기준)
            let currentPnlPercent = 0;
            if (entryPrice > 0 && currentPrice > 0) {
                currentPnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
            } else if (productionPrice > 0 && currentPrice > 0) {
                currentPnlPercent = ((currentPrice - productionPrice) / productionPrice) * 100;
            }
            const currentPnlEl = document.getElementById(`current-pnl-percent-${cardId}`);
            if (currentPnlEl) {
                if (currentPrice > 0) {
                    currentPnlEl.textContent = `${currentPnlPercent >= 0 ? '+' : ''}${currentPnlPercent.toFixed(2)}%`;
                    currentPnlEl.className = `info-value ${currentPnlPercent >= 0 ? 'profit' : 'loss'}`;
                } else {
                    currentPnlEl.textContent = '계산 중...';
                }
            }
            
            // 실시간 손실률 차트 업데이트 (항상 업데이트)
            const pnlCanvas = document.getElementById(`pnl-chart-${cardId}`);
            if (pnlCanvas) {
                const pnlKey = `realtime_pnl_${cardId}`;
                let pnlHistory = JSON.parse(localStorage.getItem(pnlKey) || '[]');
                
                // 마지막 값과 동일하면 추가하지 않음 (중복 방지)
                if (pnlHistory.length === 0 || Math.abs(pnlHistory[pnlHistory.length - 1] - pnlPercent) > 0.01) {
                    pnlHistory.push(pnlPercent);
                    if (pnlHistory.length > 50) {
                        pnlHistory = pnlHistory.slice(-50);
                    }
                    localStorage.setItem(pnlKey, JSON.stringify(pnlHistory));
                }
                
                // 차트 그리기
                CardChart.drawPnlPercentChart(`pnl-chart-${cardId}`, pnlHistory);
            }

            // 점수 차트: 손익률 기반 실시간 점수로 계산 (항상 업데이트)
            const scoreCanvas = document.getElementById(`score-chart-${cardId}`);
            if (scoreCanvas) {
                const scoreKey = `realtime_scores_${cardId}`;
                let scores = JSON.parse(localStorage.getItem(scoreKey) || '[]');
                
                // 손익률 기반 점수 계산
                const score = calculateScoreFromPnl(pnlPercent);
                
                // 항상 최신 점수 추가 (실시간 반영을 위해)
                // 마지막 값과 차이가 0.01 이상이거나, 마지막 업데이트가 5초 이상 지났으면 추가
                const shouldAdd = scores.length === 0 || 
                                 Math.abs(scores[scores.length - 1] - score) >= 0.01 ||
                                 (scores.length > 0 && scores.length % 10 === 0); // 10개마다 강제 추가
                
                if (shouldAdd) {
                    scores.push(score);
                    // 최대 200개 유지 (최근 데이터만)
                    if (scores.length > 200) {
                        scores = scores.slice(-200);
                    }
                    localStorage.setItem(scoreKey, JSON.stringify(scores));
                } else {
                    // 값이 같아도 마지막 값을 업데이트 (실시간 반영)
                    if (scores.length > 0) {
                        scores[scores.length - 1] = score;
                        localStorage.setItem(scoreKey, JSON.stringify(scores));
                    }
                }
                
                // 차트 그리기 (항상 최신 데이터로)
                CardChart.drawScoreChart(`score-chart-${cardId}`, scores);
            }
            
            // AI 분석 업데이트 (마지막 카드가 아닌 경우)
            if (i < productionCards.length - 1) {
                // 다음 카드로 진행하기 전 약간의 지연
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    } catch (error) {
        console.error('카드 차트 업데이트 실패:', error);
    }
}

// 손익률 기반 점수 계산 (0~100 클램프)
function calculateScoreFromPnl(pnlPercent) {
    const base = 50 + (pnlPercent * 2); // +25% → 100점, -25% → 0점
    return Math.max(0, Math.min(100, base));
}

// 탭 전환
function switchTab(index) {
    // 탭 버튼 업데이트
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });
    
    // 탭 콘텐츠 업데이트
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabPanes.forEach((pane, i) => {
        pane.classList.toggle('active', i === index);
    });
    
    currentTab = index;
    
    // 탭별 데이터 로드
    if (index === 0) {
        refreshCards();
    } else if (index === 1) {
        refreshVerificationCards();
    } else if (index === 2) {
        refreshHistoryCards();
    } else if (index === 3) {
        refreshUpbitBalance();
    }
}

// 활성 카드 새로고침 (보유 중 탭)
async function refreshActiveCards() {
    try {
        // CardRenderer가 로드되었는지 확인
        if (typeof CardRenderer === 'undefined') {
            console.error('❌ CardRenderer가 로드되지 않았습니다. 페이지를 새로고침하세요.');
            return;
        }
        
        const cards = await cardAgent.getCards('active');
        if (typeof CardRenderer !== 'undefined' && CardRenderer.renderCardList) {
            CardRenderer.renderCardList(cards, 'active-cards', 'production');
        }
    } catch (error) {
        console.error('활성 카드 새로고침 실패:', error);
    }
}

// 검증 카드 새로고침
async function refreshVerificationCards() {
    try {
        // CardRenderer가 로드되었는지 확인
        if (typeof CardRenderer === 'undefined') {
            console.error('❌ CardRenderer가 로드되지 않았습니다. 페이지를 새로고침하세요.');
            return;
        }
        
        const cards = await cardAgent.getCards('verification');
        if (typeof CardRenderer !== 'undefined' && CardRenderer.renderCardList) {
            CardRenderer.renderCardList(cards, 'verification-cards', 'verification');
        }
        
        // 통계 업데이트
        updateVerificationStats(cards);
    } catch (error) {
        console.error('검증 카드 새로고침 실패:', error);
    }
}

// 폐기 카드 새로고침
async function refreshDiscardedCards() {
    try {
        // CardRenderer가 로드되었는지 확인
        if (typeof CardRenderer === 'undefined') {
            console.error('❌ CardRenderer가 로드되지 않았습니다. 페이지를 새로고침하세요.');
            return;
        }
        
        const cards = await cardAgent.getCards('discarded');
        if (typeof CardRenderer !== 'undefined' && CardRenderer.renderCardList) {
            CardRenderer.renderCardList(cards, 'discarded-cards', 'discarded');
        }
    } catch (error) {
        console.error('폐기 카드 새로고침 실패:', error);
    }
}

// 생산 카드 로그 새로고침
async function refreshHistoryCards() {
    try {
        const logsContent = document.getElementById('card-logs-content');
        if (!logsContent) return;
        
        logsContent.innerHTML = '<div class="logs-loading">로딩 중...</div>';
        
        // 모든 생산 카드 가져오기
        const productionCards = await cardAgent.getCards('production').catch(() => []);
        
        // 카드 필터 업데이트
        updateCardFilter(productionCards);
        
        // 선택된 카드 필터 확인
        const filterSelect = document.getElementById('log-card-filter');
        const selectedCardId = filterSelect ? filterSelect.value : 'all';
        
        // 로그 렌더링
        renderCardLogs(productionCards, selectedCardId);
    } catch (error) {
        console.error('생산 카드 로그 새로고침 실패:', error);
        const logsContent = document.getElementById('card-logs-content');
        if (logsContent) {
            logsContent.innerHTML = `<div class="logs-error">오류 발생: ${error.message}</div>`;
        }
    }
}


// 카드 필터 업데이트
function updateCardFilter(cards) {
    const filterSelect = document.getElementById('log-card-filter');
    if (!filterSelect) return;
    
    // 기존 옵션 유지 (전체 카드)
    const allOption = filterSelect.querySelector('option[value="all"]');
    filterSelect.innerHTML = '';
    if (allOption) {
        filterSelect.appendChild(allOption);
    }
    
    // 카드 목록 추가
    cards.forEach(card => {
        const option = document.createElement('option');
        option.value = card.card_id;
        option.textContent = `${card.card_id} (${card.card_state || 'UNKNOWN'})`;
        filterSelect.appendChild(option);
    });
}

// 카드 로그 렌더링
function renderCardLogs(cards, selectedCardId = 'all') {
    const logsContent = document.getElementById('card-logs-content');
    if (!logsContent) return;
    
    // 필터링
    const filteredCards = selectedCardId === 'all' 
        ? cards 
        : cards.filter(card => card.card_id === selectedCardId);
    
    if (filteredCards.length === 0) {
        logsContent.innerHTML = '<div class="logs-empty">표시할 카드가 없습니다.</div>';
        return;
    }
    
    // 시간순 정렬 (최신순)
    filteredCards.sort((a, b) => {
        const timeA = new Date(a.production_time || a.created_at || 0).getTime();
        const timeB = new Date(b.production_time || b.created_at || 0).getTime();
        return timeB - timeA;
    });
    
    // 로그 HTML 생성
    let logsHtml = '';
    
    filteredCards.forEach(card => {
        logsHtml += renderSingleCardLog(card);
    });
    
    logsContent.innerHTML = logsHtml;
}

// 단일 카드 로그 렌더링
function renderSingleCardLog(card) {
    const cardId = card.card_id || 'UNKNOWN';
    const cardState = card.card_state || 'UNKNOWN';
    const productionTime = card.production_time || card.created_at || 'N/A';
    const updatedAt = card.updated_at || 'N/A';
    
    // 히스토리 리스트
    const historyList = card.history_list || [];
    let historyHtml = '<div class="log-section"><h4>📜 히스토리</h4><ul class="log-list">';
    if (historyList.length === 0) {
        historyHtml += '<li class="log-item">히스토리가 없습니다.</li>';
    } else {
        historyList.forEach((hist, idx) => {
            const histType = hist.type || 'UNKNOWN';
            const histTime = hist.timestamp || hist.time || 'N/A';
            const histMemo = hist.memo || '';
            const histPnl = hist.pnl_percent !== undefined ? `${hist.pnl_percent.toFixed(2)}%` : '';
            const histPrice = hist.price || hist.entry_price || hist.exit_price || '';
            
            historyHtml += `
                <li class="log-item">
                    <span class="log-time">${histTime}</span>
                    <span class="log-type log-type-${histType.toLowerCase()}">${histType}</span>
                    ${histPrice ? `<span class="log-price">${histPrice.toLocaleString()} KRW</span>` : ''}
                    ${histPnl ? `<span class="log-pnl ${histPnl.startsWith('-') ? 'negative' : 'positive'}">${histPnl}</span>` : ''}
                    ${histMemo ? `<span class="log-memo">${histMemo}</span>` : ''}
                </li>
            `;
        });
    }
    historyHtml += '</ul></div>';
    
    // 실시간 점수 히스토리
    const realtimeScores = card.realtime_scores || [];
    let scoresHtml = '<div class="log-section"><h4>📊 실시간 점수 히스토리</h4><ul class="log-list">';
    if (realtimeScores.length === 0) {
        scoresHtml += '<li class="log-item">실시간 점수 데이터가 없습니다.</li>';
    } else {
        const recentScores = realtimeScores.slice(-20); // 최근 20개만 표시
        recentScores.forEach((score, idx) => {
            scoresHtml += `<li class="log-item"><span class="log-score">${score.toFixed(2)}</span></li>`;
        });
        if (realtimeScores.length > 20) {
            scoresHtml += `<li class="log-item log-more">... 외 ${realtimeScores.length - 20}개</li>`;
        }
    }
    scoresHtml += '</ul></div>';
    
    // AI 분석 로그
    const rlAnalysis = card.recent_rl_ai_analysis || card.rl_ai_analysis_details || {};
    let aiHtml = '<div class="log-section"><h4>🧠 AI 분석 로그</h4><ul class="log-list">';
    if (Object.keys(rlAnalysis).length === 0) {
        aiHtml += '<li class="log-item">AI 분석 로그가 없습니다.</li>';
    } else {
        if (rlAnalysis.action) {
            aiHtml += `<li class="log-item"><span class="log-label">액션:</span> <span class="log-value">${rlAnalysis.action}</span></li>`;
        }
        if (rlAnalysis.confidence !== undefined) {
            aiHtml += `<li class="log-item"><span class="log-label">신뢰도:</span> <span class="log-value">${rlAnalysis.confidence.toFixed(1)}%</span></li>`;
        }
        if (rlAnalysis.q_value !== undefined) {
            aiHtml += `<li class="log-item"><span class="log-label">Q값:</span> <span class="log-value">${rlAnalysis.q_value.toFixed(4)}</span></li>`;
        }
        if (rlAnalysis.message) {
            aiHtml += `<li class="log-item"><span class="log-label">메시지:</span> <span class="log-value">${rlAnalysis.message}</span></li>`;
        }
        if (rlAnalysis.reasoning) {
            aiHtml += `<li class="log-item"><span class="log-label">판단 근거:</span> <span class="log-value">${rlAnalysis.reasoning}</span></li>`;
        }
        if (rlAnalysis.timestamp) {
            aiHtml += `<li class="log-item"><span class="log-label">분석 시간:</span> <span class="log-value">${rlAnalysis.timestamp}</span></li>`;
        }
    }
    aiHtml += '</ul></div>';
    
    // 카드 기본 정보
    const cardInfoHtml = `
        <div class="log-section">
            <h4>ℹ️ 카드 정보</h4>
            <ul class="log-list">
                <li class="log-item"><span class="log-label">카드 ID:</span> <span class="log-value">${cardId}</span></li>
                <li class="log-item"><span class="log-label">상태:</span> <span class="log-value log-state-${cardState.toLowerCase()}">${cardState}</span></li>
                <li class="log-item"><span class="log-label">생산 시간:</span> <span class="log-value">${productionTime}</span></li>
                <li class="log-item"><span class="log-label">업데이트 시간:</span> <span class="log-value">${updatedAt}</span></li>
                <li class="log-item"><span class="log-label">N/B 값:</span> <span class="log-value">${card.nb_value !== undefined ? card.nb_value.toFixed(10) : 'N/A'}</span></li>
                <li class="log-item"><span class="log-label">점수:</span> <span class="log-value">${card.score !== undefined ? card.score.toFixed(2) : 'N/A'}</span></li>
                <li class="log-item"><span class="log-label">랭크:</span> <span class="log-value">${card.rank || 'N/A'}</span></li>
                <li class="log-item"><span class="log-label">타임프레임:</span> <span class="log-value">${card.timeframe || 'N/A'}</span></li>
            </ul>
        </div>
    `;
    
    return `
        <div class="card-log-item">
            <div class="card-log-header">
                <h3>카드: ${cardId}</h3>
                <span class="card-log-state log-state-${cardState.toLowerCase()}">${cardState}</span>
            </div>
            <div class="card-log-body">
                ${cardInfoHtml}
                ${historyHtml}
                ${scoresHtml}
                ${aiHtml}
            </div>
        </div>
    `;
}

// 검증 통계 업데이트 (원본 PyQt6와 동일하게)
function updateVerificationStats(cards) {
    const statsEl = document.getElementById('verification-stats');
    if (!statsEl) return;
    
    const total = cards.length;
    
    // 승리/손실 통계
    let winCount = 0;
    let lossCount = 0;
    let drawCount = 0;
    let totalPnl = 0.0;
    let simCount = 0;  // 모의 실적
    let realCount = 0;  // 실제 실적
    
    // RL AI 행동 통계
    let totalBuyCount = 0;
    let totalSellCount = 0;
    let totalDiscardCount = 0;
    
    // 랭크별 통계
    const rankStats = {
        'F': 0, 'E': 0, 'D': 0, 'C': 0, 'B': 0,
        'A': 0, 'S': 0, '+S': 0, '++S': 0, '+SS': 0
    };
    
    // 평균 손실률 기반 점수 계산
    let totalLossRateScore = 0.0;
    let scoreCount = 0;
    
    cards.forEach(card => {
        const soldHistory = CardRenderer.getLatestSoldHistory(card);
        if (soldHistory) {
            const pnlAmount = soldHistory.pnl_amount || 0;
            const pnlPercent = soldHistory.pnl_percent || 0;
            totalPnl += pnlAmount;
            
            if (pnlAmount > 0) winCount++;
            else if (pnlAmount < 0) lossCount++;
            else drawCount++;
            
            // 모의/실제 실적 구분
            if (soldHistory.is_simulation) {
                simCount++;
            } else {
                realCount++;
            }
            
            // 손실률 기반 점수 계산
            const lossRateScore = CardRenderer.calculateLossRateScore(pnlPercent);
            totalLossRateScore += lossRateScore;
            scoreCount++;
        }
        
        // 랭크별 통계
        const rank = card.rank || 'C';
        if (rank in rankStats) {
            rankStats[rank]++;
        }
        
        const actionStats = card.action_stats || CardRenderer.calculateActionStats(card);
        if (actionStats) {
            totalBuyCount += actionStats.buy_count || 0;
            totalSellCount += actionStats.sell_count || 0;
            totalDiscardCount += actionStats.discard_count || 0;
        }
    });
    
    const winrate = total > 0 ? (winCount / total * 100) : 0;
    const avgPnl = total > 0 ? (totalPnl / total) : 0;
    const avgLossRateScore = scoreCount > 0 ? (totalLossRateScore / scoreCount) : 0.0;
    
    // 랭크 색상
    const rankColors = {
        '+SS': '#ff00ff', '++S': '#ff00ff', '+S': '#ff00ff',
        'S': '#ffd700', 'A': '#00d1ff', 'B': '#0ecb81',
        'C': '#ffffff', 'D': '#ffa500', 'E': '#ff6b6b', 'F': '#f6465d'
    };
    
    // 평균 검증 점수 색상
    const scoreColor = avgLossRateScore >= 80 ? '#0ecb81' :
                      avgLossRateScore >= 60 ? '#00d1ff' :
                      avgLossRateScore >= 40 ? '#ffa500' : '#f6465d';
    
    statsEl.innerHTML = `
        <div class="verification-stats-container">
            <div class="verification-stats-header">🧠 강화학습 AI 검증 통계</div>
            <div class="verification-stats-grid">
                <div class="stat-item">
                    <div class="stat-label">총 검증 카드:</div>
                    <div class="stat-value" style="color: #ffffff;">${total}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">승리:</div>
                    <div class="stat-value" style="color: #0ecb81;">${winCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">손실:</div>
                    <div class="stat-value" style="color: #f6465d;">${lossCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">승률:</div>
                    <div class="stat-value" style="color: #9d4edd;">${winrate.toFixed(1)}%</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">평균 손익:</div>
                    <div class="stat-value" style="color: #ffffff;">${avgPnl.toLocaleString()} KRW</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">총 손익:</div>
                    <div class="stat-value" style="color: #9d4edd;">${totalPnl.toLocaleString()} KRW</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">🧪 모의 실적:</div>
                    <div class="stat-value" style="color: #ffa500;">${simCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">💰 실제 실적:</div>
                    <div class="stat-value" style="color: #0ecb81;">${realCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">BUY 판정:</div>
                    <div class="stat-value" style="color: #0ecb81;">${totalBuyCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">SELL 판정:</div>
                    <div class="stat-value" style="color: #f6465d;">${totalSellCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">폐기 판정:</div>
                    <div class="stat-value" style="color: #888888;">${totalDiscardCount}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">📊 평균 검증 점수:</div>
                    <div class="stat-value" style="color: ${scoreColor};">${avgLossRateScore.toFixed(1)}</div>
                </div>
            </div>
            
            <div class="verification-rank-stats">
                <div class="rank-stats-header">🏆 랭크별 검증 통계</div>
                <div class="rank-stats-grid">
                    ${['+SS', '++S', '+S', 'S', 'A', 'B', 'C', 'D', 'E', 'F'].map(rank => `
                        <div class="rank-stat-item">
                            <div class="rank-stat-label">${rank}:</div>
                            <div class="rank-stat-value" style="color: ${rankColors[rank] || '#ffffff'};">${rankStats[rank] || 0}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// 카드 생산
async function produceCard() {
    const logEl = document.getElementById('production-log');
    const progressEl = document.getElementById('production-progress');
    
    // 진행 상황 표시를 위한 인터벌 (함수 스코프 상단에 선언)
    let progressInterval = null;
    let progressCount = 0;
    
    try {
        if (logEl) logEl.textContent = '카드 생산 시작...\n';
        if (progressEl) progressEl.style.width = '10%';
        
        // API 서버 연결 확인
        if (logEl) logEl.textContent += 'API 서버 연결 확인 중...\n';
        const isConnected = await API.checkConnection();
        if (!isConnected) {
            throw new Error('API 서버에 연결할 수 없습니다. start_server.bat를 실행하여 서버를 시작하세요.');
        }
        if (logEl) logEl.textContent += 'API 서버 연결 확인 완료\n';
        if (progressEl) progressEl.style.width = '20%';
        
        // 차트 데이터 가져오기 (좌측 메인 차트에서 직접 가져오기, API 사용 안 함)
        if (logEl) logEl.textContent += '차트 데이터 로드 중... (좌측 메인 차트에서 직접 가져오기)\n';
        
        const currentTf = chartAgent.currentTimeframe;
        
        // 메인 차트에 이미 로드된 데이터가 있는지 확인
        if (!chartAgent.chartData || !chartAgent.chartData.prices || chartAgent.chartData.prices.length < 2) {
            throw new Error('좌측 메인 차트에 데이터가 없습니다. 차트가 로드될 때까지 기다려주세요.');
        }
        
        // 메인 차트 데이터를 깊은 복사로 가져오기
        const chartData = {
            ...chartAgent.chartData,
            prices: [...chartAgent.chartData.prices], // 가격 배열도 복사
            timeframe: chartAgent.chartData.timeframe || currentTf
        };
        
        if (logEl) logEl.textContent += `✅ 좌측 메인 차트 데이터 사용: timeframe=${chartData.timeframe}, 가격 ${chartData.prices.length}개\n`;
        
        // N/B 값이 없으면 메인 차트에서 계산된 값 사용 또는 계산
        if (chartData.nb_value === undefined && chartData.prices) {
            if (logEl) logEl.textContent += 'N/B 값 계산 중... (좌측 메인 차트 기준)\n';
            const nbResult = chartAgent.calculateAndDisplayNB(chartData.prices);
            if (nbResult) {
                chartData.nb_value = nbResult.nb_value;
                chartData.nb_max = nbResult.nb_max;
                chartData.nb_min = nbResult.nb_min;
                chartData.bit_max = nbResult.bit_max;
                chartData.bit_min = nbResult.bit_min;
            }
        } else if (chartData.nb_value !== undefined) {
            // 메인 차트에 이미 계산된 N/B 값이 있으면 그대로 사용
            // bit_max, bit_min도 함께 전달 (좌측 차트와 동일한 값 유지)
            if (!chartData.bit_max && chartData.nb_max !== undefined) {
                chartData.bit_max = chartData.nb_max * 10;
            }
            if (!chartData.bit_min && chartData.nb_min !== undefined) {
                chartData.bit_min = chartData.nb_min * 10;
            }
            if (logEl) logEl.textContent += `N/B 값 사용: ${chartData.nb_value.toFixed(Config.NB_DECIMAL_PLACES)} (좌측 메인 차트)\n`;
        }
        
        if (logEl) logEl.textContent += '✅ 차트 데이터 로드 완료 (API 호출 없음)\n';
        if (progressEl) progressEl.style.width = '40%';
        
        // 생산 카드 제한 체크
        const maxCards = Config.get('MAX_PRODUCTION_CARDS', 4);
        if (maxCards > 0) {
            const productionCards = await cardAgent.getCards('production');
            const currentCardCount = productionCards ? productionCards.length : 0;
            
            if (currentCardCount >= maxCards) {
                // 제거 가능한 카드 찾기 (매도 완료된 카드만 제거 가능)
                // 예측 성공한 카드는 매도 완료 후에만 제거 가능하므로, 매도 완료가 필수 조건
                const removableCards = productionCards.filter(card => {
                    const historyList = card.history_list || [];
                    const hasSold = historyList.some(hist => hist.type === 'SOLD');
                    
                    // 매도 완료된 카드만 제거 가능
                    // (대가 판정이어도 매도 완료되어야 제거 가능)
                    return hasSold;
                });
                
                if (removableCards.length > 0) {
                    // 가장 오래된 카드 찾기 (production_time 또는 created_at 기준)
                    removableCards.sort((a, b) => {
                        const timeA = new Date(a.production_time || a.created_at || 0).getTime();
                        const timeB = new Date(b.production_time || b.created_at || 0).getTime();
                        return timeA - timeB; // 오래된 순서
                    });
                    
                    const oldestCard = removableCards[0];
                    const cardId = oldestCard.card_id;
                    
                    if (logEl) {
                        const historyList = oldestCard.history_list || [];
                        const hasSold = historyList.some(hist => hist.type === 'SOLD');
                        const isVerified = oldestCard.prediction_verified === true && 
                                          (oldestCard.zone_prediction_correct === true || 
                                           oldestCard.price_prediction_correct === true);
                        const reason = hasSold && isVerified ? '매도 완료 + 대가 판정' : '매도 완료';
                        logEl.textContent += `⚠️ 생산 카드 제한 도달 (${currentCardCount}/${maxCards}). 가장 오래된 카드 자동 제거 중: ${cardId} (${reason})\n`;
                    }
                    
                    // 카드 자동 제거 (비동기로 처리, 응답 대기 없이 카드 생산 계속 진행)
                    // 백엔드에서도 자동 제거를 수행하므로 여기서는 요청만 보내고 계속 진행
                    API.delete(`/cards/${cardId}`).then(deleteResult => {
                        if (deleteResult && (deleteResult.success || deleteResult._status === 200 || deleteResult._status === 204)) {
                            console.log(`✅ 카드 자동 제거 완료: ${cardId}`);
                            // 카드 목록 새로고침 (비동기)
                            cardAgent.getCards('production').catch(err => console.error('카드 목록 새로고침 실패:', err));
                        } else {
                            console.warn(`⚠️ 카드 자동 제거 실패: ${cardId} - ${deleteResult?.error || '알 수 없는 오류'}`);
                        }
                    }).catch(deleteError => {
                        console.warn(`⚠️ 카드 자동 제거 오류: ${cardId} - ${deleteError.message}`);
                        // 오류가 발생해도 카드 생산은 계속 진행 (백엔드에서도 처리함)
                    });
                    
                    // 제거 요청을 보냈으므로 카드 생산 계속 진행
                    // 백엔드에서도 자동 제거를 수행하므로 안전하게 진행 가능
                } else {
                    // 제거 가능한 카드가 없으면 오류 발생
                    const errorMsg = `생산 카드 제한에 도달했습니다. (${currentCardCount}/${maxCards}) 제거 가능한 카드가 없습니다. (매도 완료된 카드가 필요합니다.)`;
                    if (logEl) logEl.textContent += `❌ ${errorMsg}\n`;
                    if (progressEl) progressEl.style.width = '0%';
                    throw new Error(errorMsg);
                }
            }
            
            if (logEl) {
                const productionCardsAfter = await cardAgent.getCards('production');
                const currentCardCountAfter = productionCardsAfter ? productionCardsAfter.length : 0;
                logEl.textContent += `생산 카드 제한 확인: ${currentCardCountAfter}/${maxCards}\n`;
            }
        }
        
        // 카드 생산
        if (logEl) {
            if (chartData.nb_value !== undefined) {
                logEl.textContent += '카드 생산 중... (N/B 값 재사용, 빠른 처리 예상)\n';
            } else {
                logEl.textContent += '카드 생산 중... (서버에서 N/B 값 계산 중, 최대 10분 소요)\n';
            }
        }
        if (progressEl) progressEl.style.width = '50%';
        
        try {
            if (logEl) {
                progressInterval = setInterval(() => {
                    progressCount++;
                    const dots = '.'.repeat((progressCount % 4) + 1);
                    const lastLine = logEl.textContent.split('\n').pop();
                    if (lastLine.includes('카드 생산 중')) {
                        logEl.textContent = logEl.textContent.replace(/\n[^\n]*$/, `\n카드 생산 중${dots} (${progressCount}초 경과)`);
                    }
                }, 1000);
            }
            const result = await API.produceCard(chartData);
            
            // 진행 상황 인터벌 정리
            if (progressInterval) {
                clearInterval(progressInterval);
            }
            
            console.log('📦 카드 생산 API 응답:', result);
            
            if (!result) {
                throw new Error('카드 생산 API 응답이 없습니다.');
            }
            
            if (result.error) {
                console.error('❌ 카드 생산 API 오류:', result.error);
                throw new Error(result.error);
            }
            
            if (!result.card) {
                console.error('❌ 카드 생산 API 응답에 카드 데이터가 없습니다:', result);
                throw new Error(result.error || '카드 생산에 실패했습니다.');
            }
            
            const card = result.card;
        
        if (logEl) {
            logEl.textContent += `✅ 카드 생산 완료!\n`;
            logEl.textContent += `카드 ID: ${card.card_id || 'N/A'}\n`;
            logEl.textContent += `타임프레임: ${card.timeframe || 'N/A'}\n`;
            logEl.textContent += `N/B 값: ${card.nb_value?.toFixed(Config.NB_DECIMAL_PLACES) || 'N/A'}\n`;
            logEl.textContent += `N/B MAX: ${card.nb_max?.toFixed(Config.NB_DECIMAL_PLACES) || 'N/A'}\n`;
            logEl.textContent += `N/B MIN: ${card.nb_min?.toFixed(Config.NB_DECIMAL_PLACES) || 'N/A'}\n`;
            logEl.textContent += `카드 타입: ${card.card_type_detail || card.card_type || 'normal'}\n`;
            logEl.textContent += `카드 상태: ${card.card_state || 'ACTIVE'}\n`;
            if (result.message) {
                logEl.textContent += `메시지: ${result.message}\n`;
            }
        }
        if (progressEl) progressEl.style.width = '100%';
        
        // 카드 생산 완료 후 Zone 분석 1번만 실행
        // 카드가 DOM에 렌더링된 후 실행되도록 약간의 지연 추가
        if (card && card.card_id) {
            setTimeout(async () => {
                try {
                    console.log(`🔵 카드 생산 완료: Zone 분석 시작 (1번만 실행) - ${card.card_id}`);
                    // 카드 데이터에 chart_data가 있는지 확인
                    if (!card.chart_data && cardAgent) {
                        // chart_data가 없으면 서버에서 다시 가져오기
                        const cardData = await cardAgent.getCardById(card.card_id);
                        if (cardData && cardData.chart_data) {
                            card = cardData;
                        }
                    }
                    await CardRenderer.startMLAIAnalysis(card.card_id, card);
                } catch (error) {
                    console.error(`⚠️ Zone 분석 실패: ${card.card_id}`, error);
                }
            }, 500); // DOM 렌더링 대기
        }
        
        // 좌측 메인 차트 N/B 표시를 서버 확정 값으로 동기화
        // bit_max, bit_min이 있으면 그대로 사용, 없으면 nb_max * 10, nb_min * 10 사용
        if (card.bit_max !== undefined) {
            const maxEl = document.getElementById('chart-max-nb');
            if (maxEl) maxEl.textContent = card.bit_max.toFixed(Config.NB_DECIMAL_PLACES);
        } else if (card.nb_max !== undefined) {
            const maxEl = document.getElementById('chart-max-nb');
            if (maxEl) maxEl.textContent = (card.nb_max * 10).toFixed(Config.NB_DECIMAL_PLACES);
        }
        if (card.bit_min !== undefined) {
            const minEl = document.getElementById('chart-min-nb');
            if (minEl) minEl.textContent = card.bit_min.toFixed(Config.NB_DECIMAL_PLACES);
        } else if (card.nb_min !== undefined) {
            const minEl = document.getElementById('chart-min-nb');
            if (minEl) minEl.textContent = (card.nb_min * 10).toFixed(Config.NB_DECIMAL_PLACES);
        }
        if (card.nb_value !== undefined) {
            const valEl = document.getElementById('chart-nb-value');
            if (valEl) valEl.textContent = card.nb_value.toFixed(Config.NB_DECIMAL_PLACES);
        }
        
        // 카드 목록 새로고침 (검증 결과 포함)
        await refreshCards();
        
        // 카드 생산 후 즉시 검증 실행 (다음 카드가 생산되었으므로 이전 카드 검증)
        if (card && card.card_id && typeof CardRenderer !== 'undefined' && CardRenderer.verifyAllUnverifiedCards) {
            setTimeout(async () => {
                try {
                    console.log('🔍 카드 생산 완료: 검증 작업 시작...');
                    await CardRenderer.verifyAllUnverifiedCards();
                    console.log('✅ 검증 작업 완료');
                    
                    // 검증 후 카드 목록 다시 새로고침하여 UI 업데이트
                    await refreshCards();
                } catch (error) {
                    console.error('⚠️ 검증 작업 실패:', error);
                }
            }, 1500); // DOM 렌더링 대기 후 검증 실행
        }
        
            setTimeout(() => {
                if (progressEl) progressEl.style.width = '0%';
            }, 2000);
        } catch (apiError) {
            // 진행 상황 인터벌 정리 (내부 catch에서도 정리)
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            throw apiError; // 상위 catch로 전달
        }
    } catch (error) {
        console.error('카드 생산 실패:', error);
        
        // 생산 상태를 실패로 업데이트
        const productionStatusEl = document.getElementById('stat-production-status');
        const productionReasonEl = document.getElementById('stat-production-reason');
        
        if (productionStatusEl) {
            productionStatusEl.textContent = '❌ 실패';
            productionStatusEl.style.color = '#ff6b6b';
            productionStatusEl.style.fontWeight = 'bold';
        }
        
        if (logEl) {
            logEl.textContent += `❌ 오류: ${error.message}\n`;
            
            // 진행 상황 인터벌 정리
            if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
            }
            
            // 생산 제한 사유 업데이트
            let reasonText = '';
            if (error.message.includes('생산 카드 제한')) {
                reasonText = error.message;
            } else if (error.message.includes('시간 초과') || error.message.includes('timeout')) {
                reasonText = '요청 시간 초과 (10분)';
            } else if (error.message.includes('같은 N/B 값을 가진') || error.message.includes('이미 존재')) {
                reasonText = '중복 카드 감지 (같은 N/B 값)';
            } else {
                reasonText = error.message;
            }
            
            if (productionReasonEl) {
                productionReasonEl.textContent = reasonText;
                productionReasonEl.style.color = '#ff6b6b';
            }
            
            // 타임아웃 오류인 경우
            if (error.message.includes('시간 초과') || error.message.includes('timeout')) {
                logEl.textContent += `\n⏱️ 요청 시간 초과 (10분)\n`;
                logEl.textContent += `서버가 처리 중일 수 있습니다. 잠시 후 다시 시도하세요.\n`;
                logEl.textContent += `서버 로그 창("Trading Bot API Server")에서 진행 상황을 확인하세요.\n`;
                logEl.textContent += `N/B 값 계산이 오래 걸릴 수 있습니다. 잠시 기다려주세요.\n`;
                logEl.textContent += `처리 시간이 10분을 초과하는 경우 서버 로그를 확인하세요.\n`;
            } else if (error.message.includes('같은 N/B 값을 가진') || error.message.includes('이미 존재')) {
                // 중복 카드 에러
                logEl.textContent += `\n💡 중복 카드 감지:\n`;
                logEl.textContent += `같은 N/B 값을 가진 카드가 이미 존재합니다.\n`;
                logEl.textContent += `이는 정상적인 동작입니다. (중복 카드 생산 방지)\n`;
                logEl.textContent += `다른 N/B 값이 나올 때까지 기다리거나, 기존 카드를 확인하세요.\n`;
                
                // 오류 상세 정보 표시
                if (error.details && Array.isArray(error.details)) {
                    logEl.textContent += `\n📋 상세 정보:\n`;
                    error.details.forEach(detail => {
                        logEl.textContent += `  • ${detail}\n`;
                    });
                }
            } else {
                logEl.textContent += `\n해결 방법:\n`;
                logEl.textContent += `1. 서버 로그 창("Trading Bot API Server")에서 오류 확인\n`;
                logEl.textContent += `2. restart_server.bat 실행하여 서버 재시작\n`;
                logEl.textContent += `3. 브라우저 콘솔(F12)에서 자세한 오류 확인\n`;
            }
        }
        if (progressEl) progressEl.style.width = '0%';
        
        // 통계 업데이트 (실패 상태 반영)
        if (typeof CardRenderer !== 'undefined' && CardRenderer.updateProductionStats) {
            const productionCards = await cardAgent.getCards('production').catch(() => []);
            CardRenderer.updateProductionStats(productionCards || []);
        }
    }
}

// 자동 카드 생산
let autoProduceInterval = null;
let autoProduceTimeout = null;
let isProducing = false; // 생산 중 플래그 (중복 방지)

function startAutoProduction() {
    // 이미 실행 중이면 중복 시작 방지
    if (autoProduceInterval || autoProduceTimeout) {
        return;
    }
    
    console.log('🔄 자동 카드 생산 시작 (60초 간격, 백그라운드 지원)');
    
    // 즉시 한 번 실행
    scheduleNextProduction();
    
    // Page Visibility API로 백그라운드에서도 계속 작동하도록
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // 주기적으로 실행 (백그라운드에서도 작동)
    autoProduceInterval = setInterval(() => {
        scheduleNextProduction();
    }, 60000); // 1분마다
}

function scheduleNextProduction() {
    // 이미 생산 중이면 스킵
    if (isProducing) {
        console.log('⏸️ 생산 중이므로 스킵');
        return;
    }
    
    // 기존 타임아웃 정리
    if (autoProduceTimeout) {
        clearTimeout(autoProduceTimeout);
    }
    
    // 다음 생산 스케줄링 (즉시 실행)
    autoProduceTimeout = setTimeout(async () => {
        try {
            isProducing = true;
            await produceCard();
        } catch (error) {
            console.error('자동 생산 오류:', error);
        } finally {
            isProducing = false;
        }
    }, 0);
}

function handleVisibilityChange() {
    if (document.hidden) {
        console.log('📱 탭이 백그라운드로 전환됨 (자동 생산 계속 실행)');
    } else {
        console.log('📱 탭이 포그라운드로 전환됨 (자동 생산 계속 실행)');
        // 포그라운드로 돌아왔을 때 즉시 한 번 실행
        scheduleNextProduction();
    }
}

function stopAutoProduction() {
    if (autoProduceInterval) {
        clearInterval(autoProduceInterval);
        autoProduceInterval = null;
    }
    if (autoProduceTimeout) {
        clearTimeout(autoProduceTimeout);
        autoProduceTimeout = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    isProducing = false;
    console.log('⏸️ 자동 카드 생산 중지');
}

// 타임프레임 변경 (수동 변경 시 순회 인덱스도 업데이트)
function changeTimeframe(timeframe) {
    // 수동 변경이므로 자동 순회가 아님을 명시 (isAutoCycle = false)
    chartAgent.changeTimeframe(timeframe, true, false); // 순회 인덱스 업데이트, 수동 변경
}

// 분봉 순회 모드 토글
function toggleChartCycle(enabled) {
    if (enabled) {
        // 순회 모드 활성화
        chartAgent.cycleMode = true;
        chartAgent.startTimeframeCycle();
        console.log('✅ 분봉 순회 모드 활성화');
        // localStorage에 저장
        localStorage.setItem('chartCycleMode', 'true');
        setChartCycleIndicator(true);
        
        // 순회 상태 표시 업데이트
        const statusEl = document.getElementById('chart-cycle-status');
        if (statusEl) {
            statusEl.textContent = `분봉 순회 ON (${chartAgent.currentTimeframe})`;
            statusEl.classList.add('on');
        }
    } else {
        // 순회 모드 비활성화
        chartAgent.stopTimeframeCycle();
        console.log('⏸️ 분봉 순회 모드 비활성화');
        // localStorage에 저장
        localStorage.setItem('chartCycleMode', 'false');
        setChartCycleIndicator(false);
        
        // 순회 상태 표시 업데이트
        const statusEl = document.getElementById('chart-cycle-status');
        if (statusEl) {
            statusEl.textContent = '분봉 순회 OFF';
            statusEl.classList.remove('on');
        }
    }
}

// 분봉 순회 간격 업데이트
function updateChartCycleInterval(intervalSeconds) {
    const intervalMs = parseInt(intervalSeconds) * 1000;
    if (intervalMs >= 10000 && intervalMs <= 300000) { // 10초 ~ 300초 (5분)
        chartAgent.cycleIntervalMs = intervalMs;
        console.log(`🔄 분봉 순회 간격 업데이트: ${intervalSeconds}초`);
        // localStorage에 저장
        localStorage.setItem('chartCycleInterval', intervalSeconds.toString());
        
        // 순회 모드가 활성화되어 있으면 재시작
        if (chartAgent.cycleMode) {
            chartAgent.stopTimeframeCycle();
            chartAgent.startTimeframeCycle();
        }
    } else {
        console.warn(`⚠️ 순회 간격은 10초 ~ 300초 사이여야 합니다. (입력값: ${intervalSeconds}초)`);
        // 기본값으로 복원
        const intervalInput = document.getElementById('chart-cycle-interval');
        if (intervalInput) {
            intervalInput.value = 30;
        }
        chartAgent.cycleIntervalMs = 30000;
        localStorage.setItem('chartCycleInterval', '30');
    }
}

// 분봉 순회 설정 복원 (페이지 로드 시)
function restoreChartCycleSettings() {
    try {
        // 체크박스 상태 복원
        const cycleMode = localStorage.getItem('chartCycleMode');
        const cycleCheckbox = document.getElementById('chart-cycle-mode');
        if (cycleCheckbox) {
            if (cycleMode === 'true') {
                cycleCheckbox.checked = true;
                // 순회 모드 활성화
                chartAgent.cycleMode = true;
                chartAgent.startTimeframeCycle();
                console.log('✅ 분봉 순회 모드 복원: 활성화');
                setChartCycleIndicator(true);
            } else {
                cycleCheckbox.checked = false;
                chartAgent.cycleMode = false;
                console.log('⏸️ 분봉 순회 모드 복원: 비활성화');
                setChartCycleIndicator(false);
            }
        }
        
        // 순회 간격 복원
        const cycleInterval = localStorage.getItem('chartCycleInterval');
        const intervalInput = document.getElementById('chart-cycle-interval');
        if (intervalInput) {
            if (cycleInterval) {
                const intervalSeconds = parseInt(cycleInterval);
                if (intervalSeconds >= 10 && intervalSeconds <= 300) {
                    intervalInput.value = intervalSeconds;
                    chartAgent.cycleIntervalMs = intervalSeconds * 1000;
                    console.log(`🔄 분봉 순회 간격 복원: ${intervalSeconds}초`);
                } else {
                    intervalInput.value = 30;
                    chartAgent.cycleIntervalMs = 30000;
                }
            } else {
                intervalInput.value = 30;
                chartAgent.cycleIntervalMs = 30000;
            }
        }
    } catch (error) {
        console.error('분봉 순회 설정 복원 실패:', error);
    }
}

// 기본값으로 자동 순회 활성화 (저장된 설정이 없을 때)
function ensureDefaultChartCycle() {
    const stored = localStorage.getItem('chartCycleMode');
    const shouldEnable = stored === null ? true : stored === 'true';
    const cycleCheckbox = document.getElementById('chart-cycle-mode');
    if (cycleCheckbox) {
        cycleCheckbox.checked = shouldEnable;
    }
    toggleChartCycle(shouldEnable);
}

// 실제 트레이딩 토글 (사이드바)
async function toggleRealTrading() {
    try {
        const newValue = !realTradingEnabled;
        
        await API.saveSettings({ real_trading: newValue });
        
        realTradingEnabled = newValue;
        const btn = document.getElementById('trade-toggle');
        if (btn) {
            btn.textContent = newValue ? 'ON' : 'OFF';
            btn.className = `toggle-btn ${newValue ? 'on' : 'off'}`;
        }
    } catch (error) {
        console.error('트레이딩 토글 실패:', error);
        console.error('트레이딩 토글 실패:', error.message);
        showToast('트레이딩 토글 실패: ' + error.message, 'error');
    }
}

// 사이드바 설정 표시 업데이트
async function updateSidebarSettings() {
    try {
        const settings = await API.getSettings();
        
        const minAmountEl = document.getElementById('sidebar-min-amount');
        const feeRateEl = document.getElementById('sidebar-fee-rate');
        const updateCycleEl = document.getElementById('sidebar-update-cycle');
        
        if (minAmountEl) minAmountEl.textContent = (settings.min_buy_amount || 5000).toLocaleString();
        if (feeRateEl) feeRateEl.textContent = (settings.fee_rate || 0.1).toFixed(2);
        if (updateCycleEl) updateCycleEl.textContent = settings.update_cycle_seconds || 25;
    } catch (error) {
        console.error('사이드바 설정 업데이트 실패:', error);
    }
}

// 진행 상태 업데이트
function updateProgress(value, message) {
    const statusEl = document.getElementById('process-status');
    const progressEl = document.getElementById('process-progress');
    
    if (statusEl) statusEl.textContent = message || '전체 프로세스 업데이트 중..';
    if (progressEl) progressEl.style.width = `${value}%`;
}

// 자동 업데이트 시작
// 강화학습 AI 상태 업데이트
async function updateRLAIStatus() {
    try {
        const response = await fetch('/api/ai/rl-info');
        if (!response.ok) {
            throw new Error('RL 정보 조회 실패');
        }
        const data = await response.json();
        
        const statusEl = document.getElementById('rl-ai-status');
        const statusTextEl = statusEl?.querySelector('.rl-ai-status-text');
        
        if (!statusEl || !statusTextEl) return;
        
        if (!data.available) {
            statusTextEl.textContent = '강화학습 AI 시스템 초기화 중...';
            return;
        }
        
        const trainingStats = data.training_stats || {};
        const recentPerf = data.recent_performance || {};
        const expBuffer = data.experience_buffer || {};
        const level = trainingStats.level || 1;
        const totalExp = trainingStats.total_experience_count || 0;
        const avgReward = recentPerf.avg_reward || 0;
        const actionDist = recentPerf.action_distribution || {};
        
        // 현재 행동 분포에서 가장 많은 액션 찾기
        let dominantAction = 'HOLD';
        let maxCount = actionDist.HOLD || 0;
        if ((actionDist.BUY || 0) > maxCount) {
            dominantAction = 'BUY';
            maxCount = actionDist.BUY;
        }
        if ((actionDist.SELL || 0) > maxCount) {
            dominantAction = 'SELL';
            maxCount = actionDist.SELL;
        }
        
        // 한 두줄로 간단하게 표시
        const actionEmoji = {
            'BUY': '🟢',
            'SELL': '🔴',
            'HOLD': '⚪',
            'FREEZE': '🟡',
            'DELETE': '❌'
        };
        
        const actionText = {
            'BUY': '매수',
            'SELL': '매도',
            'HOLD': '보유',
            'FREEZE': '동결',
            'DELETE': '폐기'
        };
        
        const rewardColor = avgReward >= 0 ? '#0ecb81' : '#f6465d';
        const rewardText = avgReward >= 0 ? `+${avgReward.toFixed(2)}` : avgReward.toFixed(2);
        
        // 첫 번째 줄: 레벨, 경험 수, 평균 보상
        // 두 번째 줄: 현재 주요 행동, 학습 가능 여부
        const line1 = `LV.${level} | 경험 ${totalExp.toLocaleString()}개 | 보상 ${rewardText}`;
        const line2 = `${actionEmoji[dominantAction] || '⚪'} ${actionText[dominantAction] || '보유'} 판정 우세 | ${expBuffer.can_train ? '학습 가능' : '학습 대기'}`;
        
        statusTextEl.innerHTML = `${line1}<br>${line2}`;
        statusTextEl.style.color = '#ffffff';
        statusTextEl.style.fontSize = '11px';
        statusTextEl.style.lineHeight = '1.4';
        
    } catch (error) {
        console.error('강화학습 AI 상태 업데이트 실패:', error);
        const statusEl = document.getElementById('rl-ai-status');
        const statusTextEl = statusEl?.querySelector('.rl-ai-status-text');
        if (statusTextEl) {
            statusTextEl.textContent = '강화학습 AI 상태 조회 중...';
        }
    }
}

async function startAutoUpdates() {
    // 기존 인터벌 정리
    Object.values(updateIntervals).forEach(interval => clearInterval(interval));
    updateIntervals = {};
    
    // 설정에서 업데이트 주기 가져오기
    let settings = {};
    try {
        settings = await API.getSettings();
    } catch (error) {
        console.error('설정 로드 실패, 기본값 사용:', error);
    }
    
    const cycleSeconds = (settings.update_cycle_seconds || 25) * 1000;
    const priceUpdateInterval = settings.price_update_interval_ms || 5000;
    const balanceUpdateInterval = settings.balance_update_interval_ms || 10000;
    const chartUpdateInterval = settings.chart_update_interval_ms || 5000;
    const cardChartUpdateInterval = settings.card_chart_update_interval_ms || 5000;
    
    // 로컬 Config 업데이트
    Config.set('CHART_UPDATE_INTERVAL', chartUpdateInterval);
    
    // 가격 업데이트
    updateIntervals.price = setInterval(updatePrice, priceUpdateInterval);
    
    // 잔고 업데이트
    updateIntervals.balance = setInterval(updateBalance, balanceUpdateInterval);
    
    // 강화학습 AI 상태 업데이트 (10초마다)
    updateRLAIStatus(); // 즉시 한 번 실행
    updateIntervals.rlAI = setInterval(updateRLAIStatus, 10000);
    
    // 차트 업데이트 (실시간) - 비활성화됨
    // await chartAgent.startAutoUpdate(chartUpdateInterval);
    
    // 카드 업데이트 (순차적 업데이트를 위해 주기 조정, 백그라운드에서도 작동)
    updateIntervals.cards = setInterval(async () => {
            // 생산 카드만 업데이트 (기존 카드는 유지, 데이터만 갱신)
            // 백그라운드에서도 계속 작동 (Page Visibility API로 이미 처리됨)
            try {
                const productionCards = await cardAgent.getCards('production');
                
                // 생산 카드 업데이트 (기존 카드 유지)
                await CardRenderer.renderCardList(productionCards, 'production-cards', 'production');
                
                // 통계 업데이트
                CardRenderer.updateProductionStats(productionCards);
            } catch (error) {
                console.error('생산 카드 업데이트 실패:', error);
            }
    }, cycleSeconds);
    
    // 검증/폐기 카드 주기적 업데이트
    updateIntervals.verification = setInterval(refreshVerificationCards, cycleSeconds);
    
    // 실시간 카드 차트 업데이트 (순차적)
    updateIntervals.cardCharts = setInterval(updateCardCharts, cardChartUpdateInterval);
    
    // 프로세스 업데이트
    updateIntervals.process = setInterval(async () => {
        await updatePrice();
        await updateBalance();
        await chartAgent.update();
        updateProgress(100, '전체 프로세스 업데이트 완료');
        setTimeout(() => updateProgress(0, '전체 프로세스 업데이트 중..'), 1000);
    }, cycleSeconds);
}

// 설정 모달
function showSettings() {
    document.getElementById('settings-modal').style.display = 'block';
    loadSettings();
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

async function loadSettings() {
    try {
        const settings = await API.getSettings();
        const contentEl = document.getElementById('settings-content');
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="settings-section">
                    <h3>📊 N/B 설정</h3>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <label for="nb-decimal-places">N/B 소수점 자리수:</label>
                            <input type="number" id="nb-decimal-places" value="${settings.nb_decimal_places || 10}" min="1" max="20" step="1">
                            <span class="setting-desc">N/B 값 표시 소수점 자리수 (1-20)</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>💰 트레이딩 설정</h3>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <label for="min-buy-amount">최소 매수 금액:</label>
                            <input type="number" id="min-buy-amount" value="${settings.min_buy_amount || 5000}" min="1000" step="1000">
                            <span>KRW</span>
                            <span class="setting-desc">최소 매수 금액 (KRW)</span>
                        </div>
                        <div class="setting-item">
                            <label for="fee-rate">수수료:</label>
                            <input type="number" id="fee-rate" value="${settings.fee_rate || 0.1}" min="0" max="1" step="0.01">
                            <span>%</span>
                            <span class="setting-desc">거래 수수료율 (%)</span>
                        </div>
                        <div class="setting-item">
                            <label for="real-trading">실제 트레이딩:</label>
                            <button id="real-trading-toggle" class="toggle-btn ${settings.real_trading ? 'on' : 'off'}" onclick="toggleRealTradingSetting()">
                                ${settings.real_trading ? 'ON' : 'OFF'}
                            </button>
                            <span class="setting-desc">실제 거래 실행 여부 (OFF: 모니터링 전용)</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>⏱️ 업데이트 설정</h3>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <label for="update-cycle-seconds">전체 프로세스 업데이트 주기:</label>
                            <input type="number" id="update-cycle-seconds" value="${settings.update_cycle_seconds || 25}" min="5" max="300" step="5">
                            <span>초</span>
                            <span class="setting-desc">전체 프로세스 업데이트 주기 (5-300초)</span>
                        </div>
                        <div class="setting-item">
                            <label for="price-update-interval">가격 업데이트 주기:</label>
                            <input type="number" id="price-update-interval" value="${settings.price_update_interval_ms || 5000}" min="1000" max="60000" step="1000">
                            <span>ms</span>
                            <span class="setting-desc">BTC 가격 업데이트 주기 (밀리초)</span>
                        </div>
                        <div class="setting-item">
                            <label for="price-cache-ttl">가격 캐시 TTL:</label>
                            <input type="number" id="price-cache-ttl" value="${settings.price_cache_ttl_seconds || 60}" min="10" max="300" step="10">
                            <span>초</span>
                            <span class="setting-desc">가격 캐시 유효 시간 (초)</span>
                        </div>
                        <div class="setting-item">
                            <label for="price-rate-limit">가격 API 호출 한도:</label>
                            <input type="number" id="price-rate-limit" value="${settings.price_rate_limit_per_min || 10}" min="1" max="60" step="1">
                            <span>회/분</span>
                            <span class="setting-desc">가격 API 호출 최대 횟수 (분당)</span>
                        </div>
                        <div class="setting-item">
                            <label for="balance-update-interval">잔고 업데이트 주기:</label>
                            <input type="number" id="balance-update-interval" value="${settings.balance_update_interval_ms || 10000}" min="1000" max="60000" step="1000">
                            <span>ms</span>
                            <span class="setting-desc">잔고 정보 업데이트 주기 (밀리초)</span>
                        </div>
                        <div class="setting-item">
                            <label for="chart-update-interval">차트 & N/B 값 업데이트 주기:</label>
                            <input type="number" id="chart-update-interval" value="${settings.chart_update_interval_ms || 5000}" min="1000" max="60000" step="1000">
                            <span>ms</span>
                            <span class="setting-desc">메인 차트와 N/B 값 실시간 업데이트 주기 (밀리초, 기본값: 5000ms = 5초)</span>
                        </div>
                        <div class="setting-item">
                            <label for="card-chart-update-interval">카드 차트 업데이트 주기:</label>
                            <input type="number" id="card-chart-update-interval" value="${settings.card_chart_update_interval_ms || 5000}" min="1000" max="60000" step="1000">
                            <span>ms</span>
                            <span class="setting-desc">카드 내부 차트 업데이트 주기 (밀리초)</span>
                        </div>
                        <div class="setting-item">
                            <label for="chart-animation-interval">타임프레임 순회 주기:</label>
                            <input type="number" id="chart-animation-interval" value="${settings.chart_animation_interval_ms || 30000}" min="10000" max="120000" step="5000">
                            <span>ms</span>
                            <span class="setting-desc">메인 차트 타임프레임 자동 순회 주기 (1m→3m→5m→15m→30m→60m→1d→1m...) (밀리초, 기본값: 30000ms = 30초, 권장: 30초~1분)</span>
                        </div>
                        <div class="setting-item">
                            <label for="ai-update-interval">AI 업데이트 주기:</label>
                            <input type="number" id="ai-update-interval" value="${settings.ai_update_interval_ms || 60000}" min="10000" max="300000" step="10000">
                            <span>ms</span>
                            <span class="setting-desc">AI 분석 업데이트 주기 (밀리초)</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>🃏 카드 설정</h3>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <label for="production-card-limit">생산 카드 제한:</label>
                            <input type="number" id="production-card-limit" value="${settings.production_card_limit || 4}" min="0" max="20" step="1">
                            <span>개</span>
                            <span class="setting-desc">최대 생산 카드 수 (0: 제한 없음)</span>
                        </div>
                        <div class="setting-item">
                            <label for="max-history-per-card">카드당 최대 히스토리 수:</label>
                            <input type="number" id="max-history-per-card" value="${settings.max_history_per_card || 100}" min="10" max="1000" step="10">
                            <span>개</span>
                            <span class="setting-desc">각 카드당 저장할 최대 히스토리 수</span>
                        </div>
                        <div class="setting-item">
                            <label for="production-timeframes">생산 타임프레임:</label>
                            <input type="text" id="production-timeframes" value="${(settings.production_timeframes || ['1m', '3m', '5m', '15m', '30m', '60m', '1d']).join(', ')}" placeholder="1m, 3m, 5m, 15m, 30m, 60m, 1d">
                            <span class="setting-desc">쉼표로 구분된 타임프레임 목록</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>📈 차트 설정</h3>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <label for="chart-points">차트 포인트 수:</label>
                            <input type="number" id="chart-points" value="${settings.chart_points || 200}" min="50" max="1000" step="50">
                            <span>개</span>
                            <span class="setting-desc">차트에 표시할 가격 데이터 포인트 수</span>
                        </div>
                    </div>
                </div>

                <div class="settings-section">
                    <h3>🔑 API 설정</h3>
                    <div class="settings-grid">
                        <div class="setting-item">
                            <label for="upbit-access-key">Upbit Access Key:</label>
                            <input type="password" id="upbit-access-key" value="${settings.upbit_access_key || ''}" placeholder="API Access Key">
                            <span class="setting-desc">Upbit API Access Key (env.local에서 로드됨)</span>
                        </div>
                        <div class="setting-item">
                            <label for="upbit-secret-key">Upbit Secret Key:</label>
                            <input type="password" id="upbit-secret-key" value="${settings.upbit_secret_key || ''}" placeholder="API Secret Key">
                            <span class="setting-desc">Upbit API Secret Key (env.local에서 로드됨)</span>
                        </div>
                        <div class="setting-item">
                            <label>API 키 설정 위치:</label>
                            <div class="setting-info">
                                <p>API 키는 <code>env.local</code> 파일에 저장됩니다.</p>
                                <p>위치: <code>v0.0.0.4/env.local</code> 또는 <code>html_version/env.local</code></p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="settings-actions">
                    <button class="btn-primary" onclick="saveAllSettings()">💾 모든 설정 저장</button>
                    <button class="btn-secondary" onclick="resetSettings()">🔄 기본값으로 초기화</button>
                    <button class="btn-secondary" onclick="closeSettings()">❌ 닫기</button>
                </div>
            `;
        }
        
        // 서버에서 가져온 설정을 Config 객체에도 반영
        if (settings) {
            Config.set('NB_DECIMAL_PLACES', settings.nb_decimal_places || 10);
            Config.set('UPDATE_INTERVAL', (settings.update_cycle_seconds || 25) * 1000);
            Config.set('CHART_UPDATE_INTERVAL', settings.chart_update_interval_ms || 5000);
            Config.set('CHART_ANIMATION_INTERVAL', settings.chart_animation_interval_ms || 30000);
            Config.set('MAX_PRODUCTION_CARDS', settings.production_card_limit || 4);
            Config.set('MAX_HISTORY_PER_CARD', settings.max_history_per_card || 100);
            Config.set('CHART_POINTS', settings.chart_points || 200);
            Config.set('AI_UPDATE_INTERVAL', settings.ai_update_interval_ms || 60000);
            
            console.log('✅ 설정이 Config 객체에 반영되었습니다:', {
                MAX_PRODUCTION_CARDS: Config.get('MAX_PRODUCTION_CARDS', 4),
                production_card_limit: settings.production_card_limit
            });
        }
    } catch (error) {
        console.error('설정 로드 실패:', error);
        const contentEl = document.getElementById('settings-content');
        if (contentEl) {
            contentEl.innerHTML = `<div style="color: #ff6b6b; padding: 20px;">설정을 불러올 수 없습니다: ${error.message}</div>`;
        }
    }
}

// 모든 설정 저장
async function saveAllSettings() {
    try {
        const settings = {
            // N/B 설정
            nb_decimal_places: parseInt(document.getElementById('nb-decimal-places').value) || 10,
            
            // 트레이딩 설정
            min_buy_amount: parseFloat(document.getElementById('min-buy-amount').value) || 5000,
            fee_rate: parseFloat(document.getElementById('fee-rate').value) || 0.1,
            
            // 업데이트 주기 설정
            update_cycle_seconds: parseInt(document.getElementById('update-cycle-seconds').value) || 25,
            price_update_interval_ms: parseInt(document.getElementById('price-update-interval').value) || 5000,
            price_cache_ttl_seconds: parseInt(document.getElementById('price-cache-ttl').value) || 60,
            price_rate_limit_per_min: parseInt(document.getElementById('price-rate-limit').value) || 10,
            balance_update_interval_ms: parseInt(document.getElementById('balance-update-interval').value) || 10000,
            chart_update_interval_ms: parseInt(document.getElementById('chart-update-interval').value) || 5000,
            card_chart_update_interval_ms: parseInt(document.getElementById('card-chart-update-interval').value) || 5000,
            chart_animation_interval_ms: parseInt(document.getElementById('chart-animation-interval').value) || 30000,
            ai_update_interval_ms: parseInt(document.getElementById('ai-update-interval').value) || 60000,
            
            // 카드 설정
            production_card_limit: parseInt(document.getElementById('production-card-limit').value) || 4,
            max_history_per_card: parseInt(document.getElementById('max-history-per-card').value) || 100,
            production_timeframes: document.getElementById('production-timeframes').value
                .split(',')
                .map(tf => tf.trim())
                .filter(tf => tf.length > 0),
            
            // 차트 설정
            chart_points: parseInt(document.getElementById('chart-points').value) || 200
        };
        
        // 실제 트레이딩 설정
        const realTradingToggle = document.getElementById('real-trading-toggle');
        if (realTradingToggle) {
            settings.real_trading = realTradingToggle.classList.contains('on');
        }
        
        await API.saveSettings(settings);
        
        // 로컬 설정도 업데이트
        Config.set('NB_DECIMAL_PLACES', settings.nb_decimal_places);
        Config.set('UPDATE_INTERVAL', settings.update_cycle_seconds * 1000);
        Config.set('CHART_UPDATE_INTERVAL', settings.chart_update_interval_ms);
        Config.set('CHART_ANIMATION_INTERVAL', settings.chart_animation_interval_ms);
        Config.set('MAX_PRODUCTION_CARDS', settings.production_card_limit);
        Config.set('MAX_HISTORY_PER_CARD', settings.max_history_per_card);
        Config.set('CHART_POINTS', settings.chart_points);
        Config.set('AI_UPDATE_INTERVAL', settings.ai_update_interval_ms);
        
        // 업데이트 주기 재시작
        startAutoUpdates();
        
        // 사이드바 설정 표시 업데이트
        await refreshSidebarAfterSettingsSave();
        
        console.log('✅ 설정이 저장되었습니다!');
        showToast('✅ 설정이 저장되었습니다!', 'success');
        
        // 설정 페이지 새로고침
        await loadSettings();
    } catch (error) {
        console.error('설정 저장 실패:', error);
        showToast('❌ 설정 저장 실패: ' + error.message, 'error');
    }
}

// 설정 기본값으로 초기화
async function resetSettings() {
    if (!confirm('모든 설정을 기본값으로 초기화하시겠습니까?')) {
        return;
    }
    
    try {
        const defaultSettings = {
            // N/B 설정
            nb_decimal_places: 10,
            
            // 트레이딩 설정
            min_buy_amount: 5000,
            fee_rate: 0.1,
            real_trading: false,
            
            // 업데이트 주기 설정
            update_cycle_seconds: 25,
            price_update_interval_ms: 5000,
            balance_update_interval_ms: 10000,
            chart_update_interval_ms: 5000,
            card_chart_update_interval_ms: 5000,
            chart_animation_interval_ms: 30000,
            ai_update_interval_ms: 60000,
            price_cache_ttl_seconds: 60,
            price_rate_limit_per_min: 10,
            
            // 카드 설정
            production_card_limit: 4,
            max_history_per_card: 100,
            production_timeframes: ['1m', '3m', '5m', '15m', '30m', '60m', '1d'],
            
            // 차트 설정
            chart_points: 200
        };
        
        await API.saveSettings(defaultSettings);
        
        // 로컬 설정도 업데이트
        Config.set('NB_DECIMAL_PLACES', defaultSettings.nb_decimal_places);
        Config.set('UPDATE_INTERVAL', defaultSettings.update_cycle_seconds * 1000);
        Config.set('CHART_UPDATE_INTERVAL', defaultSettings.chart_update_interval_ms);
        Config.set('CHART_ANIMATION_INTERVAL', defaultSettings.chart_animation_interval_ms);
        Config.set('MAX_PRODUCTION_CARDS', defaultSettings.production_card_limit);
        Config.set('MAX_HISTORY_PER_CARD', defaultSettings.max_history_per_card);
        Config.set('CHART_POINTS', defaultSettings.chart_points);
        Config.set('AI_UPDATE_INTERVAL', defaultSettings.ai_update_interval_ms);
        
        // 업데이트 주기 재시작
        startAutoUpdates();
        
        // 사이드바 설정 표시 업데이트
        await refreshSidebarAfterSettingsSave();
        
        console.log('✅ 설정이 기본값으로 초기화되었습니다!');
        showToast('✅ 설정이 기본값으로 초기화되었습니다!', 'success');
        
        // 설정 페이지 새로고침
        await loadSettings();
    } catch (error) {
        console.error('설정 초기화 실패:', error);
        showToast('❌ 설정 초기화 실패: ' + error.message, 'error');
    }
}

// 실제 트레이딩 토글 (설정 페이지)
function toggleRealTradingSetting() {
    const btn = document.getElementById('real-trading-toggle');
    if (btn) {
        const isOn = btn.classList.contains('on');
        btn.classList.toggle('on', !isOn);
        btn.classList.toggle('off', isOn);
        btn.textContent = !isOn ? 'ON' : 'OFF';
    }
}

// 강화학습 AI 분석 수동 업데이트
async function updateRLAnalysis(cardId) {
    try {
        const updateBtn = document.getElementById(`rl-update-btn-${cardId}`);
        if (updateBtn) {
            updateBtn.disabled = true;
            updateBtn.textContent = '⏳';
            updateBtn.style.opacity = '0.5';
        }
        
        console.log(`🔄 강화학습 AI 분석 수동 업데이트: ${cardId}`);
        
        // 강화학습 AI 분석 실행
        if (typeof CardRenderer !== 'undefined' && CardRenderer.startAIAnalysis) {
            await CardRenderer.startAIAnalysis(cardId);
        } else {
            console.error('강화학습 AI 분석 함수를 찾을 수 없습니다.');
            showToast('❌ AI 분석 업데이트 실패', 'error');
        }
        
        // 버튼 복원 (약간의 지연 후)
        setTimeout(() => {
            if (updateBtn) {
                updateBtn.disabled = false;
                updateBtn.textContent = '🔄';
                updateBtn.style.opacity = '1';
            }
        }, 2000);
        
    } catch (error) {
        console.error('강화학습 AI 분석 업데이트 실패:', error);
        showToast('❌ AI 분석 업데이트 실패: ' + error.message, 'error');
        
        const updateBtn = document.getElementById(`rl-update-btn-${cardId}`);
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.textContent = '🔄';
            updateBtn.style.opacity = '1';
        }
    }
}

// 모달 외부 클릭 시 닫기
window.onclick = function(event) {
    const modal = document.getElementById('settings-modal');
    if (event.target === modal) {
        closeSettings();
    }
}


/**
 * AI 에이전트
 * AI 분석, 강화학습, 의사결정을 담당하는 에이전트
 */
class AIAgent {
    constructor() {
        this.analysisCache = new Map();
        this.rlAnalysisCache = new Map();
    }
    
    /**
     * 차트 AI 분석
     * @param {Object} chartData - 차트 데이터
     * @param {Object} card - 카드 데이터 (선택적, Zone 정보 캐싱용)
     * @returns {Promise<Object>} AI 분석 결과
     */
    async analyzeChart(chartData, card = null) {
        try {
            if (!chartData || !chartData.prices) {
                return {
                    signal: 'WAIT',
                    message: '차트 데이터가 없습니다',
                    confidence: 0
                };
            }
            
            // 카드에 이미 Zone 정보가 있으면 즉시 반환 (성능 최적화)
            if (card) {
                const existingZone = card.zone || card.ml_ai_zone || card.basic_ai_zone ||
                                   card.recent_ml_ai_analysis?.zone || card.recent_basic_ai_analysis?.zone;
                const existingRValue = card.r_value || card.ml_ai_r_value || card.basic_ai_r_value ||
                                     card.recent_ml_ai_analysis?.r_value || card.recent_basic_ai_analysis?.r_value;
                
                if (existingZone && existingRValue !== null && existingRValue !== undefined) {
                    console.log(`✅ Zone 정보 캐시 사용: ${card.card_id} (${existingZone}, r=${existingRValue})`);
                    return {
                        zone: existingZone,
                        r_value: existingRValue,
                        zone_message: `Zone 분석: ${existingZone} 구역`,
                        cached: true
                    };
                }
            }
            
            // 캐시 확인
            const cacheKey = JSON.stringify(chartData.prices.slice(-50));
            if (this.analysisCache.has(cacheKey)) {
                const cached = this.analysisCache.get(cacheKey);
                console.log(`✅ Zone 분석 캐시 사용: ${cacheKey.substring(0, 20)}...`);
                return cached;
            }
            
            // AI 분석 요청 (카드 데이터 포함)
            const result = await API.analyzeChart(chartData, card);
            
            if (result && result.zone) {
                // 캐시에 저장
                this.analysisCache.set(cacheKey, result);
                
                // UI 업데이트
                this.updateChartAIDisplay(result);
                
                return result;
            }
            
            return {
                signal: 'WAIT',
                message: 'AI 분석 중...',
                confidence: 0
            };
        } catch (error) {
            console.error('차트 AI 분석 실패:', error);
            return {
                signal: 'ERROR',
                message: 'AI 분석 실패',
                confidence: 0
            };
        }
    }
    
    /**
     * 강화학습 AI 분석
     * @param {string} cardId - 카드 ID
     * @returns {Promise<Object>} 강화학습 분석 결과
     */
    async analyzeRL(cardId) {
        try {
            if (!cardId) {
                return null;
            }
            
            // 캐시 확인
            if (this.rlAnalysisCache.has(cardId)) {
                const cached = this.rlAnalysisCache.get(cardId);
                // 1분 이내 캐시만 사용
                if (Date.now() - cached.timestamp < 60000) {
                    return cached.data;
                }
            }
            
            // 강화학습 분석 요청
            const result = await API.analyzeRL(cardId);
            
            if (result) {
                // 에러 응답 체크
                if (result.error) {
                    throw new Error(result.error);
                }
                
                // 캐시에 저장
                this.rlAnalysisCache.set(cardId, {
                    data: result,
                    timestamp: Date.now()
                });
            }
            
            return result;
        } catch (error) {
            console.error('강화학습 AI 분석 실패:', error);
            // 에러 정보를 포함한 객체 반환 (null 대신)
            return {
                error: true,
                message: error.message || '강화학습 AI 분석 실패',
                errorDetails: error.toString()
            };
        }
    }
    
    /**
     * 차트 AI 표시 업데이트
     * @param {Object} result - AI 분석 결과
     */
    updateChartAIDisplay(result) {
        const signalEl = document.getElementById('chart-ai-signal');
        const messageEl = document.getElementById('chart-ai-message');
        
        if (signalEl) {
            signalEl.textContent = result.signal || 'WAIT';
            signalEl.className = `chart-ai-signal signal-${result.signal?.toLowerCase() || 'wait'}`;
        }
        
        if (messageEl) {
            messageEl.textContent = result.message || 'AI 분석 중...';
        }
    }
    
    /**
     * 행동 결정 (강화학습)
     * @param {Object} state - 현재 상태
     * @param {Object} card - 카드 데이터
     * @returns {Promise<string>} 행동 (BUY, SELL, HOLD)
     */
    async decideAction(state, card) {
        try {
            if (!card || !card.card_id) {
                return 'HOLD';
            }
            
            // 강화학습 분석
            const rlResult = await this.analyzeRL(card.card_id);
            
            if (rlResult && rlResult.action) {
                return rlResult.action;
            }
            
            // 기본 의사결정 로직
            if (card.nb_value !== undefined) {
                if (card.nb_value > 0.7) {
                    return 'BUY';
                } else if (card.nb_value < 0.3) {
                    return 'SELL';
                }
            }
            
            return 'HOLD';
        } catch (error) {
            console.error('행동 결정 실패:', error);
            return 'HOLD';
        }
    }
    
    /**
     * 캐시 클리어
     */
    clearCache() {
        this.analysisCache.clear();
        this.rlAnalysisCache.clear();
    }
}

// 전역 인스턴스
const aiAgent = new AIAgent();


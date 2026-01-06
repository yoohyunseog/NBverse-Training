/**
 * 카드 에이전트
 * 카드 생산, 관리, 업데이트를 담당하는 에이전트
 * N/B 값은 필수로 포함되어야 함
 */
class CardAgent {
    constructor() {
        this.maxCards = Config.get('MAX_PRODUCTION_CARDS', 4);
        this.cards = new Map(); // 메모리 캐시
        this.nbAgent = nbAgent; // N/B 에이전트 참조
    }
    
    /**
     * 카드 생산
     * @param {Object} chartData - 차트 데이터 (선택사항)
     * @returns {Promise<Object>} 생산된 카드 정보
     */
    async produceCard(chartData = null) {
        try {
            // 1. 차트 데이터 가져오기 (없으면 API에서 가져옴)
            if (!chartData) {
                const currentTimeframe = document.getElementById('chart-timeframe')?.value || '1m';
                // 설정에서 차트 포인트 수 가져오기
                let chartPoints = Config.get('CHART_POINTS', 200);
                try {
                    const settings = await API.getSettings();
                    chartPoints = settings.chart_points || chartPoints;
                } catch (error) {
                    // 설정 로드 실패 시 기본값 사용
                }
                const chartResult = await API.getChartData(currentTimeframe, chartPoints);
                chartData = chartResult;
            }
            
            if (!chartData || !chartData.prices || chartData.prices.length < 2) {
                throw new Error('차트 데이터가 부족합니다');
            }
            
            // 2. N/B 값 계산 (필수)
            const nbResult = await this.nbAgent.calculateNB(chartData.prices, chartData);
            
            if (!nbResult || !nbResult.nb_value) {
                throw new Error('N/B 값 계산에 실패했습니다');
            }
            
            // 3. N/B 값 중복 체크
            const isDuplicate = await this.nbAgent.checkDuplicate(nbResult.nb_value);
            if (isDuplicate) {
                console.warn('중복된 N/B 값이 감지되었습니다:', nbResult.nb_value);
            }
            
            // 4. 카드 데이터 생성
            const cardData = {
                card_id: this.generateCardId(),
                card_key: this.generateCardKey(),
                timeframe: chartData.timeframe || '1m',
                nb_value: nbResult.nb_value, // 필수
                nb_max: nbResult.nb_max, // 필수
                nb_min: nbResult.nb_min, // 필수
                bit_max: nbResult.bit_max || nbResult.nb_max,
                bit_min: nbResult.bit_min || nbResult.nb_min,
                chart_data: chartData,
                production_time: new Date().toISOString(),
                card_state: 'ACTIVE',
                card_type: 'normal',
                score: 100.0,
                rank: 'C',
                history_list: [{
                    type: 'NEW',
                    timestamp: new Date().toISOString(),
                    nb_value: nbResult.nb_value,
                    nb_max: nbResult.nb_max,
                    nb_min: nbResult.nb_min
                }]
            };
            
            // 5. 서버에 카드 생성 요청 (chart_data만 전달)
            const result = await API.produceCard(chartData);
            
            if (result && result.card) {
                const card = result.card;
                
                // 메모리 캐시에 저장
                if (card.card_id) {
                    this.cards.set(card.card_id, card);
                    
                    // 최대 카드 수 제한
                    if (this.cards.size > this.maxCards) {
                        await this.removeOldestCard();
                    }
                }
                
                return card;
            }
            
            throw new Error('카드 생산에 실패했습니다');
        } catch (error) {
            console.error('카드 생산 실패:', error);
            throw error;
        }
    }
    
    /**
     * 카드 목록 가져오기
     * @param {string} type - 카드 타입 ('production', 'verification', 'discarded')
     * @returns {Promise<Array>} 카드 목록
     */
    async getCards(type = 'production') {
        try {
            console.log(`📡 ${type} 카드 API 호출 시작...`);
            let response = null;
            
            switch (type) {
                case 'active':
                    response = await API.getActiveCards();
                    break;
                case 'production':
                    response = await API.getProductionCards();
                    break;
                case 'verification':
                    response = await API.getVerificationCards();
                    break;
                case 'discarded':
                    response = await API.getDiscardedCards();
                    break;
                default:
                    throw new Error(`알 수 없는 카드 타입: ${type}`);
            }
            
            // API 응답 형식 확인: {cards: [...], count: ...} 또는 배열
            console.log(`📦 ${type} 카드 API 응답:`, response);
            console.log(`📦 응답 타입:`, typeof response);
            console.log(`📦 응답이 배열인가?:`, Array.isArray(response));
            console.log(`📦 응답에 cards 속성이 있는가?:`, response && 'cards' in response);
            
            let cards = [];
            if (Array.isArray(response)) {
                cards = response;
                console.log(`✅ 배열 형식으로 파싱: ${cards.length}개`);
            } else if (response && Array.isArray(response.cards)) {
                cards = response.cards;
                console.log(`✅ response.cards로 파싱: ${cards.length}개 (전체 count: ${response.count || 'N/A'})`);
            } else if (response && response.data && Array.isArray(response.data)) {
                cards = response.data;
                console.log(`✅ response.data로 파싱: ${cards.length}개`);
            } else {
                console.error('❌ 예상치 못한 API 응답 형식:', response);
                console.error('❌ 응답 구조:', JSON.stringify(response, null, 2));
                return [];
            }
            
            console.log(`📦 ${type} 카드 파싱 결과:`, cards.length, '개');
            
            // 배열이 아닌 경우 빈 배열 반환
            if (!Array.isArray(cards)) {
                console.error('❌ cards가 배열이 아닙니다:', typeof cards, cards);
                return [];
            }
            
            // 카드가 없을 때 상세 정보 출력
            if (cards.length === 0) {
                console.warn(`⚠️ ${type} 카드가 0개입니다.`);
                console.warn(`⚠️ 원본 응답:`, response);
                if (response && response.count !== undefined) {
                    console.warn(`⚠️ API 응답 count: ${response.count}`);
                }
            }
            
            // N/B 값 검증 (모든 카드에 N/B 값이 있어야 함)
            const validatedCards = cards.map(card => {
                if (!card.nb_value && !card.nb_max && !card.nb_min) {
                    console.warn('⚠️ N/B 값이 없는 카드 발견:', card.card_id);
                    // 기본값 설정
                    card.nb_value = 0.5;
                    card.nb_max = 5.5;
                    card.nb_min = 5.5;
                }
                return card;
            });
            
            // 메모리 캐시 업데이트
            validatedCards.forEach(card => {
                if (card.card_id) {
                    this.cards.set(card.card_id, card);
                }
            });
            
            console.log(`✅ 최종 검증된 카드: ${validatedCards.length}개`);
            return validatedCards;
        } catch (error) {
            console.error(`❌ ${type} 카드 목록 가져오기 실패:`, error);
            console.error('❌ 에러 상세:', error.message);
            console.error('❌ 에러 스택:', error.stack);
            return [];
        }
    }
    
    /**
     * 카드 ID로 카드 가져오기
     * @param {string} cardId - 카드 ID
     * @returns {Promise<Object|null>} 카드 데이터
     */
    async getCardById(cardId) {
        try {
            // 먼저 캐시에서 확인
            if (this.cards.has(cardId)) {
                const cachedCard = this.cards.get(cardId);
                // 캐시된 카드가 최신인지 확인 (최근 5분 이내)
                const cacheTime = cachedCard._cache_time || 0;
                const now = Date.now();
                if (now - cacheTime < 300000) { // 5분
                    return cachedCard;
                }
            }
            
            // 캐시에 없거나 오래된 경우 API에서 가져오기
            const result = await API.getCard(cardId);
            
            if (result && result.card) {
                const card = result.card;
                // 캐시 시간 추가
                card._cache_time = Date.now();
                // 메모리 캐시에 저장
                this.cards.set(cardId, card);
                return card;
            } else if (result && result.card_id) {
                // 응답이 직접 카드 데이터인 경우
                result._cache_time = Date.now();
                this.cards.set(cardId, result);
                return result;
            }
            
            return null;
        } catch (error) {
            // 404 오류는 카드가 제거된 것으로 간주하고 조용히 처리
            if (error.status === 404 || error.statusCode === 404 || 
                (error.message && error.message.includes('카드를 찾을 수 없습니다'))) {
                // 캐시에서도 제거
                this.cards.delete(cardId);
                return null;
            }
            
            // 다른 오류는 로그만 출력 (콘솔 오류는 최소화)
            if (error.status !== 404) {
                console.warn(`카드 가져오기 실패 (${cardId}):`, error.message || error);
            }
            
            // 캐시에 있으면 캐시된 데이터 반환
            if (this.cards.has(cardId)) {
                return this.cards.get(cardId);
            }
            return null;
        }
    }
    
    /**
     * 카드 업데이트
     * @param {string} cardId - 카드 ID
     * @param {Object} updates - 업데이트할 데이터
     * @returns {Promise<Object>} 업데이트된 카드
     */
    async updateCard(cardId, updates) {
        try {
            // N/B 값이 업데이트되는 경우 검증
            if (updates.nb_value !== undefined) {
                if (!this.nbAgent.isValidNB(updates.nb_value)) {
                    throw new Error('유효하지 않은 N/B 값입니다');
                }
            }
            
            const result = await API.updateCard(cardId, updates);
            
            if (result && result.card_id) {
                // 메모리 캐시 업데이트
                const existingCard = this.cards.get(cardId);
                if (existingCard) {
                    this.cards.set(cardId, { ...existingCard, ...result });
                } else {
                    this.cards.set(cardId, result);
                }
            }
            
            return result;
        } catch (error) {
            console.error('카드 업데이트 실패:', error);
            throw error;
        }
    }
    
    /**
     * 카드 삭제
     * @param {string} cardId - 카드 ID
     * @returns {Promise<boolean>} 삭제 성공 여부
     */
    async deleteCard(cardId) {
        try {
            await API.deleteCard(cardId);
            this.cards.delete(cardId);
            return true;
        } catch (error) {
            console.error('카드 삭제 실패:', error);
            return false;
        }
    }
    
    /**
     * 카드 ID 생성
     * @returns {string} 카드 ID
     */
    generateCardId() {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        return `card_${timestamp}_${random}`;
    }
    
    /**
     * 카드 키 생성
     * @returns {string} 카드 키
     */
    generateCardKey() {
        const timestamp = Date.now();
        return `key_${timestamp}`;
    }
    
    /**
     * 가장 오래된 카드 제거
     * @returns {Promise<boolean>} 제거 성공 여부
     */
    async removeOldestCard() {
        if (this.cards.size === 0) {
            return false;
        }
        
        // 가장 오래된 카드 찾기
        let oldestCard = null;
        let oldestTime = Infinity;
        
        for (const [id, card] of this.cards.entries()) {
            const productionTime = new Date(card.production_time || 0).getTime();
            if (productionTime < oldestTime) {
                oldestTime = productionTime;
                oldestCard = { id, card };
            }
        }
        
        if (oldestCard) {
            return await this.deleteCard(oldestCard.id);
        }
        
        return false;
    }
    
    /**
     * 카드 검증 (N/B 값 필수 체크)
     * @param {Object} card - 카드 데이터
     * @returns {boolean} 검증 성공 여부
     */
    validateCard(card) {
        if (!card) {
            return false;
        }
        
        // N/B 값 필수 체크
        if (card.nb_value === undefined && 
            card.nb_max === undefined && 
            card.nb_min === undefined) {
            console.error('카드에 N/B 값이 없습니다:', card.card_id);
            return false;
        }
        
        // N/B 값 유효성 검사
        if (card.nb_value !== undefined && !this.nbAgent.isValidNB(card.nb_value)) {
            console.error('유효하지 않은 N/B 값:', card.nb_value);
            return false;
        }
        
        return true;
    }
    
    /**
     * 캐시 클리어
     */
    clearCache() {
        this.cards.clear();
    }
}

// 전역 인스턴스
const cardAgent = new CardAgent();


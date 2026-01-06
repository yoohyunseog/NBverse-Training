// API 클라이언트
const API = {
    baseURL: Config.API_BASE_URL,
    
    // API 서버 연결 확인
    async checkConnection() {
        try {
            // baseURL이 이미 /api로 끝나므로 /health만 추가
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃
            
            const response = await fetch(`${this.baseURL}/health`, {
                method: 'GET',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error('API 서버 연결 시간 초과');
            } else {
                console.error('API 서버 연결 실패:', error);
            }
            return false;
        }
    },
    
    // 공통 요청 함수
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        const controller = new AbortController();
        // 타임아웃 설정
        let timeoutSeconds = 30000;  // 기본 30초
        
        if (endpoint.includes('/cards/produce')) {
            // 카드 생산은 N/B 값 계산 등으로 시간이 오래 걸릴 수 있으므로 600초 (10분)
            timeoutSeconds = 600000;
        } else if (endpoint.includes('/ai/analyze-rl')) {
            // 강화학습 AI 분석은 RL 시스템 사용으로 시간이 오래 걸릴 수 있으므로 240초로 증가
            // Base Model, Emotion Model, Policy Model 모두 실행하므로 시간이 오래 걸림
            timeoutSeconds = 240000;
        } else if (endpoint.includes('/ai/analyze-chart')) {
            // ML AI 분석도 시간이 걸릴 수 있으므로 60초
            timeoutSeconds = 60000;
        }
        
        const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds);
        
        try {
            const response = await fetch(url, { 
                ...defaultOptions, 
                ...options,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // 202 Accepted는 처리 중 상태이므로 정상 응답으로 처리
            // 404 Not Found는 카드가 제거된 것으로 간주하고 조용히 처리
            if (!response.ok && response.status !== 202) {
                // 404 오류는 조용히 처리 (카드가 제거된 경우)
                if (response.status === 404 && endpoint.includes('/cards/')) {
                    const error = new Error('카드를 찾을 수 없습니다.');
                    error.status = 404;
                    error.statusCode = 404;
                    throw error;
                }
                
                const errorText = await response.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { error: errorText || `HTTP error! status: ${response.status}` };
                }
                // 오류 메시지에 details 포함
                let errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
                if (errorData.details && Array.isArray(errorData.details) && errorData.details.length > 0) {
                    errorMessage += '\n' + errorData.details.join('\n');
                }
                const error = new Error(errorMessage);
                error.details = errorData.details;
                error.errorData = errorData;
                error.status = response.status; // 상태 코드 추가
                error.statusCode = response.status; // 호환성을 위한 별칭
                throw error;
            }
            
            // 202 응답도 JSON으로 파싱
            const responseData = await response.json();
            // 202 응답인 경우 status 필드 추가
            if (response.status === 202) {
                responseData._status = 202;
            }
            return responseData;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('요청 시간 초과: API 서버가 응답하지 않습니다.');
            } else if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
                throw new Error('API 서버에 연결할 수 없습니다. start_server.bat를 실행하여 서버를 시작하세요.');
            }
            
            // 404 오류는 조용히 처리 (카드가 제거된 경우)
            if (error.status === 404 || error.statusCode === 404) {
                // 로그 출력하지 않고 조용히 throw
                throw error;
            }
            
            console.error(`API 요청 실패 [${endpoint}]:`, error);
            throw error;
        }
    },
    
    // GET 요청
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },
    
    // POST 요청
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },
    
    // PUT 요청
    async put(endpoint, data) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },
    
    // DELETE 요청
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },
    
    // 가격 정보
    async getPrice() {
        return this.get('/price');
    },
    
    // 잔고 정보
    async getBalance() {
        return this.get('/balance');
    },
    
    // 차트 데이터
    async getChartData(timeframe = '1m', count = null) {
        // count가 없으면 설정에서 가져오기
        if (count === null) {
            try {
                const settings = await this.getSettings();
                count = settings.chart_points || 200;
            } catch (error) {
                count = Config.get('CHART_POINTS', 200);
            }
        }
        // 캐시 방지를 위해 타임스탬프 추가
        const timestamp = Date.now();
        return this.get(`/chart?timeframe=${timeframe}&count=${count}&_t=${timestamp}`);
    },
    
    // 활성 카드 목록 (보유 중 탭용)
    async getActiveCards() {
        return this.get('/cards/active');
    },
    
    // 생산 카드 목록
    async getProductionCards() {
        return this.get('/cards/production');
    },
    
    // 검증 카드 목록
    async getVerificationCards() {
        return this.get('/cards/verification');
    },
    
    // 폐기 카드 목록
    async getDiscardedCards() {
        return this.get('/cards/discarded');
    },
    
    // 카드 생산
    async produceCard(chartData = null) {
        return this.post('/cards/produce', { chart_data: chartData });
    },
    
    // 카드 업데이트
    async updateCard(cardId, data) {
        return this.put(`/cards/${cardId}`, data);
    },
    
    // 카드 조회 (단일)
    async getCard(cardId) {
        return this.get(`/cards/${cardId}`);
    },
    
    // 카드 삭제
    async deleteCard(cardId) {
        return this.delete(`/cards/${cardId}`);
    },
    
    // N/B 값 계산
    async calculateNB(chartData) {
        return this.post('/nb/calculate', { chart_data: chartData });
    },
    
    // N/B 값 저장
    async saveNB(data) {
        return this.post('/nb/save', data);
    },
    
    // N/B 값 조회
    async getNB(nbValue) {
        return this.get(`/nb/${nbValue}`);
    },
    
    // AI 분석
    async analyzeChart(chartData, card = null) {
        return this.post('/ai/analyze-chart', { 
            chart_data: chartData,
            card: card  // 카드 데이터 전달 (ML 모델 분석용)
        });
    },
    
    // 강화학습 AI 분석
    async analyzeRL(cardId) {
        // 실시간 점수 차트 히스토리 가져오기
        const scoreKey = `realtime_scores_${cardId}`;
        let realtimeScores = [];
        try {
            const scoresStr = localStorage.getItem(scoreKey);
            if (scoresStr) {
                realtimeScores = JSON.parse(scoresStr);
            }
        } catch (e) {
            console.warn(`점수 히스토리 파싱 실패: ${e}`);
        }
        
        return this.post('/ai/analyze-rl', { 
            card_id: cardId,
            realtime_scores: realtimeScores  // 실시간 점수 차트 히스토리 전송
        });
    },
    
    // 강화학습 AI 행동 실행
    async executeRLAction(cardId, action) {
        return this.post('/ai/execute-rl-action', { card_id: cardId, action: action });
    },
    
    // 설정 가져오기
    async getSettings() {
        return this.get('/settings');
    },
    
    // 설정 저장
    async saveSettings(settings) {
        return this.post('/settings', settings);
    }
};


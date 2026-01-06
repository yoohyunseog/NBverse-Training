// 설정 관리
const Config = {
    API_BASE_URL: 'http://localhost:5000/api',
    UPDATE_INTERVAL: 25000, // 25초
    CHART_UPDATE_INTERVAL: 5000, // 5초
    CARD_UPDATE_INTERVAL: 30000, // 30초
    
    // NBVerse 설정
    NB_DECIMAL_PLACES: 10,
    NB_DEFAULT_VALUE: 5.5,
    
    // 카드 설정
    MAX_PRODUCTION_CARDS: 4,
    MAX_HISTORY_PER_CARD: 100,
    
    // 차트 설정
    CHART_POINTS: 200,
    CHART_ANIMATION_INTERVAL: 30000, // 30초 (타임프레임 순회 주기)
    
    // AI 설정
    AI_UPDATE_INTERVAL: 60000, // 1분
    
    // 저장된 설정 로드
    loadSettings() {
        const saved = localStorage.getItem('trading_settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                Object.assign(this, settings);
            } catch (e) {
                console.error('설정 로드 실패:', e);
            }
        }
    },
    
    // 설정 저장
    saveSettings() {
        const settings = {
            UPDATE_INTERVAL: this.UPDATE_INTERVAL,
            NB_DECIMAL_PLACES: this.NB_DECIMAL_PLACES,
            MAX_PRODUCTION_CARDS: this.MAX_PRODUCTION_CARDS,
            CHART_ANIMATION_INTERVAL: this.CHART_ANIMATION_INTERVAL
        };
        localStorage.setItem('trading_settings', JSON.stringify(settings));
    },
    
    // 설정 가져오기
    get(key, defaultValue) {
        return this[key] !== undefined ? this[key] : defaultValue;
    },
    
    // 설정 설정
    set(key, value) {
        this[key] = value;
        this.saveSettings();
    }
};

// 초기화
Config.loadSettings();


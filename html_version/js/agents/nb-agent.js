/**
 * N/B 에이전트
 * N/B 값 계산, 저장, 조회를 담당하는 에이전트
 * NBVerse 데이터베이스를 사용하여 N/B 값을 관리
 */
class NBAgent {
    constructor() {
        this.decimalPlaces = Config.get('NB_DECIMAL_PLACES', 10);
        this.defaultValue = Config.get('NB_DEFAULT_VALUE', 5.5);
        this.storage = new Map(); // 메모리 캐시
    }
    
    /**
     * 차트 데이터로부터 N/B 값 계산
     * @param {Array<number>} prices - 가격 배열
     * @param {Object} chartData - 차트 데이터 (선택사항)
     * @returns {Promise<Object>} N/B 값 정보
     */
    async calculateNB(prices, chartData = null) {
        try {
            if (!prices || prices.length < 2) {
                return {
                    nb_value: 0.5,
                    nb_max: this.defaultValue,
                    nb_min: this.defaultValue,
                    error: '가격 데이터가 부족합니다'
                };
            }
            
            // NBVerse 데이터베이스를 통해 N/B 값 계산
            const result = await API.calculateNB({
                prices: prices,
                chart_data: chartData,
                decimal_places: this.decimalPlaces
            });
            
            if (result && result.nb_value !== undefined) {
                // N/B 값 저장
                await this.saveNB(result);
                
                return {
                    nb_value: this.formatNB(result.nb_value),
                    nb_max: this.formatNB(result.nb_max || this.defaultValue),
                    nb_min: this.formatNB(result.nb_min || this.defaultValue),
                    bit_max: result.bit_max || this.defaultValue,
                    bit_min: result.bit_min || this.defaultValue
                };
            }
            
            // 기본값 반환
            return {
                nb_value: 0.5,
                nb_max: this.defaultValue,
                nb_min: this.defaultValue
            };
        } catch (error) {
            console.error('N/B 값 계산 실패:', error);
            return {
                nb_value: 0.5,
                nb_max: this.defaultValue,
                nb_min: this.defaultValue,
                error: error.message
            };
        }
    }
    
    /**
     * N/B 값 저장
     * @param {Object} nbData - N/B 값 데이터
     * @returns {Promise<boolean>} 저장 성공 여부
     */
    async saveNB(nbData) {
        try {
            if (!nbData || !nbData.nb_value) {
                return false;
            }
            
            // NBVerse 데이터베이스에 저장
            const result = await API.saveNB({
                nb_value: nbData.nb_value,
                nb_max: nbData.nb_max || nbData.bit_max,
                nb_min: nbData.nb_min || nbData.bit_min,
                metadata: nbData.metadata || {}
            });
            
            // 메모리 캐시에도 저장
            if (result && result.nb_id) {
                this.storage.set(result.nb_id, {
                    ...nbData,
                    nb_id: result.nb_id,
                    timestamp: new Date().toISOString()
                });
            }
            
            return true;
        } catch (error) {
            console.error('N/B 값 저장 실패:', error);
            return false;
        }
    }
    
    /**
     * N/B 값 조회
     * @param {number} nbValue - N/B 값
     * @returns {Promise<Object|null>} N/B 값 정보
     */
    async getNB(nbValue) {
        try {
            // 메모리 캐시에서 먼저 확인
            for (const [id, data] of this.storage.entries()) {
                if (Math.abs(data.nb_value - nbValue) < 0.0001) {
                    return data;
                }
            }
            
            // NBVerse 데이터베이스에서 조회
            const result = await API.getNB(nbValue);
            if (result) {
                // 캐시에 저장
                if (result.nb_id) {
                    this.storage.set(result.nb_id, result);
                }
                return result;
            }
            
            return null;
        } catch (error) {
            console.error('N/B 값 조회 실패:', error);
            return null;
        }
    }
    
    /**
     * N/B 값 포맷팅
     * @param {number} value - N/B 값
     * @returns {number} 포맷팅된 N/B 값
     */
    formatNB(value) {
        if (typeof value !== 'number' || isNaN(value)) {
            return 0.5;
        }
        return parseFloat(value.toFixed(this.decimalPlaces));
    }
    
    /**
     * N/B 값 유효성 검사
     * @param {number} nbValue - N/B 값
     * @returns {boolean} 유효성 여부
     */
    isValidNB(nbValue) {
        return typeof nbValue === 'number' && 
               !isNaN(nbValue) && 
               isFinite(nbValue) &&
               nbValue >= 0 && 
               nbValue <= 1;
    }
    
    /**
     * N/B 값 중복 체크
     * @param {number} nbValue - N/B 값
     * @param {number} threshold - 임계값 (기본 0.0001)
     * @returns {Promise<boolean>} 중복 여부
     */
    async checkDuplicate(nbValue, threshold = 0.0001) {
        try {
            // 메모리 캐시에서 확인
            for (const [id, data] of this.storage.entries()) {
                if (Math.abs(data.nb_value - nbValue) < threshold) {
                    return true;
                }
            }
            
            // NBVerse 데이터베이스에서 확인
            const result = await API.getNB(nbValue);
            if (result) {
                const diff = Math.abs(result.nb_value - nbValue);
                return diff < threshold;
            }
            
            return false;
        } catch (error) {
            console.error('N/B 값 중복 체크 실패:', error);
            return false;
        }
    }
    
    /**
     * 캐시 클리어
     */
    clearCache() {
        this.storage.clear();
    }
}

// 전역 인스턴스
const nbAgent = new NBAgent();


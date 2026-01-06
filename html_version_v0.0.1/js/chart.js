// 차트 유틸리티 함수들
const ChartUtils = {
    /**
     * 가격 배열을 정규화
     */
    normalizePrices(prices) {
        if (!prices || prices.length === 0) return [];
        
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const range = max - min || 1;
        
        return prices.map(p => (p - min) / range);
    },
    
    /**
     * 차트 색상 결정 (상승/하락)
     */
    getPriceColor(current, previous) {
        if (current > previous) {
            return '#0ecb81'; // 상승 (녹색)
        } else if (current < previous) {
            return '#ff6b6b'; // 하락 (빨간색)
        }
        return '#00d1ff'; // 동일 (청색)
    },
    
    /**
     * 이동 평균 계산
     */
    calculateMovingAverage(prices, period) {
        if (!prices || prices.length < period) {
            return [];
        }
        
        const result = [];
        for (let i = period - 1; i < prices.length; i++) {
            const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
        
        return result;
    }
};


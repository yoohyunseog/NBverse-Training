/**
 * 카드용 차트 유틸리티
 * 생산 시점 차트, 실시간 가격 차트, 점수 차트를 그리는 함수들
 */

const CardChart = {
    /**
     * 생산 시점 가격 차트 그리기
     * @param {string} canvasId - Canvas ID
     * @param {Array<number>} prices - 가격 배열
     */
    drawProductionChart(canvasId, prices) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !prices || prices.length < 2) {
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 150;
        
        // 고해상도 지원
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        
        // 배경
        ctx.fillStyle = '#0a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        // 패딩
        const padding = 10;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        // 가격 범위
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || 1;
        
        // 그리드 라인
        ctx.strokeStyle = '#1a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // 가격 라인
        ctx.strokeStyle = '#00d1ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < prices.length; i++) {
            const x = padding + (chartWidth / (prices.length - 1)) * i;
            const normalizedPrice = (prices[i] - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        // 영역 채우기
        ctx.fillStyle = 'rgba(0, 209, 255, 0.1)';
        ctx.lineTo(width - padding, height - padding);
        ctx.lineTo(padding, height - padding);
        ctx.closePath();
        ctx.fill();
        
        // 가격 레이블
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`최고: ${maxPrice.toLocaleString()}`, padding, padding + 10);
        ctx.fillText(`최저: ${minPrice.toLocaleString()}`, padding, padding + 22);
    },
    
    /**
     * 실시간 가격 차트 그리기
     * @param {string} canvasId - Canvas ID
     * @param {Array<number>} prices - 실시간 가격 배열
     * @param {number} productionPrice - 생산 시점 가격
     */
    drawRealtimePriceChart(canvasId, prices, productionPrice = 0) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 120;
        
        // 고해상도 지원
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        
        // 배경
        ctx.fillStyle = '#0a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        // 패딩
        const padding = 10;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        // 가격 데이터 준비 (생산 가격 포함)
        const allPrices = productionPrice > 0 ? [productionPrice, ...prices] : prices;
        
        if (allPrices.length < 2) {
            // 데이터가 부족하면 생산 가격만 표시
            if (productionPrice > 0) {
                ctx.fillStyle = '#00d1ff';
                ctx.font = '12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${productionPrice.toLocaleString()} KRW`, width / 2, height / 2);
            }
            return;
        }
        
        // 가격 범위
        const minPrice = Math.min(...allPrices);
        const maxPrice = Math.max(...allPrices);
        const priceRange = maxPrice - minPrice || 1;
        
        // 그리드 라인
        ctx.strokeStyle = '#1a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // 생산 가격 기준선
        if (productionPrice > 0) {
            const normalizedPrice = (productionPrice - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            ctx.strokeStyle = '#888888';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // 가격 라인
        ctx.strokeStyle = '#00d1ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < allPrices.length; i++) {
            const x = padding + (chartWidth / (allPrices.length - 1)) * i;
            const normalizedPrice = (allPrices[i] - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        // 현재 가격 표시
        if (prices.length > 0) {
            const currentPrice = prices[prices.length - 1];
            const normalizedPrice = (currentPrice - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            const x = width - padding;
            
            // 점 표시
            ctx.fillStyle = '#00d1ff';
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // 가격 텍스트
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${currentPrice.toLocaleString()}`, x - 5, y - 5);
        }
    },
    
    /**
     * 점수 차트 그리기 (실시간 업데이트)
     * @param {string} canvasId - Canvas ID
     * @param {Array<number>} scores - 점수 배열 (0-100)
     */
    drawScoreChart(canvasId, scores) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 120;
        
        // 고해상도 지원
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        
        // 배경
        ctx.fillStyle = '#0a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        // 패딩
        const padding = 10;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        if (!scores || scores.length === 0) {
            // 데이터가 없으면 기본 메시지 표시
            ctx.fillStyle = '#888888';
            ctx.font = '12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('점수 데이터 없음', width / 2, height / 2);
            return;
        }
        
        // 점수 범위 (0-100으로 고정)
        const minScore = 0;
        const maxScore = 100;
        const scoreRange = maxScore - minScore || 1;
        
        // 50점 기준선 그리기 (중간선)
        const midY = padding + chartHeight - ((50 - minScore) / scoreRange) * chartHeight;
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(padding, midY);
        ctx.lineTo(width - padding, midY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 그리드 라인 (0, 25, 50, 75, 100)
        ctx.strokeStyle = '#1a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // 점수 영역 채우기 (그라데이션)
        if (scores.length >= 2) {
            const gradient = ctx.createLinearGradient(0, padding, 0, height - padding);
            gradient.addColorStop(0, 'rgba(157, 78, 221, 0.3)'); // 상단 (높은 점수)
            gradient.addColorStop(0.5, 'rgba(0, 209, 255, 0.2)'); // 중간
            gradient.addColorStop(1, 'rgba(255, 107, 107, 0.2)'); // 하단 (낮은 점수)
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.moveTo(padding, height - padding);
            
            for (let i = 0; i < scores.length; i++) {
                const x = padding + (chartWidth / (scores.length - 1)) * i;
                const normalizedScore = (scores[i] - minScore) / scoreRange;
                const y = padding + chartHeight - (normalizedScore * chartHeight);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            
            ctx.lineTo(width - padding, height - padding);
            ctx.closePath();
            ctx.fill();
        }
        
        // 점수 라인 그리기
        if (scores.length >= 2) {
            ctx.strokeStyle = '#9d4edd';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            
            for (let i = 0; i < scores.length; i++) {
                const x = padding + (chartWidth / (scores.length - 1)) * i;
                const normalizedScore = (scores[i] - minScore) / scoreRange;
                const y = padding + chartHeight - (normalizedScore * chartHeight);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        } else if (scores.length === 1) {
            // 데이터가 1개일 때는 점만 표시
            const x = width / 2;
            const normalizedScore = (scores[0] - minScore) / scoreRange;
            const y = padding + chartHeight - (normalizedScore * chartHeight);
            
            ctx.fillStyle = this.getScoreColor(scores[0]);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // 현재 점수 표시
        if (scores.length > 0) {
            const currentScore = scores[scores.length - 1];
            const normalizedScore = (currentScore - minScore) / scoreRange;
            const y = padding + chartHeight - (normalizedScore * chartHeight);
            const x = width - padding;
            
            // 점 표시
            ctx.fillStyle = this.getScoreColor(currentScore);
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // 점수 텍스트 표시
            ctx.fillStyle = this.getScoreColor(currentScore);
            ctx.font = '11px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${currentScore.toFixed(1)}`, x - 8, y);
        }
        
        // Y축 레이블 (0, 50, 100)
        ctx.fillStyle = '#888888';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText('100', padding + 5, padding + 3);
        ctx.textBaseline = 'middle';
        ctx.fillText('50', padding + 5, midY);
        ctx.textBaseline = 'bottom';
        ctx.fillText('0', padding + 5, height - padding - 3);
    },
    
    /**
     * 점수에 따른 색상 반환
     * @param {number} score - 점수
     * @returns {string} 색상 코드
     */
    getScoreColor(score) {
        if (score >= 200) return '#0ecb81'; // 녹색 (S 등급 이상)
        if (score >= 140) return '#9d4edd'; // 보라색 (B 등급)
        if (score >= 100) return '#00d1ff'; // 청색 (C 등급)
        if (score >= 80) return '#ffa500'; // 주황색 (D 등급)
        return '#ff6b6b'; // 빨간색 (E, F 등급)
    },
    
    /**
     * 손실률 차트 그리기 (매도 시점)
     * @param {string} canvasId - Canvas ID
     * @param {Array<number>} prices - 가격 배열 (매도 시점 포함)
     */
    drawPnlChart(canvasId, prices) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !prices || prices.length < 2) {
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 120;
        
        // 고해상도 지원
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        
        // 배경
        ctx.fillStyle = '#0a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        // 패딩
        const padding = 10;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        // 가격 범위
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || 1;
        
        // 그리드 라인
        ctx.strokeStyle = '#1a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // 가격 라인 (빨간색 - 매도 시점)
        ctx.strokeStyle = '#f6465d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < prices.length; i++) {
            const x = padding + (chartWidth / (prices.length - 1)) * i;
            const normalizedPrice = (prices[i] - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        // 매도 시점 표시 (마지막 가격)
        if (prices.length > 0) {
            const sellPrice = prices[prices.length - 1];
            const normalizedPrice = (sellPrice - minPrice) / priceRange;
            const y = padding + chartHeight - (normalizedPrice * chartHeight);
            const x = width - padding;
            
            // 점 표시
            ctx.fillStyle = '#f6465d';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // 가격 텍스트
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`매도: ${sellPrice.toLocaleString()}`, x - 5, y - 10);
        }
    },
    
    /**
     * 실시간 손실률 차트 그리기 (손익률 %)
     * @param {string} canvasId - Canvas ID
     * @param {Array<number>} pnlPercentages - 손익률 배열 (%)
     */
    drawPnlPercentChart(canvasId, pnlPercentages) {
        const canvas = document.getElementById(canvasId);
        if (!canvas || !pnlPercentages || pnlPercentages.length < 1) {
            return;
        }
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 120;
        
        // 고해상도 지원
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        
        // 배경
        ctx.fillStyle = '#0a1a1a';
        ctx.fillRect(0, 0, width, height);
        
        // 패딩
        const padding = 10;
        const chartWidth = width - padding * 2;
        const chartHeight = height - padding * 2;
        
        // 손익률 범위 계산
        const minPnl = Math.min(...pnlPercentages, -10); // 최소 -10%
        const maxPnl = Math.max(...pnlPercentages, 10); // 최대 +10%
        const pnlRange = maxPnl - minPnl || 1;
        
        // 0% 기준선 그리기
        const zeroY = padding + chartHeight - ((0 - minPnl) / pnlRange) * chartHeight;
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, zeroY);
        ctx.lineTo(width - padding, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // 그리드 라인
        ctx.strokeStyle = '#1a2a2a';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (chartHeight / 4) * i;
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();
        }
        
        // 손익률 라인 그리기
        if (pnlPercentages.length >= 2) {
            ctx.strokeStyle = '#9d4edd';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            for (let i = 0; i < pnlPercentages.length; i++) {
                const x = padding + (chartWidth / (pnlPercentages.length - 1)) * i;
                const normalizedPnl = (pnlPercentages[i] - minPnl) / pnlRange;
                const y = padding + chartHeight - (normalizedPnl * chartHeight);
                
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }
        
        // 현재 손익률 표시
        if (pnlPercentages.length > 0) {
            const currentPnl = pnlPercentages[pnlPercentages.length - 1];
            const normalizedPnl = (currentPnl - minPnl) / pnlRange;
            const y = padding + chartHeight - (normalizedPnl * chartHeight);
            const x = width - padding;
            
            // 색상 결정 (수익: 녹색, 손실: 빨간색)
            const color = currentPnl >= 0 ? '#0ecb81' : '#f6465d';
            
            // 점 표시
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
            
            // 현재 값 텍스트 표시
            ctx.fillStyle = color;
            ctx.font = '11px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)}%`, x - 8, y);
        }
        
        // Y축 레이블 (손익률 %)
        ctx.fillStyle = '#888888';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`${maxPnl.toFixed(1)}%`, padding + 5, padding + 5);
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${minPnl.toFixed(1)}%`, padding + 5, height - padding - 5);
    }
};


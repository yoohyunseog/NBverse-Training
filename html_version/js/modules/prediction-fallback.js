export function handleCard1AIPredictionFailure(error) {
  const message = error && error.message ? error.message : error;
  console.warn('⚠️ 카드 1 AI 예측 실패, 기본 예측 사용:', message);
}

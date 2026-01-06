/**
 * AI 예측 모듈
 * - ML 모델 예측
 * - 기본 통계 예측
 * - AI 상태 관리
 */

import { CONFIG, STATE } from './config.js';
import { predictWithAI, checkModelStatus, retrainModel } from './nbverse-client.js';
import { saveAIStatus, loadAIStatus } from './storage-manager.js';

/**
 * AI 상태
 */
const aiStatus = {
  level: 1,
  experience: 0,
  totalTrainingCount: 0,
  lastUpdated: null
};

/**
 * AI 상태 초기화
 */
export function initAIStatus() {
  const saved = loadAIStatus();
  if (saved) {
    Object.assign(aiStatus, saved);
    console.log('✅ AI 상태 복원:', aiStatus);
  }
}

/**
 * AI 상태 업데이트
 */
export function updateAIStatus(result) {
  if (!result || !result.training_data_count) return;
  
  const newExp = result.training_data_count;
  const expGain = newExp - aiStatus.experience;
  
  aiStatus.experience = newExp;
  aiStatus.totalTrainingCount = newExp;
  aiStatus.level = calculateLevel(newExp);
  aiStatus.lastUpdated = Date.now();
  
  console.log('✅ AI 상태 업데이트:', {
    level: aiStatus.level,
    experience: aiStatus.experience,
    totalTrainingCount: aiStatus.totalTrainingCount,
    segment: getSegment(aiStatus.experience),
    expGain: expGain
  });
  
  saveAIStatus(aiStatus);
  
  // UI 업데이트 (외부에서 처리)
  return aiStatus;
}

/**
 * 레벨 계산 (200 EXP당 1레벨)
 */
function calculateLevel(exp) {
  return Math.floor(exp / 200) + 1;
}

/**
 * 경험치 구간 계산
 */
function getSegment(exp) {
  const segment = Math.floor(exp / 200) * 200;
  return `${segment}-${segment + 200}`;
}

/**
 * AI 예측 수행 (ML 모델)
 */
export async function predictWithML(options = {}) {
  const {
    currentPrice,
    allData,
    nbResult = null
    , sendNbOnly = false
  } = options;
  
  try {
    // 학습 시작 알림
    if (!STATE.globalModelTrained) {
      console.log('🔄 모델이 없음. 자동 학습 시작...');
    }
    
    // OHLCV 데이터 준비 (재할당 가능하도록 let 사용)
    let ohlcvData = allData.map(item => ({
      time: item.time,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseFloat(item.volume || 0)
    }));

    // AI 예측은 서버가 최소 200개를 요구하므로 항상 200개 보장
    // 데이터 부족 시 API 재요청
    if (ohlcvData.length < 200) {
      console.warn(`AI 예측: 데이터 부족 (${ohlcvData.length}개) → 200개 재요청 중...`);
      try {
        const { getChartData } = await import('./nbverse-client.js');
        const freshData = await getChartData('KRW-BTC', STATE.currentInterval, 200);
        if (freshData && freshData.data && freshData.data.length >= 200) {
          ohlcvData = freshData.data.slice(-200).map(item => ({
            time: item.time,
            open: parseFloat(item.open),
            high: parseFloat(item.high),
            low: parseFloat(item.low),
            close: parseFloat(item.close),
            volume: parseFloat(item.volume || 0)
          }));
          console.log(`✅ AI 예측용 200개 데이터 확보 완료`);
        } else {
          throw new Error(`200개 데이터 확보 실패 (받은 데이터: ${freshData?.data?.length || 0}개)`);
        }
      } catch (err) {
        console.error('AI 예측용 데이터 재요청 실패:', err);
        throw new Error(`AI 예측 불가: 데이터 부족 (${ohlcvData.length}개 < 200개)`);
      }
    }

    // AI 예측 API 호출
    // N/B 학습 우선 모드: nbMax/nbMin + 현재가격 + 차트 데이터를 모두 전송
    let result;
    // Determine whether there is enough data to request training
    const availableTrainingData = ohlcvData.length;
    const canTrain = (!STATE.globalModelTrained && availableTrainingData >= CONFIG.AI.TRAINING_DATA_MIN);

    // 학습에 필요한 핵심 데이터:
    // 1. N/B max, N/B min (가장 중요)
    // 2. 차트 데이터 (학습용)
    // 3. 현재 가격 (컨텍스트)
    // 4. 분봉 정보 (interval) - N/B 데이터와 함께 중요
    const body = {
      market: 'KRW-BTC',
      interval: STATE.currentInterval, // 분봉 정보 (N/B 학습에 중요)
      count: 200, // AI는 항상 200개 전송
      n: 1,
      train: canTrain,
      modelType: getSelectedModelType(),
      ohlcvData: ohlcvData.slice(-200), // 학습용 차트 데이터 항상 포함
      currentPrice: currentPrice // 현재 가격 컨텍스트
    };

    // N/B 값이 있으면 우선 전송 (가장 중요한 학습 데이터 + 분봉)
    if (nbResult && nbResult.nbMax !== undefined && nbResult.nbMin !== undefined) {
      body.nbMax = nbResult.nbMax;
      body.nbMin = nbResult.nbMin;
      body.nbValue = nbResult.nbValue; // N/B 값도 전송
      body.nbInterval = STATE.currentInterval; // N/B가 계산된 분봉 정보
      console.log(`📊 AI 학습 데이터: 분봉=${STATE.currentInterval}, N/B Max=${nbResult.nbMax.toFixed(6)}, Min=${nbResult.nbMin.toFixed(6)}, 현재가=${currentPrice.toLocaleString()}원, 차트=${ohlcvData.length}개`);
    } else {
      console.warn('⚠️ N/B 데이터 없이 AI 예측 요청 (정확도 저하 가능)');
    }

    result = await predictWithAI(body);
    
    // 모델 학습 완료 시 상태 업데이트
    if (result.model_trained) {
      STATE.globalModelTrained = true;
      if (result.training_data_count) {
        updateAIStatus(result);
      }
    }
    
    // 예측 결과 추출 (여러 서버 포맷 지원)
    let predictedPrice = null;
    if (result.predicted_prices && result.predicted_prices.length > 0) {
      predictedPrice = parseFloat(result.predicted_prices[0]);
    } else if (result.predictions && Array.isArray(result.predictions) && result.predictions.length > 0 && (result.predictions[0].price !== undefined)) {
      predictedPrice = parseFloat(result.predictions[0].price);
    } else if (result.prediction !== undefined && result.prediction !== null) {
      predictedPrice = parseFloat(result.prediction);
    }

    if (predictedPrice !== null && !Number.isNaN(predictedPrice)) {
      const predictedChangeRate = ((predictedPrice - currentPrice) / currentPrice) * 100;
      
      // 신뢰도 계산
      let confidence = 0.7;
      if (result.verification_probability) {
        confidence = result.verification_probability / 100;
      } else if (result.train_r2 !== undefined) {
        confidence = Math.max(0.5, Math.min(0.95, result.train_r2));
      } else if (result.train_r2 === undefined && result.val_r2 !== undefined) {
        confidence = Math.max(0.5, Math.min(0.95, result.val_r2));
      }
      
      // Zone 결정
      const predictedZone = determineZone(nbResult ? nbResult.nbValue : null, null);
      
      return {
        predictedPrice,
        predictedChangeRate,
        confidence,
        nbValue: nbResult ? nbResult.nbValue : null,
        nbMax: nbResult ? nbResult.nbMax : null,
        nbMin: nbResult ? nbResult.nbMin : null,
        predictedZone,
        isAIPrediction: true,
        modelType: result.model_type || result.modelType || getSelectedModelType(),
        trainR2: result.train_r2 || result.trainR2 || null,
        valR2: result.val_r2 || result.valR2 || null,
        predictedLossRate: result.predicted_loss_rate !== undefined ? result.predicted_loss_rate : null
      };
    }
    
    console.warn('예측 결과 없음 (ML)');
    return null;
    
  } catch (error) {
    console.warn('ML 예측 실패:', error);
    return null;
  }
}

/**
 * 기본 통계 예측 (Fallback)
 */
export function predictBasic(options = {}) {
  const {
    currentPrice,
    emaFast,
    emaSlow,
    allData,
    nbResult = null
  } = options;
  
  try {
    // 간단한 추세 기반 예측
    const recentData = allData.slice(-10);
    const priceChanges = recentData.map((item, idx) => {
      if (idx === 0) return 0;
      return item.close - recentData[idx - 1].close;
    });
    
    const avgChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const predictedPrice = currentPrice + avgChange;
    const predictedChangeRate = ((predictedPrice - currentPrice) / currentPrice) * 100;
    
    // EMA 크로스 확인
    const emaCross = emaFast > emaSlow ? 'golden' : 'death';
    const confidence = 0.6; // 기본 예측은 낮은 신뢰도
    
    // Zone 결정
    const predictedZone = determineZone(nbResult ? nbResult.nbValue : null, emaCross);
    
    return {
      predictedPrice,
      predictedChangeRate,
      confidence,
      nbValue: nbResult ? nbResult.nbValue : null,
      nbMax: nbResult ? nbResult.nbMax : null,
      nbMin: nbResult ? nbResult.nbMin : null,
      predictedZone,
      isAIPrediction: false,
      modelType: 'Basic',
      trainR2: null,
      valR2: null
    };
    
  } catch (error) {
    console.error('기본 예측 실패:', error);
    throw error;
  }
}

/**
 * Zone 결정 (BLUE/ORANGE)
 */
function determineZone(nbValue, emaCross) {
  if (nbValue !== null && nbValue !== undefined) {
    // N/B 값 기반
    if (nbValue < 0.15) return 'BLUE';
    if (nbValue > 0.20) return 'ORANGE';
    return 'NEUTRAL';
  }
  
  if (emaCross === 'golden') return 'BLUE';
  if (emaCross === 'death') return 'ORANGE';
  
  return 'NEUTRAL';
}

/**
 * 선택된 모델 타입 가져오기
 */
function getSelectedModelType() {
  const select = document.getElementById('aiModelTypeSelect');
  return select ? select.value : CONFIG.AI.DEFAULT_MODEL;
}

/**
 * 모델 상태 확인
 */
export async function checkModel(interval, modelType) {
  try {
    const result = await checkModelStatus(interval, modelType);
    
    if (result.removed) {
      STATE.globalModelTrained = false;
      return { exists: false, removed: true };
    }
    
    if (result.success && result.model_exists) {
      STATE.globalModelTrained = true;
      return { exists: true, info: result };
    }
    
    STATE.globalModelTrained = false;
    return { exists: false };
    
  } catch (error) {
    console.warn('모델 상태 확인 실패:', error);
    return { exists: false, error: true };
  }
}

/**
 * 모델 재학습
 */
export async function retrainModelManually(allData) {
  try {
    STATE.isTrainingInProgress = true;
    
    const ohlcvData = allData.map(item => ({
      time: item.time,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: parseFloat(item.volume || 0)
    }));
    
    const result = await retrainModel({
      market: 'KRW-BTC',
      interval: STATE.currentInterval,
      count: Math.min(allData.length, 200),
      modelType: getSelectedModelType(),
      ohlcvData: ohlcvData.slice(-200)
    });
    
    if (result.success) {
      STATE.globalModelTrained = true;
      if (result.training_data_count) {
        updateAIStatus(result);
      }
      console.log('✅ 모델 재학습 완료:', result);
      return result;
    }
    
    throw new Error(result.error || '재학습 실패');
    
  } finally {
    STATE.isTrainingInProgress = false;
  }
}

/**
 * AI 상태 내보내기
 */
export function getAIStatus() {
  return { ...aiStatus };
}

// ---- UI/상태 보조 유틸 (차트 스크립트에서 사용) ----

/**
 * 학습 레벨 계산 (데이터 수/수익 기반)
 */
export function calculateTrainingLevel(dataCount, totalProfit = 0) {
  if (!dataCount || dataCount < 10) {
    if (totalProfit > 0) {
      const masterLevel = Math.floor(totalProfit / 5000);
      return 100 + masterLevel;
    }
    return 1;
  }

  const baseLevel = Math.floor(dataCount / 10) + 1;
  if (baseLevel <= 100) return baseLevel;

  const masterLevel = Math.floor(totalProfit / 5000);
  return 100 + masterLevel;
}

/**
 * 세그먼트 계산 (200개 단위)
 */
export function calculateTrainingSegment(dataCount) {
  if (!dataCount || dataCount < 1) return '0-200';
  const segmentIndex = Math.floor(dataCount / 200);
  const start = segmentIndex * 200;
  const end = (segmentIndex + 1) * 200;
  return `${start}-${end}`;
}

/**
 * 경험치 계산 (10~200 범위)
 */
export function calculateExperience(dataCount) {
  return Math.min(200, Math.max(10, dataCount || 0));
}

/**
 * 로컬 aiStatus 업데이트 헬퍼 (차트 스크립트에서 공유 상태 전달)
 */
export function updateAIStatusLocal(aiState, trainingResult) {
  if (!trainingResult || !trainingResult.success || !aiState) return aiState;

  const expGain = calculateExperience(trainingResult.training_data_count || 0);
  aiState.experience += expGain;
  aiState.totalTrainingCount += trainingResult.training_data_count || 0;
  aiState.level = calculateTrainingLevel(aiState.totalTrainingCount, aiState.totalProfit || 0);
  aiState.segment = calculateTrainingSegment(aiState.totalTrainingCount);
  aiState.lastTrainingTime = new Date().toISOString();
  aiState.modelType = trainingResult.model_type || 'RandomForest';
  aiState.trainR2 = trainingResult.train_r2 || 0;
  aiState.valR2 = trainingResult.val_r2 || 0;

  return aiState;
}

/**
 * AI 학습 상태 패널 업데이트
 */
export function updateAILearningStatusDisplayUI(aiState) {
  if (!aiState) return;

  const level = aiState.level || 1;
  const experienceEl = document.getElementById('aiExperience');
  const levelEl = document.getElementById('aiLevel');
  const segmentEl = document.getElementById('aiSegment');
  const modelTypeEl = document.getElementById('aiModelType');
  const trainingDataCountEl = document.getElementById('aiTrainingDataCount');
  const trainingAccuracyEl = document.getElementById('aiTrainingAccuracy');
  const lastTrainingTimeEl = document.getElementById('aiLastTrainingTime');

  if (levelEl) {
    levelEl.textContent = `LV ${level}`;
    levelEl.style.color = level >= 10 ? '#0ecb81' : level >= 5 ? '#ffc107' : '#9aa0a6';
  }

  if (experienceEl) {
    experienceEl.textContent = `EXP ${aiState.experience?.toLocaleString?.() || 0}`;
    experienceEl.style.color = '#0ecb81';
  }

  if (segmentEl) {
    segmentEl.textContent = aiState.segment || '0-200';
    segmentEl.style.color = '#9aa0a6';
  }

  if (modelTypeEl) {
    modelTypeEl.textContent = aiState.modelType || '-';
    modelTypeEl.style.color = '#9aa0a6';
  }

  if (trainingDataCountEl) {
    trainingDataCountEl.textContent = `${aiState.totalTrainingCount?.toLocaleString?.() || 0} 개`;
    trainingDataCountEl.style.color = '#9aa0a6';
  }

  if (trainingAccuracyEl) {
    if (aiState.trainR2 > 0) {
      const r2 = (aiState.trainR2 * 100).toFixed(2);
      trainingAccuracyEl.textContent = `${r2}%`;
      trainingAccuracyEl.style.color = aiState.trainR2 >= 0.7 ? '#0ecb81' : aiState.trainR2 >= 0.5 ? '#ffc107' : '#f6465d';
    } else {
      trainingAccuracyEl.textContent = '-';
      trainingAccuracyEl.style.color = '#9aa0a6';
    }
  }

  if (lastTrainingTimeEl && aiState.lastTrainingTime) {
    const lastTime = new Date(aiState.lastTrainingTime);
    const now = new Date();
    const diffMs = now - lastTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let timeText = '';
    if (diffDays > 0) timeText = `${diffDays}일 전`;
    else if (diffHours > 0) timeText = `${diffHours}시간 전`;
    else if (diffMins > 0) timeText = `${diffMins}분 전`;
    else timeText = '방금 전';

    lastTrainingTimeEl.textContent = timeText;
    lastTrainingTimeEl.style.color = '#9aa0a6';
  } else if (lastTrainingTimeEl) {
    lastTrainingTimeEl.textContent = '-';
    lastTrainingTimeEl.style.color = '#9aa0a6';
  }
}

/**
 * AI 예측 상태 패널 업데이트
 */
export function updateAIPredictionStatusUI(status, data = null, aiState = null, helpers = {}) {
  const { calculateTrainingLevelFn = calculateTrainingLevel, calculateTrainingSegmentFn = calculateTrainingSegment } = helpers;

  if (data && typeof helpers.onAfterDataUpdate === 'function') {
    setTimeout(() => helpers.onAfterDataUpdate(aiState), 50);
  }

  const statusEl = document.getElementById('aiPredictionStatus');
  const modelStatusEl = document.getElementById('aiModelStatus');
  const modelTypeEl = document.getElementById('aiModelType');
  const trainingDataCountEl = document.getElementById('aiTrainingDataCount');
  const trainingLevelEl = document.getElementById('aiTrainingLevel');
  const trainingSegmentEl = document.getElementById('aiTrainingSegment');
  const trainingAccuracyEl = document.getElementById('aiTrainingAccuracy');
  const validationAccuracyEl = document.getElementById('aiValidationAccuracy');
  const trainingMSEEl = document.getElementById('aiTrainingMSE');
  const validationMSEEl = document.getElementById('aiValidationMSE');
  const trainingMAEEl = document.getElementById('aiTrainingMAE');
  const validationMAEEl = document.getElementById('aiValidationMAE');
  const trainingTimeEl = document.getElementById('aiTrainingTime');
  const predictionAccuracyEl = document.getElementById('aiPredictionAccuracy');
  const verifiedCountEl = document.getElementById('aiVerifiedCount');
  const successCountEl = document.getElementById('aiSuccessCount');
  const predictionCountEl = document.getElementById('aiPredictionCount');
  const currentPriceEl = document.getElementById('aiCurrentPrice');
  const nextPredictedPriceEl = document.getElementById('aiNextPredictedPrice');
  const predictedChangeEl = document.getElementById('aiPredictedChange');
  const lastUpdateEl = document.getElementById('aiLastUpdate');
  const priceDirectionEl = document.getElementById('aiPriceDirection');
  const currentNBValueEl = document.getElementById('aiCurrentNBValue');
  const predictedNBValueEl = document.getElementById('aiPredictedNBValue');
  const nbDirectionEl = document.getElementById('aiNBDirection');
  const upVerificationProbEl = document.getElementById('aiUpVerificationProb');
  const downVerificationProbEl = document.getElementById('aiDownVerificationProb');
  const verificationProbEl = document.getElementById('aiVerificationProb');

  if (statusEl) {
    const map = {
      loading: { text: '예측 중...', color: '#ffc107' },
      success: { text: '예측 완료', color: '#0ecb81' },
      error: { text: '예측 실패', color: '#f6465d' },
      disabled: { text: 'AI 학습 기능 제거됨', color: '#9aa0a6' },
      no_model: { text: '모델 없음', color: '#9aa0a6' }
    };
    const mapped = map[status] || { text: '-', color: '#9aa0a6' };
    statusEl.textContent = mapped.text;
    statusEl.style.color = mapped.color;
  }

  if (data) {
    if (modelStatusEl) {
      modelStatusEl.textContent = data.model_trained ? '학습됨' : '미학습';
      modelStatusEl.style.color = data.model_trained ? '#0ecb81' : '#ffc107';
    }
    if (modelTypeEl) {
      modelTypeEl.textContent = data.model_type || '-';
    }
    if (trainingDataCountEl && data.training_data_count !== undefined) {
      trainingDataCountEl.textContent = data.training_data_count.toLocaleString() + ' 개';
    }
    if (trainingLevelEl) {
      const totalProfit = data.ai_total_profit !== undefined ? data.ai_total_profit : (aiState?.totalProfit || 0);
      const level = data.ai_level || (data.training_data_count !== undefined ? calculateTrainingLevelFn(data.training_data_count, totalProfit) : aiState?.level || 1);
      let levelText = '';
      let levelColor = '#9aa0a6';
      if (level <= 100) {
        levelText = `LV ${level}`;
        levelColor = level >= 10 ? '#0ecb81' : level >= 5 ? '#ffc107' : '#9aa0a6';
      } else {
        const masterLevel = level - 100;
        levelText = `LV 100+${masterLevel} (마스터)`;
        levelColor = '#9c27b0';
      }
      trainingLevelEl.textContent = levelText;
      trainingLevelEl.style.color = levelColor;
    }
    const experienceEl = document.getElementById('aiExperience');
    if (experienceEl) {
      const exp = data.ai_experience !== undefined ? data.ai_experience : aiState?.experience;
      experienceEl.textContent = `EXP ${exp?.toLocaleString?.() || 0}`;
      experienceEl.style.color = '#0ecb81';
    }
    if (trainingSegmentEl) {
      const segment = data.training_segment || (data.training_data_count !== undefined ? calculateTrainingSegmentFn(data.training_data_count) : aiState?.segment);
      trainingSegmentEl.textContent = segment;
      trainingSegmentEl.style.color = '#9aa0a6';
    }
    if (trainingAccuracyEl && data.train_r2 !== undefined) {
      const r2 = (data.train_r2 * 100).toFixed(2);
      trainingAccuracyEl.textContent = r2 + '%';
      trainingAccuracyEl.style.color = data.train_r2 >= 0.7 ? '#0ecb81' : data.train_r2 >= 0.5 ? '#ffc107' : '#f6465d';
    }
    if (validationAccuracyEl && data.val_r2 !== undefined) {
      const r2 = (data.val_r2 * 100).toFixed(2);
      validationAccuracyEl.textContent = r2 + '%';
      validationAccuracyEl.style.color = data.val_r2 >= 0.7 ? '#0ecb81' : data.val_r2 >= 0.5 ? '#ffc107' : '#f6465d';
    }
    if (trainingMSEEl && data.train_mse !== undefined) {
      trainingMSEEl.textContent = data.train_mse.toFixed(2);
      trainingMSEEl.style.color = '#9aa0a6';
    }
    if (validationMSEEl && data.val_mse !== undefined) {
      validationMSEEl.textContent = data.val_mse.toFixed(2);
      validationMSEEl.style.color = '#9aa0a6';
    }
    if (trainingMAEEl && data.train_mae !== undefined) {
      trainingMAEEl.textContent = data.train_mae.toFixed(2);
      trainingMAEEl.style.color = '#9aa0a6';
    }
    if (validationMAEEl && data.val_mae !== undefined) {
      validationMAEEl.textContent = data.val_mae.toFixed(2);
      validationMAEEl.style.color = '#9aa0a6';
    }
    if (trainingTimeEl && data.training_time !== undefined) {
      trainingTimeEl.textContent = data.training_time.toFixed(2) + ' 초';
      trainingTimeEl.style.color = '#9aa0a6';
    }
    if (predictionAccuracyEl && data.verification_probability !== undefined) {
      predictionAccuracyEl.textContent = data.verification_probability.toFixed(1) + '%';
      predictionAccuracyEl.style.color = data.verification_probability >= 70 ? '#0ecb81' : data.verification_probability >= 50 ? '#ffc107' : '#f6465d';
    }
    if (verifiedCountEl && data.verified_count !== undefined) {
      verifiedCountEl.textContent = data.verified_count + ' 개';
    }
    if (successCountEl && data.success_count !== undefined) {
      successCountEl.textContent = data.success_count + ' 개';
    }
    if (predictionCountEl) {
      predictionCountEl.textContent = data.prediction_count || '-';
    }
    if (currentPriceEl && data.current_price) {
      currentPriceEl.textContent = data.current_price.toLocaleString() + ' 원';
    }
    if (nextPredictedPriceEl && data.next_predicted_price) {
      nextPredictedPriceEl.textContent = data.next_predicted_price.toLocaleString() + ' 원';
    }
    if (predictedChangeEl && data.predicted_change !== undefined) {
      const change = data.predicted_change;
      predictedChangeEl.textContent = (change >= 0 ? '+' : '') + change.toFixed(2) + '%';
      predictedChangeEl.style.color = change >= 0 ? '#0ecb81' : '#f6465d';
    }
    if (priceDirectionEl && data.price_direction) {
      const direction = data.price_direction;
      priceDirectionEl.textContent = direction;
      priceDirectionEl.style.color = direction === '상승' ? '#0ecb81' : direction === '하락' ? '#f6465d' : '#9aa0a6';
    }
    if (currentNBValueEl && data.current_nb_value !== undefined) {
      currentNBValueEl.textContent = data.current_nb_value.toFixed(4);
      currentNBValueEl.style.color = '#00d1ff';
    }
    if (predictedNBValueEl && data.predicted_nb_value !== undefined) {
      predictedNBValueEl.textContent = data.predicted_nb_value.toFixed(4);
      const nbChange = data.predicted_nb_value - (data.current_nb_value || 0.5);
      predictedNBValueEl.style.color = nbChange > 0 ? '#0ecb81' : nbChange < 0 ? '#f6465d' : '#9aa0a6';
    }
    if (nbDirectionEl && data.nb_direction) {
      const direction = data.nb_direction;
      nbDirectionEl.textContent = direction;
      nbDirectionEl.style.color = direction === '상승' ? '#0ecb81' : direction === '하락' ? '#f6465d' : '#9aa0a6';
    }
    if (upVerificationProbEl && data.up_verification_prob !== undefined) {
      upVerificationProbEl.textContent = data.up_verification_prob.toFixed(1) + '%';
      upVerificationProbEl.style.color = data.up_verification_prob >= 70 ? '#0ecb81' : data.up_verification_prob >= 50 ? '#ffc107' : '#f6465d';
    }
    if (downVerificationProbEl && data.down_verification_prob !== undefined) {
      downVerificationProbEl.textContent = data.down_verification_prob.toFixed(1) + '%';
      downVerificationProbEl.style.color = data.down_verification_prob >= 70 ? '#0ecb81' : data.down_verification_prob >= 50 ? '#ffc107' : '#f6465d';
    }
    if (verificationProbEl && data.verification_probability !== undefined) {
      verificationProbEl.textContent = data.verification_probability.toFixed(1) + '%';
      verificationProbEl.style.color = data.verification_probability >= 70 ? '#0ecb81' : data.verification_probability >= 50 ? '#ffc107' : '#f6465d';
    }
  }

  if (lastUpdateEl) {
    lastUpdateEl.textContent = new Date().toLocaleTimeString('ko-KR');
  }
}

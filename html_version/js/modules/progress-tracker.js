/**
 * 진행 단계 추적 모듈
 * - 차트 데이터 로드 → N/B 계산 → AI 학습 → AI 예측 → 카드 생성 → 검증
 */

export const STAGES = {
  CHART_LOAD: 'chart-load',
  NB_CALC: 'nb-calc',
  AI_TRAIN: 'ai-train',
  AI_PREDICT: 'ai-predict',
  CARD_CREATE: 'card-create',
  VERIFY: 'verify'
};

const STAGE_INFO = {
  [STAGES.CHART_LOAD]: { icon: '📊', text: '차트 데이터 로드', order: 1 },
  [STAGES.NB_CALC]: { icon: '🧮', text: 'N/B 계산', order: 2 },
  [STAGES.AI_TRAIN]: { icon: '🤖', text: 'AI 학습', order: 3 },
  [STAGES.AI_PREDICT]: { icon: '🔮', text: 'AI 예측', order: 4 },
  [STAGES.CARD_CREATE]: { icon: '🎴', text: '카드 생성', order: 5 },
  [STAGES.VERIFY]: { icon: '✅', text: '검증', order: 6 }
};

const STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ERROR: 'error',
  SKIPPED: 'skipped'
};

class ProgressTracker {
  constructor() {
    this.stages = {};
    this.timings = {};
    this.totalStartTime = null;
    this.currentStage = null;
    this.container = null;
    this.progressBar = null;
    this.progressPercent = 0;
    this.reset();
  }

  reset() {
    Object.keys(STAGES).forEach(key => {
      this.stages[STAGES[key]] = STATUS.PENDING;
      this.timings[STAGES[key]] = { start: null, end: null, duration: null };
    });
    this.currentStage = null;
    this.totalStartTime = performance.now();
    this.render();
  }

  init(containerId = 'progressTracker') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn('Progress tracker container not found:', containerId);
      return;
    }
    
    // 상단 프로그레스바 생성
    this.createProgressBar();
    this.render();
  }

  createProgressBar() {
    // 기존 프로그레스바가 있으면 제거
    const existing = document.getElementById('topProgressBar');
    if (existing) existing.remove();

    // 상단 프로그레스바 생성
    const progressBarHTML = `
      <div id="topProgressBar" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #4caf50 0%, #2196f3 50%, #ff9800 100%);
        width: 0%;
        z-index: 10000;
        transition: width 0.3s ease;
        box-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
      "></div>
      <div style="
        position: fixed;
        top: 4px;
        left: 0;
        right: 0;
        height: 16px;
        background: rgba(0, 0, 0, 0.03);
        z-index: 9999;
        font-size: 10px;
        color: #666;
        padding: 2px 8px;
        font-family: monospace;
      " id="progressText"></div>
    `;
    document.body.insertAdjacentHTML('afterbegin', progressBarHTML);
    this.progressBar = document.getElementById('topProgressBar');
  }

  updateProgressBar() {
    if (!this.progressBar) return;

    // 6개 단계 기준으로 진행률 계산
    const completedStages = Object.values(this.stages).filter(s => s === STATUS.COMPLETED).length;
    const totalStages = Object.keys(STAGES).length;
    const baseProgress = (completedStages / totalStages) * 100;

    // 현재 단계가 활성화되면 진행률 추가 (30% 보너스)
    let currentProgress = baseProgress;
    if (this.currentStage) {
      const stageIndex = Object.values(STAGES).indexOf(this.currentStage);
      const nextStageProgress = ((stageIndex + 1) / totalStages) * 100;
      const stageFraction = Math.min(0.3, (performance.now() - this.timings[this.currentStage].start) / 5000);
      currentProgress = baseProgress + (nextStageProgress - baseProgress) * stageFraction;
    }

    this.progressPercent = Math.min(99, Math.max(baseProgress, currentProgress));
    this.progressBar.style.width = `${this.progressPercent}%`;

    // 진행 상태 텍스트 업데이트
    const progressText = document.getElementById('progressText');
    if (progressText) {
      const currentStageInfo = this.currentStage ? STAGE_INFO[this.currentStage] : null;
      const text = currentStageInfo 
        ? `${currentStageInfo.icon} ${currentStageInfo.text}... (${Math.round(this.progressPercent)}%)`
        : `완료 (${Math.round(this.progressPercent)}%)`;
      progressText.textContent = text;
    }
  }

  setStage(stage, status, message = '') {
    if (!STAGES[Object.keys(STAGES).find(k => STAGES[k] === stage)]) {
      console.warn('Unknown stage:', stage);
      return;
    }

    this.stages[stage] = status;
    
    if (status === STATUS.ACTIVE) {
      this.currentStage = stage;
      this.timings[stage].start = performance.now();
    } else if (status === STATUS.COMPLETED || status === STATUS.ERROR) {
      if (this.timings[stage].start) {
        this.timings[stage].end = performance.now();
        this.timings[stage].duration = this.timings[stage].end - this.timings[stage].start;
      }
    }

    this.updateProgressBar();
    this.render(message);
  }

  start(stage, message = '') {
    this.setStage(stage, STATUS.ACTIVE, message);
  }

  complete(stage, message = '') {
    this.setStage(stage, STATUS.COMPLETED, message);
  }

  error(stage, message = '') {
    this.setStage(stage, STATUS.ERROR, message);
  }

  skip(stage, message = '') {
    this.setStage(stage, STATUS.SKIPPED, message);
  }

  render(message = '') {
    if (!this.container) return;

    // 최초 렌더링 시 전체 HTML 생성
    if (!this.container.querySelector('.progress-stages')) {
      this.renderInitial(message);
      return;
    }

    // 이후에는 변경된 부분만 업데이트 (DOM 재사용)
    this.renderUpdate(message);
  }

  renderInitial(message = '') {
    const stageElements = Object.keys(STAGES)
      .map(key => STAGES[key])
      .sort((a, b) => STAGE_INFO[a].order - STAGE_INFO[b].order)
      .map(stageKey => {
        const info = STAGE_INFO[stageKey];
        return `
          <div class="progress-stage stage-pending" data-stage="${stageKey}">
            <div class="stage-icon">${info.icon}</div>
            <div class="stage-content">
              <div class="stage-text">${info.text}</div>
              <div class="stage-info">
                <div class="stage-status">○</div>
                <div class="stage-time"></div>
              </div>
            </div>
          </div>
        `;
      })
      .join('<div class="stage-arrow">→</div>');

    const messageHtml = message ? `<div class="progress-message">${message}</div>` : '<div class="progress-message"></div>';
    const totalTimeHtml = `<div class="progress-total-time">전체 소요 시간: 0ms</div>`;

    this.container.innerHTML = `
      <div class="progress-stages">
        ${stageElements}
      </div>
      ${messageHtml}
      ${totalTimeHtml}
    `;
  }

  renderUpdate(message = '') {
    // 각 stage 요소만 업데이트 (DOM 재사용)
    Object.keys(STAGES).forEach(key => {
      const stageKey = STAGES[key];
      const status = this.stages[stageKey];
      const timing = this.timings[stageKey];
      const isActive = this.currentStage === stageKey;
      const stageEl = this.container.querySelector(`[data-stage="${stageKey}"]`);
      
      if (!stageEl) return;

      // 클래스 업데이트
      stageEl.className = 'progress-stage';
      let statusIcon = '○';
      let timeText = '';

      switch (status) {
        case STATUS.COMPLETED:
          stageEl.classList.add('stage-completed');
          statusIcon = '✓';
          if (timing.duration !== null) {
            timeText = timing.duration < 1000 
              ? `${Math.round(timing.duration)}ms`
              : `${(timing.duration / 1000).toFixed(1)}s`;
          }
          break;
        case STATUS.ACTIVE:
          stageEl.classList.add('stage-active');
          statusIcon = '⟳';
          if (timing.start !== null) {
            const elapsed = performance.now() - timing.start;
            timeText = elapsed < 1000 
              ? `${Math.round(elapsed)}ms`
              : `${(elapsed / 1000).toFixed(1)}s`;
          }
          break;
        case STATUS.ERROR:
          stageEl.classList.add('stage-error');
          statusIcon = '✗';
          if (timing.duration !== null) {
            timeText = timing.duration < 1000 
              ? `${Math.round(timing.duration)}ms`
              : `${(timing.duration / 1000).toFixed(1)}s`;
          }
          break;
        case STATUS.SKIPPED:
          stageEl.classList.add('stage-skipped');
          statusIcon = '−';
          timeText = 'skip';
          break;
        default:
          stageEl.classList.add('stage-pending');
      }

      if (isActive) stageEl.classList.add('current');

      // 상태 아이콘과 시간 업데이트
      const statusEl = stageEl.querySelector('.stage-status');
      const timeEl = stageEl.querySelector('.stage-time');
      if (statusEl) statusEl.textContent = statusIcon;
      if (timeEl) timeEl.textContent = timeText;
    });

    // 메시지 업데이트
    const messageEl = this.container.querySelector('.progress-message');
    if (messageEl && message) {
      messageEl.textContent = message;
      messageEl.style.display = 'block';
    } else if (messageEl) {
      messageEl.style.display = 'none';
    }

    // 전체 시간 업데이트
    const totalElapsed = this.totalStartTime ? performance.now() - this.totalStartTime : 0;
    const totalTimeText = totalElapsed < 1000 
      ? `${Math.round(totalElapsed)}ms`
      : `${(totalElapsed / 1000).toFixed(1)}s`;
    const totalTimeEl = this.container.querySelector('.progress-total-time');
    if (totalTimeEl) {
      totalTimeEl.textContent = `전체 소요 시간: ${totalTimeText}`;
    }
  }

  getStatus(stage) {
    return this.stages[stage];
  }

  isCompleted(stage) {
    return this.stages[stage] === STATUS.COMPLETED;
  }

  isActive(stage) {
    return this.stages[stage] === STATUS.ACTIVE;
  }

  isError(stage) {
    return this.stages[stage] === STATUS.ERROR;
  }

  getTiming(stage) {
    return this.timings[stage];
  }

  getTotalTime() {
    return this.totalStartTime ? performance.now() - this.totalStartTime : 0;
  }

  getAllTimings() {
    const result = {};
    Object.keys(this.timings).forEach(stage => {
      const timing = this.timings[stage];
      if (timing.duration !== null) {
        result[stage] = timing.duration;
      }
    });
    return result;
  }
}

// 싱글톤 인스턴스
const tracker = new ProgressTracker();

export default tracker;

// 편의 함수
export function initProgressTracker(containerId) {
  tracker.init(containerId);
}

export function resetProgress() {
  tracker.reset();
}

export function startStage(stage, message = '') {
  tracker.start(stage, message);
}

export function completeStage(stage, message = '') {
  tracker.complete(stage, message);
}

export function errorStage(stage, message = '') {
  tracker.error(stage, message);
}

export function skipStage(stage, message = '') {
  tracker.skip(stage, message);
}

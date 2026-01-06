# 차트 분석 시스템 모듈화 가이드

## 📁 모듈 구조

```
html_version/
├── chart-analysis.html          # 메인 HTML (간소화됨)
└── js/
    └── modules/
        ├── config.js            # 설정 및 상수
        ├── chart-manager.js     # 차트 생성/업데이트
        ├── nbverse-client.js    # API 호출
        ├── storage-manager.js   # LocalStorage 관리
        ├── ai-prediction.js     # AI/ML 예측
        └── card-system.js       # 카드 생성/검증/렌더링
```

## 🎯 각 모듈 역할

### 1. config.js
- **역할**: 전역 설정, 상수, 유틸리티 함수
- **주요 내용**:
  - `CONFIG`: 타임아웃, 재시도, 차트 설정 등
  - `STATE`: 전역 상태 (currentInterval, allData 등)
  - `STORAGE_KEYS`: LocalStorage 키
  - 포맷팅 함수: `formatPrice`, `formatPercent`, `formatNBValue`

### 2. chart-manager.js
- **역할**: 차트 생성 및 관리
- **주요 함수**:
  - `initMainChart(containerId)`: 메인 차트 초기화
  - `updateMainChart(chartData)`: 차트 데이터 업데이트
  - `createCardChart(containerId, chartData)`: 카드용 미니 차트 생성
  - `addPredictedLine(time, currentPrice, predictedPrice)`: 예측 라인 추가
  - `clearPredictedLine()`: 예측 라인 제거

### 3. nbverse-client.js
- **역할**: NBVerse API 호출 (재시도 로직 포함)
- **주요 함수**:
  - `saveCard(cardType, cardData)`: 카드 저장
  - `queryCards(nbMin, nbMax, limit)`: 카드 조회
  - `getAssetInfo()`: 자산 정보 조회
  - `getCurrentPrice(market)`: 현재 가격 조회
  - `getChartData(market, interval, count)`: 차트 데이터 조회
  - `predictWithAI(options)`: AI 예측 요청
  - `checkModelStatus(interval, modelType)`: 모델 상태 확인
  - `retrainModel(options)`: 모델 재학습

### 4. storage-manager.js
- **역할**: LocalStorage 관리 (디바운싱 포함)
- **주요 함수**:
  - `saveAnalysisData(immediate)`: 분석 데이터 저장
  - `loadAnalysisData()`: 분석 데이터 로드
  - `saveVerifiedCards(cards)`: 검증 완료 카드 저장
  - `loadVerifiedCards()`: 검증 완료 카드 로드
  - `saveAIStatus(status)`: AI 상태 저장
  - `loadAIStatus()`: AI 상태 로드
  - `clearAllData()`: 모든 데이터 삭제
  - `getStorageUsage()`: 저장소 용량 확인

### 5. ai-prediction.js
- **역할**: AI/ML 예측 및 상태 관리
- **주요 함수**:
  - `initAIStatus()`: AI 상태 초기화
  - `updateAIStatus(result)`: AI 상태 업데이트
  - `predictWithML(options)`: ML 모델 예측
  - `predictBasic(options)`: 기본 통계 예측 (Fallback)
  - `checkModel(interval, modelType)`: 모델 상태 확인
  - `retrainModelManually(allData)`: 수동 재학습
  - `getAIStatus()`: AI 상태 조회

### 6. card-system.js
- **역할**: 카드 생성, 검증, 렌더링
- **주요 함수**:
  - `createCard1(prediction, chartData)`: 예측 카드 생성
  - `createCard2(data)`: 현재 상태 카드 생성
  - `verifyCard(previousCard2, currentCard2, prediction)`: 카드 검증
  - `addVerifiedCard(verifiedCard)`: 검증 카드 추가
  - `renderVerifiedCards(containerId)`: 검증 카드 렌더링
  - `saveCardToNBVerse(cardType, cardData)`: 카드 NBVerse 저장
  - `getCachedChartSlice(count)`: 캐시된 차트 슬라이스

## 🔧 사용 방법

### HTML에서 모듈 임포트

```html
<script type="module">
  import { CONFIG, STATE } from './js/modules/config.js';
  import { initMainChart, createCardChart } from './js/modules/chart-manager.js';
  import { saveCard } from './js/modules/nbverse-client.js';
  
  // 사용 예시
  const chart = initMainChart('chartContainer');
  createCardChart('cardChart1', chartData);
  await saveCard('card1', cardData);
</script>
```

### 기존 코드 호환성

메인 HTML에서 전역 객체로 내보내기:

```javascript
window.ChartAnalysis = {
  CONFIG, STATE,
  initMainChart, createCardChart,
  saveCard, predictWithML,
  // ... 모든 모듈 함수
};

// 기존 코드에서 사용
window.ChartAnalysis.createCardChart('chart1', data);
```

## ✅ 모듈화 장점

1. **코드 분리**: 기능별로 파일 분리 (300~500줄)
2. **재사용성**: 다른 페이지에서도 모듈 재사용 가능
3. **유지보수**: 특정 기능 수정 시 해당 모듈만 편집
4. **디버깅**: 오류 발생 시 모듈 단위로 추적
5. **브라우저 캐싱**: 모듈별 캐싱으로 로드 속도 향상
6. **테스트**: 모듈별 독립 테스트 가능

## 🚀 마이그레이션 체크리스트

- [x] 모듈 파일 생성
- [x] config.js: 설정 및 상수
- [x] chart-manager.js: 차트 관리
- [x] nbverse-client.js: API 호출
- [x] storage-manager.js: 저장소 관리
- [x] ai-prediction.js: AI 예측
- [x] card-system.js: 카드 시스템
- [x] 메인 HTML에 모듈 임포트 추가
- [ ] 기존 함수를 모듈 함수로 교체 (점진적)
- [ ] 전체 기능 테스트

## 📝 다음 단계

1. **점진적 마이그레이션**: 기존 함수를 하나씩 모듈 함수로 교체
2. **테스트**: 각 기능이 정상 동작하는지 확인
3. **최적화**: 중복 코드 제거 및 성능 개선
4. **문서화**: 각 모듈의 상세 API 문서 작성

## ⚠️ 주의사항

- **브라우저 지원**: ES6 모듈을 지원하는 최신 브라우저 필요
- **CORS**: 로컬 파일 실행 시 CORS 이슈 발생 가능 → 로컬 서버 사용 권장
- **캐싱**: 개발 중에는 강력 새로고침 (Ctrl+Shift+R) 사용
- **호환성**: 기존 코드와의 호환을 위해 window.ChartAnalysis 사용

## 🔍 트러블슈팅

### 모듈 로드 실패
```
Uncaught SyntaxError: Cannot use import statement outside a module
```
→ `<script type="module">`로 변경

### CORS 오류
```
Access to script at 'file://...' from origin 'null' has been blocked
```
→ 로컬 서버 사용 (예: python -m http.server 8000)

### 함수 undefined
```
Uncaught ReferenceError: createCardChart is not defined
```
→ window.ChartAnalysis.createCardChart() 사용

## 📚 참고 자료

- [ES6 모듈](https://developer.mozilla.org/ko/docs/Web/JavaScript/Guide/Modules)
- [LightweightCharts API](https://tradingview.github.io/lightweight-charts/)
- [NBVerse 문서](./NBVERSE_FOLDER_GUIDE.md)

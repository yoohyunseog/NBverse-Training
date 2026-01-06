# 강화학습 AI 분석 성능 분석 보고서

## 개요

강화학습 AI 분석(`/api/ai/analyze-rl`)이 오래 걸리는 주요 원인을 분석한 보고서입니다.

## 현재 성능 지표

- **예상 소요 시간**: 30초 이상 (경고 기준)
- **실제 측정**: 코드에서 `rl_duration > 30` 초과 시 경고 출력

## 주요 병목 지점 분석

### 1. Base Model 예측 (가장 큰 병목 가능성) ⚠️

**위치**: `ai/base_model.py` → `BaseModel.predict()`

**소요 시간이 긴 이유**:
1. **ML 모델 로드** (`ml_model_manager.load_ml_model()`)
   - 모델 파일이 캐시되지 않은 경우 디스크 I/O 발생
   - `joblib.load()` 호출 시 대용량 모델 파일 로드
   - 재시도 로직 (최대 3회, 0.5초 대기)으로 인한 지연 가능성
   
2. **특징 벡터 추출** (`_extract_features()`)
   - 히스토리 데이터 처리
   - 통계 계산 (평균, 표준편차 등)
   
3. **모델 예측 수행**
   - `model.predict()` 및 `model.predict_proba()` 호출
   - GradientBoostingClassifier 등 무거운 모델의 경우 느림

**코드 위치**:
```python
# ai/base_model.py:70
model_pack = self.ml_model_manager.load_ml_model(interval, prefer_bot_models=True)

# ai/base_model.py:105-106
pred = model.predict(feature_array)[0]
probs = model.predict_proba(feature_array)[0]
```

### 2. N/B 값 계산 (두 번째 병목) ⚠️

**위치**: `ai/rl_system.py` → `RLSystem._calculate_and_record_nb_value()`

**소요 시간이 긴 이유**:
1. **NBVerse 변환** (`calculate_nb_value_from_chart()`)
   - 가격 데이터를 텍스트로 변환 (최근 200개)
   - `nbverse_converter.text_to_nb()` 호출
   - NBVerse 저장소에 저장 (`nbverse_storage.save_text()`)
   
2. **MAX/MIN 값 계산**
   - NBVerse 계산기 사용
   - 가격 배열을 N/B 배열로 변환
   - `bit_max_nb()`, `bit_min_nb()` 계산

**코드 위치**:
```python
# ai/rl_system.py:535-540
nb_value = calculate_nb_value_from_chart(
    chart_data,
    nbverse_storage=self.nbverse_storage,
    nbverse_converter=self.nbverse_converter,
    settings_manager=self.settings_manager
)
```

**특징**:
- 차트 데이터가 없으면 건너뛰지만, 있으면 반드시 실행됨
- NBVerse 저장 작업이 포함되어 I/O 지연 가능

### 3. Emotion Model 인코딩

**위치**: `ai/rl_system.py` → `RLSystem.decide_action()` → `emotion_model.encode()`

**소요 시간**:
- 상대적으로 빠름 (벡터 연산)
- 하지만 Base Model 출력에 의존하므로 Base Model이 느리면 전체 지연

### 4. Policy Model 행동 선택

**위치**: `ai/rl_system.py` → `RLSystem.decide_action()` → `policy_model.select_action()`

**소요 시간**:
- Q-value 계산
- 확률 분포 계산
- Epsilon-greedy 탐험
- GPU 사용 시 더 빠를 수 있음

### 5. 로깅 작업

**위치**: `ai/rl_system.py` → `RLSystem._log_decision()`

**소요 시간**:
- 파일 I/O (일별 로그 파일에 쓰기)
- 상대적으로 빠르지만 누적되면 지연 가능

## 성능 개선 방안

### 즉시 적용 가능한 개선

#### 1. 모델 캐싱 강화 ✅ (이미 구현됨)

**현재 상태**:
- `MLModelManager`에서 모델 캐싱 구현됨
- 파일 수정 시간 체크로 자동 재로드

**추가 개선**:
- 모델 로드 시 타임아웃 설정
- 비동기 모델 로드 고려

#### 2. N/B 값 계산 최적화

**개선 방안**:
1. **캐싱 추가**: 동일한 차트 데이터에 대해 N/B 값 캐싱
2. **비동기 처리**: N/B 값 계산을 백그라운드로 이동
3. **조건부 실행**: N/B 값이 최근에 계산되었으면 재계산 건너뛰기

```python
# 개선 예시
def _calculate_and_record_nb_value(self, card: Dict[str, Any], current_price: float = None):
    card_id = card.get('card_id', '')
    
    # 캐시 확인 (5분 이내 계산된 값이 있으면 재사용)
    if card_id in self.card_nb_values:
        cached = self.card_nb_values[card_id]
        elapsed = (datetime.now() - cached['timestamp']).total_seconds()
        if elapsed < 300:  # 5분
            return  # 캐시된 값 사용
    
    # ... 기존 계산 로직
```

#### 3. 특징 벡터 추출 최적화

**개선 방안**:
- 히스토리 데이터 전처리 캐싱
- 불필요한 계산 제거

#### 4. 로깅 비동기화

**개선 방안**:
- 로그 쓰기를 백그라운드 스레드로 이동
- 배치 로깅 (여러 로그를 모아서 한 번에 쓰기)

### 중장기 개선 방안

#### 1. 병렬 처리

- Base Model, Emotion Model, Policy Model을 병렬로 실행
- 단, Base Model 출력이 Emotion Model에 필요하므로 순차 실행 필요
- N/B 값 계산은 독립적이므로 병렬 가능

#### 2. 모델 경량화

- 더 작은 모델 사용
- 모델 양자화 (Quantization)
- 모델 압축

#### 3. GPU 가속

- 이미 Policy Model에서 GPU 지원 확인됨
- Base Model 예측도 GPU로 이동 가능한지 확인

#### 4. 예측 결과 캐싱

- 동일한 카드 상태에 대한 예측 결과 캐싱
- 짧은 시간 내 재요청 시 캐시 반환

## 성능 측정 방법

### 현재 측정 코드

```python
# html_version/api/app.py:1243-1257
rl_start_time = time.time()
decision = rl_system.decide_action(card, current_price)
rl_duration = time.time() - rl_start_time

if rl_duration > 30:
    print(f"⚠️ 강화학습 AI 판정이 {rl_duration:.2f}초 소요되었습니다.")
```

### 상세 프로파일링 추가

각 단계별 시간 측정:

```python
import time

# 1. Base Model
base_start = time.time()
base_output = self.base_model.predict(card, current_price)
base_duration = time.time() - base_start

# 2. Emotion Model
emotion_start = time.time()
emotion_output = self.emotion_model.encode(base_output, card)
emotion_duration = time.time() - emotion_start

# 3. N/B 값 계산
nb_start = time.time()
self._calculate_and_record_nb_value(card, current_price)
nb_duration = time.time() - nb_start

# 4. Policy Model
policy_start = time.time()
action_result = self.policy_model.select_action(state, ...)
policy_duration = time.time() - policy_start

print(f"⏱️ 성능 분석: Base={base_duration:.2f}s, Emotion={emotion_duration:.2f}s, "
      f"NB={nb_duration:.2f}s, Policy={policy_duration:.2f}s")
```

## 우선순위별 개선 계획

### 🔥 최우선 (즉시 적용)

1. **N/B 값 계산 캐싱** - 가장 큰 효과 예상
2. **로깅 비동기화** - 파일 I/O 지연 제거
3. **상세 프로파일링 추가** - 정확한 병목 지점 파악

### ⚡ 중순위 (1주일 내)

4. **모델 로드 최적화** - 타임아웃 및 에러 핸들링
5. **특징 벡터 추출 최적화** - 불필요한 계산 제거

### 💡 장기 개선 (1개월 내)

6. **병렬 처리** - N/B 값 계산 병렬화
7. **예측 결과 캐싱** - 동일 상태 재요청 최적화
8. **모델 경량화** - 더 빠른 추론 속도

## 참고 파일

- `ai/rl_system.py` - 강화학습 시스템 메인 로직
- `ai/base_model.py` - Base Model 예측
- `ai/ml_manager.py` - ML 모델 로드 및 캐싱
- `nbverse_helper.py` - N/B 값 계산
- `html_version/api/app.py` - API 엔드포인트

## 결론

강화학습 AI 분석이 오래 걸리는 주요 원인:

1. **Base Model 예측** (ML 모델 로드 및 예측) - 약 50-70% 소요
2. **N/B 값 계산** (NBVerse 변환 및 저장) - 약 20-30% 소요
3. **로깅 작업** (파일 I/O) - 약 5-10% 소요

**즉시 개선 가능한 항목**:
- N/B 값 계산 캐싱 (가장 큰 효과)
- 로깅 비동기화
- 상세 프로파일링 추가

이러한 개선을 통해 **30초 이상 소요되던 분석 시간을 10초 이하로 단축**할 수 있을 것으로 예상됩니다.


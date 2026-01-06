// 📌 1. 주어진 배열들을 초기화하는 함수
function initializeArrays(count) {
    const arrays = ['BIT_START_A50', 'BIT_START_A100', 'BIT_START_B50', 'BIT_START_B100', 'BIT_START_NBA100'];
    const initializedArrays = {};
    arrays.forEach(array => {
        initializedArrays[array] = new Array(count).fill(0);
    });
    return initializedArrays;
}

// 📌 2. N/B 값을 계산하는 함수 (가중치 상한치 및 하한치 기반)
function calculateBit(nb, bit = 5.5, reverse = false) {
    if (nb.length < 2) {
        return bit / 100;
    }

    const BIT_NB = bit;
    const max = Math.max(...nb);
    const min = Math.min(...nb);
    const COUNT = 150;
    const CONT = 20;
    const range = max - min;

    // 음수와 양수 범위를 구분하여 증분 계산
    const negativeRange = min < 0 ? Math.abs(min) : 0;
    const positiveRange = max > 0 ? max : 0;

    const negativeIncrement = negativeRange / (COUNT * nb.length - 1);
    const positiveIncrement = positiveRange / (COUNT * nb.length - 1);

    const arrays = initializeArrays(COUNT * nb.length);
    let count = 0;
    let totalSum = 0;

    for (let value of nb) {
        for (let i = 0; i < COUNT; i++) {
            const BIT_END = 1;

            // 부호에 따른 A50, B50 계산
            const A50 = value < 0
                ? min + negativeIncrement * (count + 1) // 음수일 때
                : min + positiveIncrement * (count + 1); // 양수일 때

            const A100 = (count + 1) * BIT_NB / (COUNT * nb.length);

            const B50 = value < 0
                ? A50 - negativeIncrement * 2
                : A50 - positiveIncrement * 2;

            const B100 = value < 0
                ? A50 + negativeIncrement
                : A50 + positiveIncrement;

            const NBA100 = A100 / (nb.length - BIT_END);

            arrays.BIT_START_A50[count] = A50;
            arrays.BIT_START_A100[count] = A100;
            arrays.BIT_START_B50[count] = B50;
            arrays.BIT_START_B100[count] = B100;
            arrays.BIT_START_NBA100[count] = NBA100;
            count++;
        }
        totalSum += value;
    }

    // Reverse 옵션 처리 (시간 역방향 흐름 분석)
    if (reverse) {
        arrays.BIT_START_NBA100.reverse();
    }

    // NB50 계산 (시간 흐름 기반 가중치 분석)
    let NB50 = 0;
    for (let value of nb) {
        for (let a = 0; a < arrays.BIT_START_NBA100.length; a++) {
            if (arrays.BIT_START_B50[a] <= value && arrays.BIT_START_B100[a] >= value) {
                NB50 += arrays.BIT_START_NBA100[Math.min(a, arrays.BIT_START_NBA100.length - 1)];
                break;
            }
        }
    }

    // 시간 흐름의 상한치(MAX)와 하한치(MIN) 보정
    if (nb.length === 2) {
        return bit - NB50; // NB 분석 점수가 작을수록 시간 흐름 안정성이 높음
    }

    return NB50;
}

// 📌 3. SUPER_BIT 글로벌 변수 및 업데이트 함수
let SUPER_BIT = 0;

function updateSuperBit(newValue) {
    // SUPER_BIT는 현재 N/B 분석 상태를 반영한 전역 가중치
    SUPER_BIT = newValue;
}

// 📌 4. BIT_MAX_NB 함수 (시간 흐름 상한치 분석)
function BIT_MAX_NB(nb, bit = 5.5) {
    let result = calculateBit(nb, bit, false); // 시간 순방향 분석 (Forward Time Flow)

    // 결과 값이 유효 범위를 벗어나면 SUPER_BIT 반환
    if (!isFinite(result) || isNaN(result) || result > 100 || result < -100) {
        return SUPER_BIT;
    } else {
        updateSuperBit(result);
        return result;
    }
}

// 📌 5. BIT_MIN_NB 함수 (시간 흐름 하한치 분석)
function BIT_MIN_NB(nb, bit = 5.5) {
    let result = calculateBit(nb, bit, true); // 시간 역방향 분석 (Reverse Time Flow)

    // 결과 값이 유효 범위를 벗어나면 SUPER_BIT 반환
    if (!isFinite(result) || isNaN(result) || result > 100 || result < -100) {
        return SUPER_BIT;
    }
    else {
        updateSuperBit(result);
        return result;
    }
}


const config = {
  type: Phaser.AUTO,
  width: window.innerWidth * 0.8,
  height: window.innerHeight,
  backgroundColor: "#000000",
  physics: {
    default: "arcade",
    arcade: {
      debug: false,
      gravity: { x: 0, y: 0 },
    },
  },
  scene: {
    preload: preload,
    create: create,
    update: update,
  },
};

const game = new Phaser.Game(config);

// 플레이어의 원(circle) 객체
let playerCircle;

// 움직이는 원들을 저장할 배열
let movingCircles = [];

// 초기화할 움직이는 원의 개수
let movingCircleslength = 20;

// 커서 키 입력을 감지하기 위한 객체
let cursors;

// 플레이어 원의 속도를 저장하는 객체
let velocity = { x: 0, y: 0 };

// 플레이어가 움직일 수 있는 최대 속도
let maxSpeed = 400;

// 플레이어 원의 가속도
let acceleration = 15;

// 플레이어의 초기 점수
let score = 100;

// 화면에 점수를 표시할 텍스트 객체
let scoreText;

// 마지막 충돌이 발생한 시간을 저장 (시간 관련 로직에서 사용)
let lastCollisionTime = 0;

// 모든 원의 위치와 점수를 저장할 배열
let indexData = [];

// 빨간 공(특정 공 종류)의 초기 점수
let redBallScore = 0;

// 적 공의 초기 개수
let enemyCount = 6;

// 점수 데이터의 인덱스 카운터
let indexCount = 0;

// 공 위치 및 점수 데이터를 저장하는 이름 (로컬 스토리지에서 사용)
let indexDataName = "indexData ver 0.1";

// 플레이어 데이터를 저장하는 이름 (로컬 스토리지에서 사용)
let indexPlayerName = "PlayerData ver 0.1";

// 데이터 배열의 키값
let indexDataKey = 0;

// 경로 데이터 이름 (로컬 스토리지에서 사용)
let indexPathDataName = "indexPathData ver 0.1";

// 공의 이동 경로 데이터를 저장할 배열
let indexPathData = [];

// 경로 객체 배열
let indexPathObject = [];

//
let indexrefinedPath = [];

// 
let indexScore = 0;

// 로컬 스토리지에서 커스텀 점수를 로드하는 함수 (키보드 입력에서 + 또는 - 감지)
let customScore = loadCustomScoreFromLocalStorage(); 

// 커스텀 최고 점수 (사용자가 설정 가능)
let customMaxScore = 1;

// 게임에서 사용하는 레인 정보 (추가 정보 필요)
let thislanes;

// 리셋 구역 정보 (추가 정보 필요)
let thisresetZone;

// 초록색 구역 정보 (추가 정보 필요)
let thisgreenZone;


// Define constants for each index name
// 유사도 임계값 및 각 인덱스의 이름 정의
// INDEX_NAMES: 설정값에 대한 키를 정의한 상수 객체
const INDEX_NAMES = {
  SIMILARITY_THRESHOLD: 'SIMILARITY_THRESHOLD', // 유사도 임계값
  BIT_MAX_NB: 'bit_max_nb',                     // 최대 N/B 비트 (최대 허용치)
  BIT_MIN_NB: 'bit_min_nb',                     // 최소 N/B 비트 (최소 허용치)
  SIMILARITY_MAX: 'similarity_max',             // 최대 유사도 (상태 평가를 위한 최대값)
  SIMILARITY_MIN: 'similarity_min',             // 최소 유사도 (상태 평가를 위한 최소값)
  BIT_AVERAGE_SIMILARITY: 'bit_average_similarity', // 평균 유사도
  STABILITY: 'Stability',                       // 시스템 안정성 상태
  APPROACH_STAGE: 'approachStage',              // 접근 단계 (Low, Medium, High)
  APPROACH_PROBABILITY: 'approachProbability',  // 접근 확률 (상대적 거리 기반)
  CURRENT_DISTANCE: 'currentDistance',          // 현재 거리 (단위: meters)
  DISTANCE_PERCENTAGE: 'distancePercentage',    // 거리 백분율 (안전 거리 대비 비율)
  STABLE_PROBABILITY: 'stableProbability',      // 안정적 상태에 있을 확률
  UNSTABLE_PROBABILITY: 'unstableProbability',  // 불안정 상태에 있을 확률
  APPROACH_COUNT: 'approachCount',              // 접근 횟수 (특정 이벤트 발생 빈도)
  TOTAL_DISTANCE_CHECKS: 'totalDistanceChecks', // 총 거리 체크 횟수
  SAFE_DISTANCE: 'safeDistance',               // 안전 거리
  SAFE_MAX_DISTANCE: 'safeMaxDistance',        // 최대 안전 거리
  SAFE_MIN_DISTANCE: 'safeMinDistance',        // 최소 안전 거리
  SAFE_THRESHOLD: 'safeThresHold',             // 경고 임계값 (안전 거리의 기준치)

  // 감도 조정 관련 추가
  SENSITIVITY: 'sensitivity',                   // 현재 감도 (0.0 ~ 2.0 사이 값)
  SENSITIVITY_MAX: 'SENSITIVITY_MAX',                   
  SENSITIVITY_MIN: 'SENSITIVITY_MIN',                  
  SENSITIVITY_LEVEL: 'sensitivityLevel',        // 감도 단계 (Low, Medium, High)
  SENSITIVITY_ADJUSTMENT: 'sensitivityAdjustment', // 감도 조정 값 (실시간 변화량)
};

let DEFAULT_VALUES = {
  SIMILARITY_THRESHOLD: 95.0,     // 기본 유사도 임계값을 약간 낮춤 (100에 가까울수록 유사도 요구가 높음)
  bit_max_nb: 0.08,               // 최대 N/B 비트: 상한치를 약간 상향 조정
  bit_min_nb: 0.02,               // 최소 N/B 비트: 하한치를 약간 낮춰 다양한 값을 지원
  similarity_max: 75.0,           // 최대 유사도: 현재 시스템의 동작에 따른 최대값 설정
  similarity_min: 25.0,           // 최소 유사도: 유사도가 낮은 경우를 처리하기 위한 값
  bit_average_similarity: 60.0,   // 평균 유사도: 유사도를 약간 높여 중간 수준의 상태를 반영
  Stability: 'Stable',            // 안정성 상태: 기본값 유지 ('Stable')
  approachStage: 'Medium',        // 접근 단계: Low → Medium으로 변경해 현재 상황을 반영
  approachProbability: 30.0,      // 접근 확률: 0 → 30.0으로 설정해 확률 기반 동작 추가
  currentDistance: 10.0,          // 현재 거리: 기본값 0 → 10.0으로 설정
  distancePercentage: 20.0,       // 거리 백분율: 50 → 20으로 변경, 초기 단계 거리 비율 조정
  stableProbability: 70.0,        // 안정적 상태 확률: 50 → 70으로 안정성을 높임
  unstableProbability: 10.0,      // 불안정 상태 확률: 0 → 10으로 변경
  approachCount: 150,             // 접근 횟수: 250 → 150으로 감소, 접근 이벤트 조정
  totalDistanceChecks: 20,        // 총 거리 체크 횟수: 0 → 20으로 거리 확인 데이터 추가
  safeDistance: 200,              // 안전 거리: 250 → 200으로 조정
  safeMaxDistance: 300,           // 최대 안전 거리: 150 → 300으로 확장
  safeMinDistance: 100,           // 최소 안전 거리: 유지
  safeThresHold: 85,              // 안전 거리 임계값: 100 → 85로 감소

  // 감도 관련 설정 추가
  sensitivity: 1.2,               // 기본 감도: 1.0 → 1.2로 민감도 약간 증가
  SENSITIVITY_MAX: 2.0,           // 감도의 최대값: 유지
  SENSITIVITY_MIN: 0.1,           // 감도의 최소값: 0.2 → 0.1로 감소
  sensitivityLevel: 'High',       // 감도 단계: Medium → High로 민감도를 높임
  sensitivityAdjustment: 0.15,    // 감도 조정량: 0.1 → 0.15로 변경
};

// Function to initialize and set up save listeners for all index names
function initializeAllSettings() {
  Object.keys(INDEX_NAMES).forEach((key) => {
    const indexName = INDEX_NAMES[key];
    const buttonId = `saveGeneralSettings`;

    initializeSimilarityThreshold(indexName, DEFAULT_VALUES[indexName]);
    setupSaveThresholdListener(buttonId, indexName);
  });
}

// Call the function to initialize all settings
initializeAllSettings();

/**
 * Initialize a setting with a default value and load it from localStorage if available.
 * @param {string} indexName - The key used to store and retrieve the value in localStorage.
 * @param {any} defaultValue - The default value if none is found in localStorage.
 */
function initializeSimilarityThreshold(indexName, defaultValue) {
  // Check if a value exists in localStorage
  const savedValue = localStorage.getItem(indexName);
  //console.log('indexName', indexName);
  //console.log('savedValue', savedValue);
  if (savedValue !== null && savedValue !== undefined && savedValue !== "undefined") {
    // Parse and assign the saved value
    window[indexName] = isNaN(savedValue) ? savedValue : parseFloat(savedValue);

    // Ensure DEFAULT_VALUES is updated with the value
    if (DEFAULT_VALUES.hasOwnProperty(indexName)) {
      DEFAULT_VALUES[indexName] = window[indexName]; // Update from initialized value
      console.log(`Updated DEFAULT_VALUES[${indexName}] to ${window[indexName]}`);
    } else {
      console.warn(`Key ${indexName} does not exist in DEFAULT_VALUES.`);
    }
    console.log(`Loaded ${indexName}: ${window[indexName]}`);
  } else {
    // Assign the default value if no value is saved in localStorage
    window[indexName] = defaultValue;
    console.log(`Initialized ${indexName} with default value: ${defaultValue}`);
  }

  // Set the input field value if it exists
  const inputField = document.getElementById(indexName);
  if (inputField) {
    inputField.value = window[indexName];
  }
}

/**
 * Set up a save button to listen for clicks and save the input value to localStorage.
 * @param {string} buttonId - The ID of the save button.
 * @param {string} indexName - The key used to store the value in localStorage.
 */
function setupSaveThresholdListener(buttonId, indexName) {
  const saveButton = document.getElementById(buttonId);
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const inputField = document.getElementById(indexName);
      if (inputField) {
        const inputValue = inputField.value;
        // Validate and save the input value
        if (!isNaN(inputValue) && inputValue.trim() !== "") {
          window[indexName] = parseFloat(inputValue);
          localStorage.setItem(indexName, window[indexName]);

          // Ensure DEFAULT_VALUES is updated with the value
          if (DEFAULT_VALUES.hasOwnProperty(indexName)) {
            DEFAULT_VALUES[indexName] = window[indexName]; // Update from initialized value
            console.log(`Updated DEFAULT_VALUES[${indexName}] to ${window[indexName]}`);
          } else {
            console.warn(`Key ${indexName} does not exist in DEFAULT_VALUES.`);
          }

          console.log(`Saved ${indexName}: ${window[indexName]}`);
        } else {
          console.warn(`Invalid value for ${indexName}. Not saved.`);
        }
      } else {
        //const config = {`Input field for ${indexName} not found.`);
      }
    });
  } else {
    //const config = {`Save button with ID ${buttonId} not found.`);
  }
}

let ScoreIndex = "indexmainScore";
let redBallScoreIndex = "indexredBallScore";

// Load the scores from local storage
score = loadScoreFromLocalStorage("indexmainScore");
redBallScore = loadScoreFromLocalStorage("indexredBallScore");

let isGameStarted = false; // 게임 시작 여부를 추적

game.scene.pause();
function startGame() {
  startMessage.setVisible(isGameStarted)
  if (!isGameStarted) {
    isGameStarted = true; // Set the game state to started
    console.log("Game started!");

    // 게임 루프 중지
    game.scene.resume();
    console.log("Game paused.");

    // Optionally hide a "Click to Start" message
    const startMessage = document.getElementById("startMessage");
    if (startMessage) startMessage.style.display = "none";
  } else {
    isGameStarted = false; // Set the game state to started
    game.scene.pause();
  }
}

// 클릭 이벤트 리스너
document.addEventListener("click", (event) => {
  const tabElement = document.getElementById("tab"); // #tab 요소 가져오기

  // #tab 영역 외부에서 클릭된 경우에만 작동
  if (!tabElement.contains(event.target)) {
    startGame();
  }
});

function createLanes(scene, config) {
  const lanes = [];
  const roadGraphics = scene.add.graphics();

  // 도로의 배경 (회색)
  roadGraphics.fillStyle(0x444444, 1);
  roadGraphics.fillRect(0, config.height / 2 - 150, config.width, 300); // 도로 영역

  // enemyCount개의 차선 생성
  const enemyCount = 6; // 예시: 총 6개의 차선
  for (let i = 0; i <= enemyCount; i++) {
    const y = config.height / 2 - 150 + (300 / 6) * i; // 각 차선의 Y 좌표
    const isCentralLane = i === 3 || i === 2; // 중앙선 체크

    const lane = {
      id: i,
      y: y + 25, // Y 좌표
      color: isCentralLane ? 0xffff00 : 0xffffff, // 중앙선은 노란색, 나머지는 흰색
      isCentralLane: isCentralLane,
    };

    lanes.push(lane);

    // 차선을 그리기
    roadGraphics.lineStyle(2, lane.color, 1);
    roadGraphics.beginPath();
    roadGraphics.moveTo(0, y);
    roadGraphics.lineTo(config.width, y);
    roadGraphics.strokePath();
  }

  // 중앙선 (점선)
  roadGraphics.lineStyle(4, 0xffff00, 1); // 노란색 선
  for (let x = 0; x < config.width; x += 20) {
    roadGraphics.beginPath();
    roadGraphics.moveTo(x, config.height / 2);
    roadGraphics.lineTo(x + 10, config.height / 2);
    roadGraphics.strokePath();
  }

  // 리셋 존
  roadGraphics.fillStyle(0xff0000, 0.5); // 빨간색 반투명
  // 123 차선 좌측 끝
  roadGraphics.fillRect(0, config.height / 2 - 150, 50, 150); // 리셋 존 (상단 3 차선)

  // 456 차선 우측 끝
  roadGraphics.fillRect(config.width - 50, config.height / 2, 50, 150); // 리셋 존 (하단 3 차선)

  // 그린 존
  roadGraphics.fillStyle(0x00ff00, 0.5); // 초록색 반투명
  // 123 차선 우측 끝
  roadGraphics.fillRect(config.width - 50, config.height / 2 - 150, 50, 150); // 그린 존 (상단 3 차선)

  // 456 차선 좌측 끝
  roadGraphics.fillRect(0, config.height / 2, 50, 150); // 그린 존 (하단 3 차선)

  // 리셋 존 정보 추가
  const resetZone = {
    topLeft: { x: 0, y: config.height / 2 - 150, width: 50, height: 150 }, // 123 차선 좌측
    bottomRight: { x: config.width - 50, y: config.height / 2, width: 50, height: 150 }, // 456 차선 우측
  };

  // 그린 존 정보 추가
  const greenZone = {
    topRight: { x: config.width - 50, y: config.height / 2 - 150, width: 50, height: 150 }, // 123 차선 우측
    bottomLeft: { x: 0, y: config.height / 2, width: 50, height: 150 }, // 456 차선 좌측
  };

  return { lanes, resetZone, greenZone }; // 생성된 차선 객체와 리셋 존 및 그린 존 반환
}

// ResetZone 배열에 공 추가 함수
function addStaticCirclesToAllResetZones(scene, resetZones, numCirclesPerZone = 3) {
  resetZones.forEach((zone, zoneIndex) => {
    const { x: zoneX, y: zoneY, width: zoneWidth, height: zoneHeight } = zone;

    for (let i = 0; i < numCirclesPerZone; i++) {
      const randomX = Phaser.Math.Between(zoneX + 20, zoneX + zoneWidth - 20); // 각 resetZone 내부 랜덤 X 좌표
      const randomY = Phaser.Math.Between(zoneY + 20, zoneY + zoneHeight - 20); // 각 resetZone 내부 랜덤 Y 좌표

      // 원(circle) 생성
      const staticCircle = scene.physics.add.sprite(randomX, randomY, null);
      staticCircle.setDisplaySize(30, 30); // 크기 설정
      staticCircle.body.setSize(50, 30); // 물리 충돌 영역 설정
      staticCircle.setBounce(0); // 반발력 없음
      staticCircle.body.immovable = true; // 움직이지 않도록 설정
      staticCircle.setCollideWorldBounds(false); // 월드 경계 무시

      // ID 부여
      staticCircle.id = `zone-${zoneIndex + 1}-static-${i + 1}`;

      // 그래픽 추가 (원 렌더링)
      staticCircle.graphics = scene.add.graphics();
      staticCircle.graphics.fillStyle(0x0000ff, 1); // 색상 설정 (파란색)
      staticCircle.graphics.fillCircle(staticCircle.x, staticCircle.y, 20); // 원을 그리기

      // 텍스트 라벨 추가 (ID 표시)
      staticCircle.label = scene.add.text(staticCircle.x - 10, staticCircle.y - 10, `${staticCircle.id}`, {
        font: "16px Arial",
        fill: "#ffffff",
        align: "center",
      });
      staticCircle.label.setDepth(1); // 텍스트 깊이 설정

      // 라벨 업데이트 함수 (위치 고정)
      staticCircle.updateLabel = () => {
        staticCircle.label.setPosition(
          staticCircle.x - staticCircle.label.width / 2,
          staticCircle.y - staticCircle.label.height / 2
        );
      };

      // 원을 배열에 추가 (추적용)
      movingCircles.push(staticCircle);
    }
  });
}
let gauge;
function preload() {}

function create() {
  //indexPathObject.length > DEFAULT_VALUES.approachCount / 2
  const gaugeWidth = config.width - 20;
  const gaugeHeight = 20;
  const gaugeX = 10;
  const gaugeY = config.height - gaugeHeight - 10;

  // 게이지 생성
  gauge = createGauge(this, gaugeX, gaugeY, gaugeWidth, gaugeHeight, 0, 0x00ff00);


  // 도로와 중앙선 추가
  const roadGraphics = this.add.graphics();

  // 도로 배경 (회색)
  roadGraphics.fillStyle(0x444444, 1);
  roadGraphics.fillRect(0, config.height / 2 - 150, config.width, 300); // 도로 영역

  const { lanes, resetZone, greenZone } = createLanes(this, config); // 차선을 생성하고 배열로 반환받음
  thislanes = lanes;
  thisresetZone = resetZone;
  thisgreenZone = greenZone;

  // 차선 정보 출력
  thislanes.forEach((lane) => {
    console.log(
      `Lane ID: ${lane.id}, Y Position: ${lane.y}, Color: ${lane.isCentralLane ? "Yellow" : "White"}`
    );
  });

  // 기존 코드 유지
  // Create the player's circle
  playerCircle = this.physics.add.sprite(
    config.width - config.width,
    config.height / 2 + (50 * 2) + 25,
    null
  );

  playerCircle.setDisplaySize(30, 30);
  playerCircle.setCircle(0, 0, 0, 0);
  playerCircle.setBounce(1);
  playerCircle.setCollideWorldBounds(true);

  // Draw player circle
  playerCircle.graphics = this.add.graphics();
  playerCircle.graphics.fillStyle(0x00ff00, 1);
  playerCircle.graphics.fillCircle(playerCircle.x, playerCircle.y, 20);

  // Enable keyboard input
  cursors = this.input.keyboard.createCursorKeys();
  this.input.keyboard.addKeys("W,A,S,D");

  // Create moving circles (but don't start updating them yet)
  const excludedLane = thislanes[3].y; // 제외할 라인의 Y 중심 좌표

  for (let i = 0; i < customScore; i++) {
    const randomIndex = Phaser.Math.Between(3, thislanes.length - 2);
    const y = thislanes[randomIndex].y; // 랜덤 라인의 Y 중심 좌표

    // 제외할 라인 건너뛰기
    //if (y === excludedLane) continue;

    const x = Phaser.Math.Between(50, config.width - 50); // X 좌표는 화면 내 랜덤 위치

    // 원(circle) 생성
    const circle = this.physics.add.sprite(x, y, null);
    circle.setDisplaySize(30, 30); // 크기 설정
    circle.body.setSize(50, 30); // 물리 충돌 영역 설정
    circle.setBounce(1); // 반발력 설정 (충돌 시 효과, 이동 없으므로 영향 없음)
    circle.setCollideWorldBounds(true); // 월드 경계 내에서만 유지

    // ID 부여
    circle.id = movingCircles.length + 1;

    // 그래픽 추가 (원 렌더링)
    circle.graphics = this.add.graphics();
    circle.graphics.fillStyle(0xff0000, 1); // 색상 설정 (빨간색)
    circle.graphics.fillCircle(circle.x, circle.y, 20); // 원을 그리기

    // 텍스트 라벨 추가 (ID 표시)
    circle.label = this.add.text(circle.x - 10, circle.y - 10, `${circle.id}`, {
      font: "16px Arial",
      fill: "#ffffff",
      align: "center",
    });
    circle.label.setDepth(1); // 텍스트 깊이 설정

    // 라벨 업데이트 함수 (위치 고정)
    circle.updateLabel = () => {
      circle.label.setPosition(
        circle.x - circle.label.width / 2,
        circle.y - circle.label.height / 2
      );
    };

    // 원을 배열에 추가
    movingCircles.push(circle);
  }

  // Add collision logic (but no updates will occur until the game starts)
  this.physics.add.collider(movingCircles, movingCircles, (circle1, circle2) => {
    handleBounce(circle1);
    handleBounce(circle2);
  });

  this.physics.add.collider(playerCircle, movingCircles, (player, enemy) => {
    //handlePlayerCollision(enemy, indexData);
  });

  // Display score (won't change until the game starts)
  scoreText = this.add.text(10, 10, `Score: ${score}`, {
    font: "24px Arial",
    fill: "#ffffff",
  });
  scoreText.setScrollFactor(0); // 카메라 이동 시 고정

  redBallScoreText = this.add.text(10, 40, `Red Ball Score: ${redBallScore}`, {
    font: "24px Arial",
    fill: "#ff0000",
  });
  redBallScoreText.setScrollFactor(0); // 카메라 이동 시 고정

  // 초기 점수 출력
  NBBallCountText = this.add.text(
    10,
    70,
    `N/B Ball Count: ${customScore}::${customMaxScore}`,
    {
      font: "24px Arial",
      fill: "#ffffff",
    }
  );

  NBBallCountText.setScrollFactor(0); // 카메라 이동 시 고정

  indexCountText = this.add.text(10, 110, `N/B indexCount: ${indexCount}`, {
    font: "24px Arial",
    fill: "#ffffff",
  });

  indexCountText.setScrollFactor(0); // 카메라 이동 시 고정

  // 초기 점수 출력
  safeThresHoldText = this.add.text(
    10,
    150,
    `임계치 거리: 0`,
    {
      font: "24px Arial",
      fill: "#ffffff",
    }
  );

  safeThresHoldText.setScrollFactor(0); // 카메라 이동 시 고정

  remainingTimeText = this.add.text(
    10,
    190,
    `초기화 시간: 0`,
    {
      font: "24px Arial",
      fill: "#ffffff",
    }
  );

  remainingTimeText.setScrollFactor(0); // 카메라 이동 시 고정

  pathScoreText = this.add.text(
    10,
    230,
    `경로 포인트: 0`,
    {
      font: "24px Arial",
      fill: "#ffffff",
    }
  );

  pathScoreText.setScrollFactor(0); // 카메라 이동 시 고정
  
  // Display "Click to Start" message
  startMessage = this.add.text(
    config.width / 2,
    config.height / 2,
    "Click to Start",
    {
      font: "32px Arial",
      fill: "#ffffff",
      align: "center",
    }
  );

  startMessage.setOrigin(0.5, 0.5);

  // 키 입력 처리 설정
  setupKeyInput(this);

}

function createGauge(scene, x, y, width, height, progress = 0, color = 0x00ff00) {
  const gauge = {
    scene: scene, // Phaser 씬 참조 저장
    x: x,
    y: y,
    width: width,
    height: height,
    progress: progress,
    graphics: scene.add.graphics(),
    color: color,
    update(newProgress) {
      this.progress = Phaser.Math.Clamp(newProgress, 0, 1);
      this.graphics.clear();
      this.graphics.fillStyle(0x444444, 1); // 배경색
      this.graphics.fillRect(this.x, this.y, this.width, this.height);

      // 진행 바 그리기
      this.graphics.fillStyle(this.color, 1);
      this.graphics.fillRect(this.x, this.y, this.width * this.progress, this.height);
    },
  };

  gauge.update(progress); // 초기 상태 업데이트
  return gauge;
}


function updateGauge(gauge, approachCount, pathLength) {
  if (!gauge || pathLength === 0 || !approachCount) {
    //const config = {"Gauge or pathLength is invalid.");
    return;
  }

  // 퍼센트 계산
  const percentage = approachCount / pathLength;

  // 게이지 업데이트
  gauge.update(percentage);

  // 텍스트 업데이트 (게이지에 텍스트가 없는 경우 추가로 생성)
  if (!gauge.text) {
    const scene = gauge.scene; // Phaser의 씬 참조
    if (!scene) {
      //const config = {"Gauge's scene is not defined.");
      return;
    }

    // 텍스트 객체 생성
    gauge.text = scene.add.text(
      gauge.x + gauge.width / 2,
      gauge.y - 20,
      `engine Booster Update ${Math.round(percentage * 100)}%`,
      {
        font: "16px Arial",
        fill: "#ffffff",
        align: "center",
      }
    );
    gauge.text.setOrigin(0.5, 0.5);
  } else {
    // 텍스트 값 업데이트
    gauge.text.setText(`engine Booster Update ${Math.round(percentage * 100)}%`);
  }
}



function getRandomEdgePosition(width, height) {
  const edge = Phaser.Math.Between(0, 3);
  let x, y;

  if (edge === 0) {
    x = Phaser.Math.Between(0, width);
    y = 0;
  } else if (edge === 1) {
    x = Phaser.Math.Between(0, width);
    y = height;
  } else if (edge === 2) {
    x = 0;
    y = Phaser.Math.Between(0, height);
  } else if (edge === 3) {
    x = width;
    y = Phaser.Math.Between(0, height);
  }

  return { x, y };
}

function updateWorldAndCamera(scene, playerCircle) {
  const camera = scene.cameras.main;
  const lerpFactor = 0.1; // 부드러운 이동 정도 (0.1 ~ 1.0 사이)

  // 월드 경계 동적 확장 및 축소
  const expandMargin = 400; // 경계 확장 기준
  const shrinkMargin = 800; // 경계 축소 기준
  const worldBounds = scene.physics.world.bounds;

  // 목표 경계 계산
  let targetX = worldBounds.x;
  let targetY = worldBounds.y;
  let targetWidth = worldBounds.width;
  let targetHeight = worldBounds.height;

  if (playerCircle.x < worldBounds.x + expandMargin) {
    targetX = worldBounds.x - expandMargin;
    targetWidth = worldBounds.width + expandMargin;
  } else if (playerCircle.x > worldBounds.x + worldBounds.width - expandMargin) {
    targetWidth = worldBounds.width + expandMargin;
  }

  if (playerCircle.y < worldBounds.y + expandMargin) {
    targetY = worldBounds.y - expandMargin;
    targetHeight = worldBounds.height + expandMargin;
  } else if (playerCircle.y > worldBounds.y + worldBounds.height - expandMargin) {
    targetHeight = worldBounds.height + expandMargin;
  }

  // 축소 조건
  if (playerCircle.x > worldBounds.x + shrinkMargin && playerCircle.x < worldBounds.x + worldBounds.width - shrinkMargin) {
    targetX = Math.max(worldBounds.x + expandMargin, playerCircle.x - shrinkMargin);
    targetWidth = Math.max(shrinkMargin * 2, worldBounds.width - expandMargin);
  }

  if (playerCircle.y > worldBounds.y + shrinkMargin && playerCircle.y < worldBounds.y + worldBounds.height - shrinkMargin) {
    targetY = Math.max(worldBounds.y + expandMargin, playerCircle.y - shrinkMargin);
    targetHeight = Math.max(shrinkMargin * 2, worldBounds.height - expandMargin);
  }

  // 부드러운 보간으로 경계 확장 및 축소
  const newX = Phaser.Math.Interpolation.Linear([worldBounds.x, targetX], lerpFactor);
  const newY = Phaser.Math.Interpolation.Linear([worldBounds.y, targetY], lerpFactor);
  const newWidth = Phaser.Math.Interpolation.Linear([worldBounds.width, targetWidth], lerpFactor);
  const newHeight = Phaser.Math.Interpolation.Linear([worldBounds.height, targetHeight], lerpFactor);

  scene.physics.world.setBounds(newX, newY, newWidth, newHeight);

  // 카메라 위치 계산 및 부드러운 이동
  const cameraTargetX = playerCircle.x - camera.width / 2;
  const cameraTargetY = playerCircle.y - camera.height / 2;

  camera.scrollX += (cameraTargetX - camera.scrollX) * lerpFactor;
  camera.scrollY += (cameraTargetY - camera.scrollY) * lerpFactor;

  // 카메라 경계를 월드 크기에 맞게 조정
  camera.setBounds(
    scene.physics.world.bounds.x,
    scene.physics.world.bounds.y,
    scene.physics.world.bounds.width,
    scene.physics.world.bounds.height
  );

  // 디버깅용 출력 (필요시 주석 처리)
  console.log(
    `Camera Position: (${camera.scrollX.toFixed(2)}, ${camera.scrollY.toFixed(2)}) | World Bounds: ${JSON.stringify(
      scene.physics.world.bounds
    )}`
  );
}

function updateCirclesPosition(movingCircles, lanes, config) {
  movingCircles.forEach((circle) => {
    // 랜덤 차선 지정 (처음 한 번만 실행)
    if (!circle.laneAssigned) {
      const randomLane = Phaser.Utils.Array.GetRandom(lanes); // 모든 차선에서 선택
      circle.laneAssigned = randomLane; // 현재 할당된 차선
      circle.y = randomLane.y; // 차선의 Y 좌표로 설정
    }

    // 좌측에서 우측으로 이동
    circle.x += circle.speed;

    // 우측 끝에 도달하면 좌측 끝으로 초기화
    if (circle.x > config.width) {
      circle.x = 0; // 좌측 끝으로 초기화
      const randomLane = Phaser.Utils.Array.GetRandom(lanes); // 새로운 랜덤 차선
      circle.laneAssigned = randomLane; // 새로운 차선 할당
      circle.y = randomLane.y; // 새로운 차선의 Y 좌표 설정
    }

    // 원의 그래픽 업데이트
    circle.graphics.clear();
    circle.graphics.fillStyle(0x0000ff, 1); // 파란색 원
    circle.graphics.fillCircle(circle.x, circle.y, circle.radius);
  });
}


function update(time, delta) {
  if (!isGameStarted) {
    // Do nothing if the game has not started
    return;
  }

  let stability = "";

  // Player movement
  let inputX = 0;
  let inputY = 0;

  if (cursors.left.isDown || this.input.keyboard.keys[65].isDown) inputX = -1;
  if (cursors.right.isDown || this.input.keyboard.keys[68].isDown) inputX = 1;
  if (cursors.up.isDown || this.input.keyboard.keys[87].isDown) inputY = -1;
  if (cursors.down.isDown || this.input.keyboard.keys[83].isDown) inputY = 1;

  velocity.x += inputX * acceleration;
  velocity.y += inputY * acceleration;

  velocity.x *= 0.95; // Friction
  velocity.y *= 0.95;

  velocity.x = Phaser.Math.Clamp(velocity.x, -maxSpeed, maxSpeed);
  velocity.y = Phaser.Math.Clamp(velocity.y, -maxSpeed, maxSpeed);

  playerCircle.setVelocity(velocity.x, velocity.y);

  // Center the camera on the player with smooth movement
  //updateWorldAndCamera(this, playerCircle);

  // 플레이어 및 적 서클 그래픽 업데이트
  //playerCircle.graphics.clear();

  movingCircles.forEach((circle) => {
    circle.graphics.clear();
    circle.graphics.fillStyle(0xff0000, 1);
    circle.graphics.fillCircle(circle.x, circle.y, 20);
  });

  // Create and move a small ball toward the stable target
  const stableTarget = findNextStableTarget(indexData);

  let targetId = null;
  let targetSimilarity = null;
  let targetCircle = null;
  let evader = null;

  if (indexData.length > 0) {
    targetId = indexData[0]?.id; // indexData[0]의 id를 안전하게 가져옴
    targetSimilarity = indexData[0]?.bit_average_similarity; // indexData[0]의 id를 안전하게 가져옴
    targetCircle = movingCircles.find(circle => circle.id === targetId);
    if (targetCircle) {
      evader = {
        x: targetCircle.x, // evader 초기 위치를 targetCircle 위치로 설정
        y: targetCircle.y,
        graphics: this.add.graphics(),
      };
    } else {
      //console.warn(`No matching circle found for id: ${targetId}`);
    }
  } else if(stableTarget) {
    console.warn("indexData is empty.");
    evader = {
      x: stableTarget.x, // 기본 위치
      y: stableTarget.y,
      graphics: this.add.graphics(),
    };
  }

  if (indexData.length > 0 && indexData[0]) {
    stability = indexData[0].stability;
  } else {
    console.warn("indexData is empty or indexData[0] is undefined");
  }

  // If a stable target exists, create or update the moving ball
  if (stableTarget) {
    const targetX = stableTarget.x;
    const targetY = stableTarget.y;

    // Create the moving ball if it doesn't exist
    if (!activeMovingBall) {
      createMovingBall(playerCircle, targetX, targetY, 200); // Speed is set to 200
    }

    // Update the moving ball's movement
    if(stability === "Unstable"){
      if (activeMovingBall) {

        //followTargetFromBehind(targetCircle, evader, 200, delta);
        //
        //WithCollisionAvoidance(playerCircle, targetX, targetY, 200, delta);
      }
    } else {
      if (activeMovingBall) {
        //moveTowardsTargetWithCollisionAvoidance(playerCircle, targetX, targetY, 200, delta);
        //updateMovingBall(playerCircle, targetX, targetY, 200, delta);
      }
    }
  } else {
    //console.log("No stable target found in indexData.");
  }

  if(indexData.length > 0) {
    const player = indexData.find(item => item.type === "player");
    if(player.stableCount > player.unstableCount) {
      const stableMinimum = player.stableCount - player.unstableCount;
      //localScore(stableMinimum);
      //deductRedBallScore(-stableMinimum);
    } else {
      const stableMinimum = player.unstableCount - player.stableCount;
      // localScore(-stableMinimum);
      //deductRedBallScore(stableMinimum);
    }
  }

  // 경로 생성 및 스무딩 처리
  const adjustedPath = generateStraightPathWithConnections(activeMovingBall, thisresetZone, thislanes, 0, delta);
  const count = (customScore + 50) - movingCount;
  const smoothedPath = moveActiveBallToClosestPoint(playerCircle, adjustedPath, customScore);
  const updatedPath = handleCollisionAndSwitchLane(smoothedPath, movingCircles, thislanes, this, DEFAULT_VALUES.stableProbability, count);
  const refinedPath = refinePath(updatedPath, movingCircles, DEFAULT_VALUES.stableProbability, count);

  // 경로 시각화
  drawPath2(this, refinedPath, 0xffff00, 3, 1); // 노란색 경로
  //drawPath2(this, indexrefinedPath[0]?.positionHistory, 0xffff00, 3, 1); // 노란색 경로
  drawPath2(this, indexPathObject[0]?.positionHistory, 0x808080, 3, 200); // 기존 경로
  //console.log('indexrefinedPath', indexrefinedPath);
  //console.log('indexDataKey', indexDataKey);
  // 경로 결과 분석
  const result = checkPathForLaneViolationsAndLaneChanges(refinedPath, thislanes, movingCircles, DEFAULT_VALUES);

  // 경로 데이터 저장
  const pathArr = {
    bit_max_nb: BIT_MAX_NB(flattenPathTo1DArray(refinedPath)),
    bit_min_nb: BIT_MIN_NB(flattenPathTo1DArray(refinedPath)),
    crossedCentralCount: result.crossedCentralCount,
    crossedOutsideCount: result.crossedOutsideCount,
    laneChangeCount: result.laneChangeCount,
    collidedCount: result.collidedCount,
    positionHistory: refinedPath
  };

  saveObjectWithSimilarityCheck(indexrefinedPath, pathArr, indexDataKey, DEFAULT_VALUES.approachCount);
  //console.log('indexrefinedPath', indexrefinedPath);
  manageIndexData(this, indexData, indexPathDataName, pathArr, thislanes, movingCircles, DEFAULT_VALUES);

  // 포지션 히스토리 업데이트 및 재분석
  const updatedPositionHistory = getUpdatedPositionHistory(indexPathObject[0]?.positionHistory, refinedPath);
  const result2 = checkPathForLaneViolationsAndLaneChanges(updatedPositionHistory, thislanes, movingCircles, DEFAULT_VALUES);
  const pathArr2 = {
    bit_max_nb: BIT_MAX_NB(flattenPathTo1DArray(updatedPositionHistory)),
    bit_min_nb: BIT_MIN_NB(flattenPathTo1DArray(updatedPositionHistory)),
    crossedCentralCount: result2.crossedCentralCount,
    crossedOutsideCount: result2.crossedOutsideCount,
    laneChangeCount: result2.laneChangeCount,
    collidedCount: result2.collidedCount,
    positionHistory: updatedPositionHistory
  };

  //saveObjectWithConstraints(indexPathObject, updatedPositionHistory, DEFAULT_VALUES.approachCount, movingCircles);
  //manageIndexData(this, indexData, indexPathDataName, pathArr2, thislanes, movingCircles, DEFAULT_VALUES);

  // 게이지 업데이트
  updateGauge(gauge, indexPathObject.length, DEFAULT_VALUES.approachCount);

  // 임시 사각형 생성
  createTemporaryRectangles(indexPathObject[0]?.positionHistory, this, 0x0000ff, 100);

  // 점수 및 게임 데이터 업데이트
  updateScore(indexData);
  updateindexData();

  console.log('Index Score:', indexPathObject[0]?.score);
  
  // Example Usage
  const maxDistance = 500; // Maximum distance for scaling

  // 접근 단계 평가 함수
  function evaluateApproachStage(approachProbability, similarity, N_dependency, B_dependency) {
    // 유사도 및 N/B 의존성 기반 조건 세분화
    if (N_dependency > 80 || similarity < 20) {
      // 부정적 의존성이 매우 높거나 유사도가 극히 낮음
      return "매우 긴급한 접근 단계 (Critical Approach)";
    } else if ((N_dependency > 70 && similarity < 30) || approachProbability >= 90) {
      // 부정적 의존성이 높고 유사도가 낮거나 접근 확률이 매우 높음
      return "매우 높은 접근 단계 (Very High Approach)";
    } else if ((N_dependency > 60 && similarity < 50) || (B_dependency < 30 && approachProbability >= 80)) {
      // 부정적 의존성이 중간 이상이며 유사도가 낮거나 긍정적 의존성이 낮음
      return "높은 접근 단계 (High Approach)";
    } else if ((N_dependency > 50 && similarity < 70) || (B_dependency < 50 && approachProbability >= 60)) {
      // 부정적 의존성이 낮아지기 시작하며 유사도가 보통 이하
      return "보통 접근 단계 (Moderate Approach)";
    } else if ((N_dependency < 50 && similarity >= 70) || B_dependency >= 50 || approachProbability >= 40) {
      // 부정적 의존성이 낮고 긍정적 의존성이 높음
      return "낮은 접근 단계 (Low Approach)";
    } else {
      // 모든 조건이 안전 범위 내
      return "매우 낮은 접근 단계 (Very Low Approach)";
    }
  }

  // 감도 초기값 설정
  let sensitivity = DEFAULT_VALUES.sensitivity;
  
  // 긴급 회피 동작
  movingCircles.forEach((circle) => {
    // 유사도 및 N/B 의존성 계산
    const { similarity, N_dependency, B_dependency } = calculateExactSimilarity(circle, playerCircle, maxDistance);

    // 긴급 회피 조건: 유사도 및 N/B 의존성 기반
    if (similarity < DEFAULT_VALUES.safeDistance || N_dependency > 70 || indexPathObject[0]?.player_nb_similarity > DEFAULT_VALUES.SIMILARITY_THRESHOLD) {
      // 유사도가 안전 거리 미만이거나 부정적 의존성이 높은 경우
      if (DEFAULT_VALUES.safeThresHold > DEFAULT_VALUES.safeMinDistance ) {
        DEFAULT_VALUES.safeThresHold -= sensitivity * DEFAULT_VALUES.sensitivityAdjustment;
      }
      localScore(-0.01 * sensitivity); // 점수 감소
      deductRedBallScore(0.01 * sensitivity); // 패널티 부여

      // 긴급 회피 로그
      //console.log(`긴급 회피 동작 실행!`);
      //console.log(`Circle ID: ${circle.id}`);
      //console.log(`Similarity: ${similarity.toFixed(2)}%, N Dependency: ${N_dependency.toFixed(2)}%, B Dependency: ${B_dependency.toFixed(2)}%`);
      //console.log(`Updated Safe Threshold: ${DEFAULT_VALUES.safeThresHold.toFixed(2)}`);
    } else if (B_dependency > 50) {
      // 안전 상태 유지: 긍정적 의존성이 높은 경우
      if (DEFAULT_VALUES.safeThresHold < DEFAULT_VALUES.safeMaxDistance) {
        DEFAULT_VALUES.safeThresHold += sensitivity * DEFAULT_VALUES.sensitivityAdjustment;
      }
      localScore(0.01 * sensitivity); // 점수 증가
      deductRedBallScore(-0.01 * sensitivity); // 보상 제공

      // 안전 상태 로그
      //console.log(`안전 상태 유지.`);
      //console.log(`Circle ID: ${circle.id}`);
      //console.log(`Similarity: ${similarity.toFixed(2)}%, N Dependency: ${N_dependency.toFixed(2)}%, B Dependency: ${B_dependency.toFixed(2)}%`);
      //console.log(`Updated Safe Threshold: ${DEFAULT_VALUES.safeThresHold.toFixed(2)}`);
    } else {
      // 중립 상태 처리
      //console.log(`중립 상태 - 특별 동작 없음.`);
      //console.log(`Circle ID: ${circle.id}`);
      //console.log(`Similarity: ${similarity.toFixed(2)}%, N Dependency: ${N_dependency.toFixed(2)}%, B Dependency: ${B_dependency.toFixed(2)}%`);
    }

  // 접근 단계 평가
  const approachStage = evaluateApproachStage(indexPathObject[0]?.player_nb_similarity, similarity, N_dependency, B_dependency);

  // 감도 조정을 위한 단계별 처리
  switch (approachStage) {
    case "매우 긴급한 접근 단계 (Critical Approach)":
      sensitivity += DEFAULT_VALUES.sensitivityAdjustment * 3; // 긴급 상황에서 감도 크게 증가
      if (indexPathObject[0]?.score !== undefined) {
        indexPathObject[0].score += sensitivity / 1000;
      }
      break;
    case "매우 높은 접근 단계 (Very High Approach)":
      sensitivity += DEFAULT_VALUES.sensitivityAdjustment * 2; // 높은 감도 증가
      if (indexPathObject[0]?.score !== undefined) {
        indexPathObject[0].score += sensitivity / 1000;
      }
      break;
    case "높은 접근 단계 (High Approach)":
      sensitivity += DEFAULT_VALUES.sensitivityAdjustment; // 중간 정도의 감도 증가
      if (indexPathObject[0]?.score !== undefined) {
        indexPathObject[0].score += sensitivity / 1000;
      }
      break;
    case "보통 접근 단계 (Moderate Approach)":
      sensitivity += DEFAULT_VALUES.sensitivityAdjustment * 0.5; // 약간의 감도 증가
      if (indexPathObject[0]?.score !== undefined) {
        indexPathObject[0].score += sensitivity / 1000;
      }
      break;
    case "낮은 접근 단계 (Low Approach)":
      sensitivity -= DEFAULT_VALUES.sensitivityAdjustment * 0.5; // 약간의 감도 감소
      if (indexPathObject[0]?.score !== undefined) {
        indexPathObject[0].score -= sensitivity / 1000;
      }
      break;
    case "매우 낮은 접근 단계 (Very Low Approach)":
      sensitivity -= DEFAULT_VALUES.sensitivityAdjustment; // 낮은 감도 감소
      if (indexPathObject[0]?.score !== undefined) {
        indexPathObject[0].score -= sensitivity / 1000;
      }
      break;
    default:
      console.warn("Unknown approach stage:", approachStage);
      break;
  }

  // 감도 범위 제한
  sensitivity = Math.max(DEFAULT_VALUES.SENSITIVITY_MIN, Math.min(DEFAULT_VALUES.SENSITIVITY_MAX, sensitivity));
  DEFAULT_VALUES.sensitivity = sensitivity; // 감도 업데이트

  // 디버깅 로그
  //console.log("Approach Stage:", approachStage);
  //console.log("Updated Sensitivity:", sensitivity.toFixed(2));

  // 로그 출력 (단계 및 감도 값)
  //console.log(`현재 접근 단계: ${approachStage}`);
  //console.log(`현재 감도: ${DEFAULT_VALUES.sensitivity}`);

});

  // 감도 수준 업데이트
  if (sensitivity < 0.5) {
    DEFAULT_VALUES.sensitivityLevel = 'Low';
  } else if (sensitivity < 1.5) {
    DEFAULT_VALUES.sensitivityLevel = 'Medium';
  } else {
    DEFAULT_VALUES.sensitivityLevel = 'High';
  }

  // 감도를 활용하여 함수 호출
  handleSafeThresholdShift(indexPathObject, refinedPath, sensitivity);

  const speed = 50; // 속도 설정
  updateMovingPathBall(playerCircle, activeMovingBall, thisresetZone, refinedPath, speed, DEFAULT_VALUES.safeThresHold)
  
  // 실행 예시:
  if((indexPathObject.length / DEFAULT_VALUES.approachCount) * 100 === 100) {

    localScore(0.5 * sensitivity); // 점수 증가
    deductRedBallScore(-0.5 * sensitivity); // 보상 제공
    updatePlayerCircleToFollowBall(playerCircle, activeMovingBall, DEFAULT_VALUES.safeMaxDistance, DEFAULT_VALUES.safeThresHold, 50); // 큰 원이 작은 원 따라감
  } else {
    
      localScore(-0.1 * sensitivity); // 점수 증가
      deductRedBallScore(0.1 * sensitivity); // 보상 제공
  }
  
  // 로그 출력
  console.log(`현재 감도: ${DEFAULT_VALUES.sensitivity}, 수준: ${DEFAULT_VALUES.sensitivityLevel}`);

  // movingCircles를 순회하며 각 원을 업데이트
  movingCircles.forEach((enemy) => {
    const randomNumber = Math.floor(Math.random() * 4) + 1;
    checkAndResetInZones(enemy, thisresetZone, config); // 적의 위치를 확인하고 리셋 존 처리
    moveTowardsTarget(enemy, thislanes, indexData, randomNumber); // 속도는 2로 설정
  });

  // Update moving circles and their labels
  movingCircles.forEach((circle) => {
    circle.updateLabel(); // Update label position
  });

  // 사용
  if (indexCount > 1) {

    //let indexDataName = "indexData";
    //let indexPlayerName = "PlayerData";
    manageindexData(this, indexData, indexDataName)

    indexCount = 0; // 조건 충족 시 indexCount 초기화
  } else {
    indexCount++;
  }
  indexCountgetText();

}

function calculateExactSimilarity(movingCircle, playerCircle, maxDistance) {
  const dx = movingCircle.x - playerCircle.x;
  const dy = movingCircle.y - playerCircle.y;

  // Euclidean distance
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Normalize similarity to a percentage
  const similarity = Math.max(0, (1 - (distance / maxDistance)) * 100);

  // N/B Dependencies
  const N_dependency = similarity; // Negative dependency as percentage
  const B_dependency = 100 - similarity; // Positive dependency as percentage

  return { similarity, N_dependency, B_dependency };
}

function getUpdatedPositionHistory(array, updatedPath) {
  if (!array || array.length === 0) {
    //const config = {"Invalid indexPathObject or positionHistory is missing");
    return [];
  }

  if (!updatedPath || updatedPath.length === 0) {
    //const config = {"Invalid updatedPath");
    return [];
  }

  // positionHistory 배열 가져오기
  const positionHistory = [...array]; // 원본 배열 복사

  // positionHistory 배열의 길이와 updatedPath 배열의 길이 계산
  const positionHistoryLength = positionHistory.length;
  const updatedPathLength = updatedPath.length;

  // 치환을 시작할 인덱스 계산 (positionHistory 끝부분에 맞게)
  const startIndex = positionHistoryLength - updatedPathLength;

  if (startIndex < 0) {
    //const config = {"Updated path is longer than positionHistory. Cannot replace.");
    return [];
  }

  // positionHistory의 끝부분을 updatedPath로 치환
  for (let i = 0; i < updatedPathLength; i++) {
    positionHistory[startIndex + i] = updatedPath[i];
  }

  // 치환된 배열 반환
  return positionHistory;
}

function mergeAndShiftPaths(indexPathObject, refinedPath, movingCount) {
  if (!Array.isArray(indexPathObject) || indexPathObject.length < 2) {
    console.warn("indexPathObject must be an array with at least two elements.");
    return;
  }

  // 첫 번째 경로와 두 번째 경로를 가져옵니다.
  const firstPath = indexPathObject.shift(); // 기존 첫 번째 경로를 제거하고 저장
  const secondPath = refinedPath; // 새로운 첫 번째 경로 (병합 대상)
  
  if (!Array.isArray(firstPath) || !Array.isArray(secondPath)) {
    console.warn("Both first and second paths must be arrays.");
    return;
  }

  // 첫 번째 경로와 두 번째 경로를 병합
  for (let i = movingCount + 1; i < firstPath.length && i < secondPath.length; i++) {
    firstPath[i] = secondPath[i];
  }

  // 병합된 결과 반환
  return refinedPath;
}


// safeThresHold 기반 확률로 indexPathObject.shift() 실행 함수
function handleSafeThresholdShift(indexPathObject, refinedPath, sensitivity = 1.0) {
  if (!Array.isArray(indexPathObject)) {
    console.warn("indexPathObject is not a valid array.");
    return;
  }

  if (indexPathObject.length === 0) {
    //console.log("indexPathObject is empty. No action performed.");
    return;
  }

  // safeThresHold 값을 0~1 확률로 매핑 (값이 클수록 확률이 줄어듦)
  function mapSafeThresholdToProbability(threshold) {
    const normalizedValue = (threshold + 250) / 500; // -250 ~ 250 -> 0 ~ 1
    return Math.max(0, 1 - normalizedValue); // 0 ~ 1 -> 1 ~ 0
  }

  // 현재 safeThresHold 값과 감도 기반으로 확률 계산
  const mappedProbability = mapSafeThresholdToProbability(DEFAULT_VALUES.safeThresHold);
  const adjustedThreshold = Math.min(mappedProbability * sensitivity, 1.0);

  //console.log("Mapped probability:", mappedProbability);
  //console.log("Adjusted threshold with sensitivity:", adjustedThreshold);

  // 랜덤 값 생성 및 조건 확인
  const randomValue = Math.random();
  //console.log("Random value:", randomValue);

  if (randomValue < adjustedThreshold && indexPathObject) {
    if (indexPathObject[0]?.score !== undefined) {
      indexPathObject[0].score -= 1;
      // 맨 마지막 요소 제거
      indexPathObject.pop();
    }
    if(indexPathObject[0]?.positionHistory !== undefined) {
      //indexPathObject.shift();
      const secondPath = mergeAndShiftPaths(indexPathObject, refinedPath, movingCount);
      indexPathObject[0].positionHistory = secondPath;
    }
    //console.log('secondPath', secondPath);
    //return secondPath;
    //const removedElement = indexPathObject.shift(); // 첫 번째 요소 제거
    //console.log("Removed element (due to threshold):", removedElement);
  } else {
    //return indexPathObject[0]?.positionHistory;
    //console.log("Threshold not met. No action performed.");
  }
}


function flattenPathTo1DArray(updatedPath) {
  if (!updatedPath || updatedPath.length === 0) {
    console.warn("updatedPath is empty or invalid.");
    return [];
  }

  const flattenedArray = updatedPath.reduce((acc, point) => {
    acc.push(point.x, point.y); // x, y를 순차적으로 추가
    return acc;
  }, []);

  return flattenedArray;
}

function checkPathForLaneViolationsAndLaneChanges(updatedPath, thislanes, movingCircles, DEFAULT_VALUES) {
  if (!updatedPath || !thislanes || !movingCircles || !DEFAULT_VALUES) {
    //const config = {"Invalid updatedPath, thislanes, movingCircles, or DEFAULT_VALUES.");
    return {
      crossedCentralCount: 0,
      crossedOutsideCount: 0,
      laneChangeCount: 0,
      crossedNormalCount: 0, // 정상적인 라인 위 경로 수
      collidedCount: 0, // 부딪힌 횟수
    };
  }

  // 중앙선 및 안쪽 찾기
  const normalLane = thislanes.find(
    (lane) => lane.isCentralLane === true && lane.position === "bottom"
  );

  // 중앙선 및 바깥쪽 찾기
  const centralLane = thislanes.find(
    (lane) => lane.isCentralLane === true && lane.position === "top"
  );

  const bottomOutsideLane = thislanes
  .filter((lane) => lane.position === "outside")
  .sort((a, b) => a.y - b.y)[0]; // 가장 작은 y 값을 가진 'outside' 차선 (아래쪽)

  const normalLanes = thislanes.filter(
    (lane) => lane.position === "bottom" || lane.position === "outside"
  ); // 정상적인 차선

  // 디버깅 로그
  /*
  console.log("Lanes debug info:", {
    centralLane,
    bottomOutsideLane,
    normalLanes,
    allLanes: thislanes,
  });
  */

  if (!centralLane || !bottomOutsideLane) {
    //const config = {"Required lanes (central, bottom outside) could not be determined.");
    return {
      crossedCentralCount: 0,
      crossedOutsideCount: 0,
      laneChangeCount: 0,
      crossedNormalCount: 0,
      collidedCount: 0,
    };
  }

  let crossedCentralCount = 0;
  let crossedOutsideCount = 0;
  let laneChangeCount = 0;
  let crossedNormalCount = 0; // 정상적인 라인 위 경로 수
  let collidedCount = 0; // 부딪힌 횟수

  // 이전 차선 추적
  let previousLane = null;

  // 경로 점마다 확인
  updatedPath.forEach((point, index) => {
    // Outside 경계 횟수 계산
    if (point.y === bottomOutsideLane.y) {
      crossedOutsideCount++;
      //console.log(`Outside boundary crossed at point index ${index}:`, point);
    }

    // 중앙선을 넘은 횟수 계산
    if (point.y < normalLane.y && point.y <= bottomOutsideLane.y) {
      crossedCentralCount++;
      //console.log(`Central line crossed at point index ${index}:`, point);
    }

    // 정상적인 라인 위 경로 수 계산
    const isOnNormalLane = normalLanes.some((lane) => Math.abs(lane.y - point.y) < 10);

    if (isOnNormalLane) {
      crossedNormalCount++;
    }

    // 현재 차선 확인
    const currentLane = thislanes.find((lane) => Math.abs(lane.y - point.y) < 10);

    if (currentLane && currentLane !== previousLane && point.y < centralLane.y) {
      // 차선이 변경되었으면 카운트 증가
      if (previousLane !== null) {
        laneChangeCount++;
        //console.log(`Lane changed from lane ID ${previousLane.id} to lane ID ${currentLane.id}`);
      }
      previousLane = currentLane; // 현재 차선을 이전 차선으로 업데이트
    }

    // movingCircles와의 충돌 감지 및 선 닿기 간주 (id가 100 이하인 경우만)
    movingCircles
      .filter((circle) => circle.id <= 1000) // id가 100 이하인 원만 포함
      .forEach((circle) => {
      const deltaX = point.x - circle.x;
      const deltaY = point.y - circle.y;
      const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

      // 선 닿기 또는 충돌 감지 (DEFAULT_VALUES.safeThresHold 사용)
      if (distance <= DEFAULT_VALUES.safeMinDistance) {
        collidedCount++;
        console.log(
          ///`Collision or contact detected at point index ${index} with circle:`, circle, `Distance: ${distance}, Threshold: ${DEFAULT_VALUES.safeThresHold}`
        );
      }
    });
  });

  return {
    crossedCentralCount,
    crossedOutsideCount,
    laneChangeCount,
    crossedNormalCount, // 정상적인 라인 위 경로 수
    collidedCount, // 부딪힌 횟수 또는 선 닿기
  };
}

function refinePath(smoothedPath, movingCircles, reboundForce = 50, maxPoints = 30) {
  if (!smoothedPath || smoothedPath.length < 2 || !movingCircles) {
    console.warn("Invalid smoothedPath or movingCircles data.");
    return smoothedPath;
  }

  const refinedPath = [];

  smoothedPath.forEach((point, index) => {
    let adjustedPoint = { ...point };

    // 각 점과 모든 movingCircles 간의 거리 계산
    movingCircles.forEach((circle) => {
      const dx = point.x - circle.x;
      const dy = point.y - circle.y;
      const distance = Math.sqrt(dx ** 2 + dy ** 2);

      if (distance < reboundForce) {
        // 충돌 감지: 충돌 반경 내에 있을 경우 수정
        const angle = Math.atan2(dy, dx); // 충돌 방향
        adjustedPoint.x += reboundForce * Math.cos(angle); // 충돌 방향 반대로 이동
        adjustedPoint.y += reboundForce * Math.sin(angle);
      }
    });

    refinedPath.push(adjustedPoint);
  });

  // 경로를 다시 보간하여 부드럽게 만듦
  return generateUniformSpacing(refinedPath, maxPoints);
}

// 균일한 간격 생성 함수 (기존 함수)
function generateUniformSpacing(path, pointCount) {
  const uniformPath = [];
  const totalLength = calculatePathLength(path);
  const stepLength = totalLength / (pointCount - 1);

  let currentLength = 0;
  uniformPath.push(path[0]); // 시작점 추가

  for (let i = 1; i < pointCount - 1; i++) {
    currentLength += stepLength;
    const newPoint = interpolatePointAlongPath(path, currentLength);
    if (newPoint) uniformPath.push(newPoint);
  }

  uniformPath.push(path[path.length - 1]); // 끝점 추가
  return uniformPath;
}

// 경로의 총 길이 계산 (기존 함수)
function calculatePathLength(path) {
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    length += Math.sqrt(dx ** 2 + dy ** 2);
  }
  return length;
}

// 주어진 경로에서 특정 길이에 해당하는 점을 보간 (기존 함수)
function interpolatePointAlongPath(path, targetLength) {
  let accumulatedLength = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const segmentLength = Math.sqrt(dx ** 2 + dy ** 2);

    if (accumulatedLength + segmentLength >= targetLength) {
      const remainingLength = targetLength - accumulatedLength;
      const ratio = remainingLength / segmentLength;
      const x = path[i - 1].x + ratio * dx;
      const y = path[i - 1].y + ratio * dy;
      return { x, y };
    }

    accumulatedLength += segmentLength;
  }

  return null;
}




function handleCollisionAndSwitchLane(smoothedPath, movingCircles, thislanes, scene, reboundForce = 50, maxPoints = 30) {
  if (!smoothedPath || smoothedPath.length < 2 || !movingCircles || !thislanes || !scene) {
    console.warn("Invalid smoothedPath, movingCircles, thislanes, or scene data.");
    return smoothedPath;
  }

  // 중앙선 찾기
  const centralLane = thislanes.find((lane) => lane.isCentralLane);

  if (!centralLane) {
    //const config = {"Central lane not found in thislanes.");
    return smoothedPath;
  }

  // 경로의 총 길이를 계산
  const totalPathLength = calculatePathLength(smoothedPath);

  // movingCircles와의 평균 거리 계산
  const averageDistanceToCircles =
    movingCircles.length > 0
      ? movingCircles.reduce(
          (sum, circle) =>
            sum +
            Math.sqrt(
              (circle.x - smoothedPath[0].x) ** 2 +
              (circle.y - smoothedPath[0].y) ** 2
            ),
          0
        ) / movingCircles.length
      : Infinity;

  // 기본 차선 가중치 정의
  const laneWeights = {
    bottom: 0.5,                // 기본 가중치
    top: 0.01,                  // 기본 가중치
    outside: 0.7,               // 기본 가중치
    closest: 0.6,               // 가장 가까운 차선 가중치
    dynamicDistanceWeight: 0.1, // 경로 길이에 따라 동적으로 조정할 추가 가중치
    circleProximityWeight: 0.5, // movingCircles와의 거리 기반 추가 가중치 (짧을수록 높음)
  };

  // **전체 거리가 짧을수록 추가 가중치 계산**
  const distanceWeight =
        totalPathLength < 100
  ? laneWeights.dynamicDistanceWeight
  : totalPathLength < 200
  ? laneWeights.dynamicDistanceWeight / 2
  : 0;
  laneWeights.closest += distanceWeight;

  // **movingCircles와의 평균 거리 기반 추가 가중치 (짧을수록 가중치 증가)**
  const circleDistanceWeight =
        averageDistanceToCircles < 50
  ? laneWeights.circleProximityWeight // 가까운 경우 높은 가중치
  : averageDistanceToCircles < 100
  ? laneWeights.circleProximityWeight / 2 // 중간 거리에서 가중치 감소
  : 0; // 멀리 있는 경우 가중치 없음
  laneWeights.closest += circleDistanceWeight;


  const updatedPath = [smoothedPath[0]]; // 시작점 추가
  const step = Math.max(1, Math.floor((smoothedPath.length - 2) / (maxPoints - 2))); // 중간 지점 간격 계산

  for (let i = 1; i < smoothedPath.length - 1; i++) {
    if ((i - 1) % step !== 0 || updatedPath.length >= maxPoints - 1) continue; // 일정 간격으로 중간 좌표 선택

    let newPoint = { ...smoothedPath[i] }; // 중간 점 복사

    // 충돌 감지 및 처리
    movingCircles.forEach((enemy) => {
      const deltaX = newPoint.x - enemy.x;
      const deltaY = newPoint.y - enemy.y;
      const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

      // 충돌 감지
      if (distance < reboundForce) { // 충돌 반경
        const currentLane = thislanes.find((lane) => Math.abs(lane.y - newPoint.y) < 10);

        if (!currentLane) {
          console.warn("Current lane could not be determined.");
          return;
        }

        // 현재 차선을 제외한 대체 차선 선택
        const alternativeLanes = thislanes.filter((lane) => lane.y !== currentLane.y);

        if (alternativeLanes.length > 0) {
          // 가중치 기반 차선 선택
          const selectedLane = getWeightedRandomLane(alternativeLanes, laneWeights);

          if (selectedLane) {
            newPoint.y = selectedLane.y; // 대체 차선으로 이동
          } else {
            console.warn("No valid alternative lane selected.");
          }
        } else {
          console.warn("No alternative lanes available.");
        }
      }
    });

    updatedPath.push(newPoint); // 수정된 중간 좌표 추가
  }

  updatedPath.push(smoothedPath[smoothedPath.length - 1]); // 끝점 추가

  // 중간 점 간 간격을 균일하게 보정
  return generateUniformSpacing(updatedPath, maxPoints);
}

// 가중치 기반 랜덤 선택 함수
function getWeightedRandomLane(lanes, weights) {
  const weightedList = [];

  lanes.forEach((lane) => {
    const weight = weights[lane.position] || 0; // 가중치 적용
    for (let i = 0; i < weight * 100; i++) { // 가중치를 확률로 변환
      weightedList.push(lane);
    }
  });

  if (weightedList.length > 0) {
    const randomIndex = Math.floor(Math.random() * weightedList.length);
    return weightedList[randomIndex];
  }

  return null;
}

// 경로의 총 길이를 계산
function calculatePathLength(path) {
  let length = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    length += Math.sqrt(dx ** 2 + dy ** 2);
  }
  return length;
}

// 균일한 간격 생성 함수
function generateUniformSpacing(path, pointCount) {
  const uniformPath = [];
  const totalLength = calculatePathLength(path);
  const stepLength = totalLength / (pointCount - 1);

  let currentLength = 0;
  uniformPath.push(path[0]); // 시작점 추가

  for (let i = 1; i < pointCount - 1; i++) {
    currentLength += stepLength;
    const newPoint = interpolatePointAlongPath(path, currentLength);
    if (newPoint) uniformPath.push(newPoint);
  }

  uniformPath.push(path[path.length - 1]); // 끝점 추가
  return uniformPath;
}

// 주어진 경로에서 특정 길이에 해당하는 점을 보간
function interpolatePointAlongPath(path, targetLength) {
  let accumulatedLength = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const segmentLength = Math.sqrt(dx ** 2 + dy ** 2);

    if (accumulatedLength + segmentLength >= targetLength) {
      const remainingLength = targetLength - accumulatedLength;
      const ratio = remainingLength / segmentLength;
      const x = path[i - 1].x + ratio * dx;
      const y = path[i - 1].y + ratio * dy;
      return { x, y };
    }

    accumulatedLength += segmentLength;
  }

  return null;
}




function createTemporaryRectangles(smoothedPath, scene, color = 0x00ff00, duration = 500) {
  if (!smoothedPath || smoothedPath.length === 0) {
    console.warn("Smoothed path is empty or invalid.");
    return;
  }

  if (!scene || !scene.add) {
    //const config = {"Scene is not defined or invalid.");
    return;
  }

  smoothedPath.forEach((point) => {
    // 그래픽 생성
    const graphics = scene.add.graphics();
    graphics.lineStyle(2, color, 1); // 동적으로 전달된 색상 사용
    graphics.strokeRect(point.x - 5, point.y - 5, 10, 10); // 중심 기준 10x10 직사각형

    // 일정 시간 후 그래픽 제거
    scene.time.delayedCall(duration, () => {
      graphics.destroy();
    });
  });
}

/**
 * activeMovingBall의 그래픽을 그리는 함수
 * @param {Phaser.Scene} scene - Phaser 씬 객체
 * @param {Phaser.Physics.Arcade.Sprite} activeMovingBall - 이동하는 공
 * @param {number} radius - 공의 반지름 (기본값: 7.5)
 * @param {number} color - 공의 색상 (기본값: 0xffa500, 주황색)
 */
function drawActiveMovingBall(scene, activeMovingBall, radius = 7.5, color = 0xffa500) {
  // 기존 그래픽 객체가 없으면 새로 생성
  const graphics = activeMovingBall.graphics || scene.add.graphics();
  activeMovingBall.graphics = graphics;

  // 그래픽 초기화 및 공 그리기
  graphics.clear(); // 이전 그래픽 삭제
  graphics.fillStyle(color, 1); // 색상 설정
  graphics.fillCircle(activeMovingBall.x, activeMovingBall.y, radius); // 공 그리기
}

function moveActiveBallToClosestPoint(playerCircle, adjustedPath, pointCount = 25) {
  if (!adjustedPath || adjustedPath.length < 2) {
    console.warn("Adjusted path is too short or invalid.");
    return [];
  }

  // 새로운 경로 생성
  const adjustedCoordinates = [];

  // 시작점을 playerCircle로 설정
  const startPoint = { x: playerCircle.x, y: playerCircle.y };
  const endPoint = adjustedPath[adjustedPath.length - 1];

  // 시작점 추가
  adjustedCoordinates.push(startPoint);

  // 중간 좌표 생성
  const intermediatePoints = generateIntermediatePoints(startPoint, endPoint, pointCount);
  adjustedCoordinates.push(...intermediatePoints);

  // 끝점 추가
  adjustedCoordinates.push(endPoint);

  // 중간 좌표 생성 함수
  function generateIntermediatePoints(start, end, count) {
    const points = [];
    const deltaX = (end.x - start.x) / (count + 1); // X축 간격 계산
    const deltaY = (end.y - start.y) / (count + 1); // Y축 간격 계산

    for (let i = 1; i <= count; i++) {
      const x = start.x + deltaX * i; // 균일한 X 좌표 계산
      const y = start.y + deltaY * i; // 균일한 Y 좌표 계산
      points.push({ x, y });
    }

    return points;
  }

  return adjustedCoordinates;
}

function generateStraightPathWithConnections(activeMovingBall, thisresetZone, lanes, delta) {
  if (!lanes || lanes.length === 0) {
    console.warn("차선 데이터가 없습니다.");
    return;
  }

  if (!activeMovingBall || activeMovingBall.x == null || activeMovingBall.y == null) {
    console.warn("activeMovingBall의 좌표가 유효하지 않습니다.");
    return;
  }

  const startX = activeMovingBall.x;
  const startY = activeMovingBall.y;

  // 3번에서 5번 차선만 활성화
  const activeLanes = lanes.filter((lane) => lane.id >= 3 && lane.id <= 5);
  if (activeLanes.length === 0) {
    console.warn("활성화된 차선이 없습니다.");
    return;
  }

  const pathGraphics = game.scene.scenes[0].add.graphics();
  pathGraphics.lineStyle(2, 0xff00ff, 1); // 경로 색상: 자홍색

  const { topLeft, bottomRight } = thisresetZone;

  // 시작 위치와 가장 가까운 차선 선택
  let currentLane = activeLanes.find((lane) => Math.abs(lane.y - startY) <= 20);

  if (!currentLane) {
    currentLane = activeLanes.reduce((closest, lane) => {
      return Math.abs(lane.y - startY) < Math.abs(closest.y - startY) ? lane : closest;
    }, activeLanes[0]);
  }

  if (!currentLane) {
    //const config = {"시작 위치에 맞는 차선을 찾을 수 없습니다.");
    return;
  }

  const lanesWithPosition = determineLanePosition(lanes, { topLeft: thisresetZone.topLeft, bottomRight: thisresetZone.bottomRight });
  //console.log('lanesWithPosition', lanesWithPosition[currentLane.id]);

  //console.log('currentLane', currentLane);
  // 경로 설정
  const adjustedPath = [];
  adjustedPath.push({ x: startX, y: currentLane.y }); // 시작 지점

  // 마지막 지점을 x축으로 250만큼 이동
  const finalX = lanesWithPosition[currentLane.id].resetZone.x; // 경로의 길이를 조정하려면 이 값을 변경하세요.
  adjustedPath.push({ x: finalX + 35, y: currentLane.y }); // 마지막 지점 추가

  function determineLanePosition(lanes, resetZones) {
    const { topLeft, bottomRight } = resetZones; // resetZone 정보에서 가져오기

    lanes.forEach((lane) => {
      if (lane.y >= topLeft.y && lane.y <= topLeft.y + topLeft.height) {
        //console.log(`Lane ID: ${lane.id} is in the TOP zone`);
        lane.position = "top";
        lane.resetZone = topLeft;
      } else if (lane.y >= bottomRight.y && lane.y <= bottomRight.y + bottomRight.height) {
        //console.log(`Lane ID: ${lane.id} is in the BOTTOM zone`);
        lane.position = "bottom";
        lane.resetZone = bottomRight;
      } else {
        //console.log(`Lane ID: ${lane.id} is OUTSIDE reset zones`);
        lane.position = "outside";
      }
    });

    return lanes; // 각 lane의 위치 정보를 포함한 배열 반환
  }

  return adjustedPath;
}


function drawPath2(scene, path, lineColor = 0xff00ff, lineWidth = 2, clearAfter = 1000) {
  if (!scene || !path || path.length === 0) {
    console.warn("Scene or path is invalid.");
    return;
  }

  const pathGraphics = scene.add.graphics();
  pathGraphics.lineStyle(lineWidth, lineColor, 1);

  pathGraphics.beginPath();
  path.forEach((point, index) => {
    if (index === 0) {
      pathGraphics.moveTo(point.x, point.y);
    } else {
      pathGraphics.lineTo(point.x, point.y);
    }
  });
  pathGraphics.strokePath();

  if (clearAfter > 0) {
    setTimeout(() => {
      pathGraphics.clear();
      pathGraphics.destroy();
    }, clearAfter);
  }
}

let movingCount = 0;

function updateMovingPathBall(playerCircle, activeMovingBall, resetZones, adjustedPath, speed, delta) {
  if (!activeMovingBall || !adjustedPath || adjustedPath.length === 0 || !adjustedPath[movingCount]) {
    //const config = {"Invalid parameters passed to updateMovingPathBall");
    return;
  }

  const scene = game.scene.scenes[0];
  const currentIndex = movingCount === adjustedPath.length ? movingCount - 1 : movingCount;
  const target = adjustedPath[currentIndex];
  const targetX = target.x;
  const targetY = target.y;

  // 거리 및 유사도 계산
  const MAX_DISTANCE = 100;
  const distanceToPlayer = Math.sqrt((activeMovingBall.x - playerCircle.x) ** 2 + (activeMovingBall.y - playerCircle.y) ** 2);
  const distanceToTarget = Math.sqrt((activeMovingBall.x - target.x) ** 2 + (activeMovingBall.y - target.y) ** 2);

  const similarityToPlayer = Math.max(0, 100 - (distanceToPlayer / MAX_DISTANCE) * 100);
  const similarityToTarget = Math.max(0, 100 - (distanceToTarget / MAX_DISTANCE) * 100);
  const averageSimilarity = (similarityToPlayer + similarityToTarget) / 2;


  // 유사도 및 이동 카운트 증가 조건 확인
  if (
    similarityToTarget >= DEFAULT_VALUES.stableProbability &&
    similarityToPlayer >= DEFAULT_VALUES.SIMILARITY_THRESHOLD &&
    movingCount < adjustedPath.length
  ) {

    if (indexPathObject[0]?.score !== undefined) {
      //indexPathObject[0].score -= 1;
      // 맨 마지막 요소 제거
      indexPathObject.pop();
      movingCount++;
    }

    //console.log(`Average similarity meets threshold. Updated movingCount: ${movingCount}`);
    //console.log(`Updated indexPathObject:`, indexPathObject);

    scene.events.on("update", () => {
      const deltaX = targetX - activeMovingBall.x;
      const deltaY = targetY - activeMovingBall.y;
      const distanceToTarget = Math.sqrt(deltaX ** 2 + deltaY ** 2);

      if (distanceToTarget <= 1) {
        //console.log("Reached the end of the adjustedPath.");
        scene.events.off("update", arguments.callee);
        return;
      }

      const angle = Math.atan2(deltaY, deltaX);
      const moveDistance = Math.min(distanceToTarget, speed * (delta / 1000));
      activeMovingBall.x += Math.cos(angle) * moveDistance;
      activeMovingBall.y += Math.sin(angle) * moveDistance;

      const graphics = activeMovingBall.graphics || scene.add.graphics();
      activeMovingBall.graphics = graphics;
      graphics.clear();

      graphics.lineStyle(2, 0x00ff00, 1);
      graphics.beginPath();
      graphics.moveTo(activeMovingBall.x, activeMovingBall.y);
      graphics.lineTo(targetX, targetY);
      graphics.strokePath();

      graphics.fillStyle(0x0000ff, 1);
      graphics.fillCircle(activeMovingBall.x, activeMovingBall.y, 7.5);
    });
  } else if (
    movingCount >= adjustedPath.length - 1 &&
    similarityToTarget >= DEFAULT_VALUES.stableProbability &&
    similarityToPlayer >= DEFAULT_VALUES.SIMILARITY_THRESHOLD
  ) {
    console.log("All path points processed. Resetting movingCount and indexPathObject.");
  } else if (movingCount < adjustedPath.length) {
    
    
    scene.events.on("update", () => {
      const deltaX = targetX - activeMovingBall.x;
      const deltaY = targetY - activeMovingBall.y;
      const distanceToTarget = Math.sqrt(deltaX ** 2 + deltaY ** 2);

      if (distanceToTarget <= 1) {
        //console.log("Reached the end of the adjustedPath.");
        scene.events.off("update", arguments.callee);
        return;
      }

      const angle = Math.atan2(deltaY, deltaX);
      const moveDistance = Math.min(distanceToTarget, speed * (delta / 1000));
      activeMovingBall.x += Math.cos(angle) * moveDistance;
      activeMovingBall.y += Math.sin(angle) * moveDistance;

      const graphics = activeMovingBall.graphics || scene.add.graphics();
      activeMovingBall.graphics = graphics;
      graphics.clear();

      graphics.lineStyle(2, 0x00ff00, 1);
      graphics.beginPath();
      graphics.moveTo(activeMovingBall.x, activeMovingBall.y);
      graphics.lineTo(targetX, targetY);
      graphics.strokePath();

      graphics.fillStyle(0x0000ff, 1);
      graphics.fillCircle(activeMovingBall.x, activeMovingBall.y, 7.5);
    });
  }
}




// Function to reset positions of playerCircle and activeMovingBall
/**
 * Function to reset positions of playerCircle and activeMovingBall
 * when conditions are met:
 * - activeMovingBall's x <= -50
 * - playerCircle and activeMovingBall overlap (same position)
 * @param {Object} playerCircle - The player circle object.
 * @param {Object} activeMovingBall - The active moving ball object.
 * @param {Number} resetX - The X-coordinate to reset both objects to.
 * @param {Number} resetY - The Y-coordinate to reset both objects to (optional).
 */
function resetPositions(playerCircle, activeMovingBall, resetX = 0, resetY = null) {
  if (!playerCircle || !activeMovingBall) {
    console.warn("PlayerCircle or ActiveMovingBall is missing.");
    return;
  }

  // Explicitly set the positions
  activeMovingBall.x = resetX;
  playerCircle.x = resetX;

  // If resetY is provided, reset Y coordinates as well
  if (resetY !== null) {
    activeMovingBall.y = resetY;
    playerCircle.y = resetY;
  }

  console.log(
    //`Positions reset: PlayerCircle (${activeMovingBall.x}, ${activeMovingBall.y}, activeMovingBall ${activeMovingBall.x}, ${activeMovingBall.y})`
  );

  // Debugging: Check if values are updated correctly
  setTimeout(() => {
    console.log(
      //`Positions reset: PlayerCircle (${activeMovingBall.x}, ${activeMovingBall.y}, activeMovingBall ${activeMovingBall.x}, ${activeMovingBall.y})`
    );
  }, 100);
}

// Check for reset condition
function checkAndResetPositions(playerCircle, activeMovingBall, resetX = 0, resetY = null) {
  if (!activeMovingBall) return;

  // Calculate the distance between the two circles
  const distance = Math.sqrt(
    Math.pow(playerCircle.x - activeMovingBall.x, 2) +
    Math.pow(playerCircle.y - activeMovingBall.y, 2)
  );

  // Condition: activeMovingBall crosses x = -50 AND overlaps with playerCircle
  //console.log('activeMovingBall.x', activeMovingBall.x >= config.width-100 );
  //console.log('distance', distance <= 3);
  if (activeMovingBall.x >= config.width-50 && distance <= 1.5) {
    console.log("Reset condition met: activeMovingBall crossed x = -50 and overlaps with playerCircle.");
    resetPositions(playerCircle, activeMovingBall, resetX, resetY);
  }
}


function updateMovingBall(playerCircle, targetX, targetY, speed, delta) {
  if (!activeMovingBall) return; // If no ball, do nothing

  const ballRadius = 20; // Moving ball radius
  const targetRadius = 40; // Consider the radius of other circles
  const safetyMargin = 10; // Additional margin for collision safety

  // Calculate distance to the target
  const deltaX = targetX - activeMovingBall.x;
  const deltaY = targetY - activeMovingBall.y;
  const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

  // If the ball is close enough to the target, stop moving
  const stopDistance = ballRadius + safetyMargin; // Define how close the ball should be to stop
  if (distance <= stopDistance) {
    //console.log(`Ball reached target at (${targetX}, ${targetY}).`);
    return;
  }

  // Calculate angle to the target
  const angle = Math.atan2(deltaY, deltaX); // Radians

  // Generate possible angles for collision-free movement
  const possibleAngles = [angle, angle + Math.PI / 4, angle - Math.PI / 4];
  let safestAngle = angle;
  let isCollisionFree = true;

  for (const testAngle of possibleAngles) {
    const testX = activeMovingBall.x + Math.cos(testAngle) * speed * (delta / 1000);
    const testY = activeMovingBall.y + Math.sin(testAngle) * speed * (delta / 1000);

    isCollisionFree = true; // Assume no collision initially

    // Check for potential collisions
    for (const circle of movingCircles) {
      if (circle !== activeMovingBall) {
        const distanceToCircle = Math.sqrt(
          Math.pow(testX - circle.x, 2) + Math.pow(testY - circle.y, 2)
        );
        const combinedRadius = ballRadius + targetRadius + safetyMargin;

        if (distanceToCircle < combinedRadius) {
          isCollisionFree = false;
          break; // Collision detected; break out of the loop
        }
      }
    }

    if (isCollisionFree) {
      safestAngle = testAngle;
      break; // Stop checking once a collision-free angle is found
    }
  }

  // Calculate movement based on the safest angle
  const velocityX = Math.cos(safestAngle) * speed * (delta / 1000);
  const velocityY = Math.sin(safestAngle) * speed * (delta / 1000);

  activeMovingBall.x += velocityX;
  activeMovingBall.y += velocityY;

  // Draw paths
  const graphics = activeMovingBall.graphics;
  graphics.clear();

  // Path to the target
  graphics.lineStyle(2, 0xffff00, 1); // Yellow line for path
  graphics.beginPath();
  graphics.moveTo(activeMovingBall.x, activeMovingBall.y);
  graphics.lineTo(targetX, targetY); // Line to target
  graphics.strokePath();

  // Path to the player circle
  graphics.lineStyle(2, 0xff00ff, 1); // Magenta line for player connection
  graphics.beginPath();
  graphics.moveTo(activeMovingBall.x, activeMovingBall.y);
  graphics.lineTo(playerCircle.x, playerCircle.y); // Line to player circle
  graphics.strokePath();

  // Draw the moving ball
  graphics.fillStyle(0x00ff00, 1); // Green color
  graphics.fillCircle(activeMovingBall.x, activeMovingBall.y, ballRadius);

  console.log(
    //`Ball moving to (${targetX}, ${targetY}) at (${activeMovingBall.x}, ${activeMovingBall.y}) with safest angle ${safestAngle}.`
  );
}

function saveObjectWithSimilarityCheck(array, object, indexDataKey, obLength = 20) {
  // 배열 및 객체 유효성 검사
  if (!Array.isArray(array) || !array) {
    console.warn("Provided array parameter is not a valid array.");
    return;
  }

  if (typeof object !== "object" || object === null) {
    console.warn("Provided object parameter is not a valid object.");
    return;
  }

  // positionHistory 길이 확인
  const positionHistoryLength = Array.isArray(object.positionHistory)
    ? object.positionHistory.length
    : 0;

  if (positionHistoryLength === 0) {
    console.warn("Position history is missing or empty. Object not saved.");
    return;
  }

  // 유사도 계산 함수 (단순 계산 예시)
  function calculateSimilarity(key1, key2) {
    const maxLength = Math.max(key1.length, key2.length);
    let matches = 0;

    for (let i = 0; i < Math.min(key1.length, key2.length); i++) {
      if (key1[i] === key2[i]) matches++;
    }

    return (matches / maxLength) * 100;
  }

  // 기존 배열에서 유사도가 90% 이하인 항목 제거
  array = array.filter((item) => {
    const similarity = calculateSimilarity(item.indexDataKey, indexDataKey);
    if (similarity > 90) {
      return true;
    } else {
      console.warn(`Item with indexDataKey ${item.indexDataKey} removed due to low similarity (${similarity}%).`);
      return false;
    }
  });

  // 중복 데이터 검사
  const isDuplicate = array.some(
    (item) =>
      JSON.stringify(item.positionHistory) === JSON.stringify(object.positionHistory) &&
      item.indexDataKey === indexDataKey
  );

  if (isDuplicate) {
    console.warn("Duplicate object detected. Object not saved.");
    return;
  }

  // 점수 계산 (예시 점수 계산 방식)
  const totalDistance = object.positionHistory.reduce((distance, point, index, history) => {
    if (index === 0) return 0;
    const prevPoint = history[index - 1];
    const dx = point.x - prevPoint.x;
    const dy = point.y - prevPoint.y;
    return distance + Math.sqrt(dx ** 2 + dy ** 2);
  }, 0);

  const score =
    1000 +
    -object.crossedCentralCount * 5 + // 중앙선 교차 횟수 감소
    -object.crossedOutsideCount * 3 + // 외부 경계선 교차 횟수 감소
    -object.collidedCount * 10 + // 충돌 횟수 감소
    -object.laneChangeCount * 2 + // 차선 변경 감소
    (totalDistance < 50 ? 50 : 0); // 거리 기반 점수 추가

  // 새 객체 업데이트 및 추가
  const updatedObject = {
    ...object,
    indexDataKey, // indexDataKey 추가
    positionHistoryLength,
    totalDistance,
    score, // 점수 포함
  };

  array.push(updatedObject);

  // 배열 크기를 20개로 제한하고 점수 기준으로 정렬
  array.sort((a, b) => b.score - a.score); // 점수 내림차순 정렬

  if (array.length > obLength) {
    array = array.slice(0, obLength); // 가장 높은 점수의 20개만 유지
  }

  console.log("Object successfully saved with indexDataKey, score, and similarity check.");
  indexrefinedPath = array;
  indexScore = indexrefinedPath[0]?.score;
}

function saveObjectWithConstraints(array, object, obLength = 25, movingCircles) {
  // 배열 및 객체의 유효성 검사
  if (!Array.isArray(array) || !array) {
    //const config = {"Provided array parameter is not a valid array.");
    return;
  }

  if (typeof object !== "object" || object === null) {
    //const config = {"Provided object parameter is not a valid object.");
    return;
  }

  // positionHistory 길이 계산 (안전 검사 추가)
  const positionHistoryLength = Array.isArray(object.positionHistory)
    ? object.positionHistory.length
    : 0;

  if (positionHistoryLength === 0) {
    console.warn("Position history is missing or empty. Object not saved.");
    return;
  }

  // **중복 데이터 검사**
  const isDuplicate = array.some(
    (item) =>
      JSON.stringify(item.positionHistory) === JSON.stringify(object.positionHistory) &&
      item.score === object.score
  );

  if (isDuplicate) {
    console.warn("Duplicate object detected. Object not saved.");
    return;
  }

  // **positionHistory에서 총 거리 계산**
  const totalDistance = object.positionHistory.reduce((distance, point, index, history) => {
    if (index === 0) return 0; // 첫 번째 점에서는 거리가 없음
    const prevPoint = history[index - 1];
    const dx = point.x - prevPoint.x;
    const dy = point.y - prevPoint.y;
    return distance + Math.sqrt(dx ** 2 + dy ** 2);
  }, 0);

  // **경로와 movingCircles의 거리 기반 점수 계산**
  let movingCirclesBonus = 0;
  if (movingCircles && movingCircles.length > 0) {
    const allDistances = object.positionHistory.map((point) => {
      return Math.min(
        ...movingCircles.map((circle) => {
          const dx = point.x - circle.x;
          const dy = point.y - circle.y;
          return Math.sqrt(dx ** 2 + dy ** 2);
        })
      );
    });

    const minDistance = Math.min(...allDistances); // 경로에서 가장 가까운 movingCircle 거리
    const averageDistance = allDistances.reduce((sum, dist) => sum + dist, 0) / allDistances.length;

    // 경로 상에 movingCircles가 없을 경우 (가까운 거리에서 충돌 없음)
    if (minDistance > 50) {
      movingCirclesBonus =
        averageDistance > 150
          ? 100 // 평균 거리가 150 이상이면 보너스 증가
          : averageDistance > 100
          ? 50 // 평균 거리가 100~150 사이면 보너스
          : 20; // 평균 거리가 50~100 사이면 적은 보너스
    }
  }

  // **myArray에서 positionHistory 평균 길이 계산**
  const averageHistoryLength =
    array.length > 0
      ? array.reduce((sum, item) => sum + (item.positionHistoryLength || 0), 0) / array.length
      : 0;

  // **포인트 점수 계산 (movingCircles 보너스 포함)**
  const distanceBonus =
    totalDistance < 50
      ? 100
      : totalDistance < 100
      ? 50
      : 0;

  const score =
    1000 +
    -object.crossedCentralCount * 5 + // 중앙선 교차 횟수는 적을수록 점수 증가
    -object.crossedOutsideCount * 1 + // 외부선 교차 횟수는 적을수록 점수 증가
    -object.collidedCount * 8 + // 충돌 횟수가 적을수록 점수 증가
    -object.laneChangeCount * 1 + // 차선 변경 횟수는 적을수록 점수 증가
    distanceBonus + // 경로 거리 기반 추가 점수
    movingCirclesBonus; // movingCircles 거리 기반 추가 점수

  // 객체 업데이트
  const updatedObject = {
    ...object,
    positionHistoryLength, // positionHistory 길이 추가
    totalDistance, // 총 거리 추가
    movingCirclesBonus, // movingCircles 거리 보너스 추가
    score, // 최종 점수
  };

  // 기존 배열 정렬하여 가장 낮은 스코어 확인
  const lowestScore = array.length > 0 ? array[array.length - 1].score : -Infinity;

  // 새 객체의 스코어가 낮다면 저장하지 않음
  if (array.length >= obLength && score <= lowestScore) {
    console.warn(
      "New object score is lower than or equal to the lowest score in the array. Object not saved."
    );
    return;
  }

  // 배열 길이가 제한을 초과하면 가장 낮은 점수를 가진 객체 제거
  if (array.length >= obLength) {
    array.pop(); // 낮은 점수의 객체를 제거
  }

  array.push(updatedObject); // 새 객체 추가

  // 스코어 기준으로 배열 정렬 (내림차순)
  array.sort((a, b) => b.score - a.score);

  console.log("Object successfully saved to array.");
  
}


function calculateAndSortScores(dataArray, averageHistoryLength) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    console.warn("The input array is empty or invalid.");
    return [];
  }

  // 각 항목의 스코어 계산 및 추가
  dataArray.forEach((item) => {
    const positionHistoryLength = item.positionHistory ? item.positionHistory.length : 0;

    // 스코어 계산
    const score =
          (item.crossedCentralCount * 3) +
          (item.crossedOutsideCount * 2) +
          (item.laneChangeCount * 1) +
          (positionHistoryLength / averageHistoryLength);

    item.score = score; // 스코어를 item에 추가
  });

  // 스코어 기준으로 정렬
  dataArray.sort((a, b) => b.score - a.score);

  return dataArray; // 정렬된 배열 반환
}

// IndexedDB 초기화, 저장, 불러오기 및 데이터 처리
async function manageIndexData(scan, indexData, indexDataName, pathArr, thislanes, movingCircles, DEFAULT_VALUES) {
  try {
    // IndexedDB 초기화 
    const db = await initIndexedDB(indexDataName);

    // 고유 키 생성
    const key = indexData.length
    ? Number(
      indexData
      .filter(
        (data) => /*data.type === "player" &&*/ data.id < 50 || data.type === "enemy" && data.id < 50
      )
      .slice(0, 3) // 최대 3개의 항목만 처리
      .reduce((acc, data) => {
        const bitMax = data.bit_max_nb || 0;
        const bitMin = data.bit_min_nb || 0;
        return acc + (bitMax + bitMin);
      }, 0)
      .toFixed(10)
    )
    : "default_key";

    // type = "key" 데이터 추가
    indexDataKey = key;

    const savePromise = saveindexData(pathArr, key, indexDataName);
    const loadPromise = loadindexData(indexData, key, indexDataName);

    // 두 작업을 병렬로 실행
    const [saveResult, loadedData] = await Promise.all([savePromise, loadPromise]);
    //console.log("loadedData.data.length:", loadedData.data.length);
    //console.log("loadedData.data:", loadedData);

    // 데이터 로드 성공 여부 확인
    if (loadedData && loadedData.data && loadedData.data.length === 15) {

      saveObjectWithConstraints(indexPathObject, pathArr, DEFAULT_VALUES.approachCount, movingCircles)
      for(i = 0; i < loadedData.data.length; i++) {

        // 예시 사용법
        const result = checkPathForLaneViolationsAndLaneChanges(loadedData.data[i], thislanes, movingCircles, DEFAULT_VALUES);
        //console.log("Central line crossed count:", result.crossedCentralCount);
        //console.log("Outside boundary crossed count:", result.crossedOutsideCount);
        //console.log("Lane change count:", result.laneChangeCount);
        //console.log("updatedPath:", updatedPath);

        const pathArr2 = {
          bit_max_nb: BIT_MAX_NB(flattenPathTo1DArray(loadedData.data[i])),
          bit_min_nb: BIT_MIN_NB(flattenPathTo1DArray(loadedData.data[i])),
          crossedCentralCount: result.crossedCentralCount,
          crossedOutsideCount: result.crossedOutsideCount,
          laneChangeCount: result.laneChangeCount,
          collidedCount: result.collidedCount,
          positionHistory: loadedData.data[i]
        }

        //saveObjectWithConstraints(indexPathObject, pathArr2, DEFAULT_VALUES.approachCount, movingCircles)
        saveObjectWithSimilarityCheck(indexrefinedPath, pathArr2, key, DEFAULT_VALUES.approachCount);
        
        //console.log("Loaded Path loadedData.data.positionHistory:", loadedData.data[0]?.positionHistory);
      }
    } else {
      console.warn("No data loaded from IndexedDB.");
    }
  } catch (error) {
    //const config = {"IndexedDB operation failed:", error);
  }
}


function checkAndResetInZones(activeMovingBall, resetZones) {
  if (!activeMovingBall || !resetZones) {
    console.warn("Invalid parameters: activeMovingBall or resetZones missing.");
    return;
  }

  const { topLeft, bottomRight } = resetZones;

  // Check if the ball is in the bottom-right reset zone
  if (
    activeMovingBall.x >= bottomRight.x &&
    activeMovingBall.x <= bottomRight.x + bottomRight.width &&
    activeMovingBall.y >= bottomRight.y &&
    activeMovingBall.y <= bottomRight.y + bottomRight.height
  ) {
    console.log(
      `Entered bottom-right reset zone. Moving ball from (${activeMovingBall.x}, ${activeMovingBall.y}) to top-left zone (${topLeft.x}, ${topLeft.y}).`
    );
    activeMovingBall.x = topLeft.x;
    return;
  }

  // Check if the ball is in the top-left reset zone
  if (
    activeMovingBall.x >= topLeft.x &&
    activeMovingBall.x <= topLeft.x + topLeft.width &&
    activeMovingBall.y >= topLeft.y &&
    activeMovingBall.y <= topLeft.y + topLeft.height
  ) {
    console.log(
      `Entered top-left reset zone. Moving ball from (${activeMovingBall.x}, ${activeMovingBall.y}) to bottom-right zone (${bottomRight.x}, ${bottomRight.y}).`
    );
    activeMovingBall.x = bottomRight.x;
    return;
  }

  // If not in any reset zone, just log the current position
  console.log(
    //`Active moving ball is at (${activeMovingBall.x}, ${activeMovingBall.y}) and not in any reset zone.`
  );
}

function moveTowardsTarget(enemy, thislanes, indexData, speed = 2) {
  if (!enemy.graphics) {
    enemy.graphics = this.add.graphics();
    enemy.targetX = enemy.x; // 초기 끝점 X 좌표
    enemy.targetY = enemy.y; // 초기 끝점 Y 좌표
  }

  // ID로 `indexData` 매칭
  const matchedData = indexData.find((data) => data.id === enemy.id);
  if (!matchedData) {
    console.warn(`No matching data found for Enemy ${enemy.id}.`);
    return;
  }

  // 적의 현재 차선을 찾음
  const currentLane = thislanes.find((lane) => lane.y === enemy.y);
  if (!currentLane) {
    console.warn(`No matching lane found for Enemy ${enemy.id} at Y: ${enemy.y}`);
    return;
  }

  // `resetZone`가 유효한지 확인
  const resetZone = currentLane.resetZone;
  if (!resetZone || typeof resetZone.x === "undefined") {
    console.warn(`Invalid resetZone for lane ID: ${currentLane.id}`);
    return;
  }

  // 이동 방향 결정 (resetZone.x 기준)
  const direction = resetZone.x === 0 ? -1 : 1; // 좌측(0) = -1, 우측(>0) = 1

  // 목표 지점 설정
  const maxLineLength = 250; // 선 길이 제한
  const newTargetX = enemy.x + direction * 100; // 방향에 따라 X 좌표 설정
  const deltaX = newTargetX - enemy.x;
  const deltaY = enemy.targetY - enemy.y;
  let distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

  if (distance > maxLineLength) {
    const scale = maxLineLength / distance;
    enemy.targetX = enemy.x + deltaX * scale;
    enemy.targetY = enemy.y;
    distance = maxLineLength; // 제한된 거리로 설정
  } else {
    enemy.targetX = newTargetX;
    enemy.targetY = enemy.y;
  }

  // 그래픽 초기화
  //enemy.graphics.clear();
  enemy.graphics.lineStyle(2, 0xff0000, 1);
  enemy.graphics.beginPath();
  enemy.graphics.moveTo(enemy.x, enemy.y);
  enemy.graphics.lineTo(enemy.targetX, enemy.targetY);
  enemy.graphics.strokePath();

  // 적 이동
  if (distance > 1) {
    const normalizedX = deltaX / distance;
    const normalizedY = deltaY / distance;

    enemy.x += normalizedX * speed;
    enemy.y += normalizedY * speed;

    // 라벨 위치 업데이트
    if (enemy.label) {
      enemy.label.setPosition(enemy.x - 10, enemy.y - 10);
    }
  } else {
    // 목표 지점에 도달하면 새로운 목표 설정
    enemy.targetX = enemy.x + direction * 100;
    enemy.targetY = enemy.y;

    console.log(`Enemy ${enemy.id} reached target. New target: (${enemy.targetX}, ${enemy.targetY})`);
  }
}


// IndexedDB 초기화, 저장, 불러오기
async function manageindexData(scan, indexData, indexDataName) {
  try {
    // IndexedDB 초기화
    const db = await initIndexedDB(indexDataName);
    // 고유 키 생성
    const key = indexData.length
    ? Number(
      indexData
      .filter(
        (data) => /*data.type === "player" &&*/ data.id < 50 || data.type === "enemy" && data.id < 50
      )
      .slice(0, 3) // 최대 3개의 항목만 처리
      .reduce((acc, data) => {
        const bitMax = data.bit_max_nb || 0;
        const bitMin = data.bit_min_nb || 0;
        return acc + (bitMax + bitMin);
      }, 0)
      .toFixed(10)
    )
    : "default_key";


    // type = "key" 데이터 추가
    indexDataKey = key;

    // type = "key" 데이터 추가
    if(!indexData.id) {
      indexData.push({
        id: "key",
        type: "key",
        value: indexDataKey, // 생성된 고유 키 저장
        timestamp: Date.now(), // 추가적인 정보
      });
    }
    //console.log('key', key);
    
    
    // 저장 및 읽기 병렬 처리
    const savePromise = saveindexData(indexData, key, indexDataName);
    const loadPromise = loadindexData(indexData, key, indexDataName);

    // 두 작업을 병렬로 실행
    const [saveResult, loadedData] = await Promise.all([savePromise, loadPromise]);
    console.log('indexData', indexData);
    console.log('loadedData', loadedData);
    // 데이터 처리
    addDisappearingCircles(scan, loadedData.data);
  } catch (error) {
    //const config = {"IndexedDB 에러:", error);
  }
}

async function saveindexData(indexData, key, indexDataName) {
  try {
    // IndexedDB 초기화
    const db = await initIndexedDB(indexDataName);
    const transaction = db.transaction(indexDataName, "readwrite");
    const store = transaction.objectStore(indexDataName);

    //console.log('indexData', indexData);
    
    // 저장할 데이터 구성
    const dataToStore = {
      id: key, // 고유 키
      data: indexData, // indexData 배열 전체 저장
      timestamp: Date.now(), // 저장 시각 추가
    };

    return new Promise((resolve, reject) => {
      const request = store.put(dataToStore);

      // 저장 성공
      request.onsuccess = () => {
        //console.log(`indexData 저장 완료! Key: ${key}`);
        //console.log("저장된 데이터:", dataToStore);
        resolve(key); // key 반환
      };

      // 저장 실패
      request.onerror = (event) => {
        //const config = {"indexData 저장 실패:", event.target.error);
        reject(event.target.error); // 에러 발생 시 reject
      };

      // 트랜잭션 완료
      transaction.oncomplete = () => {
        //console.log("Transaction 완료.");
      };

      transaction.onerror = (event) => {
        //const config = {"Transaction 실패:", event.target.error);
        reject(event.target.error);
      };
    });
  } catch (error) {
    //const config = {"IndexedDB 에러:", error);
    throw error; // 상위 호출자로 에러 전달
  }
}

async function loadindexData(indexData, key, indexDataName, maxCount = 15) {
  const db = await initIndexedDB(indexDataName);
  const transaction = db.transaction(indexDataName, "readonly");
  const store = transaction.objectStore(indexDataName);

  return new Promise((resolve, reject) => {
    const request = key 
    ? store.get(key)  // 특정 키만 조회
    : store.getAll(); // 전체 데이터를 조회

    request.onsuccess = () => {
      const allData = key ? [request.result] : request.result;

      if (indexData && indexData.length > 0 && key) {
        let referenceKey = parseFloat(key.toFixed(10)); // 초기 기준 값
        const maxRetries = maxCount; // 최대 재시도 횟수
        const adjustmentFactor = Math.pow(10, -10); // 소수점 정밀도 조정
        let retries = 0;
        let filteredData = [];

        // 데이터 필터링 로직
        while (retries < maxRetries && filteredData.length < maxCount) {
          const lowerBound = referenceKey - adjustmentFactor * Math.pow(10, retries); // 범위 확대
          const upperBound = referenceKey + adjustmentFactor * Math.pow(10, retries); // 범위 확대

          const currentFilteredData = allData.filter(entry => {
            const storedKey = parseFloat(entry.id);
            return storedKey >= lowerBound && storedKey <= upperBound;
          });

          // 누적 방식으로 filteredData 업데이트
          filteredData = [...filteredData, ...currentFilteredData].slice(0, maxCount);

          if (filteredData.length >= maxCount) {
            console.log(
              //`Reference Key: ${referenceKey}, Lower Bound: ${lowerBound}, Upper Bound: ${upperBound}, Retrieved: ${filteredData.length}`
            );
            break;
          } else {
            console.log(
              //`Attempt ${retries + 1}: No sufficient data found. Expanding range. 
              //Reference Key: ${referenceKey}, Lower Bound: ${lowerBound}, Upper Bound: ${upperBound}, Retrieved: ${filteredData.length}`
            );
          }

          retries++;
        }


        // 결과 확인 및 반환
        if (filteredData.length === 0) {
          console.warn(`No data found after ${maxRetries} retries.`);
          resolve({ key: referenceKey, data: [], futureData: [] });
          return;
        }

        // 정렬된 데이터 반환
        const sortedData = filteredData.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        //console.log("Sorted data by timestamp:", sortedData);

        resolve({
          key: referenceKey,
          data: sortedData.map(entry => entry.data),
        });
      } else {
        // 조건 없이 모든 데이터 반환
        resolve({
          key: null,
          data: allData.map(entry => entry.data),
          futureData: [],
        });
      }
    };

    request.onerror = (event) => {
      //const config = {"Error loading data from IndexedDB:", event.target.error);
      reject(event.target.error);
    };
  });
}



function initIndexedDB(indexDataName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(indexDataName+" DataBase", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // "indexData" Object Store 생성 (keyPath는 "id")
      if (!db.objectStoreNames.contains(indexDataName)) {
        const indexDataStore = db.createObjectStore(indexDataName, {
          keyPath: "id",
          autoIncrement: true,
        });
        console.log('ObjectStore "indexData" created successfully.');

        // 인덱스 추가 (예: ID와 timestamp 기반 검색)
        indexDataStore.createIndex("id", "id", { unique: true });
        indexDataStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      // 다른 Object Store 필요 시 여기에 추가
      // if (!db.objectStoreNames.contains("otherStore")) {
      //   db.createObjectStore("otherStore", { keyPath: "key" });
      //   console.log('ObjectStore "otherStore" created successfully.');
      // }
    };

    request.onsuccess = (event) => {
      //console.log("IndexedDB initialized successfully.");
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      //const config = {"Failed to initialize IndexedDB:", event.target.error);
      reject(event.target.error);
    };

    request.onblocked = () => {
      console.warn("IndexedDB open request is blocked. Close other tabs using this database.");
    };
  });
}


// 전역 변수로 disappearingCircles 배열 생성
let disappearingCircles = [];

// 사라지는 원 추가 함수
function addDisappearingCircles(game, filteredData) {

  //console.log('disappearingCircles', disappearingCircles);
  if (!filteredData || !filteredData.length) {
    console.warn("No data provided for adding disappearing circles.");
    return;
  }
  customMaxScore = getRandomValue();
  filteredData.forEach((dataSet, dataSetIndex) => {
    dataSet.forEach((item, index) => {
      if (item.type === "enemy" && index < customMaxScore ) {
        // 사라지는 원 데이터 생성
        const disappearingCircle = {
          id: index+100, // 고유 ID 생성
          type: "enemy",
          x: Math.round(item.x),
          y: Math.round(item.y),
          positionHistory: item.positionHistory || [],
          moveDirection: item.moveDirection || "unknown",
          bit_max_nb: item.bit_max_nb || 0,
          bit_min_nb: item.bit_min_nb || 0,
          similarity_max: item.similarity_max ? Number(item.similarity_max).toFixed(2) : "0.00",
          similarity_min: item.similarity_min ? Number(item.similarity_min).toFixed(2) : "0.00",
          average_similarity: item.average_similarity ? Number(item.average_similarity).toFixed(2) : "0.00",
          player_nb_similarity: item.player_nb_similarity ? Number(item.player_nb_similarity).toFixed(2) : "0.00",
          stability: item.stability || "unknown",
          approachStage: item.approachStage || "unknown",
          approachProbability: item.approachProbability ? Number(item.approachProbability).toFixed(2) : "0.00",
          currentDistance: item.currentDistance ? Number(item.currentDistance).toFixed(2) : "0.00",
          distancePercentage: item.distancePercentage ? Number(item.distancePercentage).toFixed(2) : "0.00",
          stableProbability: item.stableProbability ? Number(item.stableProbability).toFixed(2) : "0.00",
          unstableProbability: item.unstableProbability ? Number(item.unstableProbability).toFixed(2) : "0.00",
          approachCount: item.approachCount || 0,
          totalDistanceChecks: item.totalDistanceChecks || 0,
        };

        // disappearingCircles 배열에 추가
        disappearingCircles.push(disappearingCircle);

        // Phaser 원 그리기
        const circleGraphic = game.add.graphics();// Phaser 원 그리기
        //console.log('item.stability', item.stability);
        // 상태에 따른 색상 및 투명도 결정
        let transparency = 0.5; // 기본 투명도

        if (item.stability === "Unstable") {
          circleGraphic.fillStyle(0xff0000, transparency); // 빨간색, 투명도 적용
        } else if (item.stability === "Stable") {
          circleGraphic.fillStyle(0x00ff00, transparency); // 초록색, 투명도 적용
        } else {
          circleGraphic.fillStyle(0x0000ff, transparency); // 파란색, 투명도 적용
        }

        // 원 그리기
        circleGraphic.fillCircle(disappearingCircle.x, disappearingCircle.y, 20);

        // 1초 후 제거
        setTimeout(() => {
          // 그래픽 제거
          circleGraphic.destroy();

          disappearingCircles = [];
          // disappearingCircles에서 제거
          const indexToRemove = disappearingCircles.findIndex(
            (circle) => circle.id === disappearingCircle.id
          );
          if (indexToRemove !== -1) {
            disappearingCircles.splice(indexToRemove, 1);
            console.log(`Disappearing circle removed:`, disappearingCircle);
          }
        }, 10);
      }
    });
  });
  return disappearingCircles;
}

// disappearingCircles 데이터를 indexData에 추가

function addDisappearingCirclesToindexData(indexData) {
  disappearingCircles.forEach((circle) => {
    // indexData 형식으로 변환하여 추가
    indexData.push({
      id: circle.id,
      type: circle.type,
      x: circle.x,
      y: circle.y,
      positionHistory: circle.positionHistory,
      moveDirection: circle.moveDirection,
      bit_max_nb: circle.bit_max_nb,
      bit_min_nb: circle.bit_min_nb,
      similarity_max: circle.similarity_max,
      similarity_min: circle.similarity_min,
      average_similarity: circle.average_similarity,
      player_nb_similarity: circle.player_nb_similarity,
      stability: circle.stability,
      approachStage: circle.approachStage,
      approachProbability: circle.approachProbability,
      currentDistance: circle.currentDistance,
      distancePercentage: circle.distancePercentage, 
      stableProbability: circle.stableProbability,
      unstableProbability: circle.unstableProbability,
      approachCount: circle.approachCount,
      totalDistanceChecks: circle.totalDistanceChecks,
    });
  });

  //console.log("Disappearing circles added to indexData:", indexData);
}

function processPlayerCollisions(scene, indexData) {
  const similarityThreshold = DEFAULT_VALUES.SIMILARITY_THRESHOLD; // Define the threshold for high similarity

  //console.log(`indexData`, indexData);
  //console.log(`High similarity detected: ${indexData[0].average_similarity}.`);

  // Check if the highest similarity exceeds the threshold
  if (indexData[0].average_similarity > similarityThreshold) {
    console.log(`Processing high similarity circle with ID: ${indexData[0].id}`);

    // Iterate through all moving circles
    movingCircles.forEach((enemy) => {
      if (indexData[0].id === enemy.id) {
        // Generate random velocity for the highly similar circle
        const randomAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const velocityX = Math.cos(randomAngle) * 300;
        const velocityY = Math.sin(randomAngle) * 300;

        // Apply random velocity
        enemy.setVelocity(velocityX, velocityY);

        // Default collision handling for other circles
        const deltaX = enemy.x - playerCircle.x;
        const deltaY = enemy.y - playerCircle.y;

        const magnitude = Math.sqrt(deltaX ** 2 + deltaY ** 2);
        if (magnitude === 0) return; // Prevent division by zero

        const normalizedX = deltaX / magnitude;
        const normalizedY = deltaY / magnitude;

        const baseSpeed = 300;
        const speedMultiplier = indexData[0].stability === "Stable" ? 2 : 1;
        const bounceSpeed = baseSpeed * speedMultiplier;

        enemy.setVelocity(normalizedX * bounceSpeed, normalizedY * bounceSpeed);

        console.log(`Enemy with ID: ${enemy.id} bounced randomly. Velocity: (${velocityX}, ${velocityY})`);
        return; // Skip further processing for this circle
      }
      console.log(`Default collision processed for ID: ${enemy.id}. Velocity: (${enemy.body.velocity.x}, ${enemy.body.velocity.y})`);
    });
  }
}

let activeMovingBall = null; // Track the single moving ball

function createMovingBall(playerCircle, targetX, targetY) {
  // Remove the existing moving ball, if any
  if (activeMovingBall) {
    activeMovingBall.graphics.clear(); // Clear graphics
    activeMovingBall.destroy(); // Destroy the physics sprite
    activeMovingBall = null; // Reset the reference
  }

  // Calculate angle to the target
  const deltaX = targetX - playerCircle.x;
  const deltaY = targetY - playerCircle.y;
  const angle = Math.atan2(deltaY, deltaX); // Radians

  // Small ball initial position (slightly ahead of the player)
  const ballX = playerCircle.x + Math.cos(angle) * 0;
  const ballY = playerCircle.y + Math.sin(angle) * 0;

  // Create the small ball
  activeMovingBall = playerCircle.scene.physics.add.sprite(ballX, ballY, null);
  activeMovingBall.setDisplaySize(15, 15); // 볼 크기를 줄임
  activeMovingBall.setCircle(7.5); // Physics circle 크기를 반영

  // Draw the ball
  activeMovingBall.graphics = playerCircle.scene.add.graphics();
  activeMovingBall.graphics.fillStyle(0xffa500, 1); // 주황색 (hex: #FFA500)
  activeMovingBall.graphics.fillCircle(activeMovingBall.x, activeMovingBall.y, 7.5); // 반지름에 맞게 크기 조정

  console.log(`Moving ball created at (${ballX}, ${ballY}) and pointing to (${targetX}, ${targetY}).`);

  return activeMovingBall;
}

function drawPath(graphics, startX, startY, endX, endY, color = 0xffff00, lineWidth = 2) {
  graphics.lineStyle(lineWidth, color, 1); // 선 스타일 설정
  graphics.beginPath();
  graphics.moveTo(startX, startY); // 시작 좌표
  graphics.lineTo(endX, endY); // 끝 좌표
  graphics.strokePath();

  //console.log(`Path drawn from (${startX}, ${startY}) to (${endX}, ${endY})`);
}

function updatePlayerCircleToFollowBall(playerCircle, movingBall, maxSpeed, speed, delta) {
  if (!movingBall) return; // 작은 원(movingBall)이 없으면 실행하지 않음

  // Calculate the direction to the moving ball
  const deltaX = movingBall.x - playerCircle.x;
  const deltaY = movingBall.y - playerCircle.y;
  const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

  // If the distance is small enough, stop moving
  if (distance < 1) {
    playerCircle.setVelocity(0, 0);
    return;
  }

  // 목표 지점으로 speed에 따라 이동
  const angle = Math.atan2(deltaY, deltaX);
  const moveDistance = Math.min(distance, speed * (delta / 1000)); // 이동 거리 제한
  const velocityX = Math.cos(angle) * moveDistance;
  const velocityY = Math.sin(angle) * moveDistance;

  // Update the player's position
  playerCircle.x += velocityX;
  playerCircle.y += velocityY;

  // Update the player's graphics position
  playerCircle.graphics.clear();
  playerCircle.graphics.fillStyle(0x00ff00, 1);
  playerCircle.graphics.fillCircle(playerCircle.x, playerCircle.y, 20);

  // Log for debugging
  console.log(
    //`Player circle moving towards (${movingBall.x}, ${movingBall.y}) at (${playerCircle.x.toFixed(2)}, ${playerCircle.y.toFixed(2)}), speed: ${speed.toFixed(2)}`
  );
}


function findNextStableTarget(indexData) {
  for (let i = 0; i < indexData.length; i++) {
    if (indexData[i].stability === "Stable") {
      return indexData[i]; // Return the first stable target
    }
  }
  return null; // No stable target found
}

async function runPrediction() {
  const bestCoordinate = await getBestCoordinate(indexData);
  //console.log("Best coordinate:", bestCoordinate);

  // Move the player to the predicted coordinate
  movePlayerToCoordinate(bestCoordinate.x, bestCoordinate.y);
}

function pointPlayerToCoordinate(targetX, targetY) {
  // Calculate the angle to the target in radians
  const deltaX = targetX - playerCircle.x;
  const deltaY = targetY - playerCircle.y;
  const angle = Math.atan2(deltaY, deltaX); // Radians

  // Convert radians to degrees
  const angleDegrees = Phaser.Math.RadToDeg(angle);

  // Rotate the player to face the target
  playerCircle.setRotation(angle);
  console.log(`Player now points to (${targetX}, ${targetY}) at ${angleDegrees} degrees.`);
}

async function getBestCoordinate(indexData) {
  // Train the model with the current indexData
  const model = await createAndTrainGameModel(indexData);

  // Predict scores for all coordinates
  const inputs = indexData.map((data) => [data.x, data.y]);
  const xs = tf.tensor2d(inputs, [inputs.length, 2]);
  const predictions = model.predict(xs);

  // Extract predicted scores
  const predictedScores = await predictions.data();

  // Find the index of the highest predicted score
  let bestIndex = 0;
  let bestScore = -Infinity;

  predictedScores.forEach((score, index) => {
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  // Return the coordinate with the highest score
  const bestCoordinate = indexData[bestIndex];
  //console.log("Best coordinate predicted:", bestCoordinate);
  return bestCoordinate;
}

async function createAndTrainGameModel(indexData) {
  // Extract inputs (x, y positions) and labels (scores)
  const inputs = indexData.map((data) => [data.x, data.y]); // x, y positions
  const labels = indexData.map((data) => data.score || 0); // Corresponding scores

  // Convert inputs and labels to tensors
  const xs = tf.tensor2d(inputs, [inputs.length, 2]); // Input: [x, y]
  const ys = tf.tensor2d(labels, [labels.length, 1]); // Labels: [score]

  // Define the model
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [2], units: 16, activation: "relu" }));
  model.add(tf.layers.dense({ units: 8, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1, activation: "linear" }));
  model.compile({ optimizer: "adam", loss: "meanSquaredError" });

  // Train the model
  await model.fit(xs, ys, { epochs: 50 });
  //console.log("Model trained successfully.");

  return model;
}

function calculateSimilarity(value1, value2) {
  // Calculate similarity as a percentage (closer values yield higher similarity)
  return 100 - Math.abs(value1 - value2) / Math.max(value1, value2) * 100;
}

let circleIdCounter = 0; // Counter for unique circle IDs

let count = 0;
let approachStageCount = 0;

function updateindexData() {
  // Calculate player's BIT_MAX_NB and BIT_MIN_NB
  if (!playerCircle.positionHistory) {
    playerCircle.positionHistory = [];
  }

  playerCircle = pushToPositionHistory(playerCircle, movingCircleslength, 5);

  const playerMax = BIT_MAX_NB(playerCircle.positionHistory);
  const playerMin = BIT_MIN_NB(playerCircle.positionHistory);

  // Update the positions of all objects (enemies) and calculate similarity
  indexData = movingCircles.map((circle) => {
    if (!circle.id) {
      // circle.id = ++circleIdCounter; // Assign a unique ID if not present
    }

    if (!circle.positionHistory) {
      circle.positionHistory = [];
    }

    // 안정성과 불안정 상태 횟수를 저장하는 변수 초기화
    if (!circle.stableCount) circle.stableCount = 0;
    if (!circle.unstableCount) circle.unstableCount = 0;

    // 위치 기록 업데이트
    circle.positionHistory.push(Math.round(circle.x), Math.round(circle.y));
    while (circle.positionHistory.length > movingCircleslength) {
      circle.positionHistory.shift();
      circle.positionHistory.shift();
    }

    // BIT_MAX_NB와 BIT_MIN_NB 계산
    const enemyMax = BIT_MAX_NB(circle.positionHistory);
    const enemyMin = BIT_MIN_NB(circle.positionHistory);

    // 플레이어와의 유사도 계산
    const similarityMax = calculateSimilarity(enemyMax, playerMax);
    const similarityMin = calculateSimilarity(enemyMin, playerMin);

    // 평균 유사도 계산
    const averageSimilarity = (similarityMax + similarityMin) / 2;

    // 상태와 색상 결정
    let stability;
    let color;
    if (enemyMax > enemyMin) {
      stability = "Stable";
      circle.stableCount++; // 안정적 상태 횟수 증가
      // 평균 유사도를 기반으로 녹색 강도 계산
      const greenIntensity = Math.floor((averageSimilarity / 100) * 255);
      color = Phaser.Display.Color.GetColor(0, greenIntensity, 0); // 녹색
    } else {
      stability = "Unstable";
      circle.unstableCount++; // 불안정 상태 횟수 증가
      // 평균 유사도를 기반으로 빨간색 강도 계산
      const redIntensity = Math.floor((averageSimilarity / 100) * 255);
      color = Phaser.Display.Color.GetColor(redIntensity, 0, 0); // 빨간색
    }

    // 원의 그래픽 업데이트
    circle.graphics.clear();
    circle.graphics.fillStyle(color, 1); // 투명도 없이 색상 설정
    circle.graphics.fillCircle(circle.x, circle.y, 20);

    // 확률 계산
    const totalStates = circle.stableCount + circle.unstableCount;
    const stableProbability = (circle.stableCount / totalStates) * 100;
    const unstableProbability = (circle.unstableCount / totalStates) * 100;

    if (!circle.previousDistance) {
      circle.previousDistance = Infinity; // 초기 이전 거리는 무한대로 설정
    }
    if (!circle.approachCount) {
      circle.approachCount = 0; // 가까워지는 상태 횟수 초기화
    }
    if (!circle.totalDistanceChecks) {
      circle.totalDistanceChecks = 0; // 거리 체크 횟수 초기화
    }

    // 플레이어 위치
    const playerX = playerCircle.x;
    const playerY = playerCircle.y;

    // 화면 크기에서 대각선 길이 계산 (최대 거리)
    const screenWidth = game.scale.width;  // Phaser 게임의 가로 크기
    const screenHeight = game.scale.height; // Phaser 게임의 세로 크기
    const maxDistance = Math.sqrt(
      Math.pow(screenWidth, 2) + Math.pow(screenHeight, 2)
    );

    // 현재 위치에서 플레이어와의 거리 계산
    const currentDistance = Math.sqrt(
      Math.pow(circle.x - playerX, 2) + Math.pow(circle.y - playerY, 2)
    );

    // 퍼센트로 변환 (0% ~ 100%)
    const distancePercentage = 100 - (currentDistance / maxDistance) * 100;

    // 결과 출력
    //console.log(`Distance to player: ${distancePercentage.toFixed(2)}%`);

    // 이전 거리와 비교하여 가까워졌는지 확인
    if (currentDistance < circle.previousDistance) {
      circle.approachCount++; // 가까워졌으면 횟수 증가
    }
    circle.totalDistanceChecks++; // 거리 체크 횟수 증가

    // 가까워지는 확률 계산
    const approachProbability =
          (circle.approachCount / circle.totalDistanceChecks) * 100;

    // 현재 거리를 이전 거리로 업데이트
    circle.previousDistance = currentDistance;

    // 단계 결정
    const approachStage = determineApproachStage(approachProbability);
    
    //충돌이 발생하면, 상태 초기화
    if(enemyCount > count) {

      if(approachStage === "매우 높은 접근 단계 (Very High Approach)") {

        approachStageCount+=5;
      }
      
      if(approachStage === "높은 접근 단계 (High Approach)") {

        approachStageCount+=4;
      }
      
      if(approachStage === "보통 접근 단계 (Moderate Approach)") {

        approachStageCount+=3;
      }
      
      if(approachStage === "낮은 접근 단계 (Low Approach") {

        approachStageCount+=2;
      }
      
      if(approachStage === "매우 낮은 접근 단계 (Very Low Approach)") {

        approachStageCount+=4;
      }
      
      count++;
    } else {

      if(approachStageCount === 0) {
        circle.approachCount = 0;
        circle.totalDistanceChecks = 0;
      }
      count = 0;
      approachStageCount = 0;
    }

    if (!circle.previousPosition) {
      circle.previousPosition = { x: circle.x, y: circle.y }; // 이전 위치 초기화
    }

    // 서클 이동 방향 계산
    const deltaX = circle.x - circle.previousPosition.x;
    const deltaY = circle.y - circle.previousPosition.y;

    // 이동 방향 각도 계산 (라디안 단위)
    const moveDirectionRadians = Math.atan2(deltaY, deltaX);

    // 이동 방향 각도 계산 (도 단위로 변환)
    const moveDirectionDegrees = moveDirectionRadians * (180 / Math.PI);

    // 서클의 이전 위치 업데이트
    circle.previousPosition = { x: circle.x, y: circle.y };

    // 이동 방향 각도 추가 (라디안 및 도 단위)
    //array.push(Number(moveDirectionRadians.toFixed(2))); // 라디안 값 추가
    circle.moveDirection = [];

    if (circle.moveDirection.length < movingCircleslength) {
      circle.moveDirection.push(Number(moveDirectionRadians.toFixed(2))); // 라디안 값 추가
      circle.moveDirection.push(Number(moveDirectionDegrees.toFixed(1))); // 도 단위 값 추가
    }

    while (circle.moveDirection.length > movingCircleslength) {
      circle.moveDirection.shift();
      circle.moveDirection.shift();
    }
    //console.log(`Move Direction (Radians): ${moveDirectionRadians}`);
    //console.log(`Move Direction (Degrees): ${moveDirectionDegrees}`);

    // 'indexData[0]'의 값 계산
    const indexDataSum = enemyMax + enemyMin;

    // 'player'의 값 계산
    const playerSum = playerMax + playerMin;

    // 유사도 계산 (단순 비율 비교)
    const player_nb_similarity = (Math.min(indexDataSum, playerSum) / Math.max(indexDataSum, playerSum)) * 100;

    return {
      id: circle.id, // 원의 고유 ID
      type: "enemy",
      x: Math.round(circle.x),
      y: Math.round(circle.y),
      positionHistory: circle.positionHistory,
      moveDirection: circle.moveDirection,
      bit_max_nb: enemyMax,
      bit_min_nb: enemyMin,
      similarity_max: similarityMax.toFixed(2),
      similarity_min: similarityMin.toFixed(2),
      average_similarity: averageSimilarity.toFixed(2),
      player_nb_similarity: player_nb_similarity.toFixed(2),
      stability: stability,
      approachStage: approachStage,
      approachProbability: approachProbability.toFixed(2), // 가까워지는 확률
      currentDistance: currentDistance.toFixed(2), // 현재 거리
      distancePercentage: distancePercentage.toFixed(5), 
      stableProbability: stableProbability.toFixed(2), // 안정적 확률
      unstableProbability: unstableProbability.toFixed(2), // 불안정 확률
      approachCount: circle.approachCount, 
      totalDistanceChecks: circle.totalDistanceChecks,
    };

    function determineApproachStage(approachProbability) {
      if (approachProbability >= 80) {
        return "매우 높은 접근 단계 (Very High Approach)";
      } else if (approachProbability >= 60) {
        return "높은 접근 단계 (High Approach)";
      } else if (approachProbability >= 40) {
        return "보통 접근 단계 (Moderate Approach)";
      } else if (approachProbability >= 20) {
        return "낮은 접근 단계 (Low Approach)";
      } else {
        return "매우 낮은 접근 단계 (Very Low Approach)";
      }
    }
  });

  addDisappearingCirclesToindexData(indexData, disappearingCircles);

  // Sort enemies by average similarity (highest first) and then by distance if needed
  // ID가 100 이하인 데이터만 필터링
  indexData = indexData.filter(item => item.id < 1000);

  // 정렬 로직
  indexData.sort((a, b) => {
    if (a.type === "enemy" && b.type === "enemy") {
      // 첫 번째 기준: average_similarity (내림차순)
      if (b.distancePercentage !== a.distancePercentage) {
        return b.distancePercentage - a.distancePercentage;
      }

      // 두 번째 기준: 플레이어와의 거리 (오름차순)
      let playerX = playerCircle.x;
      let playerY = playerCircle.y;

      if (!activeMovingBall) {
        playerX = activeMovingBall.x;
        playerY = activeMovingBall.y;
      }

      const distanceA = Math.sqrt(
        Math.pow(a.x - playerX, 2) + Math.pow(a.y - playerY, 2)
      );
      const distanceB = Math.sqrt(
        Math.pow(b.x - playerX, 2) + Math.pow(b.y - playerY, 2)
      );

      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }

      // 세 번째 기준: 원래 순서를 유지
      return indexData.indexOf(a) - indexData.indexOf(b);
    }

    // player와 score는 원래 순서 유지
    return 0;
  });

  // Add player's data
  indexData.push({
    type: "player",
    x: Math.round(playerCircle.x),
    y: Math.round(playerCircle.y),
    arr: playerCircle.positionHistory,
    bit_max_nb: playerMax,
    bit_min_nb: playerMin,
  });

  // Add score
  indexData.push({ type: "score", value: score });

  indexData = updateStateSummaryInindexData(indexData);
  //console.log("Updated indexData:", indexData);

  // Display game data in the logs
  const logElement = document.getElementById("logs");
  logElement.innerHTML = `<p>Game Data (Sorted by Similarity):</p><pre>${JSON.stringify(indexData, null, 2)}</pre>`;

  function updateStateSummaryInindexData(indexData) {
    let unstableCount = 0;
    let stableCount = 0;

    // 플레이어 데이터를 제외하고 상태를 집계
    indexData.forEach((item) => {
      if (item.type === "enemy") {
        if (item.stability === "Stable") {
          stableCount++;
        } else if (item.stability === "Unstable") {
          unstableCount++;
        }
      }
    });

    // stateSummary 객체 업데이트 또는 추가
    const existingSummaryIndex = indexData.findIndex(item => item.type === "stateSummary");

    if (existingSummaryIndex !== -1) {
      // 기존 stateSummary 객체 업데이트
      indexData[existingSummaryIndex] = {
        type: "stateSummary",
        unstableCount,
        stableCount,
      };
    } else {
      // 새로운 stateSummary 객체 추가
      indexData.push({
        type: "stateSummary",
        unstableCount,
        stableCount,
      });
    }

    return indexData;
  }
}

// 카운터 초기화
let pushCounter = 0;

// positionHistory에 특정 간격(interval)에 따라 푸시하는 함수
function pushToPositionHistory(playerCircle, movingCirclesLength, interval) {
  // 카운터 증가
  pushCounter++;

  // interval 간격에 따라 푸시
  if (pushCounter % interval === 0) {
    // 좌표를 정수로 반올림하여 저장
    playerCircle.positionHistory.push(
      Math.round(playerCircle.x), 
      Math.round(playerCircle.y)
    );

    // 배열 길이가 movingCirclesLength를 초과하면 초과된 요소 제거
    while (playerCircle.positionHistory.length > movingCirclesLength) {
      playerCircle.positionHistory.shift(); // 앞에서 두 개씩 제거
      playerCircle.positionHistory.shift();
    }
  }
  return playerCircle;
}

function handleBounce(circle, lanes) {
  if(!lanes) return;
  // 현재 차선 확인
  const currentLane = lanes.find((lane) => {
    const laneCenterY = lane.y;
    return Math.abs(circle.y - laneCenterY) < 25; // 근사치로 현재 차선을 확인
  });

  if (!currentLane) {
    console.warn("현재 차선을 찾을 수 없습니다.");
    return;
  }

  // 현재 차선에서 가장 가까운 다른 차선 선택
  const otherLanes = lanes.filter((lane) => lane !== currentLane); // 현재 차선을 제외
  if (otherLanes.length === 0) {
    console.warn("다른 차선이 없습니다.");
    return;
  }

  // 가장 가까운 차선 찾기
  const closestLane = Phaser.Utils.Array.GetRandom(
    otherLanes.sort((a, b) => Math.abs(a.y - circle.y) - Math.abs(b.y - circle.y))
  );

  // 새로운 차선으로 이동
  const newLaneY = closestLane.y;
  const newVelocityX = Phaser.Math.Between(-200, 200); // X 방향 속도 랜덤화
  const newDirection = Math.sign(newVelocityX); // X 방향의 진행 방향 (왼쪽: -1, 오른쪽: 1)

  circle.setVelocity(newVelocityX, 0); // X축으로만 이동 설정
  circle.y = newLaneY; // 새로운 차선의 Y 위치로 이동

  console.log(
    `Circle moved to lane Y: ${newLaneY}, with velocity X: ${newVelocityX}. Direction: ${newDirection > 0 ? "Right" : "Left"}`
  );
}


function handlePlayerCollision(enemy, indexData) {
  // Find the collided circle data in indexData
  const collidedCircleData = indexData.find((data) => data.id === enemy.id);

  if (!collidedCircleData) {
    console.warn("Collided circle data not found in indexData.");
    return;
  }

  // Check the stability of the collided circle
  if (collidedCircleData.stability === "Unstable") {
    console.log(`Collided with an unstable circle. -1000 points.`);
  } else if (collidedCircleData.stability === "Stable") {
    console.log(`Collided with a stable circle. +100 points.`);
  }

  // Calculate the collision vector
  const deltaX = enemy.x - playerCircle.x;
  const deltaY = enemy.y - playerCircle.y;

  // Calculate magnitude and normalize the vector
  const magnitude = Math.sqrt(deltaX ** 2 + deltaY ** 2);
  if (magnitude === 0) return; // Prevent division by zero

  const normalizedX = deltaX / magnitude;
  const normalizedY = deltaY / magnitude;

  // Calculate speedMultiplier based on similarity
  let speedMultiplier = 1; // Default multiplier
  if (collidedCircleData.similarity > 99.9) {
    speedMultiplier = 3; // Higher multiplier for high similarity
  } else if (collidedCircleData.stability === "Stable") {
    speedMultiplier = 2; // Normal multiplier for stable circles
  }

  // Apply bounce effect
  const baseSpeed = 300;
  const bounceSpeed = baseSpeed * speedMultiplier;

  enemy.setVelocity(normalizedX * bounceSpeed, normalizedY * bounceSpeed);

  // Optional: Log the velocity and similarity
  console.log(
    //`Collision handled! Velocity: (${enemy.body.velocity.x}, ${enemy.body.velocity.y}), Similarity: ${collidedCircleData.similarity}, Speed Multiplier: ${speedMultiplier}`
  );
}

function localScore(amount) {
  // Check if amount is a valid number
  if (isNaN(amount)) {
    //console.warn("Invalid score amount:", amount);
    return;
  }

  // Check if score is valid, reset if NaN
  if (isNaN(score)) {
    //console.warn("Score is NaN. Resetting to 0.");
    score = 0;
  }

  // Add or deduct score
  score += amount;

  // Prevent score from going negative
  if (score < 0) {
    score = 0;
  }

  // Save to local storage and update the UI
  saveScoreToLocalStorage(ScoreIndex, score);
  scoreText.setText(`Score: ${score}`); // Update the displayed score
}

function deductRedBallScore(points) {
  // Check if points is a valid number
  if (isNaN(points)) {
    //console.warn("Invalid points value:", points);
    return;
  }

  // Check if redBallScore is valid, reset if NaN
  if (isNaN(redBallScore)) {
    //console.warn("redBallScore is NaN. Resetting to 0.");
    redBallScore = 0;
  }

  // Update redBallScore
  redBallScore += points;

  // Prevent redBallScore from going below 0
  redBallScore = Math.max(0, redBallScore);

  // Update the displayed red ball score
  updateRedBallScoreDisplay();

  // Save redBallScore to local storage
  saveScoreToLocalStorage(redBallScoreIndex, redBallScore);
}

let previousPlayerState = { bit_max_nb: 0, bit_min_nb: 0 }; // To track previous bit values

function updateScore(indexData) {
  // Find the player data in indexData
  const playerData = indexData.find(data => data.type === "player");

  if (!playerData) {
    console.warn("Player data not found in indexData.");
    return;
  }

  // Extract current bit values
  const currentBitMaxNb = playerData.bit_max_nb;
  const currentBitMinNb = playerData.bit_min_nb;

  // Check if the bit values have changed
  const bitMaxChanged = currentBitMaxNb !== previousPlayerState.bit_max_nb;
  const bitMinChanged = currentBitMinNb !== previousPlayerState.bit_min_nb;

  // Update the score text
  scoreText.setText(`Score: ${score}`);

  // Save the current state for the next comparison
  previousPlayerState.bit_max_nb = currentBitMaxNb;
  previousPlayerState.bit_min_nb = currentBitMinNb;
}

function updateRedBallScoreDisplay() {
  redBallScoreText.setText(`Red Ball Score: ${redBallScore}`);
}

function saveScoreToLocalStorage(scoreKey, scoreValue) {
  try {
    localStorage.setItem(scoreKey, JSON.stringify(scoreValue));
    //console.log(`Score saved: ${scoreKey} = ${scoreValue}`);
  } catch (error) {
    //const config = {"Error saving score to local storage:", error);
  }
}

function loadScoreFromLocalStorage(scoreKey) {
  try {
    const storedScore = localStorage.getItem(scoreKey);
    if (storedScore !== null) {
      console.log(`Score loaded: ${scoreKey} = ${storedScore}`);
      return JSON.parse(storedScore); // Parse and return the stored score
    } else {
      console.log(`No score found for key: ${scoreKey}. Returning 0.`);
      return 0; // Default score if nothing is stored
    }
  } catch (error) {
    //const config = {"Error loading score from local storage:", error);
    return 0; // Return default score on error
  }
}

// 키보드 입력을 감지하여 변수 조작
function setupKeyInput(scene) {
  // 키보드 입력 설정
  const keys = scene.input.keyboard.addKeys({
    add: "PLUS", // + 키
    subtract: "MINUS" // - 키
  });

  // 매 프레임마다 키 상태를 확인
  scene.input.keyboard.on("keydown", (event) => {
    if (event.key === "+") {
      adjustCustomScore(1); // +1 증가
    } else if (event.key === "-") {
      adjustCustomScore(-1); // -1 감소
    }
  });
}

function indexCountgetText() {
  indexCountText.setText(`indexCount: ${indexCount}`);
  NBBallCountText.setText(`Custom Score: ${customScore}::${customMaxScore}`);
  safeThresHoldText.setText(`임계치 거리: ${DEFAULT_VALUES.safeThresHold}`);
  remainingTimeText.setText(`초기화 시간: ${remainingTime}`);
  pathScoreText.setText(`경로 포인트:  ${indexScore}`);

}

// 점수를 조정하는 함수
function adjustCustomScore(amount) {
  customScore += amount; // 변수 업데이트

  // 로컬 스토리지에 저장
  saveCustomScoreToLocalStorage(customScore);

  // 화면에 출력
  NBBallCountText.setText(`Custom Score: ${customScore}::${customMaxScore}`);
  console.log(`Custom Score Updated: ${customScore}`);
}

// 로컬 스토리지에 customScore 저장
function saveCustomScoreToLocalStorage(score) {
  try {
    localStorage.setItem("customScore", JSON.stringify(score));
    console.log(`Custom Score saved to localStorage: ${score}`);
  } catch (error) {
    //const config = {"Error saving customScore to localStorage:", error);
  }
}

// 로컬 스토리지에서 customScore 불러오기
function loadCustomScoreFromLocalStorage() {
  try {
    const storedScore = localStorage.getItem("customScore");
    if (storedScore === null) {
      console.log("No customScore found in localStorage. Defaulting to 1.");
      return 1; // 기본값 1 반환
    }
    return JSON.parse(storedScore); // 저장된 값을 반환
  } catch (error) {
    //const config = {"Error loading customScore from localStorage:", error);
    return 1; // 오류 발생 시 기본값 1 반환
  }
}

function getRandomValue() {
  // 0 ~ customScore 랜덤 값 생성, 소수점 두 자리까지 고정
  return Number((Math.random() * (customScore - 1) + 1).toFixed(2));
}


/**
 * URL의 파라미터를 읽어 자율주행 모드 여부를 반환
 * @returns {boolean} autoDrive 상태
 */
/**
 * URL의 파라미터를 읽어 자율주행 모드 여부를 반환
 * @returns {boolean} autoDrive 상태
 */
/**
 * URL의 파라미터를 읽어 자율주행 모드 여부를 반환
 * @returns {boolean} autoDrive 상태
 */
const threeMinuteCountdown = 180000; // 3분 (밀리초)
const resetZoneCountdown = 10000; // 10초 (밀리초)
let countdownInterval = null; // 인터벌을 추적하기 위한 변수
let remainingTime = 0;
let isThreeMinuteCountdownActive = false; // 3분 카운트다운 상태 추적
let isResetZoneCountdownActive = false; // 리셋 존 카운트다운 상태 추적

function getAllURLParameters() {
  const urlParams = new URLSearchParams(window.location.search);
  const params = {};
  for (const [key, value] of urlParams.entries()) {
    params[key] = value; // 키-값 쌍으로 객체에 저장
  }
  return params;
}

function isInsideResetZone(object, resetZone) {
  const bottomRight = resetZone.bottomRight;

  console.log("Debug: Calculated ResetZone boundaries:", bottomRight);

  return object.x > bottomRight.x && object.y > bottomRight.y;
}

function startCountdown(duration, onComplete) {
  if (countdownInterval) {
    clearInterval(countdownInterval); // 기존 카운트다운 종료
    console.log("Previous countdown stopped.");
  }

  remainingTime = duration / 1000; // 초 단위로 변환
  console.log(`Countdown started for ${remainingTime} seconds.`);
  
  countdownInterval = setInterval(() => {
    console.log(`Remaining time: ${remainingTime} seconds`);
    remainingTime -= 1;

    if (remainingTime <= 0) {
      clearInterval(countdownInterval); // 인터벌 중지
      countdownInterval = null; // 메모리 해제
      console.log("Countdown complete.");
      if (onComplete) onComplete(); // 완료 콜백 호출
    }
  }, 1000);
}

function reloadPage() {
  console.log("Reloading the page...");
  try {
    window.location.reload();
  } catch (error) {
    console.error("Error reloading the page:", error);
  }
}

function handleResetZone(playerCircle, activeMovingBall, lanes) {
  console.log("Debug: Initial lanes data:", lanes);
  console.log("Debug: PlayerCircle data:", playerCircle);
  console.log("Debug: ActiveMovingBall data:", activeMovingBall);

  // lanes가 단일 객체일 경우 배열로 변환
  if (!Array.isArray(lanes)) {
    console.log("Debug: lanes is not an array. Converting to array.");
    lanes = [lanes];
  }

  console.log("Debug: Converted lanes data:", lanes);

  lanes.forEach((lane, index) => {
    console.log(`Debug: Checking lane ${index}:`, lane);

    // PlayerCircle의 좌표 추출
    const playerX = playerCircle.x;
    const playerY = playerCircle.y;
    console.log(`Debug: PlayerCircle position: (${playerX}, ${playerY})`);

    // ActiveMovingBall의 좌표 추출
    const ballX = activeMovingBall.x;
    const ballY = activeMovingBall.y;
    console.log(`Debug: ActiveMovingBall position: (${ballX}, ${ballY})`);

    if (isInsideResetZone({ x: playerX, y: playerY }, lane) && !isResetZoneCountdownActive) {
      if (isInsideResetZone({ x: ballX, y: ballY }, lane) && !isResetZoneCountdownActive) {
        console.log(`Debug: ActiveMovingBall is in the reset zone of lane ${index}.`);
        initiateResetZoneCountdown();
      }
    }
  });
}

function initiateResetZoneCountdown() {
  if (isResetZoneCountdownActive) {
    console.log("Reset zone countdown already active. Skipping...");
    return;
  }

  console.log("Starting reset zone countdown.");
  isResetZoneCountdownActive = true;

  // 10초 카운트다운 시작
  startCountdown(resetZoneCountdown, () => {
    isResetZoneCountdownActive = false; // 카운트다운 종료 상태 업데이트
    reloadPage();
  });
}

function initiateThreeMinuteCountdown() {
  isThreeMinuteCountdownActive = true;
  startCountdown(threeMinuteCountdown, () => {
    isThreeMinuteCountdownActive = false; // 카운트다운 종료 상태 업데이트
    reloadPage();
  });
}

// 3초 후 게임 시작
setTimeout(() => {
  console.log("3 seconds passed. Checking AutoDrive mode...");
  const params = getAllURLParameters();

  if (params['autoDrive'] === 'true') {
    console.log("Starting the game in AutoDrive mode...");
    startGame();

    // 3분 카운트다운 시작
    initiateThreeMinuteCountdown();
  }
}, 3000);

// 주기적으로 리셋 존 및 AutoDrive 처리
setInterval(() => {
  const params = getAllURLParameters();
  if (params['autoDrive'] === 'true') {
    handleResetZone(playerCircle, activeMovingBall, thisresetZone);
  }
}, 3000);

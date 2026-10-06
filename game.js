// ======================================================
// 손위생 게임
// game.js
// ======================================================

// ------------------------------------------------------
// 0. Firebase 설정
// ------------------------------------------------------
//
// * 실제 프로젝트 키 값은 firebase-config.js 에서 관리합니다.
// * 버전(10.13.2)은 Firebase 웹 SDK 버전이며, 바꾸지 않아도 됩니다.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
    getFirestore,
    doc,
    runTransaction,
    collection,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ------------------------------------------------------
// 1. Canvas 설정
// ------------------------------------------------------

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let WIDTH = 1500;
let HEIGHT = 850;
let portraitMode = false;


// ------------------------------------------------------
// 2. 시작 화면 요소
// ------------------------------------------------------

const startScreen = document.getElementById("start-screen");
const employeeIdInput = document.getElementById("employee-id");
const departmentSelect = document.getElementById("department");
const startButton = document.getElementById("start-button");

const leaderboardButton = document.getElementById("leaderboard-button");
const leaderboardModal = document.getElementById("leaderboard-modal");
const leaderboardClose = document.getElementById("leaderboard-close");
const teamRankList = document.getElementById("team-rank-list");


// ------------------------------------------------------
// 3. 이전에 입력한 사번 불러오기
// ------------------------------------------------------

const savedEmployeeId = localStorage.getItem("employeeId");

if (savedEmployeeId) {
    employeeIdInput.value = savedEmployeeId;
}


// ------------------------------------------------------
// 4. 게임 기본 상태
// ------------------------------------------------------

let employeeId = "";
let department = "";

let score = 0;
let lives = 3;

// 현재 진행 중인 "상황"의 인덱스, 그리고 그 상황 안에서 몇 번째 질문인지
let currentSituationIndex = 0;
let currentStepIndex = 0;

// 상황 소개(제목 + 설명) 화면을 보여주는 중인지 여부
let showingIntro = false;

let timeLeft = 30;
let timerInterval = null;

let gameStarted = false;

// 이번 판 점수를 이미 서버에 저장했는지 (중복 저장 방지)
let scoreSaved = false;

// 현재 문제에서 오답을 선택했는지
let wrongAnswerShown = false;
let correctAnswerShown = false;

// ------------------------------------------------------
// 5. 버튼 위치
// ------------------------------------------------------

// 손위생 한다
const yesButton = {
    x: 150,
    y: 680,
    width: 550,
    height: 120
};

// 손위생 안 한다
const noButton = {
    x: 800,
    y: 680,
    width: 550,
    height: 120
};

// 상황 소개 화면의 "시작하기" 버튼
const introButton = {
    x: 550,
    y: 690,
    width: 400,
    height: 110
};

// 오답 설명 박스의 "확인" 버튼
const confirmButton = {
    x: 650,
    y: 400,
    width: 200,
    height: 70
};

function resizeCanvasForOrientation() {

    portraitMode = window.matchMedia("(orientation: portrait)").matches;
    WIDTH = portraitMode ? 850 : 1500;
    HEIGHT = portraitMode ? 1500 : 850;

    if (canvas.width !== WIDTH || canvas.height !== HEIGHT) {
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
    }

    if (portraitMode) {
        Object.assign(yesButton, { x: 80, y: 1135, width: 690, height: 125 });
        Object.assign(noButton, { x: 80, y: 1290, width: 690, height: 125 });
        Object.assign(introButton, { x: 225, y: 1030, width: 400, height: 105 });
        Object.assign(confirmButton, { x: 325, y: 875, width: 200, height: 75 });
    } else {
        Object.assign(yesButton, { x: 150, y: 680, width: 550, height: 120 });
        Object.assign(noButton, { x: 800, y: 680, width: 550, height: 120 });
        Object.assign(introButton, { x: 550, y: 690, width: 400, height: 110 });
        Object.assign(confirmButton, { x: 650, y: 400, width: 200, height: 70 });
    }

    if (gameStarted) {
        if (showingIntro) drawIntroScreen();
        else drawGame();
    }

}

window.addEventListener("resize", resizeCanvasForOrientation);
resizeCanvasForOrientation();


// ------------------------------------------------------
// 6. 부서별 문제 데이터
// ------------------------------------------------------
//
// * index.html의 <select id="department"> value(한글 부서명)를 key로 사용합니다.
// * 새 부서를 추가하려면 아래에 배열만 하나 더 추가하면 됩니다.
// * 이미지 파일은 "images/부서폴더명/xxx.png" 규칙으로 넣어주세요.
//   (부서마다 폴더를 따로 만들어 관리하면 편합니다)

// 각 부서는 "상황(situation)"의 배열입니다.
// 하나의 상황 = { title, description, steps }
//   - title, description : 상황이 시작될 때 한 번 보여주는 소개 화면
//   - steps : 그 상황 안에서 순서대로 진행되는 질문들 (한 환자를 만나는 동안의 흐름)
//
// 상황을 더 추가하고 싶으면 해당 부서 배열에 { title, description, steps } 객체를
// 이어서 추가하면 됩니다. (예: 두번째 상황, 세번째 상황 ...)

const scenariosByDepartment = {

    // ---------------- 병동 ----------------
    "병동": [
        {
            title: "첫번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "img/ward/01.png",
                    question: "환자 확인을 위해 팔찌를 확인하려고 환자를 접촉합니다. 손위생을 해야 할까요?",
                    answer: true,
                    explanation: "환자에게 접촉하기 전에는 손위생이 필요합니다.",
                    score: 10
                },
                {
                    image: "images/소아 중심정맥관 소독과 드레싱 관리.png",
                    question: "기존 드레싱을 제거하기 위해 청결장갑을 착용합니다. 손위생을 해야 할까요?",
                    answer: true,
                    explanation: "장갑을 착용하기 전에도 손위생이 필요합니다.",
                    score: 10
                },
                {
                    image: "images/멸균 드레싱 키트 준비하는 간호사.png",
                    question: "기존 드레싱을 제거한 후 새 드레싱을 위해 멸균장갑을 착용합니다. 손위생을 해야 할까요?",
                    answer: true,
                    explanation: "청결·무균 처치 전에 손위생을 실시해야 합니다.",
                    score: 10
                }
            ]
        }
        // 두번째 상황이 필요하면 여기에 이어서 추가하세요:
        // {
        //     title: "두번째 상황",
        //     description: "...",
        //     steps: [ { image, question, answer, explanation, score }, ... ]
        // }
    ],

    // ---------------- 중환자실 (예시 - 이미지/문항은 직접 교체해주세요) ----------------
    "중환자실": [
        {
            title: "첫번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "images/흉부 포트 소독과 바늘 삽입.png",
                    question: "인공호흡기 회로를 만지기 전, 손위생을 해야 할까요?",
                    answer: true,
                    explanation: "환자 주변 장비를 만지기 전에도 손위생이 필요합니다.",
                    score: 10
                }
            ]
        }
    ],

    // ---------------- 영상의학과 (예시) ----------------
    "영상의학과": [
        {
            title: "첫번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "images/차분한 병원 방사선 검사 이야기 (1).png",
                    question: "검사대에 환자를 눕히기 전, 손위생을 해야 할까요?",
                    answer: true,
                    explanation: "환자 접촉 전에는 손위생이 필요합니다.",
                    score: 10
                }
            ]
        }
    ],


    "재활치료실": [
        {
            title: "첫번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "img/01_01.jpg",
                    question: "환자 팔찌로 환자를 확인하기 전 손위생을 해야할까요?",
                    answer: true,
                    explanation: "환자 접촉 전에는 손위생이 필요합니다.",
                    score: 10
                },
                {
                    image: "img/01_02.jpg",
                    question: "치료매트로 이동해서 치료를 시작합니다. 추가로 손위생을 해야할까요?",
                    question: "[[강조]]손위생 후[[/강조]] 환자 확인을 시행했습니다.\n치료매트로 이동해서 치료를 시작합니다. \n추가로 손위생을 해야할까요?",
                    answer: false,
                    explanation: "환자 확인 전 손위생을 했다면, 추가로 손위생을할 필요가 없습니다.",
                    score: 10
                },
                {
                    image: "img/01_02.jpg",
                    question: "치료가 끝나 환자 치료를 종료하고 환자를 떠날 때, \n손위생을 해야할까요?",
                    answer: true,
                    explanation: "환자 접촉 후 손위생을 시행해야 합니다",
                    score: 10
                }
            ]
        },
        {
            title: "두번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "img/01_02.jpg",
                    question: "환자A 물리치료를 시작합니다. 시작 전 손위생을 해야할까요?",
                    answer: true,
                    explanation: "환자 접촉 전에는 손위생이 필요합니다.",
                    score: 10
                },
                {
                    image: "img/01_04.jpg",
                    question: "환자A 치료가 끝난 후 [[강조]]손위생을 한 다음[[/강조]] 환자B 치료 시작 전, 손위생을 또 해야할까요?",
                    answer: false,
                    explanation: "환자A 치료 후 [[강조]]손위생을 시행했다면[[/강조]] \n 환자A 환자접촉 후 + 환자B 환자접촉 전 \n손위생이 되어 추가로 손위생이 필요하지 않습니다",
                    score: 10
                }
            ]
        },
        {
            title: "세번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "img/01_02.jpg",
                    question: "환자A를 치료하고 있는 도중, \n환자B 접수하기 위해 떠납니다. 손위생을 해야할까요?",
                    answer: true,
                    explanation: "환자A를 접촉한 후이면서, 환자B 접촉 전입니다. 손위생이 필요합니다",
                    score: 10
                },
                {
                    image: "img/01_04.jpg",
                    question: "환자B 치료 기구를 적용한 후 \n환자A 치료를 위해 환자A에게 갑니다, \n 손위생을 또 해야할까요?",
                    answer: true,
                    explanation: "환자B를 접촉한 후이면서, 환자A 접촉 전입니다. 손위생이 필요합니다",
                    score: 10
                }
            ]
        },
        {
            title: "네번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "img/01_02.jpg",
                    question: "환자A를 치료하고 있는 도중, \n환자B 상태를 확인하기 위해 떠납니다. 손위생을 해야할까요?",
                    answer: true,
                    explanation: "환자A를 접촉한 후이면서, 환자B 접촉 전입니다. \n손위생이 필요합니다",
                    score: 10
                },
                {
                    image: "img/01_07.jpg",
                    question: "[[강조]]손위생을 한 후[[/강조]] 환자C 옆에 혈압계를 가지고 \n환자B 혈압을 측정합니다\n손위생을 해야할까요?",
                    answer: false,
                    explanation: "환자C 옆에있는 공용 의료기구는 환자영역이 아니기 때문에 \n만진 후 손위생은 필요없습니다.",
                    score: 10
                },
                {
                    image: "img/01_03.jpg",
                    question: "다시 환자A 치료를 진행합니다. \n치료 전 손위생을 해야할까요?",
                    answer: true,
                    explanation: "환자A를 접촉하기 전이기 때문에 손위생이 필요합니다.",
                    score: 10
                },
            ]
        }
    ],

    // ---------------- 처치전담팀 (예시) ----------------
    "처치전담팀": [
        {
            title: "첫번째 상황",
            description: "상황 설명을 듣고 손위생을 해야 하는지 선택해주세요.",
            steps: [
                {
                    image: "images/멸균 드레싱 키트 준비하는 간호사.png",
                    question: "채혈을 위해 장갑을 착용하기 전, 손위생을 해야 할까요?",
                    answer: true,
                    explanation: "장갑 착용 전에도 손위생이 필요합니다.",
                    score: 10
                }
            ]
        }
    ]

};

// 현재 플레이 중인 부서의 "상황" 배열 (게임 시작 시 채워짐)
let currentSituations = [];


// ------------------------------------------------------
// 6-1. 부서별 정원 및 최소 참여율 설정 (팀 순위 계산용)
// ------------------------------------------------------
//
// * 팀 순위를 "평균 점수 + 최소 참여율" 방식으로 매기기 위해
//   각 부서의 전체 인원(정원)이 필요합니다.
// * 아래 숫자를 실제 부서 인원수로 꼭 바꿔주세요.
//   (참여율 = 플레이한 사람 수 ÷ 여기 적은 정원)

const departmentHeadcount = {
    "B관 11병동": 26,
    "B관 13병동": 50,
    "A관 6병동": 50,
    "중환자실": 20,
    "영상의학과": 15,
    "재활치료실": 10,
    "처치전담팀": 8,
    "입원전담팀": 8,
    "응급실":41
};


// ------------------------------------------------------
// 7. 현재 문제의 배경 이미지
// ------------------------------------------------------

let currentBackground = new Image();


// ------------------------------------------------------
// 8. 게임 시작
// ------------------------------------------------------

startButton.addEventListener("click", () => {

    employeeId = employeeIdInput.value.trim();
    department = departmentSelect.value;

    // 사번 확인
    if (!employeeId) {
        alert("사번을 입력해주세요.");
        employeeIdInput.focus();
        return;
    }

    // 부서 확인
    if (!department) {
        alert("부서를 선택해주세요.");
        departmentSelect.focus();
        return;
    }

    // 사번 저장
    localStorage.setItem("employeeId", employeeId);

    // 선택한 부서의 시나리오 데이터 확인
    // 병동별 집계는 구분하되, 세 병동은 공통 "병동" 시나리오를 사용합니다.
    const wardDepartments = ["B관 11병동", "B관 13병동", "A관 6병동"];
    const scenarioKey = wardDepartments.includes(department) ? "병동" : department;
    const scenarios = scenariosByDepartment[scenarioKey];

    if (!scenarios || scenarios.length === 0) {
        alert("선택하신 부서의 시나리오가 아직 준비되지 않았습니다.");
        return;
    }

    // 사용자의 시작 버튼 동작에 맞춰 전체 화면과 가로 방향을 요청합니다.
    requestLandscapeFullscreen();

    startGame(scenarios);
});

function requestLandscapeFullscreen() {

    // 데스크톱에서는 전체 화면으로 강제 전환하지 않습니다.
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    const fullscreenRequest = document.documentElement.requestFullscreen?.();

    // 브라우저가 전체 화면 API를 지원하지 않으면 일반 화면으로 계속 진행합니다.
    if (!fullscreenRequest) return;

    fullscreenRequest
        .then(() => {
            if (screen.orientation?.lock) {
                return screen.orientation.lock("landscape");
            }
        })
        .catch((error) => {
            // 기기나 브라우저가 방향 잠금을 지원하지 않아도 게임은 계속 진행합니다.
            console.info("전체 화면 또는 가로 방향 잠금을 사용할 수 없습니다.", error);
        });

}


// ------------------------------------------------------
// 9. 게임 시작 함수
// ------------------------------------------------------

function startGame(scenarios) {

    gameStarted = true;

    currentSituations = scenarios;

    score = 0;
    lives = 3;
    currentSituationIndex = 0;
    wrongAnswerShown = false;
    correctAnswerShown = false;
    scoreSaved = false;

    // 시작 화면 숨기기
    startScreen.classList.add("hidden");

    // 첫 상황 소개부터 시작
    loadSituation();

}


// ------------------------------------------------------
// 9-1. 상황 소개 화면 불러오기
// ------------------------------------------------------

function loadSituation() {

    // 모든 상황을 다 끝냈다면 게임 종료
    if (currentSituationIndex >= currentSituations.length) {
        endGame();
        return;
    }

    clearInterval(timerInterval);

    currentStepIndex = 0;
    wrongAnswerShown = false;
    correctAnswerShown = false;

    // 상황 소개 화면 표시
    showingIntro = true;

    startIntroBoxAnimation();

}


// ------------------------------------------------------
// 10. 문제 불러오기
// ------------------------------------------------------

function loadQuestion() {

    const situation = currentSituations[currentSituationIndex];

    // 이 상황의 질문을 모두 끝냈다면 다음 상황으로 이동
    if (currentStepIndex >= situation.steps.length) {
        currentSituationIndex++;
        loadSituation();
        return;
    }

    const question = situation.steps[currentStepIndex];

    // 상태 초기화
    wrongAnswerShown = false;
    correctAnswerShown = false;

    timeLeft = 30;

    // 기존 타이머 제거
    clearInterval(timerInterval);

    // 배경 이미지 불러오기
    currentBackground = new Image();

    currentBackground.onload = () => {
        drawGame();
    };

    currentBackground.src = question.image;

    // 타이머 시작
    startTimer();

    // 말풍선/버튼이 새로 "나타나는" 효과 (배경 이미지가 같아도
    // 새 문제로 바뀐 게 분명하게 보이도록)
    startQuestionBoxAnimation();

}


// ------------------------------------------------------
// 11. 타이머
// ------------------------------------------------------

function startTimer() {

    clearInterval(timerInterval);

    timerInterval = setInterval(() => {

        timeLeft--;

        drawGame();

        if (timeLeft <= 0) {

            clearInterval(timerInterval);

            // 시간 초과도 오답 처리
            handleWrongAnswer("시간이 초과되었습니다.");

        }

    }, 1000);
}


// ------------------------------------------------------
// 12. Canvas에 게임 그리기
// ------------------------------------------------------

// 새 문제 등장 효과 진행도 (0 = 안 보임, 1 = 완전히 보임)
let questionBoxProgress = 1;

function drawGame() {

    // 상황 소개 화면을 보여줄 차례라면, 그것만 그리고 종료
    if (showingIntro) {
        drawIntroScreen();
        return;
    }

    // 배경
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    if (portraitMode) {
        ctx.fillStyle = "#eef4fb";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    // 이미지 경로가 잘못되어 로딩에 실패해도 게임 화면 전체가 멈추지 않게 합니다.
    if (currentBackground.complete && currentBackground.naturalWidth > 0) {

        if (portraitMode) {
            // 세로 화면에서는 그림을 독립된 카드에 원본 비율로 맞춰 표시합니다.
            const imageBox = { x: 35, y: 175, width: 780, height: 480 };
            ctx.save();
            ctx.fillStyle = "#ffffff";
            roundRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height, 28);
            ctx.fill();

            ctx.save();
            roundRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height, 28);
            ctx.clip();

            const scale = Math.min(
                imageBox.width / currentBackground.naturalWidth,
                imageBox.height / currentBackground.naturalHeight
            );
            const imageWidth = currentBackground.naturalWidth * scale;
            const imageHeight = currentBackground.naturalHeight * scale;
            ctx.drawImage(
                currentBackground,
                imageBox.x + (imageBox.width - imageWidth) / 2,
                imageBox.y + (imageBox.height - imageHeight) / 2,
                imageWidth,
                imageHeight
            );
            ctx.restore();

            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 5;
            roundRect(imageBox.x, imageBox.y, imageBox.width, imageBox.height, 28);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.drawImage(currentBackground, 0, 0, WIDTH, HEIGHT);
        }

    }


    // --------------------------------------------------
    // 상단 UI
    // --------------------------------------------------

    drawLives();
    drawScore();
    drawTimer();


    // --------------------------------------------------
    // 문제 말풍선 (새 문제가 나타날 때 옅게 나타나는 효과)
    // --------------------------------------------------
    //
    // * 배경 이미지가 이전 문제와 같아도, 말풍선이 새로 나타나는 게
    //   보이기 때문에 "새 문제로 바뀌었다"는 게 분명하게 느껴집니다.
    // * 버튼은 항상 고정된 자리에 그대로 떠 있습니다 (움직이지 않음).

    const eased = 1 - Math.pow(1 - questionBoxProgress, 3);

    ctx.save();
    ctx.globalAlpha = eased;

    drawQuestion();

    ctx.restore();


    // --------------------------------------------------
    // 선택 버튼
    // --------------------------------------------------

    drawAnswerButtons();


    // --------------------------------------------------
    // 오답 설명
    // --------------------------------------------------

    if (wrongAnswerShown) {
        drawWrongAnswer();
    }

    if (correctAnswerShown) {
        drawWrongAnswer(null, true);
    }

}


// ------------------------------------------------------
// 12-0. 새 문제 등장 애니메이션
// ------------------------------------------------------
//
// * loadQuestion()에서 새 문제를 불러올 때마다 호출합니다.
// * 인트로 박스 애니메이션과 같은 구조: 혹시 애니메이션이
//   중간에 멈추더라도 안전장치(setTimeout)가 강제로
//   "완전히 보이는 상태"로 되돌려 놓습니다.

let questionBoxFrameId = null;
let questionBoxFallbackTimer = null;

function startQuestionBoxAnimation(duration = 650) {

    if (questionBoxFrameId) {
        cancelAnimationFrame(questionBoxFrameId);
        questionBoxFrameId = null;
    }

    if (questionBoxFallbackTimer) {
        clearTimeout(questionBoxFallbackTimer);
        questionBoxFallbackTimer = null;
    }

    questionBoxProgress = 0;
    drawGame();

    const start = performance.now();

    function animate(now) {

        const elapsed = now - start;
        questionBoxProgress = Math.min(elapsed / duration, 1);

        drawGame();

        if (questionBoxProgress < 1) {
            questionBoxFrameId = requestAnimationFrame(animate);
        } else {
            questionBoxFrameId = null;
        }

    }

    questionBoxFrameId = requestAnimationFrame(animate);

    // 안전장치 (보험)
    questionBoxFallbackTimer = setTimeout(() => {

        questionBoxProgress = 1;
        drawGame();

        if (questionBoxFrameId) {
            cancelAnimationFrame(questionBoxFrameId);
            questionBoxFrameId = null;
        }

        questionBoxFallbackTimer = null;

    }, duration + 200);

}


// ------------------------------------------------------
// 12-1. 상황 소개 화면 (제목 + 상황 설명 + 시작하기 버튼)
// ------------------------------------------------------
//
// * 배경과 "1/3" 같은 카운터는 항상 즉시 그려집니다 (애니메이션 대상 아님).
//   그래서 아래쪽 흰색 설명창 애니메이션이 무슨 이유로든 중간에
//   멈추더라도, 화면이 완전히 하얗게 비어 보이는 일은 없습니다.
// * 흰색 설명창(제목+설명+버튼)만 옅게 시작해서 또렷해지며 "나타나는"
//   효과를 줍니다 (introBoxProgress: 0 = 안 보임, 1 = 완전히 보임).

let introBoxProgress = 1;

function drawIntroScreen() {

    const situation = currentSituations[currentSituationIndex];

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    ctx.save();

    // 배경 (즉시, 항상 그대로 보임)
    ctx.fillStyle = "#eef4fb";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.textAlign = "center";

    // 몇 번째 상황인지 (예: 1 / 3) - 즉시, 항상 그대로 보임
    ctx.fillStyle = "#1976d2";
    ctx.font = "bold 26px 'Noto Sans KR', sans-serif";
    ctx.fillText(
        `${currentSituationIndex + 1} / ${currentSituations.length}`,
        WIDTH / 2,
        140
    );

    // -------- 여기서부터 흰색 설명창: 옅게 나타나는 효과 적용 --------
    ctx.save();
    ctx.globalAlpha = introBoxProgress;

    // 흰색 카드
    ctx.fillStyle = "#ffffff";
    roundRect(
        portraitMode ? 40 : 300,
        portraitMode ? 350 : 190,
        portraitMode ? 770 : 900,
        portraitMode ? 790 : 470,
        35
    );
    ctx.fill();

    // 상황 제목 (예: 첫번째 상황)
    ctx.fillStyle = "#0d3b66";
    ctx.font = portraitMode
        ? "bold 48px 'Noto Sans KR', sans-serif"
        : "bold 56px 'Noto Sans KR', sans-serif";
    ctx.fillText(
        situation.title,
        WIDTH / 2,
        portraitMode ? 520 : 300
    );

    // 상황 설명
    ctx.fillStyle = "#333333";
    ctx.font = portraitMode
        ? "bold 29px 'Noto Sans KR', sans-serif"
        : "bold 30px 'Noto Sans KR', sans-serif";
    drawWrappedText(
        situation.description,
        WIDTH / 2,
        portraitMode ? 760 : 400,
        portraitMode ? 650 : 760,
        portraitMode ? 44 : 44
    );

    // 시작하기 버튼
    ctx.fillStyle = "#1498f5";
    roundRect(
        introButton.x,
        introButton.y,
        introButton.width,
        introButton.height,
        35
    );
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px 'Noto Sans KR', sans-serif";
    ctx.fillText(
        "시작하기",
        introButton.x + introButton.width / 2,
        introButton.y + 70
    );

    ctx.restore();
    // -------- 흰색 설명창 끝 --------

    ctx.restore();

}


// ------------------------------------------------------
// 12-2. 흰색 설명창 등장 애니메이션
// ------------------------------------------------------
//
// * requestAnimationFrame으로 introBoxProgress를 0 -> 1로 올리면서
//   매 프레임 drawIntroScreen()을 다시 그립니다.
// * 안전장치: 혹시라도 애니메이션이 끝까지 못 가더라도,
//   duration보다 살짝 긴 시간 뒤에 setTimeout이 강제로
//   "완전히 보이는 상태"로 되돌려 놓습니다. (예전처럼 화면이
//   하얗게 멈춰버리는 상황을 막기 위한 보험입니다)

let introBoxFrameId = null;
let introBoxFallbackTimer = null;

function startIntroBoxAnimation(duration = 300) {

    if (introBoxFrameId) {
        cancelAnimationFrame(introBoxFrameId);
        introBoxFrameId = null;
    }

    if (introBoxFallbackTimer) {
        clearTimeout(introBoxFallbackTimer);
        introBoxFallbackTimer = null;
    }

    introBoxProgress = 0;

    // 0%짜리 상태를 일단 바로 한 번 그려서, rAF 첫 틱을 기다리는 동안
    // 화면이 비어 보이지 않게 함 (배경+카운터는 이미 이 안에서 그려짐)
    drawIntroScreen();

    const start = performance.now();

    function animate(now) {

        const elapsed = now - start;
        introBoxProgress = Math.min(elapsed / duration, 1);

        drawIntroScreen();

        if (introBoxProgress < 1) {
            introBoxFrameId = requestAnimationFrame(animate);
        } else {
            introBoxFrameId = null;
        }

    }

    introBoxFrameId = requestAnimationFrame(animate);

    // 안전장치 (보험)
    introBoxFallbackTimer = setTimeout(() => {

        introBoxProgress = 1;
        drawIntroScreen();

        if (introBoxFrameId) {
            cancelAnimationFrame(introBoxFrameId);
            introBoxFrameId = null;
        }

        introBoxFallbackTimer = null;

    }, duration + 200);

}


// ------------------------------------------------------
// 13. 하트
// ------------------------------------------------------

function drawLives() {

    const startX = portraitMode ? 45 : 50;
    const startY = portraitMode ? 38 : 35;
    const spacing = portraitMode ? 58 : 65;

    for (let i = 0; i < 3; i++) {

        drawHeart(
            startX + i * spacing,
            startY,
            i < lives
        );

    }

}


// 간단한 하트 그리기
function drawHeart(x, y, active) {

    ctx.save();

    ctx.font = "48px Arial";

    ctx.fillStyle = active ? "#ff5b75" : "#c8c8c8";

    ctx.fillText("♥", x, y + 45);

    ctx.restore();

}


// ------------------------------------------------------
// 14. 점수
// ------------------------------------------------------

function drawScore() {

    ctx.save();

    ctx.fillStyle = "rgba(0, 102, 204, 0.95)";

    roundRect(
        portraitMode ? 590 : 1220,
        portraitMode ? 30 : 25,
        portraitMode ? 220 : 230,
        portraitMode ? 58 : 60,
        30
    );

    ctx.fill();

    ctx.fillStyle = "#f7f7f7";

    ctx.font = portraitMode ? "bold 22px Arial" : "bold 28px Arial";
    ctx.textAlign = "left";

    ctx.fillText(
        "SCORE",
        portraitMode ? 615 : 1260,
        portraitMode ? 67 : 64
    );

    ctx.font = portraitMode ? "bold 27px Arial" : "bold 32px Arial";

    ctx.fillText(
        score,
        portraitMode ? 735 : 1390,
        portraitMode ? 67 : 65
    );

    ctx.restore();

}


// ------------------------------------------------------
// 15. 타이머
// ------------------------------------------------------

function drawTimer() {

    ctx.save();

    ctx.fillStyle = "#fd0b0b";

    ctx.font = "bold 30px Arial";

    ctx.textAlign = "center";

    ctx.fillText(
        `⏱ ${timeLeft}`,
        WIDTH / 2,
        portraitMode ? 125 : 55
    );

    ctx.restore();

}


// ------------------------------------------------------
// 16. 문제 말풍선
// ------------------------------------------------------

function drawQuestion() {

    const question = currentSituations[currentSituationIndex].steps[currentStepIndex];

    ctx.save();

    // 새 문제가 나타날 때 질문 상자가 살짝 확대되어 전환이 눈에 띕니다.
    const scale = 0.96 + (0.04 * (1 - Math.pow(1 - questionBoxProgress, 3)));
    const questionCenterY = portraitMode ? 955 : 582;
    ctx.translate(WIDTH / 2, questionCenterY);
    ctx.scale(scale, scale);
    ctx.translate(-WIDTH / 2, -questionCenterY);

    // 반투명 흰색 박스
    ctx.fillStyle = "rgba(255,255,255,0.94)";

    roundRect(
        portraitMode ? 35 : 170,
        portraitMode ? 820 : 520,
        portraitMode ? 780 : 1160,
        portraitMode ? 270 : 125,
        30
    );

    ctx.fill();

    // 테두리
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;

    ctx.stroke();

    // 현재 상황 안에서의 문제 번호
    ctx.fillStyle = "#e7f3ff";
    roundRect(
        portraitMode ? 60 : 195,
        portraitMode ? 840 : 535,
        170,
        42,
        18
    );
    ctx.fill();

    ctx.fillStyle = "#1976d2";
    ctx.font = "bold 20px 'Noto Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
        `문제 ${currentStepIndex + 1} / ${currentSituations[currentSituationIndex].steps.length}`,
        portraitMode ? 145 : 280,
        portraitMode ? 868 : 563
    );

    // 질문
    ctx.fillStyle = "#222222";

    ctx.font = portraitMode
        ? "bold 31px 'Noto Sans KR', sans-serif"
        : "bold 35px 'Noto Sans KR', sans-serif";

    ctx.textAlign = "center";

    drawWrappedText(
        question.question,
        WIDTH / 2,
        portraitMode ? 965 : 592,
        portraitMode ? 700 : 760,
        portraitMode ? 42 : 38
    );

    ctx.restore();

}


// ------------------------------------------------------
// 17. 선택 버튼
// ------------------------------------------------------

function drawAnswerButtons() {

    // 손위생 한다
    ctx.save();

    ctx.fillStyle = "#1498f5";

    roundRect(
        yesButton.x,
        yesButton.y,
        yesButton.width,
        yesButton.height,
        35
    );

    ctx.fill();

    ctx.fillStyle = "#ffffff";

    ctx.font = "bold 32px 'Noto Sans KR', sans-serif";

    ctx.textAlign = "center";

    ctx.fillText(
        "✋  손위생 한다",
        yesButton.x + yesButton.width / 2,
        yesButton.y + 75
    );

    ctx.restore();


    // 손위생 안 한다
    ctx.save();

    ctx.fillStyle = "#777777";

    roundRect(
        noButton.x,
        noButton.y,
        noButton.width,
        noButton.height,
        35
    );

    ctx.fill();

    ctx.fillStyle = "#ffffff";

    ctx.font = "bold 32px 'Noto Sans KR', sans-serif";

    ctx.textAlign = "center";

    ctx.fillText(
        "✋  손위생 안 한다",
        noButton.x + noButton.width / 2,
        noButton.y + 75
    );

    ctx.restore();

}


// ------------------------------------------------------
// 18. 클릭 / 터치 처리
// ------------------------------------------------------

canvas.addEventListener("click", handleCanvasClick);

canvas.addEventListener("touchstart", handleCanvasTouch, {
    passive: false
});


function handleCanvasClick(event) {

    const rect = canvas.getBoundingClientRect();

    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;

    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    checkAnswer(x, y);

}


function handleCanvasTouch(event) {

    event.preventDefault();

    const touch = event.touches[0];

    const rect = canvas.getBoundingClientRect();

    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;

    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    checkAnswer(x, y);

}


// ------------------------------------------------------
// 19. 정답 선택
// ------------------------------------------------------

function checkAnswer(x, y) {

    if (!gameStarted) return;

    // 상황 소개 화면이라면, "시작하기" 버튼만 확인
    if (showingIntro) {

        if (isInsideButton(x, y, introButton)) {
            showingIntro = false;
            loadQuestion();
        }

        return;

    }

    // 오답 설명이 떠 있는 상태라면, "확인" 버튼만 반응
    if (wrongAnswerShown || correctAnswerShown) {

        if (isInsideButton(x, y, confirmButton)) {

            wrongAnswerShown = false;
            correctAnswerShown = false;

            // 하트를 모두 소진했다면 게임 종료
            if (lives <= 0) {
                endGame(true);
                return;
            }

            currentStepIndex++;
            loadQuestion();
        }

        return;

    }

    if (
        isInsideButton(x, y, yesButton)
    ) {

        submitAnswer(true);

    }

    else if (
        isInsideButton(x, y, noButton)
    ) {

        submitAnswer(false);

    }

}


// ------------------------------------------------------
// 20. 답변 판정
// ------------------------------------------------------

function submitAnswer(userAnswer) {

    const question = currentSituations[currentSituationIndex].steps[currentStepIndex];

    const isCorrect = userAnswer === question.answer;

    if (isCorrect) {

        handleCorrectAnswer();

    } else {

        handleWrongAnswer();

    }

}


// ------------------------------------------------------
// 21. 정답
// ------------------------------------------------------

function handleCorrectAnswer() {

    clearInterval(timerInterval);

    const question = currentSituations[currentSituationIndex].steps[currentStepIndex];

    score += question.score;
    correctAnswerShown = true;

    drawGame();

}


// ------------------------------------------------------
// 22. 오답
// ------------------------------------------------------

function handleWrongAnswer(customMessage = null) {

    clearInterval(timerInterval);

    // 하트(기회) 차감
    lives = Math.max(0, lives - 1);

    wrongAnswerShown = true;

    drawGame();

    drawWrongAnswer(customMessage);

}


// ------------------------------------------------------
// 23. 오답 설명
// ------------------------------------------------------

function drawWrongAnswer(customMessage = null, isCorrect = false) {

    const question = currentSituations[currentSituationIndex].steps[currentStepIndex];

    ctx.save();

    // 화면을 살짝 어둡게
    ctx.fillStyle = "rgba(0,0,0,0.25)";

    ctx.fillRect(
        0,
        0,
        WIDTH,
        HEIGHT
    );


    // 설명 박스
    ctx.fillStyle = "#ffffff";

    roundRect(
        portraitMode ? 40 : 250,
        portraitMode ? 500 : 170,
        portraitMode ? 770 : 1000,
        portraitMode ? 470 : 320,
        35
    );

    ctx.fill();


    // 제목
    ctx.fillStyle = isCorrect ? "#168447" : "#e53935";

    ctx.font = portraitMode
        ? "bold 36px 'Noto Sans KR', sans-serif"
        : "bold 38px 'Noto Sans KR', sans-serif";

    ctx.textAlign = "center";

    ctx.fillText(
        isCorrect ? "정답입니다!" : "틀렸습니다",
        WIDTH / 2,
        portraitMode ? 590 : 235
    );


    // 설명
    ctx.fillStyle = "#333333";

    ctx.font = portraitMode
        ? "bold 26px 'Noto Sans KR', sans-serif"
        : "bold 27px 'Noto Sans KR', sans-serif";

    drawWrappedText(
        customMessage || question.explanation,
        portraitMode ? 90 : 325,
        portraitMode ? 700 : 300,
        portraitMode ? 660 : 850,
        portraitMode ? 42 : 40,
        "left"
    );


    // 확인 버튼
    ctx.fillStyle = isCorrect ? "#168447" : "#1976d2";

    roundRect(
        confirmButton.x,
        confirmButton.y,
        confirmButton.width,
        confirmButton.height,
        30
    );

    ctx.fill();

    ctx.fillStyle = "#ffffff";

    ctx.font = "bold 28px 'Noto Sans KR', sans-serif";

    ctx.fillText(
        isCorrect ? "다음 문제" : "확인",
        confirmButton.x + confirmButton.width / 2,
        confirmButton.y + 46
    );

    ctx.restore();

}


// ------------------------------------------------------
// 24. 버튼 안에 클릭했는지 확인
// ------------------------------------------------------

function isInsideButton(x, y, button) {

    return (
        x >= button.x &&
        x <= button.x + button.width &&
        y >= button.y &&
        y <= button.y + button.height
    );

}


// ------------------------------------------------------
// 25. 게임 종료
// ------------------------------------------------------

function endGame(gameOver = false) {

    gameStarted = false;

    clearInterval(timerInterval);

    // 최종 점수를 Firebase에 저장 (중복 저장 방지)
    // gameOver === true  → 하트를 다 잃어서 중간에 끝남 (완주 아님)
    // gameOver === false → 모든 상황을 끝까지 마침 (완주)
    if (!scoreSaved) {
        scoreSaved = true;
        saveScoreToFirebase(employeeId, department, score, !gameOver);
    }

    ctx.clearRect(
        0,
        0,
        WIDTH,
        HEIGHT
    );

    ctx.fillStyle = "rgba(255,255,255,0.95)";

    ctx.fillRect(
        0,
        0,
        WIDTH,
        HEIGHT
    );


    ctx.fillStyle = "#1976d2";

    ctx.font = "bold 50px 'Noto Sans KR', sans-serif";

    ctx.textAlign = "center";

    ctx.fillText(
        gameOver ? "하트를 모두 소진했습니다" : "게임이 끝났습니다!",
        WIDTH / 2,
        portraitMode ? 700 : 330
    );


    ctx.fillStyle = "#333333";

    ctx.font = "bold 38px 'Noto Sans KR', sans-serif";

    ctx.fillText(
        `최종 점수 : ${score}점`,
        WIDTH / 2,
        portraitMode ? 790 : 410
    );

}


// ------------------------------------------------------
// 26. 둥근 사각형
// ------------------------------------------------------

function roundRect(x, y, width, height, radius) {

    ctx.beginPath();

    ctx.moveTo(x + radius, y);

    ctx.lineTo(x + width - radius, y);

    ctx.quadraticCurveTo(
        x + width,
        y,
        x + width,
        y + radius
    );

    ctx.lineTo(
        x + width,
        y + height - radius
    );

    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - radius,
        y + height
    );

    ctx.lineTo(
        x + radius,
        y + height
    );

    ctx.quadraticCurveTo(
        x,
        y + height,
        x,
        y + height - radius
    );

    ctx.lineTo(
        x,
        y + radius
    );

    ctx.quadraticCurveTo(
        x,
        y,
        x + radius,
        y
    );

    ctx.closePath();

}


// ------------------------------------------------------
// 27. 여러 줄 텍스트
// ------------------------------------------------------

function drawWrappedText(text, x, y, maxWidth, lineHeight, align = "center") {

    // 해설 문장에 [[강조]]중요한 말[[/강조]]를 쓰면 해당 부분을 주황색으로 표시합니다.
    const segments = [];
    const marker = /\[\[강조\]\]([\s\S]*?)\[\[\/강조\]\]/g;
    let cursor = 0;
    let match;

    while ((match = marker.exec(text)) !== null) {
        if (match.index > cursor) {
            segments.push({ text: text.slice(cursor, match.index), emphasized: false });
        }
        segments.push({ text: match[1], emphasized: true });
        cursor = marker.lastIndex;
    }

    if (cursor < text.length || segments.length === 0) {
        segments.push({ text: text.slice(cursor), emphasized: false });
    }

    const characters = segments.flatMap((segment) =>
        Array.from(segment.text, (character) => ({
            character,
            emphasized: segment.emphasized
        }))
    );

    const lines = [];
    let line = [];

    characters.forEach((item) => {
        if (item.character === "\n") {
            lines.push(line);
            line = [];
            return;
        }

        const candidate = line.map((part) => part.character).join("") + item.character;

        if (ctx.measureText(candidate).width > maxWidth && line.length > 0) {
            lines.push(line);
            line = [item];
        } else {
            line.push(item);
        }
    });

    lines.push(line);

    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    const originalFillStyle = ctx.fillStyle;
    const originalTextAlign = ctx.textAlign;
    ctx.textAlign = "left";

    lines.forEach((lineItems, lineIndex) => {
        const runs = [];

        lineItems.forEach((item) => {
            const previousRun = runs[runs.length - 1];
            if (previousRun && previousRun.emphasized === item.emphasized) {
                previousRun.text += item.character;
            } else {
                runs.push({ text: item.character, emphasized: item.emphasized });
            }
        });

        const lineWidth = runs.reduce((width, run) =>
            width + ctx.measureText(run.text).width, 0);
        let drawX = align === "left" ? x : x - lineWidth / 2;

        runs.forEach((run) => {
            ctx.fillStyle = run.emphasized ? "#d84315" : originalFillStyle;
            ctx.fillText(run.text, drawX, startY + lineIndex * lineHeight);
            drawX += ctx.measureText(run.text).width;
        });
    });

    ctx.fillStyle = originalFillStyle;
    ctx.textAlign = originalTextAlign;

}

// ------------------------------------------------------
// 28. Firebase 점수 저장
// ------------------------------------------------------
//
// player_scores 컬렉션에 사번(employeeId)을 문서 ID로 저장합니다.
// - bestScore : 이전 최고 점수보다 높을 때만 갱신 (재도전으로 팀 평균이
//   낮아지지 않도록)
// - completed : 그 부서의 모든 상황(시나리오)을 하트를 다 잃지 않고
//   끝까지 마친 적이 "한 번이라도" 있으면 true. 한 번 true가 되면
//   이후에 실패해도 다시 false로 되돌리지 않습니다. (완주율 집계용)

async function saveScoreToFirebase(employeeId, department, score, completed) {

    if (!employeeId || !department) return;

    try {

        const scoreRef = doc(db, "player_scores", String(employeeId));

        await runTransaction(db, async (transaction) => {

            const snap = await transaction.get(scoreRef);

            const prevBest = snap.exists() ? snap.data().bestScore : -1;
            const prevCompleted = snap.exists() ? !!snap.data().completed : false;

            const newBest = Math.max(prevBest, score);
            const newCompleted = prevCompleted || completed;

            // 점수도 안 오르고, 완주 상태도 그대로면 굳이 쓰지 않음
            if (newBest === prevBest && newCompleted === prevCompleted) {
                return;
            }

            transaction.set(scoreRef, {
                employeeId: String(employeeId),
                department: department,
                bestScore: newBest,
                completed: newCompleted,
                updatedAt: serverTimestamp()
            });

        });

    } catch (err) {
        // 네트워크 오류 등으로 저장에 실패해도 게임 자체는 계속 진행되도록
        // 콘솔에만 로그를 남깁니다.
        console.error("점수 저장 실패:", err);
    }

}


// ------------------------------------------------------
// 29. 실시간 팀(부서) 순위
// ------------------------------------------------------

// player_scores 전체를 실시간 구독 중인지 여부 (구독 해제용)
let leaderboardUnsubscribe = null;

// 부서 이름 -> "완주율(정원 대비)" 1순위, 평균 점수 2순위로 정렬해서 화면에 그림
//
// * 이 게임의 목적은 "부서원 전원이 그 부서 시나리오를 숙지하는 것"이라서,
//   순위는 참여자 수가 아니라 부서 전체 인원(departmentHeadcount) 대비
//   완주(completed=true)한 사람 수 비율을 1순위 기준으로 삼습니다.
// * 완주율이 같으면 평균 점수로 2차 정렬합니다.
// * 아직 아무도 안 한 부서도 0%로 목록에 그대로 나타나서,
//   "우리 부서는 아직 시작도 안 했다"는 걸 바로 알 수 있게 했습니다.
function renderTeamLeaderboard(allScores) {

    const teamStats = {};

    // 정원이 등록된 부서는 참여자가 0명이어도 목록에 나오도록 미리 만들어둠
    Object.keys(departmentHeadcount).forEach((dept) => {
        teamStats[dept] = { total: 0, participants: 0, passCount: 0 };
    });

    allScores.forEach((data) => {
        const dept = data.department || "미지정";
        const best = typeof data.bestScore === "number" ? data.bestScore : 0;
        const completed = !!data.completed;

        if (!teamStats[dept]) {
            teamStats[dept] = { total: 0, participants: 0, passCount: 0 };
        }

        teamStats[dept].total += best;
        teamStats[dept].participants += 1;

        if (completed) {
            teamStats[dept].passCount += 1;
        }
    });

    const entries = Object.entries(teamStats).map(([dept, stat]) => {

        const headcount = departmentHeadcount[dept] || stat.participants || 1;
        const passRate = stat.passCount / headcount;
        const average = stat.participants > 0 ? stat.total / stat.participants : 0;

        return {
            dept,
            passRate,
            passCount: stat.passCount,
            headcount,
            average,
            participants: stat.participants
        };

    });

    if (entries.length === 0) {
        teamRankList.innerHTML =
            '<p class="rank-empty">아직 기록이 없습니다.</p>';
        return;
    }

    const ranking = entries.sort((a, b) => {
        if (b.passRate !== a.passRate) return b.passRate - a.passRate;
        return b.average - a.average;
    });

    const medals = ["🥇", "🥈", "🥉"];

    teamRankList.innerHTML = ranking.map((e, index) => `
        <div class="rank-row">
            <span class="rank-num">${medals[index] || (index + 1)}</span>
            <span class="rank-name">
                ${e.dept}
                <span class="rank-sub">완주 ${e.passCount}/${e.headcount}명 · 참여 ${e.participants}명 · 평균 ${e.average.toFixed(1)}점</span>
            </span>
            <span class="rank-score">완주율 ${Math.round(e.passRate * 100)}%</span>
        </div>
    `).join("");

}

// "순위보기" 버튼을 눌렀을 때만 실시간 구독을 시작 (불필요한 읽기 방지)
leaderboardButton.addEventListener("click", () => {

    leaderboardModal.classList.remove("hidden");

    if (leaderboardUnsubscribe) return;

    const scoresRef = collection(db, "player_scores");

    leaderboardUnsubscribe = onSnapshot(scoresRef, (snapshot) => {
        const allScores = snapshot.docs.map((d) => d.data());
        renderTeamLeaderboard(allScores);
    }, (err) => {
        console.error("순위 불러오기 실패:", err);
        teamRankList.innerHTML =
            '<p class="rank-empty">순위를 불러오지 못했습니다.</p>';
    });

});

// 모달을 닫으면 구독도 해제 (불필요한 실시간 읽기 방지)
leaderboardClose.addEventListener("click", () => {

    leaderboardModal.classList.add("hidden");

    if (leaderboardUnsubscribe) {
        leaderboardUnsubscribe();
        leaderboardUnsubscribe = null;
    }

});

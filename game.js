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
let scoreAtSituationStart = 0;
let endScreenMode = null;

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

const endScreenButton = {
    x: 500,
    y: 500,
    width: 500,
    height: 100
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
        Object.assign(endScreenButton, { x: 150, y: 930, width: 550, height: 110 });
    } else {
        Object.assign(yesButton, { x: 150, y: 680, width: 550, height: 120 });
        Object.assign(noButton, { x: 800, y: 680, width: 550, height: 120 });
        Object.assign(introButton, { x: 550, y: 690, width: 400, height: 110 });
        Object.assign(confirmButton, { x: 650, y: 400, width: 200, height: 70 });
        Object.assign(endScreenButton, { x: 500, y: 500, width: 500, height: 100 });
    }

    if (gameStarted) {
    if (endScreenMode) {
        endGame(endScreenMode === "retry");
    } else if (gameStarted) {
        if (showingIntro) drawIntroScreen();
        else drawGame();
    }
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
// * 이미지 파일은 "img/부서폴더명/xxx.png" 규칙으로 넣어주세요.
//   (부서마다 폴더를 따로 만들어 관리하면 편합니다)

// 각 부서는 "상황(situation)"의 배열입니다.
// 하나의 상황 = { title, description, steps }
//   - title, description : 상황이 시작될 때 한 번 보여주는 소개 화면
//   - steps : 그 상황 안에서 순서대로 진행되는 질문들 (한 환자를 만나는 동안의 흐름)
//
// 상황을 더 추가하고 싶으면 해당 부서 배열에 { title, description, steps } 객체를
// 이어서 추가하면 됩니다. (예: 두번째 상황, 세번째 상황 ...)

const makeScenario = (title, checkpoints, images = []) => ({
    title,
    description: "상황에 따라 손위생이 필요한 시점을 선택해주세요.",
    steps: checkpoints.map(([question, answer, explanation], index) => ({
        image: images[index] || "img/01.jpg",
        question,
        answer,
        explanation,
        score: 10
    }))
});

const scenariosByDepartment = {

    // ---------------- 병동 완료----------------
    "병동": [
        makeScenario("V/S", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["[[강조]]손위생 후[[/강조]] 환자 확인을 하고 혈압을 측정합니다. \n추가로 손위생을 해야 할까요?", false, "손위생 후 단순 접촉이 반복될때마다 \n추가로 손위생할 필요는 없습니다"],
            ["측정한 혈압을 간호카트로 돌아와 적습니다. 간호카트로 돌아가기 전 손위생을 해야 할까요?", true, "[[밑줄]]환자 접촉 후[[/밑줄]] 의료영역(간호카트)로 돌아가기 전 손위생이 필요합니다. \n *간호카트는 환자영역이 아닙니다."]
        ], ["img/03_1.jpg", "img/03_6.jpg", "img/03_8.jpg"]),

        makeScenario("IV", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["[[강조]]손위생 후[[/강조]] 환자 확인을 하고 정맥을 손으로 확인한 후 토니켓을 적용했습니다. 정맥확인 전 추가로 손위생을 해야할까요?", false, "손위생 후 단순 접촉이 반복될때마다 추가로 손위생할 필요는 없습니다"],
            ["정맥 카테터를 삽입하기 위해 피부소독합니다. 소독 전 손위생을 해야 할까요?", true, "청결/무균 처치 전은 [[밑줄]]즉시[[/밑줄]] 손위생을 시행해야 합니다"],
            ["정맥 카테터를 삽입 후 수액을 연결하고 처치를 마무리합니다. 마무리 후 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"],
            ["커튼을 닫고 환자 주변을 떠납니다. 손위생을 해야 할까요?", true, "환자 주변환경인 커튼을 만진 후 추가로 손위생이 필요합니다."],
        ], ["img/03_1.jpg", "img/03_2.jpg", "img/03_3.jpg", "img/03_4.jpg", "img/03_5.jpg"]),
 
        makeScenario("Suction", [
            ["환자 확인을 위해 접촉하기 전 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 시행합니다."],
            ["[[강조]]손위생 후[[/강조]] 환자 확인 후 장갑을 착용하고 suction합니다. 장갑 착용 전 [[밑줄]]추가로[[/밑줄]] 손위생을 해야 할까요?", true, "청결/무균 처치 전은 '즉시' 손위생을 시행합니다"],
            ["흡인과 물품 정리를 마치고 장갑을 벗어 폐기합니다. 손위생을 해야 할까요?", true, "환자 처치 종료 후 '체액 노출 위험 후' 상황에서는 [[밑줄]]즉시[[/밑줄]] 손위생 합니다."]
        ], ["img/03_1.jpg", "img/04_2.jpg", "img/04_3.jpg"]),

        makeScenario("infusion pump 알람", [
            ["알람이 울려 infusion pump를 확인합니다. \ninfusion pump를 [[강조]]만지기 전[[/강조]] 손위생을 해야 할까요?", false, "[[밑줄]]환자 주변 환경 접촉 전[[/밑줄]]은 손위생이 필요한 순간이 아닙니다."],
            ["그렇다면, infusion pump를 [[강조]]만진 후[[/강조]] 손위생을 해야 할까요?", true, "[[밑줄]]환자 주변 환경 접촉 후[[/밑줄]]엔 손위생을 시행해야 합니다"],
        ], ["img/05_2.jpg","img/05_2.jpg"]),

        makeScenario("Chemoport needle insertion", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["장갑 착용 후 chemoport needle insertion을 시행합니다. 장갑 착용 전 손위생을 해야 할까요?", true, "청결/무균 처치 전에 손위생을 [[밑줄]]즉시[[/밑줄]]시행합니다."],
            ["needle insertion을 마치고 장갑을 벗고 폐기합니다. 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"]
        ], ["img/03_1.jpg", "img/05_3.jpg", "img/04_3.jpg"]),

        makeScenario("장갑과 손위생", [
            ["손위생이 필요한 순간, 장갑 위로 손위생 가능할까요?", false, "손위생을 해야할 때, 장갑을 벗고 손위생을 해야합니다"]
        ], ["img/07_2.jpg"])
    ],

    // ---------------- 중환자실 완료----------------
    "중환자실": [
        makeScenario("중심정맥관 드레싱", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["기존드레싱을 제거하기 위해 청결장갑을 착용합니다. 장갑 착용 전 손위생을 해야하나요?", true, "청결/무균 처치 전에 손위생을 [[밑줄]]즉시[[/밑줄]]시행합니다."],
            ["기존 드레싱을 제거하고 장갑을 벗었습니다. 새 드레싱을 위해 멸균장갑을 착용하기 전 손위생을 해야 할까요?", true, "기존 드레싱 제거 후(체액노출 위험 후) & 새 드레싱을 위해 멸균장갑 착용(청결/무균 처치 전)에 해당하기 때문에 손위생을 시행합니다"],
            ["중심정맥관 드레싱을 시행했습니다. [[밑줄]]시행 후 장갑을 벗고 폐기합니다.[[/밑줄]] 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"],
            ["날짜를 기재하고 물품 정리를 마쳤습니다. 손위생을 해야 할까요?", true, "환자 접촉 후 손위생을 시행합니다."]
        ], ["img/03_1.jpg", "img/04_1.jpg", "img/04_3.jpg", "img/05_5.jpg", "img/05_6.jpg"]),

        makeScenario("Suction", [
            ["환자 확인을 위해 접촉하기 전 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 시행합니다."],
            ["[[강조]]손위생 후[[/강조]] 환자 확인 후 장갑을 착용하고 suction합니다. 장갑 착용 전 [[밑줄]]추가로[[/밑줄]] 손위생을 해야 할까요?", true, "청결/무균 처치 전은 '즉시' 손위생을 시행합니다"],
            ["흡인과 물품 정리를 마치고 장갑을 벗어 폐기합니다. 손위생을 해야 할까요?", true, "환자 처치 종료 후 '체액 노출 위험 후' 상황에서는 [[밑줄]]즉시[[/밑줄]] 손위생 합니다."]
        ], ["img/03_1.jpg", "img/04_2.jpg", "img/04_3.jpg"]),
        
        makeScenario("위관 영양", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["장갑 착용 후 Feeding을 준비하고 연결합니다. 장갑 착용 전 손위생을 해야 할까요?", true, "청결/무균 처치 전은 [[밑줄]]즉시[[/밑줄]] 손위생을 시행해야 합니다"],
            ["위관 영양 후 장갑을 벗어서 폐기합니다. 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"]
        ], ["img/03_1.jpg", "img/05_1.jpg", "img/04_3.jpg"]),

        makeScenario("인공호흡기 응축수 제거", [
            ["응축수 제거를 위해 환자에게 거즈(해피레이)를 적용합니다, 행위 전 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 합니다"],
            ["회로를 분리하기 위해 장갑을 착용합니다. 장갑착용 전 손위생을 해야 할까요?", true, "청결/무균 처치 전은 [[밑줄]]즉시[[/밑줄]] 손위생을 시행해야 합니다"],
            ["회로 응축수를 제거하고 다시 연결한 뒤 장갑을 벗어 폐기합니다. 폐기 후 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"]
        ], ["img/06_1.jpg", "img/04_1.jpg", "img/06_2.jpg"]),

        makeScenario("환자 모니터 알람", [
            ["알람이 울려 모니터를 확인하고 모니터를 조작합니다 \n모니터를 [[강조]]만지기 전[[/강조]] 손위생을 해야 할까요?", false, "[[밑줄]]환자 주변 환경 접촉 전[[/밑줄]]은 손위생이 필요한 순간이 아닙니다."],
            ["그렇다면, 모니터를 [[강조]]만진 후[[/강조]] 손위생을 해야 할까요?", true, "[[밑줄]]환자 주변 환경 접촉 후[[/밑줄]]엔 손위생을 시행해야 합니다"]
        ], ["img/05_4.jpg","img/05_4.jpg"]),

        makeScenario("장갑과 손위생", [
            ["손위생이 필요한 순간, 장갑 위로 손위생 가능할까요?", false, "손위생을 해야할 때, 장갑을 벗고 손위생을 해야합니다"]
        ], ["img/07_2.jpg"])

        
    ],

    // ---------------- 영상의학과 완료----------------
    "영상의학과": [
        makeScenario("외래검사실에서 촬영", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["[[강조]]손위생 후[[/강조]] 환자 확인을 했습니다. \n 검사를 위해 환자 위치를 조정합니다\n 손위생을 해야할까요?", false, "단순 접촉이 반복되는 시점에는 손위생을 시행하지 않아도 됩니다"],
            ["촬영된 결과물을 확인 후, 재검사를 위해 환자 위치를 재조정합니다 \n 손위생을 해야할까요?", false, "외래환경에서 반복적인 단순 접촉에서는 손위생을 추가로 시행하지 않아도 됩니다"],
            ["촬영이 끝난 후, 다음 환자를 호명합니다.\n 손위생을 해야할까요? ", true, "촬영이 끝난 후 '환자 접촉 후'이기 때문에 손위생을 시행합니다."]
        ], ["img/02_09.jpg", "img/02_01.jpg", "img/02_02.jpg", "img/02_06.jpg"]),

        makeScenario("입원병실에서 촬영", [
            ["환자 확인을 팔찌로 확인하기 전(접촉), 손위생을 해야할까요?", true, "환자 접촉 전에는 손위생이 필요합니다."],
            ["[[강조]]손위생 후[[/강조]] 카세트를 적용합니다\n 손위생을 해야할까요?", false, "단순 접촉이 반복되는 시점에는 손위생을 시행하지 않아도 됩니다"],
            ["검사를 위해 촬영 기계를 조작하기 전, \n 손위생을 해야할까요?", true, "촬영기계는 환자영역이 아니기 때문에 \n'환자 접촉 후' 시점으로 손위생 필요합니다"],
            ["촬영 결과 확인 후 재검사를 위해 환자 위치를 조정합니다. \n 손위생을 해야할까요? ", true, "다시 환자영역으로 들어가 환자를 접촉해야하기 때문에, \n'환자 접촉 전'으로 손위생 필요합니다"],
            ["검사를 위해 다시 촬영 기계를 조작합니다, \n 조작하기 전, 손위생을 해야할까요?", true, "촬영기계는 환자영역이 아니기 때문에 \n'환자 접촉 후' 시점으로 손위생 필요합니다"],
            ["검사 후 카세트를 제거합니다, \n 제거하기 전, 손위생을 해야할까요?", true, "다시 환자영역으로 들어가 환자를 접촉해야하기 때문에, \n'환자 접촉 전'으로 손위생 필요합니다"],
        ], ["img/02_07.jpg", "img/02_08.jpg", "img/02_04.jpg", "img/02_03.jpg", "img/02_04.jpg", "img/02_08.jpg"]),

        makeScenario("입원병실에서 환자 주변 접촉 후", [
            ["병실에서 환자 커튼을 접촉했습니다, 손위생을 해야 할까요?", true, "커튼, 사이드레일 등 환자 주변환경을 접촉한 후 반드시 손위생을 시행합니다"]
        ], ["img/02_05.jpg"]),

        makeScenario("장갑과 손위생", [
            ["손위생이 필요한 순간, 장갑 위로 손위생 가능할까요?", false, "손위생을 해야할 때, 장갑을 벗고 손위생을 해야합니다"]
        ], ["img/07_2.jpg"])
    ],

    // ---------------- 재활치료실 완료----------------
    "재활치료실": [
        makeScenario("첫번째 상황", [
            ["환자 팔찌로 환자를 확인하기 전 손위생을 해야할까요?", true, "환자 접촉 전에는 손위생이 필요합니다."],
            ["[[강조]]손위생 후[[/강조]] 환자 확인 후\n치료매트로 이동해서 치료를 시작합니다. \n추가로 손위생을 해야할까요?", false, "환자 확인 전 손위생을 했다면, 추가로 손위생을할 필요가 없습니다."],
            ["치료가 끝났습니다. 환자를 떠날 때, \n손위생을 해야할까요?", true, "환자 접촉 후 손위생을 시행해야 합니다"]
        ], ["img/01_01.jpg", "img/01_02.jpg", "img/01_02.jpg"]),

        makeScenario("두번째 상황", [
            ["환자A 물리치료를 시작합니다. 시작 전 손위생을 해야할까요?", true, "환자 접촉 전에는 손위생이 필요합니다."],
            ["환자A 치료가 끝난 후 [[강조]]손위생을 했습니다.[[/강조]] \n환자B 치료 시작 전, 손위생을 또 해야할까요?", false, "환자A 치료 후 [[강조]]손위생을 시행했다면[[/강조]] \n 환자A 환자접촉 후 + 환자B 환자접촉 전 \n손위생이 되어 추가로 손위생이 필요하지 않습니다"]
        ], ["img/01_02.jpg", "img/01_04.jpg"]),

        makeScenario("세번째 상황", [
            ["환자A를 치료하고 있는 도중, \n환자B를 접수하기 위해 떠납니다. 손위생을 해야할까요?", true, "환자A를 접촉한 후이면서, 환자B 접촉 전입니다. 손위생이 필요합니다"],
            ["환자B 치료 기구를 적용한 후 \n환자A 치료를 다시 시행하기 위해 환자A에게 갑니다, \n 손위생을 또 해야할까요?", true, "환자B를 접촉한 후이면서, 환자A 접촉 전입니다. 손위생이 필요합니다"]
        ], ["img/01_02.jpg", "img/01_04.jpg"]),

        makeScenario("네번째 상황", [
            ["환자A를 치료하고 있는 도중, \n환자B 상태를 확인하기 위해 떠납니다. 손위생을 해야할까요?", true, "환자A를 접촉한 후이면서, 환자B 접촉 전입니다. \n손위생이 필요합니다"],
            ["[[강조]]손위생 후[[/강조]] 환자C 옆에 혈압계를 가지고 \n환자B 혈압을 측정합니다\n손위생을 해야할까요?", false, "환자C 옆에있는 공용 의료기구는 환자영역이 아니기 때문에 \n만진 후 손위생은 필요없습니다."],
            ["다시 환자A 치료를 진행합니다. \n치료 전 손위생을 해야할까요?", true, "환자A를 접촉하기 전이기 때문에 손위생이 필요합니다."]
        ], ["img/01_02.jpg", "img/01_07.jpg", "img/01_03.jpg"]),

        makeScenario("장갑과 손위생", [
            ["손위생이 필요한 순간, 장갑 위로 손위생 가능할까요?", false, "손위생을 해야할 때, 장갑을 벗고 손위생 합니다"]
        ], ["img/07_2.jpg"])
    ],

    // ---------------- 처치전담팀 ----------------
    "처치전담팀": [
        makeScenario("혈액배양검사", [
            ["검사 물품을 준비하기 전 손위생을 해야 할까요?", true, "물품 준비 전에 손위생(청결무균처치 전)을 시행합니다."],
            ["물품 준비 후 환자 팔찌로 환자확인(접촉)을 시행합니다 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 시행합니다."],
            ["[[강조]]손위생 후[[/강조]]환자 확인을 하고 정맥을 손으로 확인한 후 토니켓을 적용했습니다.", false, "단순 접촉이 반복될때마다 앞에 손위생을 시행했다면, 추가로 손위생할 필요는 없습니다"],
            ["배양검사 시행을 위해 장갑을 착용합니다. \n장갑 착용 전, 손위생을 해야 할까요?", true, "청결무균 처치 전 반드시 손위생을 시행합니다."],            
            ["배양검사 후 장갑을 벗고 폐기합니다. \n손위생을 해야 할까요?", true, "'체액노출 위험 후'에 해당되기 때문에 즉시 손위생을 시행합니다."],
            ["[[강조]]손위생 후[[/강조]]다른 부위 채혈을 위해 정맥 확인 후 토니켓을 적용합니다. \n 행위 전 손위생을 해야 할까요?", false, "이미 앞에 손위생을 한 후 단순 접촉 시행이기 때문에 손위생을 추가로할 필요가 없습니다."],
            ["배양 검사 전 장갑을 착용합니다. \n 장갑 착용 전 손위생을 해야 할까요?", true, "청결무균 처치 전 반드시 손위생을 시행합니다."],            
            ["배양검사 후 장갑을 벗고 사용한 물품을 정리합니다. \n손위생을 해야 할까요?", true, "'체액노출 위험 후'에 해당되기 때문에 즉시 손위생을 시행합니다."]
        ], ["img/07_1.jpg","img/03_1.jpg", "img/03_2.jpg", "img/09.jpg", "img/09_01.jpg", "img/03_2.jpg", "img/09.jpg", "img/09_01.jpg"]),
        
        makeScenario("L-tube insertion", [
            ["물품을 준비하기 전 손위생을 해야 할까요?", true, "물품 준비 전은 청결무균 처치 전으로 손위생을 시행합니다."],
            ["환자 확인을 위해 접촉하기 전 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 시행합니다."],
            ["L-tube 삽입을 위해 장갑을 착용하기 전 손위생을 해야 할까요?", true, "청결무균 처치 전 [[밑줄]]즉시[[/밑줄]] 손위생을 시행합니다."],
            ["L-tube 삽입 후 장갑을 벗고 물품 정리를 마쳤습니다. 손위생을 해야 할까요?", true, "'체액노출 위험 후'에 해당되기 때문에 [[밑줄]]즉시[[/밑줄]] 손위생을 시행합니다."]
        ], ["img/09_3.jpg", "img/03_1.jpg","img/09_2.jpg", "img/04_3.jpg"]),

        makeScenario("중심정맥관 드레싱", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["기존드레싱을 제거하기 위해 청결장갑을 착용합니다. 장갑 착용 전 손위생을 해야하나요?", true, "청결/무균 처치 전에 손위생을 [[밑줄]]즉시[[/밑줄]]시행합니다."],
            ["기존 드레싱을 제거하고 장갑을 벗었습니다. 새 드레싱을 위해 멸균장갑을 착용하기 전 손위생을 해야 할까요?", true, "기존 드레싱 제거 후(체액노출 위험 후) & 새 드레싱을 위해 멸균장갑 착용(청결/무균 처치 전)에 해당하기 때문에 손위생을 시행합니다"],
            ["중심정맥관 드레싱을 시행했습니다. [[밑줄]]시행 후 장갑을 벗고 폐기합니다.[[/밑줄]] 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"],
            ["날짜를 기재하고 물품 정리를 마쳤습니다. 손위생을 해야 할까요?", true, "환자 접촉 후 손위생을 시행합니다."]
        ], ["img/03_1.jpg", "img/04_1.jpg", "img/04_3.jpg", "img/05_5.jpg", "img/05_6.jpg"]),

        makeScenario("장갑과 손위생", [
            ["손위생이 필요한 순간, 장갑 위로 손위생 가능할까요?", false, "손위생을 해야할 때, 장갑을 벗고 손위생 합니다"]
        ], ["img/07_2.jpg"])
    ],

    // ---------------- 입원전담팀 ----------------
    "입원전담팀": [
        makeScenario("중심정맥관 드레싱", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["기존드레싱을 제거하기 위해 청결장갑을 착용합니다. 장갑 착용 전 손위생을 해야하나요?", true, "청결/무균 처치 전에 손위생을 [[밑줄]]즉시[[/밑줄]]시행합니다."],
            ["기존 드레싱을 제거하고 장갑을 벗었습니다. 새 드레싱을 위해 멸균장갑을 착용하기 전 손위생을 해야 할까요?", true, "기존 드레싱 제거 후(체액노출 위험 후) & 새 드레싱을 위해 멸균장갑 착용(청결/무균 처치 전)에 해당하기 때문에 손위생을 시행합니다"],
            ["중심정맥관 드레싱을 시행했습니다. [[밑줄]]시행 후 장갑을 벗고 폐기합니다.[[/밑줄]] 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"],
            ["날짜를 기재하고 물품 정리를 마쳤습니다. 손위생을 해야 할까요?", true, "환자 접촉 후 손위생을 시행합니다."]
        ], ["img/03_1.jpg", "img/04_1.jpg", "img/04_3.jpg", "img/05_5.jpg", "img/05_6.jpg"]),

        makeScenario("유치도뇨관 삽입", [
            ["환자 확인을 위해 접촉하기 전 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 시행합니다."],
            ["소변백을 설치하고 환자 체위를 변경하기 전 손위생을 해야 할까요?", false, "환자 확인 전 손위생 후, 단순 접촉이 반복될때마다 추가로 손위생할 필요는 없습니다"],
            ["유치도뇨관 삽입을 위해 멸균장갑을 [[밑줄]]착용 전[[/밑줄]] 손위생을 해야 할까요?", true, "청결/무균 처치 전은 '즉시' 손위생을 시행합니다"],
            ["유치도뇨관 삽입 후 사용한 장갑을 벗어 폐기합니다. 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"],
            ["유치도뇨관을 고정합니다. 고정 후 손위생을 해야 할까요?", true, "환자 접촉 후에는 손위생을 시행합니다"],
            ["사용한 물품을 정리합니다. 물품 정리 후 손위생을 해야 할까요?", true, "사용한 물품 정리는 '체액 노출 후'에 해당하기 때문에 즉시 손위생을 시행합니다"]
        ], ["img/08_1.jpg","img/08_2.jpg","img/08_4.jpg","img/04_3.jpg","img/08_5.jpg","img/08_6.jpg"]),

        makeScenario("직장 도말검사", [
            ["환자 병실 입구에서 가운, 장갑을 착용합니다. 보호구 착용 전 손위생을 해야할까요?", true, "환자 접촉 전 보호구 착용 전에 손위생을 시행합니다."],
            ["환자 확인을 위해 접촉하기 전 추가로 손위생을 해야 할까요?", true, "단순 접촉이 반복될때마다 추가로 손위생할 필요는 없습니다"],  
            ["검체 채취를 위해 장갑을 교체합니다. 장갑 교체 전 손위생을 해야 할까요?", true, "청결/무균 처치 전은 '즉시' 손위생을 시행합니다"],
            ["검체를 채취 후 보호구를 벗었습니다. 손위생을 해야 할까요?", true, "검체 채취는 체액 노출 위험 후에 해당하기 때문에, '즉시' 손위생을 해야합니다 \n 또한, 보호구를 벗은 후에도 손위생을 시행해야 합니다"]
        ], ["img/10(1).jpg","img/10(3).jpg","img/10(5).jpg","img/10(2).jpg"]),

        makeScenario("장갑과 손위생", [
            ["손위생이 필요한 순간, 장갑 위로 손위생 가능할까요?", false, "손위생을 해야할 때, 장갑을 벗고 손위생 합니다"]
        ], ["img/07_2.jpg"])
    ],

    // ---------------- 응급실 ----------------
    "응급실": [
        makeScenario("유치도뇨관 삽입", [
            ["환자 확인을 위해 접촉하기 전 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 시행합니다."],
            ["소변백을 설치하고 환자 체위를 변경하기 전 손위생을 해야 할까요?", false, "환자 확인 전 손위생 후, 단순 접촉이 반복될때마다 추가로 손위생할 필요는 없습니다"],
            ["유치도뇨관 삽입을 위해 멸균장갑을 [[밑줄]]착용 전[[/밑줄]] 손위생을 해야 할까요?", true, "청결/무균 처치 전은 '즉시' 손위생을 시행합니다"],
            ["유치도뇨관 삽입 후 사용한 장갑을 벗어 폐기합니다. 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"],
            ["유치도뇨관을 고정합니다. 고정 후 손위생을 해야 할까요?", true, "환자 접촉 후에는 손위생을 시행합니다"],
            ["사용한 물품을 정리합니다. 물품 정리 후 손위생을 해야 할까요?", true, "사용한 물품 정리는 '체액 노출 후'에 해당하기 때문에 즉시 손위생을 시행합니다"]
        ], ["img/08_1.jpg","img/08_2.jpg","img/08_4.jpg","img/04_3.jpg","img/08_5.jpg","img/08_6.jpg"]),

        makeScenario("환자 모니터 알람", [
            ["알람이 울려 모니터를 확인하고 모니터를 조작합니다 \n모니터를 [[강조]]만지기 전[[/강조]] 손위생을 해야 할까요?", false, "[[밑줄]]환자 주변 환경 접촉 전[[/밑줄]]은 손위생이 필요한 순간이 아닙니다."],
            ["그렇다면, 모니터를 [[강조]]만진 후[[/강조]] 손위생을 해야 할까요?", true, "[[밑줄]]환자 주변 환경 접촉 후[[/밑줄]]엔 손위생을 시행해야 합니다"]
        ], ["img/05_4.jpg","img/05_4.jpg"]),

        makeScenario("IV", [
            ["팔찌로 환자 확인 시(접촉)\n 손위생을 해야할까요?", true, "환자 접촉 전 손위생이 필요합니다"],
            ["[[강조]]손위생 후[[/강조]] 환자 확인을 하고 정맥을 손으로 확인한 후 토니켓을 적용했습니다. 정맥확인 전 추가로 손위생을 해야할까요?", false, "손위생 후 단순 접촉이 반복될때마다 추가로 손위생할 필요는 없습니다"],
            ["정맥 카테터를 삽입하기 위해 피부소독합니다. 소독 전 손위생을 해야 할까요?", true, "청결/무균 처치 전은 [[밑줄]]즉시[[/밑줄]] 손위생을 시행해야 합니다"],
            ["정맥 카테터를 삽입 후 수액을 연결하고 처치를 마무리합니다. 마무리 후 손위생을 해야 할까요?", true, "체액 노출 위험 후는 '즉시' 손위생을 해야합니다"],
            ["커튼을 닫고 환자 주변을 떠납니다. 손위생을 해야 할까요?", true, "환자 주변환경인 커튼을 만진 후 추가로 손위생이 필요합니다."],
        ], ["img/03_1.jpg", "img/03_2.jpg", "img/03_3.jpg", "img/03_4.jpg", "img/03_5.jpg"]),

        makeScenario("혈액배양검사", [
            ["검사 물품을 준비하기 전 손위생을 해야 할까요?", true, "물품 준비 전에 손위생(청결무균처치 전)을 시행합니다."],
            ["물품 준비 후 환자 팔찌로 환자확인(접촉)을 시행합니다 손위생을 해야 할까요?", true, "환자 접촉 전 손위생을 시행합니다."],
            ["[[강조]]손위생 후[[/강조]]환자 확인을 하고 정맥을 손으로 확인한 후 토니켓을 적용했습니다.", false, "단순 접촉이 반복될때마다 앞에 손위생을 시행했다면, 추가로 손위생할 필요는 없습니다"],
            ["배양검사 시행을 위해 장갑을 착용합니다. \n장갑 착용 전, 손위생을 해야 할까요?", true, "청결무균 처치 전 반드시 손위생을 시행합니다."],            
            ["배양검사 후 장갑을 벗고 폐기합니다. \n손위생을 해야 할까요?", true, "'체액노출 위험 후'에 해당되기 때문에 즉시 손위생을 시행합니다."],
            ["[[강조]]손위생 후[[/강조]]다른 부위 채혈을 위해 정맥 확인 후 토니켓을 적용합니다. \n 행위 전 손위생을 해야 할까요?", false, "이미 앞에 손위생을 한 후 단순 접촉 시행이기 때문에 손위생을 추가로할 필요가 없습니다."],
            ["배양 검사 전 장갑을 착용합니다. \n 장갑 착용 전 손위생을 해야 할까요?", true, "청결무균 처치 전 반드시 손위생을 시행합니다."],            
            ["배양검사 후 장갑을 벗고 사용한 물품을 정리합니다. \n손위생을 해야 할까요?", true, "'체액노출 위험 후'에 해당되기 때문에 즉시 손위생을 시행합니다."]
        ], ["img/07_1.jpg","img/03_1.jpg", "img/03_2.jpg", "img/09.jpg", "img/09_01.jpg", "img/03_2.jpg", "img/09.jpg", "img/09_01.jpg"]),

        makeScenario("장갑과 손위생", [
            ["손위생이 필요한 순간, 장갑 위로 손위생 가능할까요?", false, "손위생을 해야할 때, 장갑을 벗고 손위생 합니다"]
        ], ["img/07_2.jpg"])
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
    "B관 13병동": 37,
    "A관 6병동": 33,
    "중환자실": 55,
    "영상의학과": 15000,
    "재활치료실": 15,
    "처치전담팀": 8,
    "입원전담팀": 9,
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
    endScreenMode = null;

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

    scoreAtSituationStart = score;
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

    if (endScreenMode) {
        if (isInsideButton(x, y, endScreenButton)) {
            if (endScreenMode === "retry") {
                retryFailedScenario();
            } else {
                returnToStartScreen();
            }
        }
        return;
    }

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
    showingIntro = false;
    endScreenMode = gameOver ? "retry" : "home";

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

    ctx.fillStyle = "#1976d2";
    roundRect(endScreenButton.x, endScreenButton.y, endScreenButton.width, endScreenButton.height, 24);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = portraitMode ? "bold 28px 'Noto Sans KR', sans-serif" : "bold 32px 'Noto Sans KR', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
        gameOver ? "다시 도전하기" : "처음 화면으로 돌아가기",
        endScreenButton.x + endScreenButton.width / 2,
        endScreenButton.y + endScreenButton.height / 2
    );

    ctx.textBaseline = "alphabetic";

}


function retryFailedScenario() {

    // 실패한 상황은 처음부터 다시 시작하고, 그 상황에서 얻은 점수는 초기화합니다.
    score = scoreAtSituationStart;
    lives = 3;
    currentStepIndex = 0;
    gameStarted = true;
    scoreSaved = false;
    wrongAnswerShown = false;
    correctAnswerShown = false;
    endScreenMode = null;
    startScreen.classList.add("hidden");

    loadSituation();

}


function returnToStartScreen() {

    clearInterval(timerInterval);
    gameStarted = false;
    showingIntro = false;
    endScreenMode = null;
    wrongAnswerShown = false;
    correctAnswerShown = false;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    startScreen.classList.remove("hidden");

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
    const segments = [];
    const marker = /\[\[(강조|밑줄)\]\]([\s\S]*?)\[\[\/\1\]\]/g;
    let cursor = 0;
    let match;

    while ((match = marker.exec(text)) !== null) {
        if (match.index > cursor) {
            segments.push({
                text: text.slice(cursor, match.index),
                emphasized: false,
                underlined: false
            });
        }

        segments.push({
            text: match[2],
            emphasized: match[1] === "강조",
            underlined: match[1] === "밑줄"
        });

        cursor = marker.lastIndex;
    }

    if (cursor < text.length || segments.length === 0) {
        segments.push({
            text: text.slice(cursor),
            emphasized: false,
            underlined: false
        });
    }

    const characters = segments.flatMap((segment) =>
        Array.from(segment.text, (character) => ({
            character,
            emphasized: segment.emphasized,
            underlined: segment.underlined
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

        const candidate =
            line.map((part) => part.character).join("") + item.character;

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
    const originalStrokeStyle = ctx.strokeStyle;
    const originalLineWidth = ctx.lineWidth;
    const originalTextAlign = ctx.textAlign;

    ctx.textAlign = "left";

    lines.forEach((lineItems, lineIndex) => {
        const runs = [];

        lineItems.forEach((item) => {
            const previousRun = runs[runs.length - 1];

            if (
                previousRun &&
                previousRun.emphasized === item.emphasized &&
                previousRun.underlined === item.underlined
            ) {
                previousRun.text += item.character;
            } else {
                runs.push({
                    text: item.character,
                    emphasized: item.emphasized,
                    underlined: item.underlined
                });
            }
        });

        const lineWidth = runs.reduce(
            (width, run) => width + ctx.measureText(run.text).width,
            0
        );

        let drawX = align === "left" ? x : x - lineWidth / 2;
        const drawY = startY + lineIndex * lineHeight;

        runs.forEach((run) => {
            const runWidth = ctx.measureText(run.text).width;
            const runColor = run.emphasized ? "#d84315" : originalFillStyle;

            ctx.fillStyle = runColor;
            ctx.fillText(run.text, drawX, drawY);

            if (run.underlined) {
                ctx.strokeStyle = runColor;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(drawX, drawY + 3);
                ctx.lineTo(drawX + runWidth, drawY + 3);
                ctx.stroke();
            }

            drawX += runWidth;
        });
    });

    ctx.fillStyle = originalFillStyle;
    ctx.strokeStyle = originalStrokeStyle;
    ctx.lineWidth = originalLineWidth;
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
                <span class="rank-sub">학습 ${e.passCount}/${e.headcount}명 · 참여 ${e.participants}명 · 평균 ${e.average.toFixed(1)}점</span>
            </span>
            <span class="rank-score">학습율 ${Math.round(e.passRate * 100)}%</span>
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

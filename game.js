const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 1. 게임 상태 및 데이터 변수
let score = 0;
let lives = 3;
const maxTime = 30; // 제한시간 30초
let currentTime = maxTime;
let currentQIndex = 0;
let gameOver = false;
let lastTime = 0;

// 피드백 연출 상태 변수
let isFeedbackMode = false;     // 현재 오답 피드백 상영 중인지 여부
let feedbackTimer = 0;          // 연출 시간 체크용 타이머
const FEEDBACK_DURATION = 2.5;  // 연출 지속 시간 (2.5초)
let handWashPulse = 0;          // 손모양 애니메이션 깜빡임 제어 변수

// 2. 변경된 손위생 5가지 시나리오 데이터셋
const questions = [
    {
        text: ["• 환자 확인을 위해", "• 팔찌 접촉 합니다"],
        answer: "PERFORM"
    },
    {
        text: ["• 환자 팔에", "• 혈압계 커프를 감습니다"],
        answer: "PASS"
    },
    {
        text: ["• 혈압 측정 후", "• 간호 카트로 갑니다"],
        answer: "PERFORM"
    },
    {
        text: ["• 간호 카트에서", "• 혈압을 기록합니다"],
        answer: "PASS"
    },
    {
        text: ["• 병실을 나갑니다"],
        answer: "PASS"
    }
];

// 3. 이미지 로드 및 게임 루프 시작
const bgImg = new Image();
bgImg.src = 'img/bg.png'; 
bgImg.onload = () => {
    requestAnimationFrame(gameLoop);
};

// 4. 버튼 히트박스 영역 정의 (기존 이미지 해상도 기준 좌표)
const btnPerform = { x: 190, y: 690, width: 285, height: 90 };
const btnPass = { x: 520, y: 690, width: 300, height: 90 };

// 5. 화면 렌더링 (그리기) 함수
function draw() {
    // [기본] 배경 이미지 그리기
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    // [A] 생명(하트) 영역 실시간 마스킹 및 미니 하트 렌더링
    ctx.fillStyle = "#141821"; 
    ctx.fillRect(25, 20, 130, 45); // 기존 이미지의 하트 가림막 상자
    
    for (let i = 0; i < 3; i++) {
        let hx = 42 + (i * 24);   // 슬림해진 간격 (24픽셀씩 복사)
        let hy = 35;              // 하트 상단 시작 Y좌표

        if (i < lives) {
            ctx.fillStyle = "#FF0000"; // 빨간색 예쁜 하트
            
            ctx.beginPath();
            ctx.moveTo(hx + 8, hy + 5);
            ctx.bezierCurveTo(hx + 8, hy, hx, hy, hx, hy + 6);
            ctx.bezierCurveTo(hx, hy + 11, hx + 5, hy + 15, hx + 8, hy + 18);
            ctx.bezierCurveTo(hx + 11, hy + 15, hx + 16, hy + 11, hx + 16, hy + 6);
            ctx.bezierCurveTo(hx + 16, hy, hx + 8, hy, hx + 8, hy + 5);
            ctx.fill();
        } else {
            // 하트 소멸 시 미니 회색 사각형 표기
            ctx.fillStyle = "#323232";
            ctx.fillRect(hx + 2, hy + 4, 12, 12);
        }
    }

    // [B] 타이머 디지털 전광판 텍스트 업데이트 (00:30 영역)
    ctx.fillStyle = "#141821";
    ctx.fillRect(470, 25, 90, 40); 

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 22px 'Malgun Gothic', sans-serif";
    ctx.textAlign = "center";
    let seconds = Math.ceil(currentTime);
    let timeStr = `00:${seconds < 10 ? '0' + seconds : seconds}`;
    ctx.fillText(timeStr, 515, 53);

    // [C] 우측 오렌지색 게이지 바 애니메이션 실시간 연산
    const barMaxWidth = 200;
    let barWidth = (currentTime / maxTime) * barMaxWidth;
    ctx.fillStyle = "#282D37";
    ctx.fillRect(675, 33, barMaxWidth, 22);
    if (barWidth > 0) {
        ctx.fillStyle = "#F28E2B"; 
        ctx.fillRect(675, 33, barWidth, 22);
    }

    // [D] 우측 상단 실시간 스코어(SCORE) 출력
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 20px 'Malgun Gothic', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`SCORE: ${score}`, 960, 52);

    // [E] 간호사 말풍선 텍스트 다이나믹 바인딩 (두 줄 자동 정렬)
    if (currentQIndex < questions.length) {
        ctx.fillStyle = "#000000";
        ctx.font = "bold 24px 'Malgun Gothic', sans-serif";
        ctx.textAlign = "left";
        
        let lines = questions[currentQIndex].text;
        let speechX = 295;
        let speechY = 220;
        
        lines.forEach((line, index) => {
            ctx.fillText(line, speechX, speechY + (index * 35));
        });
    }

    // [F] 오답 시 "잠깐! 손위생" 애니메이션 이펙트 연출 레이어
    if (isFeedbackMode) {
        // 배경 반투명 어둡게
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 상단 메시지
        ctx.fillStyle = "#FFC107"; 
        ctx.font = "bold 38px 'Malgun Gothic', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("잠깐! 손위생을 시행해야 합니다.", canvas.width / 2, 220);

        // 중간: 펄스 애니메이션이 적용된 손씻기 도트 그래픽 아트
        let pulseScale = 1 + Math.sin(handWashPulse) * 0.05;
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2 - 20);
        ctx.scale(pulseScale, pulseScale);

        // 비눗방울 원 배경
        ctx.fillStyle = "rgba(100, 200, 255, 0.4)";
        ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.beginPath(); ctx.arc(-50, -40, 15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(60, 30, 10, 0, Math.PI * 2); ctx.fill();

        // 비비는 두 손 레이아웃 사각형 조합
        ctx.fillStyle = "#FFE0B2"; // 왼손
        ctx.fillRect(-55, -20, 45, 50);
        ctx.fillRect(-55, -45, 8, 25);
        ctx.fillRect(-43, -52, 8, 32);
        ctx.fillRect(-31, -48, 8, 28);
        ctx.fillRect(-19, -38, 8, 18);

        ctx.fillStyle = "#FFA726"; // 오른손 음영
        ctx.fillRect(5, -10, 45, 50);
        ctx.fillRect(5, -35, 8, 25);
        ctx.fillRect(17, -42, 8, 32);
        ctx.fillRect(29, -38, 8, 28);
        ctx.fillRect(41, -28, 8, 18);

        // 반짝이 물방울 라인
        ctx.fillStyle = "#00B0FF";
        ctx.fillRect(-70, 10, 15, 8);
        ctx.fillRect(65, -15, 12, 8);
        ctx.fillRect(-10, -65, 8, 15);

        ctx.restore();

        // 하단 피드백 완료 안내
        ctx.fillStyle = "#4CAF50"; 
        ctx.font = "bold 34px 'Malgun Gothic', sans-serif";
        ctx.fillText("✔ 손위생 시행 완료", canvas.width / 2, canvas.height / 2 + 140);
    }

    // [G] 게임 완전 종료 / 클리어 스크린 오버레이
    if (gameOver && !isFeedbackMode) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 45px 'Malgun Gothic', sans-serif";
        ctx.textAlign = "center";
        
        let resultText = lives > 0 ? `게임 클리어! 최종 스코어: ${score}` : `게임 오버! 최종 스코어: ${score}`;
        ctx.fillText(resultText, canvas.width / 2, canvas.height / 2);
    }
}

// 6. 메인 타이머 및 프레임 루프 함수
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    if (!gameOver) {
        if (isFeedbackMode) {
            // 오답 피드백 상태일 때는 전역 타이머 정지, 피드백 애니메이션 타이머 작동
            feedbackTimer -= dt;
            handWashPulse += dt * 8; // 통통 튀는 속도 배율

            if (feedbackTimer <= 0) {
                isFeedbackMode = false;
                nextQuestion(); 
            }
        } else {
            // 일반 게임 모드 타이머 차감
            currentTime -= dt;

            if (currentTime <= 0) {
                lives--;
                nextQuestion();
            }

            if (lives <= 0 || currentQIndex >= questions.length) {
                gameOver = true;
            }
        }
    }

    draw();
    requestAnimationFrame(gameLoop);
}

// 다음 퀴즈 단계 전환
function nextQuestion() {
    currentQIndex++;
    currentTime = maxTime;
    
    if (currentQIndex >= questions.length) {
        gameOver = true;
    }
}

// 7. 터치 / 클릭 좌표 인식 및 판정 마스터 로직
function checkClick(x, y) {
    if (gameOver || isFeedbackMode) return; // 팝업 연출 중이거나 끝났으면 입력 차단

    let userChoice = null;

    // '손위생 하기' 버튼 콜라이더 판정
    if (x >= btnPerform.x && x <= btnPerform.x + btnPerform.width &&
        y >= btnPerform.y && y <= btnPerform.y + btnPerform.height) {
        userChoice = "PERFORM";
    }
    // '손위생 패스' 버튼 콜라이더 판정
    else if (x >= btnPass.x && x <= btnPass.x + btnPass.width &&
             y >= btnPass.y && y <= btnPass.y + btnPass.height) {
        userChoice = "PASS";
    }

    if (userChoice && currentQIndex < questions.length) {
        let correctAnswer = questions[currentQIndex].answer;
        
        if (userChoice === correctAnswer) {
            score += 100;
            nextQuestion();
        } else {
            lives--; // 정답을 틀리면 생명력 1 차감

            // 핵심 트리거: 손위생을 무조건 해야 하는 상황('PERFORM')에 '패스'를 누르면 에듀 연출 재생
            if (correctAnswer === "PERFORM" && userChoice === "PASS") {
                isFeedbackMode = true;
                feedbackTimer = FEEDBACK_DURATION; // 2.5초 가동
                handWashPulse = 0;
            } else {
                nextQuestion();
            }
        }
    }
}

// 기기 해상도에 맞춰 캔버스 스케일 상대 좌표 계산 함수
function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

// 8. 마우스 및 모바일 터치 이벤트 핸들러 바인딩
canvas.addEventListener('mousedown', (e) => {
    const coords = getCanvasCoords(e);
    checkClick(coords.x, coords.y);
});

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // 모바일 바운스 스크롤 홀딩 해제 방지
    const coords = getCanvasCoords(e);
    checkClick(coords.x, coords.y);
}, { passive: false });
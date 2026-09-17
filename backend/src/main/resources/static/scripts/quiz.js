/**
 * Quiz Engine
 */

const quizData = [
    { id: 1, title: 'Toán Cao Cấp 1 - Giới Hạn', questionsCount: 15, difficulty: 'Khó', attempts: 1200 },
    { id: 2, title: 'Lập Trình Web Cơ Bản', questionsCount: 20, difficulty: 'Trung Bình', attempts: 3500 },
    { id: 3, title: 'Tiếng Anh Giao Tiếp', questionsCount: 10, difficulty: 'Dễ', attempts: 5400 },
    { id: 4, title: 'Cấu Trúc Dữ Liệu', questionsCount: 25, difficulty: 'Khó', attempts: 800 },
    { id: 5, title: 'Triết Học Mác-Lênin', questionsCount: 50, difficulty: 'Trung Bình', attempts: 2100 }
];

const mockQuestions = [
    { q: "DOM là viết tắt của từ gì?", options: ["Document Object Model", "Data Object Model", "Document Oriented Model", "Data Oriented Model"], correct: 0 },
    { q: "CSS được sử dụng để làm gì?", options: ["Tạo cấu trúc web", "Tạo kiểu dáng web", "Xử lý logic web", "Lưu trữ dữ liệu"], correct: 1 },
    { q: "Trong JS, từ khóa nào khai báo hằng số?", options: ["var", "let", "const", "static"], correct: 2 }
];

class QuizEngine {
    constructor() {
        this.currentQuiz = null;
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.timer = null;
        this.timeLeft = 600; // 10 minutes
    }

    renderQuizList() {
        const list = document.getElementById('quiz-list');
        if(!list) return;
        list.innerHTML = quizData.map(q => `
            <div class="item-card card">
                <div class="badge" style="float:right; margin-bottom:0.5rem">${q.difficulty}</div>
                <h3>${q.title}</h3>
                <p>Số câu: ${q.questionsCount} | Đã làm: ${q.attempts}</p>
                <button class="btn btn-primary" style="margin-top:1rem; width:100%" onclick="quizEngine.startQuiz(${q.id})">Bắt Đầu Làm</button>
            </div>
        `).join('');
    }

    startQuiz(quizId) {
        this.currentQuiz = quizData.find(q => q.id === quizId);
        this.currentQuestionIndex = 0;
        this.score = 0;
        this.timeLeft = 600;
        
        document.getElementById('quiz-modal').classList.remove('hidden');
        document.getElementById('quiz-title').innerText = this.currentQuiz.title;
        
        this.renderQuestion();
        this.startTimer();
    }

    renderQuestion() {
        if (this.currentQuestionIndex >= mockQuestions.length) {
            this.showResult();
            return;
        }

        const q = mockQuestions[this.currentQuestionIndex];
        document.getElementById('question-text').innerText = `Câu ${this.currentQuestionIndex + 1}: ${q.q}`;
        
        const optionsHtml = q.options.map((opt, idx) => `
            <button class="option-btn" onclick="quizEngine.selectOption(${idx}, this)">${opt}</button>
        `).join('');
        
        document.getElementById('options-container').innerHTML = optionsHtml;
        
        const progress = ((this.currentQuestionIndex) / mockQuestions.length) * 100;
        document.getElementById('quiz-progress').style.width = `${progress}%`;
    }

    selectOption(idx, element) {
        const buttons = document.querySelectorAll('.option-btn');
        buttons.forEach(btn => btn.classList.remove('selected'));
        element.classList.add('selected');
        this.selectedOption = idx;
    }

    nextQuestion() {
        if (this.selectedOption === undefined) return alert('Vui lòng chọn 1 đáp án!');
        
        const correct = mockQuestions[this.currentQuestionIndex].correct;
        if (this.selectedOption === correct) this.score++;
        
        this.selectedOption = undefined;
        this.currentQuestionIndex++;
        this.renderQuestion();
    }

    startTimer() {
        clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.timeLeft--;
            const m = Math.floor(this.timeLeft / 60).toString().padStart(2, '0');
            const s = (this.timeLeft % 60).toString().padStart(2, '0');
            document.getElementById('quiz-timer').innerText = `${m}:${s}`;
            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.showResult();
            }
        }, 1000);
    }

    showResult() {
        clearInterval(this.timer);
        document.getElementById('question-container').innerHTML = `
            <div style="text-align:center">
                <h2>Hoàn thành!</h2>
                <p style="font-size: 2rem; margin: 1rem 0; color: var(--accent)">
                    Điểm số: ${this.score} / ${mockQuestions.length}
                </p>
                <p>Tuyệt vời! Hãy tiếp tục duy trì phong độ.</p>
            </div>
        `;
        document.getElementById('quiz-progress').style.width = `100%`;
        document.getElementById('next-btn').style.display = 'none';
    }

    closeQuiz() {
        document.getElementById('quiz-modal').classList.add('hidden');
        clearInterval(this.timer);
    }
}

window.quizEngine = new QuizEngine();

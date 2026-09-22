/**
 * Flashcard Engine
 */

const deckData = [
    { id: 1, title: 'Từ Vựng IELTS Cơ Bản', count: 100, color: '#4F6EF7' },
    { id: 2, title: 'Các Hàm Javascript', count: 50, color: '#7C3AED' },
    { id: 3, title: 'Công thức Đạo Hàm', count: 30, color: '#06B6D4' },
    { id: 4, title: 'Thuật ngữ Marketing', count: 75, color: '#F59E0B' }
];

const mockCards = [
    { front: 'Closure là gì?', back: 'Hàm nội hàm có thể truy cập biến của hàm ngoại hàm ngay cả khi hàm ngoại hàm đã thực thi xong.' },
    { front: 'Hoisting là gì?', back: 'Cơ chế di chuyển khai báo biến và hàm lên đầu scope trước khi code thực thi.' },
    { front: 'Event Loop là gì?', back: 'Cơ chế giúp JS xử lý bất đồng bộ bằng cách đẩy callback từ Queue vào Call Stack khi Stack trống.' }
];

class FlashcardEngine {
    constructor() {
        this.currentIndex = 0;
    }

    renderDeckBrowser() {
        const list = document.getElementById('deck-list');
        if(!list) return;
        list.innerHTML = deckData.map(d => `
            <div class="item-card card" style="border-top: 4px solid ${d.color}; cursor: pointer" onclick="flashcardEngine.startStudyMode()">
                <h3>${d.title}</h3>
                <p>${d.count} thẻ ghi nhớ</p>
            </div>
        `).join('');
    }

    startStudyMode() {
        document.getElementById('deck-list').classList.add('hidden');
        document.getElementById('flashcard-study').classList.remove('hidden');
        document.querySelector('.page-header').classList.add('hidden');
        this.currentIndex = 0;
        this.renderCard();
    }

    exitStudyMode() {
        document.getElementById('deck-list').classList.remove('hidden');
        document.getElementById('flashcard-study').classList.add('hidden');
        document.querySelector('.page-header').classList.remove('hidden');
    }

    renderCard() {
        const card = mockCards[this.currentIndex];
        document.getElementById('fc-front').innerText = card.front;
        document.getElementById('fc-back').innerText = card.back;
        
        const el = document.getElementById('current-flashcard');
        el.classList.remove('is-flipped');

        const progress = ((this.currentIndex + 1) / mockCards.length) * 100;
        document.getElementById('fc-progress').style.width = `${progress}%`;
    }

    flipCard() {
        const el = document.getElementById('current-flashcard');
        el.classList.toggle('is-flipped');
    }

    nextCard() {
        if (this.currentIndex < mockCards.length - 1) {
            this.currentIndex++;
            this.renderCard();
        }
    }

    prevCard() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.renderCard();
        }
    }
}

window.flashcardEngine = new FlashcardEngine();

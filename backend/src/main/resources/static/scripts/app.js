/**
 * StudyHubAI - Core Application Logic
 * Clean Architecture Implementation
 */

// ==========================================
// DOMAIN LAYER: Entities & Business Rules
// ==========================================
class UserEntity {
    constructor(id, name, level) {
        this.id = id;
        this.name = name;
        this.level = level;
    }
}

// ==========================================
// INFRASTRUCTURE LAYER: Data & Storage
// ==========================================
const Storage = {
    get: (key) => JSON.parse(localStorage.getItem(key)) || null,
    set: (key, data) => localStorage.setItem(key, JSON.stringify(data)),
};

// ==========================================
// APPLICATION LAYER: State & Services
// ==========================================
const AppState = {
    currentUser: new UserEntity(1, 'Nguyễn Văn A', 'VIP'),
    currentPage: 'home'
};

class RouterService {
    constructor() {
        this.links = document.querySelectorAll('a[data-target]');
        this.pages = document.querySelectorAll('.page');
        this.init();
    }

    init() {
        this.links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = e.currentTarget.getAttribute('data-target');
                this.navigate(target);
            });
        });
    }

    navigate(pageId) {
        // Update State
        AppState.currentPage = pageId;

        // Hide all pages, show target
        this.pages.forEach(page => page.classList.remove('active'));
        const targetPage = document.getElementById(pageId);
        if (targetPage) targetPage.classList.add('active');

        // Update Nav links (Top & Sidebar)
        this.links.forEach(link => {
            if (link.getAttribute('data-target') === pageId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Trigger page-specific initializers if needed
        this.triggerPageLoad(pageId);
    }

    triggerPageLoad(pageId) {
        if (pageId === 'quiz' && window.quizEngine) window.quizEngine.renderQuizList();
        if (pageId === 'flashcards' && window.flashcardEngine) window.flashcardEngine.renderDeckBrowser();
        if (pageId === 'documents' && window.uploadEngine) window.uploadEngine.renderDocumentLibrary();
        if (pageId === 'groups' && window.groupsEngine) window.groupsEngine.renderGroupList();
    }
}

// ==========================================
// PRESENTATION LAYER: Init App
// ==========================================
const app = {
    router: null,
    init: () => {
        app.router = new RouterService();
        console.log('StudyHubAI Initialized');
    }
};

document.addEventListener('DOMContentLoaded', app.init);

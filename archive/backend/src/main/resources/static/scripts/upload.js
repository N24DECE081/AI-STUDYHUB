/**
 * Document Upload & AI Logic
 * Kết nối trực tiếp với Spring Boot Backend (DocumentController)
 */

class UploadEngine {
    constructor() {
        this.documents = [];
        this.selectedDocument = null;
        this.init();
    }

    init() {
        this.initDragAndDrop();
        this.loadDocumentsFromBackend();
    }

    initDragAndDrop() {
        const dropZone = document.getElementById('upload-zone');
        const fileInput = document.getElementById('file-input');
        if (!dropZone) return;

        dropZone.addEventListener('click', () => fileInput.click());

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length) this.handleUpload(files[0]);
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) this.handleUpload(e.target.files[0]);
        });
    }

    // 1. Tải danh sách tài liệu từ Database (GET /api/documents)
    async loadDocumentsFromBackend() {
        try {
            const response = await fetch('/api/documents');
            if (response.ok) {
                this.documents = await response.json();
                this.renderDocumentLibrary();
            }
        } catch (error) {
            console.error('Không thể tải danh sách tài liệu:', error);
        }
    }

    // 2. Tải file lên Backend và gọi Gemini AI tóm tắt (POST /api/documents/upload hoặc /summarize)
    async handleUpload(file) {
        const summaryContent = document.getElementById('ai-summary-content');
        if (summaryContent) {
            summaryContent.innerHTML = `
                <div style="text-align: center; padding: 2rem 1rem;">
                    <p style="font-size: 1.1rem; font-weight: 600;">⏳ AI đang phân tích tài liệu...</p>
                    <p style="font-size: 0.85rem; color: var(--muted); margin-top: 0.5rem;">Đang trích xuất nội dung và tạo bản tóm tắt...</p>
                </div>
            `;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            // Gửi file lên API /upload để lưu Database & xử lý
            let response = await fetch('/api/documents/upload', {
                method: 'POST',
                body: formData
            });

            if (response.ok) {
                const doc = await response.json();
                this.documents.unshift(doc);
                this.renderDocumentLibrary();
                this.showAISummary(doc.id);
            } else {
                // Nếu endpoint /upload trả lỗi, thử gọi trực tiếp endpoint /summarize
                response = await fetch('/api/documents/summarize', {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    const data = await response.json();
                    this.renderCustomSummary(data.filename, data.summary);
                } else {
                    const errText = await response.text();
                    if (summaryContent) {
                        summaryContent.innerHTML = `<p style="color: var(--danger);">❌ Lỗi tải lên: ${errText}</p>`;
                    }
                }
            }
        } catch (error) {
            console.error('Lỗi khi tải file lên:', error);
            if (summaryContent) {
                summaryContent.innerHTML = `<p style="color: var(--danger);">❌ Lỗi kết nối Server: ${error.message}</p>`;
            }
        }
    }

    // 3. Hiển thị danh sách tài liệu ra giao diện
    renderDocumentLibrary() {
        const list = document.getElementById('document-library');
        if (!list) return;

        if (!this.documents || this.documents.length === 0) {
            list.innerHTML = `
                <p style="color: var(--muted); font-size: 0.88rem; text-align: center; padding: 1rem;">
                    Chưa có tài liệu nào. Hãy kéo thả file PDF vào khung bên trên để tải lên!
                </p>
            `;
            return;
        }

        list.innerHTML = this.documents.map((doc) => {
            const fileName = doc.filename || doc.fileName || doc.name || `Tài liệu #${doc.id}`;
            const isPdf = fileName.toLowerCase().endsWith('.pdf');

            return `
                <div class="document-item" onclick="uploadEngine.showAISummary(${doc.id})" style="padding: 0.85rem; background: var(--card); border: 1px solid var(--border); border-radius: 10px; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; transition: all 0.2s;">
                    <div class="icon" style="font-size: 1.5rem;">${isPdf ? '📕' : '📘'}</div>
                    <div class="doc-info" style="overflow: hidden;">
                        <h4 style="font-size: 0.9rem; margin-bottom: 0.2rem; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">${fileName}</h4>
                        <p style="font-size: 0.78rem; color: var(--muted);">Mã tài liệu: #${doc.id}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 4. Hiển thị nội dung tóm tắt từ AI khi chọn tài liệu
    showAISummary(docId) {
        const doc = this.documents.find(d => d.id === docId);
        if (!doc) return;

        this.selectedDocument = doc;
        const fileName = doc.filename || doc.fileName || doc.name || `Tài liệu #${doc.id}`;
        const summaryText = doc.summary || doc.content || doc.extractedText || "Tài liệu đã được lưu trữ thành công trong hệ thống.";

        this.renderCustomSummary(fileName, summaryText);
    }

    renderCustomSummary(title, contentText) {
        const content = document.getElementById('ai-summary-content');
        if (!content) return;

        content.innerHTML = `
            <div style="animation: fadeIn 0.4s ease;">
                <h4 style="color: var(--accent); margin-bottom: 1rem; word-break: break-word;">🤖 AI Tóm tắt: ${title}</h4>
                <div style="color: var(--text); line-height: 1.6; font-size: 0.92rem; white-space: pre-line; max-height: 380px; overflow-y: auto; padding-right: 0.5rem;">
                    ${contentText}
                </div>
                <button class="btn btn-primary" style="margin-top: 1.25rem; width: 100%" onclick="alert('Tính năng tự động khởi tạo bài Trắc nghiệm từ tài liệu sẽ sẵn sàng ở bản cập nhật tiếp theo!')">
                    Tạo Quiz từ Tài liệu này
                </button>
            </div>
        `;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.uploadEngine = new UploadEngine();
});
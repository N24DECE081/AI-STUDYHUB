import { useState } from 'react';
import { AI_SERVICE_URL } from '../config';

const AiTutorChat = ({ currentDocumentContent }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedProject, setSelectedProject] = useState('new-project');
  const [selectedModel, setSelectedModel] = useState('Gemini 2.5 Flash');
  const [selectedBranch] = useState('main');
  const [showDropdown, setShowDropdown] = useState(false);

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!question.trim() || loading) return;
    if (!currentDocumentContent?.trim()) {
      setAnswer('Vui lòng tải tài liệu lên trước khi đặt câu hỏi.');
      return;
    }

    setLoading(true);
    setAnswer(''); 

    try {
      const response = await fetch(`${AI_SERVICE_URL}/api/ai/chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: currentDocumentContent || '',
          question: question,
        }),
      });

      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data:')) {
              const content = line.startsWith('data: ') ? line.slice(6) : line.slice(5);
              if (content) {
                setAnswer((prev) => prev + content);
              }
            }
          }
        }
      }

      if (buffer.startsWith('data:')) {
        const finalContent = buffer.startsWith('data: ') ? buffer.slice(6) : buffer.slice(5);
        if (finalContent) setAnswer((prev) => prev + finalContent);
      }

    } catch (error) {
      console.error('Lỗi đọc Stream:', error);
      setAnswer((prev) => prev + '\n[Lỗi kết nối máy chủ]');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.outerCanvas}>
      <div style={styles.cardContainer}>
        
        {/* HÀNG TRÊN: TÊN DỰ ÁN / TÀI LIỆU */}
        <div style={styles.projectSelector}>
          <span style={styles.folderIcon}>📁</span>
          <select 
            value={selectedProject} 
            onChange={(e) => setSelectedProject(e.target.value)}
            style={styles.projectSelect}
          >
            <option value="new-project">new-project</option>
            <option value="studyhub-docs">studyhub-docs</option>
            <option value="ai-tutor-lab">ai-tutor-lab</option>
          </select>
        </div>

        {/* KHUNG NHẬP CHÍNH (PROMPT BAR FLOATING) */}
        <div style={styles.promptCard}>
          {/* Ô NHẬP NỘI DUNG CÂU HỎI */}
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask anything, @ to mention, / for actions"
            style={styles.promptInput}
            rows={2}
          />

          {/* HÀNG CÔNG CỤ TRONG Ô INPUT (+, GEMINI MODEL, MICROPHONE) */}
          <div style={styles.promptToolbar}>
            <div style={styles.toolbarLeft}>
              <button style={styles.iconBtn} title="Attach File">+</button>
              <select 
                value={selectedModel} 
                onChange={(e) => setSelectedModel(e.target.value)}
                style={styles.modelSelect}
              >
                <option value="Gemini 2.5 Flash">Gemini 2.5 Flash ˅</option>
                <option value="Gemini 2.5 Pro">Gemini 2.5 Pro ˅</option>
              </select>
            </div>
            
            <button style={styles.micBtn} title="Voice Input">🎙️</button>
          </div>

          {/* HÀNG ĐÁY CHỌN DỰ ÁN CỤ THỂ / WORKTREE */}
          <div style={styles.bottomBar}>
            <button 
              style={styles.bottomBarBtn}
              onClick={() => setShowDropdown(!showDropdown)}
            >
              🌱 New Worktree ˆ
            </button>
            <button style={styles.bottomBarBtn}>
              🔀 {selectedBranch} ˅
            </button>
          </div>

          {/* DROPDOWN MENU KHI BẤM XUỐNG */}
          {showDropdown && (
            <div style={styles.dropdownMenu}>
              <div style={styles.dropdownItem} onClick={() => setShowDropdown(false)}>📁 Local</div>
              <div style={styles.dropdownItem} onClick={() => setShowDropdown(false)}>🌱 New Worktree</div>
            </div>
          )}
        </div>

        {/* KHU VỰC HIỂN THỊ KẾT QUẢ AI PHẢN HỒI */}
        {(answer || loading) && (
          <div style={styles.responseContainer}>
            <div style={styles.responseHeader}>
              <span style={styles.aiBadge}>🤖 {selectedModel} Response:</span>
            </div>
            <div style={styles.responseBody}>
              {answer || 'AI đang suy nghĩ và tạo câu trả lời...'}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

// INLINE STYLES CHUẨN DESIGN THEO ẢNH MẪU (LIGHT MINIMALIST)
const styles = {
  outerCanvas: {
    backgroundColor: '#eef2f6',
    padding: '40px 20px',
    minHeight: '80vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  cardContainer: {
    width: '100%',
    maxWidth: '620px',
    backgroundColor: '#e5e7eb',
    borderRadius: '24px',
    padding: '30px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.05)',
  },
  projectSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '12px',
    paddingLeft: '6px',
  },
  folderIcon: {
    fontSize: '14px',
    color: '#4b5563',
  },
  projectSelect: {
    border: 'none',
    background: 'transparent',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1f2937',
    cursor: 'pointer',
    outline: 'none',
  },
  promptCard: {
    backgroundColor: '#f3f4f6',
    borderRadius: '16px',
    padding: '16px',
    position: 'relative',
    boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
  },
  promptInput: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: '15px',
    color: '#111827',
    resize: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  promptToolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  iconBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: '18px',
    color: '#6b7280',
    cursor: 'pointer',
    padding: '2px 6px',
  },
  modelSelect: {
    border: 'none',
    backgroundColor: '#e5e7eb',
    padding: '6px 12px',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '500',
    color: '#374151',
    cursor: 'pointer',
    outline: 'none',
  },
  micBtn: {
    border: 'none',
    backgroundColor: '#e5e7eb',
    padding: '6px 10px',
    borderRadius: '50%',
    fontSize: '12px',
    cursor: 'pointer',
  },
  bottomBar: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
    paddingTop: '10px',
    borderTop: '1px solid #e5e7eb',
  },
  bottomBarBtn: {
    border: 'none',
    background: 'transparent',
    fontSize: '13px',
    color: '#6b7280',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  dropdownMenu: {
    position: 'absolute',
    bottom: '-80px',
    left: '16px',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    padding: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
    zIndex: 10,
    width: '180px',
  },
  dropdownItem: {
    padding: '8px 12px',
    fontSize: '13px',
    color: '#374151',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  responseContainer: {
    marginTop: '20px',
    backgroundColor: '#ffffff',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
  },
  responseHeader: {
    marginBottom: '10px',
  },
  aiBadge: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b5563',
  },
  responseBody: {
    fontSize: '14px',
    lineHeight: '1.6',
    color: '#1f2937',
    whiteSpace: 'pre-wrap',
  },
};

export default AiTutorChat;

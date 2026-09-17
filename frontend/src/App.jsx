import React, { useState } from 'react';
import AiTutorChat from './components/AiTutorChat';

function App() {
  const [activeTab, setActiveTab] = useState('home'); // 'home', 'chat', 'quiz', 'flashcard', 'group'
  const [documentContent, setDocumentContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Giả lập câu hỏi Quiz & Flashcard
  const [quizQuestions] = useState([
    { id: 1, question: "Khái niệm chính trong tài liệu là gì?", options: ["A. AI & Machine Learning", "B. Web Development", "C. Cyber Security", "D. Data Base"], answer: "A" },
    { id: 2, question: "Thư viện nào hỗ trợ xử lý dữ liệu mạnh mẽ?", options: ["A. React", "B. Pandas", "C. Express", "D. Spring Boot"], answer: "B" }
  ]);

  const [flashcards] = useState([
    { id: 1, term: "Machine Learning", definition: "Tập hợp các thuật toán cho phép máy tính tự học từ dữ liệu." },
    { id: 2, term: "LLM", definition: "Large Language Model - Mô hình ngôn ngữ lớn như GPT hoặc Gemini." }
  ]);

  const [groupMessages, setGroupMessages] = useState([
    { id: 1, user: "Minh Tuấn", text: "Mọi người đã làm bài Quiz chương 2 chưa?", time: "10:15 AM" },
    { id: 2, user: "Thu Hà", text: "Tớ vừa tạo Flashcard học từ vựng xong nè!", time: "10:18 AM" }
  ]);
  const [newGroupMsg, setNewGroupMsg] = useState('');

  const handleFileUpload = async () => {
    if (!selectedFile) {
      alert("Vui lòng chọn file tài liệu!");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('http://localhost:8081/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const document = await response.json();
      setDocumentContent(document.extractedText || '');
      setUploading(false);
      alert("Tải tài liệu lên thành công!");
    } catch (error) {
      console.error('Lỗi tải tài liệu:', error);
      alert(`Không thể tải tài liệu: ${error.message}`);
      setUploading(false);
    }
  };

  const handleSendGroupMessage = (e) => {
    e.preventDefault();
    if (!newGroupMsg.trim()) return;
    setGroupMessages(prev => [...prev, { id: Date.now(), user: "Bạn", text: newGroupMsg, time: "Vừa xong" }]);
    setNewGroupMsg('');
  };

  return (
    <div style={styles.appContainer}>
      {/* HEADER / NAVIGATION BAR */}
      <header style={styles.navbar}>
        <div style={styles.brandLogo}>
          <div style={styles.logoIcon}>🌐</div>
          <span style={styles.brandTitle}>Study-Hub</span>
        </div>

        <nav style={styles.navLinks}>
          <button style={activeTab === 'home' ? styles.activeNavLink : styles.navLink} onClick={() => setActiveTab('home')}>Home</button>
          <button style={activeTab === 'chat' ? styles.activeNavLink : styles.navLink} onClick={() => setActiveTab('chat')}>Trò Chuyện Học Tập</button>
          <button style={activeTab === 'quiz' ? styles.activeNavLink : styles.navLink} onClick={() => setActiveTab('quiz')}>Tạo Quiz</button>
          <button style={activeTab === 'flashcard' ? styles.activeNavLink : styles.navLink} onClick={() => setActiveTab('flashcard')}>Học Với Flashcards</button>
          <button style={activeTab === 'group' ? styles.activeNavLink : styles.navLink} onClick={() => setActiveTab('group')}>Trò Chuyện Hội Nhóm</button>
        </nav>

        <div style={styles.authGroup}>
          <button style={styles.signInBtn}>Sign In</button>
          <button style={styles.getStartedBtn}>Get Started Free</button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={styles.mainContainer}>

        {/* TAB 1: MÀN HÌNH CHÍNH (HERO SECTION + UP FILE) */}
        {activeTab === 'home' && (
          <div style={styles.heroLayout}>
            <div style={styles.heroLeft}>
              <div style={styles.badge}>
                ✨ AI-Powered Learning Platform
              </div>
              <h1 style={styles.heroTitle}>
                Study Smarter<br />
                <span style={styles.highlightText}>Achieve More</span>
              </h1>
              <p style={styles.heroDescription}>
                Nền tảng học tập thông minh thích ứng với phong cách của bạn. Tải lên tài liệu để bắt đầu tóm tắt, tạo câu hỏi ôn tập và trao đổi cùng hội nhóm.
              </p>

              {/* KHUNG UPLOAD TÀI LIỆU TRỰC TIẾP TẠI MÀN HÌNH CHÍNH */}
              <div style={styles.uploadCard}>
                <h3 style={{ marginTop: 0, fontSize: '16px', color: '#00f2fe' }}>📤 Tải Tài Liệu Học Tập (PDF, DOCX, TXT)</h3>
                <div style={styles.uploadInputRow}>
                  <input 
                    type="file" 
                    onChange={(e) => setSelectedFile(e.target.files[0])} 
                    style={styles.fileInput} 
                  />
                  <button onClick={handleFileUpload} disabled={uploading} style={styles.actionBtn}>
                    {uploading ? 'Đang xử lý...' : 'Upload & Phân Tích'}
                  </button>
                </div>
              </div>

              <div style={styles.heroButtons}>
                <button style={styles.startFreeBtn} onClick={() => setActiveTab('chat')}>Start Free →</button>
                <button style={styles.seeHowBtn}>▷ See How It Works</button>
              </div>

              <div style={styles.featureBadges}>
                <span>✔ Free to start</span>
                <span>✔ No credit card required</span>
                <span>✔ Works on all devices</span>
              </div>
            </div>

            {/* DEMO DASHBOARD WIDGET BÊN PHẢI */}
            <div style={styles.heroRight}>
              <div style={styles.phoneMockup}>
                <div style={styles.mockupHeader}>
                  <div style={styles.mockupLogo}>🌐</div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px' }}>Study-Hub AI</h4>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Your study companion</span>
                  </div>
                </div>

                <div style={styles.widgetCard}>
                  <p style={{ fontSize: '12px', margin: '0 0 10px 0', color: '#cbd5e1' }}>
                    I've analyzed your study patterns. Here's your optimal schedule:
                  </p>
                  <div style={styles.scheduleItem}>
                    <span>🟠 Focus Session</span>
                    <strong style={{ color: '#00f2fe' }}>25 min</strong>
                  </div>
                  <div style={styles.scheduleItem}>
                    <span>🟢 GPA Goal</span>
                    <strong style={{ color: '#00f2fe' }}>3.8</strong>
                  </div>
                  <div style={styles.scheduleItem}>
                    <span>🔵 Next Review</span>
                    <strong style={{ color: '#ff9f43' }}>2:00 PM</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TRÒ CHUYỆN HỌC TẬP (AI TUTOR) */}
        {activeTab === 'chat' && (
          <div style={styles.tabContainer}>
            <AiTutorChat currentDocumentContent={documentContent} />
          </div>
        )}

        {/* TAB 3: TẠO QUIZ */}
        {activeTab === 'quiz' && (
          <div style={styles.tabContainer}>
            <h2 style={{ color: '#00f2fe' }}>📝 Bài Trắc Nghiệm Tự Động</h2>
            <div style={{ marginTop: '20px' }}>
              {quizQuestions.map((q) => (
                <div key={q.id} style={styles.cardItem}>
                  <h4>{q.question}</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
                    {q.options.map((opt, i) => (
                      <button key={i} style={styles.optionBtn}>{opt}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: HỌC VỚI FLASHCARDS */}
        {activeTab === 'flashcard' && (
          <div style={styles.tabContainer}>
            <h2 style={{ color: '#00f2fe' }}>🎴 Thẻ Ghi Nhớ Flashcards</h2>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '20px' }}>
              {flashcards.map((card) => (
                <div key={card.id} style={styles.flashcardBox}>
                  <h3 style={{ color: '#ff9f43' }}>{card.term}</h3>
                  <p style={{ color: '#cbd5e1', fontSize: '14px' }}>{card.definition}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: TRÒ CHUYỆN HỘI NHÓM */}
        {activeTab === 'group' && (
          <div style={styles.tabContainer}>
            <h2 style={{ color: '#00f2fe' }}>👥 Trò Chuyện Cùng Hội Nhóm</h2>
            <div style={styles.chatBoxGroup}>
              <div style={styles.messageList}>
                {groupMessages.map((msg) => (
                  <div key={msg.id} style={msg.user === 'Bạn' ? styles.myMsg : styles.otherMsg}>
                    <strong>{msg.user}: </strong>
                    <span>{msg.text}</span>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>{msg.time}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSendGroupMessage} style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <input 
                  type="text" 
                  value={newGroupMsg} 
                  onChange={(e) => setNewGroupMsg(e.target.value)} 
                  placeholder="Nhập tin nhắn nhóm..." 
                  style={styles.textInput} 
                />
                <button type="submit" style={styles.actionBtn}>Gửi</button>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

// INLINE STYLES MOISTENED DARK MODE (GIAO DIỆN CHUẨN ANH MẪU)
const styles = {
  appContainer: {
    backgroundColor: '#0a0d14',
    color: '#ffffff',
    minHeight: '100vh',
    fontFamily: "'Inter', sans-serif",
  },
  navbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 50px',
    borderBottom: '1px solid #1e293b',
  },
  brandLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoIcon: {
    fontSize: '20px',
    backgroundColor: '#00f2fe',
    padding: '6px',
    borderRadius: '50%',
    color: '#000',
  },
  brandTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#ffffff',
  },
  navLinks: {
    display: 'flex',
    gap: '20px',
  },
  navLink: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '14px',
  },
  activeNavLink: {
    background: 'none',
    border: 'none',
    color: '#00f2fe',
    fontWeight: 'bold',
    cursor: 'pointer',
    fontSize: '14px',
  },
  authGroup: {
    display: 'flex',
    gap: '15px',
  },
  signInBtn: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
  },
  getStartedBtn: {
    backgroundColor: '#00f2fe',
    color: '#000',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '20px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  mainContainer: {
    padding: '40px 50px',
  },
  heroLayout: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '40px',
  },
  heroLeft: {
    flex: 1,
  },
  badge: {
    display: 'inline-block',
    padding: '6px 14px',
    borderRadius: '20px',
    backgroundColor: '#132338',
    color: '#00f2fe',
    fontSize: '12px',
    marginBottom: '20px',
  },
  heroTitle: {
    fontSize: '52px',
    fontWeight: '800',
    lineHeight: '1.1',
    margin: '0 0 20px 0',
  },
  highlightText: {
    color: '#00f2fe',
  },
  heroDescription: {
    fontSize: '16px',
    color: '#94a3b8',
    maxWidth: '500px',
    lineHeight: '1.6',
    marginBottom: '25px',
  },
  uploadCard: {
    backgroundColor: '#111827',
    padding: '20px',
    borderRadius: '12px',
    border: '1px solid #1e293b',
    marginBottom: '25px',
  },
  uploadInputRow: {
    display: 'flex',
    gap: '10px',
  },
  fileInput: {
    color: '#cbd5e1',
    flex: 1,
  },
  heroButtons: {
    display: 'flex',
    gap: '15px',
    marginBottom: '25px',
  },
  startFreeBtn: {
    backgroundColor: '#00f2fe',
    color: '#000',
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
  seeHowBtn: {
    backgroundColor: 'transparent',
    color: '#ffffff',
    padding: '12px 24px',
    borderRadius: '8px',
    border: '1px solid #334155',
    cursor: 'pointer',
  },
  featureBadges: {
    display: 'flex',
    gap: '20px',
    color: '#64748b',
    fontSize: '13px',
  },
  heroRight: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  phoneMockup: {
    width: '320px',
    backgroundColor: '#111827',
    borderRadius: '24px',
    padding: '20px',
    border: '1px solid #1e293b',
    boxShadow: '0 20px 50px rgba(0, 242, 254, 0.1)',
  },
  mockupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '15px',
  },
  mockupLogo: {
    backgroundColor: '#00f2fe',
    padding: '6px',
    borderRadius: '50%',
    color: '#000',
  },
  widgetCard: {
    backgroundColor: '#1e293b',
    padding: '15px',
    borderRadius: '12px',
  },
  scheduleItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '13px',
    borderBottom: '1px solid #334155',
  },
  tabContainer: {
    backgroundColor: '#111827',
    padding: '30px',
    borderRadius: '16px',
    border: '1px solid #1e293b',
  },
  cardItem: {
    backgroundColor: '#1e293b',
    padding: '15px',
    borderRadius: '8px',
    marginBottom: '15px',
  },
  optionBtn: {
    backgroundColor: '#0f172a',
    color: '#ffffff',
    border: '1px solid #334155',
    padding: '10px',
    borderRadius: '6px',
    textAlign: 'left',
    cursor: 'pointer',
  },
  flashcardBox: {
    backgroundColor: '#1e293b',
    padding: '20px',
    borderRadius: '12px',
    width: '220px',
    border: '1px solid #334155',
  },
  chatBoxGroup: {
    marginTop: '20px',
  },
  messageList: {
    minHeight: '200px',
    maxHeight: '300px',
    overflowY: 'auto',
    backgroundColor: '#0f172a',
    padding: '15px',
    borderRadius: '8px',
  },
  myMsg: {
    textAlign: 'right',
    marginBottom: '10px',
    color: '#00f2fe',
  },
  otherMsg: {
    textAlign: 'left',
    marginBottom: '10px',
    color: '#ffffff',
  },
  textInput: {
    flex: 1,
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #334155',
    backgroundColor: '#0f172a',
    color: '#fff',
  },
  actionBtn: {
    backgroundColor: '#00f2fe',
    color: '#000',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontWeight: 'bold',
    cursor: 'pointer',
  }
};

export default App;
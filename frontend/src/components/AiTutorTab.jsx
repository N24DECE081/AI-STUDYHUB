import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import robotImg from '../assets/robot-capybara.png';

function AiTutorTab({ currentDocument }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  useEffect(() => {
    if (currentDocument && currentDocument.id) {
      fetch(`http://localhost:8081/api/documents/${currentDocument.id}/messages`)
        .then((res) => res.json())
        .then((data) => setMessages(data))
        .catch((err) => console.error("Lỗi tải lịch sử chat:", err));
    }
  }, [currentDocument]);

  const handleSendQuestion = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    if (!currentDocument) return alert('Vui lòng chọn tài liệu trước!');

    const userQuery = question;
    setQuestion('');
    setLoading(true);

    // Thêm tin nhắn User & Tin nhắn AI rỗng để bắt đầu Stream
    setMessages((prev) => [
      ...prev,
      { sender: 'USER', content: userQuery },
      { sender: 'AI', content: '' }
    ]);

    try {
      const response = await fetch('http://localhost:8081/api/documents/chat-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: currentDocument.id,
          context: currentDocument.extractedText,
          question: userQuery,
        }),
      });

      if (!response.body) throw new Error('Không nhận được luồng dữ liệu!');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Cập nhật từng từ nhận được vào khung chat ngay lập tức
        setMessages((prev) => {
          const newMsgs = [...prev];
          const lastMsg = newMsgs[newMsgs.length - 1];
          if (lastMsg && lastMsg.sender === 'AI') {
            lastMsg.content += chunk;
          }
          return newMsgs;
        });
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '78vh' }}>
      <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #2e264d', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img src={robotImg} alt="AI Tutor Bot" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
        <div>
          <h2 style={{ fontSize: '18px', color: '#ffffff', margin: 0 }}>Học cùng AI Tutor (Phản hồi siêu tốc)</h2>
          <p style={{ fontSize: '12px', color: '#a78bfa', margin: 0 }}>
            Đang trao đổi về: <strong style={{ color: '#ffffff' }}>{currentDocument ? currentDocument.fileName : 'Chưa chọn tài liệu'}</strong>
          </p>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 ? (
          <div style={{ margin: 'auto', textAlign: 'center' }}>
            <img src={robotImg} alt="AI Tutor Bot" style={{ width: '90px', height: '90px', objectFit: 'contain', marginBottom: '12px' }} />
            <p style={{ color: '#64748b', fontSize: '14px' }}>Hỏi bất kỳ câu hỏi nào để trải nghiệm tốc độ phản hồi từ AI!</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div
              key={index}
              style={{
                alignSelf: msg.sender === 'USER' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: msg.sender === 'USER' ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' : '#231b3e',
                color: msg.sender === 'USER' ? '#ffffff' : '#e2e8f0',
                padding: '14px 18px',
                borderRadius: '16px',
                border: msg.sender === 'USER' ? 'none' : '1px solid #362a5b',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                lineHeight: '1.6'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                {msg.sender === 'AI' && (
                  <img src={robotImg} alt="AI Avatar" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
                )}
                <strong style={{ fontSize: '11px', color: msg.sender === 'USER' ? '#ddd6fe' : '#a78bfa' }}>
                  {msg.sender === 'USER' ? 'Bạn' : 'AI Tutor'}
                </strong>
              </div>

              {msg.sender === 'AI' ? (
                <div style={{ fontSize: '14px', lineHeight: '1.7' }}>
                  <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ fontSize: '14px' }}>{msg.content}</div>
              )}
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={handleSendQuestion} style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={currentDocument ? "Hỏi câu hỏi bất kỳ..." : "Vui lòng chọn tài liệu để hỏi..."}
          disabled={!currentDocument || loading}
          style={{ flex: 1, padding: '14px', background: '#0f0c1b', border: '1px solid #3b2d5d', borderRadius: '12px', color: '#ffffff', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={!currentDocument || loading}
          style={{ padding: '14px 28px', background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          {loading ? 'Đang gửi...' : 'Gửi'}
        </button>
      </form>
    </div>
  );
}

export default AiTutorTab;

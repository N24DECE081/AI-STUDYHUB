import { useState } from 'react';
import { AI_SERVICE_URL } from '../config';
import robotImg from '../assets/robot-capybara.png';

function FlashcardTab({ currentDocument }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [flippedCards, setFlippedCards] = useState({});

  const handleGenerateFlashcards = async () => {
    if (!currentDocument) return alert('Vui lòng chọn tài liệu trước!');
    setLoading(true);
    setCards([]);
    setFlippedCards({});

    try {
      const res = await fetch(`${AI_SERVICE_URL}/api/documents/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: currentDocument.extractedText }),
      });

      if (!res.ok) throw new Error('Không thể tạo Flashcard!');
      const data = await res.json();
      setCards(typeof data === 'string' ? JSON.parse(data) : data);
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleFlip = (id) => {
    setFlippedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2e264d', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', color: '#ffffff', margin: 0 }}>🎴 Flashcards Khái Niệm & Từ Vựng</h2>
          <p style={{ fontSize: '13px', color: '#a78bfa', margin: '4px 0 0 0' }}>Tài liệu: {currentDocument ? currentDocument.fileName : 'Chưa chọn'}</p>
        </div>
        <button
          onClick={handleGenerateFlashcards}
          disabled={!currentDocument || loading}
          style={{
            padding: '12px 20px', background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer'
          }}
        >
          {loading ? 'Đang trích xuất...' : '✨ Tạo Thẻ Flashcard'}
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <img src={robotImg} alt="AI Bot" style={{ width: '80px', height: '80px', marginBottom: '12px' }} />
          <p style={{ color: '#a78bfa' }}>AI đang tìm kiếm các thuật ngữ cốt lõi...</p>
        </div>
      )}

      {!loading && cards.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Nhấn nút <strong>"Tạo Thẻ Flashcard"</strong> để AI ghi nhớ thuật ngữ tự động!
        </div>
      )}

      {!loading && cards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
          {cards.map((card, idx) => {
            const cardId = card.id || idx;
            const isFlipped = flippedCards[cardId];

            return (
              <div
                key={cardId}
                onClick={() => toggleFlip(cardId)}
                style={{
                  height: '200px', background: isFlipped ? 'linear-gradient(135deg, #2e2354 0%, #1c1538 100%)' : '#1e1838',
                  borderRadius: '16px', border: '1px solid #362a5b', padding: '20px', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'all 0.3s ease'
                }}
              >
                {!isFlipped ? (
                  <div>
                    <span style={{ fontSize: '11px', color: '#a78bfa', textTransform: 'uppercase', letterSpacing: '1px' }}>Thuật ngữ</span>
                    <h3 style={{ color: '#ffffff', marginTop: '10px', fontSize: '18px' }}>{card.term}</h3>
                    <p style={{ fontSize: '11px', color: '#64748b', marginTop: '20px' }}>👆 Nhấn để xem giải thích</p>
                  </div>
                ) : (
                  <div>
                    <h4 style={{ color: '#c4b5fd', margin: '0 0 8px 0', fontSize: '14px' }}>Định nghĩa:</h4>
                    <p style={{ color: '#e2e8f0', fontSize: '13px', lineHeight: '1.5', margin: 0 }}>{card.definition}</p>
                    {card.example && (
                      <p style={{ color: '#94a3b8', fontSize: '11px', fontStyle: 'italic', marginTop: '8px' }}>Ví dụ: {card.example}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default FlashcardTab;

import React, { useState } from 'react';
import robotImg from '../assets/robot-capybara.png';

function QuizTab({ currentDocument }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});
  const [showResults, setShowResults] = useState(false);

  const handleGenerateQuiz = async () => {
    if (!currentDocument) return alert('Vui lòng chọn tài liệu trước!');
    setLoading(true);
    setQuizzes([]);
    setUserAnswers({});
    setShowResults(false);

    try {
      const res = await fetch('http://localhost:8081/api/documents/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: currentDocument.extractedText }),
      });

      if (!res.ok) throw new Error('Không thể tạo bài trắc nghiệm!');
      const data = await res.json();
      setQuizzes(typeof data === 'string' ? JSON.parse(data) : data);
    } catch (err) {
      alert('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (questionId, optionIndex) => {
    if (showResults) return;
    setUserAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const calculateScore = () => {
    let score = 0;
    quizzes.forEach((q) => {
      if (userAnswers[q.id] === q.answer) score += 1;
    });
    return score;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2e264d', paddingBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '20px', color: '#ffffff', margin: 0 }}>📝 Bài Trắc Nghiệm Ôn Tập</h2>
          <p style={{ fontSize: '13px', color: '#a78bfa', margin: '4px 0 0 0' }}>Tài liệu: {currentDocument ? currentDocument.fileName : 'Chưa chọn'}</p>
        </div>
        <button
          onClick={handleGenerateQuiz}
          disabled={!currentDocument || loading}
          style={{
            padding: '12px 20px', background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
            color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer'
          }}
        >
          {loading ? 'Đang khởi tạo câu hỏi...' : '✨ Tạo Bài Trắc Nghiệm'}
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <img src={robotImg} alt="AI Bot" style={{ width: '80px', height: '80px', marginBottom: '12px' }} />
          <p style={{ color: '#a78bfa' }}>AI đang đọc tài liệu và phân tích câu hỏi...</p>
        </div>
      )}

      {!loading && quizzes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          Nhấn nút <strong>"Tạo Bài Trắc Nghiệm"</strong> để AI sinh bộ câu hỏi ôn tập tự động!
        </div>
      )}

      {!loading && quizzes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {quizzes.map((q, index) => (
            <div key={q.id || index} style={{ background: '#1e1838', padding: '20px', borderRadius: '12px', border: '1px solid #362a5b' }}>
              <h4 style={{ color: '#ffffff', margin: '0 0 14px 0', fontSize: '15px' }}>
                Câu {index + 1}: {q.question}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {q.options.map((opt, optIdx) => {
                  const isSelected = userAnswers[q.id] === optIdx;
                  const isCorrect = q.answer === optIdx;

                  let optionBg = '#130f26';
                  let borderColor = '#2e264d';

                  if (showResults) {
                    if (isCorrect) {
                      optionBg = '#14532d';
                      borderColor = '#22c55e';
                    } else if (isSelected && !isCorrect) {
                      optionBg = '#7f1d1d';
                      borderColor = '#ef4444';
                    }
                  } else if (isSelected) {
                    optionBg = '#3b0764';
                    borderColor = '#a855f7';
                  }

                  return (
                    <div
                      key={optIdx}
                      onClick={() => handleSelectOption(q.id, optIdx)}
                      style={{
                        padding: '12px 16px', borderRadius: '8px', background: optionBg, border: `1px solid ${borderColor}`,
                        color: '#e2e8f0', cursor: showResults ? 'default' : 'pointer', transition: 'all 0.2s', fontSize: '14px'
                      }}
                    >
                      <strong>{String.fromCharCode(65 + optIdx)}.</strong> {opt}
                    </div>
                  );
                })}
              </div>

              {showResults && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: '#110d21', borderRadius: '8px', borderLeft: '4px solid #a855f7', fontSize: '13px', color: '#cbd5e1' }}>
                  💡 <strong>Giải thích:</strong> {q.explanation}
                </div>
              )}
            </div>
          ))}

          {!showResults ? (
            <button
              onClick={() => setShowResults(true)}
              disabled={Object.keys(userAnswers).length < quizzes.length}
              style={{
                padding: '14px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', marginTop: '10px'
              }}
            >
              Nộp Bài & Xem Kết Quả
            </button>
          ) : (
            <div style={{ textAlign: 'center', background: '#261d44', padding: '20px', borderRadius: '12px', border: '1px solid #7c3aed' }}>
              <h3 style={{ color: '#ffffff', margin: '0 0 8px 0' }}>🎉 Kết Quả: {calculateScore()} / {quizzes.length} Câu Đúng</h3>
              <p style={{ color: '#a78bfa', margin: 0 }}>
                {calculateScore() === quizzes.length ? 'Xuất sắc! Bạn đã nắm vững tài liệu này.' : 'Hãy tiếp tục ôn tập để cải thiện kết quả nhé!'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QuizTab;
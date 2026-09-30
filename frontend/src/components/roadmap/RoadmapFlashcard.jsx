import React, { useState } from 'react';
import { generateFlashcards } from '../../api';
import './roadmap-flashcard.css';

export default function RoadmapFlashcard({ topic, context }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flippedCards, setFlippedCards] = useState({});

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setCards([]);
    setFlippedCards({});
    try {
      const data = await generateFlashcards(topic, context);
      setCards(data.cards || []);
    } catch (err) {
      setError(err.message || 'Lỗi tạo flashcard');
    } finally {
      setLoading(false);
    }
  };

  const toggleFlip = (id) => {
    setFlippedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (cards.length === 0 && !loading && !error) {
    return (
      <div className="roadmap-flashcard-launcher">
        <button className="button is-secondary" onClick={handleGenerate}>
          Tạo Flashcard ôn tập
        </button>
      </div>
    );
  }

  return (
    <div className="roadmap-flashcard-container">
      {loading && <div className="flashcard-loading">AI đang tạo flashcard...</div>}
      {error && <div className="flashcard-error">{error}</div>}
      {cards.length > 0 && (
        <div className="flashcard-grid">
          {cards.map((card, idx) => {
            const isFlipped = flippedCards[idx];
            return (
              <div 
                key={idx} 
                className={`flashcard-item ${isFlipped ? 'is-flipped' : ''}`}
                onClick={() => toggleFlip(idx)}
              >
                {!isFlipped ? (
                  <div className="flashcard-front">
                    <span className="flashcard-badge">{card.difficulty || 'Thuật ngữ'}</span>
                    <h4 className="flashcard-question">{card.question || card.term}</h4>
                    <p className="flashcard-hint-text">👆 Nhấn để lật</p>
                  </div>
                ) : (
                  <div className="flashcard-back">
                    <h5 className="flashcard-back-title">Định nghĩa / Trả lời:</h5>
                    <p className="flashcard-answer">{card.answer || card.definition}</p>
                    {card.hint && <p className="flashcard-hint">Gợi ý: {card.hint}</p>}
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

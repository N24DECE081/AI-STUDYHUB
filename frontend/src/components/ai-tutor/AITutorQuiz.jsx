import { useState } from 'react';

/**
 * Quiz trắc nghiệm do Nova sinh trong chat: bấm chọn đáp án rồi kiểm tra ngay,
 * thay vì đọc danh sách câu hỏi dạng văn bản. Đáp án đúng do backend kèm theo.
 */
export default function AITutorQuiz({ quiz }) {
  const questions = quiz?.questions || [];
  const [picked, setPicked] = useState({});
  const [checked, setChecked] = useState(false);
  if (!questions.length) return null;

  const answered = Object.keys(picked).length;
  const correct = questions.filter((question, index) => Number(picked[index]) === question.answer_index).length;

  return (
    <section className="tutor-quiz-card">
      <header className="tutor-quiz-card-head">
        <h4>{quiz.topic || 'Quiz nhanh'}</h4>
        <span className="tutor-chip">{questions.length} câu</span>
      </header>
      <ol className="tutor-quiz-list">
        {questions.map((question, index) => {
          const isRight = Number(picked[index]) === question.answer_index;
          return (
            <li key={`${index}-${question.question}`} className={checked ? (isRight ? 'right' : 'wrong') : ''}>
              <p className="tutor-quiz-prompt">{index + 1}. {question.question}</p>
              <div className="tutor-options">
                {question.options.map((option, optionIndex) => {
                  const isPicked = Number(picked[index]) === optionIndex;
                  const isAnswer = question.answer_index === optionIndex;
                  const classes = [
                    isPicked ? 'active' : '',
                    checked && isAnswer ? 'correct' : '',
                    checked && isPicked && !isAnswer ? 'incorrect' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <label key={optionIndex} className={classes}>
                      <input
                        type="radio"
                        name={`nova-quiz-${index}`}
                        checked={isPicked}
                        onChange={() => { if (!checked) setPicked((current) => ({ ...current, [index]: optionIndex })); }}
                      />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="tutor-quiz-actions">
        {checked ? (
          <>
            <span className={`tutor-flag ${correct === questions.length ? 'ok' : 'by'}`}>Đúng {correct}/{questions.length} câu</span>
            <button type="button" className="tutor-secondary" onClick={() => { setChecked(false); setPicked({}); }}>Làm lại</button>
          </>
        ) : (
          <>
            <span className="tutor-hint">Đã chọn {answered}/{questions.length} câu</span>
            <button type="button" className="tutor-primary" disabled={!answered} onClick={() => setChecked(true)}>Kiểm tra đáp án</button>
          </>
        )}
      </div>
    </section>
  );
}

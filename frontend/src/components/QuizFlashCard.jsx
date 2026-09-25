import { useState } from "react";

const optionLetter = (index) => String.fromCharCode(65 + index);

export default function QuizFlashCard({ quiz, answers, result, currentIndex, loading, onAnswer, onNavigate, onSubmit }) {
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const question = quiz.questions[currentIndex];
  const selectedAnswer = answers[question.id];
  const itemResult = result?.items?.find((item) => item.id === question.id);
  const isLastQuestion = currentIndex === quiz.questions.length - 1;
  const hasAnsweredAll = quiz.questions.every((item) => answers[item.id] !== undefined);
  const unansweredCount = quiz.questions.length - Object.keys(answers).length;

  const requestSubmit = () => {
    if (hasAnsweredAll) onSubmit();
    else setShowSubmitConfirm(true);
  };

  return (
    <div className="quiz-flashcard-stage">
      <nav className="quiz-stepper" aria-label="Tiến độ bài Quiz">
        {quiz.questions.map((item, index) => {
          const answered = answers[item.id] !== undefined;
          const reviewed = result?.items?.find((entry) => entry.id === item.id);
          const stateClass = reviewed ? (reviewed.correct ? " is-correct" : " is-wrong") : (answered ? " is-answered" : "");
          return (
            <button type="button" className={`quiz-step${index === currentIndex ? " is-active" : ""}${stateClass}`} onClick={() => onNavigate(index)} aria-label={`Đi đến câu ${index + 1}`} aria-current={index === currentIndex ? "step" : undefined} key={item.id}>
              {index + 1}
            </button>
          );
        })}
      </nav>

      <article className={`quiz-flashcard${itemResult ? (itemResult.correct ? " is-correct" : " is-wrong") : ""}`}>
        <header className="quiz-flashcard__header">
          <span>CÂU HỎI {currentIndex + 1}/{quiz.questions.length}</span>
          <strong>{Math.round(((currentIndex + 1) / quiz.questions.length) * 100)}%</strong>
        </header>
        <div className="quiz-flashcard__question">
          <span className="quiz-flashcard__badge">?</span>
          <h3>{question.question}</h3>
        </div>
        <div className="quiz-options">
          {question.options.map((option, optionIndex) => {
            const isSelected = selectedAnswer === optionIndex;
            const optionResultClass = itemResult ? (optionIndex === itemResult.correct_index ? " is-correct" : (isSelected && !itemResult.correct ? " is-wrong" : "")) : "";
            return (
              <label className={`quiz-option${isSelected ? " is-selected" : ""}${optionResultClass}`} key={optionIndex}>
                <input type="radio" name={`question-${question.id}`} checked={isSelected} disabled={Boolean(result)} onChange={() => onAnswer(question.id, optionIndex)} />
                <b>{optionLetter(optionIndex)}</b><span>{option}</span>
              </label>
            );
          })}
        </div>
        {itemResult && <div className="quiz-explanation"><strong>{itemResult.correct ? "Đúng" : "Chưa đúng"}</strong><span>{itemResult.explanation}</span><small>{itemResult.source_title ? `${itemResult.source_title} · ` : ""}{itemResult.source_locator}</small></div>}
      </article>

      <footer className="quiz-flashcard-actions">
        <button type="button" className="btn btn-ghost" disabled={currentIndex === 0} onClick={() => onNavigate(currentIndex - 1)}>← Lùi lại</button>
        {!isLastQuestion ? (
          <button type="button" className="btn btn-primary" disabled={!result && selectedAnswer === undefined} onClick={() => onNavigate(currentIndex + 1)}>Tiếp tục →</button>
        ) : !result ? (
          <button type="button" className="btn btn-primary" disabled={loading} onClick={requestSubmit}>{loading ? "Đang chấm bài…" : "Nộp bài & xem giải thích"}</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => onNavigate(0)}>Xem lại từ đầu ↺</button>
        )}
      </footer>

      {showSubmitConfirm && (
        <div className="quiz-submit-backdrop" role="presentation" onMouseDown={() => setShowSubmitConfirm(false)}>
          <div className="quiz-submit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quiz-submit-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className="quiz-submit-dialog__icon">!</span>
            <h3 id="quiz-submit-title">Bạn chưa hoàn thành bài Quiz</h3>
            <p>Bạn còn <strong>{unansweredCount} câu chưa trả lời</strong>. Các câu này sẽ được tính là chưa đúng nếu bạn nộp bài ngay.</p>
            <div className="quiz-submit-dialog__actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowSubmitConfirm(false)}>Không, làm tiếp</button>
              <button type="button" className="btn btn-primary" onClick={() => { setShowSubmitConfirm(false); onSubmit(); }}>Có, nộp bài</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

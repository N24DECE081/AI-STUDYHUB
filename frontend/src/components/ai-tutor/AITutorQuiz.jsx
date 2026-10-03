import { useEffect, useRef, useState } from 'react';
import { getLatestQuizAttempt } from '../../api';
import { mutateStudy } from '../../utils/studySync';

/**
 * Quiz trắc nghiệm do Nova sinh trong chat: bấm chọn đáp án rồi kiểm tra ngay,
 * thay vì đọc danh sách câu hỏi dạng văn bản. Đáp án đúng do backend kèm theo.
 */
export default function AITutorQuiz({ quiz, messageId }) {
  const questions = quiz?.questions || [];
  const [picked, setPicked] = useState({});
  const [run, setRun] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const starting = useRef(null);
  const revision = useRef(0);
  const interacted = useRef(false);
  useEffect(() => {
    let active = true;
    if (quiz.quiz_id) getLatestQuizAttempt(quiz.quiz_id).then(({ attempt }) => {
      if (active && attempt && !interacted.current) {
        setRun(attempt); setResult(attempt.result); revision.current = attempt.revision || 0;
        setPicked(Object.fromEntries(Object.entries(attempt.answers).map(([key, value]) => [Number(key.slice(1)) - 1, value])));
      }
    }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [quiz.quiz_id]);
  useEffect(() => {
    const saved = (event) => {
      const { path, payload, result: value } = event.detail;
      if (path === '/quiz-attempts' && ((quiz.quiz_id && payload.quizId === quiz.quiz_id) || (messageId && payload.tutorMessageId === messageId))) setRun(value);
      if (path === `/quiz-attempts/${run?.attemptId}/answers`) setError('');
      if (path === `/quiz-attempts/${run?.attemptId}/submit`) { setResult(value); setError(''); }
    };
    window.addEventListener('studyhub:mutation-saved', saved);
    return () => window.removeEventListener('studyhub:mutation-saved', saved);
  }, [quiz.quiz_id, messageId, run?.attemptId]);
  const ensureRun = (retake = false) => {
    if (run && !retake) return Promise.resolve(run);
    if (!starting.current || retake) starting.current = mutateStudy('/quiz-attempts', {
      ...(quiz.quiz_id ? { quizId: quiz.quiz_id } : { tutorMessageId: messageId }), resume: !retake,
    }).then(value => {
      if (!value.pending) {
        setRun(value); revision.current = value.revision || 0;
        setPicked(current => ({ ...Object.fromEntries(Object.entries(value.answers).map(([key, option]) => [Number(key.slice(1)) - 1, option])), ...current }));
      }
      return value;
    });
    return starting.current;
  };
  const answer = async (index, option) => {
    if (result) return;
    interacted.current = true;
    const next = { ...picked, [index]: option }; setPicked(next);
    try {
      const attempt = await ensureRun();
      const id = attempt.pending ? `:attempt:${attempt.idempotencyKey}` : attempt.attemptId;
      const saved = await mutateStudy(`/quiz-attempts/${id}/answers`, { answers: Object.fromEntries(Object.entries(next).map(([i, value]) => [`q${Number(i) + 1}`, value])), revision: ++revision.current });
      setError(saved.pending ? 'Chưa đồng bộ, sẽ thử lại khi có mạng.' : '');
    } catch (failure) { setError(failure.message); }
  };
  const check = async () => {
    setBusy(true);
    try {
      const attempt = await ensureRun();
      const id = attempt.pending ? `:attempt:${attempt.idempotencyKey}` : attempt.attemptId;
      const saved = await mutateStudy(`/quiz-attempts/${id}/submit`, { answers: Object.fromEntries(Object.entries(picked).map(([i, value]) => [`q${Number(i) + 1}`, value])) });
      if (saved.pending) setError('Chưa đồng bộ, sẽ thử lại khi có mạng.'); else { setResult(saved); setError(''); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const retake = async () => {
    setBusy(true);
    try { setResult(null); setPicked({}); setRun(null); revision.current = 0; await ensureRun(true); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const checked = Boolean(result);
  if (!questions.length) return null;

  const answered = Object.keys(picked).length;
  const correct = result?.score || 0;

  return (
    <section className="tutor-quiz-card">
      <header className="tutor-quiz-card-head">
        <h4>{quiz.topic || 'Quiz nhanh'}</h4>
        <span className="tutor-chip">{questions.length} câu</span>
      </header>
      <ol className="tutor-quiz-list">
        {questions.map((question, index) => {
          const item = result?.items?.find(item => item.id === `q${index + 1}`);
          const isRight = item?.correct;
          return (
            <li key={`${index}-${question.question}`} className={checked ? (isRight ? 'right' : 'wrong') : ''}>
              <p className="tutor-quiz-prompt">{index + 1}. {question.question}</p>
              <div className="tutor-options">
                {question.options.map((option, optionIndex) => {
                  const isPicked = Number(picked[index]) === optionIndex;
                  const isAnswer = item?.correct_index === optionIndex;
                  const classes = [
                    isPicked ? 'active' : '',
                    checked && isAnswer ? 'correct' : '',
                    checked && isPicked && !isAnswer ? 'incorrect' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <label key={optionIndex} className={classes}>
                      <input
                        type="radio"
                        name={`nova-quiz-${quiz.quiz_id || messageId}-${index}`}
                        checked={isPicked}
                        disabled={checked || busy}
                        onChange={() => answer(index, optionIndex)}
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
      {error && <p className="tutor-error" role="alert">{error}</p>}
      <div className="tutor-quiz-actions">
        {checked ? (
          <>
            <span className={`tutor-flag ${correct === questions.length ? 'ok' : 'by'}`}>Đúng {correct}/{questions.length} câu</span>
            <button type="button" className="tutor-secondary" disabled={busy} onClick={retake}>Làm lại</button>
          </>
        ) : (
          <>
            <span className="tutor-hint">Đã chọn {answered}/{questions.length} câu</span>
            <button type="button" className="tutor-primary" disabled={!answered || busy} onClick={check}>Kiểm tra đáp án</button>
          </>
        )}
      </div>
    </section>
  );
}

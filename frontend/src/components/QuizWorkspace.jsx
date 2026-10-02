import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, ArrowLeft, RotateCcw } from 'lucide-react';
import { saveQuizAnswers, submitQuiz } from '../api';
import QuizFlashCard from './QuizFlashCard';
import QuizResultSummary from './QuizResultSummary';

export default function QuizWorkspace({ quiz, onBack, onRetake }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [review, setReview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(0);
  const [current, setCurrent] = useState(0);
  const [now, setNow] = useState(() => quiz.run.server_now);
  const [clockOffset] = useState(() => Date.now()/1000 - quiz.run.server_now);
  const revision = useRef(0);
  const submitting = useRef(false);
  const autoSubmitted = useRef(false);
  const remaining = quiz.run.deadline ? Math.max(0,Math.ceil(quiz.run.deadline-now)) : null;
  const expired = remaining===0;
  useEffect(() => {
    if (!quiz.run.deadline || result) return;
    const timer=setInterval(() => setNow(Date.now()/1000-clockOffset),500);
    return () => clearInterval(timer);
  }, [quiz.run.deadline,result,clockOffset]);
  const submit = useCallback(async () => {
    if (submitting.current || result) return;
    submitting.current=true;setLoading(true);setError('');
    try {setResult(await submitQuiz(quiz.id,answers,quiz.run.run_id));}
    catch {setError('Chưa nộp được bài. Đáp án đang giữ nguyên, vui lòng bấm nộp lại.');}
    finally {submitting.current=false;setLoading(false);}
  },[quiz.id,quiz.run.run_id,answers,result]);
  useEffect(() => {
    if (!expired || result || autoSubmitted.current) return;
    autoSubmitted.current=true;
    // Schedule submission outside the effect body, preserving the latest answer snapshot.
    const timer=setTimeout(() => {submit();},0);
    return () => {clearTimeout(timer);autoSubmitted.current=false;};
  },[expired,result,submit]);
  const answer = async (id,index) => {
    if (expired || result || submitting.current) return;
    const next={...answers,[id]:index};setAnswers(next);setSaving((n) => n+1);
    try {await saveQuizAnswers(quiz.id,quiz.run.run_id,next,++revision.current);}
    catch {setError('Chưa đồng bộ được đáp án. Kiểm tra kết nối; đáp án trên màn hình vẫn được giữ.');}
    finally {setSaving((n) => n-1);}
  };
  return <section className="qc-taking" aria-label="Làm bài trắc nghiệm">
    <header><button className="btn btn-ghost" disabled={loading} onClick={onBack}><ArrowLeft size={18}/>Về Quiz Card</button><small>{quiz.subject || 'Chưa phân loại'}</small>
      {!result && remaining!==null && <strong className={`qc-timer ${remaining<60 ? 'is-urgent' : ''}`} role="timer"><Clock size={17}/>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</strong>}</header>
    <h1>{quiz.title}</h1>
    {!result && <><p>Đã trả lời {Object.keys(answers).length} / {quiz.questions.length} câu</p><progress max={quiz.questions.length} value={Object.keys(answers).length} aria-label="Tiến độ trả lời"/></>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!result && saving>0 && <small role="status">Đang lưu đáp án…</small>}
    {!result && expired && <p role="status">Đã hết thời gian. Bài được chấm theo đáp án đã lưu trước hạn.</p>}
    {(!result || review) && <QuizFlashCard quiz={quiz} answers={answers} result={result} currentIndex={current} loading={loading} answerDisabled={expired} onAnswer={answer} onNavigate={setCurrent} onSubmit={submit}/>}
    {result && <><div className="qc-finished"><span>✓</span><h2>Hoàn thành bài trắc nghiệm!</h2><strong>{result.score} / {result.total}</strong><p>Đúng: {result.score} · Sai: {result.total-result.score} · Thời gian: {Math.floor((result.duration || 0)/60)} phút {(result.duration || 0)%60} giây</p><div><button className="btn qc-mint" onClick={onRetake}><RotateCcw size={17}/>Làm lại</button><button className="btn btn-primary" onClick={() => {setReview(true);setCurrent(0);}}>Xem đáp án</button><button className="btn btn-ghost" onClick={onBack}>Về Quiz Card</button></div></div><QuizResultSummary quiz={quiz} result={result} onReviewQuestion={(index) => {setReview(true);setCurrent(index);}}/></>}
  </section>;
}

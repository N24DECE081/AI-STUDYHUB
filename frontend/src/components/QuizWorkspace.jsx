import { useEffect, useMemo, useState } from "react";
import { createQuiz, getQuizHistory, submitQuiz } from "../api";
import QuizFlashCard from "./QuizFlashCard";
import QuizResultSummary from "./QuizResultSummary";

const fieldStyle = {
  width: "100%",
  border: "1px solid rgba(148, 163, 184, .32)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#fff",
  color: "#172033",
};

export default function QuizWorkspace({ documents, user }) {
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState([]);
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);

  const subjects = useMemo(() => {
    const seen = new Map();
    documents.forEach((document) => {
      if (document.subject_code && !seen.has(document.subject_code)) {
        seen.set(document.subject_code, document.subject_name || document.subject_code);
      }
    });
    return [...seen.entries()];
  }, [documents]);
  const filteredDocuments = useMemo(
    () => documents.filter((document) => subjectFilter === "all" || document.subject_code === subjectFilter),
    [documents, subjectFilter],
  );

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    getQuizHistory().then((result) => { if (active) setHistory(result.items || []); }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  const toggleDocument = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  const selectVisible = () => setSelectedIds((current) => current.length === filteredDocuments.length ? [] : filteredDocuments.map((document) => document.id));
  const generate = async () => {
    if (!selectedIds.length) {
      setError("Hãy chọn ít nhất một tài liệu.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    setAnswers({});
    setCurrentQuestion(0);
    try {
      setQuiz(await createQuiz(selectedIds));
    } catch (requestError) {
      setQuiz(null);
      setError(requestError.message || "Không thể tạo Quiz.");
    } finally {
      setLoading(false);
    }
  };
  const submit = async () => {
    if (!quiz) return;
    setLoading(true);
    setError("");
    try {
      setResult(await submitQuiz(quiz.id, answers));
    } catch (requestError) {
      setError(requestError.message || "Không thể chấm bài.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="quiz-workspace" aria-label="Quiz Card từ tài liệu">
      <div className="quiz-workspace__toolbar">
        <div>
          <span className="eyebrow">QUIZ CARD AI</span>
          <h2>Tạo Quiz từ một hoặc nhiều tài liệu</h2>
          <p className="muted">Chọn theo môn học, tổng hợp tối đa 30 câu, làm bài và xem giải thích ngay sau khi nộp.</p>
        </div>
        <label className="quiz-subject-filter">
          <span>Môn học</span>
          <select value={subjectFilter} onChange={(event) => { setSubjectFilter(event.target.value); setSelectedIds([]); }} style={fieldStyle}>
            <option value="all">Tất cả môn học</option>
            {subjects.map(([code, name]) => <option value={code} key={code}>{code} · {name}</option>)}
          </select>
        </label>
      </div>

      {!quiz && <>
        <div className="quiz-picker-actions"><span>{selectedIds.length} tài liệu đã chọn · tối đa 30 câu</span><button type="button" className="text-link" onClick={selectVisible}>{filteredDocuments.length > 0 && selectedIds.length === filteredDocuments.length ? "Bỏ chọn tất cả" : "Chọn tất cả môn này"}</button></div>
        <div className="quiz-document-picker">
          {filteredDocuments.map((document) => (
            <label className={`quiz-document-option${selectedIds.includes(document.id) ? " selected" : ""}`} key={document.id}>
              <input type="checkbox" checked={selectedIds.includes(document.id)} onChange={() => toggleDocument(document.id)} />
              <span><strong>{document.title}</strong><small>{document.subject_code} · {document.original_filename || document.file_name}</small></span>
            </label>
          ))}
          {!filteredDocuments.length && <p className="empty-state">Chưa có tài liệu trong môn học này. Hãy upload tài liệu trước.</p>}
        </div>
        <button type="button" className="btn btn-primary" onClick={generate} disabled={loading || !filteredDocuments.length}>{loading ? "AI đang đọc tài liệu…" : `Tạo Quiz Card (${selectedIds.length} tài liệu)`}</button>
      </>}

      {quiz && <div className="quiz-question-list">
        <div className="quiz-result-head"><div><span className="eyebrow">BỘ QUIZ ĐANG LÀM · {quiz.questions.length} CÂU</span><h2>{quiz.title}</h2></div><button type="button" className="btn btn-ghost" onClick={() => { setQuiz(null); setResult(null); }}>Chọn lại tài liệu</button></div>
        <QuizFlashCard quiz={quiz} answers={answers} result={result} currentIndex={currentQuestion} loading={loading} onAnswer={(questionId, optionIndex) => setAnswers((current) => ({ ...current, [questionId]: optionIndex }))} onNavigate={setCurrentQuestion} onSubmit={submit} />
        {result && <QuizResultSummary quiz={quiz} result={result} onReviewQuestion={setCurrentQuestion} />}
      </div>}
      {!quiz && <section className="quiz-history"><div><span className="eyebrow">LỊCH SỬ ÔN TẬP</span><h3>Các bài Quiz đã làm</h3></div>{history.length ? <div className="quiz-history-list">{history.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.question_count} câu · {new Date(item.created_at).toLocaleDateString("vi-VN")}</small></div>{item.attempts?.length ? <b>{item.attempts[0].score}/{item.attempts[0].total} · {item.attempts[0].score_10}/10</b> : <span>Chưa nộp bài</span>}</article>)}</div> : <p className="muted">Chưa có lịch sử. Hãy chọn tài liệu để bắt đầu bài Quiz đầu tiên.</p>}</section>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

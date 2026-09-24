import { useEffect, useMemo, useState } from "react";
import { createQuiz, getQuizHistory, submitQuiz } from "../api";

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
    if (!quiz || Object.keys(answers).length !== quiz.questions.length) {
      setError("Hãy trả lời đủ tất cả câu hỏi trước khi nộp bài.");
      return;
    }
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
        {quiz.questions.map((question, index) => {
          const itemResult = result?.items?.find((item) => item.id === question.id);
          return <article className={`quiz-question${itemResult ? (itemResult.correct ? " is-correct" : " is-wrong") : ""}`} key={question.id}>
            <h3>Câu {index + 1}/{quiz.questions.length}: {question.question}</h3>
            <div className="quiz-options">{question.options.map((option, optionIndex) => <label key={optionIndex} className="quiz-option"><input type="radio" name={`question-${question.id}`} checked={answers[question.id] === optionIndex} disabled={Boolean(result)} onChange={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))} /><span>{String.fromCharCode(65 + optionIndex)}. {option}</span></label>)}</div>
            {itemResult && <div className="quiz-explanation"><strong>{itemResult.correct ? "Đúng" : "Sai"}</strong> · {itemResult.explanation} <small>{itemResult.source_title ? `${itemResult.source_title} · ` : ""}{itemResult.source_locator}</small></div>}
          </article>;
        })}
        {!result ? <button type="button" className="btn btn-primary" onClick={submit} disabled={loading}>{loading ? "Đang chấm bài…" : "Nộp bài & xem giải thích"}</button> : <div className="quiz-score"><strong>Kết quả: {result.score}/{result.total} câu đúng · {result.score_30}/30 · {result.score_10}/10</strong><span>{result.weak_count ? `Cần ôn lại ${result.weak_count} câu sai bên dưới, theo đúng tài liệu nguồn.` : "Tuyệt vời — bạn trả lời đúng toàn bộ câu hỏi."}</span>{result.weak_items?.length > 0 && <div className="quiz-weak-list"><b>Điểm cần khắc phục</b>{result.weak_items.slice(0, 6).map((item) => <span key={item.id}>{item.source_title || "Tài liệu"} · {item.source_locator}</span>)}</div>}</div>}
      </div>}
      {!quiz && <section className="quiz-history"><div><span className="eyebrow">LỊCH SỬ ÔN TẬP</span><h3>Các bài Quiz đã làm</h3></div>{history.length ? <div className="quiz-history-list">{history.map((item) => <article key={item.id}><div><strong>{item.title}</strong><small>{item.question_count} câu · {new Date(item.created_at).toLocaleDateString("vi-VN")}</small></div>{item.attempts?.length ? <b>{item.attempts[0].score}/{item.attempts[0].total} · {item.attempts[0].score_10}/10</b> : <span>Chưa nộp bài</span>}</article>)}</div> : <p className="muted">Chưa có lịch sử. Hãy chọn tài liệu để bắt đầu bài Quiz đầu tiên.</p>}</section>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

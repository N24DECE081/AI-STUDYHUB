import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// remark-gfm: phần nhận xét của model cũng có thể chứa bảng markdown.
const REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }], [remarkMath, { singleDollarTextMath: true }]];
const REHYPE_PLUGINS = [[rehypeKatex, { throwOnError: false, strict: false, trust: false }]];
const GRADE_CLASS = { Excellent: 'excellent', 'Very Good': 'very-good', Good: 'good', Pass: 'pass', 'Needs Improvement': 'needs-improvement' };

const Block = ({ title, items, tone }) => (items?.length ? <div className={`tutor-grade-block ${tone || ''}`}><h4>{title}</h4><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div> : null);

export default function AITutorGrading({ result, onRetry, onNext, busy }) {
  if (!result) return null;
  return <section className="tutor-grading" aria-live="polite">
    <header className="tutor-grading-head">
      <div>
        <span className="tutor-overline">KẾT QUẢ CHẤM ĐIỂM</span>
        <h3>{result.exercise_type === 'multiple_choice' ? 'Trắc nghiệm' : result.exercise_type === 'code' ? 'Bài tập lập trình' : result.exercise_type === 'math' ? 'Bài tập tính toán' : result.exercise_type === 'essay' ? 'Bài tự luận' : 'Câu trả lời ngắn'} · {result.topic}</h3>
      </div>
      <span className={`tutor-grade-badge ${GRADE_CLASS[result.grade] || ''}`}>{result.grade}</span>
    </header>
    <div className="tutor-score-row">
      <strong>{result.score}</strong><span>/ {result.max_score} điểm</span>
      <div className="tutor-score-bar"><i style={{ width: `${Math.min(100, Math.max(0, result.percentage))}%` }} /></div>
      <span className="tutor-score-percent">{result.percentage}%</span>
      <span className={result.is_correct ? 'tutor-flag ok' : 'tutor-flag off'}>{result.is_correct ? 'Đúng' : 'Chưa đạt'}</span>
      <span className="tutor-flag by">{result.graded_by === 'ai' ? 'Nova (AI) chấm' : 'Chấm tự động'}</span>
    </div>
    <div className="tutor-grade-feedback"><ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>{result.feedback}</ReactMarkdown></div>
    <div className="tutor-grade-grid">
      <Block title="Điểm mạnh" items={result.strengths} tone="ok" />
      <Block title="Cần cải thiện" items={result.weaknesses} tone="warn" />
      <Block title="Ý còn thiếu" items={result.missing_points} tone="warn" />
      <Block title="Ôn lại" items={result.recommended_review} tone="info" />
    </div>
    {result.suggested_answer ? <details className="tutor-suggested"><summary>Đáp án gợi ý</summary><ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>{result.suggested_answer}</ReactMarkdown></details> : null}
    {result.adaptation?.note ? <p className="tutor-adapt-note">Lộ trình đã điều chỉnh: {result.adaptation.note}</p> : null}
    <div className="tutor-grade-actions">
      <button type="button" className="tutor-secondary" onClick={onRetry} disabled={busy}>Làm lại</button>
      {onNext ? <button type="button" className="tutor-primary" onClick={onNext} disabled={busy}>Bài tiếp theo</button> : null}
    </div>
  </section>;
}

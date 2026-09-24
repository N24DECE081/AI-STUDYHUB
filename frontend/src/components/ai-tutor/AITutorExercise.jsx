import { useEffect, useMemo, useState } from 'react';
import { getTutorExercises, getTutorRoadmap, getTutorSubmissions, submitTutorExercise } from '../../api';
import AITutorGrading from './AITutorGrading';

const ANSWER_TYPE = { multiple_choice: 'choice', math: 'math', code: 'code', short_answer: 'text', essay: 'text' };
const TYPE_LABEL = { multiple_choice: 'Trắc nghiệm', short_answer: 'Trả lời ngắn', essay: 'Tự luận', code: 'Lập trình', math: 'Tính toán' };
const DIFFICULTY_LABEL = { beginner: 'Mới bắt đầu', intermediate: 'Trung bình', advanced: 'Nâng cao' };
const FILTERS = [['all', 'Tất cả'], ['todo', 'Chưa làm'], ['done', 'Đã chấm']];

export default function AITutorExercise({ onNeedJourney }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [roadmap, setRoadmap] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [progress, setProgress] = useState(null);
  const [history, setHistory] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [results, setResults] = useState({});
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('todo');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [roadmapData, exerciseData, submissionData] = await Promise.all([getTutorRoadmap(), getTutorExercises(), getTutorSubmissions()]);
        if (!alive) return;
        const items = submissionData?.items || [];
        const latest = {};
        [...items].reverse().forEach((item) => { latest[String(item.exercise_id)] = item; });
        setRoadmap(roadmapData?.roadmap_id ? roadmapData : null);
        setExercises(exerciseData?.exercises || []);
        setProgress(exerciseData?.progress || null);
        setHistory(items);
        setResults(latest);
      } catch (loadError) {
        if (alive) setError(loadError.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => {
    const lessons = [];
    (roadmap?.modules || []).forEach((module) => (module.lessons || []).forEach((lesson) => lessons.push({ key: lesson.key, title: `${module.title} — ${lesson.title}`, ids: (lesson.exercise_ids || []).map(String) })));
    const seen = new Set();
    const built = lessons
      .map((lesson) => ({ ...lesson, items: exercises.filter((exercise) => lesson.ids.includes(String(exercise.id))) }))
      .filter((lesson) => { lesson.items.forEach((item) => seen.add(String(item.id))); return lesson.items.length > 0; });
    const rest = exercises.filter((exercise) => !seen.has(String(exercise.id)));
    if (rest.length) built.push({ key: 'other', title: 'Bài tập khác', items: rest });
    return built;
  }, [roadmap, exercises]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const visible = (items) => items.filter((item) => filter === 'all' || (filter === 'done' ? Boolean(results[String(item.id)]) : !results[String(item.id)]));

  const submit = async (exercise) => {
    const answer = String(drafts[exercise.id] ?? '').trim();
    if (!answer) { setError('Hãy nhập câu trả lời trước khi nộp bài.'); return; }
    setBusy(String(exercise.id)); setError('');
    try {
      const result = await submitTutorExercise(exercise.id, { answer, answerType: ANSWER_TYPE[exercise.exercise_type] || 'text' });
      setResults((current) => ({ ...current, [String(exercise.id)]: result }));
      if (result.progress) setProgress(result.progress);
      if (result.adaptation?.note) setRoadmap((current) => (current ? { ...current, adaptation_note: result.adaptation.note, progress: result.progress || current.progress } : current));
      const submissionData = await getTutorSubmissions();
      setHistory(submissionData?.items || []);
      // Bài vừa chấm rời khỏi bộ lọc "Chưa làm": mở lại bộ lọc Tất cả để học viên
      // nhìn thấy ngay điểm và nhận xét của mình.
      setFilter((current) => (current === 'todo' ? 'all' : current));
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy('');
    }
  };

  const goNext = (exercise) => {
    const index = flat.findIndex((item) => String(item.id) === String(exercise.id));
    const next = flat[index + 1];
    if (next) { setFilter('all'); setOpenId(String(next.id)); } else { setOpenId(null); }
  };

  if (loading) return <div className="tutor-panel"><p className="tutor-hint">Đang tải bài tập…</p></div>;

  if (!exercises.length) return <div className="tutor-panel"><section className="tutor-card">
    <h3>Chưa có bài tập</h3>
    <p className="tutor-hint">Hoàn thành phần đánh giá và tạo lộ trình học trước, Nova sẽ sinh bài tập theo từng bài học cho bạn.</p>
    <div className="tutor-card-actions"><button type="button" className="tutor-primary" onClick={onNeedJourney}>Đi tới lộ trình học</button></div>
  </section></div>;

  return <div className="tutor-panel">
    {error ? <p className="tutor-error tutor-panel-error">{error}</p> : null}
    <section className="tutor-card tutor-practice-head">
      <div>
        <span className="tutor-overline">LUYỆN TẬP &amp; CHẤM ĐIỂM</span>
        <h3>{roadmap?.title || 'Bài tập theo lộ trình'}</h3>
        <p className="tutor-hint">{progress?.graded || 0}/{progress?.total_exercises || exercises.length} bài đã chấm · trung bình {progress?.average_percentage || 0}%</p>
      </div>
      <div className="tutor-score-bar"><i style={{ width: `${Math.min(100, Math.max(0, progress?.average_percentage || 0))}%` }} /></div>
      <div className="tutor-filters">{FILTERS.map(([id, label]) => <button type="button" key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>
    </section>

    {groups.map((group) => {
      const items = visible(group.items);
      if (!items.length) return null;
      return <section className="tutor-exercise-group" key={group.key}>
        <h4>{group.title}</h4>
        {items.map((exercise) => {
          const result = results[String(exercise.id)];
          const isOpen = openId === String(exercise.id);
          return <article className={`tutor-exercise ${isOpen ? 'open' : ''}`} key={exercise.id}>
            <button type="button" className="tutor-exercise-head" onClick={() => setOpenId(isOpen ? null : String(exercise.id))}>
              <span className="tutor-chip">{TYPE_LABEL[exercise.exercise_type] || exercise.exercise_type}</span>
              <strong>{exercise.prompt.length > 96 ? `${exercise.prompt.slice(0, 96)}…` : exercise.prompt}</strong>
              <span className="tutor-hint">{DIFFICULTY_LABEL[exercise.difficulty] || exercise.difficulty} · {exercise.max_score} điểm</span>
              {result ? <span className={`tutor-grade-pill ${result.is_correct ? 'ok' : 'off'}`}>{result.score}/{result.max_score}</span> : <span className="tutor-grade-pill todo">Chưa làm</span>}
            </button>
            {isOpen ? <div className="tutor-exercise-body">
              <p className="tutor-exercise-prompt">{exercise.prompt}</p>
              {exercise.exercise_type === 'multiple_choice' && exercise.options?.length
                ? <div className="tutor-options">{exercise.options.map((option, optionIndex) => <label key={`${exercise.id}-${optionIndex}`} className={String(drafts[exercise.id] || '') === option ? 'active' : ''}><input type="radio" name={`exercise-${exercise.id}`} checked={String(drafts[exercise.id] || '') === option} onChange={() => setDrafts({ ...drafts, [exercise.id]: option })} /><span>{option}</span></label>)}</div>
                : exercise.exercise_type === 'math'
                  ? <input className="tutor-answer-input" value={drafts[exercise.id] || ''} onChange={(event) => setDrafts({ ...drafts, [exercise.id]: event.target.value })} inputMode="decimal" placeholder="Nhập kết quả bằng số" />
                  : <textarea className={`tutor-answer-input ${exercise.exercise_type === 'code' ? 'code' : ''}`} rows={exercise.exercise_type === 'code' ? 8 : 5} value={drafts[exercise.id] || ''} onChange={(event) => setDrafts({ ...drafts, [exercise.id]: event.target.value })} placeholder={exercise.exercise_type === 'code' ? 'Viết mã của bạn ở đây…' : 'Viết câu trả lời của bạn…'} />}
              <div className="tutor-card-actions">
                <button type="button" className="tutor-primary" onClick={() => submit(exercise)} disabled={busy !== ''}>{busy === String(exercise.id) ? 'Đang chấm…' : result ? 'Nộp lại' : 'Nộp bài'}</button>
                <span className="tutor-hint">Chấm ở backend: trắc nghiệm và bài tính đối chiếu đáp án, bài viết do Nova chấm theo rubric.</span>
              </div>
              <AITutorGrading result={result} busy={busy !== ''} onRetry={() => submit(exercise)} onNext={() => goNext(exercise)} />
            </div> : null}
          </article>;
        })}
      </section>;
    })}

    {history.length ? <section className="tutor-card">
      <h4>Đã chấm gần đây</h4>
      <ul className="tutor-history">{history.slice(0, 6).map((item) => <li key={item.submission_id}><span className="tutor-chip">{TYPE_LABEL[item.exercise_type] || item.exercise_type}</span><span>{item.topic}</span><span className="tutor-hint">{item.score}/{item.max_score} · {item.grade}</span></li>)}</ul>
    </section> : null}
  </div>;
}

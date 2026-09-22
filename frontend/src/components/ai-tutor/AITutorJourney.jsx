import { useEffect, useState } from 'react';
import { generateTutorRoadmap, getTutorAssessment, getTutorRoadmap, startTutorAssessment, submitTutorAssessment } from '../../api';

const LEVELS = [['beginner', 'Mới bắt đầu'], ['intermediate', 'Đã có nền tảng'], ['advanced', 'Nâng cao']];
const PACES = [['slow', 'Chậm mà chắc'], ['steady', 'Đều đặn'], ['fast', 'Cấp tốc']];
const LEVEL_LABEL = { beginner: 'Mới bắt đầu', intermediate: 'Trung bình', advanced: 'Nâng cao' };
const STEPS = [['goal', '1 · Mục tiêu'], ['quiz', '2 · Đánh giá'], ['result', '3 · Trình độ'], ['roadmap', '4 · Lộ trình']];
const numberField = (value) => Number(String(value).replace(/[^\d]/g, '')) || 0;

export default function AITutorJourney({ onPractice }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState('goal');
  const [questions, setQuestions] = useState([]);
  const [assessment, setAssessment] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [answers, setAnswers] = useState({});
  const [form, setForm] = useState({ subject: '', goal: '', target_level: 'intermediate', pace: 'steady', study_time: 240, topics: '' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [assessmentData, roadmapData] = await Promise.all([getTutorAssessment(), getTutorRoadmap()]);
        if (!alive) return;
        const latest = assessmentData?.assessment || null;
        setQuestions(assessmentData?.questions || []);
        setAssessment(latest);
        setRoadmap(roadmapData?.roadmap_id ? roadmapData : null);
        setStep(roadmapData?.roadmap_id ? 'roadmap' : latest ? 'result' : 'goal');
        if (latest) setForm((current) => ({ ...current, subject: latest.subject || '', goal: latest.goal || '', target_level: latest.target_level || 'intermediate', pace: latest.pace || 'steady', study_time: latest.study_time || 240 }));
      } catch (loadError) {
        if (alive) setError(loadError.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const payloadBase = () => ({ subject: form.subject.trim(), goal: form.goal.trim(), target_level: form.target_level, pace: form.pace, study_time: numberField(form.study_time), topics: form.topics.split(',').map((item) => item.trim()).filter(Boolean) });

  const beginQuiz = async () => {
    if (!form.subject.trim() || !form.goal.trim()) { setError('Hãy nhập môn học và mục tiêu học tập trước khi đánh giá.'); return; }
    setBusy('quiz'); setError('');
    try {
      const plan = await startTutorAssessment(payloadBase());
      setQuestions(plan.questions || []);
      setAnswers({});
      setStep('quiz');
    } catch (quizError) { setError(quizError.message); } finally { setBusy(''); }
  };

  const submitQuiz = async () => {
    setBusy('submit'); setError('');
    try {
      const result = await submitTutorAssessment({ ...payloadBase(), answers: questions.map((question) => ({ key: question.key, answer: String(answers[question.key] ?? '').trim() })) });
      setAssessment(result);
      setStep('result');
    } catch (submitError) { setError(submitError.message); } finally { setBusy(''); }
  };

  const buildRoadmap = async () => {
    setBusy('roadmap'); setError('');
    try {
      const data = await generateTutorRoadmap({ ...payloadBase(), assessment_id: assessment?.assessment_id });
      setRoadmap(data);
      setStep('roadmap');
    } catch (roadmapError) { setError(roadmapError.message); } finally { setBusy(''); }
  };

  if (loading) return <div className="tutor-panel"><p className="tutor-hint">Đang tải lộ trình học…</p></div>;

  const answered = questions.filter((question) => String(answers[question.key] ?? '').trim()).length;

  return <div className="tutor-panel">
    {error ? <p className="tutor-error tutor-panel-error">{error}</p> : null}
    <nav className="tutor-steps" aria-label="Các bước lộ trình học">{STEPS.map(([id, label]) => <button type="button" key={id} className={step === id ? 'active' : ''} onClick={() => setStep(id)} disabled={busy !== ''}>{label}</button>)}</nav>

    {step === 'goal' ? <section className="tutor-card">
      <h3>Mục tiêu học tập</h3>
      <p className="tutor-hint">Cho Nova biết bạn đang học gì và muốn đạt được điều gì. Nova sẽ đánh giá trình độ rồi dựng lộ trình riêng cho bạn.</p>
      <div className="tutor-form-grid">
        <label>Môn học / chủ đề<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Ví dụ: Java OOP" /></label>
        <label>Mục tiêu<input value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="Ví dụ: làm chủ kế thừa và đa hình" /></label>
        <label>Trình độ mong muốn<select value={form.target_level} onChange={(event) => setForm({ ...form, target_level: event.target.value })}>{LEVELS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Nhịp học<select value={form.pace} onChange={(event) => setForm({ ...form, pace: event.target.value })}>{PACES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Thời gian mỗi tuần (phút)<input value={form.study_time} onChange={(event) => setForm({ ...form, study_time: event.target.value })} inputMode="numeric" placeholder="240" /></label>
        <label>Chủ đề ưu tiên<input value={form.topics} onChange={(event) => setForm({ ...form, topics: event.target.value })} placeholder="Kế thừa, Đa hình, Mảng" /></label>
      </div>
      <div className="tutor-card-actions"><button type="button" className="tutor-primary" onClick={beginQuiz} disabled={busy !== ''}>{busy === 'quiz' ? 'Đang tạo bài đánh giá…' : 'Bắt đầu đánh giá'}</button></div>
    </section> : null}

    {step === 'quiz' ? <section className="tutor-card">
      <h3>Bài đánh giá năng lực</h3>
      <p className="tutor-hint">Trả lời {questions.length} câu hỏi ngắn. Backend sẽ tự chấm và xác định trình độ hiện tại của bạn.</p>
      <ol className="tutor-quiz">{questions.map((question, index) => <li key={question.key}>
        <div className="tutor-quiz-head"><span className="tutor-chip">{question.topic}</span><span className="tutor-quiz-score">{question.max_score} điểm</span></div>
        <p className="tutor-quiz-prompt">{index + 1}. {question.prompt}</p>
        {question.options?.length ? <div className="tutor-options">{(question.options || []).map((option, optionIndex) => <label key={optionIndex} className={String(answers[question.key]) === option ? 'active' : ''}><input type="radio" name={question.key} checked={String(answers[question.key] || '') === option} onChange={() => setAnswers({ ...answers, [question.key]: option })} /><span>{option}</span></label>)}</div>
          : question.type === 'math'
            ? <input className="tutor-answer-input" value={answers[question.key] || ''} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })} inputMode="decimal" placeholder="Nhập kết quả bằng số" />
            : <textarea className="tutor-answer-input" rows="3" value={answers[question.key] || ''} onChange={(event) => setAnswers({ ...answers, [question.key]: event.target.value })} placeholder="Viết câu trả lời ngắn (3–5 câu)…" />}
      </li>)}</ol>
      <div className="tutor-card-actions"><span className="tutor-hint">Đã trả lời {answered}/{questions.length}</span><button type="button" className="tutor-primary" onClick={submitQuiz} disabled={busy !== '' || answered < questions.length}>{busy === 'submit' ? 'Đang chấm…' : 'Nộp bài đánh giá'}</button></div>
    </section> : null}

    {step === 'result' ? (assessment ? <section className="tutor-card">
      <h3>Trình độ hiện tại của bạn</h3>
      <div className="tutor-result-row">
        <span className={`tutor-level ${assessment.current_level}`}>{LEVEL_LABEL[assessment.current_level] || assessment.current_level}</span>
        <span className="tutor-hint">Điểm đánh giá {assessment.score_percent}% · Mục tiêu {LEVEL_LABEL[assessment.target_level] || assessment.target_level} · {assessment.study_time} phút/tuần</span>
      </div>
      <div className="tutor-two-col">
        <div className="tutor-grade-block ok"><h4>Điểm mạnh</h4><ul>{(assessment.strengths?.length ? assessment.strengths : ['Chưa xác định']).map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div className="tutor-grade-block warn"><h4>Cần ôn lại</h4><ul>{(assessment.weaknesses?.length ? assessment.weaknesses : ['Không có điểm yếu nổi bật']).map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
      <div className="tutor-card-actions">
        <button type="button" className="tutor-primary" onClick={buildRoadmap} disabled={busy !== ''}>{busy === 'roadmap' ? 'Đang dựng lộ trình…' : roadmap ? 'Tạo lại lộ trình' : 'Tạo lộ trình học'}</button>
        {roadmap ? <button type="button" className="tutor-secondary" onClick={() => setStep('roadmap')}>Xem lộ trình hiện tại</button> : null}
      </div>
    </section> : <section className="tutor-card"><p className="tutor-hint">Chưa có kết quả đánh giá. Hãy hoàn thành bài đánh giá trước.</p></section>) : null}

    {step === 'roadmap' ? (roadmap ? <section className="tutor-roadmap">
      <header className="tutor-roadmap-head">
        <div>
          <span className="tutor-overline">LỘ TRÌNH CÁ NHÂN HOÁ</span>
          <h3>{roadmap.title}</h3>
          <p>{roadmap.summary}</p>
        </div>
        <div className="tutor-roadmap-meta">
          <span className="tutor-chip">{roadmap.subject}</span>
          <span className={`tutor-level ${roadmap.current_level}`}>Hiện tại: {LEVEL_LABEL[roadmap.current_level] || roadmap.current_level}</span>
          <span className="tutor-chip">Mục tiêu: {LEVEL_LABEL[roadmap.target_level] || roadmap.target_level}</span>
          <span className="tutor-chip">Phiên bản {roadmap.version}</span>
        </div>
      </header>
      <div className="tutor-progress">
        <div className="tutor-score-bar"><i style={{ width: `${Math.min(100, Math.max(0, roadmap.progress?.average_percentage || 0))}%` }} /></div>
        <span>{roadmap.progress?.graded || 0}/{roadmap.progress?.total_exercises || 0} bài đã chấm · trung bình {roadmap.progress?.average_percentage || 0}%</span>
      </div>
      {roadmap.adaptation_note ? <p className="tutor-adapt-note">Điều chỉnh gần nhất: {roadmap.adaptation_note}</p> : null}
      {roadmap.focus_weaknesses?.length ? <p className="tutor-hint">Tập trung ôn: {roadmap.focus_weaknesses.join(' · ')}</p> : null}
      <ol className="tutor-modules">{roadmap.modules.map((module, index) => <li key={module.key}>
        <div className="tutor-module-head"><h4>{index + 1}. {module.title}</h4><span className={`tutor-level ${module.difficulty}`}>{LEVEL_LABEL[module.difficulty] || module.difficulty}</span></div>
        <ul className="tutor-lessons">{module.lessons.map((lesson) => <li key={lesson.key}>
          <strong>{lesson.title}</strong>
          <span className="tutor-hint">{lesson.estimated_minutes} phút · {(lesson.exercise_ids || []).length} bài tập</span>
          {lesson.objectives?.length ? <ul className="tutor-objectives">{lesson.objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul> : null}
          {lesson.examples?.length ? <p className="tutor-example">Ví dụ: {lesson.examples[0]}</p> : null}
        </li>)}</ul>
        <p className="tutor-hint">Quiz chặng: {module.quiz?.question_count} câu · Bài kiểm tra chặng: {module.assessment?.type} ({module.assessment?.max_score} điểm)</p>
      </li>)}</ol>
      <div className="tutor-card-actions"><button type="button" className="tutor-primary" onClick={onPractice}>Luyện tập ngay</button><button type="button" className="tutor-secondary" onClick={() => setStep('result')}>Xem lại đánh giá</button><button type="button" className="tutor-secondary" onClick={buildRoadmap} disabled={busy !== ''}>{busy === 'roadmap' ? 'Đang dựng lại…' : 'Cập nhật lộ trình'}</button></div>
    </section> : <section className="tutor-card"><p className="tutor-hint">Chưa có lộ trình. Hãy hoàn thành bài đánh giá rồi tạo lộ trình.</p></section>) : null}
  </div>;
}

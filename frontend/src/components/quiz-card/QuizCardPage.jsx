import { lazy, Suspense, useEffect, useState } from 'react';
import { BookOpen, Layers, ListChecks, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { deleteQuiz, getQuiz, getQuizHistory, renameFlashcardDeck, renameQuiz } from '../../api';
import { mutateStudy } from '../../utils/studySync';
import { normalizeFlashcardColor, rememberedCount } from '../flashcard/flashcardTheme';
import { planPermissions } from '../../utils/planPermissions';
import LearningDialog from './LearningDialog';
import './quiz-card.css';

const QuizWorkspace = lazy(() => import('../QuizWorkspace'));
const LearningCreateModal = lazy(() => import('./LearningCreateModal'));
const loadingContent = <p role="status">Đang tải nội dung…</p>;
const levels = {easy:'Dễ', medium:'Trung bình', hard:'Khó', mixed:'Hỗn hợp'};
function Menu({ name, onRename, onDelete, onEdit }) {
  const choose = (event, action) => { event.currentTarget.closest('details').open = false; action(); };
  return <details className="qc-menu"><summary aria-label={`Tùy chọn ${name}`}>⋯</summary><div>
    <button type="button" onClick={(event) => choose(event,onRename)}>Đổi tên</button>{onEdit && <button type="button" onClick={(event) => choose(event,onEdit)}>Chỉnh sửa</button>}<button type="button" onClick={(event) => choose(event,onDelete)}>Xóa</button>
  </div></details>;
}

export default function QuizCardPage({ user, subscription, decks, decksLoading, onDeckSaved, onDeleteDeck, onStudy, onEdit, onManual, onLogin, onLibrary }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(null);
  const [action, setAction] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [quiz, setQuiz] = useState(null);
  const [pendingQuiz, setPendingQuiz] = useState(null);
  const [reload, setReload] = useState(0);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const filteredItems = items.filter((item) =>
    (!subjectFilter || String(item.subject_id ?? item.subject ?? '') === subjectFilter) &&
    (!difficultyFilter || (item.difficulty || 'mixed') === difficultyFilter) &&
    (!typeFilter || (item.question_type || 'multiple_choice') === typeFilter));
  const quizSubjects = [...new Map(items.map((item) => [String(item.subject_id ?? item.subject ?? ''), item.subject || 'Chưa phân loại'])).entries()];
  useEffect(() => {
    const saved = (event) => {
      if (event.detail.id === pendingQuiz?.key) {
        setQuiz({ ...pendingQuiz.value, run: event.detail.result }); setPendingQuiz(null); setCreating(null); setError('');
      }
    };
    window.addEventListener('studyhub:mutation-saved', saved);
    return () => window.removeEventListener('studyhub:mutation-saved', saved);
  }, [pendingQuiz]);
  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    getQuizHistory().then((value) => { if (active) setItems(value.items || []); })
      .catch(() => { if (active) setError('Không tải được bài trắc nghiệm. Vui lòng thử lại.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, reload]);
  const refresh = () => { setError(''); setLoading(true); setReload((n) => n+1); };
  const create = (kind) => { if (!user) { onLogin(); return; } setError(''); setCreating(kind); };
  const openQuiz = async (item, alreadyLoaded = false, retake = false) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const value = alreadyLoaded ? item : await getQuiz(item.id);
      const run = await mutateStudy('/quiz-attempts', { quizId: value.id, resume: !retake });
      if (run.pending) { setPendingQuiz({ value, key: run.idempotencyKey }); setError('Chưa đồng bộ, sẽ thử lại khi có mạng.'); return false; }
      setQuiz({...value,run}); setCreating(null);return true;
    } catch { refresh();setError('Không mở được bài trắc nghiệm. Vui lòng thử lại.');return false; }
    finally { setBusy(false); }
  };
  const beginAction = (type, kind, item) => {setError(''); setAction({type,kind,item});setName(item.name || item.title);};
  const applyAction = async (event) => {
    event.preventDefault(); if (busy) return;
    setBusy(true);setError('');
    try {
      if (action.type === 'rename') {
        if (action.kind === 'flashcard') onDeckSaved(await renameFlashcardDeck(action.item.id,name.trim()));
        else await renameQuiz(action.item.id,name.trim());
      } else if (action.kind === 'flashcard') await onDeleteDeck(action.item);
      else await deleteQuiz(action.item.id);
      setAction(null);refresh();
    } catch { setError('Không lưu được thay đổi. Vui lòng thử lại.'); }
    finally { setBusy(false); }
  };
  if (quiz) return <div className="qc-page"><Suspense fallback={loadingContent}><QuizWorkspace key={`${quiz.id}:${quiz.run.attemptId}`} quiz={quiz} onBack={() => {setQuiz(null);refresh();}} onRetake={() => openQuiz(quiz,true,true)} /></Suspense></div>;
  return <section className="qc-page" aria-labelledby="quiz-title">
    <header className="qc-hero"><div><span className="qc-badge"><Layers size={15}/> 3D Flashcards & Lặp lại Ngắt quãng (Spaced Repetition)</span><h1 id="quiz-title">Bộ Thẻ Ôn Tập &<br/><span>Quiz Card Thông Minh</span></h1><p>Luyện tập 3D phản xạ nhanh. Tự động trích xuất các thuật ngữ then chốt từ tài liệu học tập hoặc tự tạo bộ ôn thi riêng theo môn học.</p>
      <div className="qc-hero-actions"><button className="btn btn-primary" onClick={() => create('flashcard')}><Plus size={18}/>Tạo bộ Flashcard</button><button className="btn qc-mint" onClick={() => create('quiz')}><Plus size={18}/>Tạo bài trắc nghiệm</button></div></div>
      <div className="qc-hero-art" aria-hidden="true"><div><Layers size={32}/><b>Học sâu.<br/>Nhớ lâu.</b><span>FLASHCARD + QUIZ</span></div><i><Sparkles size={22}/></i></div>
    </header>
    <div className="qc-overview"><span><Layers size={18}/><b>{decks.length}</b> bộ Flashcard</span><span><ListChecks size={18}/><b>{items.length}</b> bài trắc nghiệm</span><span><BookOpen size={18}/><b>{decks.reduce((sum,deck) => sum+rememberedCount(deck),0)}</b> thẻ đã nhớ</span></div>
    {error && !action && <p role="alert" className="form-error">{error} <button className="text-link" onClick={refresh}>Thử lại</button></p>}
    <section className="qc-section" aria-labelledby="qc-flashcards-title"><header><div><span className="eyebrow">GHI NHỚ CHỦ ĐỘNG</span><h2 id="qc-flashcards-title"><Layers/>Flashcard của bạn</h2><p>Ôn tập thông minh với những bộ thẻ được tạo từ tài liệu của bạn.</p></div><button className="btn btn-outline" onClick={() => create('flashcard')}><Plus size={17}/>Tạo bộ Flashcard</button></header>
      {decksLoading ? <p role="status">Đang tải bộ Flashcard…</p> : decks.length ? <div className="qc-grid">{decks.map((deck) => {
        const total=deck.cards?.length || 0, known=rememberedCount(deck);
        return <article className="qc-deck" style={{'--deck-color':normalizeFlashcardColor(deck.color)}} key={deck.id}>
          <div className="qc-card-top"><span className="qc-card-icon"><Layers size={22}/></span><Menu name={deck.name} onRename={() => beginAction('rename','flashcard',deck)} onDelete={() => beginAction('delete','flashcard',deck)} onEdit={() => onEdit(deck)}/></div>
          <small className="qc-subject">{deck.subject || 'Chưa phân loại'}</small><h3>{deck.name}</h3><p>{total} Flashcards</p>
          <div className="qc-recall"><span>● {known} đã nhớ</span><span>● {total-known} chưa nhớ</span></div>
          <progress value={known} max={Math.max(1,total)} aria-label={`${known} trên ${total} thẻ đã nhớ`}/><small>{known} / {total}</small>
          <button className="btn qc-review" disabled={!total} onClick={() => beginAction('review','flashcard',deck)}><RotateCcw size={16}/>Ôn lại</button>
        </article>;
      })}</div> : <div className="qc-empty"><Layers size={34}/><h3>Chưa có bộ Flashcard nào</h3><p>Tạo bộ Flashcard đầu tiên từ tài liệu học tập của bạn.</p><button className="btn btn-primary" onClick={() => create('flashcard')}><Plus size={17}/>Tạo bộ Flashcard</button></div>}
      <button className="text-link qc-manual" onClick={() => user ? onManual() : onLogin()}>Hoặc tạo bộ thẻ thủ công / tải file mới</button>
    </section>
    <section className="qc-section" aria-labelledby="qc-quizzes-title"><header><div><span className="eyebrow">KIỂM TRA KIẾN THỨC</span><h2 id="qc-quizzes-title"><ListChecks/>Bài trắc nghiệm của bạn</h2><p>Kiểm tra kiến thức từ chính tài liệu bạn đang học.</p></div><button className="btn qc-mint" onClick={() => create('quiz')}><Plus size={17}/>Tạo bài trắc nghiệm</button></header>
      <form className="qc-create" aria-label="Lọc bài trắc nghiệm" onSubmit={(event) => event.preventDefault()}>
        <div className="qc-form-grid">
          <label>Chủ đề<select aria-label="Chủ đề" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="">Tất cả chủ đề</option>{quizSubjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label>Độ khó<select aria-label="Độ khó" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}><option value="">Tất cả độ khó</option>{Object.entries(levels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Loại câu hỏi<select aria-label="Loại câu hỏi" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">Tất cả loại câu hỏi</option><option value="multiple_choice">Trắc nghiệm nhiều lựa chọn</option></select></label>
        </div>
        <small role="status">{filteredItems.length} bài trắc nghiệm phù hợp</small>
      </form>
      {loading ? <p role="status">Đang tải bài trắc nghiệm…</p> : filteredItems.length ? <div className="qc-grid">{filteredItems.map((item) => <article className="qc-quiz" key={item.id}>
        <div className="qc-card-top"><span className="qc-card-icon"><ListChecks size={22}/></span><Menu name={item.title} onRename={() => beginAction('rename','quiz',item)} onDelete={() => beginAction('delete','quiz',item)}/></div>
        <small className="qc-subject">{item.subject || 'Chưa phân loại'}</small><h3>{item.title}</h3><p>{item.question_count} câu · {item.time_limit ? `${item.time_limit} phút` : 'Không giới hạn'} · {levels[item.difficulty] || 'Hỗn hợp'}</p>
        <div className="qc-score"><span>Điểm gần nhất</span><strong>{item.attempts?.length ? `${item.attempts[0].score}/${item.attempts[0].total}` : 'Chưa làm'}</strong></div><small>Đã làm {item.attempts?.length || 0} lần</small>
        <button className="btn qc-mint" disabled={busy} onClick={() => openQuiz(item)}><RotateCcw size={16}/>{item.attempts?.length ? 'Làm lại' : 'Làm bài'}</button>
      </article>)}</div> : items.length ? <div className="qc-empty qc-empty-mint"><ListChecks size={34}/><h3>Không có bài trắc nghiệm phù hợp</h3><button className="btn btn-outline" onClick={() => {setSubjectFilter('');setDifficultyFilter('');setTypeFilter('');}}>Xóa bộ lọc</button></div> : <div className="qc-empty qc-empty-mint"><ListChecks size={34}/><h3>Chưa có bài trắc nghiệm nào</h3><p>Tạo bài trắc nghiệm bằng Nova AI để kiểm tra kiến thức.</p><button className="btn qc-mint" onClick={() => create('quiz')}><Plus size={17}/>Tạo bài trắc nghiệm</button></div>}
      {busy && !action && <p role="status">Đang mở bài trắc nghiệm…</p>}
    </section>
    {creating && <Suspense fallback={loadingContent}><LearningCreateModal kind={creating} canGenerate={planPermissions(subscription).advancedQuiz} onClose={() => setCreating(null)} onLibrary={() => {setCreating(null);onLibrary();}} onCreated={async (value) => {
      if (creating==='flashcard') {onDeckSaved(value);setCreating(null);onStudy(value);}
      else {refresh();const opened=await openQuiz(value,true);if (!opened) {setCreating(null);}}
    }}/></Suspense>}
    {action?.type==='review' && <LearningDialog title="Bạn muốn ôn thế nào?" onClose={() => setAction(null)}><p>{action.item.name}</p><div className="qc-review-options"><button className="btn qc-mint" onClick={() => {onStudy(action.item);setAction(null);}}><RotateCcw/>Ôn lại tất cả · {action.item.cards.length} Flashcards</button><button className="btn btn-primary" disabled={action.item.cards.every((card) => card.remembered)} onClick={() => {onStudy({...action.item,reviewCardIds:action.item.cards.filter((card) => !card.remembered).map((card) => card.id)});setAction(null);}}>Ôn lại phần chưa nhớ · {action.item.cards.filter((card) => !card.remembered).length} Flashcards</button></div>{action.item.cards.every((card) => card.remembered) && <p>🎉 Bạn đã nhớ tất cả Flashcard trong bộ này!</p>}</LearningDialog>}
    {action && action.type!=='review' && <LearningDialog title={action.type==='rename' ? 'Đổi tên' : action.kind==='flashcard' ? 'Xóa bộ Flashcard?' : 'Xóa bài trắc nghiệm?'} busy={busy} onClose={() => {setAction(null);setError('');}}><form className="qc-create" onSubmit={applyAction}>
      {action.type==='rename' ? <label>Tên mới<input required autoFocus maxLength={100} value={name} onChange={(e) => setName(e.target.value)}/></label> : <p>Bạn có chắc muốn xóa <strong>{action.item.name || action.item.title}</strong>? {action.kind==='flashcard' ? 'Toàn bộ Flashcard và tiến độ học sẽ bị xóa.' : 'Bài trắc nghiệm và lịch sử làm bài sẽ bị xóa.'}</p>}
      {error && <p role="alert" className="form-error">{error}</p>}<footer><button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setAction(null)}>Hủy</button><button className="btn btn-primary" disabled={busy || action.type==='rename' && !name.trim()}>{busy ? 'Đang lưu…' : action.type==='rename' ? 'Lưu tên' : action.kind==='flashcard' ? 'Xóa bộ' : 'Xóa bài'}</button></footer>
    </form></LearningDialog>}
  </section>;
}

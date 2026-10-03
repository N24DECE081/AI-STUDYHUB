import { useEffect, useRef, useState } from 'react';
import { FileText, Sparkles } from 'lucide-react';
import { createQuiz, generateFlashcards, getDocuments, getQuizLimits, getSubjects } from '../../api';
import { STUDYHUB_FLASHCARD_COLORS } from '../flashcard/flashcardTheme';
import LearningDialog from './LearningDialog';
import ManualLearningForm from './ManualLearningForm';

export default function LearningCreateModal({ kind, canGenerate = false, onClose, onCreated, onLibrary }) {
  const [manualVisited, setManualVisited] = useState(!canGenerate);
  const [mode, setMode] = useState(canGenerate ? 'auto' : 'manual');
  const isFlashcard = kind === 'flashcard';
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState('');
  const [documents, setDocuments] = useState([]);
  const [ids, setIds] = useState([]);
  const [limits, setLimits] = useState(null);
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [limitsBusy, setLimitsBusy] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(STUDYHUB_FLASHCARD_COLORS[0].value);
  const [count, setCount] = useState(isFlashcard ? 'auto' : '30');
  const [timed, setTimed] = useState(false);
  const [minutes, setMinutes] = useState('30');
  const [difficulty, setDifficulty] = useState('mixed');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const documentRequest = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    let active = true; alive.current = true;
    getSubjects().then((rows) => { if (active) setSubjects(rows); }).catch(() => { if (active) setError('Không tải được môn học. Vui lòng thử lại.'); })
      .finally(() => { if (active) setLoadingSubjects(false); });
    return () => { active = false; alive.current = false; };
  }, [retry]);
  useEffect(() => {
    let active = true;
    if (!ids.length) return () => { active = false; };
    getQuizLimits(Number(subject), ids).then((value) => {
      if (!active) return;
      setLimits(value);
      if (!isFlashcard) setCount((current) => /^\d+$/.test(current) && Number(current) > value.max_questions ? String(value.max_questions) : current);
    }).catch((failure) => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLimitsBusy(false); });
    return () => { active = false; };
  }, [ids, subject, isFlashcard]);
  const chooseSubject = async (value) => {
    const request = ++documentRequest.current;
    setSubject(value); setIds([]); setDocuments([]); setLimits(null); setError(''); setLimitsBusy(false);
    if (!value) { setLoadingDocuments(false); return; }
    setLoadingDocuments(true);
    try { const rows = await getDocuments(value); if (alive.current && request === documentRequest.current) setDocuments(rows); }
    catch { if (alive.current && request === documentRequest.current) setError('Không tải được tài liệu. Chọn lại môn để thử lại.'); }
    finally { if (alive.current && request === documentRequest.current) setLoadingDocuments(false); }
  };
  const selectDocuments = (next) => { setIds(next); setLimits(null); setLimitsBusy(next.length > 0); setError(''); };
  const maximum = limits?.[isFlashcard ? 'max_flashcards' : 'max_questions'] || 0;
  const validCount = isFlashcard && count === 'auto' || /^\d+$/.test(count) && Number(count) >= 1 && Number(count) <= maximum;
  const validTime = !timed || /^\d+$/.test(minutes) && Number(minutes) >= 1 && Number(minutes) <= 240;
  const submit = async (event) => {
    event.preventDefault();
    if (!canGenerate) return;
    if (inFlight.current || !limits || !validCount || !validTime || !ids.length || isFlashcard && !name.trim()) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const source = { subject_id: Number(subject), document_ids: ids };
      const result = isFlashcard
        ? await generateFlashcards({ ...source, name: name.trim(), description, color, requested_count: count === 'auto' ? null : Number(count) })
        : await createQuiz(ids, Number(count), { subject_id: Number(subject), title: name.trim(), difficulty, time_limit: timed ? Number(minutes) : 0 });
      await onCreated(result);
    } catch (failure) { setError(failure.message || 'Nova chưa thể tạo nội dung lúc này. Vui lòng thử lại.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <LearningDialog title={isFlashcard ? 'Tạo bộ Flashcard mới' : 'Tạo bài trắc nghiệm'} onClose={onClose} busy={busy} eyebrow={mode === 'manual' ? 'STUDYHUB · TỰ TẠO' : 'STUDYHUB · NOVA AI'}>
    <div className="qc-create-modes" aria-label="Cách tạo"><button type="button" disabled={busy || !canGenerate} title={!canGenerate ? 'Nâng cấp để sử dụng' : undefined} aria-pressed={mode === 'auto'} onClick={() => setMode('auto')}>Tự động</button><button type="button" disabled={busy} aria-pressed={mode === 'manual'} onClick={() => { setManualVisited(true); setMode('manual'); }}>Thủ công</button></div>
    {manualVisited && <div hidden={mode !== 'manual'}><ManualLearningForm kind={kind} subjects={subjects} loadingSubjects={loadingSubjects} onLibrary={onLibrary} onCreated={onCreated} busy={busy} setBusy={setBusy} /></div>}
    {mode === 'auto' && <div><form className="qc-create" onSubmit={submit}>
      <fieldset disabled={busy || !canGenerate}>
        <label><span><b>01</b> Môn học</span><select aria-label="Môn học" value={subject} onChange={(e) => chooseSubject(e.target.value)} disabled={loadingSubjects}>
          <option value="">{loadingSubjects ? 'Đang tải môn học…' : 'Chọn môn học'}</option>
          {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        {!subjects.length && !loadingSubjects && <div className="qc-notice">Chưa có môn học. <button type="button" className="text-link" onClick={onLibrary}>Đi đến Kho học liệu</button> <button type="button" className="text-link" onClick={() => {setLoadingSubjects(true); setRetry((value) => value + 1);}}>Thử lại</button></div>}
        <div className="qc-picker-heading"><strong><b>02</b> Chọn tài liệu</strong>{subject && documents.length > 0 && <button type="button" className="text-link" onClick={() => selectDocuments(ids.length === documents.length ? [] : documents.map((doc) => doc.id).slice(0,20))}>{ids.length === documents.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}</button>}</div>
        {!subject ? <div className="qc-empty-inline"><FileText /><p>Chọn môn học trước để xem tài liệu của bạn.</p></div>
          : loadingDocuments ? <p role="status">Đang tải tài liệu…</p>
          : documents.length ? <div className="qc-documents">{documents.map((doc) => <label key={doc.id} className={ids.includes(doc.id) ? 'is-selected' : ''}>
            <input type="checkbox" checked={ids.includes(doc.id)} disabled={!ids.includes(doc.id) && ids.length >= 20} onChange={() => selectDocuments(ids.includes(doc.id) ? ids.filter((id) => id !== doc.id) : [...ids,doc.id])} />
            <FileText size={20} /><span><strong>{doc.title}</strong><small>{String(doc.file_type || doc.original_filename?.split('.').pop() || 'Tài liệu').toUpperCase()}{doc.page_count ? ` · ${doc.page_count} trang` : ''}</small></span>
          </label>)}</div> : <div className="qc-empty-inline"><p>Chưa có tài liệu nào cho môn học này.</p><button type="button" className="btn btn-outline" onClick={onLibrary}>Đi đến Kho học liệu</button></div>}
        {subject && <small>Đã chọn {ids.length} tài liệu · tối đa 20 tài liệu</small>}
        <label><span><b>03</b> {isFlashcard ? 'Tên bộ Flashcard *' : 'Tên bài trắc nghiệm (không bắt buộc)'}</span><input aria-label={isFlashcard ? 'Tên bộ Flashcard' : 'Tên bài trắc nghiệm'} value={name} maxLength={100} required={isFlashcard} placeholder={isFlashcard ? 'Ví dụ: Ôn tập Relational Algebra' : 'Nova đặt tên từ tài liệu nếu để trống'} onChange={(e) => setName(e.target.value)} /></label>
        {isFlashcard && <label>Mô tả<textarea value={description} maxLength={2000} placeholder="Thêm mô tả cho bộ Flashcard của bạn…" onChange={(e) => setDescription(e.target.value)} /></label>}
        <div className="qc-form-grid"><label>Số {isFlashcard ? 'Flashcard' : 'câu hỏi'}
          {isFlashcard ? <select aria-label="Số Flashcard" value={count} onChange={(e) => setCount(e.target.value)}><option value="auto">AI tự đề xuất</option>{[10,20,30,50].map((n) => <option key={n} value={n} disabled={n > maximum}>{n}</option>)}</select>
            : <div className="qc-stepper"><button type="button" aria-label="Giảm số câu" disabled={!limits || Number(count) <= 1} onClick={() => setCount(String(Math.max(1,Number(count || 1)-1)))}>−</button><input aria-label="Số câu hỏi" inputMode="numeric" value={count} aria-invalid={!validCount} onChange={(e) => setCount(e.target.value)} /><button type="button" aria-label="Tăng số câu" disabled={!limits || Number(count) >= maximum} onClick={() => setCount(String(Math.min(maximum,Number(count || 0)+1)))}>+</button></div>}
        </label>{!isFlashcard && <label>Độ khó<select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="mixed">Hỗn hợp</option><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option></select></label>}</div>
        <small>{limitsBusy ? 'Nova đang kiểm tra độ dài tài liệu…' : limits ? `Tối đa ${maximum} ${isFlashcard ? 'thẻ' : 'câu'} dựa trên tài liệu đã chọn.` : 'Chọn tài liệu để kiểm tra số lượng phù hợp.'}</small>
        {limits && !validCount && <p className="form-error">Số lượng phải là số nguyên dương không vượt quá {maximum}.</p>}
        {isFlashcard ? <fieldset className="qc-colors"><legend>Màu bộ</legend>{STUDYHUB_FLASHCARD_COLORS.map((item) => <button type="button" key={item.value} style={{background:item.value}} aria-label={item.name} aria-pressed={color===item.value} onClick={() => setColor(item.value)}>{color===item.value ? '✓' : ''}</button>)}</fieldset>
          : <div className="qc-time"><strong>Thời gian làm bài</strong><label><input type="radio" name="timer" checked={!timed} onChange={() => setTimed(false)} /> Không giới hạn</label><label><input type="radio" name="timer" checked={timed} onChange={() => setTimed(true)} /> Giới hạn thời gian</label>{timed && <label>Số phút<input aria-label="Số phút" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /><small>Từ 1 đến 240 phút</small></label>}</div>}
      </fieldset>
      {busy && <div className="qc-nova" role="status"><Sparkles className="qc-spin" /><strong>Nova đang tạo {isFlashcard ? 'Flashcard' : 'bài trắc nghiệm'} cho bạn…</strong><p>Đang đọc tài liệu và tạo nội dung ôn tập phù hợp.</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <footer><small>Nova AI sẽ đọc các tài liệu đã chọn. Bạn có thể ôn tập ngay sau khi tạo.</small><button type="submit" className={`btn ${isFlashcard ? 'btn-primary' : 'qc-mint'}`} title={!canGenerate ? 'Nâng cấp để sử dụng' : undefined} disabled={!canGenerate || busy || !limits || limitsBusy || !ids.length || !validCount || !validTime || isFlashcard && !name.trim()}><Sparkles size={18}/>{error ? 'Thử lại' : isFlashcard ? 'Tạo với Nova AI' : 'Tạo bài với Nova AI'}</button></footer>
    </form></div>}
  </LearningDialog>;
}

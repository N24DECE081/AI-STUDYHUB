import { useRef, useState } from 'react';
import { createManualLearning } from '../../api';
import { STUDYHUB_FLASHCARD_COLORS } from '../flashcard/flashcardTheme';

const emptyItem = () => ({ id: crypto.randomUUID(), front: '', back: '', question: '', options: ['', '', '', ''], correct_index: null, explanation: '' });
export default function ManualLearningForm({ kind, subjects, loadingSubjects, onLibrary, onCreated, busy, setBusy }) {
  const flash = kind === 'flashcard';
  const [subject, setSubject] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(STUDYHUB_FLASHCARD_COLORS[0].value);
  const [minutes, setMinutes] = useState('0');
  const [items, setItems] = useState(() => [emptyItem()]);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const update = (id, patch) => setItems(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const valid = subject && name.trim() && (flash || /^\d+$/.test(minutes) && Number(minutes) <= 240) && items.every(item => flash
    ? item.front.trim() && item.back.trim()
    : item.question.trim() && item.options.every(value => value.trim()) && new Set(item.options.map(value => value.trim().toLowerCase())).size === 4 && item.correct_index !== null);
  const submit = async event => {
    event.preventDefault();
    if (!valid || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const payload = { subject_id: Number(subject), name: name.trim(), title: name.trim(), description, color,
        ...(flash ? { cards: items.map(({ id, front, back }) => ({ id, front, back })) } : { questions: items, time_limit: Number(minutes) }) };
      await onCreated(await createManualLearning(kind, payload));
    } catch (failure) { setError(failure.message || 'Không lưu được nội dung. Vui lòng thử lại.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <form className="qc-create" onSubmit={submit}>
    <fieldset disabled={busy}>
      <label>Môn học<select aria-label="Môn học" required value={subject} disabled={loadingSubjects} onChange={event => setSubject(event.target.value)}><option value="">Chọn môn học</option>{subjects.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {!subjects.length && !loadingSubjects && <div className="qc-notice">Chưa có môn học. <button type="button" className="text-link" onClick={onLibrary}>Đi đến Kho học liệu</button></div>}
      <label>{flash ? 'Tên bộ Flashcard' : 'Tên bài trắc nghiệm'}<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      {flash ? <><label>Mô tả<textarea maxLength={2000} value={description} onChange={event => setDescription(event.target.value)} /></label><fieldset className="qc-colors"><legend>Màu bộ</legend>{STUDYHUB_FLASHCARD_COLORS.map(item => <button type="button" key={item.value} style={{ background: item.value }} aria-label={item.name} aria-pressed={color === item.value} onClick={() => setColor(item.value)}>{color === item.value ? '✓' : ''}</button>)}</fieldset></>
        : <label>Thời gian làm bài (phút)<input inputMode="numeric" value={minutes} onChange={event => setMinutes(event.target.value)} /><small>0: không giới hạn · tối đa 240 phút</small></label>}
      <p>Tự nhập {flash ? 'mặt trước và mặt sau của từng thẻ' : 'câu hỏi, 4 đáp án khác nhau và chọn đáp án đúng'}. Tối đa 100 {flash ? 'thẻ' : 'câu'}.</p>
      {items.map((item, index) => <section className="qc-manual-item" key={item.id} aria-label={`${flash ? 'Thẻ' : 'Câu'} ${index + 1}`}>
        <div className="qc-picker-heading"><strong>{flash ? 'Thẻ' : 'Câu'} {index + 1}</strong><button className="text-link" type="button" disabled={items.length === 1} onClick={() => setItems(rows => rows.filter(row => row.id !== item.id))}>Xóa {flash ? 'thẻ' : 'câu'} {index + 1}</button></div>
        {flash ? <><label>Mặt trước<textarea required maxLength={1000} value={item.front} onChange={event => update(item.id, { front: event.target.value })} /></label><label>Mặt sau<textarea required maxLength={4000} value={item.back} onChange={event => update(item.id, { back: event.target.value })} /></label></>
          : <><label>Câu hỏi<textarea required maxLength={2000} value={item.question} onChange={event => update(item.id, { question: event.target.value })} /></label>
            {item.options.map((option, optionIndex) => <div className="qc-manual-option" key={optionIndex}><input type="radio" name={`answer-${item.id}`} aria-label={`Chọn ${'ABCD'[optionIndex]} là đáp án đúng`} checked={item.correct_index === optionIndex} onChange={() => update(item.id, { correct_index: optionIndex })} /><label>Đáp án {'ABCD'[optionIndex]}<input required maxLength={1000} value={option} onChange={event => update(item.id, { options: item.options.map((value, i) => i === optionIndex ? event.target.value : value) })} /></label></div>)}
            <label>Giải thích (không bắt buộc)<textarea maxLength={4000} value={item.explanation} onChange={event => update(item.id, { explanation: event.target.value })} /></label></>}
      </section>)}
      <button type="button" className="btn btn-outline" disabled={items.length >= 100} onClick={() => setItems(rows => [...rows, emptyItem()])}>+ Thêm {flash ? 'thẻ' : 'câu hỏi'}</button>
    </fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}
    <footer><small>{items.length} {flash ? 'thẻ' : 'câu hỏi'} · Điền đầy đủ nội dung để lưu.</small><button type="submit" className="btn btn-primary" disabled={busy || !valid}>{busy ? 'Đang lưu…' : flash ? 'Lưu bộ Flashcard' : 'Lưu bài trắc nghiệm'}</button></footer>
  </form>;
}

import { useRef } from 'react';

export default function AITutorFileUpload({ onUpload, disabled, files, onRemove }) {
  const inputRef = useRef(null);
  return <div className="tutor-file-upload">
    <input ref={inputRef} type="file" hidden onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) onUpload(file);
      event.target.value = '';
    }} />
    <button type="button" className="tutor-attach" disabled={disabled} onClick={() => inputRef.current?.click()}>＋ Tài liệu</button>
    {files.map((file) => <span className="tutor-file-chip" key={file.id}>{file.name}<button type="button" aria-label={`Bỏ ${file.name}`} onClick={() => onRemove(file.id)}>×</button></span>)}
  </div>;
}

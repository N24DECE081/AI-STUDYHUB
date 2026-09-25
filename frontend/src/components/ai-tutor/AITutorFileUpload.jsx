import { useRef } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';

export default function AITutorFileUpload({ onUpload, disabled, files, onRemove, maxFiles = 5 }) {
  const inputRef = useRef(null);
  const activeFileCount = files.filter((file) => !file.error).length;
  const atLimit = activeFileCount >= maxFiles;
  return <div className="tutor-file-upload">
    <input ref={inputRef} type="file" hidden accept=".pdf,.doc,.docx,.md,.mdf,.txt,.csv" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file && !atLimit) onUpload(file);
      event.target.value = '';
    }} />
    <button type="button" className="tutor-attach" disabled={disabled || atLimit} title={atLimit ? 'Đã đạt giới hạn 5 tài liệu' : 'Đính kèm tài liệu'} onClick={() => inputRef.current?.click()}><Paperclip size={15} aria-hidden="true" /> Tài liệu</button>
    <span className="tutor-file-count" aria-label={`${activeFileCount} trên ${maxFiles} tài liệu`}>{activeFileCount}/{maxFiles}</span>
    {files.map((file) => <span className={`tutor-file-chip${file.error || file.deleteError ? ' error' : ''}`} key={file.id}><span>{file.name}</span><button type="button" disabled={file.uploading || file.deleting} title={file.deleteError || `Xóa ${file.name}`} aria-label={`Xóa ${file.name}`} onClick={() => onRemove(file)}><Trash2 size={13} aria-hidden="true" /></button></span>)}
  </div>;
}

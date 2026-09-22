import ReactMarkdown from 'react-markdown';

export default function AITutorMessage({ message, onRetry }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.content); } catch { /* Clipboard can be unavailable on non-secure origins. */ }
  };
  return <article className={`tutor-message ${message.role}`}>
    <div className="tutor-message-label">{message.role === 'user' ? 'Bạn' : 'Nova'}</div>
    <div className="tutor-message-content">
      {message.error ? <><p className="tutor-error">{message.error}</p><button className="tutor-link" onClick={onRetry}>Thử lại</button></> : <ReactMarkdown components={{
        code({ className, children, ...props }) { return <code className={className || 'inline-code'} {...props}>{children}</code>; },
        pre({ children }) { return <pre className="tutor-code-block">{children}</pre>; },
      }}>{message.content}</ReactMarkdown>}
    </div>
    {message.role === 'assistant' && !message.error && <button className="tutor-copy" title="Sao chép câu trả lời" onClick={copy}>Sao chép</button>}
  </article>;
}

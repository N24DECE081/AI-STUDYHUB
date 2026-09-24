import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import AITutorQuiz from './AITutorQuiz';

// remark-gfm: model thật trả bảng markdown (| a | b |) rất thường xuyên.
const REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }], [remarkMath, { singleDollarTextMath: true }]];
const REHYPE_PLUGINS = [[rehypeKatex, { throwOnError: false, strict: false, trust: false }]];

const textOf = (node) => {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node?.props ? textOf(node.props.children) : '';
};

function TutorCodeBlock({ children }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(textOf(children)); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* Clipboard can be unavailable on non-secure origins. */ }
  };
  return <div className="tutor-code-wrap"><button type="button" className="tutor-code-copy" onClick={copy}>{copied ? 'Đã sao chép' : 'Sao chép mã'}</button><pre className="tutor-code-block">{children}</pre></div>;
}

const MARKDOWN_COMPONENTS = {
  code({ className, children, ...props }) { return <code className={className || 'inline-code'} {...props}>{children}</code>; },
  pre({ children }) { return <TutorCodeBlock>{children}</TutorCodeBlock>; },
};

// Nova tự chọn cách trả lời; nhãn này cho người học biết nó đã hiểu câu hỏi theo hướng nào.
const MODE_LABELS = { explain: 'Giải thích', solve: 'Giải bài', hint: 'Gợi ý', summarize: 'Tóm tắt', generate_quiz: 'Quiz' };

export default function AITutorMessage({ message, onRetry }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(message.content); } catch { /* Clipboard can be unavailable on non-secure origins. */ }
  };
  const modeLabel = message.role === 'assistant' && !message.error ? MODE_LABELS[message.mode] : null;
  return <article className={`tutor-message ${message.role}`}>
    <div className="tutor-message-label">{message.role === 'user' ? 'Bạn' : 'Nova'}{modeLabel ? <span className="tutor-route">{modeLabel}</span> : null}</div>
    <div className="tutor-message-content">
      {message.error ? <><p className="tutor-error">{message.error}</p><button className="tutor-link" onClick={onRetry}>Thử lại</button></> : <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={MARKDOWN_COMPONENTS}>{message.content}</ReactMarkdown>}
    </div>
    {message.quiz ? <AITutorQuiz quiz={message.quiz} /> : null}
    {message.role === 'assistant' && !message.error && <button className="tutor-copy" title="Sao chép câu trả lời" onClick={copy}>Sao chép</button>}
  </article>;
}

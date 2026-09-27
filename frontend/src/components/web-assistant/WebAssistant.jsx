import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { askWebAssistant, getWebAssistantStarters } from '../../api';
import './web-assistant.css';

// Dùng khi backend chưa kịp trả cấu hình (ví dụ mất mạng) — widget vẫn hiển thị được.
const FALLBACK_CONFIG = {
  name: 'Bee kawai',
  status: 'Đang sẵn sàng hỗ trợ',
  greeting: 'Xin chào! Mình là Nova. Hôm nay bạn muốn học gì?',
  starters: [
    'Bảng giá 3 gói StudyHub',
    'Gói miễn phí 0đ có gì?',
    'Nova AI Tutor làm được gì?',
    'Thanh toán và liên hệ hỗ trợ',
  ],
};

const CHIP_ICONS = ['💰', '🎁', '🤖', '💳'];

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

function Bubble({ message }) {
  const assistant = message.role === 'assistant';
  return (
    <div className={`wa-row ${assistant ? 'assistant' : 'user'}`}>
      {assistant && (
        <span className="wa-row-avatar" aria-hidden="true">
          🐝
        </span>
      )}
      <div className={`wa-bubble ${message.error ? 'is-error' : ''}`}>
        {assistant ? (
          <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>
            {message.text}
          </ReactMarkdown>
        ) : (
          <p>{message.text}</p>
        )}
      </div>
    </div>
  );
}

export default function WebAssistant() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(FALLBACK_CONFIG);
  const [messages, setMessages] = useState([
    { id: 'greeting', role: 'assistant', text: FALLBACK_CONFIG.greeting },
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let active = true;
    getWebAssistantStarters()
      .then((data) => {
        if (!active || !data) return;
        const starters = Array.isArray(data.starters) && data.starters.length
          ? data.starters
          : FALLBACK_CONFIG.starters;
        setConfig({ ...FALLBACK_CONFIG, ...data, starters });
        const greeting = data.greeting || FALLBACK_CONFIG.greeting;
        setMessages([{ id: 'greeting', role: 'assistant', text: greeting }]);
      })
      .catch(() => {
        /* Không lấy được cấu hình thì giữ nội dung mặc định, widget vẫn hoạt động. */
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Ngữ cảnh gửi kèm để Nova hiểu câu hỏi nối tiếp; tối đa 6 lượt gần nhất.
  const history = useMemo(
    () =>
      messages
        .filter((message) => message.id !== 'greeting')
        .slice(-6)
        .map((message) => ({ role: message.role, content: message.text })),
    [messages],
  );

  const userTurns = messages.filter((message) => message.role === 'user').length;

  const send = useCallback(
    async (raw) => {
      const question = String(raw ?? draft).trim();
      if (!question || sending) return;
      setDraft('');
      setMessages((items) => [...items, { id: newId(), role: 'user', text: question }]);
      setSending(true);
      try {
        const reply = await askWebAssistant({ message: question, history });
        setMessages((items) => [
          ...items,
          { id: newId(), role: 'assistant', text: reply?.answer || FALLBACK_CONFIG.greeting },
        ]);
      } catch (error) {
        setMessages((items) => [
          ...items,
          {
            id: newId(),
            role: 'assistant',
            error: true,
            text: `Mình chưa kết nối được máy chủ StudyHub (${error.message}). Bạn thử lại giúp mình nhé.`,
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [draft, history, sending],
  );

  return (
    <>
      <button
        type="button"
        className={`wa-launcher ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Đóng trợ lý StudyHub' : 'Mở trợ lý StudyHub'}
        aria-expanded={open}
      >
        <span aria-hidden="true">🐝</span>
      </button>

      {open && (
        <section className="wa-panel" role="dialog" aria-label="Trợ lý StudyHub">
          <header className="wa-header">
            <span className="wa-avatar" aria-hidden="true">
              🐝
            </span>
            <div className="wa-identity">
              <strong>{config.name}</strong>
              <small>
                <i aria-hidden="true" /> {config.status}
              </small>
            </div>
            <button
              type="button"
              className="wa-close"
              onClick={() => setOpen(false)}
              aria-label="Đóng trợ lý"
            >
              ✕
            </button>
          </header>

          <div className="wa-body">
            {messages.map((message) => (
              <Bubble key={message.id} message={message} />
            ))}
            {sending && (
              <div className="wa-row assistant">
                <span className="wa-row-avatar" aria-hidden="true">
                  🐝
                </span>
                <div className="wa-bubble wa-typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {userTurns < 2 && (
            <div className="wa-suggest">
              <span className="wa-suggest-label">Gợi ý nhanh</span>
              <div className="wa-chips">
                {config.starters.map((starter, index) => (
                  <button
                    type="button"
                    key={starter}
                    onClick={() => send(starter)}
                    disabled={sending}
                  >
                    <span aria-hidden="true">{CHIP_ICONS[index] ?? '💬'}</span> {starter}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form
            className="wa-compose"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Nhập câu hỏi của bạn..."
              maxLength={600}
              aria-label="Nhập câu hỏi của bạn"
            />
            <button
              type="submit"
              className="wa-send"
              disabled={!draft.trim() || sending}
              aria-label="Gửi câu hỏi"
            >
              →
            </button>
          </form>
        </section>
      )}
    </>
  );
}

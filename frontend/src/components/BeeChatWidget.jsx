import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import beeMascot from "../assets/bee-mascot.png";
import { askAiTutor } from "../api";
import { newId } from "./ai-tutor/conversationStore";
import "./BeeChatWidget.css";

const STARTERS = [
  { icon: "📚", label: "Giải thích bài học", prompt: "Giải thích giúp mình một bài học đang ôn." },
  { icon: "🧠", label: "Tạo Quiz", prompt: "Tạo một quiz nhanh về nội dung mình đang học." },
  { icon: "📝", label: "Tóm tắt tài liệu", prompt: "Tóm tắt tài liệu mình đã tải lên." },
  { icon: "🗺️", label: "Xem lộ trình", route: "roadmap" },
];

const GREETING = "Xin chào! Mình là Nova. Hôm nay bạn muốn học gì?";

export default function BeeChatWidget({ visible, user, onRequireLogin, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId] = useState(newId);
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", content: GREETING }]);
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  const send = async (event) => {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    if (!user) {
      onRequireLogin();
      return;
    }

    setDraft("");
    setMessages((current) => [...current, { id: newId(), role: "user", content }]);
    setSending(true);
    try {
      const result = await askAiTutor({ conversationId, message: content, mode: "auto" });
      setMessages((current) => [...current, {
        id: result.message_id || newId(),
        role: "assistant",
        content: result.content || "Nova chưa có câu trả lời cho nội dung này.",
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: newId(),
        role: "assistant",
        content: `Nova chưa kết nối được: ${error.message}`,
        error: true,
      }]);
    } finally {
      setSending(false);
    }
  };

  const chooseStarter = (starter) => {
    if (starter.route) {
      onNavigate(starter.route);
      return;
    }
    setDraft(starter.prompt);
    inputRef.current?.focus();
  };

  if (!visible) return null;

  return (
    <aside className="bee-chat-widget" aria-label="Trợ lý Bee">
      {open && (
        <section className="bee-chat-panel" role="dialog" aria-label="Trò chuyện với Nova">
          <header className="bee-chat-header">
            <img className="bee-chat-avatar" src={beeMascot} alt="" />
            <div className="bee-chat-identity">
              <strong>Nova AI Tutor</strong>
              <span><i aria-hidden="true" />Đang sẵn sàng hỗ trợ bạn</span>
            </div>
            <button className="bee-chat-close" type="button" aria-label="Đóng khung chat" onClick={() => setOpen(false)}>
              <XMarkIcon aria-hidden="true" />
            </button>
          </header>

          <div className="bee-chat-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`bee-chat-message bee-chat-message--${message.role}`} key={message.id}>
                {message.role === "assistant" && (
                  <img className="bee-chat-message-avatar" src={beeMascot} alt="" />
                )}
                <div className={message.error ? "bee-chat-bubble is-error" : "bee-chat-bubble"}>
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {sending && <div className="bee-chat-typing" role="status">Nova đang trả lời<span>...</span></div>}
            <div ref={endRef} />
          </div>

          {messages.length === 1 && (
            <section className="bee-chat-suggestions" aria-label="Gợi ý nhanh">
              <p>Gợi ý nhanh</p>
              <div>
                {STARTERS.map((starter) => (
                  <button key={starter.label} type="button" onClick={() => chooseStarter(starter)}>
                    <span aria-hidden="true">{starter.icon}</span>{starter.label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <form className="bee-chat-composer" onSubmit={send}>
            <input
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Nhập câu hỏi của bạn..."
              aria-label="Câu hỏi dành cho Nova"
              maxLength={4000}
            />
            <button type="submit" aria-label="Gửi câu hỏi" disabled={!draft.trim() || sending}>
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </form>
        </section>
      )}

      <button
        className="bee-chat-launcher"
        type="button"
        aria-label={open ? "Đóng Nova AI Tutor" : "Mở Nova AI Tutor"}
        title="Hỏi Nova AI Tutor"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <img src={beeMascot} alt="" />
      </button>
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, XMarkIcon } from "@heroicons/react/24/outline";
import ReactMarkdown from "react-markdown";
import beeMascot from "../assets/bee-kawaii.png";
import { askAiTutor, askWebAssistant, getWebAssistantStarters } from "../api";
import { newId } from "./ai-tutor/conversationStore";
import "./BeeChatWidget.css";
import { Sparkles } from "lucide-react";

const STARTERS = [
  { icon: "📚", label: "Giải thích bài học", prompt: "Giải thích giúp mình một bài học đang ôn." },
  { icon: "🧠", label: "Tạo quiz", prompt: "Tạo một quiz nhanh về nội dung mình đang học." },
  { icon: "📝", label: "Tóm tắt tài liệu", prompt: "Tóm tắt tài liệu mình đã tải lên." },
  { icon: "🗺️", label: "Xem lộ trình", route: "roadmap" },
];

const GREETING = "Xin chào! Mình là Nova. Hôm nay bạn muốn học gì?";
const COPY = {
  noAnswer: "Nova chưa có câu trả lời cho nội dung này.", connectionError: "Nova chưa kết nối được:",
  novaAssistant: "Trợ lý Nova", beeAssistant: "Trợ lý Bee", chatLabel: "Trò chuyện với Nova",
  novaName: "Nova AI", beeName: "Bee kawaii", ready: "Đang sẵn sàng hỗ trợ bạn", closeChat: "Đóng khung chat",
  typing: "Nova đang trả lời", suggestions: "Gợi ý nhanh", placeholder: "Nhập câu hỏi của bạn...",
  questionLabel: "Câu hỏi dành cho Nova", send: "Gửi câu hỏi", hint: "Thắc mắc gì đó? Hỏi Bee nè!",
  closeNova: "Đóng Nova AI Tutor", openNova: "Mở Nova AI Tutor", askNova: "Hỏi Nova AI Tutor",
  launcherTitle: "Hỏi Nova", launcherSubtitle: "Trợ lý học tập AI",
};
const GUEST_STARTERS = [
  { icon: "💰", label: "Bảng giá StudyHub", prompt: "Bảng giá 3 gói StudyHub" },
  { icon: "🎁", label: "Gói miễn phí", prompt: "Gói miễn phí 0đ có gì?" },
  { icon: "🤖", label: "Nova AI Tutor", prompt: "Nova AI Tutor làm được gì?" },
  { icon: "💬", label: "Liên hệ hỗ trợ", prompt: "Thanh toán và liên hệ hỗ trợ" },
];

export default function BeeChatWidget({ visible, user, onNavigate, variant = "default" }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId] = useState(newId);
  const [messages, setMessages] = useState([{ id: "welcome", role: "assistant", content: GREETING }]);
  const [guestStarters, setGuestStarters] = useState(GUEST_STARTERS);
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (user) return undefined;
    let active = true;
    getWebAssistantStarters().then((data) => {
      if (!active || !data) return;
      if (Array.isArray(data.starters) && data.starters.length) {
        setGuestStarters(data.starters.slice(0, 4).map((prompt, index) => ({
          icon: GUEST_STARTERS[index]?.icon || "💬", label: prompt, prompt,
        })));
      }
      if (data.greeting) setMessages((current) => current.length === 1 ? [{ ...current[0], content: data.greeting }] : current);
    }).catch(() => {});
    return () => { active = false; };
  }, [user]);

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
    const history = messages.filter((item) => item.id !== "welcome").slice(-6).map((item) => ({ role: item.role, content: item.content }));
    setDraft("");
    setMessages((current) => [...current, { id: newId(), role: "user", content }]);
    setSending(true);
    try {
      const result = user
        ? await askAiTutor({ conversationId, message: content, mode: "auto" })
        : await askWebAssistant({ message: content, history });
      setMessages((current) => [...current, {
        id: result.message_id || newId(),
        role: "assistant",
        content: result.content || result.answer || COPY.noAnswer,
      }]);
    } catch (error) {
      setMessages((current) => [...current, {
        id: newId(),
        role: "assistant",
        content: `${COPY.connectionError} ${error.message}`,
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
    <aside className={`bee-chat-widget${variant === "roadmap" ? " bee-chat-widget--roadmap" : ""}`} aria-label={variant === "roadmap" ? COPY.novaAssistant : COPY.beeAssistant}>
      {open && (
        <section className="bee-chat-panel" role="dialog" aria-label={COPY.chatLabel}>
          <header className="bee-chat-header">
            <img className="bee-chat-avatar" src={beeMascot} alt="" />
            <div className="bee-chat-identity">
              <strong>{variant === "roadmap" ? COPY.novaName : COPY.beeName}</strong>
              <span><i aria-hidden="true" />{COPY.ready}</span>
            </div>
            <button className="bee-chat-close" type="button" aria-label={COPY.closeChat} onClick={() => setOpen(false)}>
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
            {sending && <div className="bee-chat-typing" role="status">{COPY.typing}<span>...</span></div>}
            <div ref={endRef} />
          </div>

          {messages.length === 1 && (
            <section className="bee-chat-suggestions" aria-label={COPY.suggestions}>
              <p>{COPY.suggestions}</p>
              <div>
                {(user ? STARTERS : guestStarters).map((starter) => (
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
              placeholder={COPY.placeholder}
              aria-label={COPY.questionLabel}
              maxLength={4000}
            />
            <button type="submit" aria-label={COPY.send} disabled={!draft.trim() || sending}>
              <ArrowRightIcon aria-hidden="true" />
            </button>
          </form>
        </section>
      )}

      <div className="bee-chat-launcher-wrap">
        {!open && variant !== "roadmap" && <span className="bee-chat-hint" aria-hidden="true">{COPY.hint}</span>}
        <button
          className="bee-chat-launcher"
          type="button"
          aria-label={open ? COPY.closeNova : COPY.openNova}
          title={COPY.askNova}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {variant === "roadmap" ? <><span className="bee-chat-launcher-icon"><Sparkles aria-hidden="true" /></span><span className="bee-chat-launcher-copy"><strong>{COPY.launcherTitle}</strong><small>{COPY.launcherSubtitle}</small></span></> : <img src={beeMascot} alt="" />}
        </button>
      </div>
    </aside>
  );
}

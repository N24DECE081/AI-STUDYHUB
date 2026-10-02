import { Copy, Sparkles } from "lucide-react";
import "./QuoteBubble.css";

const COPY = { copy: "Sao chép câu động lực", copied: "Đã sao chép", failed: "Không thể sao chép. Vui lòng thử lại." };

export default function QuoteBubble({ quote, open, onNotify }) {
  return (
    <aside className={"quote-bubble" + (open ? " is-open" : "")}
      role="status" aria-live="polite" aria-atomic="true" aria-hidden={!open}>
      <div className="quote-bubble-actions">
        <Sparkles size={18} aria-hidden="true" />
        <button type="button" aria-label={COPY.copy} title={COPY.copy} tabIndex={open ? 0 : -1}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(quote);
              onNotify?.(COPY.copied);
            } catch {
              onNotify?.(COPY.failed);
            }
          }}><Copy size={16} aria-hidden="true" /></button>
      </div>
      <p key={quote} className="quote-bubble-text">{quote}</p>
    </aside>
  );
}

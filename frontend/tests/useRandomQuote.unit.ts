import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import useRandomQuote from "../src/hooks/useRandomQuote";
import { motivationQuotes } from "../src/data/motivationQuotes";

// Runs the real hook with React's existing renderer; no extra test dependency.
export function checkRandomQuote() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let api: ReturnType<typeof useRandomQuote>;
  function Harness({ quotes }: { quotes: readonly string[] }) {
    api = useRandomQuote(quotes);
    return createElement("output", null, api.quote ?? "");
  }
  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => calls++ % 2 ? .999999 : 0;
  try {
    return [[], ["Một câu"], ["Một", "Hai"], motivationQuotes].map((quotes, key) => {
      flushSync(() => root.render(createElement(StrictMode, null, createElement(Harness, { quotes, key }))));
      const values = [], rendered = [];
      for (let i = 0; i < Math.max(10, quotes.length * 25); i++) {
        let next;
        flushSync(() => { next = api.pickNext(); });
        values.push(next);
        rendered.push(api.quote);
      }
      return { quotes, values, rendered };
    });
  } finally {
    Math.random = originalRandom;
    root.unmount();
    host.remove();
  }
}

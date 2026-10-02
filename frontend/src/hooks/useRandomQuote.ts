import { useCallback, useRef, useState } from "react";
import { motivationQuotes } from "../data/motivationQuotes";

export default function useRandomQuote(quotes: readonly string[] = motivationQuotes) {
  const [quote, setQuote] = useState<string | null>(null);
  const cycle = useRef<{ source: readonly string[]; remaining: number[]; previous: number | null }>({
    source: quotes, remaining: [], previous: null,
  });
  const pickNext = useCallback(() => {
    const state = cycle.current;
    if (state.source !== quotes) {
      state.source = quotes;
      state.remaining = [];
      state.previous = null;
    }
    if (!state.remaining.length) {
      state.remaining = quotes.map((_, index) => index);
      for (let i = state.remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.remaining[i], state.remaining[j]] = [state.remaining[j], state.remaining[i]];
      }
      const last = state.remaining.length - 1;
      if (last > 0 && state.remaining[last] === state.previous) {
        [state.remaining[0], state.remaining[last]] = [state.remaining[last], state.remaining[0]];
      }
    }
    const index = state.remaining.pop() ?? null;
    state.previous = index;
    const next = index === null ? null : quotes[index];
    setQuote(next);
    return next;
  }, [quotes]);
  return { quote, pickNext };
}

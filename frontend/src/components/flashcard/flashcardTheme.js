export const FLASHCARD_COLORS = [
  { name: "Xanh lam", value: "#38bdf8" },
  { name: "Tím", value: "#a78bfa" },
  { name: "Đỏ", value: "#fb7185" },
  { name: "Cam", value: "#fb923c" },
  { name: "Xanh lá", value: "#4ade80" },
  { name: "Vàng", value: "#facc15" },
  { name: "Tối", value: "#64748b" },
];

export const DEFAULT_FLASHCARD_COLOR = FLASHCARD_COLORS[0].value;

export const rememberedCount = (deck) =>
  (deck.cards || []).filter((card) => card.remembered).length;

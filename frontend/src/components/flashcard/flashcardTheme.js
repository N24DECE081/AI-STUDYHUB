export const STUDYHUB_FLASHCARD_COLORS = [
  { name: "Hồng StudyHub", value: "var(--primary-pink)" },
  { name: "Mint StudyHub", value: "var(--secondary-mint)" },
  { name: "Hồng nhạt", value: "var(--pink-soft)" },
  { name: "Mint nhạt", value: "var(--mint-soft)" },
  { name: "Hồng đậm", value: "var(--primary-pink-hover)" },
  { name: "Mint đậm", value: "var(--secondary-mint-hover)" },
];
export const FLASHCARD_COLORS = [
  ...STUDYHUB_FLASHCARD_COLORS,
  { name: "Xanh lam", value: "#38bdf8" },
  { name: "Tím", value: "#a78bfa" },
  { name: "Đỏ", value: "#fb7185" },
  { name: "Cam", value: "#fb923c" },
  { name: "Xanh lá", value: "#4ade80" },
  { name: "Vàng", value: "#facc15" },
  { name: "Tối", value: "#64748b" },
];

export const DEFAULT_FLASHCARD_COLOR = "#38bdf8";

export const rememberedCount = (deck) =>
  (deck.cards || []).filter((card) => card.remembered).length;

export const normalizeFlashcardColor = (value) =>
  FLASHCARD_COLORS.some((item) => item.value === String(value).toLowerCase())
    ? String(value).toLowerCase() : DEFAULT_FLASHCARD_COLOR;

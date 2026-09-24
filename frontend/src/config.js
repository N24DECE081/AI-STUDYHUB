// Retained only for legacy, currently unused screens. No separate AI server is
// assumed; local requests stay on the Vite origin unless explicitly configured.
export const AI_SERVICE_URL = String(import.meta.env.VITE_AI_SERVICE_URL || "").replace(/\/+$/, "");

import { buildSubjectHashMap, findSubject } from "./utils/subjectAlgorithms";

// Local development uses Vite's same-origin /api proxy, including when Vite
// falls back to another port. Set an explicit API URL only for separate hosting.
const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const apiBase = (configuredApiBase || "/api").replace(/\/+$/, "");
export const searchFocusMusic = (query, signal) => request(`/music/search?q=${encodeURIComponent(query)}`, { signal });
const publicAuthPaths = new Set([
  "/auth/login",
  "/auth/register",
  "/auth/logout",
  "/auth/password/otp",
  "/auth/password/verify",
  "/auth/password/reset",
  "/auth/oauth/status",
  "/me",
  "/auth/me",
]);

async function readError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || `HTTP ${response.status}` };
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
    });
  } catch {
    throw new Error(
      "Không kết nối được máy chủ StudyHub. Kiểm tra backend rồi thử lại.",
    );
  }
  if (!response.ok) {
    const detail = await readError(response);
    if (response.status === 401 && !publicAuthPaths.has(path)) {
      window.dispatchEvent(new Event("studyhub:session-expired"));
    }
    const error = new Error(detail.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = detail.code;
    error.detail = detail;
    throw error;
  }
  const result = await response.json();
  if (options.method && /^(\/upload|\/documents\/|\/flashcards|\/quizzes|\/ai\/chat|\/ai-tutor\/chat|\/subscription)/.test(path)) {
    window.dispatchEvent(new Event("studyhub:entitlements-changed"));
  }
  return result;
}

const postJson = (path, payload) =>
  request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });

export const login = (email, password) =>
  request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
export const register = ({ firstName, lastName, email, password }) =>
  request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ first_name: firstName, last_name: lastName, email, password }),
  });
export const logout = () => request("/auth/logout", { method: "POST" });
export const getCurrentUser = () => request("/me");
export const getOAuthStatus = () => request("/auth/oauth/status");
export const getOAuthLoginUrl = (provider) => `${apiBase}/auth/oauth/${encodeURIComponent(provider)}`;
export const completeProfile = ({ firstName, lastName }) => postJson("/auth/profile", { first_name: firstName, last_name: lastName });
export const requestPasswordOtp = (identifier) => postJson("/auth/password/otp", { identifier });
export const verifyPasswordOtp = ({ identifier, code }) => postJson("/auth/password/verify", { identifier, code });
export const resetPassword = ({ resetToken, password }) => postJson("/auth/password/reset", { reset_token: resetToken, password });
export const getSubjects = () => request("/subjects?scope=mine");
export const createSubject = ({ name, code, description }) =>
  request("/subjects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, code, description }),
  });
export const getDocuments = () => request("/documents");
export const getDocumentContent = (documentId) =>
  request(`/documents/${documentId}/content`);
export const deleteDocument = (documentId) =>
  request(`/documents/${documentId}`, { method: "DELETE" });
export const getProgress = () => request("/progress");
export const getStudyTime = () => request("/study-time");
export const getStreak = () => request("/streak");

export async function uploadDocument({
  file,
  title,
  description,
  subjectCode,
}) {
  const subjects = await request("/subjects?scope=mine");
  const normalizedSubject = String(subjectCode ?? "").trim();
  const subject = findSubject(buildSubjectHashMap(subjects), normalizedSubject);
  if (!subject)
    throw new Error("Môn học không tồn tại hoặc chưa được tải lại.");
  const body = new FormData();
  body.append("file", file);
  body.append("title", title);
  body.append("description", description || "");
  body.append("subject_id", subject.id);
  const result = await request("/upload", { method: "POST", body });
  return request(`/documents/${result.document_id}`);
}

export const createQuiz = (documentIds) =>
  request("/quizzes/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_ids: documentIds }),
  });

export const submitQuiz = (quizId, answers) =>
  request(`/quizzes/${quizId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });

export const getQuizHistory = () => request("/quizzes/history");

export const askTutor = ({ documentId, question, idempotencyKey = crypto.randomUUID() }) =>
  request("/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ document_id: documentId, question }),
  });
export const askAiTutor = ({ conversationId, message, mode, depth = "auto", model = "auto", fileIds = [], idempotencyKey = crypto.randomUUID() }) =>
  request("/ai-tutor/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({
      conversation_id: conversationId,
      message,
      mode,
      depth,
      model,
      file_ids: fileIds,
    }),
  });
export const getSubscription = () => request("/subscription");
export const getEntitlements = () => request("/me/entitlements");
export const getBasicQuizTopics = () => request("/quizzes/basic/topics");
export const createBasicQuiz = (topic) => postJson("/quizzes/basic", { topic });
export const checkoutSubscription = ({ plan, billingCycle }) =>
  request("/subscription/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan,
      billing_cycle: billingCycle,
    }),
  });
export const cancelSubscription = () =>
  request("/subscription/cancel", { method: "POST" });

// --- AI Tutor: lịch sử hội thoại, đánh giá năng lực, lộ trình, luyện tập, trạng thái engine ---
export const getMe = () => request("/auth/me");
export const getTutorEngine = () => request("/ai-tutor/engine");
export const getTutorConversations = () => request("/ai-tutor/conversations");
export const deleteTutorConversation = (conversationId) =>
  request(`/ai-tutor/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
export const deleteAllTutorConversations = () =>
  request("/ai-tutor/conversations", { method: "DELETE" });
export const getTutorAssessment = () => request("/ai-tutor/assessment");
export const startTutorAssessment = (payload) =>
  postJson("/ai-tutor/assessment/start", payload);
export const submitTutorAssessment = (payload) =>
  postJson("/ai-tutor/assessment/submit", payload);
export const getTutorRoadmap = () => request("/ai-tutor/roadmap");
export const generateTutorRoadmap = (payload) =>
  postJson("/ai-tutor/roadmap", payload);
export const getTutorExercises = () => request("/ai-tutor/exercises");
export const submitTutorExercise = (exerciseId, { answer, answerType = "text" }) =>
  postJson(`/ai-tutor/exercises/${exerciseId}/submit`, {
    answer,
    answer_type: answerType,
  });
export const getTutorSubmissions = () => request("/ai-tutor/submissions");

// --- Chatbot tư vấn thông tin StudyHub (widget nhỏ ở trang chủ, khách không cần đăng nhập) ---
export const getWebAssistantStarters = () => request("/web-assistant/starters");
export const askWebAssistant = ({ message, history = [] }) =>
  postJson("/web-assistant/chat", { message, history });


export const getFlashcardDecks = () => request('/flashcards');
export const saveFlashcardDeck = (deck) => postJson('/flashcards', deck);
export const deleteFlashcardDeck = (id) => request(`/flashcards/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const reviewFlashcard = (id, cardId, rating) => postJson(`/flashcards/${encodeURIComponent(id)}/review`, { card_id: cardId, rating });
export const getFlashcardPronunciation = (term, signal) => request(`/flashcards/pronunciation?term=${encodeURIComponent(term)}`, { signal });
export const previewFlashcardDocument = (file, signal) => {
  const body = new FormData(); body.append('file', file);
  return request('/flashcards/preview', { method: 'POST', body, signal });
};

export const previewDocumentMetadata = (file, signal) => {
  const body = new FormData(); body.append('file', file);
  return request('/documents/preview', { method: 'POST', body, signal });
};

import { buildSubjectHashMap, findSubject } from "./utils/subjectAlgorithms";

// Local development uses Vite's same-origin /api proxy, including when Vite
// falls back to another port. Set an explicit API URL only for separate hosting.
const configuredApiBase = String(import.meta.env.VITE_API_BASE_URL || "").trim();
const apiBase = (configuredApiBase || "/api").replace(/\/+$/, "");

async function readError(response) {
  const text = await response.text();
  try {
    return JSON.parse(text).error || text;
  } catch {
    return text || `HTTP ${response.status}`;
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
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
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
export const register = (name, email, password) =>
  request("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
export const logout = () => request("/auth/logout", { method: "POST" });
export const getCurrentUser = () => request("/me");
export const getOAuthStatus = () => request("/auth/oauth/status");
export const getOAuthLoginUrl = (provider) => `${apiBase}/auth/oauth/${encodeURIComponent(provider)}`;
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
  const response = await fetch(`${apiBase}/upload`, {
    method: "POST",
    credentials: "include",
    body,
  });
  if (!response.ok) throw new Error(await readError(response));
  const result = await response.json();
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

export const askTutor = ({ documentId, question }) =>
  request("/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId, question }),
  });
export const askAiTutor = ({ conversationId, message, mode, fileIds = [] }) =>
  request("/ai-tutor/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversation_id: conversationId,
      message,
      mode,
      file_ids: fileIds,
    }),
  });
export const getSubscription = () => request("/subscription");
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


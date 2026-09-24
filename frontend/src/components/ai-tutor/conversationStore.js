/** Local cache + server history merge for the Nova chat sidebar. */

export const STORE = 'studyhub-nova-conversations-v2';

export const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const welcome = () => ({
  id: newId(),
  role: 'assistant',
  content: 'Chào bạn, mình là **Nova**. Bạn muốn mình giải thích, gợi ý hay tạo quiz từ tài liệu nào?',
  seed: true,
});

export const freshConversation = () => ({ id: newId(), title: 'Cuộc hội thoại mới', updatedAt: Date.now(), messages: [welcome()] });

export const loadConversations = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORE));
    return Array.isArray(value) && value.length && value.every((item) => item?.id && Array.isArray(item.messages)) ? value : [freshConversation()];
  } catch {
    return [freshConversation()];
  }
};

export const persistConversations = (conversations) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(conversations));
  } catch {
    /* chế độ riêng tư: chỉ giữ trong state */
  }
};

const fingerprint = (message) => `${message.role}\u0000${String(message.content || '').trim()}`;

/** Server history wins on content; local-only messages (lời chào, tin nhắn lỗi) stay after it. */
export const mergeConversations = (local, remote) => {
  const byId = new Map(local.map((item) => [item.id, item]));
  const hydrated = remote.map((conversation) => {
    const existing = byId.get(conversation.conversation_id);
    byId.delete(conversation.conversation_id);
    const messages = (conversation.messages || [])
      .filter((message) => message.role && message.content)
      .map((message) => ({ id: String(message.message_id), role: message.role, content: message.content, quiz: message.quiz || null, mode: message.mode || null }));
    const seen = new Set(messages.map(fingerprint));
    const localOnly = (existing?.messages || []).filter((message) => !message.seed && !seen.has(fingerprint(message)));
    return {
      id: conversation.conversation_id,
      title: conversation.title || existing?.title || 'Cuộc hội thoại mới',
      updatedAt: existing?.updatedAt || Date.parse(conversation.updated_at) || Date.now(),
      messages: messages.length ? [...messages, ...localOnly] : (existing?.messages || [welcome()]),
    };
  });
  return [...byId.values(), ...hydrated];
};

/**
 * AI Service
 * Connects to StudyHub AI Tutor backend.
 * Currently uses mock responses to build out the UI.
 */

// Mock delay to simulate network request
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const aiService = {
  /**
   * Send a message to the AI Tutor
   * @param {string} message The user's question or message
   * @param {Array} history Optional conversation history
   * @returns {Promise<string>} The AI's response
   */
  async sendMessage(message, history = []) {
    try {
      // TODO: Replace with real API call when ready
      // const response = await fetch('/api/ai/chat', { ... });
      // return response.json();
      
      // Simulating API call
      await delay(1200 + Math.random() * 1000);
      
      const lowerMsg = message.toLowerCase();
      
      if (lowerMsg.includes('xin chào') || lowerMsg.includes('hi')) {
        return "Xin chào! 👋 Mình là StudyHub AI Assistant. Hôm nay mình có thể giúp gì cho việc học của bạn?";
      }
      if (lowerMsg.includes('bài tập') || lowerMsg.includes('toán')) {
        return "Để giải quyết bài toán này, chúng ta cần phân tích từng bước. Bạn có thể cung cấp thêm chi tiết về bài tập bạn đang gặp khó khăn không?";
      }
      if (lowerMsg.includes('lịch học') || lowerMsg.includes('thời gian')) {
        return "Bạn có muốn mình gợi ý một thời gian biểu ôn tập cho kỳ thi sắp tới không? Hãy cho mình biết môn học và ngày thi nhé.";
      }
      
      return `Đây là câu trả lời mô phỏng cho: "${message}". Hiện tại hệ thống AI đang trong quá trình nâng cấp, mình sẽ sớm hỗ trợ bạn chi tiết hơn! 🚀`;
      
    } catch (error) {
      console.error("AI Service Error:", error);
      throw new Error("Không thể kết nối đến AI. Vui lòng thử lại sau.");
    }
  }
};

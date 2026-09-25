import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot } from 'lucide-react';
import AIMessage from './AIMessage';
import { aiService } from '../../services/aiService';

const AIChatPanel = ({ onClose }) => {
  const [messages, setMessages] = useState([
    { id: 1, text: "Xin chào! 👋\nTôi có thể giúp gì cho việc học của bạn?", isUser: false }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    const newUserMessage = { id: Date.now(), text: userText, isUser: true };
    
    setMessages(prev => [...prev, newUserMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Future: Pass history to service if needed
      const response = await aiService.sendMessage(userText);
      setMessages(prev => [...prev, { id: Date.now(), text: response, isUser: false }]);
    } catch (error) {
      setMessages(prev => [...prev, { 
        id: Date.now(), 
        text: "Xin lỗi, đã có lỗi xảy ra. Bạn có thể thử lại sau nhé.", 
        isUser: false 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ai-chat-panel">
      {/* Header */}
      <div className="ai-chat-header">
        <div className="ai-chat-header-brand">
          <div className="ai-chat-logo">
            <Bot size={20} />
          </div>
          <div className="ai-chat-titles">
            <span className="ai-chat-title">STUDYHUB</span>
            <span className="ai-chat-subtitle">Your AI Study Assistant</span>
          </div>
        </div>
        <button className="ai-chat-close" onClick={onClose} aria-label="Close chat">
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.map(msg => (
          <AIMessage key={msg.id} text={msg.text} isUser={msg.isUser} />
        ))}
        {isLoading && <AIMessage isTyping={true} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="ai-chat-input-area">
        <div className="ai-chat-input-wrapper">
          <input
            type="text"
            className="ai-chat-input"
            placeholder="Nhập câu hỏi..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button 
            className="ai-chat-send-btn" 
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            aria-label="Gửi tin nhắn"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIChatPanel;

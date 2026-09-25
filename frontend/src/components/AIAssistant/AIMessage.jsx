import React from 'react';

const AIMessage = ({ text, isUser, isTyping }) => {
  if (isTyping) {
    return (
      <div className="ai-message assistant">
        <div className="ai-typing-indicator">
          <div className="ai-typing-dot"></div>
          <div className="ai-typing-dot"></div>
          <div className="ai-typing-dot"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ai-message ${isUser ? 'user' : 'assistant'}`}>
      <div className="ai-message-bubble">
        {text}
      </div>
    </div>
  );
};

export default AIMessage;

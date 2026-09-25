import React, { useState } from 'react';
import { Bot, Sparkles } from 'lucide-react';
import AIChatPanel from './AIChatPanel';

const AIAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="ai-assistant-wrapper">
      {isOpen && (
        <AIChatPanel onClose={() => setIsOpen(false)} />
      )}
      
      {!isOpen && (
        <button 
          className="ai-floating-btn"
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Assistant"
        >
          <Sparkles size={24} />
        </button>
      )}
    </div>
  );
};

export default AIAssistant;

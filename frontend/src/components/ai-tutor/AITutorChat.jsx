import { useEffect, useRef } from 'react';
import AITutorMessage from './AITutorMessage';
import AITutorInput from './AITutorInput';

export default function AITutorChat({ conversation, ...props }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [conversation.messages.length, props.sending]);
  const engine = props.engine;
  const status = engine ? engine.label : 'Sẵn sàng hỗ trợ';
  return <section className="tutor-chat"><header className="tutor-chat-header"><button className="tutor-menu" onClick={props.onOpenSidebar}>☰</button><div><span className="tutor-overline">STUDYHUB AI</span><h1>AI Tutor <em>Nova</em></h1></div><span className={`tutor-status ${engine?.engine === 'local' || engine?.degraded ? 'offline' : ''}`} title={engine?.hint || ''}><i /> {status}</span></header>
    <div className="tutor-messages">{conversation.messages.map((message) => <AITutorMessage key={message.id} message={message} onRetry={() => props.onRetry(message)} />)}{props.sending && <div className="tutor-thinking"><i /><i /><i /> Nova đang suy nghĩ…</div>}<div ref={endRef} /></div>
    <AITutorInput {...props} />
  </section>;
}

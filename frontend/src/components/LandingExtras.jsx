import { ArrowRightIcon, CheckIcon, SparklesIcon } from '@heroicons/react/24/outline';

const FAQ = [
  ['StudyHub giúp mình học như thế nào?', 'Bạn có thể gom tài liệu theo môn, ôn bằng Quiz Card, xây lộ trình và theo dõi tiến độ trong cùng một không gian. Nova AI giúp giải thích những phần bạn chưa hiểu.'],
  ['Mình có thể bắt đầu miễn phí không?', 'Có. Bạn có thể đăng ký Gói khởi động miễn phí và trải nghiệm các công cụ học tập trong giới hạn của gói. Xem đầy đủ quyền lợi ở mục Gói học.'],
  ['Quiz Card và lộ trình học có liên quan đến tài liệu của mình không?', 'Bạn chọn tài liệu và môn học để tạo Quiz Card. Công cụ lộ trình giúp sắp xếp chủ đề, mục tiêu và các bước học phù hợp với tài liệu đã lưu.'],
  ['Mình có dùng StudyHub trên điện thoại được không?', 'Có. Giao diện thích ứng với điện thoại, máy tính bảng và máy tính. Bạn cũng có thể chọn giao diện sáng hoặc tối theo sở thích.'],
];

const COPY = {
  tutorEyebrow: '✦ NOVA AI TUTOR', tutorTitle: ['Một người bạn học.', 'Nhiều cách để hiểu.'],
  tutorDescription: 'Gỡ rối một khái niệm, kết nối kiến thức, tìm ra cách giải. Nova đồng hành để bạn hiểu sâu hơn từng ngày.',
  tutorCta: 'Bắt đầu cùng Nova', chatLabel: 'Minh họa trò chuyện với Nova AI', nova: 'Nova AI', chatCaption: 'Đoạn hội thoại minh họa',
  chatQuestion: 'Mình nên ôn tập thế nào để nhớ lâu hơn?', chatAnswerTitle: 'Cùng chia nhỏ việc học nhé ✦',
  chatAnswer: 'Thử tự nhớ lại kiến thức trước khi xem đáp án, rồi ôn lại sau những khoảng thời gian tăng dần.',
  chatSteps: ['Chọn một chủ đề nhỏ để bắt đầu.', 'Dùng Quiz Card để tự kiểm tra.', 'Ưu tiên ôn lại những thẻ chưa nhớ.'],
  chatPlaceholder: 'Bạn muốn hiểu thêm điều gì?', pricingEyebrow: 'GÓI HỌC', pricingTitle: 'Đầu tư nhỏ. Tiến bộ dài lâu.',
  pricingDescription: 'Bắt đầu miễn phí, chọn thêm công cụ khi bạn cần.', monthly: ' / tháng', freeCta: 'Bắt đầu miễn phí', paidCta: 'Đăng ký trải nghiệm',
  comparePlans: 'So sánh đầy đủ quyền lợi các gói', faqEyebrow: 'CÂU HỎI THƯỜNG GẶP', faqTitle: 'Bạn hỏi, StudyHub trả lời.',
  finalEyebrow: 'BẮT ĐẦU TỪ HÔM NAY', finalTitle: 'Một nhịp học mới, dành cho bạn.',
  finalDescription: 'Để mỗi lần ngồi xuống học đều là một bước tiến.', finalCta: 'Tạo tài khoản miễn phí',
};

export default function LandingExtras({ plans, onStart, onExplore }) {
  return <>
    <section className="content-section landing-tutor">
      <div className="landing-tutor-copy">
        <span className="eyebrow">{COPY.tutorEyebrow}</span>
        <h2>{COPY.tutorTitle[0]}<br />{COPY.tutorTitle[1]}</h2>
        <p>{COPY.tutorDescription}</p>
        <button className="btn btn-primary" onClick={onStart}>{COPY.tutorCta} <ArrowRightIcon aria-hidden="true" /></button>
      </div>
      <div className="landing-chat" aria-label={COPY.chatLabel}>
        <div className="landing-chat-head"><span><SparklesIcon aria-hidden="true" /> {COPY.nova}</span><small>{COPY.chatCaption}</small></div>
        <p className="landing-chat-question">{COPY.chatQuestion}</p>
        <div className="landing-chat-answer"><strong>{COPY.chatAnswerTitle}</strong><p>{COPY.chatAnswer}</p><ul>{COPY.chatSteps.map(step => <li key={step}>{step}</li>)}</ul></div>
        <button className="landing-chat-input" onClick={onStart}>{COPY.chatPlaceholder} <ArrowRightIcon aria-hidden="true" /></button>
      </div>
    </section>
    <section className="content-section landing-pricing">
      <span className="eyebrow">{COPY.pricingEyebrow}</span>
      <h2>{COPY.pricingTitle}</h2>
      <p>{COPY.pricingDescription}</p>
      <div className="price-grid">
        {Object.entries(plans).map(([id, plan]) => <article className={`price-card ${id === 'plus' ? 'featured' : ''}`} key={id}>
          <span className="landing-plan-label">{plan.badge}</span><h3>{plan.name}</h3>
          <div className="price-line">{plan.price}<span>{id !== 'free' && COPY.monthly}</span></div>
          <ul>{plan.items.slice(0, 4).map(item => <li key={item}><CheckIcon aria-hidden="true" />{item}</li>)}</ul>
          <button className={`btn ${id === 'plus' ? 'btn-primary' : 'btn-outline'}`} onClick={onStart}>{id === 'free' ? COPY.freeCta : COPY.paidCta} <ArrowRightIcon aria-hidden="true" /></button>
        </article>)}
      </div>
      <button className="text-link landing-all-plans" onClick={() => onExplore('pricing')}>{COPY.comparePlans} <ArrowRightIcon aria-hidden="true" /></button>
    </section>
    <section className="content-section landing-faq">
      <span className="eyebrow">{COPY.faqEyebrow}</span><h2>{COPY.faqTitle}</h2>
      <div>{FAQ.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
    </section>
    <section className="landing-final"><span className="eyebrow">{COPY.finalEyebrow}</span><h2>{COPY.finalTitle}</h2><p>{COPY.finalDescription}</p><button className="btn btn-primary large" onClick={onStart}>{COPY.finalCta} <ArrowRightIcon aria-hidden="true" /></button></section>
  </>;
}

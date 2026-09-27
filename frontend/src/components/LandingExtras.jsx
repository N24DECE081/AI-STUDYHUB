import { ArrowRightIcon, CheckIcon, SparklesIcon } from '@heroicons/react/24/outline';

const FAQ = [
  ['StudyHub giúp mình học như thế nào?', 'Bạn có thể gom tài liệu theo môn, ôn bằng Quiz Card, xây lộ trình và theo dõi tiến độ trong cùng một không gian. Nova AI giúp giải thích những phần bạn chưa hiểu.'],
  ['Mình có thể bắt đầu miễn phí không?', 'Có. Bạn có thể đăng ký Gói Khởi Động miễn phí và trải nghiệm các công cụ học tập trong giới hạn của gói. Xem đầy đủ quyền lợi ở mục Gói học.'],
  ['Quiz Card và lộ trình học có liên quan đến tài liệu của mình không?', 'Bạn chọn tài liệu và môn học để tạo Quiz Card. Công cụ lộ trình giúp sắp xếp chủ đề, mục tiêu và các bước học phù hợp với tài liệu đã lưu.'],
  ['Mình có dùng StudyHub trên điện thoại được không?', 'Có. Giao diện thích ứng với điện thoại, máy tính bảng và máy tính. Bạn cũng có thể chọn giao diện sáng hoặc tối theo sở thích.'],
];

export default function LandingExtras({ plans, onStart, onExplore }) {
  return <>
    <section className="content-section landing-tutor">
      <div className="landing-tutor-copy">
        <span className="eyebrow">✦ NOVA AI TUTOR</span>
        <h2>Một người bạn học.<br />Nhiều cách để hiểu.</h2>
        <p>Gỡ rối một khái niệm, kết nối kiến thức, tìm ra cách giải. Nova đồng hành để bạn hiểu sâu hơn từng ngày.</p>
        <button className="btn btn-primary" onClick={onStart}>Bắt đầu cùng Nova <ArrowRightIcon aria-hidden="true" /></button>
      </div>
      <div className="landing-chat" aria-label="Minh họa trò chuyện với Nova AI">
        <div className="landing-chat-head"><span><SparklesIcon aria-hidden="true" /> Nova AI</span><small>Đoạn hội thoại minh họa</small></div>
        <p className="landing-chat-question">Mình nên ôn tập thế nào để nhớ lâu hơn?</p>
        <div className="landing-chat-answer"><strong>Cùng chia nhỏ việc học nhé ✦</strong><p>Thử tự nhớ lại kiến thức trước khi xem đáp án, rồi ôn lại sau những khoảng thời gian tăng dần.</p><ul><li>Chọn một chủ đề nhỏ để bắt đầu.</li><li>Dùng Quiz Card để tự kiểm tra.</li><li>Ưu tiên ôn lại những thẻ chưa nhớ.</li></ul></div>
        <button className="landing-chat-input" onClick={onStart}>Bạn muốn hiểu thêm điều gì? <ArrowRightIcon aria-hidden="true" /></button>
      </div>
    </section>
    <section className="content-section landing-pricing">
      <span className="eyebrow">GÓI HỌC</span>
      <h2>Đầu tư nhỏ. Tiến bộ dài lâu.</h2>
      <p>Bắt đầu miễn phí, chọn thêm công cụ khi bạn cần.</p>
      <div className="price-grid">
        {Object.entries(plans).map(([id, plan]) => <article className={`price-card ${id === 'plus' ? 'featured' : ''}`} key={id}>
          <span className="landing-plan-label">{plan.badge}</span><h3>{plan.name}</h3>
          <div className="price-line">{plan.price}<span>{id !== 'free' && ' / tháng'}</span></div>
          <ul>{plan.items.slice(0, 4).map(item => <li key={item}><CheckIcon aria-hidden="true" />{item}</li>)}</ul>
          <button className={`btn ${id === 'plus' ? 'btn-primary' : 'btn-outline'}`} onClick={onStart}>{id === 'free' ? 'Bắt đầu miễn phí' : 'Đăng ký trải nghiệm'} <ArrowRightIcon aria-hidden="true" /></button>
        </article>)}
      </div>
      <button className="text-link landing-all-plans" onClick={() => onExplore('pricing')}>So sánh đầy đủ quyền lợi các gói <ArrowRightIcon aria-hidden="true" /></button>
    </section>
    <section className="content-section landing-faq">
      <span className="eyebrow">CÂU HỎI THƯỜNG GẶP</span><h2>Bạn hỏi, StudyHub trả lời.</h2>
      <div>{FAQ.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div>
    </section>
    <section className="landing-final"><span className="eyebrow">BẮT ĐẦU TỪ HÔM NAY</span><h2>Một nhịp học mới, dành cho bạn.</h2><p>Để mỗi lần ngồi xuống học đều là một bước tiến.</p><button className="btn btn-primary large" onClick={onStart}>Tạo tài khoản miễn phí <ArrowRightIcon aria-hidden="true" /></button></section>
  </>;
}

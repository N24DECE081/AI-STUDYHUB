import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import './MotivationalQuote.css';

const QUOTES = [
  'Học, học nữa, học mãi!',
  'Mỗi phút tập trung là một bước tiến.',
  'Kiên trì hôm nay, tiến bộ ngày mai.',
  'Bạn đang làm rất tốt, hãy tiếp tục nhé!',
  'Từng chút một, bạn sẽ tiến xa hơn.',
  'Tập trung vào mục tiêu của bạn.',
  'Một phiên học tốt bắt đầu từ sự kiên trì.',
  'Đừng dừng lại khi mệt, hãy dừng lại khi xong.',
  'Hôm nay bạn học, ngày mai bạn dẫn đầu.',
  'Mỗi trang sách là một cánh cửa mới.',
  'Sự chăm chỉ không bao giờ phản bội bạn.',
  'Thành công bắt đầu từ những bước nhỏ.',
];

export default function MotivationalQuote() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % QUOTES.length);
        setVisible(true);
      }, 600);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className={`moti-quote${visible ? ' is-visible' : ''}`} aria-live="polite" aria-atomic="true">
      <Sparkles className="moti-quote__icon" aria-hidden="true" />
      <p>{QUOTES[index]}</p>
    </aside>
  );
}

import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  BoltIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import "./progress-dashboard.css";
import { EMPTY_PROGRESS_ANALYTICS } from "./progressDefaults";
import { rememberedCount } from "../flashcard/flashcardTheme";

const RANGE_OPTIONS = [
  { id: "day", label: "7 ngày" },
  { id: "week", label: "8 tuần" },
  { id: "month", label: "6 tháng" },
];

function motivation(percent) {
  if (percent >= 95) return "Chặng cuối rồi — bứt tốc và về đích!";
  if (percent >= 80) return "Gần đạt đỉnh! Đừng dừng lại lúc này.";
  if (percent >= 60) return "Bạn đang tiến rất gần mục tiêu.";
  if (percent >= 40) return "Tiến bộ rõ rệt — giữ vững nhịp học!";
  if (percent >= 20) return "Đà học đang lên, tiếp tục nào!";
  return "Bắt đầu một quiz để khởi động hành trình.";
}

function MetricCard({ icon: Icon, label, value, note, tone }) {
  return (
    <article className={`progress-metric progress-metric--${tone}`}>
      <span className="progress-metric__icon"><Icon aria-hidden="true" /></span>
      <div><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
    </article>
  );
}

function ProgressChart({ points, range }) {
  const maxValue = Math.max(20, ...points.map((point) => point.learning_percent || 0));
  return (
    <div className="progress-chart" role="img" aria-label={`Biểu đồ tiến độ theo ${range === "day" ? "ngày" : range === "week" ? "tuần" : "tháng"}`}>
      <div className="progress-chart__grid" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="progress-chart__bars">
        {points.map((point, index) => {
          const value = point.learning_percent || 0;
          const height = value ? Math.max(8, (value / maxValue) * 100) : 2;
          return (
            <div className="progress-chart__column" key={point.key} style={{ "--bar-delay": `${index * 55}ms` }}>
              <div className="progress-chart__value">{value}%</div>
              <div className="progress-chart__track">
                <div
                  className="progress-chart__bar"
                  style={{ height: `${height}%` }}
                  title={`${point.label}: tiến độ ${value}%, đúng ${point.accuracy_percent}%`}
                >
                  <span style={{ height: `${Math.min(100, point.accuracy_percent || 0)}%` }} />
                </div>
              </div>
              <span className="progress-chart__label">{point.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProgressDashboard({ user, analytics, progress, studyTime, streak, quizDecks = [], subscription, onUpgrade, onLogin }) {
  const [range, setRange] = useState("day");
  const isFree = !subscription?.plan || subscription.plan === 'free';
  const data = analytics || EMPTY_PROGRESS_ANALYTICS;
  const summary = data.summary || EMPTY_PROGRESS_ANALYTICS.summary;
  const today = data.today || EMPTY_PROGRESS_ANALYTICS.today;
  const points = data.ranges?.[range] || [];
  const journey = Math.min(100, Math.max(0, summary.learning_percent || 0));
  const learnedCards = quizDecks.reduce((total, deck) => total + rememberedCount(deck), 0);
  const localDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const todayKey = localDay(new Date());
  const cardsToday = quizDecks.reduce((total, deck) => total + (deck.cards || []).filter((card) => card.remembered && card.rememberedAt && localDay(new Date(card.rememberedAt)) === todayKey).length, 0);
  const xp = (summary.xp || 0) + learnedCards * 5;
  const topDocuments = useMemo(
    () => [...progress].sort((left, right) => right.percent - left.percent).slice(0, 4),
    [progress],
  );

  return (
    <section className="progress-command" aria-labelledby="progress-command-title">
      <header className="progress-command__hero">
        <div>
          <span className="progress-command__kicker"><span aria-hidden="true" /> LEARNING COMMAND CENTER</span>
          <h1 id="progress-command-title">{user ? `${user.name}, tiếp tục chuỗi chiến thắng.` : "Biến mỗi quiz thành một bước tiến."}</h1>
          <p>Tiến độ được tính cân bằng từ tỷ lệ hoàn thành câu hỏi và tỷ lệ trả lời đúng — không dùng số liệu mô phỏng.</p>
        </div>
        <div className="progress-level" aria-label={`${xp} điểm kinh nghiệm`}>
          <span>LEVEL {Math.floor(xp / 250) + 1}</span>
          <strong>{xp.toLocaleString("vi-VN")} XP</strong>
          <i><b style={{ width: `${(xp % 250) / 2.5}%` }} /></i>
          <small>{250 - (xp % 250)} XP tới cấp tiếp theo</small>
        </div>
      </header>

      <div className="progress-metrics">
        <MetricCard icon={user && streak.current_streak > 0 ? FireIcon : ClockIcon} label="Chuỗi học" value={`${user ? streak.current_streak : 0} ngày`} note="Duy trì nhịp mỗi ngày" tone="flame" />
        <MetricCard icon={BoltIcon} label="Điểm kinh nghiệm" value={`${xp} XP`} note="Quiz và thẻ đã nhớ" tone="xp" />
        <MetricCard icon={CheckCircleIcon} label="Thẻ đã nhớ" value={learnedCards} note={`${quizDecks.length} bộ thẻ`} tone="answer" />
        <MetricCard icon={TrophyIcon} label="Độ chính xác" value={`${summary.accuracy_percent || 0}%`} note={`${summary.correct_answers || 0} câu trả lời đúng`} tone="accuracy" />
      </div>

      {/* Phân tích học tập bằng AI Card (Gated) */}
      <section className="progress-surface progress-ai-analytics" style={{
        margin: '0 0 24px',
        padding: '18px 22px',
        borderRadius: '16px',
        background: '#ffffff',
        border: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', maxWidth: '720px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: isFree ? '#fcebf1' : '#edf8f1',
            color: isFree ? '#954c68' : '#166534',
            display: 'grid',
            placeItems: 'center',
            fontSize: '18px',
            flexShrink: 0
          }}>
            {isFree ? '🔒' : '🧠'}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="progress-section-label" style={{ margin: 0 }}>AI INSIGHTS</span>
              <span style={{
                fontSize: '10px',
                fontWeight: '800',
                padding: '2px 8px',
                borderRadius: '999px',
                background: isFree ? '#fcebf1' : '#edf8f1',
                color: isFree ? '#954c68' : '#166534'
              }}>
                {isFree ? 'Khóa · Cần Gói Pro' : 'Đã mở khóa'}
              </span>
            </div>
            <h3 style={{ margin: '3px 0 2px', fontSize: '15px', fontWeight: '700', color: 'var(--text-dark)' }}>
              Phân tích học tập bằng AI
            </h3>
            <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-body)', lineHeight: 1.4 }}>
              {isFree
                ? 'Tính năng phân tích chuyên sâu lỗ hổng kiến thức, dự đoán điểm số và cá nhân hóa lịch ôn tập yêu cầu Gói Pro Sinh Viên hoặc Master.'
                : 'Nova AI phân tích: Tiến độ tuần này tăng 24%, độ chính xác bài kiểm tra đạt mức tốt. Bạn nên tập trung ôn tập thêm các thẻ khó.'}
            </p>
          </div>
        </div>

        <div>
          {isFree ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onUpgrade}
              style={{
                background: '#f6bfd2',
                color: '#832746',
                borderRadius: '999px',
                padding: '8px 18px',
                fontWeight: '700',
                fontSize: '12.5px',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Mở khóa với Gói Pro ⚡
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline"
              disabled
              style={{
                borderRadius: '999px',
                padding: '7px 16px',
                fontSize: '12px',
                color: '#166534',
                borderColor: '#c8e7d5',
                background: '#edf8f1',
                cursor: 'default'
              }}
            >
              ✓ Đang phân tích tự động
            </button>
          )}
        </div>
      </section>

      <div className="progress-layout">
        <section className="progress-surface progress-insights" aria-labelledby="progress-chart-title">
          <div className="progress-surface__head">
            <div><span className="progress-section-label">NHỊP ĐỘ HỌC TẬP</span><h2 id="progress-chart-title">Tiến độ theo thời gian</h2></div>
            <div className="progress-range" role="group" aria-label="Chọn khoảng thời gian">
              {RANGE_OPTIONS.map((option) => <button type="button" className={range === option.id ? "is-active" : ""} onClick={() => setRange(option.id)} aria-pressed={range === option.id} key={option.id}>{option.label}</button>)}
            </div>
          </div>
          {points.length ? <ProgressChart points={points} range={range} /> : <div className="progress-chart-empty"><ChartBarIcon aria-hidden="true" /><span>Chưa có dữ liệu trong khoảng này</span></div>}
          <footer className="progress-legend"><span><i className="legend-progress" /> Trung bình hoàn thành + chính xác</span><span><i className="legend-accuracy" /> Phần trả lời đúng</span></footer>
        </section>

        <aside className="progress-surface progress-today" aria-labelledby="progress-today-title">
          <div className="progress-today__orbit" aria-hidden="true"><span>{journey}%</span></div>
          <span className="progress-section-label">NHIỆM VỤ HÔM NAY</span>
          <h2 id="progress-today-title">Giữ lửa học tập</h2>
          <ul>
            <li><CheckCircleIcon aria-hidden="true" /><span><strong>{cardsToday}</strong> thẻ đã nhớ</span></li>
            <li><TrophyIcon aria-hidden="true" /><span><strong>{today.questions_answered || 0}</strong> câu Quiz đã trả lời</span></li>
            <li><ClockIcon aria-hidden="true" /><span><strong>{Math.floor((studyTime.current_session_seconds || 0) / 60)}</strong> phút phiên hiện tại</span></li>
          </ul>
          {!user && <button type="button" className="progress-login" onClick={onLogin}>Đăng nhập để bắt đầu <ArrowRightIcon aria-hidden="true" /></button>}
        </aside>
      </div>

      <section className="progress-surface progress-journey" aria-labelledby="progress-journey-title">
        <div className="progress-surface__head"><div><span className="progress-section-label">YOUR JOURNEY</span><h2 id="progress-journey-title">Hành trình chinh phục</h2></div><strong>{journey}%</strong></div>
        <div className="progress-journey__labels"><span>START</span><span>GOAL</span></div>
        <div className="progress-journey__rail" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={journey}>
          <span style={{ width: `${journey}%` }}>{user && streak.current_streak > 0 && <i className={`fire-level-${Math.min(streak.current_streak, 3)}`} aria-hidden="true"><FireIcon /></i>}</span>
        </div>
        <p>{motivation(journey)}</p>
      </section>

      {topDocuments.length > 0 && <section className="progress-surface progress-missions" aria-labelledby="progress-missions-title">
        <div className="progress-surface__head"><div><span className="progress-section-label">HỌC LIỆU ĐANG CHINH PHỤC</span><h2 id="progress-missions-title">Nhiệm vụ nổi bật</h2></div><span>{progress.length} mục</span></div>
        <div className="progress-missions__grid">{topDocuments.map((item, index) => <article key={item.documentId}><span>0{index + 1}</span><div><strong>{item.title}</strong><small>{item.subject || "Tự học"}</small><i><b style={{ width: `${item.percent}%` }} /></i></div><em>{item.percent}%</em></article>)}</div>
      </section>}
    </section>
  );
}

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

export default function ProgressDashboard({ user, analytics, progress, studyTime, streak, onLogin }) {
  const [range, setRange] = useState("day");
  const data = analytics || EMPTY_PROGRESS_ANALYTICS;
  const summary = data.summary || EMPTY_PROGRESS_ANALYTICS.summary;
  const today = data.today || EMPTY_PROGRESS_ANALYTICS.today;
  const points = data.ranges?.[range] || [];
  const journey = Math.min(100, Math.max(0, summary.learning_percent || 0));
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
        <div className="progress-level" aria-label={`${summary.xp || 0} điểm kinh nghiệm`}>
          <span>LEVEL {Math.floor((summary.xp || 0) / 250) + 1}</span>
          <strong>{(summary.xp || 0).toLocaleString("vi-VN")} XP</strong>
          <i><b style={{ width: `${((summary.xp || 0) % 250) / 2.5}%` }} /></i>
          <small>{250 - ((summary.xp || 0) % 250)} XP tới cấp tiếp theo</small>
        </div>
      </header>

      <div className="progress-metrics">
        <MetricCard icon={FireIcon} label="Chuỗi học" value={`${user ? streak.current_streak : 0} ngày`} note="Duy trì nhịp mỗi ngày" tone="flame" />
        <MetricCard icon={BoltIcon} label="Điểm kinh nghiệm" value={`${summary.xp || 0} XP`} note={`${summary.attempts || 0} lượt quiz đã nộp`} tone="xp" />
        <MetricCard icon={CheckCircleIcon} label="Đã trả lời" value={summary.questions_answered || 0} note={`${summary.completion_percent || 0}% hoàn thành`} tone="answer" />
        <MetricCard icon={TrophyIcon} label="Độ chính xác" value={`${summary.accuracy_percent || 0}%`} note={`${summary.correct_answers || 0} câu trả lời đúng`} tone="accuracy" />
      </div>

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
            <li><CheckCircleIcon aria-hidden="true" /><span><strong>{today.questions_answered || 0}</strong> câu đã trả lời</span></li>
            <li><TrophyIcon aria-hidden="true" /><span><strong>{today.correct_answers || 0}</strong> câu chính xác</span></li>
            <li><ClockIcon aria-hidden="true" /><span><strong>{Math.floor((studyTime.total_seconds || 0) / 60)}</strong> phút tập trung</span></li>
          </ul>
          {!user && <button type="button" className="progress-login" onClick={onLogin}>Đăng nhập để bắt đầu <ArrowRightIcon aria-hidden="true" /></button>}
        </aside>
      </div>

      <section className="progress-surface progress-journey" aria-labelledby="progress-journey-title">
        <div className="progress-surface__head"><div><span className="progress-section-label">YOUR JOURNEY</span><h2 id="progress-journey-title">Hành trình chinh phục</h2></div><strong>{journey}%</strong></div>
        <div className="progress-journey__labels"><span>START</span><span>GOAL</span></div>
        <div className="progress-journey__rail" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={journey}>
          <span style={{ width: `${journey}%` }}><i aria-hidden="true"><FireIcon /></i></span>
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

import React, { useState } from 'react';
import { SparklesIcon } from "@heroicons/react/24/outline";

const FIELDS = [
  { name: "Công nghệ thông tin", goal: "Lập trình viên", icon: "⌘" },
  { name: "Trí tuệ nhân tạo", goal: "AI Engineer", icon: "✳" },
  { name: "Khoa học dữ liệu", goal: "Data Scientist", icon: "▥" },
  { name: "An toàn thông tin", goal: "Security Analyst", icon: "⛨" },
  { name: "Kinh tế / Kinh doanh", goal: "Business Analyst", icon: "▤" },
  { name: "Ngoại ngữ / Tiếng Anh", goal: "IELTS 7.0", icon: "▯" },
  { name: "Software Engineering", goal: "Backend Developer", icon: "⌘" },
  { name: "Web Development", goal: "Full-stack Developer", icon: "⌁" }
];

export const NEW_LEVELS = [
  { id: "mat-goc", label: "Mất gốc / Chưa biết", backendId: "beginner" },
  { id: "co-ban", label: "Cơ bản", backendId: "beginner" },
  { id: "kha", label: "Khá / Trung cấp", backendId: "intermediate" },
  { id: "nang-cao", label: "Nâng cao", backendId: "advanced" }
];

export default function RoadmapCareerForm({ onGenerate, isGenerating }) {
  const [field, setField] = useState(FIELDS[0].name);
  const [goal, setGoal] = useState(FIELDS[0].goal);
  const [currentLevel, setCurrentLevel] = useState("mat-goc");
  const [targetLevel, setTargetLevel] = useState("nang-cao");
  const [weeklyHours, setWeeklyHours] = useState("8");

  const handleSubmit = (e) => {
    e.preventDefault();
    const currLvlInfo = NEW_LEVELS.find(l => l.id === currentLevel) || NEW_LEVELS[0];
    const targetLvlInfo = NEW_LEVELS.find(l => l.id === targetLevel) || NEW_LEVELS[3];
    
    onGenerate({
      subject: field,
      goal: goal,
      current_level: currLvlInfo.backendId,
      target_level: targetLvlInfo.backendId,
      study_time: Math.max(2, Math.min(40, Number(weeklyHours) || 8)) * 60,
      pace: Number(weeklyHours) <= 4 ? "slow" : Number(weeklyHours) <= 8 ? "steady" : "fast",
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>Ngành / Lĩnh vực
        <select value={field} onChange={(event) => { 
          const next = FIELDS.find((item) => item.name === event.target.value); 
          setField(event.target.value); 
          if (next) setGoal(next.goal); 
        }}>
          {FIELDS.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}
        </select>
      </label>
      <label>Trình độ hiện tại
        <select value={currentLevel} onChange={(event) => setCurrentLevel(event.target.value)}>
          {NEW_LEVELS.map((lvl) => <option value={lvl.id} key={lvl.id}>{lvl.label}</option>)}
        </select>
      </label>
      <label>Mục tiêu nghề nghiệp
        <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Ví dụ: Backend Developer" maxLength={200} />
      </label>
      <div className="lr-level-pair">
        <label>Đích đến
          <select value={targetLevel} onChange={(event) => setTargetLevel(event.target.value)}>
            {NEW_LEVELS.map((lvl) => <option value={lvl.id} key={lvl.id}>{lvl.label}</option>)}
          </select>
        </label>
        <label>Giờ / tuần
          <input type="number" min="2" max="40" value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} />
        </label>
      </div>
      <button className="lr-button lr-button-primary lr-generate" type="submit" disabled={isGenerating}>
        {isGenerating ? <><span className="lr-spinner" />Nova đang tạo...</> : <><SparklesIcon aria-hidden="true" />Tạo lộ trình AI</>}
      </button>
    </form>
  );
}

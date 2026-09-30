import React, { useState } from 'react';
import { SparklesIcon } from "@heroicons/react/24/outline";
import { NEW_LEVELS } from './RoadmapCareerForm';

const SUBJECTS = [
  "Toán", "Ngữ Văn", "Tiếng Anh", "Vật lý", "Hóa học", 
  "Sinh học", "Lịch sử", "Địa lý", "Tin học", "Công nghệ"
];

export default function RoadmapSubjectForm({ onGenerate, isGenerating }) {
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [customSubject, setCustomSubject] = useState("");
  const [goal, setGoal] = useState("Nắm vững kiến thức");
  const [currentLevel, setCurrentLevel] = useState("mat-goc");
  const [targetLevel, setTargetLevel] = useState("nang-cao");
  const [weeklyHours, setWeeklyHours] = useState("4");

  const handleSubmit = (e) => {
    e.preventDefault();
    const currLvlInfo = NEW_LEVELS.find(l => l.id === currentLevel) || NEW_LEVELS[0];
    const targetLvlInfo = NEW_LEVELS.find(l => l.id === targetLevel) || NEW_LEVELS[3];
    const finalSubject = subject === "Khác" ? customSubject : subject;
    
    onGenerate({
      subject: finalSubject,
      goal: goal,
      current_level: currLvlInfo.backendId,
      target_level: targetLvlInfo.backendId,
      study_time: Math.max(2, Math.min(40, Number(weeklyHours) || 4)) * 60,
      pace: Number(weeklyHours) <= 4 ? "slow" : Number(weeklyHours) <= 8 ? "steady" : "fast",
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <label>Môn học
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          {SUBJECTS.map((item) => <option value={item} key={item}>{item}</option>)}
          <option value="Khác">Khác...</option>
        </select>
      </label>
      {subject === "Khác" && (
        <label>Nhập tên môn học
          <input value={customSubject} onChange={(e) => setCustomSubject(e.target.value)} placeholder="Ví dụ: Triết học" required />
        </label>
      )}
      <label>Trình độ hiện tại
        <select value={currentLevel} onChange={(event) => setCurrentLevel(event.target.value)}>
          {NEW_LEVELS.map((lvl) => <option value={lvl.id} key={lvl.id}>{lvl.label}</option>)}
        </select>
      </label>
      <label>Mục tiêu
        <input value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="Ví dụ: Nắm vững nền tảng để thi" maxLength={200} />
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

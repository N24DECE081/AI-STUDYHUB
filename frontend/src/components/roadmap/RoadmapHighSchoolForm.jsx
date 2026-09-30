import React, { useState } from 'react';
import { SparklesIcon } from "@heroicons/react/24/outline";
import { NEW_LEVELS } from './RoadmapCareerForm';

const HS_SUBJECTS = ["Toán", "Ngữ Văn", "Tiếng Anh", "Vật lý", "Hóa học", "Sinh học", "Lịch sử", "Địa lý"];
const GRADES = ["Lớp 10", "Lớp 11", "Lớp 12"];

export default function RoadmapHighSchoolForm({ onGenerate, isGenerating }) {
  const [grade, setGrade] = useState(GRADES[2]);
  const [subject, setSubject] = useState(HS_SUBJECTS[0]);
  const [currentScore, setCurrentScore] = useState("6.5");
  const [targetScore, setTargetScore] = useState("8.5");
  const [dailyHours, setDailyHours] = useState("2");
  const [months, setMonths] = useState("3");

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Map scores to levels intuitively
    const currentNum = Number(currentScore) || 5;
    const targetNum = Number(targetScore) || 8;
    const currentLvl = currentNum < 5 ? "beginner" : currentNum < 7.5 ? "intermediate" : "advanced";
    const targetLvl = targetNum < 7 ? "intermediate" : "advanced";

    const weeklyHours = (Number(dailyHours) || 2) * 7;
    const goalStr = `Đạt ${targetScore} điểm môn ${subject} (${grade}) trong ${months} tháng.`;

    onGenerate({
      subject: `${subject} - ${grade}`,
      goal: goalStr,
      current_level: currentLvl,
      target_level: targetLvl,
      study_time: weeklyHours * 60,
      pace: weeklyHours <= 7 ? "slow" : weeklyHours <= 14 ? "steady" : "fast",
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="lr-level-pair">
        <label>Lớp
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            {GRADES.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
        <label>Môn học
          <select value={subject} onChange={(e) => setSubject(e.target.value)}>
            {HS_SUBJECTS.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
        </label>
      </div>
      
      <div className="lr-level-pair">
        <label>Điểm hiện tại
          <input type="number" step="0.5" min="0" max="10" value={currentScore} onChange={(e) => setCurrentScore(e.target.value)} />
        </label>
        <label>Điểm mục tiêu
          <input type="number" step="0.5" min="0" max="10" value={targetScore} onChange={(e) => setTargetScore(e.target.value)} />
        </label>
      </div>
      
      <div className="lr-level-pair">
        <label>Giờ học / ngày
          <input type="number" step="0.5" min="0.5" max="12" value={dailyHours} onChange={(e) => setDailyHours(e.target.value)} />
        </label>
        <label>Thời hạn (tháng)
          <input type="number" min="1" max="12" value={months} onChange={(e) => setMonths(e.target.value)} />
        </label>
      </div>
      
      <button className="lr-button lr-button-primary lr-generate" type="submit" disabled={isGenerating}>
        {isGenerating ? <><span className="lr-spinner" />Nova đang tạo...</> : <><SparklesIcon aria-hidden="true" />Tạo lộ trình AI</>}
      </button>
    </form>
  );
}

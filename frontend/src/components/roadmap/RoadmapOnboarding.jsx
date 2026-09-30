import React, { useState } from 'react';
import { BookOpenIcon, SparklesIcon } from "@heroicons/react/24/outline";
import RoadmapCareerForm from './RoadmapCareerForm';
import RoadmapSubjectForm from './RoadmapSubjectForm';
import RoadmapHighSchoolForm from './RoadmapHighSchoolForm';
import './roadmap-onboarding.css';

export default function RoadmapOnboarding({ 
  currentMode, 
  onSelectMode, 
  onGenerate,
  isGenerating
}) {
  return (
    <div className="roadmap-onboarding-wrapper">
      <nav className="lr-modes" aria-label="Chọn loại lộ trình">
        <button type="button" className={currentMode === "career" ? "is-active" : ""} onClick={() => onSelectMode("career")}>
           <span className="lr-mode-icon" aria-hidden="true">✳</span>
           <span><strong>Theo ngành / lĩnh vực</strong><small>Định hướng nghề nghiệp</small></span>
        </button>
        <button type="button" className={currentMode === "subject" ? "is-active" : ""} onClick={() => onSelectMode("subject")}>
           <span className="lr-mode-icon" aria-hidden="true">📚</span>
           <span><strong>Theo môn học</strong><small>Nắm vững kiến thức</small></span>
        </button>
        <button type="button" className={currentMode === "highschool" ? "is-active" : ""} onClick={() => onSelectMode("highschool")}>
           <span className="lr-mode-icon" aria-hidden="true">🎓</span>
           <span><strong>Học sinh THPT</strong><small>Mục tiêu điểm số</small></span>
        </button>
        <button type="button" className={currentMode === "documents" ? "is-active" : ""} onClick={() => onSelectMode("documents")}>
           <BookOpenIcon aria-hidden="true" />
           <span><strong>Theo tài liệu</strong><small>Học từ nguồn của bạn</small></span>
        </button>
      </nav>

      {currentMode !== "documents" && (
        <aside className="lr-career-setup roadmap-onboarding-form">
          <span className="lr-eyebrow">BUILD YOUR PATH</span>
          <h2>Chọn điểm đến</h2>
          <p>Lộ trình tạo theo mục tiêu và thời gian học của bạn.</p>
          
          {currentMode === "career" && <RoadmapCareerForm onGenerate={onGenerate} isGenerating={isGenerating} />}
          {currentMode === "subject" && <RoadmapSubjectForm onGenerate={onGenerate} isGenerating={isGenerating} />}
          {currentMode === "highschool" && <RoadmapHighSchoolForm onGenerate={onGenerate} isGenerating={isGenerating} />}
          
          <div className="lr-ai-note">
            <span>✳</span>
            <p>Kết quả quiz đã chấm giúp AI nhận diện điểm mạnh và phần cần ôn.</p>
          </div>
        </aside>
      )}
    </div>
  );
}

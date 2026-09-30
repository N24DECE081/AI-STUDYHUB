import React from 'react';
import './roadmap-lesson-status.css';

export default function RoadmapLessonStatus({ mastery, explicitStatus, locked }) {
  let label = "Chưa bắt đầu";
  let badgeClass = "badge-not-started";

  if (locked) {
    label = "Đang khóa";
    badgeClass = "badge-locked";
  } else if (explicitStatus === "NEED_REVIEW") {
    label = "Cần ôn lại";
    badgeClass = "badge-review";
  } else if (mastery >= 95 || explicitStatus === "MASTERED") {
    label = "Đã thành thạo";
    badgeClass = "badge-mastered";
  } else if (mastery >= 60 || explicitStatus === "COMPLETED") {
    label = "Hoàn thành";
    badgeClass = "badge-completed";
  } else if (mastery > 0 || explicitStatus === "IN_PROGRESS") {
    label = "Đang học";
    badgeClass = "badge-progress";
  }

  return (
    <span className={`lr-lesson-badge ${badgeClass}`}>
      {label}
    </span>
  );
}

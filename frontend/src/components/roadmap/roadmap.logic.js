export const stepMinutes = (stepId, sessions) => sessions.filter((item) => item.stepId === stepId).reduce((sum, item) => sum + Math.max(0, Number(item.minutes) || 0), 0);
export const calcStepProgress = (step, sessions) => Math.min(100, step.durationHours > 0 ? stepMinutes(step.id, sessions) / 60 / step.durationHours * 100 : 0);
export const calcRoadmapProgress = (roadmap, sessions) => {
  const plannedMinutes = roadmap.steps.reduce((sum, step) => sum + Math.round(Math.max(0, Number(step.durationHours) || 0) * 60), 0);
  const doneMinutes = roadmap.steps.reduce((sum, step) => sum + stepMinutes(step.id, sessions), 0);
  return { hoursDone: doneMinutes / 60, totalHours: plannedMinutes / 60, percent: Math.min(100, plannedMinutes ? doneMinutes / plannedMinutes * 100 : 0), remainingHours: Math.max(0, plannedMinutes - doneMinutes) / 60 };
};
export const calcStreak = (sessions, now = new Date()) => {
  const days = new Set(sessions.filter((item) => Number(item.minutes) > 0).map((item) => new Date(item.startedAt).toLocaleDateString("en-CA")));
  let cursor = new Date(now); let count = 0;
  if (!days.has(cursor.toLocaleDateString("en-CA"))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toLocaleDateString("en-CA"))) { count += 1; cursor.setDate(cursor.getDate() - 1); }
  return count;
};
export const formatHours = (hours) => {
  const minutes = Math.round(Math.max(0, Number(hours) || 0) * 60);
  if (!minutes) return "0 giờ";
  if (minutes % 60 === 0) return `${minutes / 60} giờ`;
  return `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} giờ ` : ""}${minutes % 60} phút`;
};
export const deriveSteps = (sources, contents, totalHours) => {
  const candidates = sources.flatMap((source, sourceIndex) => {
    const lines = String(contents[source.id] || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const headings = lines.filter((line) => line.length <= 100 && (/^#{1,6}\s+/.test(line) || /^(chương|chapter|bài|phần|unit|module)\b/i.test(line))).slice(0, 12);
    return (headings.length ? headings : [source.name.replace(/\.[^.]+$/, "")]).map((title) => ({ title: title.replace(/^#{1,6}\s+/, ""), materialId: source.id, sourceIndex }));
  }).slice(0, 30);
  const count = Math.max(1, candidates.length); const minutes = Math.max(1, Math.round(Number(totalHours) * 60 / count));
  return candidates.map((item, index) => ({ id: crypto.randomUUID(), order: index + 1, title: item.title, description: `Học từ ${sources[item.sourceIndex].name}`, status: index ? "locked" : "in_progress", durationHours: minutes / 60, hoursDone: 0, objectives: [], sources: [{ materialId: item.materialId }] }));
};
export const syncStepStatuses = (steps, sessions) => steps.map((step, index) => {
  const complete = Boolean(step.manuallyCompleted) || (calcStepProgress(step, sessions) >= 100 && step.quizPassed !== false);
  const previousComplete = index === 0 || Boolean(steps[index - 1].manuallyCompleted) || calcStepProgress(steps[index - 1], sessions) >= 100;
  return { ...step, hoursDone: stepMinutes(step.id, sessions) / 60, status: complete ? "completed" : previousComplete ? "in_progress" : "locked" };
});

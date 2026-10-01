import test from "node:test";
import assert from "node:assert/strict";
import { calcRoadmapProgress, calcStepProgress, calcStreak, syncStepStatuses } from "./roadmap.logic.js";

const step = (id, durationHours = 2) => ({ id, durationHours, status: "locked" });
const session = (stepId, minutes, startedAt = "2026-09-30T12:00:00+07:00") => ({ stepId, minutes, startedAt });

test("progress handles zero, partial, over-plan and deletion", () => {
  const roadmap = { steps: [step("a"), step("b")] };
  assert.equal(calcStepProgress(roadmap.steps[0], []), 0);
  assert.equal(calcStepProgress(roadmap.steps[0], [session("a", 180)]), 100);
  assert.deepEqual(calcRoadmapProgress(roadmap, [session("a", 60)]), { hoursDone: 1, totalHours: 4, percent: 25, remainingHours: 3 });
  assert.equal(calcRoadmapProgress(roadmap, [session("a", 300), session("b", 300)]).percent, 100);
  assert.equal(calcRoadmapProgress(roadmap, [session("a", 60), session("a", 60)].slice(1)).hoursDone, 1);
});

test("planned hours are summed as minutes without floating-point artifacts", () => {
  const roadmap = { steps: Array.from({ length: 12 }, (_, index) => step(String(index), 250 / 60)) };
  assert.equal(calcRoadmapProgress(roadmap, []).totalHours, 50);
});

test("completion unlocks the next step without inventing hours", () => {
  const synced = syncStepStatuses([{ ...step("a"), manuallyCompleted: true }, step("b")], []);
  assert.equal(synced[0].status, "completed"); assert.equal(synced[0].hoursDone, 0); assert.equal(synced[1].status, "in_progress");
});

test("streak counts consecutive calendar days across midnight", () => {
  const sessions = [session("a", 5, "2026-09-29T23:59:00+07:00"), session("a", 5, "2026-09-30T00:01:00+07:00"), session("a", 5, "2026-10-01T00:01:00+07:00")];
  assert.equal(calcStreak(sessions, new Date("2026-10-01T12:00:00+07:00")), 3);
});

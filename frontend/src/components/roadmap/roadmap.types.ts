export type RoadmapType = "document" | "subject";
export type RoadmapStatus = "in_progress" | "completed";
export type StepStatus = "completed" | "in_progress" | "locked";
export type MaterialType = "pdf" | "docx" | "pptx" | "txt";
export type MaterialStatus = "uploading" | "processing" | "ready" | "failed";

export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  chapters: number;
  subject: string;
  status: MaterialStatus;
  progress?: number;
  error?: string;
}

export interface RoadmapStepSource {
  materialId: string;
  chapterRange?: string;
}

export interface RoadmapStep {
  id: string;
  order: number;
  title: string;
  description: string;
  status: StepStatus;
  durationHours: number;
  hoursDone: number;
  manuallyCompleted?: boolean;
  quizPassed?: boolean;
  objectives: string[];
  sources: RoadmapStepSource[];
}

export interface StudySession {
  id: string;
  userId: string;
  roadmapId: string;
  stepId: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  source: "timer" | "manual" | "quiz";
}

export interface Roadmap {
  id: string;
  type: RoadmapType;
  title: string;
  subject?: string;
  status: RoadmapStatus;
  totalHours: number;
  hoursDone: number;
  weeks: number;
  daysPerWeek: number;
  hoursPerDay: number;
  goals: string[];
  sources: Material[];
  steps: RoadmapStep[];
}

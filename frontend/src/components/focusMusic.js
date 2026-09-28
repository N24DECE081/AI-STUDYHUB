import { VolumeX } from "lucide-react";

export const MUSIC = [
  { id: "silent", name: "Silent", Icon: VolumeX },
];

export const formatTime = (seconds) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

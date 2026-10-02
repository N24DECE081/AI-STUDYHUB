import { useState } from "react";
import roadmapLogo from "../assets/roadmap-logo.png";
import "./RoadmapLogo.css";

const dimensions = { sm: 96, md: 210, lg: 420 };
const hotspots = [
  { id: "book", label: "Cuốn sách", clip: "polygon(4% 75%, 28% 69%, 36% 84%, 29% 98%, 4% 96%)", origin: "20% 84%", x: "20%", y: "84%" },
  { id: "pencil", label: "Bút chì", clip: "polygon(22% 57%, 40% 52%, 49% 68%, 33% 75%)", origin: "35% 64%", x: "35%", y: "64%" },
  { id: "checklist", label: "Bảng nhiệm vụ", clip: "polygon(48% 42%, 66% 40%, 70% 60%, 53% 64%)", origin: "59% 52%", x: "59%", y: "52%" },
  { id: "chart", label: "Biểu đồ tiến độ", clip: "polygon(70% 31%, 88% 29%, 89% 49%, 70% 51%)", origin: "79% 40%", x: "79%", y: "40%" },
  { id: "cap", label: "Mũ tốt nghiệp", clip: "polygon(49% 13%, 76% 13%, 78% 34%, 52% 35%)", origin: "64% 24%", x: "64%", y: "24%" },
  { id: "flag", label: "Lá cờ mục tiêu", clip: "polygon(77% 1%, 99% 0%, 100% 29%, 81% 27%)", origin: "89% 14%", x: "89%", y: "14%" },
];

export default function RoadmapLogo({ size = "md", eager = false, className = "", bare = false }) {
  const [active, setActive] = useState("");
  const [run, setRun] = useState(0);
  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debugHotspots");
  const trigger = (id) => {
    setRun((value) => value + 1);
    setActive(id);
  };

  return (
    <div className={`roadmap-logo roadmap-logo--${size}${bare ? " is-bare" : ""}${debug ? " is-debug" : ""} ${className}`}>
      <div className="roadmap-logo-glow" aria-hidden="true" />
      <img className="roadmap-logo-base" src={roadmapLogo} alt="Lộ trình học" loading={eager ? "eager" : "lazy"}
        width={dimensions[size]} height={dimensions[size]} draggable="false" />
      {hotspots.map((spot) => {
        const isActive = active === spot.id;
        return <button
          key={`${spot.id}-${isActive ? run : 0}`}
          type="button"
          className={`roadmap-logo-hotspot${isActive ? " is-active" : ""}`}
          aria-label={spot.label}
          style={{ "--hotspot-clip": spot.clip, "--hotspot-origin": spot.origin, "--hotspot-x": spot.x, "--hotspot-y": spot.y }}
          onClick={() => trigger(spot.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              trigger(spot.id);
            }
          }}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget) setActive((current) => current === spot.id ? "" : current);
          }}
        >
          <img src={roadmapLogo} alt="" aria-hidden="true" draggable="false" />
          <span className="roadmap-logo-burst" aria-hidden="true" />
        </button>;
      })}
    </div>
  );
}

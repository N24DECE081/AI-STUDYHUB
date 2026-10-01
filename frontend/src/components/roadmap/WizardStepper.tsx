interface Props { current: number }

const STEPS = ["Loại lộ trình", "Chọn tài liệu", "Thiết lập mục tiêu"];

export default function WizardStepper({ current }: Props) {
  return <ol className="rm-stepper" aria-label="Các bước tạo lộ trình">
    {STEPS.map((label, index) => <li key={label} className={index === current ? "is-current" : index < current ? "is-done" : ""} aria-current={index === current ? "step" : undefined}>
      <span>{index < current ? "✓" : index + 1}</span><b>{label}</b>
    </li>)}
  </ol>;
}

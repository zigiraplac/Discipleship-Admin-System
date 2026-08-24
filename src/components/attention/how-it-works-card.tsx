import { Card, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    title: "A student is flagged",
    text: "Attendance drops below the band. No one has to notice it.",
  },
  {
    title: "You reach out",
    text: "Call or visit. The card shows what happened and when.",
  },
  {
    title: "You record what happened",
    text: "Catch-up, still with us, or left. It goes on their record.",
  },
];

export function HowThisWorksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How this works</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-4 px-[18px] py-4">
        {STEPS.map((step, i) => (
          <div key={step.title} className="flex gap-3">
            <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-accent-100 text-[11px] font-bold text-accent-800">
              {i + 1}
            </span>
            <div>
              <div className="text-[13px] font-semibold text-ink">{step.title}</div>
              <div className="mt-0.5 text-xs text-ink-muted">{step.text}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

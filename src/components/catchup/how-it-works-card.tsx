import { Card, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    title: "A catch-up plan is recorded",
    text: "From Follow Up, once you've decided how they'll make up missed lessons.",
  },
  {
    title: "Lessons get ticked off",
    text: "From here or their profile, as each missed lesson is made up.",
  },
  {
    title: "You close it out",
    text: "Once every missed lesson is caught up, mark them back on track.",
  },
];

export function HowCatchupWorksCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>How Catch ups works</CardTitle>
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

import { EnvelopeSimple } from "@phosphor-icons/react/dist/ssr";
import type { Responsible } from "@/lib/data/org-view";

/** Who answers for a child, and how to reach them — or who manages it
 * while nobody is appointed. */
export function ResponsibleCell({ r }: { r: Responsible }) {
  if (r.kind === "managed") {
    return (
      <span className="text-[12px] text-ink-muted">
        Not assigned · <span className="text-ink-secondary">managed by {r.by}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      {r.people.map((p) => (
        <span key={p.userId} className="flex items-center gap-1.5 text-[12px]">
          <span className="font-semibold text-ink">{p.name}</span>
          <a href={`mailto:${p.email}`} className="text-accent-700 hover:underline" title={`Email ${p.name}`} aria-label={`Email ${p.name}`}>
            <EnvelopeSimple size={13} />
          </a>
        </span>
      ))}
      <span className="text-[11px] text-ink-muted">{r.role}</span>
    </span>
  );
}

import Link from "next/link";
import { CaretRight, CheckCircle, Info, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface AttentionItem {
  text: string;
  href: string;
  urgent: boolean;
}

/** What needs to happen with this cohort, urgent first — each line opens
 * the page where it gets done. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  const sorted = [...items].sort((a, b) => Number(b.urgent) - Number(a.urgent));
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Attention required</CardTitle>
      </CardHeader>
      <div className="px-3 py-2">
        {sorted.length ? (
          <ul className="flex flex-col">
            {sorted.map((i, idx) => (
              <li key={i.text}>
                <Link href={i.href} className={cn("group flex items-center gap-2.5 rounded-control px-2 py-2.5 hover:bg-hover", idx && "border-t border-divider")}>
                  {i.urgent ? (
                    <WarningCircle size={16} weight="fill" className="flex-none text-accent-2-500" />
                  ) : (
                    <Info size={16} weight="fill" className="flex-none text-yellow" />
                  )}
                  <span className="flex-1 text-[13px] font-semibold text-ink group-hover:text-accent-700">{i.text}</span>
                  <CaretRight size={12} className="text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center justify-center gap-1.5 py-4 text-[13px] text-ink-muted">
            <CheckCircle size={15} className="text-accent" /> All clear
          </p>
        )}
      </div>
    </Card>
  );
}

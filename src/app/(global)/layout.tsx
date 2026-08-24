import { Shell } from "@/components/shell/shell";

export default function GlobalLayout({ children }: { children: React.ReactNode }) {
  return <Shell activeCohortId={null}>{children}</Shell>;
}

import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse", className)} {...props} />
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="bg-subtle">{children}</tr>
    </thead>
  );
}

export function TH({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"th"> & { align?: "left" | "right" }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-faint",
        align === "right" ? "text-right" : "text-left",
        className
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-t border-divider", className)} {...props} />;
}

export function TD({
  className,
  align = "left",
  ...props
}: React.ComponentProps<"td"> & { align?: "left" | "right" }) {
  return (
    <td
      className={cn("px-3.5 py-[11px] align-middle", align === "right" && "text-right", className)}
      {...props}
    />
  );
}

/**
 * The row that splits a table into groups — just the group's name (the
 * table already says what kind of place it is). Taller than a row and
 * ruled above, so it reads as a divider rather than another row; no
 * colour, the same everywhere.
 */
export function SplitLabel({ title }: { title: React.ReactNode }) {
  return <span className="block px-3.5 pb-2.5 pt-5 text-left text-[14px] font-bold text-ink">{title}</span>;
}

export const SPLIT_RULE = "border-t-2 border-border";

export function SplitRow({ colSpan, title }: { colSpan: number; title: React.ReactNode }) {
  return (
    <tr className={SPLIT_RULE}>
      <td colSpan={colSpan} className="p-0">
        <SplitLabel title={title} />
      </td>
    </tr>
  );
}

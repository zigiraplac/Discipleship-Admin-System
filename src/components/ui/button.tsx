import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 disabled:cursor-default",
  {
    variants: {
      variant: {
        primary: "bg-accent text-white hover:bg-accent-600 active:bg-accent-700 disabled:bg-page disabled:text-ink-faint",
        secondary: "border border-border bg-card text-ink-secondary hover:bg-hover disabled:bg-page disabled:text-ink-faint",
        outlineAccent: "border border-border bg-card text-ink-secondary hover:border-accent hover:text-accent-700",
        ghost: "text-accent-700 hover:underline",
        inert: "bg-page text-ink-faint cursor-default",
      },
      size: {
        default: "px-[18px] py-2.5",
        sm: "px-3 py-2 text-xs rounded-[8px]",
        row: "px-3 py-1.5 text-xs rounded-[8px]",
        icon: "size-8 rounded-control",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  }
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

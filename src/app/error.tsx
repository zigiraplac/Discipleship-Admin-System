"use client";

import { useEffect } from "react";
import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * Catches any error thrown while rendering a page or a Server Component
 * tree beneath the root layout — without this, that error took down the
 * entire app with a blank screen instead of a recoverable message. Stays
 * deliberately generic (no attempt to interpret the error) since this is
 * the last line of defense, not a place to add business logic.
 */
export default function GlobalPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6">
      <div className="w-full max-w-sm rounded-card border border-border bg-card p-8 text-center shadow-dropdown">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-accent-2-100 text-accent-2-700">
          <WarningCircle size={24} weight="bold" />
        </div>
        <div className="text-[16px] font-bold text-ink">Something went wrong</div>
        <p className="mt-2 text-[13px] text-ink-muted">
          This page hit an unexpected error. It&rsquo;s been logged — try again, or go back to the dashboard.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button type="button" variant="primary" className="w-full" onClick={reset}>
            Try again
          </Button>
          <Link href="/" className="text-[13px] font-semibold text-accent-700 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

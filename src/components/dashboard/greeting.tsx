"use client";

import { useEffect, useState } from "react";

function greetingForHour(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Has to reflect the *viewer's* local clock, not the server's — this is
 * the one piece of the dashboard that's genuinely client-only. Renders a
 * neutral "Welcome back" on the server and on first client paint (so
 * there's no hydration mismatch), then swaps in the real time-of-day
 * greeting right after mount.
 */
export function Greeting({ name, subtitle }: { name: string; subtitle: string }) {
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    // Deliberately deferred to an effect: reading the clock during render
    // would make the server's render (and the client's first paint, which
    // must match it) depend on the server's timezone, not the viewer's.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingForHour(new Date().getHours()));
  }, []);

  const firstName = name.trim().split(/\s+/)[0] || name;

  return (
    <div>
      <div className="text-2xl font-bold tracking-tight text-ink">
        {greeting}, {firstName}
      </div>
      <div className="mt-1 text-sm font-medium text-ink-secondary">{subtitle}</div>
    </div>
  );
}

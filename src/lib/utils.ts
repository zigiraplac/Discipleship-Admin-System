import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

// The server's clock is UTC regardless of where it's deployed, but the
// ministry runs on East Africa Time (Rwanda/Burundi, UTC+2, no DST) — for
// roughly the first two hours after local midnight, raw UTC still thinks
// it's "yesterday," which was silently rejecting same-day register saves
// ("this lesson hasn't been taught yet") and could shift the nightly
// notification sweep onto the wrong calendar day.
const MINISTRY_TIMEZONE = "Africa/Kigali";

export function todayISO(): string {
  // formatToParts rather than trusting a locale's punctuation — some ICU
  // builds render en-CA with a different separator than the "-" this
  // relies on elsewhere as a plain sortable YYYY-MM-DD string.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MINISTRY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

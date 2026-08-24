import type { Bands, CohortHealth, Status } from "./types";

export function statusOf(rate: number, bands: Bands): Status {
  if (rate >= bands.activeThreshold) return "On track";
  if (rate >= bands.helpThreshold) return "Needs help";
  return "At risk";
}

/**
 * Healthy   if rate >= 88% and at_risk <= ceil(enrolled * 0.15)
 * Watch     if rate >= 80%
 * Needs work otherwise
 */
export function cohortHealth(
  rate: number,
  atRisk: number,
  enrolled: number
): CohortHealth {
  if (rate >= 88 && atRisk <= Math.ceil(enrolled * 0.15)) return "Healthy";
  if (rate >= 80) return "Watch";
  return "Needs work";
}

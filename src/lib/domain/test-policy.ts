import type { PolicyVersion } from "./policy";

/** Test fixture only: one policy version like the initial production one. */
export const TEST_POLICY: PolicyVersion[] = [
  { version: 1, effectiveFrom: "2026-01-01", onTrack: 85, needsHelp: 60, inactiveStreak: 3, graduationAttendance: 85, note: null, createdAt: null, createdBy: null },
];

import { describe, expect, it } from "vitest";
import { birthdayDigestNotice, birthdaysToday, outcomeRecordedNotice } from "./notification-messages";

describe("pastoral notifications say nothing private", () => {
  it("an outcome notice names the cohort only — no student, no outcome", () => {
    const n = outcomeRecordedNotice({ cohortName: " Cohort 01 ", cohortSlug: "cohort-01", auditId: 42 });
    expect(n.title).toBe("An outcome was recorded in Cohort 01");
    expect(JSON.stringify(n)).not.toMatch(/left|returned|catch-?up|students\//i);
    expect(n.href).toBe("/c/cohort-01/followup");
  });

  it("each recorded outcome gets its own key; the same one twice is the same key", () => {
    const a = outcomeRecordedNotice({ cohortName: "C", cohortSlug: "c", auditId: 1 });
    const b = outcomeRecordedNotice({ cohortName: "C", cohortSlug: "c", auditId: 2 });
    expect(a.dedupeKey).toBe("outcome:1");
    expect(b.dedupeKey).not.toBe(a.dedupeKey);
    expect(outcomeRecordedNotice({ cohortName: "C", cohortSlug: "c", auditId: 1 }).dedupeKey).toBe(a.dedupeKey);
  });
});

describe("birthday digest", () => {
  const students = [
    { id: "s1", fullName: "Alice Uwase", dobDay: 10, dobMonth: 10 },
    { id: "s2", fullName: "Brian Nshuti", dobDay: 10, dobMonth: 10 },
    { id: "s3", fullName: "Claire Mukamana", dobDay: 11, dobMonth: 10 },
    { id: "s4", fullName: "No Date", dobDay: null, dobMonth: null },
  ];

  it("counts only today's birthdays", () => {
    expect(birthdaysToday(students, "2026-10-10")).toBe(2);
    expect(birthdaysToday(students, "2026-10-12")).toBe(0);
  });

  it("one notice per cohort per day, with no names", () => {
    const n = birthdayDigestNotice({ cohortId: "c1", cohortName: "Cohort 01", cohortSlug: "cohort-01", count: 2, todayISO: "2026-10-10" });
    expect(n.title).toBe("Birthdays today in Cohort 01");
    expect(n.body).toBe("2 students have birthdays today.");
    expect(JSON.stringify(n)).not.toMatch(/Alice|Brian|Claire/);
    expect(n.dedupeKey).toBe("birthday_digest:c1:2026-10-10");
  });

  it("a re-run the same day is the same key; the next day is new", () => {
    const k = (d: string) => birthdayDigestNotice({ cohortId: "c1", cohortName: "C", cohortSlug: "c", count: 1, todayISO: d }).dedupeKey;
    expect(k("2026-10-10")).toBe(k("2026-10-10"));
    expect(k("2026-10-11")).not.toBe(k("2026-10-10"));
  });

  it("singular wording for one", () => {
    expect(birthdayDigestNotice({ cohortId: "c1", cohortName: "C", cohortSlug: "c", count: 1, todayISO: "2026-10-10" }).body).toBe("1 student has a birthday today.");
  });
});

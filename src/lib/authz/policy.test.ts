import { describe, expect, it } from "vitest";
import { capabilitiesOn, decide, type Responsibility, type Target } from "./policy";
import type { OrgUnitType } from "@/lib/domain/types";

// HQ › Africa › Rwanda › Kigali City › Kigali Central › Promotion 2026 › Cohort 01
//    › Asia › Turkey › … › Promotion (Ankara) › Cohort 4
const P = {
  hq: "hq", africa: "hq.af", rwanda: "hq.af.rw", kigali: "hq.af.rw.kg", church: "hq.af.rw.kg.ch", promo: "hq.af.rw.kg.ch.pr",
  asia: "hq.as", ankaraPromo: "hq.as.tr.an.ac.pr",
};
const unit = (id: keyof typeof P, type: OrgUnitType): Extract<Target, { kind: "unit" }> => ({ kind: "unit", unitId: id, unitPath: P[id], unitType: type });
const cohort01: Target = { kind: "cohort", cohortId: "c01", unitPath: P.promo };
const cohort4: Target = { kind: "cohort", cohortId: "c4", unitPath: P.ankaraPromo };
const leader = (id: keyof typeof P, type: OrgUnitType, role: "leader" | "viewer" = "leader"): Responsibility => ({
  kind: "unit", unitId: id, unitName: id, unitType: type, unitPath: P[id], role,
});

const can = (rs: Responsibility[], cap: Parameters<typeof decide>[1], t: Target) => decide(rs, cap, t).allowed;

describe("HQ", () => {
  it("admin can do everything, explicitly", () => {
    const admin: Responsibility[] = [{ kind: "system", role: "admin" }];
    expect(can(admin, "manage_followups", cohort4)).toBe(true);
    expect(can(admin, "manage_accounts", { kind: "system" })).toBe(true);
    expect(decide(admin, "edit_attendance", cohort01).reason).toBe("Allowed as administrator.");
  });

  it("the leadership account role grants nothing by itself — only an assignment does", () => {
    const viewer: Responsibility[] = [{ kind: "system", role: "leadership" }];
    expect(can(viewer, "view_org", unit("hq", "hq"))).toBe(false);
    expect(can(viewer, "view_student", cohort01)).toBe(false);
    expect(can([...viewer, leader("hq", "hq", "viewer")], "view_org", unit("africa", "continent"))).toBe(true);
  });
});

describe("level leaders", () => {
  it("continent leader: sees inside their continent only", () => {
    const r = [leader("africa", "continent")];
    expect(can(r, "view_org", unit("rwanda", "country"))).toBe(true);
    expect(can(r, "view_cohort_summary", cohort01)).toBe(true);
    expect(can(r, "view_org", unit("asia", "continent"))).toBe(false);
    expect(can(r, "view_cohort_summary", cohort4)).toBe(false);
  });

  it("country leader: cohort totals only — no students, registers or follow-ups", () => {
    const r = [leader("rwanda", "country")];
    expect(can(r, "view_cohort_summary", cohort01)).toBe(true);
    expect(can(r, "view_student", cohort01)).toBe(false);
    expect(can(r, "view_attendance", cohort01)).toBe(false);
    expect(can(r, "view_followups", cohort01)).toBe(false);
    expect(can(r, "manage_followups", cohort01)).toBe(false);
    expect(can(r, "edit_attendance", cohort01)).toBe(false);
  });

  it("staffing authority comes from the level above — never your own level", () => {
    const r = [leader("kigali", "region")];
    const church = { ...unit("church", "site"), stewardId: "kigali" };
    const ownLevel = { ...unit("kigali", "region"), stewardId: "rwanda" };
    expect(can(r, "manage_staff", church)).toBe(true);
    expect(can(r, "remove_unit", church)).toBe(true);
    expect(can(r, "manage_staff", ownLevel)).toBe(false);
    expect(can(r, "remove_unit", ownLevel)).toBe(false);
    expect(can(r, "manage_settings", ownLevel)).toBe(true);
    // Rwanda staffs Kigali City; Kigali City doesn't staff a promotion two levels down
    // that has its own staffed church in between.
    expect(can([leader("rwanda", "country")], "manage_staff", ownLevel)).toBe(true);
    expect(can(r, "manage_staff", { ...unit("promo", "promotion"), stewardId: "church" })).toBe(false);
  });

  it("site leader creates cohorts and manages schedules", () => {
    const r = [leader("church", "site")];
    expect(can(r, "create_cohort", unit("promo", "promotion"))).toBe(true);
    expect(can(r, "manage_schedule", cohort01)).toBe(true);
  });

  it("promotion leader manages its cohorts' schedules, a region leader can't create cohorts", () => {
    expect(can([leader("promo", "promotion")], "manage_schedule", cohort01)).toBe(true);
    expect(can([leader("promo", "promotion")], "create_cohort", unit("promo", "promotion"))).toBe(true);
    expect(can([leader("kigali", "region")], "create_cohort", unit("promo", "promotion"))).toBe(false);
  });

  it("a viewer sees but never manages", () => {
    const r = [leader("rwanda", "country", "viewer")];
    expect(can(r, "view_org", unit("kigali", "region"))).toBe(true);
    expect(can(r, "view_cohort_summary", cohort01)).toBe(true);
    expect(can(r, "view_student", cohort01)).toBe(false);
    expect(can(r, "manage_settings", unit("rwanda", "country"))).toBe(false);
    expect(can(r, "manage_schedule", cohort01)).toBe(false);
  });
});

describe("cohort staffing", () => {
  const cohortIn = (stewardId: string): Target => ({ ...cohort01, stewardId });

  it("the responsible leader manages its cohorts' facilitators and teachers", () => {
    expect(can([leader("promo", "promotion")], "manage_cohort_staff", cohortIn("promo"))).toBe(true);
    // Fallback: the church manages them while the promotion has no leader.
    expect(can([leader("church", "site")], "manage_cohort_staff", cohortIn("church"))).toBe(true);
  });

  it("a higher leader doesn't manage cohort staff while someone closer is responsible", () => {
    expect(can([leader("church", "site")], "manage_cohort_staff", cohortIn("promo"))).toBe(false);
    expect(can([leader("rwanda", "country")], "manage_cohort_staff", cohortIn("promo"))).toBe(false);
  });

  it("facilitators and teachers don't staff their own cohort; admin can (system route)", () => {
    expect(can([{ kind: "cohort", cohortId: "c01", cohortName: "Cohort 01", capacity: "facilitator" }], "manage_cohort_staff", cohortIn("promo"))).toBe(false);
    expect(can([{ kind: "system", role: "admin" }], "manage_cohort_staff", cohortIn("promo"))).toBe(true);
  });
});

describe("cohort roles", () => {
  const facilitator: Responsibility = { kind: "cohort", cohortId: "c01", cohortName: "Cohort 01", capacity: "facilitator" };
  const teacher: Responsibility = { kind: "cohort", cohortId: "c01", cohortName: "Cohort 01", capacity: "teacher" };

  it("facilitator: attendance, follow-ups and catch-ups — for their own cohort only", () => {
    expect(can([facilitator], "manage_followups", cohort01)).toBe(true);
    expect(can([facilitator], "edit_attendance", cohort01)).toBe(true);
    expect(can([facilitator], "view_student", cohort4)).toBe(false);
  });

  it("teacher: takes registers, no pastoral access", () => {
    expect(can([teacher], "edit_attendance", cohort01)).toBe(true);
    expect(can([teacher], "view_followups", cohort01)).toBe(false);
    expect(decide([teacher], "manage_followups", cohort01).reason).toMatch(/facilitators/);
  });

  it("a plain app role grants nothing without a cohort or level role", () => {
    expect(can([], "view_cohort", cohort01)).toBe(false);
  });
});

describe("several responsibilities at once", () => {
  // Promotion 2026 leader + teacher of Cohort 01 (and of Cohort 02).
  const esther: Responsibility[] = [
    leader("promo", "promotion"),
    { kind: "cohort", cohortId: "c01", cohortName: "Cohort 01", capacity: "teacher" },
    { kind: "cohort", cohortId: "c02", cohortName: "Cohort 02", capacity: "teacher" },
  ];

  it("keeps every role: manages the promotion and teaches the cohorts", () => {
    expect(can(esther, "manage_schedule", cohort01)).toBe(true); // as promotion leader
    expect(can(esther, "edit_attendance", cohort01)).toBe(true); // as teacher
    expect(can(esther, "manage_followups", cohort01)).toBe(false); // neither role is pastoral
    const caps = capabilitiesOn(esther, cohort01);
    expect([...caps]).toEqual(expect.arrayContaining(["view_student", "edit_attendance", "manage_schedule"]));
  });

  it("says which role allowed it", () => {
    expect(decide(esther, "edit_attendance", cohort01).reason).toBe("Allowed as teacher of Cohort 01.");
  });
});

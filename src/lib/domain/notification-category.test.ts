import { describe, expect, it } from "vitest";
import { actionLabelFor, categoryOf, filterCategories, kindsIn } from "./notification-category";

describe("notification categories", () => {
  it("every existing kind has its place", () => {
    expect(categoryOf("attention_escalation")).toBe("action");
    expect(categoryOf("staff_assignment")).toBe("management");
    expect(categoryOf("status_change")).toBe("management");
    expect(categoryOf("birthday_digest")).toBe("reminder");
    expect(categoryOf("birthday")).toBe("reminder");
    expect(categoryOf("crusade_upcoming")).toBe("reminder");
    expect(categoryOf("bands_updated")).toBe("info");
    expect(categoryOf("outcome_recorded")).toBe("info");
    expect(categoryOf("something_new")).toBe("info");
  });

  it("Updates is Management + Information — not a fifth category", () => {
    expect(filterCategories("updates")).toEqual(["management", "info"]);
    expect(filterCategories("all")).toBeNull();
    expect(filterCategories("unread")).toBeNull();
    expect(kindsIn(["action"])).toEqual(["attention_escalation"]);
  });

  it("says what opening it does, only for real destinations", () => {
    expect(actionLabelFor("/c/cohort-01/followup")).toBe("View follow-ups");
    expect(actionLabelFor("/c/cohort-01/students/abc")).toBe("View student");
    expect(actionLabelFor("/c/cohort-01")).toBe("Open cohort");
    expect(actionLabelFor("/u/rwanda/attention?kind=contact")).toBe("View needs attention");
    expect(actionLabelFor("/u/rwanda/staff")).toBe("View staff");
    expect(actionLabelFor(null)).toBeNull();
  });
});

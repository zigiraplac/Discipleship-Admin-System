import {
  SquaresFour,
  BookOpen,
  UsersThree,
  WarningCircle,
  CalendarBlank,
  ChartLineUp,
  Stack,
  Gear,
  Megaphone,
  ArrowsClockwise,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";

/** Sidebar section a cohort-scoped item falls under — undefined renders it
 * standalone, above every section (just Dashboard). Purely a display
 * grouping; doesn't affect NAV_BY_ROLE gating or routing at all. */
export type NavGroup = "schedule" | "students" | "reports";

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  schedule: "Schedule",
  students: "Students",
  reports: "Reports",
};

export const NAV_GROUP_ORDER: NavGroup[] = ["schedule", "students", "reports"];

export interface NavItem {
  id: string;
  label: string;
  href: (cohortSlug: string | null) => string;
  icon: Icon;
  cohortScoped: boolean;
  group?: NavGroup;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: (c) => `/c/${c}`, icon: SquaresFour, cohortScoped: true },
  { id: "lessons", label: "Lessons", href: (c) => `/c/${c}/lessons`, icon: BookOpen, cohortScoped: true, group: "schedule" },
  { id: "crusades", label: "Crusades", href: (c) => `/c/${c}/crusades`, icon: Megaphone, cohortScoped: true, group: "schedule" },
  { id: "calendar", label: "Calendar", href: (c) => `/c/${c}/calendar`, icon: CalendarBlank, cohortScoped: true, group: "schedule" },
  { id: "students", label: "Students", href: (c) => `/c/${c}/students`, icon: UsersThree, cohortScoped: true, group: "students" },
  { id: "followup", label: "Follow Up", href: (c) => `/c/${c}/followup`, icon: WarningCircle, cohortScoped: true, group: "students" },
  { id: "catchup", label: "Catch ups", href: (c) => `/c/${c}/catchup`, icon: ArrowsClockwise, cohortScoped: true, group: "students" },
  { id: "reports", label: "Reports", href: (c) => `/c/${c}/reports`, icon: ChartLineUp, cohortScoped: true, group: "reports" },
  { id: "cohorts", label: "Cohorts", href: () => `/cohorts`, icon: Stack, cohortScoped: false },
  { id: "settings", label: "Settings", href: () => `/settings`, icon: Gear, cohortScoped: false },
];

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

export interface NavItem {
  id: string;
  label: string;
  href: (cohortSlug: string | null) => string;
  icon: Icon;
  cohortScoped: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", href: (c) => `/c/${c}`, icon: SquaresFour, cohortScoped: true },
  { id: "lessons", label: "Lessons", href: (c) => `/c/${c}/lessons`, icon: BookOpen, cohortScoped: true },
  { id: "students", label: "Students", href: (c) => `/c/${c}/students`, icon: UsersThree, cohortScoped: true },
  { id: "followup", label: "Follow Up", href: (c) => `/c/${c}/followup`, icon: WarningCircle, cohortScoped: true },
  { id: "catchup", label: "Catch ups", href: (c) => `/c/${c}/catchup`, icon: ArrowsClockwise, cohortScoped: true },
  { id: "crusades", label: "Crusades", href: (c) => `/c/${c}/crusades`, icon: Megaphone, cohortScoped: true },
  { id: "calendar", label: "Calendar", href: (c) => `/c/${c}/calendar`, icon: CalendarBlank, cohortScoped: true },
  { id: "reports", label: "Reports", href: (c) => `/c/${c}/reports`, icon: ChartLineUp, cohortScoped: true },
  { id: "cohorts", label: "Cohorts", href: () => `/cohorts`, icon: Stack, cohortScoped: false },
  { id: "settings", label: "Settings", href: () => `/settings`, icon: Gear, cohortScoped: false },
];

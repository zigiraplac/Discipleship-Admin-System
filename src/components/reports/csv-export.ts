import type { ReportLesson } from "./report-utils";

// A cell starting with =, +, -, @, or a tab can be read as a formula by
// Excel/Sheets when the CSV is opened — prefixing it with a single quote
// neutralizes that without changing what the cell displays. Nothing fed
// through this today is free-text/user-controlled, so it's not
// exploitable yet, but this is the only CSV sanitizer in the app and the
// guard costs nothing to have in place before it's reused somewhere that is.
const FORMULA_TRIGGER = /^[=+\-@\t]/;

function csvCell(value: string | number): string {
  let s = String(value);
  if (FORMULA_TRIGGER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(lessons: ReportLesson[]): string {
  const header = ["Date", "Class", "Lesson", "Status", "Present", "Absent", "Rate %"];
  const rows = lessons.map((l) => [
    l.date,
    `C${l.classNumber}`,
    `${l.lessonRef} ${l.lessonTitle}`,
    l.recorded ? "Recorded" : "Not recorded",
    l.present ?? "",
    l.absent ?? "",
    l.rate ?? "",
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/** Downloads exactly what's on screen (the currently filtered period) as a
 * CSV — entirely client-side, since the data is already loaded here. */
export function downloadLessonsCsv(lessons: ReportLesson[], cohortName: string, periodLabel: string): void {
  const csv = toCsv(lessons);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const filename = `${safeFilenamePart(cohortName)}-attendance-${safeFilenamePart(periodLabel)}.csv`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

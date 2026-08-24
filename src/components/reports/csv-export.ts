import type { ReportLesson } from "./report-utils";

function csvCell(value: string | number): string {
  const s = String(value);
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

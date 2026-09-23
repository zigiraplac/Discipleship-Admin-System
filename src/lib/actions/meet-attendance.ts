"use server";

import { PDFParse } from "pdf-parse";
import { requireRole } from "@/lib/auth";
import { parseMeetAttendancePdfText, type MeetParticipant } from "@/lib/domain/meet-attendance";

/**
 * `pdf-parse` (really `pdfjs-dist` underneath) needs a Node environment,
 * unlike the CSV path in `import-meet-attendance-dialog.tsx` which reads
 * the file client-side — so a PDF report has to make one round trip
 * here. This only extracts text and hands it to the pure parser in
 * `meet-attendance.ts`; nothing is written to the database from this
 * action (see the plan: attendance is only ever saved through the normal
 * `saveRegister` action, once a human reviews the pre-filled register).
 */
export async function parseMeetAttendancePdf(formData: FormData): Promise<MeetParticipant[]> {
  await requireRole("facilitator", "admin");

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file received.");

  const buf = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buf });
  try {
    const textResult = await parser.getText();
    const text = textResult.pages.map((p) => p.text).join("\n");
    return parseMeetAttendancePdfText(text);
  } finally {
    await parser.destroy();
  }
}

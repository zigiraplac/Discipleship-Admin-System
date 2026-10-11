"use client";

import { createContext, useContext } from "react";
import { useSelectedLayoutSegment } from "next/navigation";

/** The open student's id from the URL (/students/<id>), or null on the list. */
export function useOpenStudentId(): string | null {
  const segment = useSelectedLayoutSegment();
  return segment && !segment.startsWith("__") ? segment : null;
}

const OpenStudentPanel = createContext<React.ReactNode>(null);

/** The open student's panel, for the Students table to draw over itself. */
export function useOpenStudentPanel(): React.ReactNode {
  return useContext(OpenStudentPanel);
}

/** Hands the open student (the layout's child route) to the Students table,
 * which shows it as a drawer over its own columns, beside the names. */
export function StudentsSplit({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const openId = useOpenStudentId();
  return <OpenStudentPanel.Provider value={openId ? children : null}>{list}</OpenStudentPanel.Provider>;
}

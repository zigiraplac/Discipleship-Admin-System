"use client";

import { createContext, useContext, useEffect, useState } from "react";

interface Head {
  title: string;
  subtitle: string;
}

const PageHeadContext = createContext<{
  head: Head;
  setHead: (h: Head) => void;
} | null>(null);

export function PageHeadProvider({ children }: { children: React.ReactNode }) {
  const [head, setHead] = useState<Head>({ title: "", subtitle: "" });
  return <PageHeadContext.Provider value={{ head, setHead }}>{children}</PageHeadContext.Provider>;
}

export function usePageHead(): Head {
  const ctx = useContext(PageHeadContext);
  if (!ctx) throw new Error("usePageHead must be used within <PageHeadProvider>");
  return ctx.head;
}

/** Each page renders this once to set the sticky top bar's title/subtitle
 * (03-screens.md: "Left: the page title ... and a one-line subtitle"). */
export function PageHead({ title, subtitle = "" }: { title: string; subtitle?: string }) {
  const ctx = useContext(PageHeadContext);
  if (!ctx) throw new Error("PageHead must be used within <PageHeadProvider>");
  const { setHead } = ctx;
  useEffect(() => {
    setHead({ title, subtitle });
  }, [title, subtitle, setHead]);
  return null;
}

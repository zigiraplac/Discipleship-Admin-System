"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Dialog, DialogPopup } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export interface SearchResultItem {
  kind: "PAGE" | "STUDENT" | "LESSON";
  label: string;
  href: string;
  meta?: string;
}

interface SearchIndex {
  pages: SearchResultItem[];
  students: SearchResultItem[];
  lessons: SearchResultItem[];
}

const SearchContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function SearchProvider({
  index,
  children,
}: {
  index: SearchIndex;
  children: React.ReactNode;
}) {
  const [open, setOpenRaw] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();

  // Opening always starts from a clean query; closing leaves it (nothing
  // renders while closed, so there's nothing to reset eagerly) — this
  // avoids resetting state from inside an effect.
  const setOpen = useCallback((v: boolean) => {
    if (v) setQuery("");
    setOpenRaw(v);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const all = useMemo(
    () => [...index.pages, ...index.students, ...index.lessons],
    [index]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? all.filter((r) => r.label.toLowerCase().includes(q)) : index.pages.slice(0, 8);
    return pool.slice(0, 12);
  }, [all, index.pages, query]);

  return (
    <SearchContext.Provider value={{ open, setOpen }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup width={560} className="top-[12vh] -translate-y-0 p-0">
          <div className="flex items-center gap-2.5 border-b border-divider px-[18px] py-[15px]">
            <MagnifyingGlass size={16} className="text-ink-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Students, lessons, pages"
              className="flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <div className="max-h-[340px] overflow-y-auto">
            {results.map((r, i) => (
              <button
                key={r.kind + r.href + i}
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(r.href);
                }}
                className="flex w-full items-center gap-3 px-[18px] py-[11px] text-left hover:bg-hover"
              >
                <span className="w-[58px] flex-none text-[10px] font-bold uppercase tracking-wide text-ink-faint">
                  {r.kind}
                </span>
                <span className="flex-1 text-[13px] font-semibold text-ink">{r.label}</span>
                {r.meta && <span className="text-xs text-ink-faint tabular">{r.meta}</span>}
              </button>
            ))}
            {results.length === 0 && (
              <div className="px-[18px] py-[22px] text-[13px] text-ink-faint">No matches.</div>
            )}
          </div>
        </DialogPopup>
      </Dialog>
    </SearchContext.Provider>
  );
}

function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within <SearchProvider>");
  return ctx;
}

export function SearchTrigger({ children, className }: { children: React.ReactNode; className?: string }) {
  const { setOpen } = useSearch();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "flex w-full items-center gap-2 rounded-control border border-border bg-hover px-2.5 py-2 text-left hover:border-accent-300",
        className
      )}
    >
      {children}
    </button>
  );
}

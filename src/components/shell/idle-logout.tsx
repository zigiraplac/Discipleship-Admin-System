"use client";

import { useEffect, useRef } from "react";
import { signOutAction } from "@/lib/actions/auth";
import { useToast } from "@/components/ui/toast";

/** No activity for this long (mouse, keyboard, scroll, touch — anywhere
 * in the app) signs the session out, same as clicking "Sign out" in the
 * top bar. Tune here if a role/deployment needs a different window. */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 5000;

const ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "wheel", "touchstart"] as const;

/**
 * Mounted once in Shell, so it's alive on every authenticated page
 * (never on /login itself). This is a UX/defense-in-depth measure, not
 * the actual security boundary — a modified client could just skip it —
 * the real enforcement belongs in Supabase Auth's own session/JWT expiry
 * (project-level, Authentication → Sessions), which this complements.
 */
export function IdleLogout() {
  const { show } = useToast();
  const lastActivityRef = useRef<number | null>(null);
  const warnedRef = useRef(false);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    lastActivityRef.current = Date.now();

    function markActive() {
      lastActivityRef.current = Date.now();
      warnedRef.current = false;
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActive, { passive: true }));

    const interval = setInterval(() => {
      if (loggingOutRef.current || lastActivityRef.current == null) return;
      const idleFor = Date.now() - lastActivityRef.current;

      if (idleFor >= IDLE_TIMEOUT_MS) {
        loggingOutRef.current = true;
        void signOutAction();
        return;
      }

      if (!warnedRef.current && idleFor >= IDLE_TIMEOUT_MS - WARNING_BEFORE_MS) {
        warnedRef.current = true;
        show("You've been idle a while — you'll be signed out in a minute unless you do something.");
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActive));
      clearInterval(interval);
    };
  }, [show]);

  return null;
}

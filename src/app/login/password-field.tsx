"use client";

import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { Input, Label } from "@/components/ui/input";

/** Split out as its own client component only because toggling
 * type="password"/"text" needs local state — submission still goes
 * through the plain `<form action={signInAction}>` on the server. */
export function PasswordField() {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor="password" className="text-[11px] uppercase tracking-wide">
        Password
      </Label>
      <div className="relative">
        <Input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          required
          className="h-12 rounded-xl bg-subtle pl-4 pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-secondary"
        >
          {visible ? <EyeSlash size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

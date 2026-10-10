"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilSimple } from "@phosphor-icons/react";
import { Dialog, DialogTrigger, DialogPopup, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { updateUnitDetails } from "@/lib/actions/org";
import { fieldsFor, type DetailKey } from "@/lib/domain/unit-details";
import type { OrgUnitDetails, OrgUnitType } from "@/lib/domain/types";

/** How each detail is labelled and entered — shared by the Add and Edit forms and Settings. */
export const DETAIL_META: Record<DetailKey, { label: string; placeholder?: string; type?: "text" | "number" | "tel" | "email"; multiline?: boolean; required?: boolean }> = {
  timeZone: { label: "Time zone", placeholder: "e.g. Africa/Kigali" },
  languages: { label: "Main languages", placeholder: "e.g. Kinyarwanda, English" },
  area: { label: "Area covered", placeholder: "e.g. Gasabo, Kicukiro, Nyarugenge" },
  city: { label: "City", placeholder: "e.g. Kigali" },
  address: { label: "Address" },
  startYear: { label: "Start year", type: "number", placeholder: "2027", required: true },
  endYear: { label: "End year", type: "number", placeholder: "2028", required: true },
  email: { label: "General email", type: "email", placeholder: "e.g. office@example.org" },
  phone: { label: "General phone", type: "tel", placeholder: "+250 7XX XXX XXX" },
  description: { label: "Description", multiline: true },
};

/** The detail inputs for a level, in order. `values` are strings as typed. */
export function DetailFields({ type, idPrefix, values, onChange }: { type: OrgUnitType; idPrefix: string; values: Record<string, string>; onChange: (key: DetailKey, value: string) => void }) {
  return (
    <>
      {fieldsFor(type).map((key) => {
        const f = DETAIL_META[key];
        const id = `${idPrefix}-${key}`;
        return (
          <div key={key}>
            <Label htmlFor={id}>
              {f.label}
              {!f.required && <span className="font-normal text-ink-muted"> (optional)</span>}
            </Label>
            {f.multiline ? (
              <Textarea id={id} rows={3} maxLength={500} value={values[key] ?? ""} onChange={(e) => onChange(key, e.target.value)} />
            ) : (
              <Input
                id={id}
                type={f.type ?? "text"}
                inputMode={f.type === "number" ? "numeric" : undefined}
                placeholder={f.placeholder}
                value={values[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Edit a level's own details (Settings). Only the details change — the
 * name, where it sits, its level and its staff are managed elsewhere.
 * Only fields actually changed are sent, so anything untouched keeps its
 * value; emptying a field clears it.
 */
export function EditDetailsDialog({ unitId, unitName, type, details }: { unitId: string; unitName: string; type: OrgUnitType; details: OrgUnitDetails }) {
  const initial = Object.fromEntries(fieldsFor(type).map((k) => [k, details[k] == null ? "" : String(details[k])])) as Record<string, string>;
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { show } = useToast();
  const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v.trim() !== (initial[k] ?? "").trim()));

  async function save() {
    setPending(true);
    setError(null);
    try {
      await updateUnitDetails({ unitId, details: changed });
      show(`${unitName} updated.`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(initial);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="secondary" size="sm" className="gap-1.5" />}>
        <PencilSimple size={14} />
        Edit details
      </DialogTrigger>
      <DialogPopup width={460} className="flex max-h-[min(86vh,760px)] flex-col overflow-hidden">
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">Edit {unitName}</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            General contact and details for {unitName} itself — its leader&apos;s contact comes from their account.
          </DialogDescription>
        </div>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-3.5 overflow-y-auto px-5 py-4">
            <DetailFields type={type} idPrefix="edit-unit" values={values} onChange={(k, v) => setValues((d) => ({ ...d, [k]: v }))} />
            {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-divider px-5 py-4">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" disabled={pending || !Object.keys(changed).length}>
              {pending && <Spinner />}
              Save
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

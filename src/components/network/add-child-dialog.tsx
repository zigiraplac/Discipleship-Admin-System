"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "@phosphor-icons/react";
import { Dialog, DialogTrigger, DialogPopup, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { createUnit } from "@/lib/actions/org";
import { LEVELS } from "@/lib/domain/levels";
import type { OrgUnitDetails, OrgUnitType } from "@/lib/domain/types";
import { fieldsFor } from "@/lib/domain/unit-details";
import { DETAIL_META, DetailFields } from "./unit-details-form";

const NAME_HINT: Record<OrgUnitType, string> = {
  hq: "",
  continent: "e.g. Asia",
  country: "e.g. Burundi",
  region: "e.g. Southern Province",
  site: "e.g. Nyamirambo Church",
  promotion: "e.g. Promotion 2027",
};

export function AddChildDialog({
  parentId,
  parentName,
  childType,
  people,
}: {
  parentId: string;
  parentName: string;
  childType: OrgUnitType;
  /** People who can be appointed to lead the new box. */
  people: { id: string; name: string }[];
}) {
  const label = LEVELS[childType].label;
  const fields = fieldsFor(childType).map((key) => ({ key, ...DETAIL_META[key] }));
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [leaderId, setLeaderId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { show } = useToast();

  function reset() {
    setName("");
    setDetails({});
    setLeaderId("");
    setError(null);
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const missing = fields.find((f) => f.required && !details[f.key]?.trim());
      if (missing) throw new Error(`${missing.label} is required.`);
      await createUnit({ parentId, type: childType, name, details: details as OrgUnitDetails, leaderId: leaderId || null });
      show(`${name.trim()} added inside ${parentName}.`);
      setOpen(false);
      reset();
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
        if (!next) reset();
      }}
    >
      <DialogTrigger className="flex items-center gap-1.5 rounded-control bg-accent px-3 py-2 text-[13px] font-semibold text-white hover:bg-accent-600">
        <Plus size={15} />
        Add {label.toLowerCase()}
      </DialogTrigger>
      <DialogPopup width={440}>
        <div className="px-5 pt-5">
          <DialogTitle className="text-[15px] font-bold text-ink">
            New {label.toLowerCase()} in {parentName}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-ink-muted">
            It starts empty. Its numbers appear here as soon as its cohorts start recording.
          </DialogDescription>
        </div>
        <form
          className="flex flex-col gap-3.5 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <Label htmlFor="add-unit-name">{label} name</Label>
            <Input id="add-unit-name" value={name} placeholder={NAME_HINT[childType]} onChange={(e) => setName(e.target.value)} />
          </div>
          <DetailFields type={childType} idPrefix="add-unit" values={details} onChange={(k, v) => setDetails((d) => ({ ...d, [k]: v }))} />
          <div>
            <Label htmlFor="add-unit-leader">
              Who leads it <span className="font-normal text-ink-muted">(optional)</span>
            </Label>
            <NativeSelect id="add-unit-leader" value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
              <option value="">Appoint later</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {error && <div className="text-xs font-medium text-accent-2-700">{error}</div>}
          <div className="-mx-5 mt-1 flex justify-end gap-2 border-t border-divider px-5 pt-4">
            <DialogClose render={<Button type="button" variant="secondary" />}>Cancel</DialogClose>
            <Button type="submit" variant="primary" disabled={pending || !name.trim()}>
              {pending && <Spinner />}
              Create {label.toLowerCase()}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

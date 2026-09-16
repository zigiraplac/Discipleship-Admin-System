"use client";

import { useState, useTransition } from "react";
import { updateOwnName, updateOwnWhatsapp, changeOwnPassword } from "@/lib/actions/account";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function NameForm({
  name,
  email,
  roleLabel,
  whatsapp,
}: {
  name: string;
  email: string;
  roleLabel: string;
  whatsapp: string | null;
}) {
  const { show } = useToast();
  const [value, setValue] = useState(name);
  const [phone, setPhone] = useState(whatsapp ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = value.trim() !== name || phone.trim() !== (whatsapp ?? "");

  function handleSave() {
    if (!value.trim()) {
      setError("Enter a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (value.trim() !== name) await updateOwnName(value);
        if (phone.trim() !== (whatsapp ?? "")) await updateOwnWhatsapp(phone);
        show("Profile updated.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't update your profile.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Your profile</CardTitle>
          <CardSubtitle>{email}</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="whatsapp">WhatsApp number</Label>
          <Input
            id="whatsapp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +250 788 123 456"
          />
          <div className="mt-1.5 text-xs text-ink-faint">
            Used to reach you the day a student in your cohort has a birthday.
          </div>
        </div>
        <div>
          <Label>Role</Label>
          <div className="rounded-control border border-border bg-page px-3 py-2.5 text-sm text-ink-muted">
            {roleLabel}
          </div>
          <div className="mt-1.5 text-xs text-ink-faint">Only an administrator can change your role.</div>
        </div>
        {error && <div className="text-[12px] font-medium text-accent-2-700">{error}</div>}
        <Button type="button" onClick={handleSave} disabled={pending || !dirty} className="w-fit">
          {pending && <Spinner />}
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

export function PasswordForm() {
  const { show } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    if (!currentPassword) {
      setError("Enter your current password.");
      return;
    }
    if (password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await changeOwnPassword(currentPassword, password);
        setCurrentPassword("");
        setPassword("");
        setConfirm("");
        show("Password changed.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change your password.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Change password</CardTitle>
          <CardSubtitle>Confirm your current password to set a new one.</CardSubtitle>
        </div>
      </CardHeader>
      <div className="flex flex-col gap-3.5 px-[18px] py-4">
        <div>
          <Label htmlFor="currentPassword">Current password</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="newPassword">New password</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="confirmPassword">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <div className="text-[12px] font-medium text-accent-2-700">{error}</div>}
        <Button
          type="button"
          onClick={handleSave}
          disabled={pending || !currentPassword || !password}
          className="w-fit"
        >
          {pending && <Spinner />}
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </Card>
  );
}

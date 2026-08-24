"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";
import { Spinner } from "./spinner";

/**
 * A submit button for a plain `<form action={serverAction}>` (no
 * client-side pending state of its own to wire up) — `useFormStatus`
 * reads the enclosing form's pending state automatically. Must render
 * inside the `<form>` it submits, per React's rules for the hook.
 */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonProps & { pendingLabel?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogBackdrop({ className }: { className?: string }) {
  return (
    <BaseDialog.Backdrop
      className={cn(
        "fixed inset-0 z-[80] bg-[rgba(20,25,32,0.42)] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
        className
      )}
    />
  );
}

export function DialogPopup({
  className,
  width = 460,
  children,
}: {
  className?: string;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <BaseDialog.Portal>
      <DialogBackdrop />
      <BaseDialog.Popup
        className={cn(
          "fixed top-1/2 left-1/2 z-[81] -translate-x-1/2 -translate-y-1/2 rounded-modal bg-card shadow-modal outline-none",
          "transition-all duration-150 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0",
          className
        )}
        style={{ width: `min(${width}px, calc(100vw - 48px))` }}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

export const DialogTitle = BaseDialog.Title;
export const DialogDescription = BaseDialog.Description;

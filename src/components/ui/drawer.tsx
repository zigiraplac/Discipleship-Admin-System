"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { DialogBackdrop } from "./dialog";

/** A Dialog that slides in from the right edge, full height. Use with the
 * same Dialog / DialogTitle / DialogClose parts as a centred dialog. */
export function DrawerPopup({
  className,
  width = 440,
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
          "fixed inset-y-0 right-0 z-[81] flex flex-col bg-card shadow-modal outline-none",
          "transition-transform duration-200 ease-out data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full",
          className
        )}
        style={{ width: `min(${width}px, 100vw)` }}
      >
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}

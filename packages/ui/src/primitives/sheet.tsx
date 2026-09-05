"use client";

import { useRef, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "./dialog";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}

/** The mockup's `.sheet`: a centred modal with a title bar and a close button, used for the
 * "create constraint from failure" and similar compose flows. Built on `Dialog` (Radix), not a
 * second focus-trap implementation. */
export function Sheet({ open, onOpenChange, title, children }: SheetProps) {
  // Radix's own close-focus-return only works through `Dialog.Trigger` (it tracks a triggerRef
  // that only a rendered Trigger populates) — Sheet is opened from an arbitrary caller-owned
  // button with no Trigger in sight, so it captures the trigger itself and hands it back via
  // onCloseAutoFocus. Captured during render, not in an effect: on the render where `open` flips
  // false->true, `document.activeElement` is still the trigger (React hasn't touched the DOM yet
  // in the render phase), and this runs before any effect — Radix's own FocusScope moves focus
  // into the dialog via an effect nested inside this component, which always runs after this
  // component's render, so an effect-based capture here would already be too late.
  const wasOpen = useRef(open);
  const trigger = useRef<HTMLElement | null>(null);
  if (open && !wasOpen.current) {
    trigger.current = document.activeElement as HTMLElement;
  }
  wasOpen.current = open;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
      >
        <div className="sheet-header">
          <DialogTitle asChild>
            <b>{title}</b>
          </DialogTitle>
          <div style={{ flex: 1 }} />
          <DialogClose asChild>
            <Button variant="ghost" size="sm" aria-label="Close">
              Close
            </Button>
          </DialogClose>
        </div>
        <div className="sheet-body">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

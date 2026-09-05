"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { cx } from "../cx";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;
export const DialogTitle = RadixDialog.Title;
export const DialogDescription = RadixDialog.Description;

export interface DialogContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, "className"> {
  className?: string;
}

/** Radix Dialog, restyled to the interactive-surface tokens (decision 2 / epic scope: "shadcn
 * primitives only for Dialog, Dropdown, Popover, restyled to these tokens"). */
export function DialogContent({ children, className, ...rest }: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="sheet-overlay" />
      <RadixDialog.Content className={cx("sheet-content", className)} {...rest}>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { cx } from "../cx";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;

export interface PopoverContentProps {
  children: ReactNode;
  className?: string;
}

export function PopoverContent({ children, className }: PopoverContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content className={cx("popover-content", className)} sideOffset={6}>
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}

"use client";

import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cx } from "../cx";

export const Dropdown = RadixDropdown.Root;
export const DropdownTrigger = RadixDropdown.Trigger;

export interface DropdownContentProps {
  children: ReactNode;
  className?: string;
}

export function DropdownContent({ children, className }: DropdownContentProps) {
  return (
    <RadixDropdown.Portal>
      <RadixDropdown.Content className={cx("dropdown-content", className)} sideOffset={6}>
        {children}
      </RadixDropdown.Content>
    </RadixDropdown.Portal>
  );
}

export interface DropdownItemProps {
  children: ReactNode;
  onSelect?: () => void;
  className?: string;
}

export function DropdownItem({ children, onSelect, className }: DropdownItemProps) {
  return (
    <RadixDropdown.Item className={cx("dropdown-item", className)} onSelect={onSelect}>
      {children}
    </RadixDropdown.Item>
  );
}

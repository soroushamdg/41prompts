"use client";

import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";

export interface TabItem {
  value: string;
  text: ReactNode;
  panel: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name for the tablist — there is no visible heading for it in the mockup. */
  name: string;
  className?: string;
}

/** Full ARIA tabs pattern (README correction): one tab stop for the whole tablist, arrow keys move
 * focus and selection inside it, Home/End jump to the ends. */
export function Tabs({ items, value, onValueChange, name, className }: TabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusAndSelect(index: number) {
    const wrapped = (index + items.length) % items.length;
    const item = items[wrapped];
    if (!item) return;
    onValueChange(item.value);
    tabRefs.current[wrapped]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = items.findIndex((item) => item.value === value);
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusAndSelect(currentIndex + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusAndSelect(currentIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAndSelect(0);
        break;
      case "End":
        event.preventDefault();
        focusAndSelect(items.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div className={className}>
      <div role="tablist" aria-label={name} className="tabs-list" onKeyDown={onKeyDown}>
        {items.map((item, index) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              role="tab"
              type="button"
              id={`tab-${item.value}`}
              aria-controls={`panel-${item.value}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              className={cx("tab")}
              onClick={() => onValueChange(item.value)}
            >
              {item.text}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          id={`panel-${item.value}`}
          aria-labelledby={`tab-${item.value}`}
          hidden={item.value !== value}
          tabIndex={0}
          className="tab-panel"
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}

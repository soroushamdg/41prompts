/* Relative times as the mockup writes them: "Just now", "2 min ago",
   "Today, 09:14", "Yesterday", "Oct 6", "Sep 28, 2025". */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function shortDate(d: Date, now: Date): string {
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** Library and rail: "Just now", "2 min ago", "3 h ago", "Yesterday", "Oct 6". */
export function relativeTime(d: Date, now: Date = new Date()): string {
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (sameDay(d, now)) return `${Math.round(s / 3600)} h ago`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return "Yesterday";
  return shortDate(d, now);
}

/** History rows: "2 min ago", "Today, 09:14", "Yesterday, 18:02", "Oct 7". */
export function versionTime(d: Date, now: Date = new Date()): string {
  const s = (now.getTime() - d.getTime()) / 1000;
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (s < 45) return "Just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (sameDay(d, now)) return `Today, ${hm}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday, ${hm}`;
  return shortDate(d, now);
}

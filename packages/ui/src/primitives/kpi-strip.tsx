import type { ReactNode } from "react";

export interface Kpi {
  key: string;
  title: string;
  value: ReactNode;
  sub?: ReactNode;
}

export interface KpiStripProps {
  items: Kpi[];
}

export function KpiStrip({ items }: KpiStripProps) {
  return (
    <div className="kpi-strip">
      {items.map((item) => (
        <div className="kpi" key={item.key}>
          <div className="kpi-key">{item.title}</div>
          <div className="kpi-value mono">{item.value}</div>
          {item.sub && <div className="kpi-sub">{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}

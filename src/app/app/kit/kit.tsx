"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { ICONS, type IconName } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Menu } from "@/components/menu";
import { TabList, TabPanel } from "@/components/tabs";
import { useToast } from "@/components/toast";
import { PerfButton, UpgradeProvider } from "@/components/upgrade/upgrade";
import s from "./kit.module.css";

export function Kit() {
  return (
    <UpgradeProvider plan="free" pricingEnabled={false} registerInterest={async () => true}>
      <KitBody />
    </UpgradeProvider>
  );
}

function KitBody() {
  const toast = useToast();
  const [tab, setTab] = useState<"c" | "r" | "h">("c");
  const [seg, setSeg] = useState<"template" | "filled">("template");
  return (
    <main className={`${s.page} app-bg`}>
      <div className={s.row}>
        <Logo href="/" label="41Prompts, library" />
        <Logo href="/" label="41Prompts, large" size={44} />
        <span className="titleblock"><span>41prompts</span><span>Sheet K</span><span>Kit</span><span>Rev 1</span></span>
      </div>
      <h1 className={s.h}>Component kit</h1>

      <section className={s.row} aria-label="Buttons">
        <button className="btn btn--primary" type="button"><Icon name="plus" />New prompt</button>
        <button className="btn" type="button"><Icon name="download" />Export all</button>
        <button className="btn btn--dashed" type="button">Name this version</button>
        <button className="btn btn--danger" type="button">Delete account</button>
        <button className="btn btn--bare btn--icon btn--sm" type="button" aria-label="Duplicate"><Icon name="copy" /></button>
        <button className="btn btn--primary btn--lg btn--go" type="button">Start free <Icon name="arrow-right" /></button>
        <button className="btn btn--primary is-busy" type="button" disabled><span className="btn-spin" aria-hidden="true" />Sending link</button>
        <PerfButton feature="The linter"><Icon name="scan" />Lint</PerfButton>
        <PerfButton feature="Side-by-side runs" className="btn--sm">Run on all 3 models <span className="stamp">Performance</span></PerfButton>
      </section>

      <section className={s.row} aria-label="Stamps and chips">
        <span className="stamp">Performance</span>
        <span className="chip chip--ok"><span className="dot" />Free</span>
        <span className="chip chip--fail"><span className="dot" />Failed</span>
        <span className="chip">Neutral</span>
        <span className="var">{"{{customer_name}}"}</span>
        <span className="kbd">⌘K</span>
        <span className="keystate is-ok"><span className="dot" /><span>Connected</span></span>
        <span className="keystate is-test"><span className="dot" /><span>Testing</span></span>
      </section>

      <div className={s.grid}>
        <div className={`frame ${s.panel}`}>
          <span className="label">Frame</span>
          <label className="searchbox"><Icon name="search" /><input type="search" placeholder="Search by name" aria-label="Search" /><span className="kbd">⌘K</span></label>
          <div className="field"><label className="label" htmlFor="kitName">Name</label><input className="input input--mono" id="kitName" defaultValue="support-reply" /></div>
          <div className="field"><label className="label" htmlFor="kitSel">Model</label><select className="input" id="kitSel"><option>OpenAI · key ending 3f9a</option></select></div>
        </div>
        <div className={`frame frame--live ${s.panel}`}>
          <span className="label">Frame · live (hover)</span>
          <div className="seg" role="group" aria-label="Show variables as">
            <button type="button" aria-pressed={seg === "template"} onClick={() => setSeg("template")}>Template</button>
            <button type="button" aria-pressed={seg === "filled"} onClick={() => setSeg("filled")}>Filled</button>
          </div>
          <TabList idPrefix="kit" label="Output panels" value={tab} onChange={setTab} items={[{ id: "c", label: "Compiled" }, { id: "r", label: "Run" }, { id: "h", label: "History · 7" }]} />
          <TabPanel idPrefix="kit" id="c" active={tab === "c"}><p>Compiled panel</p></TabPanel>
          <TabPanel idPrefix="kit" id="r" active={tab === "r"}><p>Run panel</p></TabPanel>
          <TabPanel idPrefix="kit" id="h" active={tab === "h"}><p>History panel</p></TabPanel>
        </div>
        <div className={`frame frame--chalk ${s.panel}`}>
          <span className="label">Toast and menu</span>
          <div className={s.row}>
            <button className="btn" type="button" onClick={() => toast("Copied.")}>Toast</button>
            <button className="btn" type="button" onClick={() => toast("Deleted blok B2.", { action: "Undo", ms: 6000, onAction: () => toast("Restored B2.") })}>Toast with Undo</button>
            <Menu summary="S" summaryClassName="avatar" summaryLabel="Account menu">
              <div className="menu__who"><b>Sora</b><span>sora@example.com</span></div>
              <a href="#keys"><Icon name="key" />Model keys</a>
              <a href="#billing"><Icon name="card" />Plan and billing</a>
              <button type="button"><Icon name="logout" />Sign out</button>
            </Menu>
          </div>
          <div className="progress"><i style={{ width: "62%" }} /></div>
          <span className="toggle" aria-hidden="true" />
        </div>
      </div>

      <section className="blok frame" data-type="constraint" aria-label="Constraint blok B2">
        <button className="grip" type="button" aria-label="Move blok B2"><Icon name="grip" /></button>
        <div className="blok__main">
          <div className="blok__head"><span className="blok__type">Constraint</span><span className="blok__id">B2</span>
            <span className="blok__tools"><button className="btn btn--icon btn--sm btn--bare" type="button" aria-label="Duplicate blok B2"><Icon name="copy" /></button></span></div>
          <p className="blok__text">Reply in under 80 words. Greet the customer as <span className="var">{"{{customer_name}}"}</span>.</p>
        </div>
      </section>

      <div className="table-wrap">
        <table className="table" aria-label="Example table">
          <thead><tr><th scope="col">Name</th><th scope="col">Bloks</th><th scope="col">Versions</th></tr></thead>
          <tbody><tr><td>support-reply</td><td className="num">4</td><td className="num">7</td></tr></tbody>
        </table>
      </div>

      <section className={s.row} aria-label="Icons">
        {(Object.keys(ICONS) as IconName[]).map((n) => (
          <span key={n} title={n} className="chip"><Icon name={n} />{n}</span>
        ))}
      </section>
      <p className="notice"><Icon name="key" />2 of 3 model keys connected.<a className="btn btn--sm" href="#keys">Manage keys</a></p>
    </main>
  );
}

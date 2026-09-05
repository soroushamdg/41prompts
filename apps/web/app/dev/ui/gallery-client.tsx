"use client";

import {
  AllPassIllustration,
  AttributionIllustration,
  Badge,
  BlokCard,
  Button,
  Callout,
  CompileIllustration,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
  EmptyCanvasIllustration,
  Input,
  KpiStrip,
  LessonDoneIllustration,
  Meter,
  NoRunsIllustration,
  Pill,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  StatusIcon,
  Switch,
  Table,
  Tabs,
  Tag,
  Textarea,
  ThemeToggle,
  VarianceIllustration,
  VersionsIllustration,
} from "@41prompts/ui";
import { useState, type CSSProperties, type ReactNode } from "react";

const ROW_GAP: CSSProperties = { display: "flex", gap: "var(--spacing-s3)", flexWrap: "wrap", alignItems: "center" };

interface ProviderRow {
  check: string;
  kind: string;
  gpt: string;
  claude: string;
  gemini: string;
  rate: number;
  status?: "fail";
}

const TABLE_ROWS: ProviderRow[] = [
  { check: "No prose outside JSON", kind: "Constraint", gpt: "40/40", claude: "40/40", gemini: "40/40", rate: 100 },
  { check: "Category is one of the allowed values", kind: "Constraint", gpt: "40/40", claude: "40/40", gemini: "37/40", rate: 97 },
  { check: "Reason under 20 words", kind: "Constraint", gpt: "40/40", claude: "31/40", gemini: "39/40", rate: 92 },
  {
    check: "Valid JSON, exactly three keys",
    kind: "Expected",
    gpt: "28/40",
    claude: "40/40",
    gemini: "22/40",
    rate: 75,
    status: "fail",
  },
];

export function GalleryClient() {
  const [tab, setTab] = useState("import");
  const [switchOn, setSwitchOn] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-s7)", padding: "var(--spacing-s6)", maxWidth: 1100 }}>
      <header style={{ display: "flex", alignItems: "center", gap: "var(--spacing-s4)" }}>
        <h1>Design system gallery</h1>
        <ThemeToggle />
      </header>

      <Section title="Button">
        <div style={ROW_GAP}>
          <Button>Compile</Button>
          <Button variant="primary">Run 6 checks</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Replay</Button>
          <Button disabled>Disabled</Button>
          <Button aria-pressed="true">Pressed</Button>
        </div>
      </Section>

      <Section title="Badge">
        <div style={ROW_GAP}>
          <Badge status="pass">passes</Badge>
          <Badge status="fail">2 of 3 fail</Badge>
          <Badge status="drift">drift</Badge>
          <Badge status="neutral">n/a</Badge>
        </div>
      </Section>

      <Section title="Pill">
        <div style={ROW_GAP}>
          <Pill dotColor="var(--color-pass)">No credit card</Pill>
          <Pill>read-only</Pill>
        </div>
      </Section>

      <Section title="Tag">
        <div style={ROW_GAP}>
          <Tag>Context</Tag>
          <Tag>Constraint</Tag>
          <Tag>Example</Tag>
          <Tag>Expected</Tag>
        </div>
      </Section>

      <Section title="BlokCard">
        <div style={{ maxWidth: 420 }}>
          <BlokCard kindTag={<Tag>Expected</Tag>} meta={<span>asserted, never stated in the prompt body</span>}>
            Output must parse as valid JSON with exactly three keys.
          </BlokCard>
          <BlokCard kindTag={<Tag>Constraint</Tag>} selected meta={<span>selected</span>}>
            No prose outside the JSON object.
          </BlokCard>
        </div>
      </Section>

      <Section title="KpiStrip">
        <KpiStrip
          items={[
            { key: "rate", title: "Pass rate", value: "81.7%" },
            { key: "regressions", title: "Regressions", value: "3" },
            { key: "cost", title: "Cost", value: "$0.37" },
          ]}
        />
      </Section>

      <Section title="Table">
        <Table
          caption="Check results by provider"
          rows={TABLE_ROWS}
          getRowKey={(row) => row.check}
          getRowStatus={(row) => row.status}
          columns={[
            {
              key: "check",
              header: "Check",
              render: (row) => (
                <>
                  <Tag>{row.kind}</Tag> {row.check}
                </>
              ),
            },
            { key: "gpt", header: "GPT", render: (row) => <span className={row.gpt.startsWith("40") ? "cell-pass" : "cell-fail"}>{row.gpt}</span> },
            {
              key: "claude",
              header: "Claude",
              render: (row) => <span className={row.claude.startsWith("40") ? "cell-pass" : "cell-fail"}>{row.claude}</span>,
            },
            {
              key: "gemini",
              header: "Gemini",
              render: (row) => <span className={row.gemini.startsWith("40") ? "cell-pass" : "cell-fail"}>{row.gemini}</span>,
            },
            {
              key: "rate",
              header: "Pass rate",
              render: (row) => <Meter value={row.rate} description={`${row.rate}% pass rate`} status={row.status === "fail" ? "fail" : row.rate < 95 ? "drift" : "pass"} />,
            },
          ]}
        />
      </Section>

      <Section title="Meter">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-s2)", maxWidth: 200 }}>
          <Meter value={100} description="100% pass rate" status="pass" />
          <Meter value={75} description="75% pass rate" status="fail" />
          <Meter value={92} description="92% pass rate" status="drift" />
        </div>
      </Section>

      <Section title="Switch">
        <div style={ROW_GAP}>
          <Switch checked={switchOn} onCheckedChange={setSwitchOn} aria-label="Enable sandbox mode" />
          <span>{switchOn ? "On" : "Off"}</span>
        </div>
      </Section>

      <Section title="Input / Textarea">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-s3)", maxWidth: 360 }}>
          <label htmlFor="gallery-input">
            <span className="eyebrow">Project name</span>
            <Input id="gallery-input" defaultValue="refund-classifier" />
          </label>
          <label htmlFor="gallery-textarea">
            <span className="eyebrow">Constraint</span>
            <Textarea id="gallery-textarea" defaultValue={"Output must parse as valid JSON with exactly three keys."} />
          </label>
        </div>
      </Section>

      <Section title="Tabs">
        <Tabs
          name="Capability"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "import", text: "Import", panel: <p>Paste a prompt, get named bloks with source spans mapped back.</p> },
            { value: "compose", text: "Compose", panel: <p>Context, constraint, example, expected, image. Reorder, filter, group.</p> },
            { value: "test", text: "Test", panel: <p>Deterministic checks first, judge models second, pinned by version.</p> },
          ]}
        />
      </Section>

      <Section title="Callout">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-s3)", maxWidth: 480 }}>
          <Callout status="fail" title="18 of 40 runs failed">
            Output must parse as valid JSON with exactly three keys.
          </Callout>
          <Callout status="drift" title="This blok was edited by hand">
            The compiler released this blok. Use "update from blok" to recompile it.
          </Callout>
          <Callout status="pass" title="Suite green">
            All 6 checks pass on every connected provider.
          </Callout>
          <Callout status="info" title="Judge models are pinned">
            Grading never calls a floating alias.
          </Callout>
        </div>
      </Section>

      <Section title="Sheet (Dialog)">
        <Button onClick={() => setSheetOpen(true)}>Create constraint from failure</Button>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen} title="Create constraint blok">
          <label htmlFor="gallery-sheet-textarea">
            <span className="eyebrow">Constraint</span>
            <Textarea id="gallery-sheet-textarea" defaultValue="Output must parse as valid JSON with exactly three keys." />
          </label>
        </Sheet>
      </Section>

      <Section title="Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <div className="sheet-header">
              <DialogTitle asChild>
                <b>Undo publish</b>
              </DialogTitle>
            </div>
            <div className="sheet-body">
              <p>Live returns to v6. This is audited.</p>
            </div>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Dropdown">
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost">Actions</Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem>Duplicate</DropdownItem>
            <DropdownItem>Export</DropdownItem>
            <DropdownItem>Delete</DropdownItem>
          </DropdownContent>
        </Dropdown>
      </Section>

      <Section title="Popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost">Cost breakdown</Button>
          </PopoverTrigger>
          <PopoverContent>
            <p>1,284 tokens · $0.0037</p>
          </PopoverContent>
        </Popover>
      </Section>

      <Section title="Status icon">
        <div style={ROW_GAP}>
          <StatusIcon status="pass" />
          <StatusIcon status="fail" />
          <StatusIcon status="drift" />
        </div>
      </Section>

      <Section title="Illustrations">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "var(--spacing-s4)" }}>
          <IllustrationSwatch caption="Empty canvas">
            <EmptyCanvasIllustration />
          </IllustrationSwatch>
          <IllustrationSwatch caption="Compile">
            <CompileIllustration />
          </IllustrationSwatch>
          <IllustrationSwatch caption="No runs">
            <NoRunsIllustration />
          </IllustrationSwatch>
          <IllustrationSwatch caption="All pass">
            <AllPassIllustration />
          </IllustrationSwatch>
          <IllustrationSwatch caption="Attribution">
            <AttributionIllustration />
          </IllustrationSwatch>
          <IllustrationSwatch caption="Variance">
            <VarianceIllustration />
          </IllustrationSwatch>
          <IllustrationSwatch caption="Versions">
            <VersionsIllustration />
          </IllustrationSwatch>
          <IllustrationSwatch caption="Lesson done">
            <LessonDoneIllustration />
          </IllustrationSwatch>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-s4)" }}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function IllustrationSwatch({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="surface-data" style={{ padding: "var(--spacing-s3)", display: "flex", flexDirection: "column", gap: "var(--spacing-s2)" }}>
      <div style={{ maxWidth: 140 }}>{children}</div>
      <span className="eyebrow">{caption}</span>
    </div>
  );
}

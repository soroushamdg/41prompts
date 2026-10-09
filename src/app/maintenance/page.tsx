import { Crosshair } from "./crosshair";
import { Logo } from "./logo";
import { Sheet00 } from "./sheet00";
import s from "./page.module.css";

const ZONES_X = ["1", "2", "3", "4", "5", "6"];
const ZONES_Y = ["A", "B", "C", "D"];

export default function MaintenancePage() {
  return (
    <div className={s.sheet}>
      <div className={s.grid} aria-hidden="true" />
      <div className={s.border} aria-hidden="true">
        <div className={s.zonesX}>
          {ZONES_X.map((z) => (
            <span key={z}>{z}</span>
          ))}
        </div>
        <div className={s.zonesY}>
          {ZONES_Y.map((z) => (
            <span key={z}>{z}</span>
          ))}
        </div>
      </div>
      <Crosshair />

      <header className={s.top}>
        <Logo />
      </header>

      <main className={s.body}>
        <div className={s.copy}>
          <p className={`label ${s.status}`}>
            <span className={s.tick} aria-hidden="true" />
            <span className={s.spin} aria-hidden="true" />
            <span>
              Status · <b>Rebuilding</b>
            </span>
            <span className={s.caret} aria-hidden="true" />
          </p>
          <h1 className={s.title}>
            <span className={s.ln}>
              <span>41prompts is</span>
            </span>{" "}
            <span className={s.ln}>
              <span>under</span>
            </span>{" "}
            <span className={s.ln}>
              <span>maintenance.</span>
            </span>
          </h1>
          <p className={s.lede}>
            We are rebuilding the workbench for the prompt layer. Break any prompt into bloks, see what each one adds, keep every version. Back soon.
          </p>
        </div>
        <Sheet00 />
      </main>

      <footer className={s.foot}>
        <p className="titleblock">
          <span>41prompts</span>
          <span>Sheet 00</span>
          <span>Maintenance</span>
          <span>Rev 2</span>
        </p>
      </footer>
    </div>
  );
}

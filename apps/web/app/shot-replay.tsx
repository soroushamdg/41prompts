"use client";

/**
 * `Replay` on the product shot.
 *
 * ## The animation is CSS and this button only restarts it
 *
 * The shot's span-to-blok walk is five staggered CSS animations that the server renders already
 * running — no hydration, nothing to wait for, and the first play costs nothing. What CSS cannot do
 * on its own is *play it again*, so this is the whole of the JavaScript: take the class off, force
 * a reflow, put it back. That is the standard restart and it is the reason for the otherwise
 * pointless-looking read of `offsetWidth`; without it the browser coalesces the two class changes
 * into no change at all and the animation never restarts.
 *
 * ## Under reduced motion the control is not rendered at all
 *
 * The walk's animations are switched off by `@media (prefers-reduced-motion: reduce)`, and the end
 * state of a highlight that returns to rest **is** rest — the shot is complete and correct with no
 * motion at all, which is what `docs/design/README.md` asks for. A `Replay` that replays nothing is
 * worse than no `Replay`, so `landing.css` takes it out with `display: none`, which removes it from
 * the accessibility tree as well as from the screen rather than leaving a dead control in one of
 * them.
 */
export function ShotReplay() {
  return (
    <button
      type="button"
      className="shot-replay"
      onClick={(event) => {
        const shot = event.currentTarget.closest(".shot");
        if (!(shot instanceof HTMLElement)) return;
        shot.classList.remove("shot-playing");
        // Read a layout property so the removal is committed before the class goes back on.
        void shot.offsetWidth;
        shot.classList.add("shot-playing");
      }}
    >
      Replay
    </button>
  );
}

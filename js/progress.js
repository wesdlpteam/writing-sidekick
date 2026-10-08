// Block-by-block loading bar. The AI calls don't report how far along they are, so the bar
// fills on real milestones (a page checked, a page read) and creeps slowly in between.
// It never reaches the end on its own: only finish() fills the last block.

export const BLOCKS = 12;
const CREEP_SHARE = 0.9; // creeping covers at most 90% of a stage, the milestone does the rest
const TICK_MS = 200;
const FULL_PAUSE_MS = 350; // let the child see a full bar before the next screen

// Eases from start toward end without reaching it. tauMs sets the pace: about 63% of the way
// (of the creeping share) after tauMs.
export function creep(start, end, elapsedMs, tauMs) {
  const t = Math.max(0, elapsedMs) / Math.max(1, tauMs);
  return start + (end - start) * CREEP_SHARE * (1 - Math.exp(-t));
}

export function blocksLit(fraction, total = BLOCKS) {
  return Math.max(0, Math.min(total, Math.floor(fraction * total + 1e-9)));
}

export class ProgressBar {
  constructor(el, total = BLOCKS) {
    this.el = el;
    this.total = total;
    this.blocks = Array.from({ length: total }, () => {
      const block = document.createElement("span");
      block.className = "load-block";
      el.appendChild(block);
      return block;
    });
    this.timer = null;
  }

  start() {
    this.stop();
    this.shown = 0;
    this.floor = 1 / this.total; // one block straight away, so the child sees it has started
    this.stage(0, 1, 30000);
    this.blocks.forEach((b) => b.classList.remove("on"));
    this.render();
    this.timer = setInterval(() => this.render(), TICK_MS);
  }

  // A new stretch of work between start and end (fractions of the whole bar).
  stage(start, end, tauMs) {
    this.floor = Math.max(this.floor, start);
    this.stageAt = { start: Math.max(this.floor, start), end, tauMs, t0: performance.now() };
  }

  // A milestone: the bar is at least this full now.
  reach(fraction) {
    this.floor = Math.max(this.floor, Math.min(1, fraction));
    this.render();
  }

  render() {
    const { start, end, tauMs, t0 } = this.stageAt;
    const value = Math.max(this.floor, creep(start, end, performance.now() - t0, tauMs));
    this.shown = Math.min(1, Math.max(this.shown, value)); // never goes backwards
    const lit = blocksLit(this.shown, this.total);
    this.blocks.forEach((b, i) => b.classList.toggle("on", i < lit));
    this.el.setAttribute("aria-valuenow", String(Math.round(this.shown * 100)));
  }

  async finish() {
    this.reach(1);
    this.stop();
    await new Promise((resolve) => setTimeout(resolve, FULL_PAUSE_MS));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

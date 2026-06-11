import { AlignedDiffModel } from '../diff/model';

/**
 * Absolute pixel extent [top, bottom] of one side of a chunk.
 * A zero-count side collapses to a point at the insertion line boundary
 * (`start` follows the hunk-header convention: line before the insertion).
 */
export function sideExtent(start: number, count: number, lineHeight: number): [number, number] {
  if (count === 0) {
    const y = start * lineHeight;
    return [y, y];
  }
  return [(start - 1) * lineHeight, (start - 1 + count) * lineHeight];
}

/**
 * Keeps the two panes' vertical scroll positions in sync through a piecewise
 * linear mapping anchored at chunk boundaries: context regions scroll 1:1,
 * changed regions of different heights stretch/compress (WebStorm-style).
 */
export class ScrollSync {
  private left: HTMLElement | undefined;
  private right: HTMLElement | undefined;
  private anchorsLeft: number[] = [0];
  private anchorsRight: number[] = [0];
  /** Suppresses feedback loops: scroll positions we set programmatically. */
  private readonly expected = new Map<HTMLElement, number>();
  private detach: (() => void) | undefined;

  constructor(private readonly onAnyScroll: () => void) {}

  attach(
    left: HTMLElement,
    right: HTMLElement,
    model: AlignedDiffModel,
    lineHeight: number
  ): void {
    this.detach?.();
    this.left = left;
    this.right = right;
    this.buildAnchors(model, lineHeight);

    const onLeft = () => this.onScroll(left, right, true);
    const onRight = () => this.onScroll(right, left, false);
    left.addEventListener('scroll', onLeft, { passive: true });
    right.addEventListener('scroll', onRight, { passive: true });
    this.detach = () => {
      left.removeEventListener('scroll', onLeft);
      right.removeEventListener('scroll', onRight);
    };
  }

  /** Scroll one pane without triggering a counter-sync from its scroll event. */
  setScrollTop(pane: HTMLElement, value: number): void {
    const clamped = Math.max(0, Math.min(value, pane.scrollHeight - pane.clientHeight));
    this.expected.set(pane, clamped);
    pane.scrollTop = clamped;
  }

  private buildAnchors(model: AlignedDiffModel, lineHeight: number): void {
    const anchorsLeft = [0];
    const anchorsRight = [0];
    const push = (l: number, r: number) => {
      // keep both sequences monotonic so the interpolation stays well-defined
      anchorsLeft.push(Math.max(l, anchorsLeft[anchorsLeft.length - 1]));
      anchorsRight.push(Math.max(r, anchorsRight[anchorsRight.length - 1]));
    };
    for (const chunk of model.chunks) {
      const [lt, lb] = sideExtent(chunk.leftStart, chunk.leftCount, lineHeight);
      const [rt, rb] = sideExtent(chunk.rightStart, chunk.rightCount, lineHeight);
      push(lt, rt);
      push(lb, rb);
    }
    let leftLines = 0;
    let rightLines = 0;
    for (const row of model.rows) {
      if (row.left.kind !== 'filler') {
        leftLines++;
      }
      if (row.right.kind !== 'filler') {
        rightLines++;
      }
    }
    push(leftLines * lineHeight, rightLines * lineHeight);
    this.anchorsLeft = anchorsLeft;
    this.anchorsRight = anchorsRight;
  }

  private onScroll(source: HTMLElement, target: HTMLElement, fromLeft: boolean): void {
    const expected = this.expected.get(source);
    if (expected !== undefined && Math.abs(source.scrollTop - expected) < 1.5) {
      this.expected.delete(source);
      this.onAnyScroll();
      return;
    }
    this.expected.delete(source);
    const mapped = this.map(source.scrollTop, fromLeft);
    if (Math.abs(target.scrollTop - mapped) >= 1) {
      this.setScrollTop(target, mapped);
    }
    this.onAnyScroll();
  }

  private map(y: number, fromLeft: boolean): number {
    const from = fromLeft ? this.anchorsLeft : this.anchorsRight;
    const to = fromLeft ? this.anchorsRight : this.anchorsLeft;
    if (y <= from[0]) {
      return to[0];
    }
    for (let i = 1; i < from.length; i++) {
      if (y <= from[i]) {
        const span = from[i] - from[i - 1];
        const t = span === 0 ? 1 : (y - from[i - 1]) / span;
        return to[i - 1] + t * (to[i] - to[i - 1]);
      }
    }
    // past the last anchor: continue 1:1
    return to[to.length - 1] + (y - from[from.length - 1]);
  }
}

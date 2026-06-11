import { AlignedDiffModel } from '../diff/model';
import { sideExtent } from './scrollSync';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const GUTTER_WIDTH = 28;

export type ChunkActionKind = 'revertChunk' | 'stageChunk' | 'unstageChunk';

export interface ChunkActionsConfig {
  kinds: ChunkActionKind[];
  onAction: (kind: ChunkActionKind, chunkId: number) => void;
}

const ACTION_GLYPHS: Record<ChunkActionKind, { glyph: string; title: string }> = {
  revertChunk: { glyph: '⟲', title: 'Revert chunk' },
  stageChunk: { glyph: '+', title: 'Stage chunk' },
  unstageChunk: { glyph: '−', title: 'Unstage chunk' },
};

/**
 * SVG layer in the center gutter. The panes scroll independently, so each
 * chunk is drawn as a "genie" band: it hugs the block's real extent on each
 * side (a deleted block tapers from N lines on the left to a thin edge on the
 * right, and vice versa). Redrawn on scroll/resize in viewport coordinates.
 * Per-chunk action buttons (revert/stage/unstage) float over the band.
 */
export class Connectors {
  private model: AlignedDiffModel | undefined;
  private gutter: HTMLElement | undefined;
  private leftPane: HTMLElement | undefined;
  private rightPane: HTMLElement | undefined;
  private svg: SVGSVGElement | undefined;
  private actionsLayer: HTMLElement | undefined;
  private actions: ChunkActionsConfig | undefined;
  private lineHeight = 18;
  private activeChunk = -1;
  private rafPending = false;
  private readonly observer = new ResizeObserver(() => this.schedule());

  attach(
    gutter: HTMLElement,
    leftPane: HTMLElement,
    rightPane: HTMLElement,
    model: AlignedDiffModel,
    lineHeight: number,
    actions: ChunkActionsConfig | undefined
  ): void {
    this.gutter = gutter;
    this.leftPane = leftPane;
    this.rightPane = rightPane;
    this.model = model;
    this.lineHeight = lineHeight;
    this.actions = actions;

    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('connector-layer');
    this.actionsLayer = document.createElement('div');
    this.actionsLayer.className = 'actions-layer';
    gutter.textContent = '';
    gutter.append(this.svg, this.actionsLayer);

    this.observer.disconnect();
    this.observer.observe(gutter);
    this.schedule();
  }

  setActiveChunk(chunkId: number): void {
    this.activeChunk = chunkId;
    this.schedule();
  }

  schedule(): void {
    if (this.rafPending) {
      return;
    }
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.redraw();
    });
  }

  private redraw(): void {
    if (!this.svg || !this.gutter || !this.model || !this.leftPane || !this.rightPane) {
      return;
    }
    const height = this.gutter.clientHeight;
    this.svg.setAttribute('width', String(GUTTER_WIDTH));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('viewBox', `0 0 ${GUTTER_WIDTH} ${height}`);
    this.svg.textContent = '';
    if (this.actionsLayer) {
      this.actionsLayer.textContent = '';
    }

    const leftScroll = this.leftPane.scrollTop;
    const rightScroll = this.rightPane.scrollTop;

    for (const chunk of this.model.chunks) {
      let [lt, lb] = sideExtent(chunk.leftStart, chunk.leftCount, this.lineHeight);
      let [rt, rb] = sideExtent(chunk.rightStart, chunk.rightCount, this.lineHeight);
      lt -= leftScroll;
      lb -= leftScroll;
      rt -= rightScroll;
      rb -= rightScroll;
      // give zero-height sides a visible thin edge
      if (lb - lt < 2) {
        lt -= 1;
        lb += 1;
      }
      if (rb - rt < 2) {
        rt -= 1;
        rb += 1;
      }
      if ((lb < 0 && rb < 0) || (lt > height && rt > height)) {
        continue;
      }
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', geniePath(lt, lb, rt, rb));
      path.classList.add('connector', chunk.kind);
      if (chunk.id === this.activeChunk) {
        path.classList.add('active');
      }
      this.svg.appendChild(path);
      this.renderActions(chunk.id, (lt + lb + rt + rb) / 4, height);
    }
  }

  private renderActions(chunkId: number, midY: number, height: number): void {
    if (!this.actions || !this.actionsLayer || this.actions.kinds.length === 0) {
      return;
    }
    if (midY < 0 || midY > height) {
      return;
    }
    const group = document.createElement('div');
    group.className = 'chunk-actions';
    group.style.top = `${Math.round(midY - 8)}px`;
    for (const kind of this.actions.kinds) {
      const { glyph, title } = ACTION_GLYPHS[kind];
      const button = document.createElement('button');
      button.className = `chunk-btn ${kind}`;
      button.textContent = glyph;
      button.title = title;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.actions?.onAction(kind, chunkId);
      });
      group.appendChild(button);
    }
    this.actionsLayer.appendChild(group);
  }
}

function geniePath(lt: number, lb: number, rt: number, rb: number): string {
  const w = GUTTER_WIDTH;
  const c1 = w * 0.45;
  const c2 = w * 0.55;
  return [
    `M 0 ${lt}`,
    `C ${c1} ${lt}, ${c2} ${rt}, ${w} ${rt}`,
    `L ${w} ${rb}`,
    `C ${c2} ${rb}, ${c1} ${lb}, 0 ${lb}`,
    'Z',
  ].join(' ');
}

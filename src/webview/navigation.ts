import { AlignedDiffModel, DiffChunk } from '../diff/model';

/** Tracks the current chunk and applies focus highlight + scroll. */
export class Navigation {
  private current = -1;
  private model: AlignedDiffModel | undefined;

  constructor(
    private readonly onChange: (current: number, total: number) => void,
    private readonly scrollTo: (chunk: DiffChunk) => void
  ) {}

  setModel(model: AlignedDiffModel): void {
    this.model = model;
    if (model.chunks.length === 0) {
      this.current = -1;
    } else if (this.current >= model.chunks.length) {
      this.current = model.chunks.length - 1;
    }
    this.applyHighlight(false);
  }

  next(): void {
    this.move(1);
  }

  prev(): void {
    this.move(-1);
  }

  private move(delta: number): void {
    const total = this.model?.chunks.length ?? 0;
    if (total === 0) {
      return;
    }
    this.current =
      this.current === -1
        ? delta > 0
          ? 0
          : total - 1
        : (this.current + delta + total) % total;
    this.applyHighlight(true);
  }

  private applyHighlight(scroll: boolean): void {
    document
      .querySelectorAll('.line.active-chunk')
      .forEach((line) => line.classList.remove('active-chunk'));
    this.onChange(this.current, this.model?.chunks.length ?? 0);
    if (this.current < 0 || !this.model) {
      return;
    }
    document
      .querySelectorAll(`.line[data-chunk="${this.current}"]`)
      .forEach((line) => line.classList.add('active-chunk'));
    if (scroll) {
      this.scrollTo(this.model.chunks[this.current]);
    }
  }
}

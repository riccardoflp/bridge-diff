import { AlignedDiffModel } from '../diff/model';

/**
 * Tracks the current chunk index; all side effects (decorations, counter,
 * connectors, scrolling) are applied by the onChange callback in main.ts.
 */
export class Navigation {
  private current = -1;
  private total = 0;

  constructor(
    private readonly onChange: (current: number, total: number, scroll: boolean) => void
  ) {}

  setModel(model: AlignedDiffModel): void {
    this.total = model.chunks.length;
    if (this.total === 0) {
      this.current = -1;
    } else if (this.current >= this.total) {
      this.current = this.total - 1;
    }
    this.onChange(this.current, this.total, false);
  }

  next(): void {
    this.move(1);
  }

  prev(): void {
    this.move(-1);
  }

  private move(delta: number): void {
    if (this.total === 0) {
      return;
    }
    this.current =
      this.current === -1
        ? delta > 0
          ? 0
          : this.total - 1
        : (this.current + delta + this.total) % this.total;
    this.onChange(this.current, this.total, true);
  }
}

/**
 * Staged-chunk detection for HEAD↔worktree models.
 * No `vscode` import — unit-testable with plain node.
 *
 * A chunk is staged when the index agrees with the worktree on the chunk's
 * region: staging copies worktree content into the index, so once a chunk is
 * staged no index↔worktree difference touches its lines anymore. Partially
 * staged chunks still differ there and stay unmarked.
 */
import { diffLines } from 'diff';
import { AlignedDiffModel } from './model';

/**
 * Closed interval on (fractional) worktree line numbers. Zero-length spans —
 * pure deletions — sit on the boundary *after* their anchor line (n + 0.5),
 * so two deletions at the same spot intersect while adjacent insertions on
 * whole lines do not.
 */
type Span = [lo: number, hi: number];

export function markStagedChunks(
  model: AlignedDiffModel,
  indexText: string | undefined,
  worktreeText: string
): void {
  if (indexText === undefined) {
    return; // nothing in the index (untracked file): every chunk is unstaged
  }
  const dirty = indexWorktreeSpans(indexText, worktreeText);
  for (const chunk of model.chunks) {
    const span = chunkSpan(chunk.rightStart, chunk.rightCount);
    chunk.staged = !dirty.some((d) => overlaps(span, d));
  }
}

/** Worktree-side spans of every index↔worktree difference. */
function indexWorktreeSpans(indexText: string, worktreeText: string): Span[] {
  const parts = diffLines(normalizeEol(indexText), normalizeEol(worktreeText));
  const spans: Span[] = [];
  let line = 1; // current worktree (new side) line
  for (const part of parts) {
    const count = part.count ?? 0;
    if (part.added) {
      spans.push([line, line + count - 1]);
      line += count;
    } else if (part.removed) {
      // lines present in the index but not the worktree: boundary before `line`
      spans.push([line - 0.5, line - 0.5]);
    } else {
      line += count;
    }
  }
  return spans;
}

function chunkSpan(start: number, count: number): Span {
  // hunk-header convention: count 0 anchors on the line *before* the change
  return count > 0 ? [start, start + count - 1] : [start + 0.5, start + 0.5];
}

function overlaps(a: Span, b: Span): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/** Same display-only normalization as computeDiff. */
function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

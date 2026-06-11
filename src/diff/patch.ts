/**
 * Synthesizes a minimal unified-diff patch for a single chunk, suitable for
 * `git apply --cached --unidiff-zero` (zero context lines: the hunk header
 * coordinates in the model are authoritative).
 * Pure module (no `vscode` import) — unit-tested with `node --test`.
 */
import { AlignedDiffModel, DiffChunk } from './model';

export function synthesizeChunkPatch(
  repoRelativePath: string,
  model: AlignedDiffModel,
  chunk: DiffChunk
): string {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  for (let i = chunk.rowStart; i < chunk.rowEnd; i++) {
    const row = model.rows[i];
    if (row.left.kind !== 'filler' && row.left.text !== undefined) {
      oldLines.push(row.left.text);
    }
    if (row.right.kind !== 'filler' && row.right.text !== undefined) {
      newLines.push(row.right.text);
    }
  }
  const p = repoRelativePath.replace(/\\/g, '/');
  const lines = [
    `diff --git a/${p} b/${p}`,
    `--- a/${p}`,
    `+++ b/${p}`,
    `@@ -${chunk.leftStart},${chunk.leftCount} +${chunk.rightStart},${chunk.rightCount} @@`,
    ...oldLines.map((l) => `-${l}`),
    ...newLines.map((l) => `+${l}`),
  ];
  return lines.join('\n') + '\n';
}

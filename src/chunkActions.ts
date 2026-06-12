import * as path from 'path';
import * as vscode from 'vscode';
import { AlignedDiffModel, DiffChunk } from './diff/model';
import { synthesizeChunkPatch } from './diff/patch';
import { refreshPanel } from './diffBuilder';
import { applyPatchToIndex } from './git/gitCli';
import { GitService } from './git/gitService';
import { DiffPanel } from './panel/diffPanel';

export type ChunkActionKind = 'revertChunk' | 'stageChunk' | 'unstageChunk';

/** Host-side handlers for the per-chunk gutter buttons. */
export class ChunkActions {
  constructor(private readonly git: GitService) {}

  async handle(panel: DiffPanel, action: ChunkActionKind, chunkId: number): Promise<void> {
    const model = panel.currentModel;
    const chunk = model?.chunks.find((c) => c.id === chunkId);
    if (!model || !chunk) {
      return;
    }
    try {
      switch (action) {
        case 'revertChunk':
          await this.revertChunk(panel, model, chunk);
          break;
        case 'stageChunk':
          await this.stageChunk(panel, model, chunk);
          break;
        case 'unstageChunk':
          await this.applyToIndex(panel, model, chunk, true);
          break;
      }
      await refreshPanel(this.git, panel);
    } catch (error) {
      void vscode.window.showWarningMessage(
        `Flow Diff: ${actionLabel(action)} failed — ${String((error as Error).message ?? error)}`
      );
    }
  }

  /** Restores the HEAD version of the chunk in the working tree (undoable edit + save). */
  private async revertChunk(
    panel: DiffPanel,
    model: AlignedDiffModel,
    chunk: DiffChunk
  ): Promise<void> {
    const uri = panel.descriptor.fileUri;
    const document = await vscode.workspace.openTextDocument(uri);
    if (!rightSideMatches(document, model, chunk)) {
      throw new Error('the file changed since the diff was computed, retry');
    }

    const leftLines = sideLines(model, chunk, 'left');
    const edit = new vscode.WorkspaceEdit();
    if (chunk.rightCount > 0) {
      const startLine = chunk.rightStart - 1;
      const endLineExclusive = startLine + chunk.rightCount;
      if (endLineExclusive < document.lineCount) {
        edit.replace(
          uri,
          new vscode.Range(startLine, 0, endLineExclusive, 0),
          leftLines.map((l) => l + '\n').join('')
        );
      } else {
        // chunk reaches a final line without trailing newline
        const lastLine = document.lineCount - 1;
        edit.replace(
          uri,
          new vscode.Range(startLine, 0, lastLine, document.lineAt(lastLine).text.length),
          leftLines.join('\n')
        );
      }
    } else {
      // pure deletion: re-insert the HEAD lines (rightStart = line before, 1-based)
      if (chunk.rightStart < document.lineCount) {
        edit.insert(uri, new vscode.Position(chunk.rightStart, 0), leftLines.join('\n') + '\n');
      } else {
        const lastLine = document.lineCount - 1;
        edit.insert(
          uri,
          new vscode.Position(lastLine, document.lineAt(lastLine).text.length),
          '\n' + leftLines.join('\n')
        );
      }
    }
    if (!(await vscode.workspace.applyEdit(edit))) {
      throw new Error('the edit could not be applied');
    }
    await document.save();
  }

  private async stageChunk(
    panel: DiffPanel,
    model: AlignedDiffModel,
    chunk: DiffChunk
  ): Promise<void> {
    const repo = await this.git.getRepository(panel.descriptor.fileUri);
    if (!repo) {
      return;
    }
    const head = await this.git.getContent(repo, panel.descriptor.fileUri, { ref: 'HEAD' });
    if (head === undefined) {
      // untracked file: there is no index entry to patch — stage it whole
      await repo.add([panel.descriptor.fileUri.fsPath]);
      return;
    }
    await this.applyToIndex(panel, model, chunk, false);
  }

  private async applyToIndex(
    panel: DiffPanel,
    model: AlignedDiffModel,
    chunk: DiffChunk,
    reverse: boolean
  ): Promise<void> {
    const { repoRoot, fileUri } = panel.descriptor;
    const relative = path.relative(repoRoot, fileUri.fsPath);
    await applyPatchToIndex(repoRoot, synthesizeChunkPatch(relative, model, chunk), reverse);
  }
}

function sideLines(model: AlignedDiffModel, chunk: DiffChunk, side: 'left' | 'right'): string[] {
  const lines: string[] = [];
  for (let i = chunk.rowStart; i < chunk.rowEnd; i++) {
    const cell = side === 'left' ? model.rows[i].left : model.rows[i].right;
    if (cell.kind !== 'filler' && cell.text !== undefined) {
      lines.push(cell.text);
    }
  }
  return lines;
}

/** Race guard: the document must still contain what the model says it does. */
function rightSideMatches(
  document: vscode.TextDocument,
  model: AlignedDiffModel,
  chunk: DiffChunk
): boolean {
  if (chunk.rightCount === 0) {
    return true;
  }
  const expected = sideLines(model, chunk, 'right');
  const startLine = chunk.rightStart - 1;
  if (startLine + chunk.rightCount > document.lineCount) {
    return false;
  }
  for (let j = 0; j < expected.length; j++) {
    if (document.lineAt(startLine + j).text !== expected[j]) {
      return false;
    }
  }
  return true;
}

function actionLabel(action: ChunkActionKind): string {
  switch (action) {
    case 'revertChunk':
      return 'revert chunk';
    case 'stageChunk':
      return 'stage chunk';
    case 'unstageChunk':
      return 'unstage chunk';
  }
}

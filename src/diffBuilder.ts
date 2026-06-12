import * as vscode from 'vscode';
import { computeDiff } from './diff/computeDiff';
import { AlignedDiffModel } from './diff/model';
import { markStagedChunks } from './diff/staged';
import { GitService } from './git/gitService';
import { DiffDescriptor } from './panel/diffPanel';

/** Beyond this many total lines, ask before computing (the diff is O(N·M)). */
const LARGE_FILE_LINES = 100_000;

export interface BuildOptions {
  /** When false (refresh path), guards skip silently instead of prompting. */
  interactive: boolean;
}

/**
 * Builds the aligned diff model for a descriptor, or undefined when the diff
 * cannot/should not be shown (binary file, declined large-file prompt, ...).
 */
export async function buildModel(
  git: GitService,
  descriptor: DiffDescriptor,
  options: BuildOptions
): Promise<AlignedDiffModel | undefined> {
  const repo = await git.getRepository(descriptor.fileUri);
  if (!repo) {
    return undefined;
  }

  const [oldText, newText, indexText] = await Promise.all([
    git.getContent(repo, descriptor.fileUri, { ref: descriptor.leftRef }),
    git.getContent(repo, descriptor.fileUri, descriptor.rightRef ? { ref: descriptor.rightRef } : descriptor.rightSide),
    // worktree views also need the index to mark already-staged chunks
    descriptor.rightSide === 'worktree' && !descriptor.rightRef
      ? git.getContent(repo, descriptor.fileUri, 'index')
      : Promise.resolve(undefined),
  ]);
  // Missing on one side = untracked (no HEAD version) or deleted (no worktree
  // version): diff against empty so the whole file shows as added/removed.
  const left = oldText ?? '';
  const right = newText ?? '';

  if (looksBinary(left) || looksBinary(right)) {
    if (options.interactive) {
      void vscode.window.showWarningMessage('Flow Diff: this file looks binary.');
    }
    return undefined;
  }

  if (options.interactive && countLines(left) + countLines(right) > LARGE_FILE_LINES) {
    const choice = await vscode.window.showWarningMessage(
      'Flow Diff: this file is very large and the diff may be slow. Continue?',
      { modal: true },
      'Continue'
    );
    if (choice !== 'Continue') {
      return undefined;
    }
  }

  const rightLabel = descriptor.rightRef
    ? descriptor.rightRef.slice(0, 9)
    : descriptor.rightSide === 'worktree' ? 'Working Tree' : 'Index';
  const model = computeDiff({
    oldText: left,
    newText: right,
    leftLabel: descriptor.leftRef,
    rightLabel,
    languageId: await detectLanguageId(descriptor.fileUri),
    filePath: vscode.workspace.asRelativePath(descriptor.fileUri),
  });
  if (descriptor.rightSide === 'worktree' && !descriptor.rightRef) {
    markStagedChunks(model, indexText, right);
  }
  return model;
}

/** Recomputes and pushes the model for an existing panel (refresh/post-action path). */
export async function refreshPanel(
  git: GitService,
  panel: { descriptor: DiffDescriptor; setModel(model: AlignedDiffModel): void }
): Promise<void> {
  const model = await buildModel(git, panel.descriptor, { interactive: false });
  if (model) {
    panel.setModel(model);
  }
}

function looksBinary(text: string): boolean {
  return text.includes('\0');
}

function countLines(text: string): number {
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      count++;
    }
  }
  return count;
}

async function detectLanguageId(uri: vscode.Uri): Promise<string> {
  try {
    return (await vscode.workspace.openTextDocument(uri)).languageId;
  } catch {
    return 'plaintext'; // e.g. file deleted from the worktree
  }
}

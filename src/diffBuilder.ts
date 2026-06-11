import * as vscode from 'vscode';
import { computeDiff } from './diff/computeDiff';
import { AlignedDiffModel } from './diff/model';
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

  const [oldText, newText] = await Promise.all([
    git.getContent(repo, descriptor.fileUri, { ref: descriptor.leftRef }),
    git.getContent(repo, descriptor.fileUri, descriptor.rightSide),
  ]);
  // Missing on one side = untracked (no HEAD version) or deleted (no worktree
  // version): diff against empty so the whole file shows as added/removed.
  const left = oldText ?? '';
  const right = newText ?? '';

  if (looksBinary(left) || looksBinary(right)) {
    if (options.interactive) {
      void vscode.window.showWarningMessage('Bridge Diff: this file looks binary.');
    }
    return undefined;
  }

  if (options.interactive && countLines(left) + countLines(right) > LARGE_FILE_LINES) {
    const choice = await vscode.window.showWarningMessage(
      'Bridge Diff: this file is very large and the diff may be slow. Continue?',
      { modal: true },
      'Continue'
    );
    if (choice !== 'Continue') {
      return undefined;
    }
  }

  const rightLabel = descriptor.rightSide === 'worktree' ? 'Working Tree' : 'Index';
  return computeDiff({
    oldText: left,
    newText: right,
    leftLabel: descriptor.leftRef,
    rightLabel,
    languageId: await detectLanguageId(descriptor.fileUri),
    filePath: vscode.workspace.asRelativePath(descriptor.fileUri),
  });
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

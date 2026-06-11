import * as vscode from 'vscode';
import { buildModel } from './diffBuilder';
import { GitService } from './git/gitService';
import { DiffDescriptor } from './panel/diffPanel';
import { PanelRegistry } from './panel/panelRegistry';

export function registerCommands(
  context: vscode.ExtensionContext,
  git: GitService,
  registry: PanelRegistry
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('bridgeDiff.openDiff', (resource?: unknown) =>
      openDiff(git, registry, resource, 'worktree')
    ),
    vscode.commands.registerCommand('bridgeDiff.openDiffStaged', (resource?: unknown) =>
      openDiff(git, registry, resource, 'index')
    ),
    vscode.commands.registerCommand('bridgeDiff.nextChunk', () =>
      registry.getActive()?.navigate('next')
    ),
    vscode.commands.registerCommand('bridgeDiff.prevChunk', () =>
      registry.getActive()?.navigate('prev')
    )
  );
}

async function openDiff(
  git: GitService,
  registry: PanelRegistry,
  resource: unknown,
  rightSide: 'worktree' | 'index'
): Promise<void> {
  const uri = resolveUri(resource);
  if (!uri) {
    void vscode.window.showWarningMessage('Bridge Diff: no file selected.');
    return;
  }
  const repo = await git.getRepository(uri);
  if (!repo) {
    void vscode.window.showWarningMessage('Bridge Diff: file is not part of a git repository.');
    return;
  }

  const descriptor: DiffDescriptor = {
    repoRoot: repo.rootUri.fsPath,
    fileUri: uri,
    leftRef: 'HEAD',
    rightSide,
  };
  const model = await buildModel(git, descriptor, { interactive: true });
  if (!model) {
    return;
  }
  const panel = registry.getOrCreate(descriptor);
  panel.setModel(model);
  panel.reveal();
}

/** Accepts a Uri, an SCM resource state, or nothing (→ active editor). */
function resolveUri(resource: unknown): vscode.Uri | undefined {
  if (resource instanceof vscode.Uri) {
    return resource;
  }
  const state = resource as vscode.SourceControlResourceState | undefined;
  if (state?.resourceUri instanceof vscode.Uri) {
    return state.resourceUri;
  }
  const active = vscode.window.activeTextEditor?.document.uri;
  return active?.scheme === 'file' ? active : undefined;
}

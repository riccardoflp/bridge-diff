import * as path from 'path';
import * as vscode from 'vscode';

/**
 * There is no API to replace the built-in diff editor, so this watches for
 * newly opened git diff tabs (SCM view clicks, "Open Changes", gutter
 * indicators), closes them and opens Bridge Diff on the same file instead.
 * Controlled by the `bridgeDiff.interceptGitOpenChange` setting.
 * (Overriding the `git.openChange` command is not possible: registering an
 * already-registered command id throws and aborts activation.)
 */
export class DiffTakeover implements vscode.Disposable {
  private readonly disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.window.tabGroups.onDidChangeTabs((event) => {
      for (const tab of event.opened) {
        void this.maybeTakeOver(tab);
      }
    });
  }

  private async maybeTakeOver(tab: vscode.Tab): Promise<void> {
    const enabled = vscode.workspace
      .getConfiguration('bridgeDiff')
      .get<boolean>('interceptGitOpenChange', true);
    if (!enabled || !(tab.input instanceof vscode.TabInputTextDiff)) {
      return;
    }
    const { original, modified } = tab.input;
    console.log(
      `[BridgeDiff] tab opened — original: ${original.scheme}://${original.path}?${original.query}  modified: ${modified.scheme}://${modified.path}?${modified.query}`
    );
    const action = this.resolveAction(original, modified);
    if (!action) {
      console.log(`[BridgeDiff] no matching rule for schemes: ${original.scheme} → ${modified.scheme}`);
      return;
    }

    try {
      await vscode.window.tabGroups.close(tab);
    } catch {
      // tab already gone — still open ours
    }
    await action();
  }

  private resolveAction(
    original: vscode.Uri,
    modified: vscode.Uri
  ): (() => Thenable<unknown>) | undefined {
    if (original.scheme === 'git' && modified.scheme === 'file') {
      // unstaged: working tree vs HEAD
      return () => vscode.commands.executeCommand('bridgeDiff.openDiff', modified);
    }
    if (original.scheme === 'git' && modified.scheme === 'git') {
      const leftRef = gitRef(original);
      const rightRef = gitRef(modified);
      if (rightRef === '') {
        // staged: index vs HEAD
        return () =>
          vscode.commands.executeCommand('bridgeDiff.openDiffStaged', vscode.Uri.file(modified.fsPath));
      }
      if (isHistoricalRef(leftRef) && isHistoricalRef(rightRef)) {
        // Source Control Graph / GitLens commit history: commit A vs commit B (read-only)
        return () =>
          vscode.commands.executeCommand('bridgeDiff.openDiffRefs', {
            fileUri: vscode.Uri.file(modified.fsPath),
            leftRef,
            rightRef,
          });
      }
    }
    if (original.scheme === 'gitlens' && modified.scheme === 'gitlens') {
      // GitLens file-history: commit A vs commit B (read-only)
      const orig = parseGitLensUri(original);
      const mod = parseGitLensUri(modified);
      if (orig && mod) {
        return () =>
          vscode.commands.executeCommand('bridgeDiff.openDiffRefs', {
            fileUri: orig.fileUri,
            leftRef: orig.ref,
            rightRef: mod.ref,
          });
      }
    }
    if (original.scheme === 'gitlens' && modified.scheme === 'file') {
      // GitLens "open changes with...": historical commit vs working tree
      const orig = parseGitLensUri(original);
      if (orig) {
        return () =>
          vscode.commands.executeCommand('bridgeDiff.openDiffRefs', {
            fileUri: modified,
            leftRef: orig.ref,
          });
      }
    }
    return undefined;
  }

  dispose(): void {
    this.disposable.dispose();
  }
}

/**
 * True for refs that name a commit ('HEAD', a SHA, a branch) as opposed to the
 * index ('') or the working tree ('~') in git:// uri queries.
 */
function isHistoricalRef(ref: string | undefined): ref is string {
  return ref !== undefined && ref !== '' && ref !== '~';
}

function gitRef(uri: vscode.Uri): string | undefined {
  try {
    return (JSON.parse(uri.query) as { ref?: string }).ref;
  } catch {
    return undefined;
  }
}

interface GitLensUriData {
  ref: string;
  fileUri: vscode.Uri;
}

interface GitLensMetadata {
  ref?: string | { sha?: string };
  repoPath?: string;
  /** Field name differs across GitLens versions. */
  path?: string;
  fileName?: string;
}

/**
 * Tries to extract the commit ref and file uri from a gitlens:// revision URI.
 * Modern GitLens (v12+) hex-encodes a `{ ref, repoPath }` JSON blob into the
 * uri *authority* and carries the absolute file path in the uri path; older
 * versions used a JSON *query* with a repo-relative path instead. Returns
 * undefined if neither format matches.
 */
function parseGitLensUri(uri: vscode.Uri): GitLensUriData | undefined {
  const fromAuthority = parseMetadata(Buffer.from(uri.authority, 'hex').toString('utf8'));
  const authorityRef = fromAuthority && metadataRef(fromAuthority);
  if (authorityRef) {
    return { ref: authorityRef, fileUri: vscode.Uri.file(uri.path) };
  }

  const fromQuery = parseMetadata(uri.query);
  const queryRef = fromQuery && metadataRef(fromQuery);
  const filePath = fromQuery?.path ?? fromQuery?.fileName;
  if (queryRef && fromQuery.repoPath && filePath) {
    return { ref: queryRef, fileUri: vscode.Uri.file(path.join(fromQuery.repoPath, filePath)) };
  }
  return undefined;
}

function parseMetadata(raw: string): GitLensMetadata | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as GitLensMetadata) : undefined;
  } catch {
    return undefined;
  }
}

/** '~' marks the working tree in GitLens uris — not a commit, so excluded. */
function metadataRef(metadata: GitLensMetadata): string | undefined {
  if (typeof metadata.ref === 'string' && metadata.ref !== '~' && metadata.ref !== '') {
    return metadata.ref;
  }
  if (typeof metadata.ref === 'object' && metadata.ref?.sha) {
    return metadata.ref.sha;
  }
  return undefined;
}

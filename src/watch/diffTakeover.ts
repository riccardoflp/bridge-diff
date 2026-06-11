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

    let command: string | undefined;
    let fileUri: vscode.Uri | undefined;
    if (original.scheme === 'git' && modified.scheme === 'file') {
      // working tree vs HEAD (unstaged change)
      command = 'bridgeDiff.openDiff';
      fileUri = modified;
    } else if (original.scheme === 'git' && modified.scheme === 'git' && gitRef(modified) === '') {
      // index vs HEAD (staged change): the git uri path is the real file path
      command = 'bridgeDiff.openDiffStaged';
      fileUri = vscode.Uri.file(modified.fsPath);
    }
    if (!command || !fileUri) {
      return;
    }

    try {
      await vscode.window.tabGroups.close(tab);
    } catch {
      // tab already gone — still open ours
    }
    await vscode.commands.executeCommand(command, fileUri);
  }

  dispose(): void {
    this.disposable.dispose();
  }
}

function gitRef(uri: vscode.Uri): string | undefined {
  try {
    return (JSON.parse(uri.query) as { ref?: string }).ref;
  } catch {
    return undefined;
  }
}

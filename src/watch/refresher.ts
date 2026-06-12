import * as vscode from 'vscode';
import { refreshPanel } from '../diffBuilder';
import { Repository } from '../git/api';
import { GitService } from '../git/gitService';
import { PanelRegistry } from '../panel/panelRegistry';

const DEBOUNCE_MS = 250;

/**
 * Keeps open diff panels in sync with the working tree / index, and maintains
 * the `flowDiff.activeFileHasChanges` context key for the editor-title button.
 */
export class Refresher implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly git: GitService,
    private readonly registry: PanelRegistry
  ) {}

  async init(): Promise<void> {
    const api = await this.git.getApi();
    const hookRepo = (repo: Repository) =>
      this.disposables.push(repo.state.onDidChange(() => this.schedule()));

    api.repositories.forEach(hookRepo);
    this.disposables.push(
      api.onDidOpenRepository(hookRepo),
      vscode.workspace.onDidSaveTextDocument(() => this.schedule()),
      // live diff while typing (incl. echoes of webview edits): only for files
      // that actually have an open diff panel
      vscode.workspace.onDidChangeTextDocument((event) => {
        const changed = event.document.uri.toString();
        if (
          this.registry.all().some((panel) => panel.descriptor.fileUri.toString() === changed)
        ) {
          this.schedule();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => void this.updateContextKey())
    );
    void this.updateContextKey();
  }

  private schedule(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => void this.run(), DEBOUNCE_MS);
  }

  private async run(): Promise<void> {
    void this.updateContextKey();
    for (const panel of this.registry.all()) {
      await refreshPanel(this.git, panel);
    }
  }

  private async updateContextKey(): Promise<void> {
    const uri = vscode.window.activeTextEditor?.document.uri;
    let hasChanges = false;
    if (uri?.scheme === 'file') {
      const repo = await this.git.getRepository(uri);
      if (repo) {
        hasChanges = this.git.hasChanges(repo, uri);
      }
    }
    void vscode.commands.executeCommand('setContext', 'flowDiff.activeFileHasChanges', hasChanges);
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.disposables.forEach((d) => d.dispose());
  }
}

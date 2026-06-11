import * as path from 'path';
import * as vscode from 'vscode';
import { AlignedDiffModel } from '../diff/model';
import { HostMessage, WebviewMessage } from '../diff/protocol';
import { ThemeService } from '../theme/themeService';

export interface DiffDescriptor {
  repoRoot: string;
  fileUri: vscode.Uri;
  /** Left side of the comparison, e.g. 'HEAD' or a branch/commit. */
  leftRef: string;
  /** Right side: the live file or the staged copy. */
  rightSide: 'worktree' | 'index';
}

export function diffKey(d: DiffDescriptor): string {
  return [d.repoRoot, d.fileUri.toString(), d.leftRef, d.rightSide].join('|');
}

export class DiffPanel {
  static readonly viewType = 'bridgeDiff.panel';

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private model: AlignedDiffModel | undefined;
  private webviewReady = false;
  private initSent = false;

  constructor(
    extensionUri: vscode.Uri,
    readonly descriptor: DiffDescriptor,
    private readonly themes: ThemeService,
    onDispose: () => void
  ) {
    const fileName = path.basename(descriptor.fileUri.fsPath);
    const rightLabel = descriptor.rightSide === 'worktree' ? 'Working Tree' : 'Index';
    this.panel = vscode.window.createWebviewPanel(
      DiffPanel.viewType,
      `${fileName} (${descriptor.leftRef} ↔ ${rightLabel})`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webview')],
      }
    );
    this.panel.webview.html = this.renderHtml(extensionUri);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.onMessage(message),
      undefined,
      this.disposables
    );
    this.panel.onDidDispose(
      () => {
        this.disposables.forEach((d) => d.dispose());
        onDispose();
      },
      undefined,
      this.disposables
    );
  }

  get active(): boolean {
    return this.panel.active;
  }

  reveal(): void {
    this.panel.reveal();
  }

  setModel(model: AlignedDiffModel): void {
    this.model = model;
    if (!this.webviewReady) {
      return;
    }
    if (this.initSent) {
      this.post({ type: 'update', model });
    } else {
      void this.sendInit();
    }
  }

  /** Pushes a theme change to an already-initialized webview. */
  async refreshTheme(): Promise<void> {
    if (this.initSent) {
      this.post({ type: 'theme', syntaxTheme: await this.themes.resolveActive() });
    }
  }

  navigate(direction: 'next' | 'prev'): void {
    this.post({ type: 'navigate', direction });
  }

  private async sendInit(): Promise<void> {
    if (this.initSent || !this.model) {
      return;
    }
    this.initSent = true;
    this.post({
      type: 'init',
      model: this.model,
      settings: { wrap: false },
      syntaxTheme: await this.themes.resolveActive(),
    });
  }

  private onMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready':
        this.webviewReady = true;
        void this.sendInit();
        break;
      case 'openAt': {
        const line = Math.max(0, message.line - 1);
        void vscode.window.showTextDocument(this.descriptor.fileUri, {
          selection: new vscode.Range(line, 0, line, 0),
          preview: false,
        });
        break;
      }
      case 'currentChunkChanged':
        // Reserved: could mirror "n of m" into the panel title.
        break;
    }
  }

  private post(message: HostMessage): void {
    void this.panel.webview.postMessage(message);
  }

  private renderHtml(extensionUri: vscode.Uri): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'main.css')
    );
    const nonce = makeNonce();
    // script-src includes cspSource so the module entry can import() its
    // esbuild-split chunks (lazy shiki grammars/themes).
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <div id="app"></div>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

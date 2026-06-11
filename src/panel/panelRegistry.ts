import * as vscode from 'vscode';
import { ThemeService } from '../theme/themeService';
import { DiffDescriptor, DiffPanel, diffKey } from './diffPanel';

/** Dedupes panels per (repo, file, refs): re-invoking reveals instead of stacking. */
export class PanelRegistry implements vscode.Disposable {
  private readonly panels = new Map<string, DiffPanel>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly themes: ThemeService
  ) {}

  getOrCreate(descriptor: DiffDescriptor): DiffPanel {
    const key = diffKey(descriptor);
    let panel = this.panels.get(key);
    if (!panel) {
      panel = new DiffPanel(this.extensionUri, descriptor, this.themes, () =>
        this.panels.delete(key)
      );
      this.panels.set(key, panel);
    }
    return panel;
  }

  getActive(): DiffPanel | undefined {
    for (const panel of this.panels.values()) {
      if (panel.active) {
        return panel;
      }
    }
    return undefined;
  }

  all(): DiffPanel[] {
    return [...this.panels.values()];
  }

  dispose(): void {
    // Panels dispose themselves via onDidDispose; nothing held beyond the map.
    this.panels.clear();
  }
}

import * as vscode from 'vscode';
import { API, GitExtension, Repository } from './api';

/** Which version of a file to read. */
export type DiffSide = 'worktree' | 'index' | { ref: string };

export class GitService {
  private api: API | undefined;

  async getApi(): Promise<API> {
    if (!this.api) {
      const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
      if (!extension) {
        throw new Error('Built-in git extension not available');
      }
      const gitExtension = extension.isActive ? extension.exports : await extension.activate();
      this.api = gitExtension.getAPI(1);
    }
    return this.api;
  }

  async getRepository(uri: vscode.Uri): Promise<Repository | undefined> {
    const api = await this.getApi();
    return api.getRepository(uri) ?? undefined;
  }

  /**
   * Content of `uri` at the given side, or undefined when the file does not
   * exist there (untracked at a ref, deleted in the worktree, ...).
   * Worktree reads prefer the open document so unsaved edits are diffed too.
   */
  async getContent(repo: Repository, uri: vscode.Uri, side: DiffSide): Promise<string | undefined> {
    if (side === 'worktree') {
      const open = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === uri.toString()
      );
      if (open) {
        return open.getText();
      }
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(bytes).toString('utf8');
      } catch {
        return undefined;
      }
    }

    // `repo.show('', path)` reads from the index (`git show :path`).
    const ref = side === 'index' ? '' : side.ref;
    try {
      return await repo.show(ref, uri.fsPath);
    } catch {
      return undefined;
    }
  }

  /** True when the file appears among the repo's working tree or index changes. */
  hasChanges(repo: Repository, uri: vscode.Uri): boolean {
    const all = [...repo.state.workingTreeChanges, ...repo.state.indexChanges];
    return all.some((change) => change.uri.fsPath === uri.fsPath);
  }
}

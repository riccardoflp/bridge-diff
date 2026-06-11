/**
 * Message protocol between the extension host and the webview.
 * Must stay free of `vscode` imports (bundled into the webview).
 */
import { AlignedDiffModel } from './model';

export interface DiffSettings {
  wrap: boolean;
  /** Drives which chunk actions the webview offers (revert/stage vs unstage vs none). */
  rightSide: 'worktree' | 'index' | 'ref';
}

/** The user's active color theme, resolved host-side and loadable by shiki. */
export interface SyntaxTheme {
  name: string;
  type: 'dark' | 'light';
  /** Raw VS Code theme JSON (includes already merged). */
  raw: Record<string, unknown>;
}

/** extension → webview */
export type HostMessage =
  | { type: 'init'; model: AlignedDiffModel; settings: DiffSettings; syntaxTheme?: SyntaxTheme }
  | { type: 'update'; model: AlignedDiffModel }
  | { type: 'navigate'; direction: 'next' | 'prev' }
  | { type: 'theme'; syntaxTheme?: SyntaxTheme };

/** webview → extension */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'currentChunkChanged'; chunkId: number }
  | { type: 'openAt'; side: 'left' | 'right'; line: number }
  | { type: 'revertChunk'; chunkId: number }
  | { type: 'stageChunk'; chunkId: number }
  | { type: 'unstageChunk'; chunkId: number }
  /** Full right-side text after an in-place edit (LF line endings). */
  | { type: 'edit'; text: string }
  | { type: 'saveFile' };

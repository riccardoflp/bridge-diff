import { AlignedDiffModel, DiffChunk } from '../diff/model';
import { DiffSettings, HostMessage, WebviewMessage } from '../diff/protocol';
import { ChunkActionsConfig, Connectors } from './connectors';
import { setSyntaxTheme, tokenizeFile } from './highlight';
import { Navigation } from './navigation';
import { RenderedView, applySyntaxTokens, render, sideText } from './render';
import { ScrollSync, sideExtent } from './scrollSync';
import './styles.css';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscodeApi = acquireVsCodeApi();
const root = document.getElementById('app') as HTMLElement;
const connectors = new Connectors();
const scrollSync = new ScrollSync(() => connectors.schedule());

let model: AlignedDiffModel | undefined;
let view: RenderedView | undefined;
let settings: DiffSettings | undefined;
let lineHeight = 18;
let themeLoaded: Promise<void> = Promise.resolve();
let highlightRequest = 0;

const toolbar = createToolbar();
const navigation = new Navigation((current, total) => {
  toolbar.counter.textContent =
    total === 0 ? 'No changes' : `${current >= 0 ? current + 1 : '–'} / ${total}`;
  connectors.setActiveChunk(current);
  if (current >= 0) {
    post({ type: 'currentChunkChanged', chunkId: current });
  }
}, scrollToChunk);

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data as HostMessage;
  switch (message.type) {
    case 'init':
      settings = message.settings;
      themeLoaded = setSyntaxTheme(message.syntaxTheme);
      apply(message.model, false);
      void highlight();
      break;
    case 'update':
      apply(message.model, true);
      void highlight();
      break;
    case 'navigate':
      if (message.direction === 'next') {
        navigation.next();
      } else {
        navigation.prev();
      }
      break;
    case 'theme':
      themeLoaded = setSyntaxTheme(message.syntaxTheme);
      void highlight();
      break;
  }
});

function apply(next: AlignedDiffModel, preserveScroll: boolean): void {
  const prevLeft = view?.leftPane.scrollTop ?? 0;
  const prevRight = view?.rightPane.scrollTop ?? 0;
  model = next;
  view = render(root, next);
  lineHeight = measureLineHeight(view);
  scrollSync.attach(view.leftPane, view.rightPane, next, lineHeight);
  connectors.attach(view.gutter, view.leftPane, view.rightPane, next, lineHeight, chunkActions());
  navigation.setModel(next);
  if (preserveScroll) {
    scrollSync.setScrollTop(view.leftPane, prevLeft);
    scrollSync.setScrollTop(view.rightPane, prevRight);
  }
  wireOpenAt(view, next);
}

/** Worktree diffs offer revert + stage per chunk; index diffs offer unstage. */
function chunkActions(): ChunkActionsConfig | undefined {
  if (!settings) {
    return undefined;
  }
  const kinds: ChunkActionsConfig['kinds'] =
    settings.rightSide === 'worktree' ? ['revertChunk', 'stageChunk'] : ['unstageChunk'];
  return {
    kinds,
    onAction: (kind, chunkId) => post({ type: kind, chunkId }),
  };
}

function measureLineHeight(current: RenderedView): number {
  const probe =
    current.leftPane.querySelector('.line') ?? current.rightPane.querySelector('.line');
  const height = probe?.getBoundingClientRect().height ?? 0;
  return height > 1 ? height : 18;
}

/** Progressive enhancement: plain text renders instantly, tokens land async. */
async function highlight(): Promise<void> {
  if (!model || !view) {
    return;
  }
  const requestId = ++highlightRequest;
  await themeLoaded;
  const current = model;
  const [leftTokens, rightTokens] = await Promise.all([
    tokenizeFile(sideText(current, 'left'), current.languageId),
    tokenizeFile(sideText(current, 'right'), current.languageId),
  ]);
  if (requestId !== highlightRequest || model !== current || !view) {
    return;
  }
  if (leftTokens) {
    applySyntaxTokens(view, current, 'left', leftTokens);
  }
  if (rightTokens) {
    applySyntaxTokens(view, current, 'right', rightTokens);
  }
}

function scrollToChunk(chunk: DiffChunk): void {
  if (!view) {
    return;
  }
  const [lt, lb] = sideExtent(chunk.leftStart, chunk.leftCount, lineHeight);
  const [rt, rb] = sideExtent(chunk.rightStart, chunk.rightCount, lineHeight);
  centerOn(view.leftPane, (lt + lb) / 2);
  centerOn(view.rightPane, (rt + rb) / 2);
  connectors.schedule();
}

function centerOn(pane: HTMLElement, y: number): void {
  scrollSync.setScrollTop(pane, y - pane.clientHeight / 2);
}

function wireOpenAt(current: RenderedView, m: AlignedDiffModel): void {
  const handler = (side: 'left' | 'right') => (event: MouseEvent) => {
    const lineEl = (event.target as HTMLElement).closest('.line') as HTMLElement | null;
    if (!lineEl?.dataset.row) {
      return;
    }
    const line = nearestWorktreeLine(m, Number(lineEl.dataset.row));
    post({ type: 'openAt', side, line });
  };
  current.leftPane.addEventListener('dblclick', handler('left'));
  current.rightPane.addEventListener('dblclick', handler('right'));
}

/**
 * The host always opens the worktree file, so map any row (including left-only
 * rows) to the nearest preceding right-side line number.
 */
function nearestWorktreeLine(current: AlignedDiffModel, rowIndex: number): number {
  for (let i = Math.min(rowIndex, current.rows.length - 1); i >= 0; i--) {
    const lineNumber = current.rows[i].right.lineNumber;
    if (lineNumber !== undefined) {
      return lineNumber;
    }
  }
  return 1;
}

function createToolbar(): { element: HTMLElement; counter: HTMLElement } {
  const element = document.createElement('div');
  element.className = 'toolbar';

  const prev = document.createElement('button');
  prev.textContent = '▲';
  prev.title = 'Previous Change (Shift+F7)';
  prev.addEventListener('click', () => navigation.prev());

  const counter = document.createElement('span');
  counter.className = 'counter';
  counter.textContent = '';

  const next = document.createElement('button');
  next.textContent = '▼';
  next.title = 'Next Change (F7)';
  next.addEventListener('click', () => navigation.next());

  element.append(prev, counter, next);
  document.body.appendChild(element);
  return { element, counter };
}

function post(message: WebviewMessage): void {
  vscodeApi.postMessage(message);
}

post({ type: 'ready' });

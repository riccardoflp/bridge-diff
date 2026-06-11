import { createJavaScriptRegexEngine } from '@shikijs/engine-javascript';
import {
  createHighlighterCore,
  type HighlighterCore,
  type ThemedToken,
} from 'shiki/core';
import { SyntaxTheme } from '../diff/protocol';

/**
 * Thin wrapper around shiki: JavaScript regex engine (no WASM, CSP-friendly),
 * languages loaded lazily as esbuild-split chunks, theme = the user's real
 * color theme resolved host-side, with Dark+/Light+ as fallback.
 */

type LangModule = { default: unknown };

/** VS Code languageId → shiki grammar (lazy chunk). */
const LANGS: Record<string, { id: string; load: () => Promise<LangModule> }> = {
  typescript: { id: 'typescript', load: () => import('@shikijs/langs/typescript') },
  typescriptreact: { id: 'tsx', load: () => import('@shikijs/langs/tsx') },
  javascript: { id: 'javascript', load: () => import('@shikijs/langs/javascript') },
  javascriptreact: { id: 'jsx', load: () => import('@shikijs/langs/jsx') },
  json: { id: 'json', load: () => import('@shikijs/langs/json') },
  jsonc: { id: 'jsonc', load: () => import('@shikijs/langs/jsonc') },
  css: { id: 'css', load: () => import('@shikijs/langs/css') },
  scss: { id: 'scss', load: () => import('@shikijs/langs/scss') },
  less: { id: 'less', load: () => import('@shikijs/langs/less') },
  html: { id: 'html', load: () => import('@shikijs/langs/html') },
  vue: { id: 'vue', load: () => import('@shikijs/langs/vue') },
  svelte: { id: 'svelte', load: () => import('@shikijs/langs/svelte') },
  python: { id: 'python', load: () => import('@shikijs/langs/python') },
  java: { id: 'java', load: () => import('@shikijs/langs/java') },
  go: { id: 'go', load: () => import('@shikijs/langs/go') },
  rust: { id: 'rust', load: () => import('@shikijs/langs/rust') },
  c: { id: 'c', load: () => import('@shikijs/langs/c') },
  cpp: { id: 'cpp', load: () => import('@shikijs/langs/cpp') },
  csharp: { id: 'csharp', load: () => import('@shikijs/langs/csharp') },
  php: { id: 'php', load: () => import('@shikijs/langs/php') },
  ruby: { id: 'ruby', load: () => import('@shikijs/langs/ruby') },
  yaml: { id: 'yaml', load: () => import('@shikijs/langs/yaml') },
  xml: { id: 'xml', load: () => import('@shikijs/langs/xml') },
  markdown: { id: 'markdown', load: () => import('@shikijs/langs/markdown') },
  shellscript: { id: 'shellscript', load: () => import('@shikijs/langs/shellscript') },
  powershell: { id: 'powershell', load: () => import('@shikijs/langs/powershell') },
  sql: { id: 'sql', load: () => import('@shikijs/langs/sql') },
  kotlin: { id: 'kotlin', load: () => import('@shikijs/langs/kotlin') },
  swift: { id: 'swift', load: () => import('@shikijs/langs/swift') },
  dart: { id: 'dart', load: () => import('@shikijs/langs/dart') },
  lua: { id: 'lua', load: () => import('@shikijs/langs/lua') },
  toml: { id: 'toml', load: () => import('@shikijs/langs/toml') },
  ini: { id: 'ini', load: () => import('@shikijs/langs/ini') },
  dockerfile: { id: 'dockerfile', load: () => import('@shikijs/langs/dockerfile') },
};

let highlighterPromise: Promise<HighlighterCore> | undefined;
let currentThemeName: string | undefined;
const loadedLangs = new Set<string>();

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}

/** Loads the user's theme (or the Dark+/Light+ fallback) into shiki. */
export async function setSyntaxTheme(theme: SyntaxTheme | undefined): Promise<void> {
  try {
    const highlighter = await getHighlighter();
    if (theme) {
      await highlighter.loadTheme(theme.raw as never);
      currentThemeName = theme.name;
      return;
    }
    const dark = !document.body.classList.contains('vscode-light');
    const fallback = dark
      ? await import('@shikijs/themes/dark-plus')
      : await import('@shikijs/themes/light-plus');
    await highlighter.loadTheme(fallback.default as never);
    currentThemeName = (fallback.default as { name?: string }).name;
  } catch (error) {
    console.warn('bridge-diff: failed to load syntax theme', error);
    currentThemeName = undefined;
  }
}

/**
 * Tokenizes a whole file (multi-line grammar state preserved).
 * Returns undefined for unsupported languages or when no theme is loaded —
 * callers keep the plain-text rendering in that case.
 */
export async function tokenizeFile(
  text: string,
  languageId: string
): Promise<ThemedToken[][] | undefined> {
  const entry = LANGS[languageId];
  if (!entry || !currentThemeName) {
    return undefined;
  }
  try {
    const highlighter = await getHighlighter();
    if (!loadedLangs.has(entry.id)) {
      const grammar = await entry.load();
      await highlighter.loadLanguage(grammar.default as never);
      loadedLangs.add(entry.id);
    }
    return highlighter.codeToTokensBase(text, {
      lang: entry.id as never,
      theme: currentThemeName as never,
    });
  } catch (error) {
    console.warn('bridge-diff: tokenization failed', error);
    return undefined;
  }
}

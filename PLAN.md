# PLAN.md — Bridge Diff

Roadmap di progetto. Stato aggiornato all'11 giugno 2026.

## Visione

Replicare in VS Code l'esperienza diff di WebStorm: side-by-side con connettori
"genie" nel gutter centrale, editing in-place, azioni per chunk, albero delle
modifiche locali e compare-with arbitrario.

## ✅ Fase 1 — Diff viewer (fatto)

- [x] Motore diff puro (jsdiff → `AlignedDiffModel`, word-diff con guard 65%)
- [x] Webview con due pannelli a scroll indipendente, sync piecewise-linear
      ancorato ai chunk (1:1 sul contesto, stretch sui blocchi)
- [x] Connettori SVG genie ridisegnati a ogni scroll (rAF)
- [x] Navigazione chunk: F7 / Shift+F7, toolbar flottante "n / m"
- [x] Entry point: palette, context menu SCM, bottone editor/title (context key
      `bridgeDiff.activeFileHasChanges`), viste worktree-vs-HEAD e index-vs-HEAD
- [x] Refresh live (save, stato git, typing), guard binari e file enormi
- [x] Syntax highlighting col tema reale dell'utente (themeService → shiki)

## ✅ Fase 2 — Azioni (fatto)

- [x] Per chunk nel gutter: revert ⟲ (WorkspaceEdit + save, undoable),
      stage + (`git apply --cached --unidiff-zero`), unstage − (`-R`)
- [x] Patch sintetizzati da `src/diff/patch.ts`, validati round-trip su git reale
- [x] File-level in title bar: Open File, Stage, Unstage, Discard (conferma modale)
- [x] Limite noto: stage chunk può fallire su file già parzialmente staged
      (index ≠ HEAD sulle stesse righe) → warning, nessuna corruzione
- [x] Indicatore "staged" nella vista worktree: `src/diff/staged.ts` confronta
      index↔worktree e marca i chunk già nell'index (`chunk.staged`); resa
      opacizzata (sfondi riga + connettore tratteggiato) e bottone + → −

## ✅ Fase 2.5 — Editing in-place (fatto)

- [x] Pannelli = due editor Monaco; destro editabile nella vista worktree
- [x] Sync live verso il documento (dirty; Ctrl+S nel diff salva)
- [x] Guard `localDirty` contro il clobbering dei tasti in volo
- [x] shikiToMonaco per la tokenizzazione, worker via blob shim

## ✅ Fase 2.6 — Default diff (fatto)

- [x] `watch/diffTakeover.ts`: i tab diff git nativi vengono chiusi e sostituiti
      da Bridge Diff (setting `bridgeDiff.interceptGitOpenChange`, default on)

## 🔲 Fase 3 — Albero "Local Changes"

`TreeDataProvider` su `repo.state.workingTreeChanges` / `indexChanges`,
raggruppato per directory come la tool window Commit di WebStorm; ogni item
invoca `bridgeDiff.openDiff`. Pura aggiunta: `gitService` espone già stato ed
eventi. Decidere: vista dedicata in activity bar vs sezione nella vista SCM.

## 🔲 Fase 4 — Compare with branch / revision

QuickPick su `repo.state.refs` + `repo.log()` → pipeline esistente con
`(ref, worktree)`. `gitService.getContent` è già parametrizzato per ref e la
chiave del registry include già i ref. Nascondere stage/revert quando il lato
destro non è il worktree (flag già in `init.settings`).

## 🔲 Backlog / idee

- [ ] Collapse delle regioni invariate (i connettori bezier sono già pronti
      per geometrie non allineate)
- [ ] Word-wrap opzionale (`settings.wrap` già nel protocollo)
- [ ] "n of m" nel titolo del pannello (`currentChunkChanged` già emesso)
- [ ] Merge conflict 3-way (fase lontana, richiede layout a 3 pannelli)
- [ ] Pubblicazione marketplace: campo `repository` in package.json + remote git

## Verifica standard

F5 → aprire `../bridge-diff-playground` → diff di `sample.ts` (4 chunk: word
edit, insert, delete, blocco 1→3), `untracked.ts` (tutto added), `staged.ts`
(MM: confrontare le due viste). Temi: Osmium, Dark+, Light+, High Contrast.
Unit test: `npm test` (computeDiff + patch).

import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeDiff } from '../diff/computeDiff';
import { synthesizeChunkPatch } from '../diff/patch';

function diff(oldText: string, newText: string) {
  return computeDiff({
    oldText,
    newText,
    leftLabel: 'HEAD',
    rightLabel: 'Working Tree',
    languageId: 'plaintext',
    filePath: 'sample.txt',
  });
}

test('patch for a modified chunk carries hunk header and -/+ lines', () => {
  const model = diff('a\nb\nc\n', 'a\nB\nc\n');
  const patch = synthesizeChunkPatch('dir/sample.txt', model, model.chunks[0]);
  assert.equal(
    patch,
    [
      'diff --git a/dir/sample.txt b/dir/sample.txt',
      '--- a/dir/sample.txt',
      '+++ b/dir/sample.txt',
      '@@ -2,1 +2,1 @@',
      '-b',
      '+B',
      '',
    ].join('\n')
  );
});

test('patch for a pure insertion uses a zero-count old side', () => {
  const model = diff('a\nc\n', 'a\nb\nc\n');
  const patch = synthesizeChunkPatch('sample.txt', model, model.chunks[0]);
  assert.ok(patch.includes('@@ -1,0 +2,1 @@'));
  assert.ok(patch.endsWith('@@ -1,0 +2,1 @@\n+b\n'));
});

test('patch for a pure deletion uses a zero-count new side', () => {
  const model = diff('a\nb\nc\n', 'a\nc\n');
  const patch = synthesizeChunkPatch('sample.txt', model, model.chunks[0]);
  assert.ok(patch.includes('@@ -2,1 +1,0 @@'));
  assert.ok(patch.includes('\n-b\n'));
});

test('windows-style relative paths are normalized to forward slashes', () => {
  const model = diff('a\n', 'b\n');
  const patch = synthesizeChunkPatch('src\\nested\\file.ts', model, model.chunks[0]);
  assert.ok(patch.startsWith('diff --git a/src/nested/file.ts b/src/nested/file.ts'));
});

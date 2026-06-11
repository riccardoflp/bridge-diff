import { spawn } from 'child_process';

/**
 * Hunk-level staging is the one operation the git extension API cannot do
 * (its `apply` only touches the working tree), so this pipes a synthesized
 * patch to `git apply --cached`. `--unidiff-zero` is required because our
 * patches carry no context lines.
 */
export function applyPatchToIndex(
  repoRoot: string,
  patch: string,
  reverse: boolean
): Promise<void> {
  const args = ['apply', '--cached', '--unidiff-zero', '--whitespace=nowarn'];
  if (reverse) {
    args.push('-R');
  }
  args.push('-');
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoRoot });
    let stderr = '';
    child.stderr.on('data', (data) => (stderr += String(data)));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `git apply exited with code ${code}`));
      }
    });
    child.stdin.end(patch);
  });
}

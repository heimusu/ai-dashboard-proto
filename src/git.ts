/** セッションの作業ディレクトリからリポジトリ、worktree、ブランチ、変更数を取得する。 */
import {execFileSync} from 'node:child_process';
import {basename, resolve} from 'node:path';

export interface GitInfo {
  repo: string;
  worktree: string;
  branch: string;
  changedFiles: number;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {cwd, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore']}).trim();
}

export function gitInfo(cwd: string): GitInfo | undefined {
  try {
    const worktree = resolve(git(cwd, ['rev-parse', '--show-toplevel']));
    const worktrees = git(cwd, ['worktree', 'list', '--porcelain']);
    const main = worktrees.match(/^worktree (.+)$/m)?.[1] || worktree;
    let branch = '(detached)';
    try { branch = git(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || branch; } catch { /* detached HEAD */ }
    const changes = git(cwd, ['status', '--porcelain=v1', '--untracked-files=normal']);
    return {repo: basename(main), worktree, branch, changedFiles: changes ? changes.split('\n').length : 0};
  } catch { return undefined; }
}

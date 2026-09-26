/** README の撮影に使う架空のセッションと Git 情報を提供する。 */
import type {GitInfo} from './git.js';
import type {AgentSession} from './model.js';

export type DemoRow = {session: AgentSession; git: GitInfo};

export function demoRows(now = new Date()): DemoRow[] {
  const updatedAt = now.toISOString();
  const make = (
    repo: string, worktree: string, branch: string, provider: AgentSession['provider'],
    sessionId: string, status: AgentSession['status'], task: string, activity: string,
    changedFiles: number,
  ): DemoRow => ({
    session: {provider, sessionId, cwd: `/demo/${repo}/${worktree}`, status, task, activity,
      updatedAt, source: 'observed', lastEvent: 'UserPromptSubmit'},
    git: {repo, worktree, branch, changedFiles},
  });
  return [
    make('maple-web', 'main', 'main', 'claude', 'demo-aa1020', 'running', 'Implement search filters', 'editing filters.ts', 3),
    make('maple-web', 'main', 'main', 'codex', 'demo-bb2030', 'waiting_permission', 'Add API integration tests', 'shell permission', 3),
    make('maple-web', 'main', 'main', 'codex', 'demo-cc3040', 'idle', 'Review accessibility issues', 'awaiting input', 3),
    make('maple-web', 'feat-search', 'feat/search', 'claude', 'demo-dd4050', 'running', 'Optimize result ranking', 'running tests', 5),
    make('northstar-api', 'main', 'main', 'codex', 'demo-ee5060', 'running', 'Refactor user endpoints', 'editing routes.ts', 2),
    make('northstar-api', 'feat-cache', 'feat/cache', 'claude', 'demo-ff6070', 'idle', 'Document cache behavior', 'awaiting input', 1),
  ];
}

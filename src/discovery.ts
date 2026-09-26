/** Claude Code と Codex のローカル履歴から、hook 導入前のセッションを読み取り専用で発見する。 */
import {spawn} from 'node:child_process';
import {createReadStream, existsSync, readdirSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import readline from 'node:readline';
import type {AgentSession} from './model.js';
import {sessionKey, taskPreview} from './model.js';

const DAY = 86_400_000;
type RecordLike = Record<string, unknown>;

export async function discoverClaude(root = join(homedir(), '.claude', 'projects'), since = Date.now() - DAY): Promise<AgentSession[]> {
  const found: AgentSession[] = [];
  if (!existsSync(root)) return found;
  const projects = readdirSync(root, {withFileTypes: true}).filter(entry => entry.isDirectory());
  for (const project of projects) {
    const dir = join(root, project.name);
    for (const file of readdirSync(dir, {withFileTypes: true})) {
      if (!file.isFile() || !file.name.endsWith('.jsonl')) continue;
      const path = join(dir, file.name);
      const stat = statSync(path);
      if (stat.mtimeMs < since) continue;
      let cwd: string | undefined;
      let task: string | undefined;
      let sessionId = file.name.slice(0, -6);
      const lines = readline.createInterface({input: createReadStream(path, {encoding: 'utf8'}), crlfDelay: Infinity});
      try {
        let count = 0;
        for await (const line of lines) {
          if (++count > 80) break;
          try {
            const entry = JSON.parse(line) as RecordLike;
            if (typeof entry.cwd === 'string') cwd = entry.cwd;
            if (typeof entry.sessionId === 'string') sessionId = entry.sessionId;
            if (entry.type === 'user' && entry.isMeta !== true) {
              const message = entry.message as RecordLike | undefined;
              task ||= taskPreview(message?.content);
            }
            if (cwd && task) break;
          } catch { /* skip malformed transcript line */ }
        }
      } finally { lines.close(); }
      if (cwd) found.push({provider: 'claude', sessionId, cwd, task, status: 'unknown', updatedAt: stat.mtime.toISOString(), source: 'discovered'});
    }
  }
  return found;
}

export async function discoverCodex(since = Date.now() - DAY): Promise<AgentSession[]> {
  return new Promise(resolve => {
    const found: AgentSession[] = [];
    let page = 0;
    const child = spawn('codex', ['app-server'], {stdio: ['pipe', 'pipe', 'ignore']});
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      lines.close();
      child.kill();
      resolve(found);
    };
    const timer = setTimeout(finish, 5000);
    const lines = readline.createInterface({input: child.stdout, crlfDelay: Infinity});
    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    child.on('error', finish);
    child.on('exit', finish);
    lines.on('line', line => {
      let message: RecordLike;
      try { message = JSON.parse(line) as RecordLike; } catch { return; }
      if (message.id === 1) {
        if (message.error) return finish();
        send({method: 'initialized'});
        send({id: 2, method: 'thread/list', params: {limit: 100, sortKey: 'updated_at', sortDirection: 'desc'}});
      } else if (message.id === 2) {
        if (message.error) return finish();
        const result = message.result as RecordLike | undefined;
        const data = result?.data;
        let hasRecent = false;
        if (Array.isArray(data)) for (const item of data) {
          if (!item || typeof item !== 'object') continue;
          const thread = item as RecordLike;
          const updatedAt = typeof thread.updatedAt === 'number' ? thread.updatedAt * 1000 : 0;
          if (updatedAt < since) continue;
          hasRecent = true;
          if (typeof thread.id === 'string' && typeof thread.cwd === 'string') {
            found.push({provider: 'codex', sessionId: thread.id, cwd: thread.cwd,
              task: taskPreview(thread.preview), status: 'unknown',
              updatedAt: new Date(updatedAt).toISOString(), source: 'discovered'});
          }
        }
        page++;
        if (hasRecent && typeof result?.nextCursor === 'string' && page < 10) {
          send({id: 2, method: 'thread/list', params: {limit: 100, sortKey: 'updated_at',
            sortDirection: 'desc', cursor: result.nextCursor}});
        } else finish();
      }
    });
    send({id: 1, method: 'initialize', params: {clientInfo: {name: 'agenttop', title: 'agenttop', version: '0.1.0'}}});
  });
}

export async function discoverSessions(): Promise<Map<string, AgentSession>> {
  const found = await Promise.allSettled([discoverClaude(), discoverCodex()]);
  const sessions = new Map<string, AgentSession>();
  for (const result of found) if (result.status === 'fulfilled') for (const session of result.value) {
    sessions.set(sessionKey(session.provider, session.sessionId), session);
  }
  return sessions;
}

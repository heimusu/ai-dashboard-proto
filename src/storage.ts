/** hook イベントを JSONL に保存し、再起動時にイベントを再生してセッション状態を復元する。 */
import {appendFileSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import type {AgentEvent, AgentSession} from './model.js';
import {applyEvent, sessionKey} from './model.js';

export function dataDir(): string {
  return process.env.AGENTTOP_DATA_DIR || join('/tmp', `agenttop-${process.getuid?.() ?? 0}`);
}

export function eventPath(): string { return join(dataDir(), 'events.jsonl'); }

export function appendEvent(event: AgentEvent, path = eventPath()): void {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  appendFileSync(path, `${JSON.stringify(event)}\n`, {mode: 0o600});
}

export function readSessions(path = eventPath()): Map<string, AgentSession> {
  const sessions = new Map<string, AgentSession>();
  let content: string;
  try { content = readFileSync(path, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return sessions; throw error; }
  const lines = content.split('\n');
  for (const line of lines.slice(0, -1)) {
    try {
      const event = JSON.parse(line) as AgentEvent;
      if (!event.id || !event.sessionId || !event.provider || !event.at) continue;
      const key = sessionKey(event.provider, event.sessionId);
      sessions.set(key, applyEvent(sessions.get(key), event));
    } catch { /* a damaged line does not hide later events */ }
  }
  return sessions;
}

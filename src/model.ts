/** provider ごとの hook 入力を共通イベントへ変換し、セッションの表示状態とタスク名を更新する。 */
export type Provider = 'claude' | 'codex';
export type Status = 'running' | 'waiting_permission' | 'idle' | 'ended' | 'unknown';

export interface AgentEvent {
  id: string;
  provider: Provider;
  sessionId: string;
  turnId?: string;
  name: string;
  cwd: string;
  toolName?: string;
  task?: string;
  at: string;
}

export interface AgentSession {
  provider: Provider;
  sessionId: string;
  cwd: string;
  status: Status;
  lastEvent?: string;
  activity?: string;
  task?: string;
  updatedAt: string;
  source: 'observed' | 'discovered';
}

const events = new Set([
  'SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse',
  'PostToolUse', 'PermissionRequest', 'Stop', 'Interrupt', 'StopFailure',
]);

export function taskPreview(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\x1b\[[0-9;]*m/g, '').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  return Array.from(cleaned).slice(0, 160).join('');
}

export function normalizeHook(provider: Provider, raw: unknown, id: string, at = new Date().toISOString()): AgentEvent {
  if (!raw || typeof raw !== 'object') throw new Error('hook input must be an object');
  const value = raw as Record<string, unknown>;
  const name = value.hook_event_name;
  if (typeof name !== 'string' || !events.has(name)) throw new Error('unsupported hook event');
  if (typeof value.session_id !== 'string' || !value.session_id) throw new Error('missing session_id');
  if (typeof value.cwd !== 'string' || !value.cwd) throw new Error('missing cwd');
  const toolName = typeof value.tool_name === 'string' ? value.tool_name : undefined;
  const turnId = typeof value.turn_id === 'string' ? value.turn_id : undefined;
  const task = name === 'UserPromptSubmit' ? taskPreview(value.prompt) : undefined;
  return {id, provider, sessionId: value.session_id, cwd: value.cwd, name, at,
    ...(toolName && {toolName}), ...(turnId && {turnId}), ...(task && {task})};
}

export const sessionKey = (provider: Provider, sessionId: string): string => `${provider}:${sessionId}`;

export function applyEvent(previous: AgentSession | undefined, event: AgentEvent): AgentSession {
  if (previous?.source === 'observed' && previous.updatedAt > event.at) return previous;
  const status: Status = event.name === 'SessionEnd' ? 'ended'
    : event.name === 'Stop' ? 'idle'
    : event.name === 'PermissionRequest' ? 'waiting_permission'
    : event.name === 'Interrupt' ? 'idle'
    : event.name === 'StopFailure' ? 'unknown'
    : 'running';
  const activity = event.name === 'PreToolUse' || event.name === 'PermissionRequest'
    ? event.toolName || event.name
    : event.name === 'PostToolUse' ? 'after tool'
    : event.name === 'StopFailure' ? 'response error'
    : event.name === 'Stop' ? 'awaiting input'
    : event.name === 'SessionEnd' ? 'session ended'
    : event.name === 'UserPromptSubmit' ? 'responding'
    : previous?.activity;
  return {provider: event.provider, sessionId: event.sessionId, cwd: event.cwd, status,
    lastEvent: event.name, activity,
    task: event.task && (event.task.length >= 8 || !previous?.task) ? event.task : previous?.task,
    updatedAt: event.at, source: 'observed'};
}

export function displayedStatus(session: AgentSession, now = Date.now()): Status {
  if (session.source === 'discovered') return 'unknown';
  if (session.status === 'ended' || session.status === 'unknown') return session.status;
  const age = now - Date.parse(session.updatedAt);
  if (age > (session.status === 'idle' ? 60 : 5) * 60_000) return 'unknown';
  return session.status;
}

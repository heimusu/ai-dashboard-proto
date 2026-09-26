/** hook の正規化、タスク名の保持、セッション状態の遷移を検証する。 */
import {describe, expect, it} from 'vitest';
import {applyEvent, displayedStatus, normalizeHook, taskPreview} from '../src/model.js';

describe('hook normalization and session states', () => {
  const event = (name: string, at: string, tool_name?: string) => normalizeHook('codex',
    {hook_event_name: name, session_id: 's1', cwd: '/tmp/repo', tool_name}, `${name}-${at}`, at);

  it('moves through work, permission, idle and end without conflating turn and session', () => {
    let session = applyEvent(undefined, event('SessionStart', '2026-09-26T00:00:00.000Z'));
    session = applyEvent(session, event('PreToolUse', '2026-09-26T00:01:00.000Z', 'Bash'));
    expect(session.status).toBe('running');
    expect(session.activity).toBe('Bash');
    session = applyEvent(session, event('PermissionRequest', '2026-09-26T00:02:00.000Z', 'Bash'));
    expect(session.status).toBe('waiting_permission');
    session = applyEvent(session, event('PostToolUse', '2026-09-26T00:03:00.000Z', 'Bash'));
    expect(session.status).toBe('running');
    session = applyEvent(session, event('Stop', '2026-09-26T00:04:00.000Z'));
    expect(session.status).toBe('idle');
    session = applyEvent(session, event('SessionEnd', '2026-09-26T00:05:00.000Z'));
    expect(session.status).toBe('ended');
  });

  it('treats stale running sessions as unknown and ignores older events', () => {
    const current = applyEvent(undefined, event('Stop', '2026-09-26T00:10:00.000Z'));
    expect(applyEvent(current, event('PreToolUse', '2026-09-26T00:09:00.000Z')).status).toBe('idle');
    const running = applyEvent(undefined, event('PreToolUse', '2026-09-26T00:00:00.000Z'));
    expect(displayedStatus(running, Date.parse('2026-09-26T00:06:00.000Z'))).toBe('unknown');
  });

  it('rejects incomplete hooks', () => {
    expect(() => normalizeHook('claude', {hook_event_name: 'Stop', cwd: '/tmp'}, 'x')).toThrow('session_id');
  });

  it('keeps a task preview across tool events and brief follow-up prompts', () => {
    const prompt = normalizeHook('codex', {hook_event_name: 'UserPromptSubmit', session_id: 's1',
      cwd: '/tmp/repo', prompt: 'Fix the login flow\nfor mobile users'}, 'prompt', '2026-09-26T00:00:00.000Z');
    expect(prompt.task).toBe('Fix the login flow for mobile users');
    let session = applyEvent(undefined, prompt);
    session = applyEvent(session, event('PreToolUse', '2026-09-26T00:01:00.000Z', 'Bash'));
    expect(session.task).toBe('Fix the login flow for mobile users');
    const followUp = normalizeHook('codex', {hook_event_name: 'UserPromptSubmit', session_id: 's1',
      cwd: '/tmp/repo', prompt: 'OK'}, 'follow-up', '2026-09-26T00:02:00.000Z');
    expect(applyEvent(session, followUp).task).toBe('Fix the login flow for mobile users');
    expect(taskPreview('\u001b[31m日本語\nの依頼\u001b[0m')).toBe('日本語 の依頼');
  });
});

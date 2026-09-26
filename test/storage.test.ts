/** イベントの保存先と JSONL の再生が、不完全な行を含んでも機能することを検証する。 */
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, expect, it, vi} from 'vitest';
import {appendEvent, dataDir, readSessions} from '../src/storage.js';
import {normalizeHook} from '../src/model.js';

const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true}); });

it('uses a sandbox-writable shared default and permits an override', () => {
  vi.stubEnv('AGENTTOP_DATA_DIR', '');
  expect(dataDir()).toMatch(/^\/tmp\/agenttop-\d+$/);
  vi.stubEnv('AGENTTOP_DATA_DIR', '/tmp/custom-agenttop');
  expect(dataDir()).toBe('/tmp/custom-agenttop');
});

it('replays complete events and tolerates a damaged line or incomplete tail', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenttop-events-'));
  dirs.push(dir);
  const path = join(dir, 'events.jsonl');
  const raw = (name: string, session_id: string) => ({hook_event_name: name, session_id, cwd: '/tmp/repo'});
  appendEvent(normalizeHook('claude', raw('SessionStart', 'a'), '1', '2026-09-26T00:00:00.000Z'), path);
  writeFileSync(path, 'bad json\n', {flag: 'a'});
  appendEvent(normalizeHook('claude', raw('Stop', 'a'), '2', '2026-09-26T00:01:00.000Z'), path);
  appendEvent(normalizeHook('codex', raw('SessionStart', 'a'), '3', '2026-09-26T00:02:00.000Z'), path);
  writeFileSync(path, '{"partial":', {flag: 'a'});
  const sessions = readSessions(path);
  expect(sessions.get('claude:a')?.status).toBe('idle');
  expect(sessions.get('codex:a')?.status).toBe('running');
});

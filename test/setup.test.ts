/** hook 設定が既存設定を保ち、再実行や CLI の移動にも対応することを検証する。 */
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, expect, it} from 'vitest';
import {rmSync} from 'node:fs';
import {setupHooks} from '../src/setup.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true}); });

it('preserves existing hooks, creates backups and stays idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agenttop-test-'));
  dirs.push(dir);
  const cli = join(dir, 'cli.js');
  const claude = join(dir, 'claude.json');
  const codex = join(dir, 'codex.json');
  writeFileSync(cli, '');
  writeFileSync(claude, JSON.stringify({theme: 'dark', hooks: {Stop: [{hooks: [{type: 'command', command: 'existing'}]}]}}));
  const first = setupHooks({cliPath: cli, claudePath: claude, codexPath: codex});
  expect(first).toEqual(['claude: configured', 'codex: configured']);
  const data = JSON.parse(readFileSync(claude, 'utf8'));
  expect(data.theme).toBe('dark');
  expect(data.hooks.Stop).toHaveLength(2);
  expect(readFileSync(`${claude}.agenttop.bak`, 'utf8')).toContain('existing');
  const second = setupHooks({cliPath: cli, claudePath: claude, codexPath: codex});
  expect(second).toEqual(['claude: already configured', 'codex: already configured']);
  expect(JSON.parse(readFileSync(claude, 'utf8')).hooks.Stop).toHaveLength(2);
  const moved = join(dir, 'moved.js');
  writeFileSync(moved, '');
  expect(setupHooks({cliPath: moved, claudePath: claude, codexPath: codex})).toEqual([
    'claude: configured', 'codex: configured',
  ]);
  const updated = JSON.parse(readFileSync(claude, 'utf8'));
  expect(updated.hooks.Stop).toHaveLength(2);
  expect(updated.hooks.Stop[1].hooks[0].command).toContain(moved);
});

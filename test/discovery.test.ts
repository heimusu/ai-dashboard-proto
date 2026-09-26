/** Claude Code の履歴から、依頼文を含む既存セッションを発見できることを検証する。 */
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, expect, it} from 'vitest';
import {discoverClaude} from '../src/discovery.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true}); });

it('discovers a Claude session and its user task without using tool output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'agenttop-discovery-'));
  dirs.push(root);
  const project = join(root, 'project');
  mkdirSync(project);
  const records = [
    {type: 'attachment', cwd: '/tmp/project', sessionId: 'session-1'},
    {type: 'user', message: {content: [{type: 'tool_result', content: 'secret output'}]}},
    {type: 'user', message: {content: 'Build a session dashboard\nwith TypeScript'}},
  ];
  writeFileSync(join(project, 'session-1.jsonl'), records.map(record => JSON.stringify(record)).join('\n') + '\n');
  const rows = await discoverClaude(root, 0);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({sessionId: 'session-1', task: 'Build a session dashboard with TypeScript', status: 'unknown'});
});

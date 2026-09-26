/** Ink で worktree ごとのセッション一覧と選択中セッションの詳細を表示する。 */
import React, {useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {discoverSessions} from './discovery.js';
import {demoRows} from './demo.js';
import {gitInfo, type GitInfo} from './git.js';
import {displayedStatus, sessionKey, type AgentSession} from './model.js';
import {readSessions} from './storage.js';

type Row = {session: AgentSession; git?: GitInfo};
const symbols: Record<string, string> = {
  running: '●', waiting_permission: '◐', idle: '○', ended: '✓', unknown: '?',
};
const labels: Record<string, string> = {
  running: 'running', waiting_permission: 'waiting', idle: 'idle', ended: 'ended', unknown: 'unknown',
};
const colors: Record<string, string> = {
  running: 'green', waiting_permission: 'yellow', idle: 'cyan', ended: 'gray', unknown: 'gray',
};

function merge(observed: Map<string, AgentSession>, discovered: Map<string, AgentSession>): AgentSession[] {
  const all = new Map(discovered);
  for (const [key, session] of observed) all.set(key, {...session, task: session.task || discovered.get(key)?.task});
  return [...all.values()].filter(session => Date.parse(session.updatedAt) > Date.now() - 86_400_000);
}

export function Dashboard({demo = false}: {demo?: boolean}): React.JSX.Element {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const [discovered, setDiscovered] = useState(new Map<string, AgentSession>());
  const [sessions, setSessions] = useState<AgentSession[]>(() => demo ? [] : merge(readSessions(), new Map()));
  const [selected, setSelected] = useState(0);
  const [detail, setDetail] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (demo) return;
    let active = true;
    discoverSessions().then(value => { if (active) setDiscovered(value); });
    return () => { active = false; };
  }, [demo]);
  useEffect(() => {
    if (demo) return;
    const refresh = () => { setSessions(merge(readSessions(), discovered)); setNow(Date.now()); };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [demo, discovered]);
  const rows = useMemo<Row[]>(() => {
    if (demo) return demoRows(new Date(now));
    const cache = new Map<string, GitInfo | undefined>();
    return sessions.map(session => {
      if (!cache.has(session.cwd)) cache.set(session.cwd, gitInfo(session.cwd));
      return {session, git: cache.get(session.cwd)};
    }).sort((a, b) => {
      const aName = `${a.git?.repo || '~'}/${a.git?.worktree || a.session.cwd}`;
      const bName = `${b.git?.repo || '~'}/${b.git?.worktree || b.session.cwd}`;
      return aName.localeCompare(bName) || b.session.updatedAt.localeCompare(a.session.updatedAt);
    });
  }, [demo, now, sessions]);
  useInput((input, key) => {
    if (input === 'q') exit();
    else if (key.escape) setDetail(false);
    else if (key.upArrow) setSelected(value => Math.max(0, value - 1));
    else if (key.downArrow) setSelected(value => Math.min(rows.length - 1, value + 1));
    else if (key.return && rows.length) setDetail(value => !value);
  });
  const index = Math.min(Math.max(0, selected), Math.max(0, rows.length - 1));
  const current = rows[index];
  const width = stdout.columns || 100;
  const projectWidth = width < 90 ? 13 : 18;
  const treeWidth = width < 90 ? 16 : 21;
  const agentWidth = 14;
  const statusWidth = 12;
  const taskWidth = Math.max(3, width - projectWidth - treeWidth - agentWidth - statusWidth - 6);
  const maxRows = Math.max(3, (stdout.rows || 24) - (detail ? 15 : 7));
  const start = Math.max(0, index - maxRows + 1);
  const visible = rows.slice(start, start + maxRows);
  return <Box flexDirection="column" paddingX={1}>
    <Text bold color="magenta">agenttop{demo ? ' · demo' : ''}</Text>
    <Text dimColor>{rows.length} sessions  ↑↓ select  Enter details  Esc back  q quit</Text>
    <Box>
      <Box width={projectWidth} marginRight={1}><Text dimColor>PROJECT</Text></Box>
      <Box width={treeWidth} marginRight={1}><Text dimColor>WORKTREE</Text></Box>
      <Box width={agentWidth} marginRight={1}><Text dimColor>AGENT</Text></Box>
      <Box width={statusWidth} marginRight={1}><Text dimColor>STATUS</Text></Box>
      <Box width={taskWidth}><Text dimColor>TASK</Text></Box>
    </Box>
    {visible.length === 0 ? <Text dimColor>No sessions. Run agenttop setup, then use Claude Code or Codex.</Text>
      : visible.map((row, offset) => {
        const status = displayedStatus(row.session, now);
        const project = row.git?.repo || '(no git)';
        const tree = row.git?.worktree.split('/').at(-1) || row.session.cwd.split('/').at(-1) || '';
        const agent = `${row.session.provider}:${row.session.sessionId.slice(-6)}`;
        const state = `${symbols[status]} ${labels[status]}`;
        const highlight = start + offset === index ? 'magenta' : undefined;
        return <Box key={sessionKey(row.session.provider, row.session.sessionId)}>
          <Box width={projectWidth} marginRight={1}><Text color={highlight} wrap="truncate-end">{project}</Text></Box>
          <Box width={treeWidth} marginRight={1}><Text color={highlight} wrap="truncate-end">{tree}</Text></Box>
          <Box width={agentWidth} marginRight={1}><Text color={highlight} wrap="truncate-end">{agent}</Text></Box>
          <Box width={statusWidth} marginRight={1}><Text color={colors[status]} wrap="truncate-end">{state}</Text></Box>
          <Box width={taskWidth}><Text color={highlight} wrap="truncate-end">{row.session.task || '(task unavailable)'}</Text></Box>
        </Box>;
      })}
    {detail && current && <Box flexDirection="column" borderStyle="single" paddingX={1} marginTop={1}>
      <Text bold>{current.git?.repo || '(no git)'} / {current.git?.worktree || current.session.cwd}</Text>
      <Text>Provider: {current.session.provider}　Status: {displayedStatus(current.session, now)}　Source: {current.session.source}</Text>
      <Text>Branch: {current.git?.branch || '-'}　Changed files: {current.git?.changedFiles ?? '-'}</Text>
      <Text>Session: {current.session.sessionId}</Text>
      <Text>CWD: {current.session.cwd}</Text>
      <Text>Task: {current.session.task || '(task unavailable)'}</Text>
      <Text>Activity: {current.session.activity || '-'}</Text>
      <Text>Last event: {current.session.lastEvent || 'discovered'}</Text>
      <Text>Updated: {new Date(current.session.updatedAt).toLocaleString()}</Text>
    </Box>}
  </Box>;
}

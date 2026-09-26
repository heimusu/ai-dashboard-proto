/** agenttop の CLI 入口。TUI、hook イベント受信、初期設定、診断コマンドを振り分ける。 */
import React from 'react';
import {randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {render} from 'ink';
import {Dashboard} from './ui.js';
import {normalizeHook, type Provider} from './model.js';
import {setupHooks} from './setup.js';
import {appendEvent, dataDir, readSessions} from './storage.js';

async function readStdin(maxBytes = 1_000_000): Promise<string> {
  let input = '';
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (input.length > maxBytes) throw new Error('hook input too large');
  }
  return input;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'emit') {
    const provider = args[0] === '--provider' ? args[1] : undefined;
    if (provider !== 'claude' && provider !== 'codex') return;
    try {
      const raw: unknown = JSON.parse(await readStdin());
      appendEvent(normalizeHook(provider as Provider, raw, randomUUID()));
    } catch { /* observation must never block the agent */ }
    return;
  }
  if (command === 'setup') {
    const result = setupHooks({cliPath: fileURLToPath(import.meta.url)});
    for (const line of result) process.stdout.write(`${line}\n`);
    process.stdout.write('Codex: open /hooks and trust each agenttop hook before use.\n');
    if (result.some(line => line.includes('failed:'))) process.exitCode = 1;
    return;
  }
  if (command === 'doctor') {
    const dir = dataDir();
    let writable = false;
    const probe = join(dir, `.probe-${process.pid}`);
    try {
      mkdirSync(dir, {recursive: true, mode: 0o700});
      writeFileSync(probe, '', {flag: 'wx', mode: 0o600});
      unlinkSync(probe);
      writable = true;
    } catch { /* report below */ }
    const configPath = join(homedir(), '.codex', 'hooks.json');
    const codexToml = join(homedir(), '.codex', 'config.toml');
    let configured = 0;
    let trustRecords: number | undefined;
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8')) as {hooks?: Record<string, Array<{hooks?: Array<{command?: string}>}>>};
        configured = Object.values(config.hooks || {}).filter(groups => Array.isArray(groups) && groups.some(group =>
          group.hooks?.some(handler => handler.command?.includes(' emit --provider codex')))).length;
      } catch { /* malformed configuration is visible in /hooks */ }
    }
    if (existsSync(codexToml)) {
      const configText = readFileSync(codexToml, 'utf8');
      trustRecords = [...configText.matchAll(/^\[hooks\.state\."([^\"]+)"\]/gm)]
        .filter(match => match[1].startsWith(`${configPath}:`)).length;
    }
    process.stdout.write(`Storage: ${dir} (${writable ? 'writable' : 'not writable'})\n`);
    process.stdout.write(`Observed sessions: ${readSessions().size}\n`);
    process.stdout.write(`Codex hooks configured: ${configured}; trust records: ${trustRecords ?? 'unknown'}\n`);
    process.stdout.write('Check /hooks in Codex to trust each agenttop hook.\n');
    if (!writable) process.exitCode = 1;
    return;
  }
  if (command === '--help' || command === 'help') {
    process.stdout.write('agenttop [--demo|setup|doctor|emit --provider claude|codex]\n');
    return;
  }
  if (command === '--demo') {
    render(<Dashboard demo />);
    return;
  }
  if (command) throw new Error(`Unknown command: ${command}`);
  render(<Dashboard />);
}

main().catch(error => { process.stderr.write(`${(error as Error).message}\n`); process.exitCode = 1; });

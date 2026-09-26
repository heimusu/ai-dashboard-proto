/** Claude Code と Codex のユーザー設定に agenttop の hook を安全に追加・更新する。 */
import {copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import type {Provider} from './model.js';

const commonEvents = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop', 'SessionEnd'];
const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

type Json = Record<string, unknown>;
function readJson(path: string): Json {
  if (!existsSync(path)) return {};
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${path}: expected JSON object`);
  return parsed as Json;
}

function install(path: string, provider: Provider, cliPath: string): boolean {
  const config = readJson(path);
  const hooks = config.hooks === undefined ? {} : config.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks)) throw new Error(`${path}: hooks must be an object`);
  const hookTable = hooks as Json;
  const command = `${quote(process.execPath)} ${quote(cliPath)} emit --provider ${provider}`;
  let changed = false;
  const events = provider === 'claude' ? [...commonEvents, 'StopFailure'] : [...commonEvents, 'Interrupt'];
  for (const event of events) {
    const groups = hookTable[event] === undefined ? [] : hookTable[event];
    if (!Array.isArray(groups)) throw new Error(`${path}: hooks.${event} must be an array`);
    const found = groups.some(group => {
      if (!group || typeof group !== 'object') return false;
      const handlers = (group as Json).hooks;
      if (!Array.isArray(handlers)) return false;
      const owned = handlers.find(handler => handler && typeof handler === 'object'
        && typeof (handler as Json).command === 'string'
        && String((handler as Json).command).includes(' emit --provider ' + provider)) as Json | undefined;
      if (!owned) return false;
      if (owned.command !== command) { owned.command = command; changed = true; }
      return true;
    });
    if (!found) {
      groups.push({hooks: [{type: 'command', command, timeout: 2}]});
      hookTable[event] = groups;
      changed = true;
    }
  }
  if (!changed) return false;
  config.hooks = hookTable;
  mkdirSync(dirname(path), {recursive: true});
  if (existsSync(path)) copyFileSync(path, `${path}.agenttop.bak`);
  const temp = `${path}.agenttop.tmp-${process.pid}`;
  try {
    writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});
    renameSync(temp, path);
  } catch (error) { throw error; }
  return true;
}

export function setupHooks(options: {cliPath: string; claudePath?: string; codexPath?: string}): string[] {
  const cliPath = resolve(options.cliPath);
  if (!existsSync(cliPath) || !cliPath.endsWith('.js')) throw new Error('Build the CLI first: pnpm build');
  const outcomes: string[] = [];
  const paths: Array<[Provider, string]> = [
    ['claude', options.claudePath || join(homedir(), '.claude', 'settings.json')],
    ['codex', options.codexPath || join(homedir(), '.codex', 'hooks.json')],
  ];
  for (const [provider, path] of paths) {
    try { outcomes.push(`${provider}: ${install(path, provider, cliPath) ? 'configured' : 'already configured'}`); }
    catch (error) { outcomes.push(`${provider}: failed: ${(error as Error).message}`); }
  }
  return outcomes;
}

/** agenttop の CLI を Node.js 用 ESM としてビルドする tsup 設定。 */
import {defineConfig} from 'tsup';

export default defineConfig({
  entry: ['src/cli.tsx'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  banner: {js: '#!/usr/bin/env node'},
  clean: true,
});

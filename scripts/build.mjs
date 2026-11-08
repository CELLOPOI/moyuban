import { build } from 'esbuild'
import manifest from '../package.json' with { type: 'json' }

// DSH 延迟加载前端模块，并提供与宿主相同的 React 实例。
await build({
  entryPoints: ['src/client/index.jsx'],
  bundle: true,
  outfile: 'dist/client.js',
  platform: 'browser',
  format: 'cjs',
  external: ['react', '@deepseek-ai/dsh-client-ui-primitives'],
  loader: { '.css': 'text' },
  target: 'es2022',
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory(require) { const module = { exports: {} };` },
  footer: { js: 'return module.exports; } });' },
})

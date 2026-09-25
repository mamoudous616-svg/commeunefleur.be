// `npm run dev` : lance l'API (port 8787) et le site Astro (port 4321) ensemble.
// Le site appelle l'API via /api (proxy configuré dans frontend/astro.config.mjs).
import { spawn } from 'node:child_process';

const procs = [
  { name: 'api ', color: 36, cmd: 'npm', args: ['run', 'dev', '-w', '@cuf/api'], env: { STATIC_DIR: '' } },
  // --ignore-lock : garde Astro au premier plan (sinon il peut passer en arrière-plan et le script s'arrêterait).
  { name: 'site', color: 35, cmd: 'npm', args: ['run', 'dev', '-w', '@cuf/frontend', '--', '--ignore-lock'] },
];

const children = procs.map(({ name, color, cmd, args, env }) => {
  const child = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) if (line.trim()) out.write(prefix + line + '\n');
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}arrêté (code ${code})`);
    shutdown();
  });
  return child;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

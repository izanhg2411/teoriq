// Genera TEORIQ.zip con el proyecto (sin node_modules, dist, dist-sim, cachés ni capturas).
// Uso: npm run zip    (Windows: PowerShell Compress-Archive; Linux/macOS: comando `zip`)
import { execSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXCLUDE = new Set(['node_modules', 'dist', 'dist-sim', '.shots', '.git', '.cache', 'TEORIQ.zip']);
const out = resolve('TEORIQ.zip');
const stage = mkdtempSync(join(tmpdir(), 'teoriq-zip-'));
const root = join(stage, 'TEORIQ');
mkdirSync(root);
cpSync(resolve('.'), root, { recursive: true, filter: (src) => !EXCLUDE.has(src.split(/[\\/]/).pop()) && !src.endsWith('.tmp') && !src.endsWith('.log') });
if (existsSync(out)) rmSync(out);
try {
  if (process.platform === 'win32') execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${root}' -DestinationPath '${out}'"`, { stdio: 'inherit' });
  else execSync(`zip -qr "${out}" TEORIQ`, { cwd: stage, stdio: 'inherit' });
  console.log('Creado', out);
} finally { rmSync(stage, { recursive: true, force: true }); }

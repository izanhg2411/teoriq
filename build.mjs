// Compila TEORIQ con esbuild -> dist/ (cargable en chrome://extensions con «Cargar descomprimida»).
//   node build.mjs          producción: el content script solo se activa en cloud.aeolservice.es
//   node build.mjs --dev    añade http://localhost/* para probar con test-page (npm run serve:test)
import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const dev = process.argv.includes('--dev');
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
rmSync('dist/manifest.template.json');

const manifest = JSON.parse(readFileSync('public/manifest.template.json', 'utf8'));
if (dev) {
  manifest.name = 'TEORIQ (dev)';
  manifest.content_scripts[0].matches.push('http://localhost/*');
}
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));

await build({
  entryPoints: { sidepanel: 'src/sidepanel/main.tsx', options: 'src/options/main.tsx', background: 'src/background.ts', content: 'src/content.ts' },
  outdir: 'dist', bundle: true, format: 'esm', target: 'chrome114', jsx: 'automatic', minify: true,
  define: { 'process.env.NODE_ENV': '"production"', __TEORIQ_DEV__: String(dev) },
  logLevel: 'info',
});
if (!existsSync('dist/content.js')) throw new Error('falta content.js');
// Los content scripts clásicos no admiten "import": se comprueba que el bundle es autocontenido.
if (/^\s*import[\s{*]/m.test(readFileSync('dist/content.js', 'utf8'))) throw new Error('content.js contiene imports');
console.log(dev ? 'Build DEV listo en dist/' : 'Build listo en dist/');

// Sirve la página de pruebas en http://localhost:8765/ para usarla con el build de desarrollo (npm run build:dev).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../test-page/aeolcloud-sim.html', import.meta.url));
createServer((_, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); })
  .listen(8765, () => console.log('Página de pruebas en http://localhost:8765/  (carga antes la extensión con «npm run build:dev»)'));

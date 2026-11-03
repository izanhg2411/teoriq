// Genera los iconos PNG de TEORIQ (requiere sharp). Los PNG ya están incluidos en public/icons.
import sharp from 'sharp';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f2c3f"/><path d="M7 21.5l5-5 4 3.2 8.5-9" stroke="#f0a202" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M7 26h18" stroke="#5fd0c4" stroke-width="2.2" stroke-linecap="round"/><circle cx="24.5" cy="10.7" r="2" fill="#f0a202"/></svg>`;
for (const s of [16, 32, 48, 128]) await sharp(Buffer.from(svg), { density: 600 }).resize(s, s).png().toFile(`public/icons/icon${s}.png`);
console.log('Iconos generados');

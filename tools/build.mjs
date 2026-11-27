#!/usr/bin/env node
/* Copia la web a dist/ y prepara lo necesario para GitHub Pages. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SKIP = new Set(['.git', '.github', 'node_modules', 'dist', 'tools', '.DS_Store']);

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirectory(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
copyDirectory(ROOT, DIST);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');

const siteUrl = (process.env.SITE_URL || '').trim();
if (siteUrl) {
  try {
    const host = new URL(siteUrl).hostname;
    if (host && !host.endsWith('github.io')) {
      fs.writeFileSync(path.join(DIST, 'CNAME'), `${host}\n`);
    }
  } catch {
    console.warn('SITE_URL no es una URL válida; no se crea CNAME.');
  }
}

const files = fs.readdirSync(DIST);
console.log(`dist/ listo: ${files.length} entradas en la raíz.`);

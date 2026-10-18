import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

const root = resolve(import.meta.dirname, '..');

// Lädt index.html und game.js in eine jsdom-Umgebung. game.js ist ein Browser-Skript
// ohne Exporte. Der Accessor wird im selben Skript definiert, damit `eval` die
// top-level const/let-Bindings von game.js sieht.
export function loadGame({ hash = '' } = {}) {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8')
    .replace('<script src="game.js"></script>', '');
  const src = readFileSync(resolve(root, 'game.js'), 'utf8');
  const dom = new JSDOM(html, { url: `http://localhost/${hash}`, runScripts: 'outside-only' });
  dom.window.eval(`${src}\n;window.__g = (expr) => eval(expr);`);
  const g = dom.window.__g;
  return { window: dom.window, g };
}

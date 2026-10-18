import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame } from './load-game.js';

let game;
const MAX = 5; // MAX_SCORES in game.js

beforeEach(() => { game = loadGame(); });

describe('seeded', () => {
  it('liefert bei gleichem Seed dieselbe Zahlenfolge', () => {
    const { g } = game;
    const a = g(`(() => { const r = seeded('abc'); return [r(), r(), r()]; })()`);
    const b = g(`(() => { const r = seeded('abc'); return [r(), r(), r()]; })()`);
    expect(a).toEqual(b);
  });

  it('liefert bei verschiedenem Seed unterschiedliche Folgen', () => {
    const { g } = game;
    const a = g(`seeded('abc')()`);
    const b = g(`seeded('xyz')()`);
    expect(a).not.toBe(b);
  });

  it('liefert Werte im Bereich [0, 1)', () => {
    const r = game.g(`seeded('range')`);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('LEVELS', () => {
  it('legt die Stufen-Parameter fest', () => {
    expect(game.g('LEVELS')).toEqual({
      easy:   { n: 18, cell: 32, pieces: 8,  min: 3 },
      medium: { n: 21, cell: 27, pieces: 13, min: 2 },
      hard:   { n: 24, cell: 24, pieces: 20, min: 2, noSquares: true, dominoes: 2 },
      expert: { n: 27, cell: 22, pieces: 30, min: 2, noSquares: true, dominoes: 2 },
    });
  });
});

describe('generate', () => {
  for (const level of ['easy', 'medium', 'hard', 'expert']) {
    it(`erzeugt für Level "${level}" über viele Seeds immer genau pieces Teile`, () => {
      const { g } = game;
      const { n, pieces, min, noSquares, dominoes } = g(`LEVELS.${level}`);
      for (let i = 0; i < 200; i++) {
        const rects = g(`(() => { random = seeded('many-${level}-${i}'); return generate(${n}, ${pieces}, ${min}, ${!!noSquares}, ${dominoes || 0}); })()`);
        expect(rects).toHaveLength(pieces);
        expect(rects.reduce((s, r) => s + r.w * r.h, 0)).toBe(n * n);
      }
    });
  }

  for (const level of ['easy', 'medium', 'hard', 'expert']) {
    it(`erzeugt für Level "${level}" eine lösbare Zerlegung des Quadrats`, () => {
      const { g } = game;
      const { n, pieces, min, noSquares, dominoes } = g(`LEVELS.${level}`);
      const rects = g(`(() => { random = seeded('gen-${level}'); return generate(${n}, ${pieces}, ${min}, ${!!noSquares}, ${dominoes || 0}); })()`);

      expect(rects).toHaveLength(pieces);
      expect(rects.reduce((s, r) => s + r.w * r.h, 0)).toBe(n * n);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(n);
        expect(r.y + r.h).toBeLessThanOrEqual(n);
        expect(Math.min(r.w, r.h)).toBeGreaterThanOrEqual(dominoes ? 1 : min);
      }
      for (let i = 0; i < rects.length; i++)
        for (let j = i + 1; j < rects.length; j++)
          expect(g(`intersect(${JSON.stringify(rects[i])}, ${JSON.stringify(rects[j])})`)).toBeNull();
    });
  }
});

describe('Stufen ohne Quadrate (hard, expert)', () => {
  for (const level of ['hard', 'expert']) {
    it(`"${level}": keine Quadrate, Streifen nur als 1×2`, () => {
      const { g } = game;
      const { n, pieces, min, noSquares, dominoes } = g(`LEVELS.${level}`);
      let dominoSeen = 0;
      for (let i = 0; i < 200; i++) {
        const rects = g(`(() => { random = seeded('ns-${level}-${i}'); return generate(${n}, ${pieces}, ${min}, ${noSquares}, ${dominoes || 0}); })()`);
        for (const r of rects) {
          expect(r.w).not.toBe(r.h);
          if (Math.min(r.w, r.h) === 1) { expect(r.w * r.h).toBe(2); dominoSeen++; }
        }
        expect(rects.filter((r) => r.w * r.h === 2).length).toBeLessThanOrEqual(2 * (dominoes || 0));
      }
      expect(dominoSeen).toBeGreaterThan(0);
    });

    it(`"${level}": gedrehte Teile im Spiel bleiben nicht quadratisch`, () => {
      const gm = loadGame({ hash: `#${level}-abc123` });
      expect(gm.g('seed')).toBe(`${level}-abc123`);
      expect(gm.g('pieces.every((p) => p.w !== p.h)')).toBe(true);
    });
  }
});

describe('intersect', () => {
  it('liefert die Überlappungsfläche', () => {
    expect(game.g(`intersect({x:0,y:0,w:4,h:4}, {x:2,y:1,w:4,h:4})`))
      .toEqual({ x: 2, y: 1, w: 2, h: 3 });
  });

  it('liefert null bei nur aneinanderliegenden Kanten', () => {
    expect(game.g(`intersect({x:0,y:0,w:2,h:2}, {x:2,y:0,w:2,h:2})`)).toBeNull();
  });

  it('liefert null bei getrennten Rechtecken', () => {
    expect(game.g(`intersect({x:0,y:0,w:1,h:1}, {x:5,y:5,w:1,h:1})`)).toBeNull();
  });
});

describe('inBounds', () => {
  it('prüft die Grenzen des Spielfelds (N)', () => {
    const { g } = game;
    const n = g('N');
    const p = { w: 3, h: 2 };
    expect(g(`inBounds(${JSON.stringify(p)}, 0, 0)`)).toBe(true);
    expect(g(`inBounds(${JSON.stringify(p)}, ${n - 3}, ${n - 2})`)).toBe(true);
    expect(g(`inBounds(${JSON.stringify(p)}, ${n - 2}, 0)`)).toBe(false);
    expect(g(`inBounds(${JSON.stringify(p)}, -1, 0)`)).toBe(false);
  });
});

describe('overlaps / overlapsAt', () => {
  it('findet Überlappungen zwischen platzierten Teilen', () => {
    const { g } = game;
    g(`pieces = [
      { id: 0, w: 3, h: 3, x: 0, y: 0 },
      { id: 1, w: 3, h: 3, x: 2, y: 2 },
      { id: 2, w: 1, h: 1, x: null, y: null },
    ]`);
    expect(g('overlaps()')).toEqual([{ x: 2, y: 2, w: 1, h: 1 }]);
  });

  it('ignoriert Teile im Vorrat und prüft Positionen ohne das Teil selbst', () => {
    const { g } = game;
    g(`pieces = [
      { id: 0, w: 2, h: 2, x: 0, y: 0 },
      { id: 1, w: 2, h: 2, x: 5, y: 5 },
    ]`);
    expect(g('overlapsAt(pieces[1], 1, 1)')).toBe(true);
    expect(g('overlapsAt(pieces[1], 5, 5)')).toBe(false);
  });
});

describe('Seed im URL-Hash', () => {
  it('übernimmt einen gültigen Seed aus dem Hash', () => {
    const gm = loadGame({ hash: '#medium-abc123' });
    expect(gm.g('seed')).toBe('medium-abc123');
    expect(gm.g('$("level").value')).toBe('medium');
  });

  it('erzeugt bei gleichem Seed dasselbe Puzzle', () => {
    const a = loadGame({ hash: '#hard-xyz789' }).g('pieces.map((p) => p.sol)');
    const b = loadGame({ hash: '#hard-xyz789' }).g('pieces.map((p) => p.sol)');
    expect(a).toEqual(b);
  });

  it('ignoriert ungültige Hashes', () => {
    expect(loadGame({ hash: '#unbekannt-123' }).g('seed')).not.toMatch(/^unbekannt-/);
    expect(loadGame({ hash: '#easy' }).g('seed')).not.toBe('easy');
  });
});

describe('solve', () => {
  it('legt alle Teile in die Lösung ohne Überlappung', () => {
    const { g } = game;
    g('solve()');
    expect(g('overlaps()')).toEqual([]);
    expect(g('pieces.every((p) => p.x === p.sol.x && p.y === p.sol.y)')).toBe(true);
    expect(g('solved')).toBe(true);
  });
});

describe('Highscores', () => {
  it('fmt formatiert Millisekunden als mm:ss', () => {
    expect(game.g('fmt(65000)')).toBe('01:05');
    expect(game.g('fmt(0)')).toBe('00:00');
  });

  it('esc maskiert HTML-Sonderzeichen', () => {
    expect(game.g(`esc('<a href="x">&</a>')`)).toBe('&#60;a href=&#34;x&#34;&#62;&#38;&#60;/a&#62;');
  });

  it('loadScores wandelt alte Zahlen-Einträge in Objekte um', () => {
    const { g } = game;
    g(`localStorage.setItem('puzzleScores', JSON.stringify({ easy: [1234] }))`);
    expect(g('loadScores()')).toEqual({ easy: [{ name: '–', ms: 1234 }] });
  });

  it('saveScore sortiert nach Zeit und begrenzt auf MAX_SCORES', () => {
    const { g } = game;
    g(`localStorage.setItem('puzzleScores', JSON.stringify({ easy: [
      { name: 'a', ms: 10000 }, { name: 'b', ms: 20000 }, { name: 'c', ms: 30000 },
      { name: 'd', ms: 40000 }, { name: 'e', ms: 50000 } ] }))`);
    g(`pending = { level: 'easy', ms: 5000 }`);
    g(`document.getElementById('name').value = 'Ada'`);
    g('saveScore()');

    const list = g(`loadScores().easy`);
    expect(list).toHaveLength(MAX);
    expect(list[0]).toEqual({ name: 'Ada', ms: 5000 });
    expect(list.map((s) => s.ms)).toEqual([...list.map((s) => s.ms)].sort((x, y) => x - y));
  });
});

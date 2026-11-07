import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// The service reaches the audio bucket through supabase; nothing here plays a
// sound, so the client is a stub.
const compiled = await build({
  entryPoints: ['services/lettersHunterService.ts'], bundle: true, write: false,
  format: 'esm', platform: 'node', plugins: [{
    name: 'hunter-fixtures', setup(b) {
      b.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'db', namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'export const supabase = { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) } };',
      }));
    },
  }],
});
const hunter = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

for (const [name, make] of [['say', 'buildSayItem'], ['syllables', 'buildSyllable']]) {
  test(`${name} never shows the same thing twice in a row`, () => {
    for (const letters of [['ح', 'ج'], ['ر', 'ز', 'ذ']]) {
      for (let attempt = 0; attempt < 400; attempt++) {
        const run = hunter.buildShowRun(hunter[make], letters, 20);
        assert.equal(run.length, 20);
        for (let i = 1; i < run.length; i++) {
          assert.notEqual(run[i].text, run[i - 1].text,
            `${name} repeated ${run[i].text} at ${i} with ${letters.join('')}`);
        }
      }
    }
  });
}

test('a run still comes back to the same item later — it is not a shuffle', () => {
  // Two letters give six `say` items, so twenty rounds MUST reuse them.
  const texts = hunter.buildShowRun(hunter.buildSayItem, ['ح', 'ج'], 20).map(i => i.text);
  assert.ok(new Set(texts).size < texts.length, 'expected repeats somewhere in the run');
});

test('every cell of a row comes from the chosen letters, and the target is findable', () => {
  for (const withVowels of [false, true]) {
    for (let i = 0; i < 300; i++) {
      const letters = ['ر', 'ز'];
      const row = hunter.buildRow(letters, withVowels);
      assert.equal(row.cells.length, 10);
      for (const c of row.cells) assert.ok(letters.includes(c.letter));
      assert.ok(hunter.targetsOf(row).length >= 2);
    }
  }
});

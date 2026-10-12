const assert = require('node:assert/strict');
const { test } = require('node:test');
require('../js/wildlife-rules.js');
const rules = globalThis.GeoWildlifeRules;
const species = (scientific, kind = 'bird') => ({ scientific, kind, name: scientific });
const at = (scientific, date, options = {}) => rules.evaluate(species(scientific), { date, ...options });

test('calendar validation and Georgia date do not depend on the runner timezone', () => {
  assert.equal(rules.today(new Date('2026-10-12T20:30:00Z')), '2026-10-13');
  assert.equal(rules.today(new Date('2026-10-12T19:59:59Z')), '2026-10-12');
  for (const value of ['2026-02-29', '2026-13-01', '2026-01-32', '', null]) assert.equal(rules.validDate(value), false);
  assert.equal(rules.validDate('2028-02-29'), true);
  assert.equal(at('Coturnix coturnix', '2026-02-29').status, 'unverified');
});

test('quail opening, closing and year transition preserve the confirmed season', () => {
  assert.equal(at('Coturnix coturnix', '2026-08-21').status, 'prohibited');
  const opened = at('Coturnix coturnix', '2026-08-22');
  assert.equal(opened.status, 'conditional');
  assert.equal(opened.limit, 20);
  assert.equal(opened.period.end, '2027-02-15');
  assert.equal(at('Coturnix coturnix', '2027-02-14').status, 'conditional');
  assert.match(at('Coturnix coturnix', '2027-02-15').title, /153/);
  assert.equal(at('Coturnix coturnix', '2027-02-16').status, 'prohibited');
  assert.equal(at('Coturnix coturnix', '2027-08-22').status, 'unverified');
});

test('mallard municipality changes both allowed dates and daily limit', () => {
  const mallard = 'Anas platyrhynchos';
  assert.equal(at(mallard, '2026-09-09', { area: 'highland' }).status, 'prohibited');
  assert.equal(at(mallard, '2026-09-10', { area: 'highland' }).limit, 5);
  assert.equal(at(mallard, '2026-10-12', { area: 'highland' }).status, 'conditional');
  assert.equal(at(mallard, '2026-10-12', { area: 'standard' }).status, 'prohibited');
  assert.equal(at(mallard, '2026-11-01', { area: 'standard' }).limit, 6);
  assert.equal(at(mallard, '2026-12-31', { area: 'highland' }).status, 'conditional');
  assert.equal(at(mallard, '2027-01-01', { area: 'highland' }).status, 'prohibited');
  assert.equal(at(mallard, '2027-02-28', { area: 'standard' }).status, 'conditional');
  assert.equal(at(mallard, '2027-03-01', { area: 'standard' }).status, 'prohibited');
});

test('unknown mallard area cannot hide a closure shared by both areas', () => {
  assert.equal(at('Anas platyrhynchos', '2026-06-01', { area: 'unknown' }).status, 'prohibited');
  assert.equal(at('Anas platyrhynchos', '2026-10-12', { area: 'unknown' }).status, 'conditional');
  assert.equal(at('Anas platyrhynchos', '2028-10-12', { area: 'unknown' }).status, 'unverified');
});

test('protected wildlife matches scientific identity and is protected all year', () => {
  for (const name of ['Ursus arctos', 'Aquila heliaca', 'Testudo graeca']) {
    for (const date of ['2026-01-15', '2026-10-12']) {
      const result = rules.evaluate(species(name, name.includes('Testudo') ? 'reptile' : 'mammal'), { date });
      assert.equal(result.status, 'prohibited');
      assert.ok(result.sources.some(source => source.url.endsWith('/1065')));
    }
  }
  const unrelated = rules.evaluate({ kind: 'reptile', name: 'ხმელთაშუაზღვის კუ', scientific: 'Testudo hermanni' }, { date: '2026-10-12' });
  assert.equal(unrelated.status, 'unverified');
});

test('amphibians and permit-dependent mammals do not get fish advice', () => {
  const frog = ['amphibian', 'ბაყაყი', 'Frog', 'Pelophylax ridibundus', 'ამფიბია', 'water'];
  assert.equal(rules.normaliseSpecies(frog).kind, 'amphibian');
  assert.equal(rules.evaluate(frog, { date: '2026-10-12' }).status, 'unverified');
  assert.equal(rules.evaluate(species('Vulpes vulpes', 'mammal'), { date: '2026-10-12' }).status, 'permit');
});

test('species fish bans take precedence over amateur and release exemptions', () => {
  for (const name of ['Acipenser gueldenstaedtii', 'Huso huso', 'Salmo labrax']) {
    for (const method of ['rod', 'release', 'commercial', 'other']) {
      assert.equal(rules.evaluate(species(name, 'fish'), { date: '2026-10-12', method }).status, 'prohibited');
    }
  }
  assert.equal(rules.evaluate(species('Salmo trutta', 'fish'), { date: '2026-10-12', method: 'rod' }).status, 'prohibited');
  const release = rules.evaluate(species('Salmo trutta', 'fish'), { date: '2026-10-12', method: 'release' });
  assert.equal(release.status, 'conditional');
  assert.match(release.message, /ზუსტი სეზონი დადასტურებული არ არის/);
});

test('turbot closure applies even to rod or catch-and-release fishing', () => {
  const turbot = species('Scophthalmus maximus', 'fish');
  assert.equal(rules.evaluate(turbot, { date: '2026-04-30' }).status, 'conditional');
  assert.equal(rules.evaluate(turbot, { date: '2026-05-01', method: 'release' }).status, 'prohibited');
  assert.equal(rules.evaluate(turbot, { date: '2026-06-30' }).status, 'prohibited');
  assert.equal(rules.evaluate(turbot, { date: '2026-07-01' }).status, 'conditional');
});

test('water spawning closures do not become a blanket amateur fishing ban', () => {
  const carp = species('Cyprinus carpio', 'fish');
  const options = { date: '2026-05-15', waterId: 'mtaqvari' };
  assert.equal(rules.evaluate(carp, { ...options, method: 'commercial' }).status, 'prohibited');
  assert.equal(rules.evaluate(carp, { ...options, method: 'rod' }).status, 'conditional');
  assert.equal(rules.evaluate(carp, { ...options, method: 'release' }).status, 'conditional');
  assert.ok(['permit', 'unverified'].includes(rules.evaluate(carp, { ...options, method: 'other' }).status));
  assert.equal(rules.evaluate(carp, { date: '2026-11-15', waterId: 'shaori', method: 'commercial' }).status, 'prohibited');
  assert.equal(rules.evaluate(carp, { date: '2026-11-14', waterId: 'shaori', method: 'commercial' }).status, 'permit');
});

test('rule markup escapes names and locations and includes source provenance', () => {
  const html = rules.markup({ kind: 'fish', name: '<img src=x onerror=alert(1)>', scientific: 'Cyprinus carpio' }, { date: '2026-10-12', location: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('https://des.gov.ge/Ge/Files/Download/1056'));
  assert.ok(html.includes('12.10.2026'));
});

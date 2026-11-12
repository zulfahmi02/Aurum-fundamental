const assert = require('node:assert/strict');
const { parseCalendar, makeAutoReport } = require('../.test-build/automatic.js');
const { PRICE_URL, parseQuote, dueLegs, legTarget, makePriceTick, readPriceTick, evaluatePrices, summarizePrices } = require('../.test-build/automaticPrices.js');

const at = Date.parse('2026-11-13T08:30Z'), release = Date.parse('2026-11-13T13:30Z');
const entryAt = release - 5 * 60000, exitAt = release + 60000;
const event = parseCalendar([['PPI m/m', '0.3%'], ['Core PPI m/m', '0.3%']].map(([title, forecast]) =>
  ({ country: 'USD', title, forecast, previous: '0.2%', date: '2026-11-13T08:30:00-05:00' })), at).events[0];
const feed = (ts, bid, ask, platform = 'SwissquoteLtd') => [
  { topo: { platform: 'AT', server: 'AT' }, spreadProfilePrices: [{ spreadProfile: 'premium', bid: 1, ask: 2 }], ts },
  { topo: { platform, server: 'Live5' }, spreadProfilePrices: [{ spreadProfile: 'prime', bid: bid + 0.1, ask: ask - 0.1 }, { spreadProfile: 'premium', bid, ask }], ts },
];

// Parsing: fixed platform/profile only, sane and fresh quotes only.
assert.deepEqual(parseQuote(feed(entryAt, 3974.5, 3975.1), entryAt + 1000), { at: entryAt, bid: 3974.5, ask: 3975.1, server: 'Live5' });
assert.throws(() => parseQuote(feed(entryAt, 3974.5, 3975.1, 'Other'), entryAt), /tidak tersedia/);
assert.throws(() => parseQuote(feed(entryAt, 3975.1, 3974.5), entryAt), /tidak valid/); // inverted
assert.throws(() => parseQuote(feed(entryAt, 3900, 3975), entryAt), /tidak valid/); // absurd spread
assert.throws(() => parseQuote(feed(entryAt, '3974.5', 3975.1), entryAt), /tidak valid/);
assert.throws(() => parseQuote(feed(entryAt - 60000, 3974.5, 3975.1), entryAt), /basi/); // closed market / frozen feed
assert.throws(() => parseQuote(feed(entryAt + 10000, 3974.5, 3975.1), entryAt), /masa depan/);
assert.throws(() => parseQuote({}, entryAt), /Format/);

// Schedule: exactly T−5 minutes and T+1 minute, with bounded skew/delay.
assert.equal(legTarget(release, 'entry'), entryAt);
assert.equal(legTarget(release, 'exit'), exitAt);
assert.deepEqual(dueLegs([event], entryAt).map(d => d.leg), ['entry']);
assert.deepEqual(dueLegs([event], entryAt - 5000).map(d => d.leg), ['entry']);
assert.deepEqual(dueLegs([event], entryAt + 30000).map(d => d.leg), ['entry']);
assert.deepEqual(dueLegs([event], entryAt - 5001), []);
assert.deepEqual(dueLegs([event], entryAt + 30001), []);
assert.deepEqual(dueLegs([event], release), []); // the release minute itself is not recorded
assert.deepEqual(dueLegs([event], exitAt + 2000).map(d => d.leg), ['exit']);

// Records: validated, round-trip, and cannot be created outside the window.
const tick = (leg, bid, ask, delay = 1500) => {
  const target = legTarget(release, leg);
  return makePriceTick(event, leg, { at: target + delay - 500, bid, ask, server: 'Live5' }, target + delay);
};
const entry = tick('entry', 3974.5, 3975.1), exit = tick('exit', 3980.0, 3980.8);
assert.equal(entry.id, `${event.id}-entry`);
assert.equal(entry.source, PRICE_URL);
assert.deepEqual(readPriceTick(JSON.parse(JSON.stringify(entry))), entry);
assert.throws(() => tick('entry', 3974.5, 3975.1, 31000), /tidak valid/); // too late
assert.throws(() => makePriceTick(event, 'exit', { at: exitAt - 20000, bid: 3980, ask: 3980.8, server: 'Live5' }, exitAt), /tidak valid/); // stale quote
for (const change of [{ leg: 'exit' }, { target: entryAt + 1 }, { eventId: 'PPI-1' }, { bid: 3976 }, { profile: 'prime' }, { source: 'https://example.invalid' }, { version: 2 }])
  assert.throws(() => readPriceTick({ ...entry, ...change }), /tidak valid/);

// Evaluation: bias comes from the last backend report before entry; spread is paid.
const period = '2026-09';
const macro = value => ({ fetchedAt: at, missing: [], observations: [['WPSFD4', 'PPI headline m/m'], ['WPSFD49104', 'PPI tanpa makanan/energi m/m']]
  .map(([id, label]) => ({ id, label, unit: '%', period, value })) });
const buyReport = makeAutoReport(event, at, at, 'server', macro(0.1));
const sellReport = makeAutoReport(event, at, at, 'server', macro(0.5));
const neutralReport = makeAutoReport(event, at, at, 'server', macro(0.3));
assert.deepEqual([buyReport.bias, sellReport.bias, neutralReport.bias], ['BUY', 'SELL', 'NEUTRAL']);

const [up] = evaluatePrices([buyReport], [exit, entry]);
assert.equal(up.midChange, 5.6); // (3980.4 − 3974.8)
assert.equal(up.buy, 4.9); // exit.bid − entry.ask
assert.equal(up.sell, -6.3); // entry.bid − exit.ask
assert.deepEqual([up.bias, up.result, up.aligned, up.reportId], ['BUY', 4.9, true, buyReport.id]);
const [wrong] = evaluatePrices([sellReport], [entry, exit]);
assert.deepEqual([wrong.bias, wrong.result, wrong.aligned], ['SELL', -6.3, false]);
const [flat] = evaluatePrices([neutralReport], [entry, exit]);
assert.deepEqual([flat.bias, flat.result, flat.aligned], ['NEUTRAL', null, null]);

// Mid moved the right way but less than the spread: aligned, yet a hypothetical loss.
const [thin] = evaluatePrices([buyReport], [entry, tick('exit', 3974.9, 3975.5)]);
assert.deepEqual([thin.aligned, thin.result], [true, -0.2]);

// Device previews are not published forecasts; a missing leg or mixed server is not evaluated.
const [unreported] = evaluatePrices([{ ...buyReport, origin: 'device' }], [entry, exit]);
assert.deepEqual([unreported.bias, unreported.result, unreported.reportId], [null, null, null]);
assert.deepEqual(evaluatePrices([buyReport], [entry]), []);
assert.deepEqual(evaluatePrices([buyReport], [entry, { ...exit, server: 'Live9' }]), []);
// A later report wins only if it was generated before the entry target.
const later = { ...sellReport, id: `${event.id}-pre-entry`, generatedAt: entryAt + 1 };
assert.equal(evaluatePrices([buyReport, later], [entry, exit])[0].bias, 'BUY');
assert.equal(evaluatePrices([buyReport, { ...later, generatedAt: entryAt }], [entry, exit])[0].bias, 'SELL');

assert.deepEqual(summarizePrices([up, wrong, flat]), { events: 3, directional: 2, aligned: 1, result: -1.4, alwaysBuy: 9.8, alwaysSell: -12.6 });
assert.deepEqual(summarizePrices([]), { events: 0, directional: 0, aligned: 0, result: 0, alwaysBuy: 0, alwaysSell: 0 });
console.log('automatic-prices: ok');

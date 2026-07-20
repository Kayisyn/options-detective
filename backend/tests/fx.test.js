const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createFx, STATIC_FALLBACK_RATE } = require("../services/fx");

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "od-fx-"));
  return path.join(dir, "fx.json");
}

const quote = (rate) => async () => ({ quotes: { "CAD=X": { price: rate, prevClose: rate, changePct: 0 } } });

test("fetches, caches for 24h, refresh forces a refetch", async () => {
  let calls = 0;
  let rate = 1.41;
  const fetcher = async () => { calls += 1; return (await quote(rate)()); };
  const fx = createFx({ fetcher, file: tmpFile() });

  const first = await fx.current();
  assert.equal(first.rate, 1.41);
  assert.equal(first.stale, false);
  assert.equal(calls, 1);

  rate = 1.55;
  const cached = await fx.current();       // fresh cache -> no fetch
  assert.equal(cached.rate, 1.41);
  assert.equal(calls, 1);

  const forced = await fx.current({ refresh: true });
  assert.equal(forced.rate, 1.55);
  assert.equal(calls, 2);
  assert.equal(fx.getRateSync(), 1.55);
});

test("failed fetch falls back to the last good persisted rate", async () => {
  const file = tmpFile();
  const good = createFx({ fetcher: quote(1.38), file });
  await good.current();

  // a NEW instance (fresh process) hydrates from the file; make it stale
  // by rewriting asOf into the past, then fail every fetch
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...saved, asOf: "2020-01-01T00:00:00.000Z" }));
  const broken = createFx({ fetcher: async () => { throw new Error("offline"); }, file });

  const result = await broken.current();
  assert.equal(result.rate, 1.38);   // last good rate survives
  assert.equal(result.stale, true);  // but flagged stale
});

test("never-fetched + offline -> documented static fallback", async () => {
  const fx = createFx({ fetcher: async () => { throw new Error("offline"); }, file: tmpFile() });
  const result = await fx.current();
  assert.equal(result.rate, STATIC_FALLBACK_RATE);
  assert.equal(result.stale, true);
  assert.equal(result.asOf, null);
});

test("garbage quote payloads do not poison the cache", async () => {
  const fx = createFx({
    fetcher: async () => ({ quotes: { "CAD=X": { price: -1 } } }),
    file: tmpFile(),
  });
  const result = await fx.current();
  assert.equal(result.rate, STATIC_FALLBACK_RATE);
  assert.equal(fx.getRateSync(), null);
});

#!/usr/bin/env node
/**
 * Record one hour of corridor risk: fetch the Autobahn events and rest areas,
 * the Rhine and Elbe gauges and the DWD warnings straight from their open
 * sources, score the corridors with the app's own src/freight/corridors.js,
 * and append the result to a JSON history file (newest last, 90 days kept).
 *
 * Run hourly by .github/workflows/corridor-history.yml, which keeps the file
 * on the `history` branch. Usage: node scripts/record-corridor-history.mjs
 * <history.json>. Needs no dependencies: the modules it reads are portable.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  AUTOBAHN_EVENT_SERVICES,
  AUTOBAHN_ROADS,
  mergeAutobahnRows,
  normalizeAutobahnServicePayload,
} from '../src/layers/autobahn/records.js';
import {
  PEGELONLINE_STATIONS_URL,
  kaubRow,
  normalizePegelStations,
} from '../src/layers/riverLevels/records.js';
import {
  DWD_WARNINGS_URL,
  normalizeDwdWarnings,
} from '../src/layers/weatherWarnings/records.js';
import {
  mergeTruckParkingRows,
  normalizeTruckParkingPayload,
  truckParkingUrl,
} from '../src/layers/truckParking/records.js';
import { scoreCorridors } from '../src/freight/corridors.js';

const KEEP_MS = 90 * 24 * 3_600_000;
const HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'nadeloehr-corridor-history/1.0 (+https://github.com/haziq-bangash/gods-eye-view)',
};

async function getJson(url) {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

/** One road/service at a time is polite enough for an hourly job. */
async function eachInTurn(items, task) {
  const out = [];
  for (const item of items) {
    try {
      out.push(await task(item));
    } catch (error) {
      console.warn(`skipped: ${error.message}`);
      out.push(null);
    }
  }
  return out;
}

/** A source that fails is left out (its part of the score then too). */
async function orNull(load, label) {
  try {
    return await load();
  } catch (error) {
    console.warn(`${label} unavailable: ${error.message}`);
    return null;
  }
}

export async function recordOnce(now = Date.now()) {
  const requests = AUTOBAHN_ROADS.flatMap((road) =>
    AUTOBAHN_EVENT_SERVICES.map((service) => ({ road, service })),
  );
  const eventLists = await eachInTurn(requests, async ({ road, service }) =>
    normalizeAutobahnServicePayload(
      road,
      service,
      await getJson(
        `https://verkehr.autobahn.de/o/autobahn/${road}/services/${service}`,
      ),
    ),
  );
  const answered = eventLists.filter(Boolean);
  if (answered.length * 2 < requests.length)
    throw new Error('Autobahn feed mostly unavailable; nothing recorded');
  const events = mergeAutobahnRows(answered);
  const gauges = await orNull(
    async () => normalizePegelStations(await getJson(PEGELONLINE_STATIONS_URL)),
    'PEGELONLINE',
  );
  const warnings = await orNull(
    async () => normalizeDwdWarnings(await getJson(DWD_WARNINGS_URL), now),
    'DWD',
  );
  const parkingLists = await eachInTurn(AUTOBAHN_ROADS, async (road) =>
    normalizeTruckParkingPayload(road, await getJson(truckParkingUrl(road))),
  );
  const restAreas = parkingLists.some(Boolean)
    ? mergeTruckParkingRows(parkingLists.filter(Boolean))
    : null;
  const kaub = gauges ? kaubRow(gauges) : null;
  const scored = scoreCorridors({
    events,
    kaubLevelCm: kaub?.levelCm ?? null,
    warnings,
    restAreas,
    now,
  });
  return {
    // The hour the reading stands for (UTC, on the hour).
    t: new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString(),
    kaub: kaub?.levelCm ?? null,
    corridors: Object.fromEntries(
      scored.map((entry) => [
        entry.id,
        {
          score: entry.score,
          ...Object.fromEntries(
            entry.parts.map((part) => [part.key, part.value]),
          ),
        },
      ]),
    ),
  };
}

/** Append a reading, one per hour (a re-run replaces it), 90 days kept. */
export function appendReading(history, reading, now = Date.now()) {
  const rows = (Array.isArray(history?.rows) ? history.rows : []).filter(
    (row) => row?.t !== reading.t && now - Date.parse(row?.t) <= KEEP_MS,
  );
  rows.push(reading);
  rows.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  return { version: 1, updated: new Date(now).toISOString(), rows };
}

async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error('usage: record-corridor-history.mjs <history.json>');
  let history = null;
  try {
    history = JSON.parse(await readFile(file, 'utf8'));
  } catch {
    history = null;
  }
  const reading = await recordOnce();
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await writeFile(file, `${JSON.stringify(appendReading(history, reading))}\n`);
  console.log(
    `recorded ${reading.t}:`,
    Object.entries(reading.corridors)
      .map(([id, c]) => `${id} ${c.score}`)
      .join(', '),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith('record-corridor-history.mjs')
)
  await main();

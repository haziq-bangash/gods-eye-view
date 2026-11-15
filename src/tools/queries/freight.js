/**
 * Freight corridor risk (Nadelöhr): one briefing per corridor from the same
 * live sources and scoring the app uses (src/freight/corridors.js).
 */

import { suggestView } from '../views.js';
import { defineTool, ToolError } from '../catalog.js';
import {
  CORRIDORS,
  RISK_PARTS,
  RISK_WEIGHTS,
  scoreCorridors,
} from '../../freight/corridors.js';
import { kaubRow, levelDuring } from '../../layers/riverLevels/records.js';
import { HORIZONS, horizonRange } from '../../freight/horizon.js';
import { warningGroup } from '../../layers/weatherWarnings/records.js';

const FREIGHT_LAYERS = Object.freeze([
  'autobahn-traffic',
  'river-levels',
  'weather-warnings',
  'truck-parking',
]);

/** A source's rows, or null when it failed (the score then leaves it out). */
async function rowsOrNull(source, signal) {
  try {
    return await source.getSnapshot({ signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
}

/** The corridor's bounding area, for framing the view. */
function corridorArea(corridor) {
  const lons = corridor.path.map(([lon]) => lon);
  const lats = corridor.path.map(([, lat]) => lat);
  return {
    label: `${corridor.from} → ${corridor.to}`,
    west: Math.min(...lons) - 0.4,
    south: Math.min(...lats) - 0.3,
    east: Math.max(...lons) + 0.4,
    north: Math.max(...lats) + 0.3,
  };
}

/** One part's plain reason, as in the app's breakdown. */
function partReason(entry, part) {
  if (!part.available) return 'no data right now';
  if (part.key === 'C') {
    const c = entry.counts;
    return `${c.closure || 0} closed, ${c.warning || 0} warnings, ${c['ramp-closure'] || 0} exits closed on ${entry.corridor.roads.join(', ')}`;
  }
  if (part.key === 'H') return 'Kaub gauge on the Middle Rhine';
  if (part.key === 'W') {
    const [worst] = entry.warnings;
    return worst
      ? `${warningGroup(worst.group).label} (${worst.level}) along the corridor`
      : 'no DWD warnings along the corridor';
  }
  if (part.key === 'P') {
    const p = entry.parking;
    return `${p.usableSpaces} of ${p.totalSpaces} truck spaces usable at ${p.restAreas} rest areas (${p.perHundredKm} per 100 km)`;
  }
  return '';
}

export const getCorridorRisk = defineTool({
  name: 'get_corridor_risk',
  title: 'Freight corridor risk',
  description:
    'Current disruption risk on German freight corridors (Hamburg–Dortmund on ' +
    'the A1, Hamburg–Ulm on the A7, and the Rhine axis Duisburg–Karlsruhe), ' +
    'scored 0–100 as R = 0.35·closures + 0.20·truck parking + 0.25·Rhine ' +
    'water at Kaub + 0.20·DWD weather warnings, with each part explained. ' +
    'Parts without data, and water on road-only corridors, are left out and ' +
    'the rest rescaled. A heuristic, not a delay forecast. `when` looks at ' +
    'tonight or tomorrow instead of now. Returns a link that ' +
    'opens the map framed on the corridor.',
  inputSchema: {
    type: 'object',
    properties: {
      corridor: {
        type: 'string',
        enum: CORRIDORS.map((corridor) => corridor.id),
        description: 'One corridor; omit for all of them, riskiest first.',
      },
      when: {
        type: 'string',
        enum: [...HORIZONS],
        description:
          'now (default), tonight (18:00–06:00 Berlin) or tomorrow (06:00–22:00 Berlin): announced roadworks by their schedule, DWD warnings by their times and the official Kaub forecast.',
      },
    },
    additionalProperties: false,
  },
  requires: ['autobahn', 'riverLevels', 'weatherWarnings', 'truckParking'],
  async run(args, { services, signal }) {
    const [events, gauges, warnings, restAreas] = await Promise.all([
      rowsOrNull(services.autobahn, signal),
      rowsOrNull(services.riverLevels, signal),
      rowsOrNull(services.weatherWarnings, signal),
      rowsOrNull(services.truckParking, signal),
    ]);
    if (events === null)
      throw new ToolError(
        'unavailable',
        'The Autobahn feed is unavailable, so no corridor can be scored.',
      );
    const when = args.when || 'now';
    const range = horizonRange(when);
    const kaubForRange = gauges ? kaubRow(gauges) : null;
    const scored = scoreCorridors({
      events,
      kaubLevelCm: kaubForRange ? levelDuring(kaubForRange, range) : null,
      warnings,
      restAreas,
      range: when === 'now' ? null : range,
    }).filter((entry) => !args.corridor || entry.corridor.id === args.corridor);
    const kaub = gauges ? kaubRow(gauges) : null;
    const rows = scored.map((entry) => ({
      id: entry.corridor.id,
      name: `${entry.corridor.from} → ${entry.corridor.to}`,
      roads: entry.corridor.roads,
      river: entry.corridor.river ? 'Rhine' : null,
      score: entry.score,
      level: entry.level,
      parts: entry.parts.map((part) => ({
        key: part.key,
        name: RISK_PARTS[part.key],
        value: part.value,
        weight: Math.round(part.weight * 100) / 100,
        nominal_weight: RISK_WEIGHTS[part.key],
        reason: partReason(entry, part),
      })),
      closed_roads: entry.events
        .filter((event) => event.kind === 'closure')
        .slice(0, 5)
        .map((event) => ({
          road: event.road,
          section: event.section || null,
          direction: event.direction || null,
        })),
    }));
    const first = scored[0];
    const view = first
      ? suggestView(services, {
          area: args.corridor ? corridorArea(first.corridor) : null,
          point: args.corridor ? null : { lat: 51.1, lon: 10.45 },
          altitudeM: 1_300_000,
          layers: FREIGHT_LAYERS,
        })
      : null;
    const lines = rows.map(
      (row) =>
        `${row.name} ${row.score ?? '–'}/100 (${row.level ?? 'unknown'})`,
    );
    const kaubLevel = kaub ? levelDuring(kaub, range) : null;
    const kaubLine = !Number.isFinite(kaubLevel)
      ? ''
      : when === 'now'
        ? ` Kaub reads ${kaubLevel} cm.`
        : ` Kaub forecast low ${when}: ${kaubLevel} cm.`;
    return {
      summary: `${args.corridor ? 'Corridor risk' : 'Corridor risk, riskiest first'}${when === 'now' ? '' : ` ${when}`}: ${lines.join('; ')}.${kaubLine}`,
      data: {
        view,
        formula: 'R = 0.35·C + 0.20·P + 0.25·H + 0.20·W',
        when,
        range: {
          from: new Date(range[0]).toISOString(),
          to: new Date(range[1]).toISOString(),
        },
        kaub_cm: Number.isFinite(kaubLevel) ? kaubLevel : null,
        rows,
        sources: [
          'Die Autobahn GmbH des Bundes',
          'PEGELONLINE (WSV)',
          'Deutscher Wetterdienst (CC BY 4.0)',
        ],
      },
    };
  },
});

/**
 * When an Autobahn closure or roadworks applies, read from the German
 * notice. Autobahn GmbH writes it in two ways:
 *
 *   Zeitraum dieser Bauphase: / Beginn: 21.11.26 um 21:00 Uhr /
 *   Ende: 22.11.26 um 12:00 Uhr / (Ende der Gesamtmaßnahme: 27.12.28)
 *
 *   Die Baustelle ist zu folgenden Zeiträumen gültig: /
 *   16.11.26 22:00 bis zum 17.11.26 05:30 Uhr. / 18.11.26 von 10:30 bis
 *   11:30 Uhr / (Ende der Gesamtmaßnahme: 30.10.27)
 *
 * Times are Berlin wall-clock. Portable: no Vue or Cesium.
 */
import { berlinTime } from '../freight/horizon.js';

const DATE = String.raw`(\d{1,2})\.(\d{1,2})\.(\d{2,4})`;
const TIME = String.raw`(\d{1,2}):(\d{2})`;

function instant(d, m, y, hh = '0', mm = '0') {
  const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);
  const value = berlinTime(year, Number(m), Number(d), Number(hh), Number(mm));
  return Number.isFinite(value) ? value : null;
}

/**
 * The time windows and the project's end in a notice's lines.
 * @param {string[]} lines
 * @returns {{windows: Array<[number, number]>, projectEnd: number|null}}
 */
export function parseSchedule(lines = []) {
  const windows = [];
  let begin = null;
  let projectEnd = null;
  for (const raw of Array.isArray(lines) ? lines : []) {
    const line = String(raw);
    let match;
    if ((match = new RegExp(`Gesamtmaßnahme:\\s*${DATE}`).exec(line))) {
      // The whole project ends that day: count the day in.
      const day = instant(match[1], match[2], match[3]);
      projectEnd = day === null ? null : day + 24 * 60 * 60 * 1000 - 60_000;
    } else if (
      (match = new RegExp(`^Beginn:\\s*${DATE}\\s+um\\s+${TIME}`).exec(line))
    ) {
      begin = instant(...match.slice(1));
    } else if (
      (match = new RegExp(`^Ende:\\s*${DATE}\\s+um\\s+${TIME}`).exec(line))
    ) {
      const end = instant(...match.slice(1));
      if (begin !== null && end !== null && end > begin)
        windows.push([begin, end]);
      begin = null;
    } else if (
      (match = new RegExp(
        `^${DATE}\\s+${TIME}\\s+bis zum\\s+${DATE}\\s+${TIME}`,
      ).exec(line))
    ) {
      const from = instant(...match.slice(1, 6));
      const to = instant(...match.slice(6, 11));
      if (from !== null && to !== null && to > from) windows.push([from, to]);
    } else if (
      (match = new RegExp(`^${DATE}\\s+von\\s+${TIME}\\s+bis\\s+${TIME}`).exec(
        line,
      ))
    ) {
      const [, d, m, y, h1, m1, h2, m2] = match;
      const from = instant(d, m, y, h1, m1);
      let to = instant(d, m, y, h2, m2);
      // "22:00 bis 05:00" on one date runs into the next morning.
      if (from !== null && to !== null && to <= from) to += 24 * 60 * 60 * 1000;
      if (from !== null && to !== null) windows.push([from, to]);
    }
  }
  windows.sort((a, b) => a[0] - b[0]);
  return { windows, projectEnd };
}

/** True when a notice line is part of the schedule, so a card can fold it. */
export function isScheduleLine(line) {
  return new RegExp(
    `^(Zeitraum dieser Bauphase|Die Baustelle ist zu folgenden Zeiträumen|Beginn:|Ende:|\\(Ende der Gesamtmaßnahme|${DATE}\\s+(?:${TIME}\\s+bis zum|von))`,
  ).test(String(line));
}

/**
 * What a card says about timing at `now`: the window in force (or the next
 * one), how far through it we are, how many more windows follow, and the
 * project's end. Null when the notice gives no times.
 */
export function scheduleNow(lines, now = Date.now()) {
  const { windows, projectEnd } = parseSchedule(lines);
  if (!windows.length && projectEnd === null) return null;
  const current =
    windows.find(([from, to]) => from <= now && now < to) ||
    windows.find(([from]) => from > now) ||
    null;
  const later = current
    ? windows.filter(([from]) => from > current[0]).length
    : 0;
  return {
    from: current?.[0] ?? null,
    to: current?.[1] ?? null,
    active: Boolean(current && current[0] <= now),
    progress:
      current && current[0] <= now
        ? Math.min(1, (now - current[0]) / (current[1] - current[0]))
        : 0,
    later,
    projectEnd:
      projectEnd !== null && (!current || projectEnd > current[1] + 86_400_000)
        ? projectEnd
        : null,
  };
}

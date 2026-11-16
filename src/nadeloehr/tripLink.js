/**
 * A link that opens a checked trip: the two places, the departure time and
 * Now, Tonight or Tomorrow. A dispatcher sends it; the driver's phone opens
 * the same route, verdict, breaks and closure times.
 *
 *   ?from=Hamburg&to=M%C3%BCnchen&leave=18%3A00&when=tonight
 *
 * Pure: no DOM.
 */

const HORIZONS = Object.freeze(['now', 'tonight', 'tomorrow']);
const MAX_PLACE = 80;
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** The query string for a trip ('' without both places). */
export function tripQuery({ from, to, leave = '', when = 'now' } = {}) {
  const a = String(from || '')
    .trim()
    .slice(0, MAX_PLACE);
  const b = String(to || '')
    .trim()
    .slice(0, MAX_PLACE);
  if (!a || !b) return '';
  const params = new URLSearchParams({ from: a, to: b });
  if (TIME.test(leave)) params.set('leave', leave);
  if (HORIZONS.includes(when) && when !== 'now') params.set('when', when);
  return `?${params}`;
}

/** The trip a query string asks for, or null when it names none. */
export function readTripQuery(search) {
  const params = new URLSearchParams(String(search || ''));
  const from = (params.get('from') || '').trim().slice(0, MAX_PLACE);
  const to = (params.get('to') || '').trim().slice(0, MAX_PLACE);
  if (!from || !to) return null;
  const leave = params.get('leave') || '';
  const when = params.get('when') || 'now';
  return {
    from,
    to,
    leave: TIME.test(leave) ? leave : '',
    when: HORIZONS.includes(when) ? when : 'now',
  };
}

/** The page URL without the trip's parameters, others kept. */
export function withoutTrip(href) {
  const url = new URL(href);
  for (const key of ['from', 'to', 'leave', 'when'])
    url.searchParams.delete(key);
  return url.toString();
}

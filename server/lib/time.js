// Day-boundary math pinned to Africa/Lagos (WAT, a fixed UTC+1 with no
// DST), independent of the host process's own timezone. Deployment
// platforms like Vercel reserve the `TZ` env var name and won't let you
// set it, so "today"/"this week" can't rely on the server's local time —
// these helpers compute Lagos wall-clock boundaries directly instead.
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // WAT = UTC+1

function startOfDayLagos(date = new Date()) {
  const shifted = new Date(date.getTime() + LAGOS_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - LAGOS_OFFSET_MS);
}

function endOfDayLagos(date = new Date()) {
  return new Date(startOfDayLagos(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

module.exports = { startOfDayLagos, endOfDayLagos };

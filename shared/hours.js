import { business, DAY_NAMES, formatHour } from './business.js';

const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Jour ISO (1 = lundi) et minutes écoulées depuis minuit, dans le fuseau demandé. */
export function zonedParts(date, timeZone = business.timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    iso: WEEKDAYS_EN.indexOf(get('weekday')) + 1,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Date du jour « AAAA-MM-JJ » dans le fuseau de la boutique. */
export function zonedDateString(date = new Date(), timeZone = business.timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/**
 * Statut d'ouverture à un instant donné.
 * → { open, label, closesAt?, closingSoon?, opensAt?, opensDay?, todayIso }
 */
export function openingStatus(date = new Date(), { hours = business.hours, timeZone = business.timeZone } = {}) {
  const { iso, minutes } = zonedParts(date, timeZone);
  const slotFor = (day) => hours.find((h) => h.days.includes(day));

  const today = slotFor(iso);
  if (today && minutes >= toMinutes(today.open) && minutes < toMinutes(today.close)) {
    const left = toMinutes(today.close) - minutes;
    const closingSoon = left <= 30;
    return {
      open: true,
      todayIso: iso,
      closesAt: today.close,
      closingSoon,
      label: closingSoon
        ? `Ouvert · ferme bientôt (${formatHour(today.close)})`
        : `Ouvert · jusqu’à ${formatHour(today.close)}`,
    };
  }

  for (let offset = 0; offset < 8; offset += 1) {
    const day = ((iso - 1 + offset) % 7) + 1;
    const slot = slotFor(day);
    if (!slot) continue;
    if (offset === 0 && minutes >= toMinutes(slot.open)) continue;
    const when = offset === 0 ? 'aujourd’hui' : offset === 1 ? 'demain' : DAY_NAMES[day - 1];
    return {
      open: false,
      todayIso: iso,
      opensAt: slot.open,
      opensDay: when,
      label: `Fermé · ouvre ${when} à ${formatHour(slot.open)}`,
    };
  }

  return { open: false, todayIso: iso, label: 'Fermé' };
}

/**
 * How long after its deadline a missed occurrence still triggers an alert.
 * Past that, the occurrence is still marked MISSING but nobody is notified:
 * the first run after alerts start working (or after a long outage) would
 * otherwise send every missed occurrence of the 90-day look-back at once.
 */
export const ALERT_CATCH_UP_MS = 48 * 60 * 60 * 1000;

export function isWithinAlertCatchUp(periodEnd: Date, now: Date): boolean {
  return now.getTime() - periodEnd.getTime() <= ALERT_CATCH_UP_MS;
}

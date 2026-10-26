export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export function nowIso(clock: Clock): string {
  return clock().toISOString();
}

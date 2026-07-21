export const BLINK_LIMITS = { minMs: 50, maxMs: 10_000, minCount: 1, maxCount: 100 } as const;
export const SENSOR_INTERVALS = [100, 250, 500, 1000] as const;
export const DEFAULT_BLINK = { onMs: 250, offMs: 250, count: 5 } as const;
export const DEFAULT_SENSOR_INTERVAL = 250;
export const MAX_HISTORY = 60;

export type LedState = { on: boolean; blinking: boolean };
export type SensorSubscription = { streaming: boolean; intervalMs: number };
export type DeviceSnapshot = LedState & SensorSubscription;

export type AnalogReading = {
  sequence: number;
  raw: number;
  millivolts: number;
  uptimeMs: number;
  receivedAt: number;
};

export type Esp32CommandMap = {
  'system.snapshot': { args: Record<string, never>; result: DeviceSnapshot };
  'led.set': { args: { on: boolean }; result: LedState };
  'led.blink': { args: { onMs: number; offMs: number; count: number }; result: LedState };
  'sensor.subscribe': { args: { intervalMs: number }; result: SensorSubscription };
  'sensor.unsubscribe': { args: Record<string, never>; result: SensorSubscription };
};

export type CommandName = keyof Esp32CommandMap;

export type DeviceEvent =
  | { type: 'state'; state: LedState }
  | { type: 'analog'; reading: AnalogReading };

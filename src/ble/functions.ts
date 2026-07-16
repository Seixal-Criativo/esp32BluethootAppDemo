/**
 * Add a switchable BLE function here, then add the same id to OUTPUTS in the
 * ESP32 sketch. The app automatically renders a switch for every entry.
 */
export const CONTROLLER_FUNCTIONS = [
  {
    id: 'LED',
    label: 'GPIO 12 LED',
    description: 'External LED connected to GPIO 12',
  },
  // Example: { id: 'RELAY', label: 'Relay', description: 'Relay module on GPIO 13' },
] as const;

export type ControllerFunctionId = (typeof CONTROLLER_FUNCTIONS)[number]['id'];
export type ControllerFunctionStates = Record<ControllerFunctionId, boolean>;

export const createInitialFunctionStates = (): ControllerFunctionStates =>
  Object.fromEntries(CONTROLLER_FUNCTIONS.map((item) => [item.id, false])) as ControllerFunctionStates;

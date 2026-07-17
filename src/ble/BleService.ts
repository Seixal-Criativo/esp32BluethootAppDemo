import { PermissionsAndroid, Platform } from 'react-native';
import { BleError, BleManager, Device, State, Subscription } from 'react-native-ble-plx';

import { CONTROL_CHARACTERISTIC_UUID, DEVICE_NAME, EVENT_CHARACTERISTIC_UUID, fromBleValue, SERVICE_UUID, toBleValue } from './constants';
import { parseEvent, parseLedState, parseResponse, parseSnapshot, parseSubscription, serializeCommand } from './protocol';
import { AnalogReading, CommandName, Esp32CommandMap, LedState } from './types';

const SCAN_TIMEOUT_MS = 12_000;
const COMMAND_TIMEOUT_MS = 5_000;
type Pending = { command: CommandName; resolve: (fields: Record<string, string>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class BleService {
  private readonly manager = new BleManager();
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private eventSubscription: Subscription | null = null;
  private disconnectSubscription: Subscription | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, Pending>();

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    if (Platform.Version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT]);
      return result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED && result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED;
    }
    return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION)) === PermissionsAndroid.RESULTS.GRANTED;
  }

  async waitForBluetooth(): Promise<void> {
    if (await this.manager.state() === State.PoweredOn) return;
    await new Promise<void>((resolve, reject) => {
      let subscription: Subscription | null = null;
      const timeout = setTimeout(() => { subscription?.remove(); reject(new Error('Turn Bluetooth on, then try again.')); }, 10_000);
      subscription = this.manager.onStateChange((state) => { if (state === State.PoweredOn) { clearTimeout(timeout); subscription?.remove(); resolve(); } }, true);
    });
  }

  scanForEsp32(onFound: (device: Device) => void, onError: (message: string) => void): void {
    this.stopScan();
    this.manager.startDeviceScan([SERVICE_UUID], null, (error: BleError | null, device: Device | null) => {
      if (error) { this.stopScan(); onError(error.message); return; }
      if (device?.name === DEVICE_NAME || device?.localName === DEVICE_NAME) { this.stopScan(); onFound(device); }
    });
    this.scanTimer = setTimeout(() => { this.stopScan(); onError(`Couldn't find ${DEVICE_NAME}. Check that the ESP32 is powered and nearby.`); }, SCAN_TIMEOUT_MS);
  }

  stopScan(): void { this.manager.stopDeviceScan(); if (this.scanTimer) clearTimeout(this.scanTimer); this.scanTimer = null; }

  async connect(device: Device): Promise<Device> {
    let connected = await this.manager.connectToDevice(device.id, { timeout: 10_000 });
    if (Platform.OS === 'android') connected = await connected.requestMTU(185);
    return connected.discoverAllServicesAndCharacteristics();
  }

  subscribe(deviceId: string, handlers: { onState: (state: LedState) => void; onAnalogReading: (reading: AnalogReading) => void; onProtocolError: (message: string) => void; onDisconnected: (message: string) => void }): void {
    this.eventSubscription?.remove();
    this.disconnectSubscription?.remove();
    this.eventSubscription = this.manager.monitorCharacteristicForDevice(deviceId, SERVICE_UUID, EVENT_CHARACTERISTIC_UUID, (error, characteristic) => {
      if (error) { handlers.onProtocolError(error.message); return; }
      try {
        const frame = fromBleValue(characteristic?.value ?? null);
        if (frame.startsWith('R|')) this.handleResponse(frame);
        else {
          const event = parseEvent(frame);
          if (event.type === 'state') handlers.onState(event.state); else handlers.onAnalogReading(event.reading);
        }
      } catch (eventError) { handlers.onProtocolError(eventError instanceof Error ? eventError.message : 'Invalid BLE event.'); }
    });
    this.disconnectSubscription = this.manager.onDeviceDisconnected(deviceId, (error) => {
      this.clearConnection(new Error(error?.message || 'ESP32 disconnected.'));
      handlers.onDisconnected(error?.message || 'ESP32 disconnected.');
    });
  }

  async invoke<K extends CommandName>(deviceId: string, command: K, args: Esp32CommandMap[K]['args']): Promise<Esp32CommandMap[K]['result']> {
    const id = this.nextRequestId++;
    const frame = serializeCommand(id, command, args);
    const fields = await new Promise<Record<string, string>>(async (resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${command} timed out.`)); }, COMMAND_TIMEOUT_MS);
      this.pending.set(id, { command, resolve, reject, timer });
      try {
        await this.manager.writeCharacteristicWithResponseForDevice(deviceId, SERVICE_UUID, CONTROL_CHARACTERISTIC_UUID, toBleValue(frame));
      } catch (error) {
        clearTimeout(timer); this.pending.delete(id); reject(error);
      }
    });
    if (command === 'system.snapshot') return parseSnapshot(fields) as Esp32CommandMap[K]['result'];
    if (command === 'led.set' || command === 'led.blink') return parseLedState(fields) as Esp32CommandMap[K]['result'];
    return parseSubscription(fields) as Esp32CommandMap[K]['result'];
  }

  private handleResponse(frame: string): void {
    const response = parseResponse(frame);
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(response.id);
    if (response.ok) pending.resolve(response.fields); else pending.reject(new Error(response.message));
  }

  private clearConnection(error: Error): void {
    this.eventSubscription?.remove(); this.eventSubscription = null;
    this.disconnectSubscription?.remove(); this.disconnectSubscription = null;
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
  }

  async disconnect(deviceId: string): Promise<void> {
    this.stopScan(); this.clearConnection(new Error('Disconnected.'));
    if (await this.manager.isDeviceConnected(deviceId)) await this.manager.cancelDeviceConnection(deviceId);
  }

  destroy(): void { this.stopScan(); this.clearConnection(new Error('BLE service closed.')); this.manager.destroy(); }
}

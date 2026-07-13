import { PermissionsAndroid, Platform } from 'react-native';
import { BleError, BleManager, Device, State, Subscription } from 'react-native-ble-plx';

import {
  DEVICE_NAME,
  LED_CHARACTERISTIC_UUID,
  LED_OFF_VALUE,
  LED_ON_VALUE,
  SERVICE_UUID,
  stateFromBase64,
} from './constants';

const SCAN_TIMEOUT_MS = 12_000;

export class BleService {
  private readonly manager = new BleManager();
  private scanTimer: ReturnType<typeof setTimeout> | null = null;

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    if (Platform.Version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      return (
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
        result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
      );
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  }

  async waitForBluetooth(): Promise<void> {
    const currentState = await this.manager.state();
    if (currentState === State.PoweredOn) return;

    await new Promise<void>((resolve, reject) => {
      let subscription: Subscription | null = null;
      const timeout = setTimeout(() => {
        subscription?.remove();
        reject(new Error('Turn Bluetooth on, then try again.'));
      }, 10_000);

      subscription = this.manager.onStateChange((state) => {
        if (state === State.PoweredOn) {
          clearTimeout(timeout);
          subscription?.remove();
          resolve();
        }
      }, true);
    });
  }

  scanForEsp32(onFound: (device: Device) => void, onError: (message: string) => void): void {
    this.stopScan();
    this.manager.startDeviceScan([SERVICE_UUID], null, (error: BleError | null, device: Device | null) => {
      if (error) {
        this.stopScan();
        onError(error.message);
        return;
      }

      if (device?.name === DEVICE_NAME || device?.localName === DEVICE_NAME) {
        this.stopScan();
        onFound(device);
      }
    });

    this.scanTimer = setTimeout(() => {
      this.stopScan();
      onError(`Couldn't find ${DEVICE_NAME}. Check that the ESP32 is powered and nearby.`);
    }, SCAN_TIMEOUT_MS);
  }

  stopScan(): void {
    this.manager.stopDeviceScan();
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
  }

  async connect(device: Device): Promise<Device> {
    const connected = await this.manager.connectToDevice(device.id, { timeout: 10_000 });
    return connected.discoverAllServicesAndCharacteristics();
  }

  async readLedState(deviceId: string): Promise<boolean | null> {
    const characteristic = await this.manager.readCharacteristicForDevice(
      deviceId,
      SERVICE_UUID,
      LED_CHARACTERISTIC_UUID,
    );
    return stateFromBase64(characteristic.value);
  }

  async writeLedState(deviceId: string, isOn: boolean): Promise<void> {
    await this.manager.writeCharacteristicWithResponseForDevice(
      deviceId,
      SERVICE_UUID,
      LED_CHARACTERISTIC_UUID,
      isOn ? LED_ON_VALUE : LED_OFF_VALUE,
    );
  }

  async disconnect(deviceId: string): Promise<void> {
    this.stopScan();
    if (await this.manager.isDeviceConnected(deviceId)) {
      await this.manager.cancelDeviceConnection(deviceId);
    }
  }

  destroy(): void {
    this.stopScan();
    this.manager.destroy();
  }
}

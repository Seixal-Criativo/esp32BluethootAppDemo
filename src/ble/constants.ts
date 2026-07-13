export const DEVICE_NAME = 'ESP32_LED';

export const SERVICE_UUID = '7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001';
export const LED_CHARACTERISTIC_UUID = '7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001';

// react-native-ble-plx transfers characteristic data as Base64.
export const LED_ON_VALUE = 'MQ=='; // ASCII "1"
export const LED_OFF_VALUE = 'MA=='; // ASCII "0"

export const stateFromBase64 = (value: string | null): boolean | null => {
  if (value === LED_ON_VALUE) return true;
  if (value === LED_OFF_VALUE) return false;
  return null;
};

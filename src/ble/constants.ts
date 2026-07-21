export const DEVICE_NAME = 'ESP32_LED';

export const SERVICE_UUID = '7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001';
// One reusable command characteristic for every controller function.
export const CONTROL_CHARACTERISTIC_UUID = '7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001';
export const EVENT_CHARACTERISTIC_UUID = '7B6F0003-6F6D-4A39-8F7D-0EEB5D4D0001';
export const MAX_FRAME_LENGTH = 160;

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// BLE-PLX sends characteristic values as Base64. Controller commands are ASCII only.
export const toBleValue = (text: string): string => {
  let result = '';

  for (let index = 0; index < text.length; index += 3) {
    const first = text.charCodeAt(index);
    const hasSecond = index + 1 < text.length;
    const hasThird = index + 2 < text.length;
    const second = hasSecond ? text.charCodeAt(index + 1) : 0;
    const third = hasThird ? text.charCodeAt(index + 2) : 0;

    result += BASE64_ALPHABET[first >> 2];
    result += BASE64_ALPHABET[((first & 0b11) << 4) | (second >> 4)];
    result += hasSecond ? BASE64_ALPHABET[((second & 0b1111) << 2) | (third >> 6)] : '=';
    result += hasThird ? BASE64_ALPHABET[third & 0b111111] : '=';
  }

  return result;
};

export const fromBleValue = (value: string | null): string => {
  if (!value) return '';

  let buffer = 0;
  let bits = 0;
  let result = '';

  for (const character of value) {
    if (character === '=') break;
    const encoded = BASE64_ALPHABET.indexOf(character);
    if (encoded < 0) continue;

    buffer = (buffer << 6) | encoded;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      result += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }

  return result;
};

import { MAX_FRAME_LENGTH } from './constants';
import { CommandName, DeviceEvent, DeviceSnapshot, LedState, SensorSubscription } from './types';

type Scalar = boolean | number | string;
type Fields = Record<string, string>;

const parseFields = (text: string): Fields => {
  const fields: Fields = {};
  if (!text) return fields;
  for (const part of text.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) throw new Error('Malformed protocol field.');
    fields[part.slice(0, separator)] = part.slice(separator + 1);
  }
  return fields;
};

const numberField = (fields: Fields, key: string): number => {
  const value = Number(fields[key]);
  if (!Number.isFinite(value)) throw new Error(`Invalid ${key} value.`);
  return value;
};

const booleanField = (fields: Fields, key: string): boolean => {
  if (fields[key] === '1') return true;
  if (fields[key] === '0') return false;
  throw new Error(`Invalid ${key} value.`);
};

export const serializeCommand = (id: number, name: CommandName, args: object): string => {
  const values = Object.entries(args as Record<string, Scalar>)
    .map(([key, value]) => `${key}=${typeof value === 'boolean' ? (value ? 1 : 0) : value}`)
    .join(';');
  const frame = `C|${id}|${name}|${values}`;
  if (frame.length > MAX_FRAME_LENGTH) throw new Error('Command is too large for the BLE protocol.');
  return frame;
};

export type ParsedResponse = { id: number; ok: true; fields: Fields } | { id: number; ok: false; message: string };

export const parseResponse = (frame: string): ParsedResponse => {
  if (frame.length > MAX_FRAME_LENGTH) throw new Error('Received an oversized BLE frame.');
  const [type, idText, status, payload = ''] = frame.split('|');
  const id = Number(idText);
  if (type !== 'R' || !Number.isInteger(id) || id < 1) throw new Error('Malformed response frame.');
  const fields = parseFields(payload);
  if (status === 'ok') return { id, ok: true, fields };
  if (status === 'error') return { id, ok: false, message: fields.message || fields.code || 'ESP32 command failed.' };
  throw new Error('Unknown response status.');
};

export const parseEvent = (frame: string): DeviceEvent => {
  if (frame.length > MAX_FRAME_LENGTH) throw new Error('Received an oversized BLE frame.');
  const [type, name, payload = ''] = frame.split('|');
  if (type !== 'E') throw new Error('Malformed event frame.');
  const fields = parseFields(payload);
  if (name === 'state') return { type: 'state', state: parseLedState(fields) };
  if (name === 'analog') {
    return {
      type: 'analog',
      reading: {
        sequence: numberField(fields, 'seq'), raw: numberField(fields, 'raw'),
        millivolts: numberField(fields, 'mv'), uptimeMs: numberField(fields, 'uptimeMs'), receivedAt: Date.now(),
      },
    };
  }
  throw new Error(`Unknown event type: ${name}`);
};

export const parseLedState = (fields: Fields): LedState => ({ on: booleanField(fields, 'on'), blinking: booleanField(fields, 'blinking') });
export const parseSubscription = (fields: Fields): SensorSubscription => ({ streaming: booleanField(fields, 'streaming'), intervalMs: numberField(fields, 'intervalMs') });
export const parseSnapshot = (fields: Fields): DeviceSnapshot => ({ ...parseLedState(fields), ...parseSubscription(fields) });

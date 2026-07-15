# Extending the Bluetooth Controller

## Overview

This project controls ESP32 hardware from an Android React Native app through Bluetooth Low Energy (BLE). There is no Wi-Fi connection, cloud service, or backend.

```text
React Native app
  → finds ESP32_LED by BLE scan
  → connects and completes Bluetooth pairing
  → writes a readable command, for example LED:1
  → ESP32 validates the command
  → ESP32 changes the matching GPIO output
```

The ESP32 returns a state snapshot after connecting or processing a command, for example:

```text
LED=1;RELAY=0
```

## BLE contract

| Item | Value |
| --- | --- |
| Device name | `ESP32_LED` |
| Service UUID | `7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Control characteristic UUID | `7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Security | Encrypted BLE characteristic with Just Works bonding |
| Turn a function ON | `FUNCTION_ID:1` |
| Turn a function OFF | `FUNCTION_ID:0` |
| Request all states | `GET` |
| State response | `FUNCTION_ID=0;OTHER_ID=1` |

The app converts commands to Base64 before sending them because `react-native-ble-plx` expects characteristic values in Base64. You only work with normal text such as `LED:1`; the conversion is handled in `src/ble/constants.ts`.

## Main project files

| File | Purpose |
| --- | --- |
| `firmware/Esp32LedBle/Esp32LedBle.ino` | ESP32 BLE server, command validation, and GPIO outputs |
| `src/ble/functions.ts` | App function registry; controls are generated from this list |
| `src/ble/BleService.ts` | BLE scan, connection, state reads, and command writes |
| `src/ble/constants.ts` | BLE name, UUIDs, Base64 conversion, and protocol helpers |
| `App.tsx` | Connection screen and automatically rendered switches |

## Add a new ON/OFF function

Adding a switchable GPIO output requires one matching entry in the ESP32 registry and the app registry.

### Step 1 — Add the ESP32 output

Open `firmware/Esp32LedBle/Esp32LedBle.ino` and find `OUTPUTS`:

```cpp
OutputFunction OUTPUTS[] = {
  {"LED", 12, false, false},
  // {"RELAY", 13, false, false},
};
```

Add a row for the new output. For a relay on GPIO 13:

```cpp
{"RELAY", 13, false, false},
```

Each value means:

```text
{ "FUNCTION_ID", GPIO_PIN, ACTIVE_LOW, INITIAL_STATE }
```

- `FUNCTION_ID`: uppercase identifier used by BLE and the app, for example `RELAY`.
- `GPIO_PIN`: ESP32 output pin, for example `13`.
- `ACTIVE_LOW`: use `false` for normal HIGH = ON wiring; use `true` only for inverted hardware.
- `INITIAL_STATE`: normally `false`, so the device starts safely OFF.

### Step 2 — Add the matching app function

Open `src/ble/functions.ts` and add the same ID:

```ts
export const CONTROLLER_FUNCTIONS = [
  {
    id: 'LED',
    label: 'GPIO 12 LED',
    description: 'External LED connected to GPIO 12',
  },
  {
    id: 'RELAY',
    label: 'Relay',
    description: 'Relay module connected to GPIO 13',
  },
] as const;
```

The app automatically creates the Relay switch. You do not need to add a new UUID, create another BLE service, or edit `App.tsx` for a regular ON/OFF output.

### Step 3 — Compile, upload, and reload

1. Compile and upload the `.ino` sketch to the ESP32.
2. Reload the Expo development app.
3. Connect to `ESP32_LED`.
4. The new switch appears automatically.
5. Toggle it and verify the connected hardware responds.

## Example: add a buzzer

For an active buzzer on GPIO 14:

```cpp
// firmware/Esp32LedBle/Esp32LedBle.ino
{"BUZZER", 14, false, false},
```

```ts
// src/ble/functions.ts
{ id: 'BUZZER', label: 'Buzzer', description: 'Active buzzer on GPIO 14' },
```

The app sends `BUZZER:1` to turn it on and `BUZZER:0` to turn it off.

> For motors, solenoids, relay coils, LED strips, and other high-current equipment, use a suitable transistor, MOSFET, relay module, flyback diode, and separate power supply as required. Do not power a load directly from an ESP32 GPIO.

## Add richer functions

The registry is designed for simple binary outputs. Use the same control characteristic but add a dedicated command handler for more complex features:

| Feature | Example command | App control |
| --- | --- | --- |
| PWM brightness | `BRIGHTNESS:128` | Slider |
| Servo angle | `SERVO:90` | Slider or preset buttons |
| Timed buzzer | `BEEP:500` | Button |
| Sensor state | `TEMPERATURE=23.4` | Text value or chart |

For these, validate the number and permitted range in the ESP32 sketch before operating hardware. Add the corresponding UI control in `App.tsx` and a typed write helper in `BleService.ts` if the function is not a simple ON/OFF switch.

## Safety and maintenance rules

- Function IDs must match exactly in `OUTPUTS` and `CONTROLLER_FUNCTIONS`.
- Use uppercase IDs containing letters, numbers, and underscores only.
- Start new physical outputs in the OFF state unless there is a clear reason not to.
- Validate all BLE input on the ESP32 before changing GPIO state.
- Do not reuse an ESP32 boot-strapping pin without checking its boot behaviour.
- JavaScript-only app changes require an Expo reload; native dependency/configuration changes require a new Android development build.
- Every `.ino` change requires compilation and an ESP32 firmware upload.

## Troubleshooting

| Issue | Solution |
| --- | --- |
| New switch is missing | Confirm the item was added to `CONTROLLER_FUNCTIONS` and reload the app. |
| Switch appears but does nothing | Confirm the exact same ID exists in `OUTPUTS`, then compile and upload the ESP32 sketch. |
| ESP32 rejects a command | Check the Serial Monitor at 115200 baud; the firmware logs invalid or unknown commands. |
| App cannot reconnect | Forget `ESP32_LED` in Android Bluetooth settings, restart the ESP32, then scan again. |
| Firmware cannot upload | Close Serial Monitor or any application using the ESP32 COM port, then upload again. |

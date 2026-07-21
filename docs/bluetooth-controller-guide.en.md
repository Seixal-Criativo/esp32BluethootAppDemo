# Extending the Bluetooth Function Controller

## Architecture

The Android app does not execute Arduino code remotely. It invokes functions compiled into the ESP32 firmware. This is safer, validates arguments, and lets long-running behavior coexist with sensor telemetry.

```text
App UI → BleService.invoke() → encrypted command characteristic
                                  ↓
                         firmware COMMANDS registry
                                  ↓
App state ← response/state/sensor notifications ← event characteristic
```

`react-native-ble-plx` carries characteristic values as Base64. `src/ble/constants.ts` performs that transport conversion; protocol code and firmware work with readable ASCII frames.

## BLE interface

| Item | Value |
| --- | --- |
| Device name | `ESP32_LED` |
| Service UUID | `7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Command UUID | `7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Event UUID | `7B6F0003-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Security | Encrypted BLE bonding (Just Works) |
| Maximum frame | 160 ASCII bytes |

Commands are written with a response at the BLE transport level. Function results arrive asynchronously through the event notification characteristic:

```text
C|requestId|function.name|key=value;key=value
R|requestId|ok|key=value;key=value
R|requestId|error|code=CODE;message=description
E|event.name|key=value;key=value
```

The request ID lets the app match concurrent responses. Values may not contain `|`, `;`, or `=`. App requests time out after five seconds.

## Built-in functions

| Function | Arguments | Result |
| --- | --- | --- |
| `system.snapshot` | none | LED, blink, and stream state |
| `led.set` | `on=0|1` | LED and blink state |
| `led.blink` | `onMs=50..10000`, `offMs=50..10000`, `count=1..100` | LED and blink state |
| `sensor.subscribe` | `intervalMs=100..5000` | stream state and interval |
| `sensor.unsubscribe` | none | stream state and interval |

`led.set` cancels an active blink. Blinking uses a `millis()` state machine rather than blocking delays, so analog events continue while it runs. The firmware stops streaming automatically when the phone disconnects.

Events are:

- `E|state|on=0;blinking=0`
- `E|analog|seq=1;raw=2048;mv=1650;uptimeMs=12345`

## Add a callable firmware function

1. Add a handler to `firmware/Esp32LedBle/Esp32LedBle.ino` with this signature:

   ```cpp
   void relayPulse(uint32_t id, const String& arguments) {
     uint32_t durationMs;
     if (!unsignedArgument(arguments, "durationMs", 50, 5000, durationMs)) {
       errorResponse(id, "INVALID_ARGUMENT", "durationMs must be 50 to 5000");
       return;
     }

     // Start non-blocking hardware behavior here.
     response(id, "active=1");
   }
   ```

2. Register it in `COMMANDS`:

   ```cpp
   {"relay.pulse", relayPulse},
   ```

3. Add the command to `Esp32CommandMap` in `src/ble/types.ts`:

   ```ts
   'relay.pulse': {
     args: { durationMs: number };
     result: { active: boolean };
   };
   ```

4. Parse its result in `BleService.invoke`, then build a validated UI control that calls:

   ```ts
   await ble.invoke(device.id, 'relay.pulse', { durationMs: 500 });
   ```

5. Compile and flash the firmware, rebuild/reload the app, and test valid, invalid, disconnect, and timeout cases.

Keep handlers short. Any timed motor, relay, animation, or sampling work should store state and advance from `loop()` with wrap-safe `millis()` comparisons.

## Add another live sensor

For a new sensor event:

1. Initialize the sensor in firmware `setup()`.
2. Add subscribe/unsubscribe functions or extend the existing sensor subscription deliberately.
3. Read on schedule from `loop()` and publish a compact named event.
4. Add the event shape to `DeviceEvent` in `src/ble/types.ts`.
5. Parse and validate it in `src/ble/protocol.ts`.
6. Route it from `BleService.subscribe` to a UI callback.
7. Limit retained samples so the app does not grow memory indefinitely.

BLE is appropriate for compact live measurements, not high-bandwidth audio or video. Increase the interval or pack a binary protocol if measurements become too large or frequent.

## GPIO 34 analog demo

```text
ESP32 3.3 V   ── potentiometer outer leg
ESP32 GND     ── potentiometer other outer leg
ESP32 GPIO 34 ── potentiometer center/wiper
```

GPIO 34 is input-only. The signal must remain between 0 V and 3.3 V. `analogReadMilliVolts()` is convenient but should not be treated as laboratory calibration.

## Verification

```powershell
npx tsc --noEmit
npx expo install --check
npx expo run:android
```

Upload the matching sketch with Arduino IDE. If bonding behaves incorrectly after a protocol or firmware upgrade, forget `ESP32_LED` in Android Bluetooth settings, restart the ESP32, and pair again.

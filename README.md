# ESP32 Bluetooth Function Controller

An Expo SDK 57 Android app that invokes typed ESP32 firmware functions and receives live data over Bluetooth Low Energy.

## Included functions

- Set the GPIO 12 LED on or off.
- Blink the LED with configurable on time, off time, and count. Blinking is non-blocking.
- Subscribe to live GPIO 34 analog readings from 100–5000 ms.
- Display raw 12-bit ADC, approximate millivolts, and the latest 60 samples.

## Hardware

Connect the LED through a 220–330 Ω resistor:

```text
ESP32 GPIO 12 ── resistor ── LED anode (+)
ESP32 GND     ────────────── LED cathode (-)
```

For the analog demo, connect a potentiometer:

```text
ESP32 3.3 V   ── potentiometer outer leg
ESP32 GND     ── potentiometer other outer leg
ESP32 GPIO 34 ── potentiometer center/wiper
```

GPIO 34 is input-only. Never apply more than 3.3 V. ADC millivolt values are approximate and real sensors may require calibration, filtering, scaling, or a sensor-specific Arduino library.

## Firmware

Open `firmware/Esp32LedBle/Esp32LedBle.ino` in Arduino IDE, select the matching ESP32 board and port, then upload. The sketch uses the ESP32 Arduino core BLE library and advertises as `ESP32_LED`.

The app and firmware were upgraded together; the old `FUNCTION:0|1` firmware is not compatible.

### Compile and upload with Arduino CLI

Install the **esp32 by Espressif Systems** board package first. From the project root, list the connected boards and serial ports:

```powershell
arduino-cli board list
```

Compile for the generic ESP32 Dev Module:

```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/Esp32LedBle
```

Upload it, replacing `COM6` with the port shown by `arduino-cli board list`:

```powershell
arduino-cli upload --port COM6 --fqbn esp32:esp32:esp32 firmware/Esp32LedBle
```

Open the serial monitor at 115200 baud:

```powershell
arduino-cli monitor --port COM6 --config baudrate=115200
```

On Windows, if `arduino-cli` is not on `PATH` but Arduino IDE is installed in the default per-user location, use its full path:

```powershell
& "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" compile --fqbn esp32:esp32:esp32 firmware/Esp32LedBle
& "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" upload --port COM6 --fqbn esp32:esp32:esp32 firmware/Esp32LedBle
```

## Run the Android app

Requirements are Node.js 22.13 or later, Android SDK 36, an Android device, and Bluetooth.

Install the JavaScript dependencies:

```powershell
npm install
```

Check the TypeScript code without producing an app:

```powershell
npx tsc --noEmit
```

### Compile and install a development build

Connect an Android phone with USB debugging enabled, then run this from the project root:

```powershell
npx expo run:android
```

This compiles the native React Native Android project, builds the development app, installs it on the connected phone, and starts Expo. BLE uses native code, so Expo Go is not supported.

For later JavaScript/TypeScript-only changes, keep the installed development build and start only the development server:

```powershell
npx expo start --dev-client
```

### Compile a debug APK without installing it

The generated Android project includes the Gradle wrapper. On Windows PowerShell:

```powershell
Set-Location android
.\gradlew.bat :app:assembleDebug
Set-Location ..
```

The APK is produced at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install that APK on a USB-connected phone with Android Platform Tools:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

If native dependencies or `app.json` plugins change, run `npx expo run:android` again rather than only restarting the development server.

## BLE protocol

| Item | Value |
| --- | --- |
| Device | `ESP32_LED` |
| Service | `7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Command characteristic | `7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001` encrypted write |
| Event characteristic | `7B6F0003-6F6D-4A39-8F7D-0EEB5D4D0001` encrypted read/notify |
| Pairing | BLE Just Works bonding |

Frames use compact ASCII:

```text
C|requestId|function.name|key=value;key=value
R|requestId|ok|key=value
R|requestId|error|code=CODE;message=description
E|eventName|key=value;key=value
```

Registered functions are `system.snapshot`, `led.set`, `led.blink`, `sensor.subscribe`, and `sensor.unsubscribe`. Events are `state` and `analog`. Frames are limited to 160 bytes, and app requests time out after five seconds.

## Add an ESP32 function

The phone invokes compiled handlers; it intentionally cannot execute arbitrary Arduino source.

1. Write a handler in the `.ino` and register it in `COMMANDS`.
2. Add its arguments and result to `Esp32CommandMap` in `src/ble/types.ts`.
3. Parse its result in `BleService.invoke`.
4. Add purpose-built app controls and validation.
5. Flash matching firmware before using the updated app.

`src/ble/protocol.ts` owns frame serialization/parsing, while `src/ble/BleService.ts` owns request correlation, notification monitoring, timeouts, and disconnect cleanup.

## Troubleshooting

- If scanning fails, enable Bluetooth and confirm Serial Monitor at 115200 says the ESP32 is advertising.
- If pairing fails after upgrading, forget `ESP32_LED` in Android Bluetooth settings, restart the ESP32, and reconnect.
- If telemetry stays flat, check GPIO 34 wiring and common ground.
- If controls time out, confirm the new firmware and app are both installed.
- If native dependencies change, rebuild with `npx expo run:android`.

See [troubleshoot.md](troubleshoot.md) for detailed recovery steps.

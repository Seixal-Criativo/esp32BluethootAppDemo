# ESP32 Bluetooth LED Controller

A simple Android React Native app that turns an external LED connected to an ESP32 on and off over Bluetooth Low Energy (BLE).

## Features

- Scans for an ESP32 advertising as `ESP32_LED`.
- Connects and uses BLE bonding (Just Works pairing).
- Reads the LED's current state after connecting.
- Turns an external LED on or off from the app.
- Uses a custom BLE service, so only the app and matching ESP32 sketch share the protocol.

## Hardware

You need:

- ESP32 DevKit board
- Micro-USB/USB-C data cable for the ESP32
- One LED
- One 220–330 Ω resistor
- Breadboard and jumper wires
- Android phone with Bluetooth enabled

### Wiring

Connect the LED exactly as follows:

```text
ESP32 GPIO 12 ── 220–330 Ω resistor ── LED long leg / anode (+)
ESP32 GND     ───────────────────────── LED short leg / cathode (-)
```

When the app sends **ON**, GPIO 12 is set HIGH and the LED stays lit. When the app sends **OFF**, GPIO 12 is set LOW.

> GPIO 12 is an ESP32 boot-strapping pin. This wiring is safe because the LED/resistor goes to GND; do not add an external pull-up resistor from GPIO 12 to 3.3 V.

## ESP32 firmware

The firmware is located at [firmware/Esp32LedBle/Esp32LedBle.ino](firmware/Esp32LedBle/Esp32LedBle.ino).

### Upload with Arduino IDE

1. Install Arduino IDE.
2. In **Boards Manager**, install **esp32 by Espressif Systems**.
3. Open `firmware/Esp32LedBle/Esp32LedBle.ino`.
4. Select **Tools → Board → ESP32 Arduino → ESP32 Dev Module** (or the board matching your hardware).
5. Select the ESP32 serial port under **Tools → Port**.
6. Click **Upload**.
7. Optionally open Serial Monitor at **115200 baud**. A successful boot prints:

   ```text
   ESP32_LED is advertising. Pair with the Android app to control the LED.
   ```

The LED starts OFF after every ESP32 restart.

## Android app

### Prerequisites

- Node.js 22 or later
- Android Studio with Android SDK Platform 36, Build Tools, Platform Tools, and NDK installed
- A USB-debuggable Android phone or Android emulator

The local Android SDK path is stored in `android/local.properties`. If Android Studio is installed in its default location, it should contain:

```properties
sdk.dir=C\:\\Users\\YOUR_WINDOWS_USER\\AppData\\Local\\Android\\Sdk
```

### Install and run

Install JavaScript dependencies once:

```powershell
npm install
```

Build and install the development app on a connected Android device:

```powershell
npx expo run:android
```

Start the Expo development server for future JavaScript changes:

```powershell
npx expo start --dev-client
```

> This project uses a native BLE library. It cannot run in Expo Go; use the generated development build instead.

### Use the app

1. Power the ESP32 after uploading the sketch.
2. Open **ESP32 LED Controller** on the Android phone.
3. Tap **Scan & Connect**.
4. Allow the Android **Nearby devices** permission.
5. Accept the pairing request for `ESP32_LED` if Android shows one.
6. Use the **GPIO 12 LED** switch in the app to control the external wired LED.

## BLE protocol

| Item | Value |
| --- | --- |
| Device name | `ESP32_LED` |
| Service UUID | `7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001` |
| LED characteristic UUID | `7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001` |
| Characteristic operations | Read and write, encrypted |
| Command format | `FUNCTION_ID:1` to turn on; `FUNCTION_ID:0` to turn off |
| Current LED commands | `LED:1` and `LED:0` |
| Pairing | BLE Just Works bonding |

## Add another Bluetooth-controlled output

The controller is registry-based. To add another simple on/off output, such as a relay, add the same ID in exactly two places:

1. In `firmware/Esp32LedBle/Esp32LedBle.ino`, add one row to `OUTPUTS`:

   ```cpp
   {"RELAY", 13, false, false},
   ```

2. In `src/ble/functions.ts`, add one row to `CONTROLLER_FUNCTIONS`:

   ```ts
   { id: 'RELAY', label: 'Relay', description: 'Relay module on GPIO 13' },
   ```

Compile/upload the ESP32 sketch, then reload the app. The app automatically shows a new switch and sends `RELAY:1` or `RELAY:0` over BLE.

Detailed guides:

- [English](docs/bluetooth-controller-guide.en.md)
- [Português (Portugal)](docs/bluetooth-controller-guide.pt-PT.md)

## Troubleshooting

| Problem | What to check |
| --- | --- |
| LED does not light | Check LED polarity, the resistor, GPIO 12 connection, and GND. Reverse the LED if needed. |
| LED behaves backwards | Set `LED_ACTIVE_LOW` to `true` near the top of the `.ino` file, then upload again. |
| App cannot find the ESP32 | Confirm the board is powered, nearby, and Serial Monitor says it is advertising. |
| Connection or pairing fails | In Android Bluetooth settings, forget `ESP32_LED`, restart the ESP32, then scan again. |
| App says permission is required | Open Android Settings → Apps → ESP32 LED Controller → Permissions and allow **Nearby devices**. |
| Android build cannot find the SDK | Set `sdk.dir` in `android/local.properties` to the Android SDK location shown in Android Studio. |
| The LED toggles more than once | Reload the latest development bundle (`r` in the Expo terminal) so the updated switch write guard is used. |

## Project structure

```text
App.tsx                         App screen and connection state
src/ble/BleService.ts           BLE scanning, connection, read, and write logic
src/ble/constants.ts            Device name, UUIDs, and LED commands
firmware/Esp32LedBle/           ESP32 Arduino sketch
android/                        Generated native Android development project
```

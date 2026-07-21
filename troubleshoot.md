# Troubleshooting

## The app finds the ESP32 but immediately disconnects

Android may retain old Bluetooth bonding information, especially after the ESP32 firmware changes its BLE characteristics or security configuration. The phone then tries to reconnect with stale pairing information and the ESP32 disconnects.

Fix it by removing the existing pairing:

1. Close or disconnect the controller app.
2. Open the phone's **Settings → Bluetooth** or **Connected devices** screen.
3. Find `ESP32_LED` in saved or previously connected devices.
4. Select it and choose **Forget**, **Unpair**, or **Remove device**.
5. Restart or reset the ESP32.
6. Open the controller app and press **Scan & Connect**.
7. Accept the new Android pairing request if it appears.

This does not remove or damage the ESP32 firmware. It only clears the phone's cached BLE bond so a fresh one can be created.

## The app cannot find the ESP32

- Confirm the ESP32 is powered and nearby.
- Enable Bluetooth on the phone.
- Allow the app's **Nearby devices** permission.
- Close Arduino Serial Monitor before uploading again; only one program can use the serial port at a time.
- Open Serial Monitor at 115200 baud and check for:

  ```text
  ESP32 function controller is advertising.
  ```

- Reset the ESP32 and scan again.

## Commands time out after connecting

- Confirm the app and ESP32 both use the current protocol. The old `FUNCTION:0|1` firmware is incompatible.
- Upload `firmware/Esp32LedBle/Esp32LedBle.ino` again.
- Unpair `ESP32_LED` from Android and reconnect.
- Check Serial Monitor for received lines such as `Command: system.snapshot ()`.

## Firmware does not upload

List ports:

```powershell
arduino-cli board list
```

Use the displayed port in the upload command. If connecting fails:

- Close Serial Monitor and any other program using the port.
- Disconnect and reconnect the USB cable.
- Confirm the cable supports data, not charging only.
- Hold the ESP32 **BOOT** button when the upload command starts connecting, then release it when writing begins.

## Sensor readings do not change

- Connect the potentiometer's middle pin to GPIO 34.
- Connect its outer pins to 3.3 V and GND.
- Press **Start Streaming** in the app.
- Never connect GPIO 34 to 5 V.
- A floating GPIO 34 input produces unstable, meaningless values.

## LED does not work

- GPIO 12 must connect through a 220–330 Ω resistor to the LED anode/long leg.
- The LED cathode/short leg must connect to GND.
- Reverse the LED if it remains off.

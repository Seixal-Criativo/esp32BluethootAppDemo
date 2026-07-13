#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLESecurity.h>

// External LED wiring: GPIO 12 -> 220-330 ohm resistor -> LED anode;
// LED cathode -> GND. Set LED_ACTIVE_LOW to true only for inverted hardware.
constexpr uint8_t LED_PIN = 12;
constexpr bool LED_ACTIVE_LOW = false;

constexpr char DEVICE_NAME[] = "ESP32_LED";
constexpr char SERVICE_UUID[] = "7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001";
constexpr char LED_CHARACTERISTIC_UUID[] = "7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001";

BLEServer* server = nullptr;
BLECharacteristic* ledCharacteristic = nullptr;
bool deviceConnected = false;
bool ledIsOn = false;

void setLed(bool on) {
  ledIsOn = on;
  const bool pinLevel = LED_ACTIVE_LOW ? !on : on;
  digitalWrite(LED_PIN, pinLevel ? HIGH : LOW);
  ledCharacteristic->setValue(on ? "1" : "0");
  Serial.printf("LED is now %s\n", on ? "ON" : "OFF");
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override {
    deviceConnected = true;
    Serial.println("Client connected");
  }

  void onDisconnect(BLEServer*) override {
    deviceConnected = false;
    Serial.println("Client disconnected; advertising again");
    BLEDevice::startAdvertising();
  }
};

class LedCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    // ESP32 Arduino Core 3.x returns Arduino String here (not std::string).
    const String value = characteristic->getValue();

    if (value.length() != 1 || (value[0] != '0' && value[0] != '1')) {
      Serial.println("Ignored invalid LED command");
      characteristic->setValue(ledIsOn ? "1" : "0");
      return;
    }

    setLed(value[0] == '1');
  }
};

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);

  BLEDevice::init(DEVICE_NAME);
  // ESP32 Arduino Core 3.x exposes security configuration through BLESecurity.
  BLESecurity::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT);
  BLESecurity::setAuthenticationMode(true, false, true); // bonding, no MITM passkey, Secure Connections

  server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(SERVICE_UUID);
  ledCharacteristic = service->createCharacteristic(
    LED_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  ledCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  ledCharacteristic->setCallbacks(new LedCallbacks());
  setLed(false);

  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("ESP32_LED is advertising. Pair with the Android app to control the LED.");
}

void loop() {
  delay(1000);
}

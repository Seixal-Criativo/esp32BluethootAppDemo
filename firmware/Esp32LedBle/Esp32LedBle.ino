#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLESecurity.h>

constexpr char DEVICE_NAME[] = "ESP32_LED";
constexpr char SERVICE_UUID[] = "7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001";
constexpr char CONTROL_CHARACTERISTIC_UUID[] = "7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001";

struct OutputFunction {
  const char* id;
  uint8_t pin;
  bool activeLow;
  bool isOn;
};

// ADD NEW ON/OFF FUNCTIONS HERE. The id must also be added to
// src/ble/functions.ts in the React Native app.
OutputFunction OUTPUTS[] = {
  {"LED", 12, false, false},
  // Example: {"RELAY", 13, false, false},
};
constexpr size_t OUTPUT_COUNT = sizeof(OUTPUTS) / sizeof(OUTPUTS[0]);

BLECharacteristic* controlCharacteristic = nullptr;

String stateSnapshot() {
  String snapshot;

  for (size_t index = 0; index < OUTPUT_COUNT; index++) {
    if (index > 0) snapshot += ';';
    snapshot += OUTPUTS[index].id;
    snapshot += '=';
    snapshot += OUTPUTS[index].isOn ? '1' : '0';
  }

  return snapshot;
}

void publishState() {
  controlCharacteristic->setValue(stateSnapshot());
}

OutputFunction* findOutput(const String& id) {
  for (size_t index = 0; index < OUTPUT_COUNT; index++) {
    if (id.equalsIgnoreCase(OUTPUTS[index].id)) return &OUTPUTS[index];
  }

  return nullptr;
}

void setOutputState(OutputFunction& output, bool isOn) {
  output.isOn = isOn;
  const bool pinLevel = output.activeLow ? !isOn : isOn;
  digitalWrite(output.pin, pinLevel ? HIGH : LOW);
  publishState();
  Serial.printf("%s is now %s\n", output.id, isOn ? "ON" : "OFF");
}

class ServerCallbacks : public BLEServerCallbacks {
  void onDisconnect(BLEServer*) override {
    Serial.println("Client disconnected; advertising again");
    BLEDevice::startAdvertising();
  }
};

class ControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* characteristic) override {
    const String command = characteristic->getValue();

    if (command == "GET") {
      publishState();
      return;
    }

    const int separator = command.indexOf(':');
    if (separator < 1 || separator != command.length() - 2) {
      Serial.println("Ignored invalid command: " + command);
      publishState();
      return;
    }

    const String functionId = command.substring(0, separator);
    const char state = command[separator + 1];
    OutputFunction* output = findOutput(functionId);

    if (!output || (state != '0' && state != '1')) {
      Serial.println("Ignored unknown function or state: " + command);
      publishState();
      return;
    }

    setOutputState(*output, state == '1');
  }
};

void setup() {
  Serial.begin(115200);

  for (size_t index = 0; index < OUTPUT_COUNT; index++) {
    pinMode(OUTPUTS[index].pin, OUTPUT);
    digitalWrite(OUTPUTS[index].pin, OUTPUTS[index].activeLow ? HIGH : LOW);
  }

  BLEDevice::init(DEVICE_NAME);
  BLESecurity::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT);
  BLESecurity::setAuthenticationMode(true, false, true); // bonding, no passkey, Secure Connections

  BLEServer* server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());

  BLEService* service = server->createService(SERVICE_UUID);
  controlCharacteristic = service->createCharacteristic(
    CONTROL_CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE
  );
  controlCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED | ESP_GATT_PERM_WRITE_ENCRYPTED);
  controlCharacteristic->setCallbacks(new ControlCallbacks());
  publishState();

  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("ESP32_LED is advertising. Commands use FUNCTION:0 or FUNCTION:1.");
}

void loop() {
  delay(1000);
}

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLESecurity.h>

constexpr char DEVICE_NAME[] = "ESP32_LED";
constexpr char SERVICE_UUID[] = "7B6F0001-6F6D-4A39-8F7D-0EEB5D4D0001";
constexpr char CONTROL_UUID[] = "7B6F0002-6F6D-4A39-8F7D-0EEB5D4D0001";
constexpr char EVENT_UUID[] = "7B6F0003-6F6D-4A39-8F7D-0EEB5D4D0001";
constexpr uint8_t LED_PIN = 12;
constexpr uint8_t SENSOR_PIN = 34;
constexpr size_t MAX_FRAME_LENGTH = 160;

BLECharacteristic* eventCharacteristic = nullptr;
bool clientConnected = false;
bool ledOn = false;
bool blinking = false;
bool blinkPhaseOn = false;
uint32_t blinkOnMs = 250, blinkOffMs = 250, blinkChangedAt = 0;
uint16_t blinkCount = 0, blinkCompleted = 0;
bool streaming = false;
uint32_t sensorIntervalMs = 250, sensorLastReadAt = 0, sensorSequence = 0;

void publish(const String& frame) {
  if (!clientConnected || frame.length() > MAX_FRAME_LENGTH) return;
  eventCharacteristic->setValue(frame.c_str());
  eventCharacteristic->notify();
}

String field(const String& arguments, const String& key) {
  const String prefix = key + "=";
  int start = 0;
  while (start <= arguments.length()) {
    int end = arguments.indexOf(';', start);
    if (end < 0) end = arguments.length();
    const String item = arguments.substring(start, end);
    if (item.startsWith(prefix)) return item.substring(prefix.length());
    start = end + 1;
  }
  return "";
}

bool unsignedArgument(const String& arguments, const String& key, uint32_t minimum, uint32_t maximum, uint32_t& value) {
  const String text = field(arguments, key);
  if (text.length() == 0) return false;
  for (size_t i = 0; i < text.length(); i++) if (!isDigit(text[i])) return false;
  const unsigned long parsed = text.toInt();
  if (parsed < minimum || parsed > maximum) return false;
  value = parsed;
  return true;
}

void setLed(bool on) { ledOn = on; digitalWrite(LED_PIN, on ? HIGH : LOW); }
String ledFields() { return "on=" + String(ledOn ? 1 : 0) + ";blinking=" + String(blinking ? 1 : 0); }
String subscriptionFields() { return "streaming=" + String(streaming ? 1 : 0) + ";intervalMs=" + String(sensorIntervalMs); }
void stateEvent() { publish("E|state|" + ledFields()); }
void response(uint32_t id, const String& values) { publish("R|" + String(id) + "|ok|" + values); }
void errorResponse(uint32_t id, const String& code, const String& message) { publish("R|" + String(id) + "|error|code=" + code + ";message=" + message); }

typedef void (*CommandHandler)(uint32_t, const String&);
struct CommandDefinition { const char* name; CommandHandler handler; };

void snapshot(uint32_t id, const String&) { response(id, ledFields() + ";" + subscriptionFields()); }

void setLedCommand(uint32_t id, const String& arguments) {
  const String on = field(arguments, "on");
  if (on != "0" && on != "1") { errorResponse(id, "INVALID_ARGUMENT", "on must be 0 or 1"); return; }
  blinking = false;
  setLed(on == "1");
  response(id, ledFields());
  stateEvent();
}

void blinkCommand(uint32_t id, const String& arguments) {
  uint32_t onMs, offMs, count;
  if (!unsignedArgument(arguments, "onMs", 50, 10000, onMs) || !unsignedArgument(arguments, "offMs", 50, 10000, offMs) || !unsignedArgument(arguments, "count", 1, 100, count)) {
    errorResponse(id, "INVALID_ARGUMENT", "invalid blink settings"); return;
  }
  blinkOnMs = onMs; blinkOffMs = offMs; blinkCount = count; blinkCompleted = 0;
  blinking = true; blinkPhaseOn = true; blinkChangedAt = millis(); setLed(true);
  response(id, ledFields());
  stateEvent();
}

void subscribeSensor(uint32_t id, const String& arguments) {
  uint32_t interval;
  if (!unsignedArgument(arguments, "intervalMs", 100, 5000, interval)) { errorResponse(id, "INVALID_ARGUMENT", "intervalMs must be 100 to 5000"); return; }
  sensorIntervalMs = interval; sensorLastReadAt = millis() - interval; streaming = true;
  response(id, subscriptionFields());
}

void unsubscribeSensor(uint32_t id, const String&) { streaming = false; response(id, subscriptionFields()); }

CommandDefinition COMMANDS[] = {
  {"system.snapshot", snapshot}, {"led.set", setLedCommand}, {"led.blink", blinkCommand},
  {"sensor.subscribe", subscribeSensor}, {"sensor.unsubscribe", unsubscribeSensor},
};

void dispatch(const String& frame) {
  if (frame.length() > MAX_FRAME_LENGTH || !frame.startsWith("C|")) return;
  const int first = frame.indexOf('|', 2), second = frame.indexOf('|', first + 1);
  if (first < 0 || second < 0) return;
  const uint32_t id = frame.substring(2, first).toInt();
  const String name = frame.substring(first + 1, second);
  const String arguments = frame.substring(second + 1);
  if (id == 0) return;
  Serial.println("Command: " + name + " (" + arguments + ")");
  for (const auto& command : COMMANDS) if (name == command.name) { command.handler(id, arguments); return; }
  errorResponse(id, "UNKNOWN_FUNCTION", "unknown function");
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer*) override { clientConnected = true; Serial.println("Client connected"); }
  void onDisconnect(BLEServer*) override { clientConnected = false; streaming = false; Serial.println("Client disconnected; advertising again"); BLEDevice::startAdvertising(); }
};
class ControlCallbacks : public BLECharacteristicCallbacks { void onWrite(BLECharacteristic* characteristic) override { dispatch(String(characteristic->getValue().c_str())); } };

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT); pinMode(SENSOR_PIN, INPUT); setLed(false);
  analogReadResolution(12);
  BLEDevice::init(DEVICE_NAME);
  BLESecurity::setEncryptionLevel(ESP_BLE_SEC_ENCRYPT);
  BLESecurity::setAuthenticationMode(true, false, true);
  BLEServer* server = BLEDevice::createServer(); server->setCallbacks(new ServerCallbacks());
  BLEService* service = server->createService(SERVICE_UUID);
  BLECharacteristic* control = service->createCharacteristic(CONTROL_UUID, BLECharacteristic::PROPERTY_WRITE);
  control->setAccessPermissions(ESP_GATT_PERM_WRITE_ENCRYPTED); control->setCallbacks(new ControlCallbacks());
  eventCharacteristic = service->createCharacteristic(EVENT_UUID, BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  eventCharacteristic->setAccessPermissions(ESP_GATT_PERM_READ_ENCRYPTED); eventCharacteristic->addDescriptor(new BLE2902());
  eventCharacteristic->setValue("E|state|on=0;blinking=0");
  service->start();
  BLEAdvertising* advertising = BLEDevice::getAdvertising(); advertising->addServiceUUID(SERVICE_UUID); advertising->setScanResponse(true); BLEDevice::startAdvertising();
  Serial.println("ESP32 function controller is advertising.");
}

void loop() {
  const uint32_t now = millis();
  if (blinking && now - blinkChangedAt >= (blinkPhaseOn ? blinkOnMs : blinkOffMs)) {
    blinkChangedAt = now;
    if (blinkPhaseOn) { blinkPhaseOn = false; setLed(false); }
    else if (++blinkCompleted >= blinkCount) { blinking = false; setLed(false); stateEvent(); }
    else { blinkPhaseOn = true; setLed(true); }
  }
  if (clientConnected && streaming && now - sensorLastReadAt >= sensorIntervalMs) {
    sensorLastReadAt = now;
    publish("E|analog|seq=" + String(++sensorSequence) + ";raw=" + String(analogRead(SENSOR_PIN)) + ";mv=" + String(analogReadMilliVolts(SENSOR_PIN)) + ";uptimeMs=" + String(now));
  }
  delay(2);
}

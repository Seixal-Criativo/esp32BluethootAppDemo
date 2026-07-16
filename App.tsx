import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Switch, Text, View } from 'react-native';
import { Device } from 'react-native-ble-plx';

import { BleService } from './src/ble/BleService';
import { DEVICE_NAME } from './src/ble/constants';
import {
  CONTROLLER_FUNCTIONS,
  ControllerFunctionId,
  createInitialFunctionStates,
} from './src/ble/functions';

type ConnectionStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';

export default function App() {
  const bleRef = useRef<BleService | null>(null);
  if (!bleRef.current) {
    bleRef.current = new BleService();
  }
  const ble = bleRef.current;
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [message, setMessage] = useState('Ready to find your ESP32.');
  const [device, setDevice] = useState<Device | null>(null);
  const [functionStates, setFunctionStates] = useState(createInitialFunctionStates);
  const [writing, setWriting] = useState(false);
  const writingRef = useRef(false);

  useEffect(() => () => ble.destroy(), [ble]);

  const showError = (error: unknown) => {
    const text = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
    setStatus('error');
    setMessage(text);
  };

  const connect = async () => {
    try {
      setStatus('scanning');
      setMessage('Requesting Bluetooth access…');
      if (!(await ble.requestPermissions())) {
        throw new Error('Nearby Devices permission is needed to control the ESP32.');
      }

      setMessage('Waiting for Bluetooth to be turned on…');
      await ble.waitForBluetooth();
      setMessage(`Scanning for ${DEVICE_NAME}…`);

      ble.scanForEsp32(
        async (foundDevice) => {
          try {
            setStatus('connecting');
            setMessage(`Connecting to ${DEVICE_NAME}…`);
            const connectedDevice = await ble.connect(foundDevice);
            const currentStates = await ble.readFunctionStates(connectedDevice.id);
            setDevice(connectedDevice);
            setFunctionStates((previous) => ({ ...previous, ...currentStates }));
            setStatus('connected');
            setMessage(`Connected to ${DEVICE_NAME}.`);
          } catch (error) {
            showError(error);
          }
        },
        (scanError) => {
          setStatus('error');
          setMessage(scanError);
        },
      );
    } catch (error) {
      showError(error);
    }
  };

  const toggleFunction = async (functionId: ControllerFunctionId, value: boolean) => {
    if (!device || writingRef.current) return;
    const previousValue = functionStates[functionId];

    try {
      // Keep this controlled Switch in sync immediately. Waiting for the BLE
      // response here can make Android visually reverse the switch and send
      // an unintended second command.
      writingRef.current = true;
      setWriting(true);
      setFunctionStates((previous) => ({ ...previous, [functionId]: value }));
      await ble.writeFunctionState(device.id, functionId, value);
      setMessage(`${functionId} turned ${value ? 'on' : 'off'}.`);
    } catch (error) {
      setFunctionStates((previous) => ({ ...previous, [functionId]: previousValue }));
      showError(error);
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  };

  const disconnect = async () => {
    if (!device) return;
    try {
      await ble.disconnect(device.id);
      setDevice(null);
      setStatus('idle');
      setMessage('Disconnected.');
    } catch (error) {
      showError(error);
    }
  };

  const isBusy = status === 'scanning' || status === 'connecting';
  const isConnected = status === 'connected' && device !== null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>BLUETOOTH LOW ENERGY</Text>
        <Text style={styles.title}>ESP32 LED{`\n`}Controller</Text>
        <Text style={styles.subtitle}>Connect to {DEVICE_NAME} and control its Bluetooth functions.</Text>

        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, isConnected ? styles.dotConnected : isBusy ? styles.dotBusy : styles.dotIdle]} />
            <Text style={styles.statusLabel}>{isConnected ? 'CONNECTED' : isBusy ? 'WORKING' : 'NOT CONNECTED'}</Text>
          </View>
          <Text style={styles.message}>{message}</Text>

          {isBusy && <ActivityIndicator color="#7DD3FC" style={styles.spinner} />}

          {!isConnected ? (
            <Pressable style={[styles.primaryButton, isBusy && styles.disabledButton]} onPress={connect} disabled={isBusy}>
              <Text style={styles.primaryButtonText}>{isBusy ? 'Please wait…' : 'Scan & Connect'}</Text>
            </Pressable>
          ) : (
            <Pressable style={styles.secondaryButton} onPress={disconnect}>
              <Text style={styles.secondaryButtonText}>Disconnect</Text>
            </Pressable>
          )}
        </View>

        {CONTROLLER_FUNCTIONS.map((item) => {
          const isOn = functionStates[item.id];

          return (
            <View key={item.id} style={[styles.functionCard, !isConnected && styles.functionCardDisabled]}>
              <View style={styles.functionText}>
                <Text style={styles.functionLabel}>{item.label}</Text>
                <Text style={styles.functionDescription}>{item.description}</Text>
                <Text style={styles.functionValue}>{isOn ? 'ON' : 'OFF'}</Text>
              </View>
              <Switch
                value={isOn}
                onValueChange={(value) => toggleFunction(item.id, value)}
                disabled={!isConnected || writing}
                trackColor={{ false: '#475569', true: '#0EA5E9' }}
                thumbColor={isOn ? '#F8FAFC' : '#CBD5E1'}
              />
            </View>
          );
        })}

        <Text style={styles.help}>On the first connection Android may ask you to pair with the ESP32.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0F172A' },
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  eyebrow: { color: '#7DD3FC', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 12 },
  title: { color: '#F8FAFC', fontSize: 38, fontWeight: '800', lineHeight: 42 },
  subtitle: { color: '#94A3B8', fontSize: 16, lineHeight: 23, marginTop: 14, marginBottom: 36 },
  card: { backgroundColor: '#1E293B', borderRadius: 24, padding: 24 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  dotConnected: { backgroundColor: '#34D399' },
  dotBusy: { backgroundColor: '#FBBF24' },
  dotIdle: { backgroundColor: '#94A3B8' },
  statusLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  message: { color: '#F8FAFC', fontSize: 17, lineHeight: 24, marginTop: 14, minHeight: 48 },
  spinner: { marginVertical: 8 },
  primaryButton: { backgroundColor: '#0EA5E9', borderRadius: 14, alignItems: 'center', paddingVertical: 16, marginTop: 18 },
  disabledButton: { opacity: 0.55 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  secondaryButton: { borderColor: '#475569', borderRadius: 14, borderWidth: 1, alignItems: 'center', paddingVertical: 15, marginTop: 18 },
  secondaryButtonText: { color: '#CBD5E1', fontSize: 16, fontWeight: '700' },
  functionCard: { marginTop: 18, backgroundColor: '#172554', borderRadius: 20, padding: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  functionCardDisabled: { opacity: 0.5 },
  functionText: { flex: 1, paddingRight: 16 },
  functionLabel: { color: '#93C5FD', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  functionDescription: { color: '#94A3B8', fontSize: 13, marginTop: 5 },
  functionValue: { color: '#F8FAFC', fontSize: 28, fontWeight: '800', marginTop: 4 },
  help: { color: '#64748B', fontSize: 13, lineHeight: 19, marginTop: 22, textAlign: 'center' },
});

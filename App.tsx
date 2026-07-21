import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Device } from 'react-native-ble-plx';

import { BleService } from './src/ble/BleService';
import { DEVICE_NAME } from './src/ble/constants';
import { BLINK_LIMITS, DEFAULT_BLINK, DEFAULT_SENSOR_INTERVAL, MAX_HISTORY, SENSOR_INTERVALS } from './src/ble/functions';
import { AnalogReading, LedState } from './src/ble/types';

type ConnectionStatus = 'idle' | 'scanning' | 'connecting' | 'connected' | 'error';
const initialLed: LedState = { on: false, blinking: false };

export default function App() {
  const bleRef = useRef<BleService | null>(null);
  if (!bleRef.current) bleRef.current = new BleService();
  const ble = bleRef.current;
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [message, setMessage] = useState('Ready to find your ESP32.');
  const [device, setDevice] = useState<Device | null>(null);
  const [led, setLed] = useState(initialLed);
  const [busy, setBusy] = useState(false);
  const [onMs, setOnMs] = useState(String(DEFAULT_BLINK.onMs));
  const [offMs, setOffMs] = useState(String(DEFAULT_BLINK.offMs));
  const [count, setCount] = useState(String(DEFAULT_BLINK.count));
  const [intervalMs, setIntervalMs] = useState(DEFAULT_SENSOR_INTERVAL);
  const [streaming, setStreaming] = useState(false);
  const [readings, setReadings] = useState<AnalogReading[]>([]);
  const lastSequence = useRef(0);

  useEffect(() => () => ble.destroy(), [ble]);
  const showError = (error: unknown) => { setStatus('error'); setMessage(error instanceof Error ? error.message : 'Something went wrong.'); };

  const onReading = (reading: AnalogReading) => {
    if (reading.sequence <= lastSequence.current) return;
    lastSequence.current = reading.sequence;
    setReadings((previous) => [...previous, reading].slice(-MAX_HISTORY));
  };

  const connect = async () => {
    try {
      setStatus('scanning'); setMessage('Requesting Bluetooth access…'); setReadings([]); lastSequence.current = 0;
      if (!(await ble.requestPermissions())) throw new Error('Nearby Devices permission is needed.');
      await ble.waitForBluetooth(); setMessage(`Scanning for ${DEVICE_NAME}…`);
      ble.scanForEsp32(async (found) => {
        try {
          setStatus('connecting'); setMessage(`Connecting to ${DEVICE_NAME}…`);
          const connected = await ble.connect(found);
          ble.subscribe(connected.id, {
            onState: setLed,
            onAnalogReading: onReading,
            onProtocolError: setMessage,
            onDisconnected: (text) => { setDevice(null); setStreaming(false); setStatus('error'); setMessage(text); },
          });
          const snapshot = await ble.invoke(connected.id, 'system.snapshot', {});
          setDevice(connected); setLed({ on: snapshot.on, blinking: snapshot.blinking });
          setStreaming(snapshot.streaming); setIntervalMs(snapshot.intervalMs || DEFAULT_SENSOR_INTERVAL);
          setStatus('connected'); setMessage(`Connected to ${DEVICE_NAME}.`);
        } catch (error) { showError(error); }
      }, (scanError) => { setStatus('error'); setMessage(scanError); });
    } catch (error) { showError(error); }
  };

  const run = async (action: () => Promise<void>) => {
    if (!device || busy) return;
    try { setBusy(true); await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Command failed.'); }
    finally { setBusy(false); }
  };

  const toggleLed = (on: boolean) => run(async () => { const state = await ble.invoke(device!.id, 'led.set', { on }); setLed(state); setMessage(`LED turned ${on ? 'on' : 'off'}.`); });
  const blinkValues = { onMs: Number(onMs), offMs: Number(offMs), count: Number(count) };
  const validBlink = Number.isInteger(blinkValues.onMs) && Number.isInteger(blinkValues.offMs) && Number.isInteger(blinkValues.count) && blinkValues.onMs >= BLINK_LIMITS.minMs && blinkValues.onMs <= BLINK_LIMITS.maxMs && blinkValues.offMs >= BLINK_LIMITS.minMs && blinkValues.offMs <= BLINK_LIMITS.maxMs && blinkValues.count >= BLINK_LIMITS.minCount && blinkValues.count <= BLINK_LIMITS.maxCount;
  const startBlink = () => run(async () => { const state = await ble.invoke(device!.id, 'led.blink', blinkValues); setLed(state); setMessage('Blink sequence started.'); });
  const startStream = () => run(async () => { const result = await ble.invoke(device!.id, 'sensor.subscribe', { intervalMs }); setStreaming(result.streaming); setMessage(`Streaming every ${result.intervalMs} ms.`); });
  const stopStream = () => run(async () => { const result = await ble.invoke(device!.id, 'sensor.unsubscribe', {}); setStreaming(result.streaming); setMessage('Sensor stream stopped.'); });

  const disconnect = () => run(async () => {
    if (streaming) { try { await ble.invoke(device!.id, 'sensor.unsubscribe', {}); } catch {} }
    await ble.disconnect(device!.id); setDevice(null); setStreaming(false); setStatus('idle'); setMessage('Disconnected.');
  });

  const connected = status === 'connected' && !!device;
  const connecting = status === 'scanning' || status === 'connecting';
  const latest = readings.at(-1);

  return (
    <SafeAreaView style={styles.safeArea}><StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>BLUETOOTH LOW ENERGY</Text><Text style={styles.title}>ESP32 Controller</Text>
        <Text style={styles.subtitle}>Call firmware functions and receive live sensor information.</Text>

        <View style={styles.card}>
          <View style={styles.statusRow}><View style={[styles.dot, connected ? styles.green : connecting ? styles.yellow : styles.gray]} /><Text style={styles.statusLabel}>{connected ? 'CONNECTED' : connecting ? 'WORKING' : 'NOT CONNECTED'}</Text></View>
          <Text style={styles.message}>{message}</Text>{connecting && <ActivityIndicator color="#7DD3FC" />}
          <Button label={connected ? 'Disconnect' : connecting ? 'Please wait…' : 'Scan & Connect'} onPress={connected ? disconnect : connect} disabled={connecting || busy} secondary={connected} />
        </View>

        <View style={[styles.card, !connected && styles.disabled]}>
          <Text style={styles.cardTitle}>GPIO 12 LED</Text><Text style={styles.value}>{led.blinking ? 'BLINKING' : led.on ? 'ON' : 'OFF'}</Text>
          <View style={styles.switchRow}><Text style={styles.label}>Steady output</Text><Switch value={led.on} onValueChange={toggleLed} disabled={!connected || busy} trackColor={{ false: '#475569', true: '#0EA5E9' }} /></View>
          <Text style={styles.sectionLabel}>TIMED BLINK</Text>
          <View style={styles.inputRow}><NumberInput label="On ms" value={onMs} setValue={setOnMs} /><NumberInput label="Off ms" value={offMs} setValue={setOffMs} /><NumberInput label="Count" value={count} setValue={setCount} /></View>
          {!validBlink && <Text style={styles.error}>Times: 50–10000 ms. Count: 1–100.</Text>}
          <Button label="Start Blink" onPress={startBlink} disabled={!connected || busy || !validBlink} />
        </View>

        <View style={[styles.card, !connected && styles.disabled]}>
          <Text style={styles.cardTitle}>Analog Sensor · GPIO 34</Text>
          <View style={styles.metrics}><View><Text style={styles.metricLabel}>RAW ADC</Text><Text style={styles.metric}>{latest?.raw ?? '—'}</Text></View><View><Text style={styles.metricLabel}>MILLIVOLTS</Text><Text style={styles.metric}>{latest?.millivolts ?? '—'}</Text></View></View>
          <View style={styles.chart}>{readings.length === 0 ? <Text style={styles.chartEmpty}>Start streaming to see live history</Text> : readings.map((reading) => <View key={reading.sequence} style={[styles.bar, { height: Math.max(2, Math.round((reading.raw / 4095) * 88)) }]} />)}</View>
          <Text style={styles.sampleInfo}>{latest ? `Sample ${latest.sequence} · ESP32 uptime ${latest.uptimeMs} ms` : 'No samples received'}</Text>
          <Text style={styles.sectionLabel}>UPDATE INTERVAL</Text><View style={styles.chips}>{SENSOR_INTERVALS.map((value) => <Pressable key={value} disabled={streaming || busy} onPress={() => setIntervalMs(value)} style={[styles.chip, intervalMs === value && styles.chipActive]}><Text style={styles.chipText}>{value} ms</Text></Pressable>)}</View>
          <Button label={streaming ? 'Stop Streaming' : 'Start Streaming'} onPress={streaming ? stopStream : startStream} disabled={!connected || busy} secondary={streaming} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Button({ label, onPress, disabled, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) { return <Pressable onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.buttonDisabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
function NumberInput({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) { return <View style={styles.inputBox}><Text style={styles.inputLabel}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={setValue} keyboardType="number-pad" selectTextOnFocus /></View>; }

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0F172A' }, container: { padding: 24, paddingBottom: 50 },
  eyebrow: { color: '#7DD3FC', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginTop: 20 }, title: { color: '#F8FAFC', fontSize: 38, fontWeight: '800', marginTop: 8 }, subtitle: { color: '#94A3B8', fontSize: 16, lineHeight: 23, marginTop: 10, marginBottom: 22 },
  card: { backgroundColor: '#1E293B', borderRadius: 22, padding: 20, marginBottom: 16 }, disabled: { opacity: 0.5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dot: { width: 9, height: 9, borderRadius: 5 }, green: { backgroundColor: '#34D399' }, yellow: { backgroundColor: '#FBBF24' }, gray: { backgroundColor: '#94A3B8' }, statusLabel: { color: '#CBD5E1', fontSize: 12, fontWeight: '800', letterSpacing: 1 }, message: { color: '#F8FAFC', fontSize: 16, lineHeight: 22, marginVertical: 14 },
  cardTitle: { color: '#93C5FD', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 }, value: { color: '#F8FAFC', fontSize: 30, fontWeight: '800', marginTop: 5 }, label: { color: '#CBD5E1', fontSize: 16 }, switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 15 }, sectionLabel: { color: '#64748B', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 14, marginBottom: 9 },
  inputRow: { flexDirection: 'row', gap: 8 }, inputBox: { flex: 1 }, inputLabel: { color: '#94A3B8', fontSize: 11, marginBottom: 4 }, input: { color: '#F8FAFC', backgroundColor: '#0F172A', borderRadius: 10, padding: 11, fontSize: 16 }, error: { color: '#FCA5A5', marginTop: 8, fontSize: 12 },
  button: { backgroundColor: '#0EA5E9', borderRadius: 13, alignItems: 'center', paddingVertical: 14, marginTop: 15 }, buttonSecondary: { backgroundColor: 'transparent', borderColor: '#475569', borderWidth: 1 }, buttonDisabled: { opacity: 0.45 }, buttonText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }, metricLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, metric: { color: '#F8FAFC', fontSize: 25, fontWeight: '800' }, chart: { height: 100, backgroundColor: '#0F172A', borderRadius: 12, marginTop: 15, padding: 6, flexDirection: 'row', alignItems: 'flex-end', gap: 1, overflow: 'hidden' }, bar: { flex: 1, backgroundColor: '#38BDF8', minWidth: 2 }, chartEmpty: { color: '#64748B', alignSelf: 'center', textAlign: 'center', flex: 1 }, sampleInfo: { color: '#64748B', fontSize: 11, marginTop: 7 }, chips: { flexDirection: 'row', gap: 6 }, chip: { flex: 1, paddingVertical: 9, backgroundColor: '#334155', borderRadius: 9, alignItems: 'center' }, chipActive: { backgroundColor: '#0369A1' }, chipText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' },
});

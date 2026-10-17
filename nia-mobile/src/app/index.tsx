import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// For browser on this laptop use localhost. For a physical phone, update the IP below.
const API_URL = Platform.OS === 'web' && typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? 'http://127.0.0.1:8000'
  : 'http://192.168.31.93:8000';

type RecordData = Record<string, any>;
type Screen = 'admin' | 'user';
type NavSection = 'overview' | 'deliveries' | 'controls' | 'workflow' | 'events';

const C = {
  bg: '#F3F6FB', surface: '#FFFFFF', surfaceAlt: '#F8FAFD', border: '#DDE5F0',
  text: '#17243A', muted: '#68778D', primary: '#2457D6', primaryDark: '#1D45B0',
  teal: '#087F8C', green: '#138A55', greenBg: '#E5F7EE', amber: '#A96708', amberBg: '#FFF4D9',
  red: '#C33E52', redBg: '#FCE9EC', blueBg: '#EAF1FF', purple: '#7046C7', purpleBg: '#F0EAFE',
};
const show = (v: unknown, fallback = '—') => v === null || v === undefined || v === '' ? fallback : typeof v === 'object' ? JSON.stringify(v) : String(v);
function rowsFrom(data: unknown): RecordData[] {
  if (Array.isArray(data)) return data as RecordData[];
  if (data && typeof data === 'object') {
    const d = data as RecordData;
    for (const k of ['deliveries', 'items', 'data', 'results']) if (Array.isArray(d[k])) return d[k];
  }
  return [];
}
async function request(path: string, method = 'GET', body?: RecordData) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  } catch { throw new Error(`Cannot reach ${API_URL}. Start FastAPI and check the API URL/network.`); }
  let data: any;
  try { data = await response.json(); } catch { data = { detail: 'Backend returned an unreadable response' }; }
  if (!response.ok) throw new Error(data?.detail || `Request failed (HTTP ${response.status})`);
  return data;
}
function ActionButton({ title, onPress, tone = 'primary', disabled = false }: { title: string; onPress: () => void; tone?: 'primary'|'secondary'|'success'|'danger'|'purple'; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, tone === 'primary' && s.button_primary, tone === 'secondary' && s.button_secondary, tone === 'success' && s.button_success, tone === 'danger' && s.button_danger, tone === 'purple' && s.button_purple, disabled && s.disabled, pressed && s.pressed]}><Text style={[s.buttonText, tone === 'secondary' && { color: C.text }]}>{title}</Text></Pressable>;
}
function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={s.card}><Text style={s.cardTitle}>{title}</Text>{subtitle ? <Text style={s.muted}>{subtitle}</Text> : null}<View style={{ gap: 12, marginTop: 12 }}>{children}</View></View>;
}
function Metric({ label, value, note, color = C.primary }: { label: string; value: string|number; note: string; color?: string }) {
  return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={[s.metricValue, { color }]}>{value}</Text><Text style={s.metricNote}>{note}</Text></View>;
}
function Field({ label, value, onChangeText, placeholder, numeric = false }: { label: string; value: string; onChangeText: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#91A0B5" keyboardType={numeric ? 'numeric' : 'default'} style={s.input} /></View>;
}
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[s.choice, selected && s.choiceSelected]}><Text style={[s.choiceText, selected && s.choiceTextSelected]}>{selected ? '✓ ' : ''}{label}</Text></Pressable>;
}

export default function HomeScreen() {
  const [screen, setScreen] = useState<Screen>('admin');
  const [section, setSection] = useState<NavSection>('overview');
  const [authenticated, setAuthenticated] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signedInAs, setSignedInAs] = useState<'Admin' | 'Staff'>('Admin');
  const [connection, setConnection] = useState<'checking'|'online'|'offline'>('checking');
  const [robot, setRobot] = useState<RecordData|null>(null);
  const [deliveries, setDeliveries] = useState<RecordData[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [apiResponse, setApiResponse] = useState('No response yet');
  const [selectedId, setSelectedId] = useState('');
  const [orderId, setOrderId] = useState('ORD-1001');
  const [table, setTable] = useState('2');
  const [items, setItems] = useState('Veg Burger, French Fries');
  const [selectedTray, setSelectedTray] = useState('Tray 1');
  const [deliveryMode, setDeliveryMode] = useState<'single'|'multi'>('multi');
  const [batchOrders, setBatchOrders] = useState([
    { order_id: 'ORD-10030', table_number: 1, items: 'Veg Burger, French Fries', tray: 'Tray 1' },
    { order_id: 'ORD-10010', table_number: 5, items: 'Pizza, Juice', tray: 'Tray 3' },
    { order_id: 'ORD-10070', table_number: 10, items: 'Pasta, Water', tray: 'Tray 2' },
  ]);
  const [trayCount, setTrayCount] = useState('3');
  const [tableCount, setTableCount] = useState('10');
  const [batteryInput, setBatteryInput] = useState('100');
  const [lastChecked, setLastChecked] = useState('—');

  const api = useCallback(async (path: string, method = 'GET', body?: RecordData) => {
    const data = await request(path, method, body);
    setApiResponse(JSON.stringify(data, null, 2));
    return data;
  }, []);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const [r, d] = await Promise.all([api('/robot'), api('/deliveries')]);
      setRobot(r); setBatteryInput(String(r?.battery_percent ?? 100)); setDeliveries(rowsFrom(d)); setConnection('online');
      if (!quiet) setNotice('Robot readiness and deliveries refreshed.');
      setLastChecked(new Date().toLocaleTimeString());
    } catch (e) {
      setConnection('offline'); if (!quiet) setNotice(e instanceof Error ? e.message : 'Could not connect to backend.');
      setLastChecked(new Date().toLocaleTimeString());
    } finally { if (!quiet) setBusy(false); }
  }, [api]);
  useEffect(() => { refresh(); const timer = setInterval(() => refresh(true), 15000); return () => clearInterval(timer); }, [refresh]);

  const selected = useMemo(() => deliveries.find(d => Number(d.delivery_id ?? d.id) === Number(selectedId)), [deliveries, selectedId]);
  const battery = Number(robot?.battery_percent);
  const completed = deliveries.filter(d => ['completed', 'station_confirmed'].includes(d.status)).length;
  const active = deliveries.filter(d => !['completed', 'cancelled', 'station_confirmed'].includes(d.status)).length;
  const queued = deliveries.filter(d => d.status === 'queued').length;
  const ready = connection === 'online' && battery >= 20 && !['system_outage', 'low_battery', 'route_blocked'].includes(String(robot?.status));
  const trays = Array.from({ length: Math.max(1, Math.min(20, Number(trayCount) || 3)) }, (_, i) => `Tray ${i + 1}`);
  const tables = Array.from({ length: Math.max(1, Math.min(100, Number(tableCount) || 10)) }, (_, i) => i + 1);

  async function runAction(path: string, method = 'POST', body?: RecordData, success?: string) {
    setBusy(true); setNotice('');
    try { const result = await api(path, method, body); setNotice(result?.message || success || 'Action completed.'); await refresh(true); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Action failed.'); }
    finally { setBusy(false); }
  }
  async function createDelivery() {
    const cleanItems = items.split(',').map(x => x.trim()).filter(Boolean); const tableNo = Number(table);
    if (!orderId.trim() || !cleanItems.length || !Number.isInteger(tableNo) || tableNo < 1) { setNotice('Enter an order ID, valid table number and at least one food item.'); return; }
    if (!ready) { setNotice('Robot is not ready. Ask Admin to check connectivity, battery and robot status.'); return; }
    await runAction('/kds/food-ready', 'POST', { order_id: orderId.trim(), table_number: tableNo, items: cleanItems, source: 'KDS', tray: selectedTray }, 'Food Ready event submitted.');
  }
  async function createBatch() {
    const chosen = deliveryMode === 'single' ? [{ order_id: orderId, table_number: Number(table), items, tray: selectedTray }] : batchOrders;
    const payloadItems = chosen.map((o) => ({
      order_id: o.order_id.trim(), table_number: Number(o.table_number),
      items: o.items.split(',').map((x: string) => x.trim()).filter(Boolean), tray: o.tray,
    }));
    if (payloadItems.some(o => !o.order_id || !Number.isInteger(o.table_number) || o.table_number < 1 || !o.items.length)) {
      setNotice('Every delivery needs an order ID, valid table and at least one food item.'); return;
    }
    const trayNumbers = payloadItems.map(o => Number(String(o.tray).match(/\d+/)?.[0]));
    if (new Set(trayNumbers).size !== trayNumbers.length) { setNotice('Duplicate tray assignment. Assign a different tray to each table.'); return; }
    if (!ready) { setNotice('Robot is not ready. Check connectivity, battery and robot status.'); return; }
    await runAction('/batches', 'POST', { mode: deliveryMode, items: payloadItems }, 'Delivery batch created.');
  }
  function updateBatchOrder(index: number, field: 'order_id'|'items'|'tray', value: string) {
    setBatchOrders(old => old.map((o, i) => i === index ? { ...o, [field]: value } : o));
  }

  const deliveryAction = (action: string, success: string) => {
    if (!selectedId || !selected) { setNotice('Create a delivery first, then select it below.'); return; }
    runAction(`/deliveries/${Number(selectedId)}/${action}`, 'POST', undefined, success);
  };
  function selectDelivery(id: number|string) { setSelectedId(String(id)); }
  function updateTable() {
    const id = Number(selectedId), tableNo = Number(table);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(tableNo) || tableNo < 1) { setNotice('Select a delivery and a valid table.'); return; }
    runAction(`/deliveries/${id}/table-change`, 'POST', { table_number: tableNo }, 'Destination table updated.');
  }
  function updateBattery() {
    const value = Number(batteryInput);
    if (!Number.isInteger(value) || value < 0 || value > 100) { setNotice('Battery must be a whole number from 0 to 100.'); return; }
    runAction('/robot/battery', 'POST', { battery_percent: value }, 'Simulated battery updated.');
  }

  function signIn() {
    const username = loginUsername.trim().toLowerCase();
    // Demo-only UI login. Replace with a real FastAPI authentication endpoint before production.
    if (username === 'admin' && loginPassword === 'admin123') {
      setSignedInAs('Admin'); setAuthenticated(true); setLoginError(''); setSection('overview'); setScreen('admin'); refresh(true);
    } else if (username === 'staff' && loginPassword === 'staff123') {
      setSignedInAs('Staff'); setAuthenticated(true); setLoginError(''); setSection('workflow'); setScreen('user'); refresh(true);
    } else { setLoginError('Invalid demo credentials. Check the sample accounts below.'); }
  }

  function signOut() { setAuthenticated(false); setLoginPassword(''); setLoginError(''); setSection('overview'); setScreen('admin'); }

  if (!authenticated) return <SafeAreaView style={s.loginSafe}>
    <ScrollView contentContainerStyle={s.loginPage} keyboardShouldPersistTaps="handled">
      <View style={s.loginLogo}><Text style={s.loginLogoText}>NIA</Text></View>
      <Text style={s.loginTitle}>Welcome to NIA</Text>
      <Text style={s.loginSubtitle}>Restaurant Robot Operations</Text>
      <View style={s.loginCard}>
        <Text style={s.loginCardTitle}>Sign in to continue</Text>
        <Text style={s.muted}>Use your account to access robot readiness, deliveries and controls.</Text>
        <Field label="Username" value={loginUsername} onChangeText={setLoginUsername} placeholder="Enter username" />
        <Text style={s.label}>Password</Text>
        <TextInput value={loginPassword} onChangeText={setLoginPassword} placeholder="Enter password" placeholderTextColor="#91A0B5" secureTextEntry autoCapitalize="none" style={s.input} onSubmitEditing={signIn} />
        {!!loginError && <View style={[s.notice, s.noticeError]}><Text style={s.noticeText}>{loginError}</Text></View>}
        <ActionButton title="Sign in" onPress={signIn} />
        <View style={s.demoCredentials}><Text style={s.demoTitle}>Demo accounts (frontend only)</Text><Text style={s.muted}>Admin: admin / admin123</Text><Text style={s.muted}>Staff: staff / staff123</Text></View>
        <Text style={s.helper}>This is a prototype login screen. Credentials are checked in the app, not securely by the backend. Do not use these demo credentials in production.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;

  return <SafeAreaView style={s.safe}>
    <View style={s.header}>
      <View><Text style={s.brand}>NIA <Text style={{ color: C.primary }}>●</Text></Text><Text style={s.brandSub}>RESTAURANT ROBOT OPERATIONS</Text></View>
      <View style={[s.connection, connection === 'online' ? s.connectionOnline : connection === 'offline' ? s.connectionOffline : s.connectionWaiting]}><View style={[s.dot, { backgroundColor: connection === 'online' ? C.green : connection === 'offline' ? C.red : C.amber }]} /><Text style={s.connectionText}>{connection === 'online' ? 'BACKEND ONLINE' : connection === 'offline' ? 'BACKEND OFFLINE' : 'CONNECTING'}</Text></View>
    </View>
    <View style={s.tabs}>
      {([['overview', '▦  Overview'], ['deliveries', '⇢  Deliveries'], ['controls', '⌘  Robot Controls'], ['workflow', '✓  User Workflow'], ['events', '≋  API Events']] as [NavSection, string][]).filter(([key]) => signedInAs === 'Admin' || ['deliveries', 'workflow'].includes(key)).map(([key, label]) => <Pressable key={key} onPress={() => { setSection(key); if (key === 'overview' || key === 'controls') setScreen('admin'); if (key === 'workflow') setScreen('user'); }} style={[s.tab, section === key && s.tabActive]}><Text style={[s.tabText, section === key && s.tabTextActive]}>{label}</Text></Pressable>)}
      <View style={s.accountStrip}><Text style={s.accountName}>{signedInAs}</Text><Pressable onPress={signOut} style={s.signOutButton}><Text style={s.signOutText}>Sign out</Text></Pressable></View>
      <Pressable onPress={() => refresh()} style={s.refresh}><Text style={s.refreshText}>↻ Refresh</Text></Pressable>
    </View>
    <ScrollView style={s.scroll} contentContainerStyle={s.page} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => refresh()} tintColor={C.primary} />}>
      <Text style={s.eyebrow}>{section === 'overview' ? 'ADMIN CONTROL CENTER' : section === 'deliveries' ? 'DELIVERY MANAGEMENT' : section === 'controls' ? 'ROBOT CONTROLS' : section === 'events' ? 'API DEBUGGING' : 'RESTAURANT STAFF WORKFLOW'}</Text>
      <Text style={s.heading}>{section === 'overview' ? 'Robot readiness' : section === 'deliveries' ? 'Deliveries & history' : section === 'controls' ? 'Robot controls' : section === 'events' ? 'API events' : 'Food pickup & delivery'}</Text>
      <Text style={s.description}>{section === 'overview' ? 'Check operational status before assigning a delivery.' : section === 'deliveries' ? 'Select a delivery to inspect or continue its workflow.' : section === 'controls' ? 'Manage simulated battery, tray/table options and system actions.' : section === 'events' ? 'Inspect the most recent response from the FastAPI backend.' : 'Follow each step in order. Select a delivery to enable its workflow actions.'}</Text>
      {!!notice && <View style={[s.notice, /cannot|failed|error|invalid|not ready|select/i.test(notice) && s.noticeError]}><Text style={s.noticeText}>{notice}</Text></View>}
      {busy && <View style={s.loading}><ActivityIndicator color={C.primary} /><Text style={s.muted}>Updating…</Text></View>}

      {section === 'deliveries' ? <>
        <Card title="All deliveries" subtitle="Select an order to continue it in User Workflow">
          {deliveries.length ? deliveries.map((d, i) => { const id = Number(d.delivery_id ?? d.id); const status = show(d.status, 'unknown').replaceAll('_', ' '); return <Pressable key={String(id ?? i)} onPress={() => { selectDelivery(id); setTable(String(d.table_number ?? '1')); setSection('workflow'); setScreen('user'); }} style={[s.deliveryRow, String(id) === selectedId && s.deliveryRowSelected]}><View style={s.deliveryId}><Text style={s.deliveryIdText}>#{id}</Text></View><View style={{ flex: 1 }}><Text style={s.deliveryName}>{show(d.order_id, 'Order')} · Table {show(d.table_number)}</Text><Text style={s.muted}>{Array.isArray(d.items) ? d.items.join(', ') : show(d.items, 'Food items')}</Text></View><Text style={[s.smallPill, { color: ['completed', 'station_confirmed'].includes(d.status) ? C.green : d.status === 'queued' ? C.amber : C.primary }]}>{status.toUpperCase()}</Text></Pressable>; }) : <Text style={s.muted}>No deliveries recorded yet.</Text>}
          <ActionButton title="Refresh deliveries" tone="secondary" onPress={() => refresh()} disabled={busy} />
        </Card>
      </> : section === 'controls' ? <>
        <Card title="Robot readiness controls" subtitle="Admin-only prototype controls; these update simulated backend state">
          <View style={s.twoCol}><View style={{ flex: 1 }}><Field label="Available trays" value={trayCount} onChangeText={setTrayCount} numeric /></View><View style={{ flex: 1 }}><Field label="Available tables" value={tableCount} onChangeText={setTableCount} numeric /></View></View>
          <Text style={s.helper}>These tray/table counts are currently held in frontend state and reset on reload. They are not saved to SQLite yet.</Text>
          <Field label="Simulated battery (%)" value={batteryInput} onChangeText={setBatteryInput} numeric />
          <ActionButton title="Update simulated battery" onPress={updateBattery} disabled={busy} tone="secondary" />
          <ActionButton title="Refresh robot status" onPress={() => refresh()} disabled={busy} />
          <ActionButton title="Simulate system outage / safe stop" tone="danger" onPress={() => Alert.alert('Simulate system outage?', 'This changes the NIA simulation backend.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => runAction('/system/outage', 'POST', { notes: 'Triggered from Robot Controls' }) }])} disabled={busy} />
          <ActionButton title="Recover system" tone="secondary" onPress={() => runAction('/system/recover', 'POST')} disabled={busy} />
        </Card>
      </> : section === 'events' ? <>
        <Card title="Latest backend response" subtitle="Most recent JSON response or error"><Text selectable style={s.code}>{apiResponse}</Text><ActionButton title="Clear response" tone="secondary" onPress={() => setApiResponse('No response yet')} /></Card>
      </> : section === 'overview' ? <>
        <View style={s.metrics}>
          <Metric label="Robot readiness" value={connection === 'offline' ? 'Offline' : ready ? 'READY' : 'CHECK'} note="Based on API, status & battery" color={ready ? C.green : C.red} />
          <Metric label="Battery" value={Number.isFinite(battery) ? `${battery}%` : '—'} note="Reported by backend" color={Number.isFinite(battery) && battery >= 20 ? C.green : C.red} />
          <Metric label="Active deliveries" value={active} note="Not yet completed" color={C.primary} />
          <Metric label="Queued" value={queued} note="Waiting for robot" color={C.amber} />
        </View>
        <Card title="Robot health" subtitle="NIA-01 · status reported by FastAPI">
          <View style={s.healthHero}><View style={s.robotIcon}><Text style={{ fontSize: 34 }}>🤖</Text></View><View style={{ flex: 1 }}><Text style={s.healthStatus}>{show(robot?.status, connection === 'offline' ? 'Unavailable' : 'Loading').replaceAll('_', ' ')}</Text><Text style={s.muted}>Location: {show(robot?.location, 'Unknown')}</Text><Text style={s.muted}>Active delivery: {show(robot?.current_delivery_id, 'None')}</Text></View><View style={[s.statusPill, { backgroundColor: ready ? C.greenBg : C.redBg }]}><Text style={{ color: ready ? C.green : C.red, fontWeight: '900', fontSize: 11 }}>{ready ? 'READY' : 'NOT READY'}</Text></View></View>
          <View style={s.progressHead}><Text style={s.label}>Battery level</Text><Text style={s.label}>{Number.isFinite(battery) ? `${battery}%` : 'Unknown'}</Text></View><View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.max(0, Math.min(100, Number.isFinite(battery) ? battery : 0))}%`, backgroundColor: battery >= 40 ? C.green : battery >= 20 ? C.amber : C.red }]} /></View>
          <View style={s.infoGrid}><View style={s.infoBox}><Text style={s.infoLabel}>Backend</Text><Text style={s.infoValue}>{connection === 'online' ? 'Connected' : connection === 'offline' ? 'Offline' : 'Checking'}</Text></View><View style={s.infoBox}><Text style={s.infoLabel}>Last checked</Text><Text style={s.infoValue}>{lastChecked}</Text></View></View>
          <Text style={s.helper}>Readiness is currently based on backend connectivity, reported battery and simulated status. It is not physical robot telemetry.</Text>
        </Card>
        <Card title="Admin settings" subtitle="Temporary UI configuration and simulated controls">
          <View style={s.twoCol}><View style={{ flex: 1 }}><Field label="Available trays" value={trayCount} onChangeText={setTrayCount} numeric /></View><View style={{ flex: 1 }}><Field label="Available tables" value={tableCount} onChangeText={setTableCount} numeric /></View></View>
          <Text style={s.helper}>Tray/table counts are currently configured in this frontend screen. Persisting them for all devices requires a backend settings endpoint.</Text>
          <Field label="Simulated battery (%)" value={batteryInput} onChangeText={setBatteryInput} numeric /><ActionButton title="Update simulated battery" onPress={updateBattery} disabled={busy} tone="secondary" />
          <ActionButton title="Refresh robot readiness" onPress={() => refresh()} disabled={busy} />
        </Card>
        <Card title="Delivery overview" subtitle="Select a delivery to operate it from the User screen">
          {deliveries.length ? deliveries.slice(0, 8).map((d, i) => { const id = Number(d.delivery_id ?? d.id); const status = show(d.status, 'unknown').replaceAll('_', ' '); return <Pressable key={String(id ?? i)} onPress={() => { selectDelivery(id); setTable(String(d.table_number ?? '1')); setScreen('user'); }} style={[s.deliveryRow, String(id) === selectedId && s.deliveryRowSelected]}><View style={s.deliveryId}><Text style={s.deliveryIdText}>#{id}</Text></View><View style={{ flex: 1 }}><Text style={s.deliveryName}>{show(d.order_id, 'Order')} · Table {show(d.table_number)}</Text><Text style={s.muted}>{Array.isArray(d.items) ? d.items.join(', ') : show(d.items, 'Food items')}</Text></View><Text style={[s.smallPill, { color: d.status === 'completed' ? C.green : d.status === 'queued' ? C.amber : C.primary }]}>{status.toUpperCase()}</Text></Pressable>; }) : <Text style={s.muted}>No deliveries yet. Create one from the User screen.</Text>}
          <Text style={s.helper}>Tap a delivery to continue its workflow.</Text>
        </Card>
      </> : <>
        <Card title="1 · Delivery planner" subtitle="Choose single-task or multi-task delivery. Assignment is validated and saved by FastAPI.">
          <Text style={s.label}>Delivery mode</Text>
          <View style={s.choiceWrap}>
            <Choice label="Single-task · 1 table" selected={deliveryMode === 'single'} onPress={() => setDeliveryMode('single')} />
            <Choice label="Multi-task · multiple tables" selected={deliveryMode === 'multi'} onPress={() => setDeliveryMode('multi')} />
          </View>
          {deliveryMode === 'single' ? <>
            <Field label="Order ID" value={orderId} onChangeText={setOrderId} placeholder="e.g. ORD-1002" />
            <Field label="Food items (comma-separated)" value={items} onChangeText={setItems} placeholder="Pizza, Juice" />
            <Text style={s.label}>Destination table</Text><View style={s.choiceWrap}>{tables.map(n => <Choice key={n} label={`Table ${n}`} selected={Number(table) === n} onPress={() => setTable(String(n))} />)}</View>
            <Text style={s.label}>Tray selection</Text><View style={s.choiceWrap}>{trays.map(t => <Choice key={t} label={t} selected={selectedTray === t} onPress={() => setSelectedTray(t)} />)}</View>
          </> : <>
            <Text style={s.helper}>Example batch: Table 1 → Tray 1, Table 5 → Tray 3, Table 10 → Tray 2. Edit order details below.</Text>
            {batchOrders.map((o, index) => <View key={o.table_number} style={s.batchItem}>
              <Text style={s.stepTitle}>Table {o.table_number} · {o.tray}</Text>
              <Field label="Order ID" value={o.order_id} onChangeText={v => updateBatchOrder(index, 'order_id', v)} placeholder="Order ID" />
              <Field label="Food items (comma-separated)" value={o.items} onChangeText={v => updateBatchOrder(index, 'items', v)} placeholder="Food items" />
              <Text style={s.label}>Tray assignment</Text>
              <View style={s.choiceWrap}>{trays.map(t => <Choice key={t} label={t} selected={o.tray === t} onPress={() => updateBatchOrder(index, 'tray', t)} />)}</View>
            </View>)}
          </>}
          <ActionButton title={deliveryMode === 'single' ? '＋ Create Single Delivery' : '＋ Create Multi-Task Batch'} onPress={createBatch} disabled={busy} tone="success" />
          <Text style={s.helper}>The backend checks tray uniqueness and robot availability and saves the batch to SQLite. Navigation and movement are simulated; ROS 2 / physical robot integration is not connected.</Text>
        </Card>
        <Card title="Select delivery" subtitle="Choose the active task before confirming workflow steps">
          {deliveries.length ? <View style={s.choiceWrap}>{deliveries.filter(d => !['completed', 'cancelled'].includes(d.status)).map(d => { const id = Number(d.delivery_id ?? d.id); return <Choice key={String(id)} label={`#${id} · ${show(d.order_id)} · Table ${show(d.table_number)}`} selected={String(id) === selectedId} onPress={() => { selectDelivery(id); setTable(String(d.table_number ?? table)); }} />; })}</View> : <Text style={s.muted}>No active delivery yet. Create one above.</Text>}
          {selected ? <View style={s.selectedBox}><Text style={s.selectedTitle}>Selected: {show(selected.order_id)} · Table {show(selected.table_number)}</Text><Text style={s.muted}>Current status: {show(selected.status).replaceAll('_', ' ')}</Text><Text style={s.muted}>Assigned tray: {selected?.tray_number ? `Tray ${selected.tray_number}` : 'Not assigned'}</Text>{selected?.batch_id ? <Text style={s.muted}>Batch: {selected.batch_id} · deliveries continue sequentially</Text> : null}</View> : <Text style={s.helper}>Create or select a delivery to use the action buttons below.</Text>}
        </Card>
        <Card title="Delivery steps" subtitle="Confirm each step only after staff or robot verifies it">
          {[
            { n: '2', title: 'Robot arrived to pick', detail: 'Confirm the robot has reached the kitchen pickup point.', action: 'pickup-arrived', label: 'Confirm robot arrived at pickup', tone: 'secondary' as const },
            { n: '3', title: 'Food loaded on tray', detail: 'After placing food on the selected tray, confirm loading.', action: 'pickup-confirm', label: 'Confirm food loaded on tray', tone: 'primary' as const },
            { n: '4', title: 'Robot moved to deliver', detail: 'Dispatch the delivery toward the selected table.', action: 'dispatch', label: 'Dispatch robot to table', tone: 'purple' as const },
            { n: '5', title: 'Robot arrived at table', detail: 'Record table arrival before customer handoff.', action: 'arrive', label: 'Confirm arrival at table', tone: 'secondary' as const },
            { n: '6', title: 'Customer picked the food', detail: 'Confirm the customer has taken the food.', action: 'handoff', label: 'Confirm customer picked food', tone: 'primary' as const },
            { n: '7', title: 'Food delivered confirmation', detail: 'Confirm delivery completion in the workflow.', action: 'station-confirm', label: 'Confirm food delivered', tone: 'success' as const },
          ].map(step => <View key={step.n} style={s.stepRow}><View style={s.stepNumber}><Text style={s.stepNumberText}>{step.n}</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={s.stepTitle}>{step.title}</Text><Text style={s.muted}>{step.detail}</Text><ActionButton title={step.label} tone={step.tone} disabled={busy || !selected} onPress={() => deliveryAction(step.action, `${step.title} recorded.`)} /></View></View>)}
          <View style={[s.stepRow, { borderBottomWidth: 0 }]}><View style={[s.stepNumber, { backgroundColor: C.redBg }]}><Text style={[s.stepNumberText, { color: C.red }]}>8</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={s.stepTitle}>Robot move to docking station</Text><Text style={s.muted}>Record the simulated robot return after delivery completion.</Text><ActionButton title="Return robot to docking station" tone="danger" disabled={busy || !selected} onPress={() => runAction('/robot/returned', 'POST', undefined, 'Robot return recorded.')} /></View></View>
        </Card>
        <Card title="Change destination" subtitle="Change the selected delivery's table">
          <Text style={s.label}>Choose destination table</Text><View style={s.choiceWrap}>{tables.map(n => <Choice key={n} label={`Table ${n}`} selected={Number(table) === n} onPress={() => setTable(String(n))} />)}</View><ActionButton title="Save destination table" tone="secondary" disabled={busy || !selected} onPress={updateTable} />
        </Card>
      </>}
      <Card title="Latest backend response" subtitle="Useful for debugging and verifying API calls"><Text selectable style={s.code}>{apiResponse}</Text></Card>
      <Text style={s.footer}>NIA Operations · React Native + FastAPI + SQLite · Single/multi batches · simulated execution only · ROS 2 / physical robot integration pending</Text>
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  loginSafe: { flex: 1, backgroundColor: C.bg }, loginPage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 22, gap: 12 }, loginLogo: { width: 78, height: 78, borderRadius: 24, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }, loginLogoText: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', letterSpacing: 2 }, loginTitle: { color: C.text, fontSize: 29, fontWeight: '900', marginTop: 8 }, loginSubtitle: { color: C.muted, fontSize: 13, marginBottom: 8 }, loginCard: { width: '100%', maxWidth: 440, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 20, padding: 20, gap: 13, shadowColor: '#253B5C', shadowOpacity: 0.08, shadowRadius: 15, shadowOffset: { width: 0, height: 5 } }, loginCardTitle: { color: C.text, fontSize: 19, fontWeight: '900' }, demoCredentials: { backgroundColor: C.blueBg, borderRadius: 11, padding: 12, gap: 4 }, demoTitle: { color: C.primary, fontSize: 11, fontWeight: '900' }, accountStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: C.surfaceAlt }, accountName: { color: C.text, fontSize: 11, fontWeight: '900' }, signOutButton: { backgroundColor: C.redBg, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 }, signOutText: { color: C.red, fontSize: 10, fontWeight: '900' },
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 18, paddingVertical: 15, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  brand: { color: C.text, fontSize: 25, fontWeight: '900', letterSpacing: 1 }, brandSub: { color: C.muted, fontSize: 10, letterSpacing: 1.4, marginTop: 2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 11 }, connectionOnline: { backgroundColor: C.greenBg }, connectionOffline: { backgroundColor: C.redBg }, connectionWaiting: { backgroundColor: C.amberBg }, dot: { width: 8, height: 8, borderRadius: 4 }, connectionText: { color: C.text, fontSize: 10, fontWeight: '900' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }, tab: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 10, backgroundColor: C.surfaceAlt }, tabActive: { backgroundColor: C.blueBg, borderWidth: 1, borderColor: '#B7CBFF' }, tabText: { color: C.muted, fontSize: 12, fontWeight: '800' }, tabTextActive: { color: C.primary }, refresh: { marginLeft: 'auto', padding: 9 }, refreshText: { color: C.primary, fontSize: 12, fontWeight: '800' },
  scroll: { flex: 1 }, page: { padding: 16, paddingBottom: 34, gap: 14, width: '100%', maxWidth: 1100, alignSelf: 'center' }, eyebrow: { color: C.teal, fontWeight: '900', fontSize: 10, letterSpacing: 1.5 }, heading: { color: C.text, fontSize: 29, fontWeight: '900', marginTop: -8 }, description: { color: C.muted, fontSize: 13, marginTop: -8, lineHeight: 19 },
  notice: { backgroundColor: C.greenBg, borderColor: '#A8E3C3', borderWidth: 1, borderRadius: 12, padding: 12 }, noticeError: { backgroundColor: C.redBg, borderColor: '#F0B9C2' }, noticeText: { color: C.text, fontSize: 12, lineHeight: 18 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, muted: { color: C.muted, fontSize: 11, lineHeight: 17 }, helper: { color: C.muted, fontSize: 10, lineHeight: 16 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { flexGrow: 1, flexBasis: 145, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 14 }, metricLabel: { color: C.muted, fontSize: 11, fontWeight: '700' }, metricValue: { fontSize: 24, fontWeight: '900', marginTop: 9 }, metricNote: { color: C.muted, fontSize: 10, marginTop: 4 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, shadowColor: '#253B5C', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, cardTitle: { color: C.text, fontSize: 16, fontWeight: '900' }, healthHero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: C.surfaceAlt, borderRadius: 13, borderWidth: 1, borderColor: C.border }, robotIcon: { width: 58, height: 58, borderRadius: 15, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' }, healthStatus: { color: C.text, fontSize: 17, fontWeight: '900', textTransform: 'capitalize', marginBottom: 4 }, statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 }, progressHead: { flexDirection: 'row', justifyContent: 'space-between' }, label: { color: C.muted, fontSize: 11, fontWeight: '800', marginBottom: 6 }, progressTrack: { height: 9, backgroundColor: '#E6ECF4', borderRadius: 10, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 10 }, infoGrid: { flexDirection: 'row', gap: 9 }, infoBox: { flex: 1, padding: 11, backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border }, infoLabel: { color: C.muted, fontSize: 10 }, infoValue: { color: C.text, fontSize: 12, fontWeight: '800', marginTop: 5 },
  field: { flex: 1, marginBottom: 2 }, input: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, minHeight: 44, color: C.text, fontSize: 13 }, twoCol: { flexDirection: 'row', gap: 10 }, button: { minHeight: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 11 }, button_primary: { backgroundColor: C.primary }, button_secondary: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border }, button_success: { backgroundColor: C.green }, button_danger: { backgroundColor: C.red }, button_purple: { backgroundColor: C.purple }, buttonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900', textAlign: 'center' }, disabled: { opacity: 0.42 }, pressed: { opacity: 0.75 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 9, backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border }, choiceSelected: { backgroundColor: C.blueBg, borderColor: C.primary }, choiceText: { color: C.muted, fontSize: 11, fontWeight: '800' }, choiceTextSelected: { color: C.primary },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt }, deliveryRowSelected: { borderColor: C.primary, backgroundColor: C.blueBg }, deliveryId: { width: 39, height: 39, borderRadius: 10, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' }, deliveryIdText: { color: C.primary, fontWeight: '900', fontSize: 11 }, deliveryName: { color: C.text, fontSize: 12, fontWeight: '900', marginBottom: 3 }, smallPill: { fontSize: 9, fontWeight: '900', maxWidth: 90 }, selectedBox: { backgroundColor: C.blueBg, borderRadius: 10, padding: 12, gap: 5 }, selectedTitle: { color: C.primary, fontWeight: '900', fontSize: 12 },
  batchItem: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 12, gap: 8, backgroundColor: C.surfaceAlt },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 14, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#EDF1F6' }, stepNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' }, stepNumberText: { color: C.primary, fontWeight: '900', fontSize: 13 }, stepTitle: { color: C.text, fontSize: 13, fontWeight: '900' }, code: { color: '#34445D', fontSize: 10, lineHeight: 16, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }, footer: { color: C.muted, textAlign: 'center', fontSize: 10, marginTop: 4 },
});

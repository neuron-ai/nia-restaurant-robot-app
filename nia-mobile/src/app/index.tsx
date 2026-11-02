import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// For browser on this laptop use localhost. For a physical phone, update the IP below.

const API_URL =
  process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';


type RecordData = Record<string, any>;
type Screen = 'admin' | 'user';
type NavSection = 'overview' | 'tracking' | 'deliveries' | 'controls' | 'workflow' | 'events';

const C = {
  // Clean white operator interface with simple outlined touch controls.
  bg: '#FFFFFF', surface: '#FFFFFF', surfaceAlt: '#FFFFFF', border: '#D7DCE2',
  text: '#17191C', muted: '#626B75', primary: '#20252B', primaryDark: '#111418',
  teal: '#333B44', green: '#247A4B', greenBg: '#EAF5EE', amber: '#9A6814', amberBg: '#FFF6E5',
  red: '#B23B42', redBg: '#FCEDEE', blueBg: '#F0F2F4', purple: '#424A54', purpleBg: '#F1F2F4',
};

// A multi-task run is one kitchen pickup followed by exactly three table stops.
const MAX_TRIP_STOPS = 3;

const show = (v: unknown, fallback = '—') => v === null || v === undefined || v === '' ? fallback : typeof v === 'object' ? JSON.stringify(v) : String(v);
function rowsFrom(data: unknown): RecordData[] {
  if (Array.isArray(data)) return data as RecordData[];
  if (data && typeof data === 'object') {
    const d = data as RecordData;
    for (const k of ['deliveries', 'items', 'data', 'results']) if (Array.isArray(d[k])) return d[k];
  }
  return [];
}
async function request(path: string, method = 'GET', body?: RecordData, token?: string) {
  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    const detail = error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
    throw new Error(`Network error on ${path} (${API_URL}): ${detail}`);
  }

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = { detail: 'Backend returned an unreadable response' };
  }

  if (!response.ok) {
    throw new Error(
      `${path} failed with HTTP ${response.status}: ${data?.detail || JSON.stringify(data)}`
    );
  }

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
  const { width: screenWidth } = useWindowDimensions();
  const isCompact = screenWidth < 700;
  const [screen, setScreen] = useState<Screen>('admin');
  const [section, setSection] = useState<NavSection>('overview');
  const [authenticated, setAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');
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
  const [deliveryMode, setDeliveryMode] = useState<'single'|'multi'>('single');
  const [batchOrders, setBatchOrders] = useState<{ order_id: string; table_number: number; items: string; trays: string[] }[]>([]);
  const [singleTrays, setSingleTrays] = useState<string[]>(['Tray 1']);
  const [trayCount, setTrayCount] = useState('3');
  const [tableCount, setTableCount] = useState('15');
  const [batteryInput, setBatteryInput] = useState('100');
  const [lastChecked, setLastChecked] = useState('—');

  const api = useCallback(async (path: string, method = 'GET', body?: RecordData) => {
    const data = await request(path, method, body, authToken);
    setApiResponse(JSON.stringify(data, null, 2));
    return data;
  }, [authToken]);
  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setBusy(true);
    try {
      const [r, d] = await Promise.all([request('/robot', 'GET', undefined, authToken), request('/deliveries', 'GET', undefined, authToken)]);
      const latestDeliveries = rowsFrom(d);
      setApiResponse(JSON.stringify({ robot: r, deliveries: latestDeliveries }, null, 2));
      setRobot(r);
      setBatteryInput(String(r?.battery_percent ?? 100));
      setDeliveries(latestDeliveries);
      setConnection('online');

      // Keep the selected delivery aligned with the backend's currently assigned task.
      // If the selected item is queued/finished, switch to the task the robot owns.
      const currentId = r?.current_delivery_id;
      const currentTask = currentId == null ? null : latestDeliveries.find(
        item => Number(item.delivery_id ?? item.id) === Number(currentId)
      );
      const selectedTask = latestDeliveries.find(
        item => Number(item.delivery_id ?? item.id) === Number(selectedId)
      );
      const selectedStatus = String(selectedTask?.status ?? '');
      if (currentTask && (
        !selectedTask ||
        ['queued', 'completed', 'cancelled', 'station_confirmed'].includes(selectedStatus)
      )) {
        setSelectedId(String(currentId));
      } else if (!selectedTask && currentTask) {
        setSelectedId(String(currentId));
      }

      if (!quiet) setNotice('Robot readiness and deliveries refreshed.');
      setLastChecked(new Date().toLocaleTimeString());
    } catch (e) {
      setConnection('offline');
      // Keep the exact API error visible, including during automatic refreshes.
      setNotice(e instanceof Error ? e.message : String(e));
      setLastChecked(new Date().toLocaleTimeString());
    } finally { if (!quiet) setBusy(false); }
  }, [authToken, selectedId]);
  useEffect(() => { if (!authenticated || !authToken) return; refresh(); const timer = setInterval(() => refresh(true), 15000); return () => clearInterval(timer); }, [refresh, authenticated, authToken]);

  const selected = useMemo(() => deliveries.find(d => Number(d.delivery_id ?? d.id) === Number(selectedId)), [deliveries, selectedId]);
  const selectedStatus = String(selected?.status ?? '');
  const selectedIsRobotTask = selected != null && Number(robot?.current_delivery_id) === Number(selectedId);
  const canComeToKitchen = selectedStatus === 'task_created' && selectedIsRobotTask;
  const canConfirmFood = selectedStatus === 'awaiting_food_loading' && selectedIsRobotTask;
  const canDispatch = selectedStatus === 'food_loaded' && selectedIsRobotTask;
  const canConfirmArrival = selectedStatus === 'en_route_to_table' && selectedIsRobotTask;
  const canConfirmHandoff = selectedStatus === 'arrived_at_table' && selectedIsRobotTask;
  const canCompleteDelivery = selectedStatus === 'handoff_confirmed' && selectedIsRobotTask;
  const canReturnRobot = robot?.status === 'returning_to_staging';
  const battery = Number(robot?.battery_percent);
  const completed = deliveries.filter(d => ['completed', 'station_confirmed'].includes(d.status)).length;
  const active = deliveries.filter(d => !['completed', 'cancelled', 'station_confirmed'].includes(d.status)).length;
  const queued = deliveries.filter(d => d.status === 'queued').length;
  const ready = connection === 'online' && battery >= 20 && !['system_outage', 'low_battery', 'route_blocked'].includes(String(robot?.status));
  const trays = Array.from({ length: Math.max(1, Math.min(20, Number(trayCount) || 3)) }, (_, i) => `Tray ${i + 1}`);
  const tables = Array.from({ length: Math.max(1, Math.min(15, Number(tableCount) || 15)) }, (_, i) => i + 1);

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
    const chosen = deliveryMode === 'single'
      ? [{ order_id: orderId, table_number: Number(table), items, trays: singleTrays }]
      : batchOrders;
    const payloadItems = chosen.map((o) => ({
      order_id: o.order_id.trim(), table_number: Number(o.table_number),
      items: o.items.split(',').map((x: string) => x.trim()).filter(Boolean),
      trays: o.trays.map(t => Number(String(t).match(/\d+/)?.[0])),
    }));
    if (payloadItems.some(o => !o.order_id || !Number.isInteger(o.table_number) || o.table_number < 1 || !o.items.length || !o.trays.length)) {
      setNotice('Every table needs an order ID, valid table, food items and at least one tray.'); return;
    }
    if (deliveryMode === 'multi' && payloadItems.length !== MAX_TRIP_STOPS) { setNotice(`Multi-task mode requires exactly ${MAX_TRIP_STOPS} tables for one trip. Select ${MAX_TRIP_STOPS} tables before creating the batch.`); return; }
    if (payloadItems.some(o => o.trays.some(n => !Number.isInteger(n) || n < 1 || n > trays.length))) { setNotice('Choose valid available trays for every table.'); return; }
    const allTrays = payloadItems.flatMap(o => o.trays);
    if (new Set(allTrays).size !== allTrays.length) { setNotice('Each tray can be assigned to only one table per trip.'); return; }
    if (!ready) { setNotice('Robot is not ready. Check connectivity, battery and robot status.'); return; }
    // Keep the existing backend request shape. The backend must interpret this as one
    // loaded multi-stop trip and advance through its three deliveries without a kitchen return.
    await runAction('/batches', 'POST', { mode: deliveryMode, items: payloadItems }, 'Three-table delivery batch created.');
  }
  function toggleBatchTable(tableNo: number) {
    setBatchOrders(old => {
      if (old.some(o => o.table_number === tableNo)) return old.filter(o => o.table_number !== tableNo);
      if (old.length >= MAX_TRIP_STOPS) { setNotice(`One trip supports a maximum of ${MAX_TRIP_STOPS} table stops.`); return old; }
      const used = new Set(old.flatMap(o => o.trays));
      const freeTray = trays.find(t => !used.has(t));
      if (!freeTray) { setNotice('No unassigned tray available. Increase available trays or remove a table.'); return old; }
      setNotice('');
      return [...old, { order_id: '', table_number: tableNo, items: '', trays: [freeTray] }];
    });
  }
  function updateBatchOrder(index: number, field: 'order_id'|'items', value: string) {
    setBatchOrders(old => old.map((o, i) => i === index ? { ...o, [field]: value } : o));
  }
  function toggleBatchTray(index: number, tray: string) {
    setBatchOrders(old => {
      const current = old[index];
      if (!current) return old;
      const assignedElsewhere = new Set(old.filter((_, i) => i !== index).flatMap(o => o.trays));
      if (current.trays.includes(tray)) {
        if (current.trays.length === 1) { setNotice('Each selected table must have at least one tray.'); return old; }
        return old.map((o, i) => i === index ? { ...o, trays: o.trays.filter(t => t !== tray) } : o);
      }
      if (assignedElsewhere.has(tray)) { setNotice(`${tray} is already assigned to another table.`); return old; }
      if (old.flatMap(o => o.trays).length >= trays.length) { setNotice('No free trays remain.'); return old; }
      return old.map((o, i) => i === index ? { ...o, trays: [...o.trays, tray] } : o);
    });
  }
  // Assign every tray that is still free to this table. Trays already
  // assigned to another table remain reserved, and each table keeps at least one.
  function selectAllFreeTrays(index: number) {
    setBatchOrders(old => {
      const current = old[index];
      if (!current) return old;
      const assignedElsewhere = new Set(
        old.filter((_, i) => i !== index).flatMap(o => o.trays)
      );
      const availableForThisTable = trays.filter(t => !assignedElsewhere.has(t));
      if (!availableForThisTable.length) {
        setNotice('No free trays remain. Remove a tray from another table first.');
        return old;
      }
      setNotice(`${availableForThisTable.length} tray(s) assigned to Table ${current.table_number}.`);
      return old.map((o, i) =>
        i === index ? { ...o, trays: availableForThisTable } : o
      );
    });
  }

  function updateBatchTable(index: number, tableNumber: number) {
    setBatchOrders(old => old.map((o, i) => i === index ? { ...o, table_number: tableNumber } : o));
  }
  function addBatchOrder() {
    const usedTables = new Set(batchOrders.map(o => o.table_number));
    const usedTrays = new Set(batchOrders.flatMap(o => o.trays));
    const nextTable = tables.find(n => !usedTables.has(n));
    const nextTray = trays.find(t => !usedTrays.has(t));
    if (nextTable === undefined || !nextTray || batchOrders.length >= MAX_TRIP_STOPS) {
      setNotice(`No free table/tray slot available. One trip supports up to ${MAX_TRIP_STOPS} tables.`); return;
    }
    setBatchOrders(old => [...old, { order_id: '', table_number: nextTable, items: '', trays: [nextTray] }]);
  }
  function removeBatchOrder(index: number) {
    if (batchOrders.length <= MAX_TRIP_STOPS) { setNotice(`Keep exactly ${MAX_TRIP_STOPS} table orders in the multi-task batch. Switch to single-task mode to create a smaller order.`); return; }
    setBatchOrders(old => old.filter((_, i) => i !== index));
  }

  const deliveryAction = (action: string, success: string) => {
    if (!selectedId || !selected) { setNotice('Create an order first, then select its active delivery.'); return; }
    if (!selectedIsRobotTask) {
      setNotice(`Delivery #${selectedId} is not currently assigned to the robot. Select the active delivery.`);
      return;
    }
    const allowed: Record<string, boolean> = {
      'pickup-arrived': canComeToKitchen,
      'pickup-confirm': canConfirmFood,
      'dispatch': canDispatch,
      'arrive': canConfirmArrival,
      'handoff': canConfirmHandoff,
      'station-confirm': canCompleteDelivery,
    };
    if (!allowed[action]) {
      setNotice(`This action is not available while the delivery status is "${selectedStatus.replaceAll('_', ' ')}".`);
      return;
    }
    runAction(`/deliveries/${Number(selectedId)}/${action}`, 'POST', undefined, success);
  };

  // Click 2: confirm loading, then dispatch. Stop immediately if either API call fails.
  async function loadFoodAndDispatch() {
    if (!selectedId || !selected || !selectedIsRobotTask) {
      setNotice('Select the delivery currently assigned to the robot.'); return;
    }
    if (!canConfirmFood && !canDispatch) {
      setNotice(`Food loading/delivery cannot start while status is "${selectedStatus.replaceAll('_', ' ')}".`); return;
    }
    setBusy(true); setNotice('Confirming food loading…');
    try {
      if (canConfirmFood) {
        await api(`/deliveries/${Number(selectedId)}/pickup-confirm`, 'POST');
      }
      setNotice('Food loading confirmed. Starting delivery to the table…');
      // If a previous attempt confirmed loading but failed during dispatch, resume here.
      await api(`/deliveries/${Number(selectedId)}/dispatch`, 'POST');
      setNotice('Food loading confirmed and delivery dispatched.');
      await refresh(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not start the delivery.');
      await refresh(true);
    } finally { setBusy(false); }
  }

  // Click 3: record table arrival, customer handoff and completion in order.
  // After the final task in a batch, automatically record the robot's return to dock.
  async function confirmDeliveryAndReturn() {
    if (!selectedId || !selected || !selectedIsRobotTask) {
      setNotice('Select the delivery currently assigned to the robot.'); return;
    }
    if (!['en_route_to_table', 'arrived_at_table', 'handoff_confirmed'].includes(selectedStatus)) {
      setNotice(`Delivery confirmation is not available while status is "${selectedStatus.replaceAll('_', ' ')}".`); return;
    }
    setBusy(true); setNotice('Recording arrival at the table…');
    try {
      const id = Number(selectedId);
      if (selectedStatus === 'en_route_to_table') {
        await api(`/deliveries/${id}/arrive`, 'POST');
      }
      setNotice('Arrival recorded. Confirming customer handoff…');
      if (selectedStatus !== 'handoff_confirmed') {
        await api(`/deliveries/${id}/handoff`, 'POST');
      }
      setNotice('Customer handoff recorded. Completing delivery…');
      await api(`/deliveries/${id}/station-confirm`, 'POST');

      // station-confirm may assign the next queued delivery. Only mark the robot
      // docked when the backend says it is returning to the staging/docking station.
      const robotState = await api('/robot', 'GET');
      if (robotState?.status === 'returning_to_staging') {
        setNotice('All deliveries completed. Recording robot return to docking station…');
        await api('/robot/returned', 'POST');
        setNotice('Delivery completed. Robot return to docking station recorded.');
      } else if (robotState?.current_delivery_id != null) {
        setNotice('Delivery completed. The next queued delivery has been assigned to the robot.');
      } else {
        setNotice('Delivery completed successfully.');
      }
      await refresh(true);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not complete the delivery workflow.');
      await refresh(true);
    } finally { setBusy(false); }
  }
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

  async function signIn() {
    setLoginError('');
    try {
      const result = await request('/auth/login', 'POST', { username: loginUsername.trim(), password: loginPassword });
      if (!result?.access_token || !['Admin', 'Staff'].includes(result?.role)) throw new Error('Backend returned an invalid login response.');
      setAuthToken(result.access_token);
      setSignedInAs(result.role);
      setAuthenticated(true);
      setSection(result.role === 'Admin' ? 'overview' : 'workflow');
      setScreen(result.role === 'Admin' ? 'admin' : 'user');
      setLoginPassword('');
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : 'Sign in failed.');
    }
  }

  function signOut() { setAuthenticated(false); setAuthToken(''); setLoginPassword(''); setLoginError(''); setSection('overview'); setScreen('admin'); setConnection('checking'); }

  function clearControlPanel() {
    setSelectedId('');
    setOrderId('');
    setItems('');
    setTable('1');
    setSelectedTray('Tray 1');
    setSingleTrays(['Tray 1']);
    setBatchOrders([]);
    setNotice('Control panel selections cleared.');
  }

  function cancelFromControlPanel() {
    if (!selectedId) {
      setNotice('Select a delivery before cancelling it.');
      return;
    }
    runAction(`/deliveries/${Number(selectedId)}/cancel`, 'POST',
      { notes: 'Cancelled from NIA control panel' },
      'Delivery cancellation requested.');
  }

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
        <Text style={s.helper}>Sign-in is verified by the NIA backend. Ask your administrator for your assigned account.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;

  return <SafeAreaView style={s.safe}>
    <View style={[s.header, isCompact && s.headerCompact]}>
      <View><Text style={[s.brand, isCompact && s.brandCompact]}>NIA <Text style={{ color: C.primary }}>●</Text></Text><Text style={[s.brandSub, isCompact && s.brandSubCompact]}>RESTAURANT ROBOT OPERATIONS</Text></View>
      <View style={[s.connection, isCompact && s.connectionCompact, connection === 'online' ? s.connectionOnline : connection === 'offline' ? s.connectionOffline : s.connectionWaiting]}><View style={[s.dot, isCompact && s.dotCompact, { backgroundColor: connection === 'online' ? C.green : connection === 'offline' ? C.red : C.amber }]} /><Text style={[s.connectionText, isCompact && s.connectionTextCompact]}>{connection === 'online' ? 'BACKEND ONLINE' : connection === 'offline' ? 'BACKEND OFFLINE' : 'CONNECTING'}</Text></View>
    </View>
    <View style={[s.tabs, isCompact && s.tabsCompact]}>
      {signedInAs === 'Admin' ? <>
        <Pressable onPress={() => { setScreen('admin'); setSection('overview'); }} style={[s.tab, isCompact && s.tabCompact, screen === 'admin' && s.tabActive]}><Text style={[s.tabText, isCompact && s.tabTextCompact, screen === 'admin' && s.tabTextActive]}>ADMIN SCREEN</Text></Pressable>
        <Pressable onPress={() => { setScreen('user'); setSection('workflow'); }} style={[s.tab, isCompact && s.tabCompact, screen === 'user' && s.tabActive]}><Text style={[s.tabText, isCompact && s.tabTextCompact, screen === 'user' && s.tabTextActive]}>STAFF SCREEN PREVIEW</Text></Pressable>
      </> : <View style={[s.tab, isCompact && s.tabCompact, s.tabActive]}><Text style={[s.tabTextActive, isCompact && s.tabTextCompact]}>STAFF WORKFLOW</Text></View>}
      {signedInAs === 'Admin' && screen === 'admin' ? <>
        {([['overview', 'Overview'], ['tracking', 'Gazebo Live Tracking'], ['deliveries', 'Deliveries'], ['controls', 'Robot Settings'], ['events', 'API Events']] as [NavSection, string][]).map(([key, label]) => <Pressable key={key} onPress={() => setSection(key)} style={[s.tab, isCompact && s.tabCompact, section === key && s.tabActive]}><Text style={[s.tabText, isCompact && s.tabTextCompact, section === key && s.tabTextActive]}>{label}</Text></Pressable>)}
      </> : null}
      <View style={[s.accountStrip, isCompact && s.accountStripCompact]}><Text style={[s.accountName, isCompact && s.accountNameCompact]}>{signedInAs}</Text><Pressable onPress={signOut} style={[s.signOutButton, isCompact && s.signOutButtonCompact]}><Text style={[s.signOutText, isCompact && s.signOutTextCompact]}>Sign out</Text></Pressable></View>
      <Pressable onPress={() => refresh()} style={[s.refresh, isCompact && s.refreshCompact]}><Text style={[s.refreshText, isCompact && s.refreshTextCompact]}>↻</Text></Pressable>
    </View>
    <ScrollView style={s.scroll} scrollEnabled={!(isCompact && section === 'workflow')} contentContainerStyle={[s.page, isCompact && section === 'workflow' && s.mobilePage]} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => refresh()} tintColor={C.primary} />}>
      {section === 'workflow' && <>
        {!isCompact && <Text style={s.eyebrow}>RESTAURANT STAFF WORKFLOW</Text>}
        <Text style={isCompact ? s.compactHeading : s.heading}>Staff food pickup & delivery</Text>
        {!isCompact && <Text style={s.description}>Create an order, select the active delivery, then complete the restaurant workflow with three staff actions.</Text>}
        {!!notice && <View style={[isCompact ? s.compactNotice : s.notice, /cannot|failed|error|invalid|not ready|select/i.test(notice) && s.noticeError]}><Text style={s.noticeText}>{notice}</Text></View>}
        {busy && <View style={s.loading}><ActivityIndicator color={C.primary} /><Text style={s.muted}>Updating…</Text></View>}
      </>}
      {section === 'workflow' && isCompact && <View style={s.mobileWorkflow}>
        <View style={s.mobileOrderCard}>
          <Text style={s.mobileSectionTitle}>NEW DELIVERY</Text>
          <View style={s.mobileInputRow}>
            <View style={{ flex: 1.2 }}><Text style={s.mobileLabel}>ORDER ID</Text><TextInput value={orderId} onChangeText={setOrderId} placeholder="ORD-1001" placeholderTextColor="#91A0B5" style={s.mobileInput} /></View>
            <View style={{ width: 78 }}><Text style={s.mobileLabel}>TABLE</Text><TextInput value={table} onChangeText={setTable} keyboardType="numeric" placeholder="2" placeholderTextColor="#91A0B5" style={s.mobileInput} /></View>
          </View>
          <Text style={s.mobileLabel}>FOOD ITEMS</Text>
          <TextInput value={items} onChangeText={setItems} placeholder="Burger, Fries" placeholderTextColor="#91A0B5" style={s.mobileInput} />
          <View style={s.mobileInputRow}>
            <Text style={s.mobileSmallHint}>Assigned tray: {singleTrays.join(', ') || 'Tray 1'}</Text>
            <Pressable onPress={() => setSingleTrays(['Tray 1'])}><Text style={s.mobileLink}>Use Tray 1</Text></Pressable>
          </View>
          <Pressable style={[s.mobileCreateButton, busy && s.disabled]} onPress={createBatch} disabled={busy}>
            <Text style={s.mobileCreateText}>+ CREATE ORDER</Text>
          </Pressable>
        </View>
        <View style={s.mobileSelectedCard}>
          <View style={s.mobileSelectedTop}>
            <Text style={s.mobileSectionTitle}>ACTIVE DELIVERY</Text>
            <Text style={s.mobileStatus}>{connection === 'online' ? 'ONLINE' : connection === 'offline' ? 'OFFLINE' : 'CONNECTING'}</Text>
          </View>
          {selected ? <>
            <Text style={s.mobileOrderName}>{show(selected.order_id)} · TABLE {show(selected.table_number)}</Text>
            <Text style={s.mobileSmallHint}>Status: {show(selected.status).replaceAll('_', ' ')} · {selectedIsRobotTask ? 'Assigned to NIA' : 'Not assigned to robot'}</Text>
          </> : <Text style={s.mobileSmallHint}>Create an order or select an active delivery below.</Text>}
          <View style={s.mobileDeliveryChoices}>
            {deliveries.filter(d => !['completed', 'cancelled', 'station_confirmed'].includes(String(d.status))).slice(0, 4).map(d => {
              const id = Number(d.delivery_id ?? d.id);
              return <Choice key={String(id)} label={`#${id} · T${show(d.table_number)}`} selected={String(id) === selectedId} onPress={() => { selectDelivery(id); setTable(String(d.table_number ?? table)); }} />;
            })}
          </View>
        </View>
        <View style={s.mobileStepsCard}>
          <Text style={s.mobileSectionTitle}>3-STEP DELIVERY WORKFLOW</Text>
          <Pressable style={[s.mobileStepButton, s.mobileKitchenButton, (busy || !canComeToKitchen) && s.disabled]} onPress={() => deliveryAction('pickup-arrived', 'Kitchen pickup arrival recorded.')} disabled={busy || !canComeToKitchen}>
            <Text style={[s.mobileStepNumber, { color: C.green }]}>1</Text><View style={s.mobileStepCopy}><Text style={[s.mobileStepText, { color: C.green }]}>ROBOT ARRIVED AT KITCHEN</Text><Text style={s.mobileStepHint}>Confirm robot reached the pickup point</Text></View>
          </Pressable>
          <Pressable style={[s.mobileStepButton, s.mobileDispatchButton, (busy || !(canConfirmFood || canDispatch)) && s.disabled]} onPress={loadFoodAndDispatch} disabled={busy || !(canConfirmFood || canDispatch)}>
            <Text style={s.mobileStepNumber}>2</Text><View style={s.mobileStepCopy}><Text style={s.mobileStepText}>FOOD LOADED · START DELIVERY</Text><Text style={s.mobileStepHint}>Confirm loading and dispatch to table</Text></View>
          </Pressable>
          <Pressable style={[s.mobileStepButton, s.mobileCompleteButton, (busy || !(canConfirmArrival || selectedStatus === 'arrived_at_table' || selectedStatus === 'handoff_confirmed')) && s.disabled]} onPress={confirmDeliveryAndReturn} disabled={busy || !(canConfirmArrival || selectedStatus === 'arrived_at_table' || selectedStatus === 'handoff_confirmed')}>
            <Text style={[s.mobileStepNumber, { color: C.green }]}>3</Text><View style={s.mobileStepCopy}><Text style={[s.mobileStepText, { color: C.green }]}>CONFIRM DELIVERY</Text><Text style={s.mobileStepHint}>Confirm handoff, complete and return/queue next task</Text></View>
          </Pressable>
          {busy && <Text style={s.mobileSmallHint}>Processing workflow…</Text>}
        </View>
      </View>}
      {section === 'workflow' && !isCompact && <View style={s.panelShell}>
        <View style={s.panelSidebar}>
          <Pressable style={[s.panelSideButton, s.panelStartButton]} onPress={createBatch} disabled={busy}>
            <Text style={[s.panelButtonText, s.panelActionText]}>CREATE ORDER</Text>
          </Pressable>
          <Pressable style={[s.panelSideButton, s.panelKitchenButton]} onPress={() => {
            if (!selected) { setNotice('Select an active delivery below before confirming its kitchen pickup.'); return; }
            deliveryAction('pickup-arrived', 'Kitchen pickup arrival recorded in the backend.');
          }} disabled={busy || !canComeToKitchen}>
            <Text style={[s.panelButtonText, s.panelKitchenText]}>ROBOT ARRIVED AT KITCHEN</Text>
          </Pressable>
          <Pressable style={[s.panelSideButton, s.panelStepButton]} onPress={loadFoodAndDispatch}
            disabled={busy || !(canConfirmFood || canDispatch)}>
            <Text style={s.panelButtonText}>2. FOOD LOADED · START DELIVERY</Text>
          </Pressable>
          <Pressable style={[s.panelSideButton, s.panelFinishButton]} onPress={confirmDeliveryAndReturn}
            disabled={busy || !(canConfirmArrival || selectedStatus === 'arrived_at_table' || selectedStatus === 'handoff_confirmed')}>
            <Text style={[s.panelButtonText, s.panelFinishText]}>3. CONFIRM DELIVERY</Text>
          </Pressable>
        </View>
        <View style={s.panelMain}>
          <View style={s.panelTopline}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.panelCaption}>DELIVERY PLANNER</Text>
              <Text style={s.panelSubtitle}>Choose single-task or multi-task delivery. Assignment is validated and saved by FastAPI.</Text>
            </View>
            <Text style={s.panelStatus}>{connection === 'online' ? 'SYSTEM ONLINE' : connection === 'offline' ? 'SYSTEM OFFLINE' : 'CONNECTING'}</Text>
          </View>
          <View style={s.panelModeRow}>
            <Text style={s.panelSectionLabel}>DELIVERY TYPE</Text>
            <View style={s.panelModeChoices}>
              <Choice label="Single Task" selected={deliveryMode === 'single'} onPress={() => setDeliveryMode('single')} />
              <Choice label="Multiple Tasks" selected={deliveryMode === 'multi'} onPress={() => setDeliveryMode('multi')} />
            </View>
          </View>
{deliveryMode === 'single' ? <>
            <View style={s.panelFields}>
              <Field label="Order ID" value={orderId} onChangeText={setOrderId} placeholder="e.g. ORD-1002" />
              <Field label="Food items (comma-separated)" value={items} onChangeText={setItems} placeholder="Pizza, Juice" />
            </View>
            <Text style={s.panelSectionLabel}>SELECT DESTINATION TABLE</Text>
            <View style={s.panelGrid}>
              {tables.map(n => <Pressable key={n}
                style={[s.panelTableButton, Number(table) === n && s.panelTableButtonSelected]}
                onPress={() => setTable(String(n))}>
                <Text style={[s.panelButtonText, Number(table) === n && s.panelSelectedText]}>T{n}</Text>
              </Pressable>)}
            </View>
            <Text style={s.panelSectionLabel}>TRAY SELECTION · SELECT ONE OR MORE</Text>
            <View style={s.choiceWrap}>
              {trays.map(t => <Choice key={t} label={t} selected={singleTrays.includes(t)}
                onPress={() => setSingleTrays(old => old.includes(t)
                  ? (old.length > 1 ? old.filter(x => x !== t) : old)
                  : [...old, t])} />)}
            </View>
            <Text style={s.panelHint}>Destination: Table {table} · Selected trays: {singleTrays.join(', ')}</Text>
            <View style={s.changeDestinationBox}>
              <Text style={s.panelSectionLabel}>CHANGE DESTINATION</Text>
              <Text style={s.panelHint}>{selected ? `Selected delivery: ${show(selected.order_id)} · Current table: T${show(selected.table_number)}` : 'Select an active delivery below to update its destination.'}</Text>
              <View style={s.panelGrid}>
                {tables.map(n => <Pressable key={`destination-single-${n}`}
                  style={[s.panelTableButton, Number(table) === n && s.panelTableButtonSelected]}
                  onPress={() => setTable(String(n))}>
                  <Text style={[s.panelButtonText, Number(table) === n && s.panelSelectedText]}>T{n}</Text>
                </Pressable>)}
              </View>
              <ActionButton title="Save destination" tone="secondary" disabled={busy || !selected} onPress={updateTable} />
            </View>
          </> : <>
            <Text style={s.panelSectionLabel}>3-TABLE MULTI-STOP TRIP</Text>
            <Text style={s.panelHint}>Load all three orders at the kitchen in one pickup. The intended route is Table 1 → Table 2 → Table 3, then return to docking.</Text>
            {batchOrders.length ? batchOrders.map((o, index) => <View key={o.table_number} style={s.batchItem}>
              <View style={s.batchHeading}>
                <Text style={s.stepTitle}>TABLE {o.table_number}</Text>
                <Pressable onPress={() => toggleBatchTable(o.table_number)} style={s.smallRemoveButton}>
                  <Text style={s.smallRemoveText}>Remove</Text>
                </Pressable>
              </View>
              <Field label="Order ID" value={o.order_id} onChangeText={v => updateBatchOrder(index, 'order_id', v)} placeholder="e.g. ORD-1002" />
              <Field label="Food items (comma-separated)" value={o.items} onChangeText={v => updateBatchOrder(index, 'items', v)} placeholder="Pizza, Juice" />
              <View style={s.batchTrayHeading}>
                <Text style={s.panelSectionLabel}>TRAYS FOR TABLE {o.table_number} · SELECT MULTIPLE</Text>
                <Pressable onPress={() => selectAllFreeTrays(index)} style={s.selectAllTraysButton}>
                  <Text style={s.selectAllTraysText}>SELECT ALL FREE TRAYS</Text>
                </Pressable>
              </View>
              <View style={s.choiceWrap}>{trays.map(t => <Choice key={t} label={t} selected={o.trays.includes(t)} onPress={() => toggleBatchTray(index, t)} />)}</View>
              <Text style={s.panelHint}>Assigned trays: {o.trays.join(', ') || 'None'} · Each tray can belong to only one table; every table needs at least one.</Text>
            </View>) : <Text style={s.panelHint}>Choose tables below. An order form will appear here for each selected table.</Text>}
            <Text style={s.panelSectionLabel}>SELECT EXACTLY 3 TABLES FOR THIS TRIP</Text>
            <View style={s.panelGrid}>
              {tables.map(n => {
                const isSelected = batchOrders.some(o => o.table_number === n);
                return <Pressable key={n} style={[s.panelTableButton, isSelected && s.panelTableButtonSelected]}
                  onPress={() => toggleBatchTable(n)}>
                  <Text style={[s.panelButtonText, isSelected && s.panelSelectedText]}>{isSelected ? '✓ ' : ''}T{n}</Text>
                </Pressable>;
              })}
            </View>
            <Text style={s.panelHint}>{batchOrders.length} of {MAX_TRIP_STOPS} tables selected. Each table needs its own order ID, food items and a separate tray. All three are loaded before the robot starts its multi-stop route.</Text>
            <View style={s.changeDestinationBox}>
              <Text style={s.panelSectionLabel}>CHANGE DESTINATION</Text>
              <Text style={s.panelHint}>{selected ? `Selected delivery: ${show(selected.order_id)} · Current table: T${show(selected.table_number)}` : 'Select an active delivery below to update its destination.'}</Text>
              <View style={s.panelGrid}>
                {tables.map(n => <Pressable key={`destination-multi-${n}`}
                  style={[s.panelTableButton, Number(table) === n && s.panelTableButtonSelected]}
                  onPress={() => setTable(String(n))}>
                  <Text style={[s.panelButtonText, Number(table) === n && s.panelSelectedText]}>T{n}</Text>
                </Pressable>)}
              </View>
              <ActionButton title="Save destination" tone="secondary" disabled={busy || !selected} onPress={updateTable} />
            </View>
          </>}
        </View>
      </View>}
      {section !== 'workflow' && <>
        <Text style={s.eyebrow}>{section === 'overview' ? 'ADMIN CONTROL CENTER' : section === 'tracking' ? 'ROBOT SIMULATION' : section === 'deliveries' ? 'DELIVERY MANAGEMENT' : section === 'controls' ? 'ROBOT CONTROLS' : 'API DEBUGGING'}</Text>
        <Text style={s.heading}>{section === 'overview' ? 'Admin overview' : section === 'tracking' ? 'Gazebo live tracking' : section === 'deliveries' ? 'Deliveries' : section === 'controls' ? 'Robot settings' : 'API events'}</Text>
        <Text style={s.description}>{section === 'overview' ? 'Monitor NIA operations and open the robot simulation view.' : section === 'tracking' ? 'A dedicated place for the robotics team to connect the Gazebo simulation and live robot telemetry.' : section === 'deliveries' ? 'Select an order to inspect or continue its workflow.' : section === 'controls' ? 'Manage robot battery, tray/table settings and system actions.' : 'Inspect the latest FastAPI response.'}</Text>
        {!!notice && <View style={[s.notice, /cannot|failed|error|invalid|not ready|select/i.test(notice) && s.noticeError]}><Text style={s.noticeText}>{notice}</Text></View>}
        {busy && <View style={s.loading}><ActivityIndicator color={C.primary} /><Text style={s.muted}>Updating…</Text></View>}
      </>}

      {section === 'deliveries' ? <>
        <Card title="All deliveries" subtitle="Select an order to continue it in User Workflow">
          {deliveries.length ? deliveries.map((d, i) => { const id = Number(d.delivery_id ?? d.id); const status = show(d.status, 'unknown').replaceAll('_', ' '); return <Pressable key={String(id ?? i)} onPress={() => { selectDelivery(id); setTable(String(d.table_number ?? '1')); setSection('workflow'); setScreen('user'); }} style={[s.deliveryRow, String(id) === selectedId && s.deliveryRowSelected]}><View style={s.deliveryId}><Text style={s.deliveryIdText}>#{id}</Text></View><View style={{ flex: 1 }}><Text style={s.deliveryName}>{show(d.order_id, 'Order')} · Table {show(d.table_number)}</Text><Text style={s.muted}>{Array.isArray(d.items) ? d.items.join(', ') : show(d.items, 'Food items')}</Text></View><Text style={[s.smallPill, { color: ['completed', 'station_confirmed'].includes(d.status) ? C.green : d.status === 'queued' ? C.amber : C.primary }]}>{status.toUpperCase()}</Text></Pressable>; }) : <Text style={s.muted}>No deliveries recorded yet.</Text>}
          <ActionButton title="Refresh deliveries" tone="secondary" onPress={() => refresh()} disabled={busy} />
        </Card>
      </> : section === 'controls' ? <>
        <Card title="Robot readiness controls" subtitle="Admin-only prototype controls; these update simulated backend state">
          <View style={s.twoCol}><View style={{ flex: 1 }}><Field label="Available trays" value={trayCount} onChangeText={setTrayCount} numeric /></View><View style={{ flex: 1 }}><Field label="Available tables (max 15)" value={tableCount} onChangeText={setTableCount} numeric /></View></View>
          <Text style={s.helper}>Tray/table counts are held in frontend state and reset on reload. The table count is capped at 15. They are not saved to SQLite yet.</Text>
          <Field label="Simulated battery (%)" value={batteryInput} onChangeText={setBatteryInput} numeric />
          <ActionButton title="Update simulated battery" onPress={updateBattery} disabled={busy} tone="secondary" />
          <ActionButton title="Refresh robot status" onPress={() => refresh()} disabled={busy} />
          <ActionButton title="Simulate system outage / safe stop" tone="danger" onPress={() => Alert.alert('Simulate system outage?', 'This changes the NIA simulation backend.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: () => runAction('/system/outage', 'POST', { notes: 'Triggered from Robot Controls' }) }])} disabled={busy} />
          <ActionButton title="Recover system" tone="secondary" onPress={() => runAction('/system/recover', 'POST')} disabled={busy} />
        </Card>
      </> : section === 'tracking' ? <>
        <Card title="Gazebo simulation view" subtitle="Integration placeholder for the robotics team">
          <View style={s.gazeboViewport}>
            <Text style={s.gazeboRobotLarge}>🤖</Text>
            <Text style={s.gazeboTitle}>Gazebo live view is not connected yet</Text>
            <Text style={s.muted}>This screen is ready for the robotics team to add the Gazebo camera stream or 3D viewer, robot position, planned path, navigation state and sensor telemetry.</Text>
          </View>
          <View style={s.infoGrid}>
            <View style={s.infoBox}><Text style={s.infoLabel}>Simulation</Text><Text style={s.infoValue}>Not connected</Text></View>
            <View style={s.infoBox}><Text style={s.infoLabel}>Robot</Text><Text style={s.infoValue}>NIA-01</Text></View>
            <View style={s.infoBox}><Text style={s.infoLabel}>ROS 2</Text><Text style={s.infoValue}>Integration pending</Text></View>
          </View>
          <ActionButton title="Refresh robot status" onPress={() => refresh()} disabled={busy} />
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
        <Card title="Gazebo live tracking" subtitle="Robot team integration area">
          <View style={s.gazeboPlaceholder}>
            <Text style={s.gazeboRobot}>🤖</Text>
            <Text style={s.gazeboTitle}>Gazebo connection pending</Text>
            <Text style={s.muted}>The robotics team can connect the Gazebo world, robot pose, navigation path, LiDAR and live status here.</Text>
            <ActionButton title="Open Gazebo tracking screen" tone="secondary" onPress={() => setSection('tracking')} />
          </View>
        </Card>
        <Card title="Admin settings" subtitle="Robot and restaurant configuration">
          <View style={s.twoCol}><View style={{ flex: 1 }}><Field label="Available trays" value={trayCount} onChangeText={setTrayCount} numeric /></View><View style={{ flex: 1 }}><Field label="Available tables (max 15)" value={tableCount} onChangeText={setTableCount} numeric /></View></View>
          <Text style={s.helper}>Tray/table counts are configured in this frontend screen. The table count is capped at 15. Persisting them for all devices requires a backend settings endpoint.</Text>
          <Field label="Simulated battery (%)" value={batteryInput} onChangeText={setBatteryInput} numeric /><ActionButton title="Update simulated battery" onPress={updateBattery} disabled={busy} tone="secondary" />
          <ActionButton title="Refresh robot readiness" onPress={() => refresh()} disabled={busy} />
        </Card>
        <Card title="Delivery overview" subtitle="Select a delivery to operate it from the User screen">
          {deliveries.length ? deliveries.slice(0, 8).map((d, i) => { const id = Number(d.delivery_id ?? d.id); const status = show(d.status, 'unknown').replaceAll('_', ' '); return <Pressable key={String(id ?? i)} onPress={() => { selectDelivery(id); setTable(String(d.table_number ?? '1')); setScreen('user'); }} style={[s.deliveryRow, String(id) === selectedId && s.deliveryRowSelected]}><View style={s.deliveryId}><Text style={s.deliveryIdText}>#{id}</Text></View><View style={{ flex: 1 }}><Text style={s.deliveryName}>{show(d.order_id, 'Order')} · Table {show(d.table_number)}</Text><Text style={s.muted}>{Array.isArray(d.items) ? d.items.join(', ') : show(d.items, 'Food items')}</Text></View><Text style={[s.smallPill, { color: d.status === 'completed' ? C.green : d.status === 'queued' ? C.amber : C.primary }]}>{status.toUpperCase()}</Text></Pressable>; }) : <Text style={s.muted}>No deliveries yet. Create one from the User screen.</Text>}
          <Text style={s.helper}>Tap a delivery to continue its workflow.</Text>
        </Card>
      </> : <>
        <Card title="Select delivery" subtitle="Choose the active task before confirming workflow steps">
          {deliveries.length ? <View style={s.choiceWrap}>{[...deliveries].filter(d => !['completed', 'cancelled'].includes(d.status)).sort((a, b) => {
            const activeId = Number(robot?.current_delivery_id);
            const aActive = Number(a.delivery_id ?? a.id) === activeId;
            const bActive = Number(b.delivery_id ?? b.id) === activeId;
            return Number(bActive) - Number(aActive) || Number(b.delivery_id ?? b.id) - Number(a.delivery_id ?? a.id);
          }).map(d => { const id = Number(d.delivery_id ?? d.id); const isRobotTask = Number(robot?.current_delivery_id) === id; return <Choice key={String(id)} label={`${isRobotTask ? '● ACTIVE · ' : ''}#${id} · ${show(d.order_id)} · Table ${show(d.table_number)} · ${show(d.status).replaceAll('_', ' ')}`} selected={String(id) === selectedId} onPress={() => { selectDelivery(id); setTable(String(d.table_number ?? table)); }} />; })}</View> : <Text style={s.muted}>No active delivery yet. Create one above.</Text>}
          {selected ? <View style={s.selectedBox}><Text style={s.selectedTitle}>Selected: {show(selected.order_id)} · Table {show(selected.table_number)}</Text><Text style={s.muted}>Current status: {show(selected.status).replaceAll('_', ' ')}</Text><Text style={s.muted}>Assigned tray: {Array.isArray(selected?.tray_numbers) && selected.tray_numbers.length ? selected.tray_numbers.map((n: number) => `Tray ${n}`).join(', ') : selected?.tray_number ? `Tray ${selected.tray_number}` : 'Not assigned'}</Text>{selected?.batch_id ? <Text style={s.muted}>Batch: {selected.batch_id} · deliveries continue sequentially</Text> : null}<Text style={s.helper}>{selectedStatus === 'queued' ? 'This delivery is waiting in the queue. Workflow actions unlock automatically after the robot is assigned to it.' : selectedIsRobotTask ? 'This is the delivery currently assigned to NIA.' : 'This delivery is not currently assigned to NIA. Select the active task to operate the robot.'}</Text></View> : <Text style={s.helper}>Create or select a delivery to use the action buttons below.</Text>}
        </Card>

      </>}
      {!(isCompact && section === 'workflow') && <>
        <Card title="Latest backend response" subtitle="Useful for debugging and verifying API calls"><Text selectable style={s.code}>{apiResponse}</Text></Card>
        <Text style={s.footer}>NIA Operations · React Native + FastAPI + SQLite · Single/multi batches · simulated execution only · ROS 2 / physical robot integration pending</Text>
      </>}
    </ScrollView>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  panelShell: { width: '100%', minHeight: 285, flexDirection: 'row', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#AEB4BB', borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  panelSidebar: { width: '21%', minWidth: 98, maxWidth: 180, paddingHorizontal: 10, paddingVertical: 14, justifyContent: 'space-around', alignItems: 'center', borderRightWidth: 1, borderRightColor: '#B8BEC5', gap: 9, backgroundColor: '#FFFFFF' },
  panelSideButton: { width: '94%', minHeight: 35, borderWidth: 1, borderColor: '#8F969E', borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 5, paddingVertical: 5 },
  panelStartButton: { backgroundColor: '#1677D2', borderColor: '#1268B8' },
  panelKitchenButton: { backgroundColor: '#EAF5EE', borderColor: '#8CC7A0' },
  panelKitchenText: { color: '#247A4B' },
  panelStepButton: { backgroundColor: '#EEF3F8', borderColor: '#AAB8C7' },
  panelFinishButton: { backgroundColor: '#EAF5EE', borderColor: '#8CC7A0' },
  panelFinishText: { color: '#247A4B' },
  panelSubtitle: { color: '#626B75', fontSize: 10, lineHeight: 14 },
  panelFields: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  panelActionText: { color: '#FFFFFF' },
  panelModeRow: { gap: 4 },
  panelModeChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  panelSectionLabel: { color: '#252A30', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  panelMain: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'flex-start', gap: 10 },
  panelTopline: { minHeight: 36, borderBottomWidth: 1, borderBottomColor: '#B8BEC5', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  panelCaption: { color: '#252A30', fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  panelStatus: { color: '#626B75', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  panelGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', alignItems: 'center', gap: 8, paddingVertical: 3 },
  panelTableButton: { width: '15%', minWidth: 38, maxWidth: 56, minHeight: 34, borderWidth: 1, borderColor: '#8F969E', borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', paddingVertical: 4 },
  panelTableButtonSelected: { backgroundColor: '#EEF1F4', borderColor: '#252A30', borderWidth: 1.5 },
  panelButtonText: { color: '#252A30', fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  panelSelectedText: { color: '#111418', fontWeight: '900' },
  panelHint: { color: '#626B75', fontSize: 9, textAlign: 'center' },
  gazeboPlaceholder: { borderWidth: 1, borderColor: '#D7DCE2', borderRadius: 10, padding: 16, alignItems: 'center', gap: 8, backgroundColor: '#FAFBFC' },
  gazeboViewport: { minHeight: 240, borderWidth: 1, borderColor: '#D7DCE2', borderRadius: 10, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F7F8FA' },
  gazeboRobot: { fontSize: 34 }, gazeboRobotLarge: { fontSize: 56 },
  gazeboTitle: { color: '#20252B', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  loginSafe: { flex: 1, backgroundColor: C.bg }, loginPage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 22, gap: 12 }, loginLogo: { width: 78, height: 78, borderRadius: 24, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }, loginLogoText: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', letterSpacing: 2 }, loginTitle: { color: C.text, fontSize: 29, fontWeight: '900', marginTop: 8 }, loginSubtitle: { color: C.muted, fontSize: 13, marginBottom: 8 }, loginCard: { width: '100%', maxWidth: 440, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 12, padding: 20, gap: 13, shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 15, shadowOffset: { width: 0, height: 5 } }, loginCardTitle: { color: C.text, fontSize: 19, fontWeight: '900' }, demoCredentials: { backgroundColor: C.blueBg, borderRadius: 11, padding: 12, gap: 4 }, demoTitle: { color: C.primary, fontSize: 11, fontWeight: '900' }, accountStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: C.surfaceAlt }, accountName: { color: C.text, fontSize: 11, fontWeight: '900' }, signOutButton: { backgroundColor: C.redBg, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 }, signOutText: { color: C.red, fontSize: 10, fontWeight: '900' },
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 18, paddingVertical: 15, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  brand: { color: C.text, fontSize: 25, fontWeight: '900', letterSpacing: 1 }, brandSub: { color: C.muted, fontSize: 10, letterSpacing: 1.4, marginTop: 2 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 11 }, connectionOnline: { backgroundColor: C.greenBg }, connectionOffline: { backgroundColor: C.redBg }, connectionWaiting: { backgroundColor: C.amberBg }, dot: { width: 8, height: 8, borderRadius: 4 }, connectionText: { color: C.text, fontSize: 10, fontWeight: '900' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border }, tab: { paddingVertical: 10, paddingHorizontal: 13, borderRadius: 10, backgroundColor: C.surfaceAlt }, tabActive: { backgroundColor: C.blueBg, borderWidth: 1, borderColor: '#B7CBFF' }, tabText: { color: C.muted, fontSize: 12, fontWeight: '800' }, tabTextActive: { color: C.primary }, refresh: { marginLeft: 'auto', padding: 9 }, refreshText: { color: C.primary, fontSize: 12, fontWeight: '800' },
  scroll: { flex: 1 }, page: { padding: 16, paddingBottom: 34, gap: 14, width: '100%', maxWidth: 1100, alignSelf: 'center' }, eyebrow: { color: C.teal, fontWeight: '900', fontSize: 10, letterSpacing: 1.5 }, heading: { color: C.text, fontSize: 29, fontWeight: '900', marginTop: -8 }, description: { color: C.muted, fontSize: 13, marginTop: -8, lineHeight: 19 },
  notice: { backgroundColor: C.greenBg, borderColor: '#A8E3C3', borderWidth: 1, borderRadius: 12, padding: 12 }, noticeError: { backgroundColor: C.redBg, borderColor: '#F0B9C2' }, noticeText: { color: C.text, fontSize: 12, lineHeight: 18 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, muted: { color: C.muted, fontSize: 11, lineHeight: 17 }, helper: { color: C.muted, fontSize: 10, lineHeight: 16 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, metric: { flexGrow: 1, flexBasis: 145, backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 14, padding: 14 }, metricLabel: { color: C.muted, fontSize: 11, fontWeight: '700' }, metricValue: { fontSize: 24, fontWeight: '900', marginTop: 9 }, metricNote: { color: C.muted, fontSize: 10, marginTop: 4 },
  card: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1, borderRadius: 7, padding: 11, gap: 6, shadowColor: '#000000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }, cardTitle: { color: C.text, fontSize: 16, fontWeight: '900' }, healthHero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: C.surfaceAlt, borderRadius: 13, borderWidth: 1, borderColor: C.border }, robotIcon: { width: 58, height: 58, borderRadius: 15, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' }, healthStatus: { color: C.text, fontSize: 17, fontWeight: '900', textTransform: 'capitalize', marginBottom: 4 }, statusPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 }, progressHead: { flexDirection: 'row', justifyContent: 'space-between' }, label: { color: C.muted, fontSize: 11, fontWeight: '800', marginBottom: 6 }, progressTrack: { height: 9, backgroundColor: '#E6ECF4', borderRadius: 10, overflow: 'hidden' }, progressFill: { height: '100%', borderRadius: 10 }, infoGrid: { flexDirection: 'row', gap: 9 }, infoBox: { flex: 1, padding: 11, backgroundColor: C.surfaceAlt, borderRadius: 10, borderWidth: 1, borderColor: C.border }, infoLabel: { color: C.muted, fontSize: 10 }, infoValue: { color: C.text, fontSize: 12, fontWeight: '800', marginTop: 5 },
  field: { flex: 1, marginBottom: 2 }, input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C7CDD4', borderRadius: 5, paddingHorizontal: 8, paddingVertical: 6, minHeight: 34, color: C.text, fontSize: 11 }, twoCol: { flexDirection: 'row', gap: 10 }, button: { minHeight: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 7, borderWidth: 1, borderColor: '#A0A0A0' }, button_primary: { backgroundColor: '#263746', borderColor: '#263746' }, button_secondary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C7CDD4' }, button_success: { backgroundColor: '#1677D2', borderColor: '#1268B8' }, button_danger: { backgroundColor: '#C43D4B', borderColor: '#A92E3B' }, button_purple: { backgroundColor: '#5B55C7', borderColor: '#4943AD' }, buttonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'center', letterSpacing: 0.2 }, disabled: { opacity: 0.42 }, pressed: { opacity: 0.75 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, choice: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C7CDD4' }, choiceSelected: { backgroundColor: '#1677D2', borderColor: '#1268B8' }, choiceText: { color: C.muted, fontSize: 10, fontWeight: '800' }, choiceTextSelected: { color: '#FFFFFF' },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 11, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceAlt }, deliveryRowSelected: { borderColor: C.primary, backgroundColor: C.blueBg }, deliveryId: { width: 39, height: 39, borderRadius: 10, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' }, deliveryIdText: { color: C.primary, fontWeight: '900', fontSize: 11 }, deliveryName: { color: C.text, fontSize: 12, fontWeight: '900', marginBottom: 3 }, smallPill: { fontSize: 9, fontWeight: '900', maxWidth: 90 }, selectedBox: { backgroundColor: C.blueBg, borderRadius: 10, padding: 12, gap: 5 }, selectedTitle: { color: C.primary, fontWeight: '900', fontSize: 12 },
  batchItem: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, gap: 9, backgroundColor: '#FFFFFF' },
  batchHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  batchTrayHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  selectAllTraysButton: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5, backgroundColor: C.blueBg, borderWidth: 1, borderColor: '#AAB8C7' },
  selectAllTraysText: { color: C.primary, fontSize: 9, fontWeight: '900' },
  smallRemoveButton: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: C.redBg },
  smallRemoveText: { color: C.red, fontSize: 10, fontWeight: '800' },
  changeDestinationBox: { borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, gap: 8 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 14, marginBottom: 2, borderBottomWidth: 1, borderBottomColor: '#EDF1F6' }, stepNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.blueBg, alignItems: 'center', justifyContent: 'center' }, stepNumberText: { color: C.primary, fontWeight: '900', fontSize: 13 }, stepTitle: { color: C.text, fontSize: 13, fontWeight: '900' }, code: { color: '#34445D', fontSize: 10, lineHeight: 16, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }, footer: { color: C.muted, textAlign: 'center', fontSize: 10, marginTop: 4 },
  // Compact staff screen: the order summary and all three workflow actions fit on one phone screen.
  headerCompact: { paddingHorizontal: 9, paddingVertical: 4, minHeight: 40, gap: 4 },
  brandCompact: { fontSize: 16, letterSpacing: 0.2 },
  brandSubCompact: { fontSize: 5, letterSpacing: 0.2, marginTop: 0 },
  connectionCompact: { gap: 3, borderRadius: 10, paddingVertical: 4, paddingHorizontal: 6 },
  connectionTextCompact: { fontSize: 7 },
  dotCompact: { width: 6, height: 6, borderRadius: 3 },
  tabCompact: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 },
  tabTextCompact: { fontSize: 8 },
  accountStripCompact: { gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  accountNameCompact: { fontSize: 8 },
  signOutButtonCompact: { paddingHorizontal: 5, paddingVertical: 3, borderRadius: 4 },
  signOutTextCompact: { fontSize: 7 },
  refreshCompact: { padding: 1 },
  refreshTextCompact: { fontSize: 9 },

  tabsCompact: { paddingHorizontal: 6, paddingVertical: 3, gap: 4, minHeight: 29 },
  mobilePage: { paddingHorizontal: 7, paddingTop: 5, paddingBottom: 6, gap: 4 },
  compactHeading: { color: C.text, fontSize: 13, fontWeight: '900', marginBottom: 0 },
  compactNotice: { backgroundColor: C.greenBg, borderColor: '#A8E3C3', borderWidth: 1, borderRadius: 6, padding: 4 },
  mobileWorkflow: { gap: 4 },
  mobileOrderCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.border, borderRadius: 7, padding: 7, gap: 4 },
  mobileSectionTitle: { color: C.text, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  mobileInputRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mobileLabel: { color: C.muted, fontSize: 9, fontWeight: '900', marginBottom: 1 },
  mobileInput: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#C7CDD4', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3, minHeight: 28, color: C.text, fontSize: 10 },
  mobileSmallHint: { color: C.muted, fontSize: 9, lineHeight: 12, flex: 1 },
  mobileLink: { color: C.primary, fontSize: 9, fontWeight: '800' },
  mobileCreateButton: { minHeight: 29, borderRadius: 5, backgroundColor: '#263746', alignItems: 'center', justifyContent: 'center', paddingVertical: 1 },
  mobileCreateText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  mobileSelectedCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.border, borderRadius: 7, padding: 7, gap: 4 },
  mobileSelectedTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mobileStatus: { color: C.green, fontSize: 9, fontWeight: '900' },
  mobileOrderName: { color: C.primary, fontSize: 11, fontWeight: '900' },
  mobileDeliveryChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  mobileStepsCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.border, borderRadius: 7, padding: 7, gap: 4 },
  mobileStepButton: { minHeight: 31, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  mobileKitchenButton: { backgroundColor: '#EAF5EE', borderColor: '#8CC7A0' },
  mobileDispatchButton: { backgroundColor: '#F0F2F4', borderColor: '#AEB8C2' },
  mobileCompleteButton: { backgroundColor: '#EAF5EE', borderColor: '#8CC7A0' },
  mobileStepNumber: { width: 17, height: 17, borderRadius: 9, backgroundColor: '#FFFFFF', color: C.primary, textAlign: 'center', textAlignVertical: 'center', fontSize: 9, fontWeight: '900', overflow: 'hidden', paddingTop: 1 },
  mobileStepCopy: { flex: 1, gap: 1 },
  mobileStepText: { color: C.text, fontSize: 9, fontWeight: '900', letterSpacing: 0 },
  mobileStepHint: { color: C.muted, fontSize: 7, lineHeight: 9 },
});

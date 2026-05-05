import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Modal,
  Alert, KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/config/firebase';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

// ─── Types ────────────────────────────────────────────────────────────────────
interface UserRecord {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'manager' | 'mis' | 'sales';
  phone: string;
  region: string;
  managerId: string | null;
  isActive: boolean;
  passwordPlain: string;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ROLES: Array<{ value: UserRecord['role']; label: string; color: string; icon: string }> = [
  { value: 'admin',   label: 'Admin',   color: '#DC2626', icon: 'shield-checkmark' },
  { value: 'manager', label: 'Manager', color: '#7C3AED', icon: 'people'           },
  { value: 'mis',     label: 'MIS',     color: '#0891B2', icon: 'analytics'        },
  { value: 'sales',   label: 'Sales',   color: Colors.primary, icon: 'person'      },
];

function roleInfo(role: string) {
  return ROLES.find(r => r.value === role) ?? { label: role, color: Colors.gray400, icon: 'person-outline' };
}

// ─── Add/Edit User Modal ──────────────────────────────────────────────────────
interface UserFormProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  editUser?: UserRecord | null;
  managers: UserRecord[];
}

function UserFormModal({ visible, onClose, onSaved, editUser, managers }: UserFormProps) {
  const functions = getFunctions();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [role, setRole]               = useState<UserRecord['role']>('sales');
  const [phone, setPhone]             = useState('');
  const [region, setRegion]           = useState('');
  const [managerId, setManagerId]     = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [showPass, setShowPass]       = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (editUser) {
      setDisplayName(editUser.displayName);
      setEmail(editUser.email);
      setPassword(editUser.passwordPlain || '');
      setRole(editUser.role);
      setPhone(editUser.phone);
      setRegion(editUser.region);
      setManagerId(editUser.managerId);
    } else {
      setDisplayName(''); setEmail(''); setPassword('');
      setRole('sales'); setPhone(''); setRegion(''); setManagerId(null);
    }
  }, [editUser, visible]);

  const handleSave = async () => {
    if (!displayName.trim() || !email.trim()) {
      Alert.alert('Validation', 'Name and email are required.'); return;
    }
    if (!editUser && password.length < 6) {
      Alert.alert('Validation', 'Password must be at least 6 characters.'); return;
    }
    setSaving(true);
    try {
      if (editUser) {
        // Update role and optionally password
        const updateRole = httpsCallable(functions, 'updateUserRole');
        await updateRole({ uid: editUser.uid, role, managerId });

        if (password && password !== editUser.passwordPlain) {
          const updatePwd = httpsCallable(functions, 'updateUserPassword');
          await updatePwd({ uid: editUser.uid, newPassword: password });
        }
        // Update name/phone/region directly in Firestore
        await updateDoc(doc(db, 'users', editUser.uid), {
          displayName, phone, region,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const createFn = httpsCallable(functions, 'createUser');
        await createFn({ email, password, displayName, role, phone, region, managerId });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={mStyles.header}>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={Colors.navy} /></TouchableOpacity>
          <Text style={mStyles.title}>{editUser ? 'Edit User' : 'Add New User'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={mStyles.saveBtn}>Save</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={mStyles.body} keyboardShouldPersistTaps="handled">
          {/* Role selector */}
          <Text style={mStyles.label}>Role *</Text>
          <View style={mStyles.roleRow}>
            {ROLES.map(r => (
              <TouchableOpacity
                key={r.value}
                style={[mStyles.roleChip, role === r.value && { backgroundColor: r.color, borderColor: r.color }]}
                onPress={() => setRole(r.value)}
              >
                <Ionicons name={r.icon as any} size={14} color={role === r.value ? '#fff' : r.color} />
                <Text style={[mStyles.roleChipText, role === r.value && { color: '#fff' }]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Display Name */}
          <Text style={mStyles.label}>Full Name *</Text>
          <TextInput
            style={mStyles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="e.g. Ahmed Al Mansoor"
            placeholderTextColor={Colors.gray400}
          />

          {/* Email — read-only when editing */}
          <Text style={mStyles.label}>Email *</Text>
          <TextInput
            style={[mStyles.input, editUser && mStyles.inputDisabled]}
            value={email}
            onChangeText={setEmail}
            placeholder="user@relazo.com"
            placeholderTextColor={Colors.gray400}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!editUser}
          />

          {/* Password */}
          <Text style={mStyles.label}>{editUser ? 'New Password (leave blank to keep)' : 'Password *'}</Text>
          <View style={mStyles.passRow}>
            <TextInput
              style={[mStyles.input, { flex: 1 }]}
              value={password}
              onChangeText={setPassword}
              placeholder={editUser ? 'Enter new password to change' : 'Min 6 characters'}
              placeholderTextColor={Colors.gray400}
              secureTextEntry={!showPass}
              autoCapitalize="none"
            />
            <TouchableOpacity style={mStyles.eyeBtn} onPress={() => setShowPass(v => !v)}>
              <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={Colors.gray500} />
            </TouchableOpacity>
          </View>

          {/* Phone */}
          <Text style={mStyles.label}>Phone</Text>
          <TextInput
            style={mStyles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+971 50 000 0000"
            placeholderTextColor={Colors.gray400}
            keyboardType="phone-pad"
          />

          {/* Region */}
          <Text style={mStyles.label}>Region / Area</Text>
          <TextInput
            style={mStyles.input}
            value={region}
            onChangeText={setRegion}
            placeholder="e.g. Dubai Marina"
            placeholderTextColor={Colors.gray400}
          />

          {/* Manager assignment (only for sales role) */}
          {role === 'sales' && (
            <>
              <Text style={mStyles.label}>Assign Manager</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                <TouchableOpacity
                  style={[mStyles.managerChip, !managerId && mStyles.managerChipActive]}
                  onPress={() => setManagerId(null)}
                >
                  <Text style={[mStyles.managerChipText, !managerId && { color: Colors.white }]}>None</Text>
                </TouchableOpacity>
                {managers.map(m => (
                  <TouchableOpacity
                    key={m.uid}
                    style={[mStyles.managerChip, managerId === m.uid && mStyles.managerChipActive]}
                    onPress={() => setManagerId(m.uid)}
                  >
                    <Text style={[mStyles.managerChipText, managerId === m.uid && { color: Colors.white }]}>
                      {m.displayName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Password Reveal Modal ────────────────────────────────────────────────────
function PasswordModal({ user, onClose }: { user: UserRecord | null; onClose: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(!!user); }, [user]);

  if (!user) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={pwStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={pwStyles.card}>
          <View style={pwStyles.iconWrap}>
            <Ionicons name="key" size={28} color={Colors.primary} />
          </View>
          <Text style={pwStyles.name}>{user.displayName}</Text>
          <Text style={pwStyles.emailText}>{user.email}</Text>
          <View style={pwStyles.divider} />
          <Text style={pwStyles.credLabel}>Username (Email)</Text>
          <Text style={pwStyles.credValue}>{user.email}</Text>
          <Text style={[pwStyles.credLabel, { marginTop: Spacing.md }]}>Password</Text>
          <Text style={pwStyles.credValue}>
            {user.passwordPlain || '—  (set via email reset)'}
          </Text>
          <TouchableOpacity style={pwStyles.closeBtn} onPress={onClose}>
            <Text style={pwStyles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────
function UserRow({
  user, managers, onEdit, onToggleActive, onShowPass,
}: {
  user: UserRecord;
  managers: UserRecord[];
  onEdit: () => void;
  onToggleActive: () => void;
  onShowPass: () => void;
}) {
  const role = roleInfo(user.role);
  const managerName = managers.find(m => m.uid === user.managerId)?.displayName;

  return (
    <View style={rowStyles.card}>
      {/* Left: avatar + info */}
      <View style={[rowStyles.avatar, { backgroundColor: role.color + '20' }]}>
        <Text style={[rowStyles.avatarText, { color: role.color }]}>
          {user.displayName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={rowStyles.name} numberOfLines={1}>{user.displayName}</Text>
          <View style={[rowStyles.roleBadge, { backgroundColor: role.color + '15' }]}>
            <Ionicons name={role.icon as any} size={11} color={role.color} />
            <Text style={[rowStyles.roleText, { color: role.color }]}>{role.label}</Text>
          </View>
        </View>
        <Text style={rowStyles.email} numberOfLines={1}>{user.email}</Text>
        {user.phone ? <Text style={rowStyles.meta}>{user.phone}</Text> : null}
        {managerName ? <Text style={rowStyles.meta}>👤 {managerName}</Text> : null}
        {user.region ? <Text style={rowStyles.meta}>📍 {user.region}</Text> : null}
      </View>

      {/* Right: actions */}
      <View style={rowStyles.actions}>
        <Switch
          value={user.isActive}
          onValueChange={onToggleActive}
          trackColor={{ false: Colors.gray200, true: Colors.primary + '60' }}
          thumbColor={user.isActive ? Colors.primary : Colors.gray400}
          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
        />
        <TouchableOpacity style={rowStyles.iconBtn} onPress={onShowPass}>
          <Ionicons name="key-outline" size={18} color={Colors.gray500} />
        </TouchableOpacity>
        <TouchableOpacity style={rowStyles.iconBtn} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={18} color={Colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ManageUsersScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const { user } = useAuthStore();

  const [users,      setUsers]      = useState<UserRecord[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search,     setSearch]     = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editUser,    setEditUser]  = useState<UserRecord | null>(null);
  const [passUser,    setPassUser]  = useState<UserRecord | null>(null);

  // Guard — admin only
  if (user?.role !== 'admin') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="lock-closed" size={48} color={Colors.gray300} />
        <Text style={{ color: Colors.gray500, marginTop: 12 }}>Admin access only</Text>
      </View>
    );
  }

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setUsers(snap.docs.map(d => d.data() as UserRecord));
      setLoading(false);
      setRefreshing(false);
    }, err => { console.error(err); setLoading(false); });
    return unsub;
  }, []);

  const managers = users.filter(u => u.role === 'manager');

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      u.displayName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone?.includes(q);
    return matchRole && matchSearch;
  });

  const toggleActive = useCallback(async (u: UserRecord) => {
    try {
      const fns = getFunctions();
      if (!u.isActive) {
        // Re-activate by directly updating Firestore
        await updateDoc(doc(db, 'users', u.uid), { isActive: true });
      } else {
        const deactivate = httpsCallable(fns, 'deactivateUser');
        await deactivate({ uid: u.uid });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  }, []);

  // Role counts
  const counts = { admin: 0, manager: 0, mis: 0, sales: 0 };
  users.forEach(u => { if (u.role in counts) counts[u.role as keyof typeof counts]++; });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* ── Fixed top — never shrinks ── */}
      <View style={styles.stickyTop}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Manage Users</Text>
            <Text style={styles.headerSub}>{filtered.length} of {users.length} accounts</Text>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={() => { setEditUser(null); setFormVisible(true); }}>
            <Ionicons name="person-add" size={18} color={Colors.white} />
            <Text style={styles.addBtnText}>Add User</Text>
          </TouchableOpacity>
        </View>

        {/* Stats bar */}
        <View style={styles.statsBar}>
          {ROLES.map(r => (
            <TouchableOpacity
              key={r.value}
              style={styles.statItem}
              onPress={() => setRoleFilter(v => v === r.value ? 'all' : r.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.statCount, { color: r.color }]}>{counts[r.value]}</Text>
              <Text style={styles.statLabel}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, email, phone…"
            placeholderTextColor={Colors.gray400}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.gray400} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Role filter chips — flexShrink:0 so it never compresses */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {[{ value: 'all', label: 'All', color: Colors.navy, icon: 'people' }, ...ROLES].map(r => (
            <TouchableOpacity
              key={r.value}
              style={[styles.filterChip, roleFilter === r.value && { backgroundColor: r.color, borderColor: r.color }]}
              onPress={() => setRoleFilter(r.value)}
            >
              <Ionicons
                name={(r as any).icon as any}
                size={13}
                color={roleFilter === r.value ? Colors.white : Colors.gray500}
              />
              <Text style={[styles.filterChipText, roleFilter === r.value && { color: Colors.white }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Scrollable user list — takes all remaining space ── */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={u => u.uid}
            contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 80 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshing(true)} colors={[Colors.primary]} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color={Colors.gray300} />
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            }
            renderItem={({ item: u }) => (
              <UserRow
                key={u.uid}
                user={u}
                managers={managers}
                onEdit={() => { setEditUser(u); setFormVisible(true); }}
                onToggleActive={() => toggleActive(u)}
                onShowPass={() => setPassUser(u)}
              />
            )}
          />
        )}
      </View>

      {/* Add / Edit modal */}
      <UserFormModal
        visible={formVisible}
        onClose={() => setFormVisible(false)}
        onSaved={() => Toast.show({ type: 'success', text1: editUser ? 'User Updated' : 'User Created', text2: 'Changes saved successfully' })}
        editUser={editUser}
        managers={managers}
      />

      {/* Password reveal modal */}
      <PasswordModal user={passUser} onClose={() => setPassUser(null)} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen:       { flex: 1, backgroundColor: Colors.gray50 },
  // Fixed top block — sizes to its content, never compresses
  stickyTop:    { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  header:       { backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn:      { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle:  { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.white },
  headerSub:    { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  addBtn:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full },
  addBtnText:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },

  statsBar:     { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  statItem:     { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm },
  statCount:    { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  statLabel:    { fontSize: 10, color: Colors.gray500, marginTop: 2 },

  searchWrap:   { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, marginHorizontal: Spacing.base, marginVertical: Spacing.sm, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, gap: 8, borderWidth: 1, borderColor: Colors.gray200 },
  searchInput:  { flex: 1, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.navy },

  // flexShrink:0 ensures filter row never shrinks when list grows
  filterScroll: { flexShrink: 0, paddingBottom: Spacing.xs },
  filterRow:    { paddingHorizontal: Spacing.base, paddingVertical: 2, gap: 8, alignItems: 'center' },
  filterChip:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200 },
  filterChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500 },

  emptyState:   { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText:    { fontSize: FontSize.base, color: Colors.gray400 },
});

const rowStyles = StyleSheet.create({
  card:       { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: Radius.xl, marginBottom: Spacing.sm, padding: Spacing.md, gap: Spacing.sm, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  avatar:     { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  name:       { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy, flexShrink: 1 },
  roleBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full },
  roleText:   { fontSize: 10, fontWeight: FontWeight.semibold },
  email:      { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 2 },
  meta:       { fontSize: 11, color: Colors.gray400 },
  actions:    { alignItems: 'center', gap: 4 },
  iconBtn:    { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.gray100, alignItems: 'center', justifyContent: 'center' },
});

const mStyles = StyleSheet.create({
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray100, backgroundColor: Colors.white },
  title:        { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  saveBtn:      { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.primary },
  body:         { padding: Spacing.base, paddingBottom: 80 },
  label:        { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: Spacing.md },
  input:        { backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, height: 48, fontSize: FontSize.sm, color: Colors.navy },
  inputDisabled:{ backgroundColor: Colors.gray100, color: Colors.gray400 },
  passRow:      { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn:       { width: 48, height: 48, borderRadius: Radius.lg, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200, alignItems: 'center', justifyContent: 'center' },
  roleRow:      { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  roleChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray200, backgroundColor: Colors.white },
  roleChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray600 },
  managerChip:  { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray200, marginRight: 8, backgroundColor: Colors.white },
  managerChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  managerChipText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray600 },
});

const pwStyles = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  card:         { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.xl, width: '100%', maxWidth: 360, alignItems: 'center' },
  iconWrap:     { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  name:         { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  emailText:    { fontSize: FontSize.sm, color: Colors.gray500, marginTop: 4 },
  divider:      { height: 1, backgroundColor: Colors.gray100, width: '100%', marginVertical: Spacing.lg },
  credLabel:    { alignSelf: 'flex-start', fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  credValue:    { alignSelf: 'flex-start', fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  closeBtn:     { marginTop: Spacing.xl, backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm, borderRadius: Radius.full },
  closeBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.white },
});

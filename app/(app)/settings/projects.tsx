import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from '@/store/authStore';
import { Header } from '@/components/ui/Header';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { Project, User, PropertyType } from '@/types';
import {
  fetchCampaignsFromLeads, fetchCampaignsFromMeta, MetaCampaign,
} from '@/services/metaLeadsService';

const PROPERTY_TYPES: PropertyType[] = ['apartment','villa','townhouse','office','plot','penthouse','commercial'];

const ACC_COLORS: Record<number, string> = { 1: '#1877F2', 2: '#0B5ED7', 3: '#0353A4' };

const emptyForm = () => ({
  name:            '',
  location:        '',
  type:            'apartment' as PropertyType,
  metaPageId:      '',
  metaAccount:     1 as 1 | 2 | 3,
  campaignIds:     [] as string[],
  campaignNames:   [] as string[],
  salesPersonIds:  [] as string[],
  salesPersonNames:[] as string[],
  managerId:       '',
  managerName:     '',
  isActive:        true,
});

// ─── Lead count per salesperson for THIS project only ────────────────────────
function useProjectLeadCounts(project: Project): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!project.salesPersonIds?.length) return;

    const fetchCounts = async () => {
      const c: Record<string, number> = {};
      const seen = new Set<string>();

      // Primary: leads that have projectId written (leads assigned after fix)
      const byProject = await getDocs(
        query(collection(db, 'leads'), where('projectId', '==', project.id))
      );
      byProject.docs.forEach(d => {
        seen.add(d.id);
        const uid = d.data().assignedTo as string;
        if (uid && project.salesPersonIds.includes(uid)) c[uid] = (c[uid] ?? 0) + 1;
      });

      // Fallback: match by metaCampaignId for older leads without projectId
      const campaignIds = (project.campaignIds ?? []).slice(0, 10); // Firestore 'in' limit
      if (campaignIds.length > 0) {
        const byCampaign = await getDocs(
          query(collection(db, 'leads'), where('metaCampaignId', 'in', campaignIds))
        );
        byCampaign.docs.forEach(d => {
          if (seen.has(d.id)) return;
          const uid = d.data().assignedTo as string;
          if (uid && project.salesPersonIds.includes(uid)) c[uid] = (c[uid] ?? 0) + 1;
        });
      }

      setCounts(c);
    };

    fetchCounts().catch(() => {});
  }, [project.id]);
  return counts;
}

export default function ProjectsScreen() {
  const { user } = useAuthStore();
  const insets   = useSafeAreaInsets();

  const [projects,   setProjects]   = useState<Project[]>([]);
  const [salesUsers, setSalesUsers] = useState<User[]>([]);
  const [managers,   setManagers]   = useState<User[]>([]);
  const [campaigns,  setCampaigns]  = useState<MetaCampaign[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<Project | null>(null);
  const [form,       setForm]       = useState(emptyForm());
  const [saving,     setSaving]     = useState(false);
  const [fetchingCamps, setFetchingCamps] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (user?.role !== 'admin') {
    return (
      <View style={styles.screen}>
        <Header title="Projects" showBack />
        <View style={styles.center}>
          <Text style={styles.noAccess}>Admin access required</Text>
        </View>
      </View>
    );
  }

  // ── Real-time projects ───────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'projects'), orderBy('createdAt', 'desc')),
      snap => {
        setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() } as Project)));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // ── Load users + campaigns ───────────────────────────────────────────────────
  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('isActive', '==', true))).then(snap => {
      const all = snap.docs.map(d => d.data() as User);
      setSalesUsers(all.filter(u => u.role === 'sales'));
      setManagers(all.filter(u => u.role === 'manager'));
    });
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const fromLeads = await fetchCampaignsFromLeads();
      setCampaigns(fromLeads);
    } catch {}
  };

  const refreshCampaignsFromMeta = async () => {
    setFetchingCamps(true);
    try {
      const live = await fetchCampaignsFromMeta();
      if (live.length > 0) {
        setCampaigns(prev => {
          const merged = new Map(prev.map(c => [c.id, c]));
          live.forEach(c => merged.set(c.id, c));
          return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
        });
      } else {
        Alert.alert('No campaigns found', 'No campaigns found via Meta API. Showing campaigns from synced leads only.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not fetch campaigns from Meta');
    } finally {
      setFetchingCamps(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (project: Project) => {
    setEditing(project);
    setForm({
      name:            project.name,
      location:        project.location ?? '',
      type:            project.type,
      metaPageId:      project.metaPageId ?? '',
      metaAccount:     project.metaAccount ?? 1,
      campaignIds:     project.campaignIds ?? [],
      campaignNames:   project.campaignNames ?? [],
      salesPersonIds:  project.salesPersonIds ?? [],
      salesPersonNames:project.salesPersonNames ?? [],
      managerId:       project.managerId ?? '',
      managerName:     project.managerName ?? '',
      isActive:        project.isActive,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim())            { Alert.alert('Error', 'Project name is required'); return; }
    if (!form.salesPersonIds.length)  { Alert.alert('Error', 'Add at least one sales person'); return; }

    setSaving(true);
    try {
      const payload = {
        name:             form.name.trim(),
        location:         form.location.trim(),
        type:             form.type,
        metaPageId:       form.metaPageId || null,
        metaAccount:      form.metaAccount,
        campaignIds:      form.campaignIds,
        campaignNames:    form.campaignNames,
        salesPersonIds:   form.salesPersonIds,
        salesPersonNames: form.salesPersonNames,
        managerId:        form.managerId || null,
        managerName:      form.managerName || null,
        isActive:         form.isActive,
      };
      if (editing) {
        await updateDoc(doc(db, 'projects', editing.id), { ...payload, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(db, 'projects'), { ...payload, roundRobinIndex: 0, createdAt: new Date().toISOString() });
      }
      setShowForm(false);
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (project: Project) => {
    Alert.alert('Delete Project', `Delete "${project.name}"? Existing leads are not affected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteDoc(doc(db, 'projects', project.id));
      }},
    ]);
  };

  const toggleSalesPerson = (sp: User) => {
    setForm(f => {
      const included = f.salesPersonIds.includes(sp.uid);
      return {
        ...f,
        salesPersonIds:   included ? f.salesPersonIds.filter(id => id !== sp.uid) : [...f.salesPersonIds, sp.uid],
        salesPersonNames: included ? f.salesPersonNames.filter((_, i) => f.salesPersonIds[i] !== sp.uid) : [...f.salesPersonNames, sp.displayName],
      };
    });
  };

  const toggleCampaign = (c: MetaCampaign) => {
    setForm(f => {
      const included = f.campaignIds.includes(c.id);
      return {
        ...f,
        campaignIds:   included ? f.campaignIds.filter(id => id !== c.id)       : [...f.campaignIds, c.id],
        campaignNames: included ? f.campaignNames.filter((_, i) => f.campaignIds[i] !== c.id) : [...f.campaignNames, c.name],
        // Auto-set metaAccount from first selected campaign
        metaAccount: !included && f.campaignIds.length === 0 ? c.account : f.metaAccount,
      };
    });
  };

  const selectManager = (u: User) => {
    setForm(f => ({
      ...f,
      managerId:   f.managerId === u.uid ? '' : u.uid,
      managerName: f.managerId === u.uid ? '' : u.displayName,
    }));
  };

  return (
    <View style={styles.screen}>
      <Header title="Projects" showBack />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Text style={styles.countText}>{projects.length} project{projects.length !== 1 ? 's' : ''}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={openCreate} activeOpacity={0.8}>
            <Ionicons name="add" size={18} color={Colors.white} />
            <Text style={styles.addBtnText}>New Project</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : projects.length === 0 ? (
          <EmptyState onAdd={openCreate} />
        ) : (
          projects.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              salesUsers={salesUsers}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onEdit={() => openEdit(p)}
              onDelete={() => handleDelete(p)}
            />
          ))
        )}
      </ScrollView>

      {/* ── Create / Edit Modal ── */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={modal.container}>
            <View style={modal.header}>
              <Text style={modal.title}>{editing ? 'Edit Project' : 'New Project'}</Text>
              <TouchableOpacity onPress={() => setShowForm(false)} style={modal.closeBtn}>
                <Ionicons name="close" size={22} color={Colors.gray600} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: Spacing.base, paddingBottom: 60 }}>

              {/* Project Name */}
              <Label text="Project Name *" />
              <TextInput
                style={modal.input}
                placeholder="e.g. Prestige Heights"
                value={form.name}
                onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholderTextColor={Colors.gray400}
              />

              {/* Location */}
              <Label text="Location" />
              <TextInput
                style={modal.input}
                placeholder="e.g. Bannerghatta Road, Bangalore"
                value={form.location}
                onChangeText={v => setForm(f => ({ ...f, location: v }))}
                placeholderTextColor={Colors.gray400}
              />

              {/* Property Type */}
              <Label text="Property Type" />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {PROPERTY_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[modal.chip, form.type === t && modal.chipActive]}
                      onPress={() => setForm(f => ({ ...f, type: t }))}
                    >
                      <Text style={[modal.chipText, form.type === t && modal.chipTextActive]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* ── Meta Campaigns ── */}
              <View style={modal.sectionHeaderRow}>
                <Label text={`Meta Campaigns (${form.campaignIds.length} selected)`} />
                <TouchableOpacity
                  style={modal.refreshBtn}
                  onPress={refreshCampaignsFromMeta}
                  disabled={fetchingCamps}
                  activeOpacity={0.8}
                >
                  {fetchingCamps
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Ionicons name="refresh-outline" size={14} color={Colors.primary} />}
                  <Text style={modal.refreshText}>{fetchingCamps ? 'Fetching…' : 'Refresh from Meta'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={modal.helperText}>
                Leads from selected campaigns are automatically routed to this project's sales team.{'\n'}
                Showing campaigns from synced leads. Tap "Refresh from Meta" to load all live campaigns.
              </Text>

              {campaigns.length === 0 ? (
                <View style={modal.emptyBox}>
                  <Ionicons name="megaphone-outline" size={28} color={Colors.gray300} />
                  <Text style={modal.emptyBoxText}>No campaigns found yet.{'\n'}Sync Meta leads first or tap "Refresh from Meta".</Text>
                </View>
              ) : (
                <View style={{ gap: 6, marginBottom: Spacing.md }}>
                  {/* Group by account */}
                  {([1, 2, 3] as const).map(acc => {
                    const accCamps = campaigns.filter(c => c.account === acc);
                    if (!accCamps.length) return null;
                    return (
                      <View key={acc}>
                        <View style={modal.accHeader}>
                          <Ionicons name="logo-facebook" size={12} color={ACC_COLORS[acc]} />
                          <Text style={[modal.accHeaderText, { color: ACC_COLORS[acc] }]}>Meta Account {acc}</Text>
                        </View>
                        {accCamps.map(c => {
                          const selected = form.campaignIds.includes(c.id);
                          return (
                            <TouchableOpacity
                              key={c.id}
                              style={[modal.campaignRow, selected && modal.campaignRowActive]}
                              onPress={() => toggleCampaign(c)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="megaphone-outline" size={14} color={selected ? Colors.primary : Colors.gray400} />
                              <View style={{ flex: 1 }}>
                                <Text style={[modal.campaignName, selected && { color: Colors.primary }]} numberOfLines={1}>{c.name}</Text>
                                <Text style={modal.campaignId}>ID: {c.id}</Text>
                              </View>
                              <View style={[modal.checkbox, selected && modal.checkboxChecked]}>
                                {selected && <Ionicons name="checkmark" size={12} color={Colors.white} />}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              )}

              {/* ── Manager ── */}
              <Label text="Manager" />
              {managers.length === 0 ? (
                <Text style={modal.noUsersText}>No managers found</Text>
              ) : (
                <View style={{ gap: 6, marginBottom: Spacing.md }}>
                  {managers.map(mgr => (
                    <TouchableOpacity
                      key={mgr.uid}
                      style={[modal.userRow, form.managerId === mgr.uid && modal.userRowActive]}
                      onPress={() => selectManager(mgr)}
                      activeOpacity={0.8}
                    >
                      <View style={[modal.userAvatar, { backgroundColor: '#7C3AED20' }]}>
                        <Text style={[modal.userAvatarText, { color: '#7C3AED' }]}>{mgr.displayName.charAt(0)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={modal.userName}>{mgr.displayName}</Text>
                        <Text style={modal.userEmail}>{mgr.email}</Text>
                      </View>
                      {form.managerId === mgr.uid && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* ── Sales Team ── */}
              <Label text={`Sales Team * (${form.salesPersonIds.length} selected — round-robin)`} />
              <Text style={modal.helperText}>Incoming leads from linked campaigns will rotate through all selected persons.</Text>
              {salesUsers.length === 0 ? (
                <Text style={modal.noUsersText}>No sales persons found</Text>
              ) : (
                <View style={{ gap: 6, marginBottom: Spacing.md }}>
                  {salesUsers.map(sp => {
                    const selected = form.salesPersonIds.includes(sp.uid);
                    return (
                      <TouchableOpacity
                        key={sp.uid}
                        style={[modal.userRow, selected && modal.userRowActive]}
                        onPress={() => toggleSalesPerson(sp)}
                        activeOpacity={0.8}
                      >
                        <View style={[modal.userAvatar, { backgroundColor: Colors.primary + '20' }]}>
                          <Text style={[modal.userAvatarText, { color: Colors.primary }]}>{sp.displayName.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={modal.userName}>{sp.displayName}</Text>
                          <Text style={modal.userEmail}>{sp.phone || sp.email}</Text>
                        </View>
                        <View style={[modal.checkbox, selected && modal.checkboxChecked]}>
                          {selected && <Ionicons name="checkmark" size={12} color={Colors.white} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Active toggle */}
              <View style={modal.toggleRow}>
                <View>
                  <Text style={modal.toggleLabel}>Active</Text>
                  <Text style={modal.toggleSub}>Inactive projects won't receive new leads</Text>
                </View>
                <Switch
                  value={form.isActive}
                  onValueChange={v => setForm(f => ({ ...f, isActive: v }))}
                  trackColor={{ true: Colors.primary }}
                />
              </View>

              {/* Save */}
              <TouchableOpacity
                style={[modal.saveBtn, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color={Colors.white} size="small" />
                  : <Text style={modal.saveBtnText}>{editing ? 'Save Changes' : 'Create Project'}</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Project Card (expandable) ────────────────────────────────────────────────
function ProjectCard({
  project, salesUsers, expanded, onToggle, onEdit, onDelete,
}: {
  project: Project;
  salesUsers: User[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const leadCounts = useProjectLeadCounts(project);
  const totalLeads = Object.values(leadCounts).reduce((s, n) => s + n, 0);

  return (
    <View style={styles.card}>
      {/* ── Collapsed header ── */}
      <TouchableOpacity style={styles.cardHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[styles.statusDot, { backgroundColor: project.isActive ? Colors.success : Colors.gray300 }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{project.name}</Text>
          <Text style={styles.cardSub}>
            {[project.location, project.type].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {/* Summary pills */}
        <View style={styles.summaryPills}>
          <View style={styles.pill}>
            <Ionicons name="people-outline" size={11} color={Colors.primary} />
            <Text style={styles.pillText}>{project.salesPersonIds?.length ?? 0} agents</Text>
          </View>
          <View style={styles.pill}>
            <Ionicons name="person-outline" size={11} color={Colors.primary} />
            <Text style={styles.pillText}>{totalLeads} leads</Text>
          </View>
        </View>

        <TouchableOpacity onPress={onEdit} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="pencil-outline" size={15} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={15} color={Colors.danger} />
        </TouchableOpacity>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray400} />
      </TouchableOpacity>

      {/* ── Expanded detail ── */}
      {expanded && (
        <View style={styles.cardBody}>
          {/* Campaigns */}
          {(project.campaignNames?.length ?? 0) > 0 && (
            <View style={styles.expandSection}>
              <Text style={styles.expandLabel}>
                <Ionicons name="megaphone-outline" size={12} color={Colors.gray500} /> Campaigns ({project.campaignIds?.length})
              </Text>
              <View style={styles.tagWrap}>
                {(project.campaignNames ?? []).map((name, i) => (
                  <View key={i} style={[styles.campaignTag, { borderColor: ACC_COLORS[project.metaAccount ?? 1] + '60' }]}>
                    <Ionicons name="logo-facebook" size={10} color={ACC_COLORS[project.metaAccount ?? 1]} />
                    <Text style={[styles.campaignTagText, { color: ACC_COLORS[project.metaAccount ?? 1] }]} numberOfLines={1}>{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* No campaigns linked */}
          {(project.campaignIds?.length ?? 0) === 0 && (
            <View style={styles.expandSection}>
              <View style={styles.warnRow}>
                <Ionicons name="warning-outline" size={13} color={Colors.warning} />
                <Text style={styles.warnText}>No campaigns linked — leads will be routed by page ID only</Text>
              </View>
            </View>
          )}

          {/* Manager */}
          {project.managerName && (
            <View style={styles.expandSection}>
              <Text style={styles.expandLabel}>Manager</Text>
              <Text style={styles.expandValue}>{project.managerName}</Text>
            </View>
          )}

          {/* Sales persons + lead counts */}
          <View style={styles.expandSection}>
            <Text style={styles.expandLabel}>
              Sales Team · Round-robin #{project.roundRobinIndex ?? 0}
            </Text>
            {(project.salesPersonIds ?? []).length === 0 ? (
              <Text style={styles.noAgentsText}>No agents assigned</Text>
            ) : (
              <View style={{ gap: 6, marginTop: 6 }}>
                {(project.salesPersonIds ?? []).map((uid, idx) => {
                  const name = project.salesPersonNames?.[idx] ?? salesUsers.find(s => s.uid === uid)?.displayName ?? uid;
                  const count = leadCounts[uid] ?? 0;
                  return (
                    <View key={uid} style={styles.agentRow}>
                      <View style={styles.agentAvatar}>
                        <Text style={styles.agentAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.agentName} numberOfLines={1}>{name}</Text>
                      <View style={styles.leadCountBadge}>
                        <Ionicons name="person-outline" size={10} color={Colors.primary} />
                        <Text style={styles.leadCountText}>{count} leads</Text>
                      </View>
                      {/* Round-robin position indicator */}
                      {(project.roundRobinIndex ?? 0) % (project.salesPersonIds?.length ?? 1) === idx && (
                        <View style={styles.nextBadge}>
                          <Text style={styles.nextBadgeText}>Next</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="business-outline" size={52} color={Colors.gray300} />
      <Text style={styles.emptyTitle}>No projects yet</Text>
      <Text style={styles.emptySub}>
        Create a project to link Meta campaigns to a sales team. Incoming leads will be automatically assigned in round-robin order.
      </Text>
      <TouchableOpacity style={styles.emptyBtn} onPress={onAdd} activeOpacity={0.8}>
        <Text style={styles.emptyBtnText}>Create First Project</Text>
      </TouchableOpacity>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={modal.label}>{text}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.gray50 },
  content:     { padding: Spacing.base },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noAccess:    { color: Colors.gray500, fontSize: FontSize.base },
  topRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  countText:   { fontSize: FontSize.sm, color: Colors.gray500, fontWeight: FontWeight.medium },
  addBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.md },
  addBtnText:  { color: Colors.white, fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  card:        { backgroundColor: Colors.white, borderRadius: Radius.lg, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.gray100, overflow: 'hidden' },
  cardHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.md },
  statusDot:   { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  cardName:    { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy },
  cardSub:     { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 1 },
  summaryPills:{ flexDirection: 'row', gap: 5 },
  pill:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: Colors.primaryLight, borderRadius: Radius.full },
  pillText:    { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold },
  iconBtn:     { padding: 4 },

  cardBody:        { borderTopWidth: 1, borderTopColor: Colors.gray100, padding: Spacing.md, gap: Spacing.md, backgroundColor: Colors.gray50 },
  expandSection:   {},
  expandLabel:     { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  expandValue:     { fontSize: FontSize.sm, color: Colors.navy, fontWeight: FontWeight.medium },
  tagWrap:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  campaignTag:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: Colors.white, borderRadius: Radius.full, borderWidth: 1, maxWidth: 200 },
  campaignTagText: { fontSize: 11, fontWeight: FontWeight.medium, flexShrink: 1 },
  warnRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  warnText:        { fontSize: FontSize.xs, color: Colors.warning },
  noAgentsText:    { fontSize: FontSize.xs, color: Colors.gray400 },

  agentRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.gray100 },
  agentAvatar:     { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  agentAvatarText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  agentName:       { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.navy },
  leadCountBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.primaryLight, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  leadCountText:   { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold },
  nextBadge:       { backgroundColor: Colors.success, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  nextBadgeText:   { fontSize: 9, color: Colors.white, fontWeight: FontWeight.bold },

  empty:      { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 20 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray600 },
  emptySub:   { fontSize: FontSize.sm, color: Colors.gray400, textAlign: 'center', lineHeight: 20 },
  emptyBtn:   { marginTop: 8, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xl, backgroundColor: Colors.primary, borderRadius: Radius.md },
  emptyBtnText:{ color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
});

const modal = StyleSheet.create({
  container:      { flex: 1, backgroundColor: Colors.white },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  title:          { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  closeBtn:       { padding: 6 },
  label:          { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: Spacing.md },
  helperText:     { fontSize: FontSize.xs, color: Colors.gray400, marginBottom: 8, marginTop: -4, lineHeight: 16 },
  input:          { borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 11, fontSize: FontSize.sm, color: Colors.gray800, marginBottom: 4 },
  noUsersText:    { fontSize: FontSize.sm, color: Colors.gray400, marginBottom: Spacing.md },
  sectionHeaderRow:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refreshBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: Colors.primaryLight, borderRadius: Radius.full },
  refreshText:    { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },
  chip:           { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.gray200 },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontSize: FontSize.xs, color: Colors.gray600, fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.white },
  accHeader:      { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6 },
  accHeaderText:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  campaignRow:    { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray100, backgroundColor: Colors.white },
  campaignRowActive:{ borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  campaignName:   { fontSize: FontSize.sm, color: Colors.gray800, fontWeight: FontWeight.medium },
  campaignId:     { fontSize: 10, color: Colors.gray400, marginTop: 1 },
  emptyBox:       { alignItems: 'center', padding: Spacing.lg, backgroundColor: Colors.gray50, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray100, gap: 8, marginBottom: Spacing.md },
  emptyBoxText:   { fontSize: FontSize.sm, color: Colors.gray400, textAlign: 'center', lineHeight: 20 },
  userRow:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.gray100, backgroundColor: Colors.white },
  userRowActive:  { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  userAvatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  userAvatarText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  userName:       { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy },
  userEmail:      { fontSize: FontSize.xs, color: Colors.gray500 },
  checkbox:       { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.gray300, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked:{ backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.gray100, marginTop: Spacing.sm, marginBottom: Spacing.md },
  toggleLabel:    { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.navy },
  toggleSub:      { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 2 },
  saveBtn:        { backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText:    { color: Colors.white, fontWeight: FontWeight.bold, fontSize: FontSize.base },
});

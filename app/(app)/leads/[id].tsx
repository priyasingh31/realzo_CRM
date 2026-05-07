import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, ActivityIndicator, Share,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, isValid } from 'date-fns';

// Never throw on bad date strings — returns fallback instead
function safeFormat(value: string | null | undefined, fmt: string, fallback = '—'): string {
  if (!value || value === 'null' || value === 'undefined') return fallback;
  const d = new Date(value);
  return isValid(d) ? format(d, fmt) : fallback;
}
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLead, useLeadActivities, useUpdateLeadStatus } from '@/hooks/useLeads';
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
import { LeadStatusBadge, LeadSourceBadge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, formatCurrency } from '@/constants/theme';
import { getWhatsAppDeepLink } from '@/services/whatsappService';
import { scoreLeadAI } from '@/services/aiService';
import { LeadStatus } from '@/types';
import { useAuthStore } from '@/store/authStore';

const STAGES: LeadStatus[] = [
  'new', 'assigned', 'contacted', 'interested', 'not_interested',
  'rnr', 'switch_off', 'follow_up', 'site_visit_scheduled', 'site_visit_done',
  'negotiation', 'Booked', 'EOICustomer', 'invalid',
];

const STAGE_COLORS: Record<LeadStatus, string> = {
  new: '#64748B', assigned: '#7C3AED', contacted: '#2563EB',
  interested: '#059669', not_interested: '#DC2626', follow_up: '#D97706',
  site_visit_scheduled: '#0891B2', site_visit_done: '#0D9488',
  negotiation: '#EA580C', Booked: '#16A34A', EOICustomer : '#6B7280',
  invalid: '#9CA3AF', qualified: '#0D9488',
  rnr: '#F43F5E', switch_off: '#6366F1',
};

const META_ACC_COLORS: Record<number, string> = { 1: '#1877F2', 2: '#0B5ED7', 3: '#0353A4' };

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const { data: lead, isLoading } = useLead(id);
  const { data: activities = [] } = useLeadActivities(id);
  const { mutateAsync: updateStatus } = useUpdateLeadStatus();

  const [aiLoading, setAiLoading]     = useState(false);
  const [aiResult, setAiResult]       = useState<null | {
    score: number; quality: string; summary: string;
    strengths: string[]; concerns: string[];
    pitch: { opening: string; key_points: string[]; objection: string; cta: string };
    next_action: string;
  }>(null);
  const [showAllMeta, setShowAllMeta] = useState(false);
  const { user } = useAuthStore();
  const isSales = user?.role === 'sales';

  if (isLoading || !lead) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const accNum = lead.metaAccount;
  const accColor = accNum ? META_ACC_COLORS[accNum] : '#1877F2';

  const handleCall      = () => Linking.openURL(`tel:${lead.phone}`);
  const handleWhatsApp  = () => Linking.openURL(getWhatsAppDeepLink(lead.phone, `Hi ${lead.name}, `));
  const handleEmail     = () => lead.email && Linking.openURL(`mailto:${lead.email}`);

  const handleShare = () => {
    const mf = lead.metaFields ?? {};
    const extras = Object.entries(mf)
      .filter(([k, v]) => v?.trim() && !['full_name','first_name','last_name','phone_number','phone','email'].includes(k))
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join('\n');
    Share.share({
      message: [
        `name: ${lead.name}`,
        `gmail: ${lead.email || 'Na'}`,
        `phone: ${lead.phone}`,
        `require for: ${lead.requirements || 'Na'}`,
        `Job Title: ${lead.jobTitle || 'Na'}`,
        `campaign name: ${lead.metaCampaignName || 'Na'}`,
        extras ? `\n${extras}` : '',
      ].filter(Boolean).join('\n'),
    });
  };

  const handleAIScore = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const suggestion = await scoreLeadAI(lead);
      const m = suggestion.metadata as any;
      setAiResult({
        score:       m?.score       ?? Math.round((suggestion.confidence ?? 0.5) * 10),
        quality:     m?.quality     ?? 'Warm',
        summary:     suggestion.content,
        strengths:   m?.strengths   ?? [],
        concerns:    m?.concerns    ?? [],
        pitch:       m?.pitch       ?? { opening: '', key_points: [], objection: '', cta: '' },
        next_action: m?.next_action ?? '',
      });
      Toast.show({ type: 'success', text1: `AI Score: ${m?.score ?? '?'}/10 · ${m?.quality ?? ''}` });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'AI Score Failed', text2: e?.message ?? 'Check API key' });
    }
    setAiLoading(false);
  };

  const handleStatusChange = async (status: LeadStatus) => {
    try {
      await updateStatus({ id, status, closureDate: lead.closureDate });
      Toast.show({ type: 'success', text1: 'Status Updated', text2: status.replace(/_/g, ' ') });
    } catch {
      Toast.show({ type: 'error', text1: 'Update Failed' });
    }
  };

  // Extra Meta form fields not already shown
  const extraMetaFields = Object.entries(lead.metaFields ?? {}).filter(([k, v]) => {
    const skip = new Set([
      'full_name','first_name','last_name','phone_number','phone','mobile_number',
      'email','job_title','occupation','designation',
      'budget','budget_range','city','location','preferred_location','state','province',
      'requirements','message','comments','require_for','requirement',
      'property_type','project_type','timeline','purchase_timeline',
      'project_name','project','property_name','campaign_name','campaign',
    ]);
    return v?.trim() && !skip.has(k);
  });

  return (
    <View style={styles.screen}>
      <Header
        title={lead.name}
        showBack
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Status row ── */}
        <View style={styles.badgesRow}>
          <LeadStatusBadge status={lead.status} />
          <View style={{ width: 6 }} />
          {!isSales && <LeadSourceBadge source={lead.source} />}
          {!isSales && accNum && (
            <View style={[styles.accBadge, { borderColor: accColor }]}>
              <Ionicons name="logo-facebook" size={10} color={accColor} />
              <Text style={[styles.accBadgeText, { color: accColor }]}>Acc {accNum}</Text>
            </View>
          )}
          {(lead.aiScore !== null && lead.aiScore !== undefined || !!aiResult) && (
            <View style={[styles.scoreChip, aiResult && { backgroundColor: qualityColor(aiResult.quality) + '22', borderWidth: 1, borderColor: qualityColor(aiResult.quality) + '55' }]}>
              <Ionicons name="sparkles" size={11} color={aiResult ? qualityColor(aiResult.quality) : '#7C3AED'} />
              <Text style={[styles.scoreText, aiResult && { color: qualityColor(aiResult.quality) }]}>
                {aiResult ? `${aiResult.score}/10 · ${aiResult.quality}` : `AI ${lead.aiScore}/10`}
              </Text>
            </View>
          )}
        </View>

        {/* ── Assignment Note (visible to all, especially sales) ── */}
        {!!lead.assignmentNote && (
          <View style={styles.assignNoteCard}>
            <View style={styles.assignNoteHeader}>
              <Ionicons name="information-circle" size={15} color="#B45309" />
              <Text style={styles.assignNoteLabel}>Note from Admin</Text>
            </View>
            <Text style={styles.assignNoteText}>{lead.assignmentNote}</Text>
          </View>
        )}

        {/* ── Quick Actions ── */}
        <View style={styles.actionRow}>
          <ActionBtn icon="call" label="Call" color={Colors.primary} bg={Colors.primaryLight} onPress={handleCall} />
          <ActionBtn icon="logo-whatsapp" label="WhatsApp" color="#25D366" bg="#E8FFF0" onPress={handleWhatsApp} />
          {lead.email ? <ActionBtn icon="mail" label="Email" color={Colors.info} bg={Colors.infoLight} onPress={handleEmail} /> : null}
          <ActionBtn
            icon={aiLoading ? undefined : 'sparkles'}
            label={aiLoading ? '...' : 'AI Score'}
            color="#7C3AED" bg="#EDE9FE"
            onPress={handleAIScore}
            loading={aiLoading}
          />
          <ActionBtn icon="share-outline" label="Share" color={Colors.gray600} bg={Colors.gray100} onPress={handleShare} />
        </View>

        {/* ── Contact Information ── */}
        <SectionCard title="Contact Details" icon="person-circle-outline">
          <InfoRow icon="call-outline"      label="Phone"       value={lead.phone} onPress={handleCall} />
          {lead.email      && <InfoRow icon="mail-outline"      label="Email"       value={lead.email} onPress={handleEmail} />}
          {lead.jobTitle   && <InfoRow icon="briefcase-outline" label="Job Title"   value={lead.jobTitle} />}
          {lead.managerName && <InfoRow icon="shield-outline"   label="Manager"     value={lead.managerName} />}
          <InfoRow icon="person-outline" label="Assigned To" value={lead.assignedToName || 'Unassigned'} />
          <InfoRow icon="calendar-outline"  label="Lead Date"   value={safeFormat(lead.createdAt, 'dd MMM yyyy, hh:mm a')} />
          {lead.lastContactedAt && (
            <InfoRow icon="time-outline" label="Last Contact" value={safeFormat(lead.lastContactedAt, 'dd MMM yyyy, hh:mm a')} />
          )}
        </SectionCard>

        {/* ── Property Interest ── */}
        <SectionCard title="Property Interest" icon="home-outline">
          {lead.requirements && <InfoRow icon="list-outline"     label="Require For"  value={lead.requirements} />}
          {lead.budget       && <InfoRow icon="cash-outline"     label="Budget"       value={formatCurrency(lead.budget)} highlight />}
          {(lead.preferredLocation || lead.location) && (
            <InfoRow icon="location-outline" label="Location" value={lead.preferredLocation || lead.location!} />
          )}
          {lead.projectName  && <InfoRow icon="business-outline" label="Project"      value={lead.projectName} />}
          {lead.followUpDate && (
            <InfoRow
              icon="alarm-outline" label="Follow Up"
              value={safeFormat(lead.followUpDate, 'dd MMM yyyy')}
              highlight={!!lead.followUpDate && lead.followUpDate < format(new Date(), 'yyyy-MM-dd')}
              highlightColor={Colors.danger}
            />
          )}
          {lead.visitDate && (
            <InfoRow icon="car-outline" label="Visit Date" value={safeFormat(lead.visitDate, 'dd MMM yyyy')} />
          )}
          {lead.closureValue && (
            <InfoRow icon="trophy-outline" label="Deal Value" value={formatCurrency(lead.closureValue)} highlight highlightColor={Colors.success} />
          )}
        </SectionCard>

        {/* ── Campaign / Ad Source (hidden for sales) ── */}
        {!isSales && (lead.source === 'meta' || lead.metaCampaignName) && (
          <SectionCard title="Ad Campaign Info" icon="megaphone-outline">
            {accNum && <InfoRow icon="logo-facebook" label="Meta Account" value={`Account ${accNum}`} />}
            {lead.metaCampaignName && <InfoRow icon="megaphone-outline" label="Campaign" value={lead.metaCampaignName} />}
            {lead.metaAdsetName    && <InfoRow icon="layers-outline"    label="Ad Set"   value={lead.metaAdsetName} />}
            {lead.metaAdName       && <InfoRow icon="image-outline"     label="Ad Name"  value={lead.metaAdName} />}
            {lead.metaPlatform     && <InfoRow icon="phone-portrait-outline" label="Platform" value={lead.metaPlatform} />}
          </SectionCard>
        )}

        {/* ── All Meta Form Fields (hidden for sales) ── */}
        {!isSales && extraMetaFields.length > 0 && (
          <SectionCard title="Form Responses" icon="document-text-outline">
            {(showAllMeta ? extraMetaFields : extraMetaFields.slice(0, 4)).map(([k, v]) => (
              <InfoRow key={k} icon="chevron-forward-outline" label={k.replace(/_/g, ' ')} value={v} />
            ))}
            {extraMetaFields.length > 4 && (
              <TouchableOpacity onPress={() => setShowAllMeta(p => !p)} style={styles.showMore}>
                <Text style={styles.showMoreText}>
                  {showAllMeta ? 'Show less' : `Show ${extraMetaFields.length - 4} more fields`}
                </Text>
                <Ionicons name={showAllMeta ? 'chevron-up' : 'chevron-down'} size={13} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </SectionCard>
        )}

        {/* ── Notes ── */}
        {lead.notes && (
          <SectionCard title="Notes" icon="document-outline">
            <Text style={styles.notesText}>{lead.notes}</Text>
          </SectionCard>
        )}

        {/* ── AI Analysis & Pitch Guide ── */}
        {aiResult && <AIPitchCard result={aiResult} />}

        {/* ── Update Status ── */}
        <SectionCard title="Update Status" icon="git-merge-outline">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
            {STAGES.map((s) => {
              const active = lead.status === s;
              const color  = STAGE_COLORS[s] ?? Colors.gray500;
              return (
                <TouchableOpacity
                  key={s}
                  onPress={() => handleStatusChange(s)}
                  style={[styles.statusBtn, active && { backgroundColor: color, borderColor: color }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.statusBtnLabel, active && styles.statusBtnLabelActive]}>
                    {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </SectionCard>

        {/* ── Activity Log (hidden for sales) ── */}
        {!isSales && (
          <SectionCard title={`Activity Log (${activities.length})`} icon="time-outline">
            {activities.length === 0 ? (
              <Text style={styles.emptyText}>No activities recorded yet</Text>
            ) : activities.map((a) => (
              <View key={a.id} style={styles.activityItem}>
                <View style={[styles.activityDot, { backgroundColor: getActivityColor(a.type) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityType}>{a.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</Text>
                  <Text style={styles.activityText}>{a.description}</Text>
                  <Text style={styles.activityMeta}>
                    {a.performedByName ?? a.performedBy} · {safeFormat(a.createdAt, 'dd MMM, hh:mm a')}
                  </Text>
                </View>
              </View>
            ))}
          </SectionCard>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <Card style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={15} color={Colors.primary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </Card>
  );
}

function InfoRow({
  icon, label, value, onPress, highlight, highlightColor,
}: {
  icon: string; label: string; value: string;
  onPress?: () => void;
  highlight?: boolean;
  highlightColor?: string;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} style={styles.infoRow} activeOpacity={0.7}>
      <Ionicons name={icon as any} size={14} color={Colors.gray400} style={styles.infoIcon} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[
          styles.infoValue,
          highlight && { color: highlightColor ?? Colors.primary, fontWeight: FontWeight.bold },
          onPress && { color: Colors.primary, textDecorationLine: 'underline' },
        ]}
        numberOfLines={3}
      >
        {value}
      </Text>
    </Wrapper>
  );
}

function ActionBtn({
  icon, label, color, bg, onPress, loading,
}: {
  icon?: string; label: string; color: string; bg: string; onPress: () => void; loading?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.actionBtn, { backgroundColor: bg }]} activeOpacity={0.8} disabled={loading}>
      {loading
        ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={icon as any} size={18} color={color} />}
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── AI Pitch Card ────────────────────────────────────────────────────────────
function AIPitchCard({ result }: {
  result: {
    score: number; quality: string; summary: string;
    strengths: string[]; concerns: string[];
    pitch: { opening: string; key_points: string[]; objection: string; cta: string };
    next_action: string;
  };
}) {
  const qColor = qualityColor(result.quality);
  const [tab, setTab] = useState<'analysis' | 'pitch'>('analysis');

  return (
    <View style={[aiStyles.card, { borderColor: qColor + '40' }]}>
      {/* Header */}
      <View style={aiStyles.header}>
        <View style={[aiStyles.scoreBubble, { backgroundColor: qColor }]}>
          <Text style={aiStyles.scoreNum}>{result.score}</Text>
          <Text style={aiStyles.scoreDen}>/10</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[aiStyles.qualityLabel, { color: qColor }]}>{result.quality} Lead</Text>
          <Text style={aiStyles.summary} numberOfLines={2}>{result.summary}</Text>
        </View>
        <Ionicons name="sparkles" size={20} color={qColor} />
      </View>

      {/* Tab switcher */}
      <View style={aiStyles.tabRow}>
        <TouchableOpacity
          style={[aiStyles.tab, tab === 'analysis' && { backgroundColor: qColor }]}
          onPress={() => setTab('analysis')} activeOpacity={0.8}
        >
          <Text style={[aiStyles.tabText, tab === 'analysis' && { color: Colors.white }]}>Analysis</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[aiStyles.tab, tab === 'pitch' && { backgroundColor: qColor }]}
          onPress={() => setTab('pitch')} activeOpacity={0.8}
        >
          <Ionicons name="mic-outline" size={12} color={tab === 'pitch' ? Colors.white : Colors.gray500} />
          <Text style={[aiStyles.tabText, tab === 'pitch' && { color: Colors.white }]}>Pitch Guide</Text>
        </TouchableOpacity>
      </View>

      {tab === 'analysis' ? (
        <>
          {/* Strengths */}
          {result.strengths?.length > 0 && (
            <View style={aiStyles.section}>
              <Text style={aiStyles.sectionLabel}>Strengths</Text>
              {result.strengths.map((s, i) => (
                <View key={i} style={aiStyles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                  <Text style={aiStyles.bulletText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Concerns */}
          {result.concerns?.length > 0 && (
            <View style={aiStyles.section}>
              <Text style={aiStyles.sectionLabel}>Concerns</Text>
              {result.concerns.map((c, i) => (
                <View key={i} style={aiStyles.bulletRow}>
                  <Ionicons name="warning-outline" size={14} color={Colors.warning} />
                  <Text style={aiStyles.bulletText}>{c}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Next action */}
          {result.next_action ? (
            <View style={[aiStyles.nextAction, { backgroundColor: qColor + '12', borderColor: qColor + '30' }]}>
              <Ionicons name="arrow-forward-circle" size={16} color={qColor} />
              <Text style={[aiStyles.nextActionText, { color: qColor }]}>{result.next_action}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          {/* Opening line */}
          {result.pitch?.opening ? (
            <View style={aiStyles.section}>
              <Text style={aiStyles.sectionLabel}>Opening Line</Text>
              <View style={[aiStyles.openingBox, { borderLeftColor: qColor }]}>
                <Text style={aiStyles.openingText}>"{result.pitch.opening}"</Text>
              </View>
            </View>
          ) : null}

          {/* Key pitch points */}
          {result.pitch?.key_points?.length > 0 && (
            <View style={aiStyles.section}>
              <Text style={aiStyles.sectionLabel}>Key Points to Cover</Text>
              {result.pitch.key_points.map((p, i) => (
                <View key={i} style={aiStyles.bulletRow}>
                  <View style={[aiStyles.numDot, { backgroundColor: qColor }]}>
                    <Text style={aiStyles.numDotText}>{i + 1}</Text>
                  </View>
                  <Text style={aiStyles.bulletText}>{p}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Objection handling */}
          {result.pitch?.objection ? (
            <View style={aiStyles.section}>
              <Text style={aiStyles.sectionLabel}>Handle Objection</Text>
              <View style={[aiStyles.objectionBox, { borderColor: Colors.warning + '50' }]}>
                <Ionicons name="shield-outline" size={14} color={Colors.warning} />
                <Text style={aiStyles.objectionText}>{result.pitch.objection}</Text>
              </View>
            </View>
          ) : null}

          {/* CTA */}
          {result.pitch?.cta ? (
            <View style={[aiStyles.ctaBox, { backgroundColor: qColor }]}>
              <Ionicons name="flag" size={14} color={Colors.white} />
              <Text style={aiStyles.ctaText}>{result.pitch.cta}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function qualityColor(quality: string): string {
  const map: Record<string, string> = {
    Hot: '#DC2626', Warm: '#D97706', Cold: '#2563EB', Junk: '#6B7280',
  };
  return map[quality] ?? '#7C3AED';
}

function getActivityColor(type: string): string {
  const map: Record<string, string> = {
    call: Colors.success, whatsapp: '#25D366', email: Colors.info,
    note: Colors.gray400, site_visit: Colors.warning, status_change: Colors.primary,
    assigned: '#7C3AED', escalation: Colors.danger,
  };
  return map[type] ?? Colors.gray400;
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.gray50 },
  centered:    { alignItems: 'center', justifyContent: 'center' },
  content:     { padding: Spacing.base, gap: Spacing.sm },

  badgesRow:   { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  accBadge:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, borderWidth: 1 },
  accBadgeText:{ fontSize: 10, fontWeight: FontWeight.semibold },
  scoreChip:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EDE9FE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  scoreText:   { fontSize: 10, color: '#7C3AED', fontWeight: FontWeight.bold },

  actionRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.xs },
  actionBtn:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: Radius.lg, gap: 4, minWidth: 60 },
  actionLabel: { fontSize: 10, fontWeight: FontWeight.semibold },

  section:     { marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.md },
  sectionTitle:{ fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy },

  infoRow:     { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  infoIcon:    { width: 20, marginTop: 1 },
  infoLabel:   { fontSize: FontSize.xs, color: Colors.gray400, width: 90, paddingTop: 1, textTransform: 'capitalize' },
  infoValue:   { flex: 1, fontSize: FontSize.sm, color: Colors.gray800, fontWeight: FontWeight.medium, lineHeight: 20 },

  notesText:   { fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 22 },

  showMore:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: Spacing.sm },
  showMoreText:{ fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },

  aiCard:      { backgroundColor: '#EDE9FE', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#C4B5FD' },
  aiHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  aiTitle:     { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#7C3AED' },
  aiText:      { fontSize: FontSize.sm, color: '#4C1D95', lineHeight: 20 },

  statusRow:   { gap: Spacing.xs, paddingBottom: 4 },
  statusBtn:   { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray200, backgroundColor: Colors.white },
  statusBtnLabel:      { fontSize: FontSize.xs, color: Colors.gray500, fontWeight: FontWeight.medium },
  statusBtnLabelActive:{ color: Colors.white, fontWeight: FontWeight.semibold },

  emptyText:   { fontSize: FontSize.sm, color: Colors.gray400 },
  activityItem:{ flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray50 },
  activityDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  activityType:{ fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.navy, marginBottom: 2 },
  activityText:{ fontSize: FontSize.sm, color: Colors.gray700 },
  activityMeta:{ fontSize: FontSize.xs, color: Colors.gray400, marginTop: 3 },
  assignNoteCard:   { backgroundColor: '#FFFBEB', borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: '#FDE68A', marginBottom: Spacing.xs },
  assignNoteHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  assignNoteLabel:  { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.4 },
  assignNoteText:   { fontSize: FontSize.sm, color: '#92400E', lineHeight: 20 },
});

const aiStyles = StyleSheet.create({
  card:          { backgroundColor: Colors.white, borderRadius: Radius.xl, borderWidth: 1.5, padding: Spacing.base, marginBottom: 0 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  scoreBubble:   { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  scoreNum:      { fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white, lineHeight: 22 },
  scoreDen:      { fontSize: 10, color: 'rgba(255,255,255,0.8)', marginTop: -2 },
  qualityLabel:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, marginBottom: 2 },
  summary:       { fontSize: FontSize.xs, color: Colors.gray500, lineHeight: 16 },

  tabRow:        { flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: Radius.lg, padding: 3, gap: 4, marginBottom: Spacing.md },
  tab:           { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: Radius.md },
  tabText:       { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500 },

  section:       { marginBottom: Spacing.md },
  sectionLabel:  { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },

  bulletRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  bulletText:    { flex: 1, fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 20 },
  numDot:        { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 },
  numDotText:    { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white },

  openingBox:    { borderLeftWidth: 3, paddingLeft: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.gray50, borderRadius: Radius.sm },
  openingText:   { fontSize: FontSize.sm, color: Colors.gray700, fontStyle: 'italic', lineHeight: 20 },

  objectionBox:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: Spacing.sm, borderWidth: 1 },
  objectionText: { flex: 1, fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 20 },

  nextAction:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1 },
  nextActionText:{ flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, lineHeight: 20 },

  ctaBox:        { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: Radius.lg, padding: Spacing.md, marginTop: 4 },
  ctaText:       { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, FlatList, Share, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useLeads } from '@/hooks/useLeads';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, Shadow, LEAD_SOURCES } from '@/constants/theme';
import { format } from 'date-fns';
import { Lead } from '@/types';
import {
  generateSalesReviewReport, generateAdAccountReviewReport,
  SalesPersonReportData, AdAccountReportData,
} from '@/services/aiService';
import { useAuthStore } from '@/store/authStore';

type Period = '7d' | '30d' | '90d' | 'all';

interface SalesPerson { uid: string; displayName: string; email: string; region?: string }
interface SalesStats {
  totalLeads: number;
  newLeads: number;
  interested: number;
  siteVisits: number;
  closed: number;
  missed: number;
  convRate: string;
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();
  const [period, setPeriod] = useState<Period>('30d');
  const [salesPersons, setSalesPersons] = useState<SalesPerson[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<SalesPerson | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  // AI Review Report state
  type ReportType = 'sales' | 'ads';
  const [reportType, setReportType] = useState<ReportType>('sales');
  const [reportText, setReportText] = useState<string | null>(null);
  const [reportGenerating, setReportGenerating] = useState(false);

  const { data: leads = [] } = useLeads();

  // Fetch all sales persons (admin sees all; manager sees their team)
  useEffect(() => {
    const q = user?.role === 'manager'
      ? query(collection(db, 'users'), where('role', '==', 'sales'), where('managerId', '==', user.uid))
      : query(collection(db, 'users'), where('role', '==', 'sales'));
    getDocs(q).then(snap => {
      const persons = snap.docs.map(d => d.data() as SalesPerson);
      setSalesPersons(persons);
    }).catch(console.error);
  }, [user?.uid]);

  const periodStart = useMemo(() => {
    const d = new Date();
    if (period === '7d')  d.setDate(d.getDate() - 7);
    else if (period === '30d') d.setDate(d.getDate() - 30);
    else if (period === '90d') d.setDate(d.getDate() - 90);
    else d.setFullYear(2000);
    return d;
  }, [period]);

  const filteredLeads = useMemo(() =>
    leads.filter((l: Lead) => new Date(l.createdAt) >= periodStart),
    [leads, periodStart]
  );

  // Overall metrics
  const overview = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const closed = filteredLeads.filter((l: Lead) => l.status === 'closed_won').length;
    const missed = filteredLeads.filter((l: Lead) =>
      l.followUpDate && l.followUpDate < today && !['closed_won','dead','invalid'].includes(l.status)
    ).length;
    const convRate = filteredLeads.length > 0 ? (closed / filteredLeads.length * 100).toFixed(1) : '0';

    const bySource = LEAD_SOURCES.map(s => ({
      source: s.key, label: s.label, color: s.color,
      count: filteredLeads.filter((l: Lead) => l.source === s.key).length,
    })).filter(s => s.count > 0).sort((a, b) => b.count - a.count);

    return { total: filteredLeads.length, closed, missed, convRate, bySource };
  }, [filteredLeads]);

  // Per-agent stats
  const agentStats = useMemo((): Record<string, SalesStats> => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const out: Record<string, SalesStats> = {};
    for (const sp of salesPersons) {
      const agLeads = filteredLeads.filter((l: Lead) => l.assignedTo === sp.uid);
      const closed = agLeads.filter((l: Lead) => l.status === 'closed_won').length;
      const missed = agLeads.filter((l: Lead) =>
        l.followUpDate && l.followUpDate < today && !['closed_won','dead','invalid'].includes(l.status)
      ).length;
      out[sp.uid] = {
        totalLeads: agLeads.length,
        newLeads: agLeads.filter((l: Lead) => l.status === 'new' || l.status === 'assigned').length,
        interested: agLeads.filter((l: Lead) => l.status === 'interested').length,
        siteVisits: agLeads.filter((l: Lead) => ['site_visit_scheduled','site_visit_done'].includes(l.status)).length,
        closed,
        missed,
        convRate: agLeads.length > 0 ? (closed / agLeads.length * 100).toFixed(1) : '0',
      };
    }
    return out;
  }, [filteredLeads, salesPersons]);

  const displayAgents = selectedAgent
    ? salesPersons.filter(sp => sp.uid === selectedAgent.uid)
    : salesPersons;

  const periodLabel = period === '7d' ? 'Last 7 Days' : period === '30d' ? 'Last 30 Days' : period === '90d' ? 'Last 90 Days' : 'All Time';

  const generateReport = async () => {
    setReportGenerating(true);
    setReportText(null);
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      if (reportType === 'sales') {
        const agentData: SalesPersonReportData[] = salesPersons.map(sp => ({
          name: sp.displayName,
          region: sp.region,
          ...(agentStats[sp.uid] ?? { totalLeads: 0, newLeads: 0, interested: 0, siteVisits: 0, closed: 0, missed: 0, convRate: '0' }),
        }));
        const totals = {
          totalLeads: overview.total,
          closed: overview.closed,
          missed: overview.missed,
          convRate: overview.convRate,
        };
        const text = await generateSalesReviewReport(periodLabel, agentData, totals);
        setReportText(text);
      } else {
        const buildAccRow = (label: string, acc: 1 | 2 | 3 | null, cpl: number): AdAccountReportData => {
          const leads = acc === null
            ? filteredLeads.filter((l: Lead) => l.source === 'google')
            : filteredLeads.filter((l: Lead) => l.source === 'meta' && l.metaAccount === acc);
          const closed = leads.filter((l: Lead) => l.status === 'closed_won').length;
          const newToday = leads.filter((l: Lead) => format(new Date(l.createdAt), 'yyyy-MM-dd') === today).length;
          return { label, totalLeads: leads.length, newToday, cpl, convRate: leads.length > 0 ? (closed / leads.length * 100).toFixed(1) : '0' };
        };
        const adAccounts: AdAccountReportData[] = [
          buildAccRow('Meta Account 1', 1, 150),
          buildAccRow('Meta Account 2', 2, 150),
          buildAccRow('Meta Account 3', 3, 150),
          buildAccRow('Google Ads', null, 200),
        ];
        const text = await generateAdAccountReviewReport(periodLabel, adAccounts, overview.total);
        setReportText(text);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not generate report');
    } finally {
      setReportGenerating(false);
    }
  };

  const downloadPDF = () => {
    if (!reportText) return;
    const title = reportType === 'sales' ? 'Sales Performance Review' : 'Ad Account Performance Review';
    const dateStr = format(new Date(), 'dd MMM yyyy');

    const agentRows = reportType === 'sales' ? salesPersons.map(sp => {
      const s = agentStats[sp.uid];
      if (!s) return '';
      return `<tr><td>${sp.displayName}</td><td>${sp.region ?? '-'}</td><td>${s.totalLeads}</td><td>${s.interested}</td><td>${s.siteVisits}</td><td>${s.closed}</td><td>${s.missed}</td><td>${s.convRate}%</td></tr>`;
    }).join('') : '';

    const adRows = reportType === 'ads' ? [
      { label: 'Meta Account 1', acc: 1 }, { label: 'Meta Account 2', acc: 2 },
      { label: 'Meta Account 3', acc: 3 }, { label: 'Google Ads', acc: null },
    ].map(({ label, acc }) => {
      const count = acc !== null
        ? filteredLeads.filter((l: Lead) => l.source === 'meta' && l.metaAccount === acc).length
        : filteredLeads.filter((l: Lead) => l.source === 'google').length;
      const closed = filteredLeads.filter((l: Lead) => (acc !== null ? l.source === 'meta' && l.metaAccount === acc : l.source === 'google') && l.status === 'closed_won').length;
      const conv = count > 0 ? (closed / count * 100).toFixed(1) : '0';
      const cpl = acc !== null ? 150 : 200;
      return `<tr><td>${label}</td><td>${count}</td><td>${closed}</td><td>${conv}%</td><td>₹${cpl}</td><td>₹${count * cpl}</td></tr>`;
    }).join('') : '';

    const tableSection = reportType === 'sales' ? `
      <h2>Agent Performance Data</h2>
      <table><thead><tr><th>Agent</th><th>Region</th><th>Total</th><th>Interested</th><th>Site Visits</th><th>Closed</th><th>Missed</th><th>Conv%</th></tr></thead>
      <tbody>${agentRows}</tbody></table>
    ` : `
      <h2>Ad Account Data</h2>
      <table><thead><tr><th>Account</th><th>Total Leads</th><th>Closed</th><th>Conv%</th><th>CPL</th><th>Est. Spend</th></tr></thead>
      <tbody>${adRows}</tbody></table>
    `;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>${title}</title>
      <style>
        body{font-family:Arial,sans-serif;margin:40px;color:#1E293B}
        h1{color:#0D1B2A;font-size:22px;margin-bottom:4px}
        .meta{color:#64748B;font-size:13px;margin-bottom:24px}
        h2{color:#1A9B6C;font-size:15px;margin-top:28px;margin-bottom:8px;border-bottom:2px solid #E8F8F2;padding-bottom:4px}
        .report{background:#F8FAFC;border-left:4px solid #1A9B6C;padding:16px;border-radius:6px;font-size:14px;line-height:1.7;white-space:pre-wrap}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
        th{background:#0D1B2A;color:#fff;padding:8px 10px;text-align:left}
        td{padding:7px 10px;border-bottom:1px solid #E2E8F0}
        tr:nth-child(even) td{background:#F8FAFC}
        .footer{margin-top:40px;font-size:11px;color:#94A3B8;text-align:center}
        @media print{body{margin:20px}}
      </style>
    </head><body>
      <h1>Relazo CRM — ${title}</h1>
      <p class="meta">Period: ${periodLabel} &nbsp;|&nbsp; Generated: ${dateStr} &nbsp;|&nbsp; Total Leads: ${overview.total}</p>
      <h2>AI Analysis</h2>
      <div class="report">${reportText.replace(/</g, '&lt;')}</div>
      ${tableSection}
      <p class="footer">Relazo CRM &copy; ${new Date().getFullYear()} — Confidential Review Document</p>
    </body></html>`;

    if (Platform.OS === 'web') {
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (w) { w.onload = () => { w.focus(); w.print(); }; }
    } else {
      Share.share({
        title,
        message: `${title}\nPeriod: ${periodLabel}\nGenerated: ${dateStr}\n\n${reportText}`,
      });
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reports & Analytics</Text>
        <Text style={styles.headerSub}>{format(new Date(), 'MMM d, yyyy')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Selector */}
        <View style={styles.periodRow}>
          {(['7d', '30d', '90d', 'all'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setPeriod(p)}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
            >
              <Text style={[styles.periodLabel, period === p && styles.periodLabelActive]}>
                {p === 'all' ? 'All Time' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* KPI Cards */}
        <View style={styles.kpiGrid}>
          {/* CTA: Total Leads — taps to leads page */}
          <TouchableOpacity style={[styles.kpiCard, { borderColor: Colors.primary + '40' }]} onPress={() => router.push('/leads')} activeOpacity={0.8}>
            <View style={[styles.kpiIcon, { backgroundColor: Colors.primary + '15' }]}>
              <Ionicons name="people-outline" size={20} color={Colors.primary} />
            </View>
            <Text style={[styles.kpiValue, { color: Colors.primary }]}>{overview.total}</Text>
            <Text style={styles.kpiLabel}>Total Leads</Text>
            <View style={styles.ctaBadge}>
              <Text style={styles.ctaBadgeText}>View All</Text>
              <Ionicons name="arrow-forward" size={10} color={Colors.primary} />
            </View>
          </TouchableOpacity>

          <View style={[styles.kpiCard, { borderColor: Colors.success + '40' }]}>
            <View style={[styles.kpiIcon, { backgroundColor: Colors.success + '15' }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />
            </View>
            <Text style={[styles.kpiValue, { color: Colors.success }]}>{overview.closed}</Text>
            <Text style={styles.kpiLabel}>Closed</Text>
          </View>

          <View style={[styles.kpiCard, { borderColor: '#F59E0B40' }]}>
            <View style={[styles.kpiIcon, { backgroundColor: '#F59E0B15' }]}>
              <Ionicons name="trending-up-outline" size={20} color="#F59E0B" />
            </View>
            <Text style={[styles.kpiValue, { color: '#F59E0B' }]}>{overview.convRate}%</Text>
            <Text style={styles.kpiLabel}>Conversion</Text>
          </View>

          <TouchableOpacity
            style={[styles.kpiCard, { borderColor: Colors.danger + '40' }]}
            onPress={() => router.push({ pathname: '/leads', params: { filter: 'missed' } })}
            activeOpacity={0.8}
          >
            <View style={[styles.kpiIcon, { backgroundColor: Colors.danger + '15' }]}>
              <Ionicons name="alert-circle-outline" size={20} color={Colors.danger} />
            </View>
            <Text style={[styles.kpiValue, { color: Colors.danger }]}>{overview.missed}</Text>
            <Text style={styles.kpiLabel}>Missed</Text>
          </TouchableOpacity>
        </View>

        {/* Leads by Source */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Leads by Source</Text>
          {overview.bySource.length === 0 ? (
            <Text style={styles.emptyText}>No leads in this period</Text>
          ) : overview.bySource.map(s => {
            const pct = overview.total > 0 ? s.count / overview.total : 0;
            return (
              <View key={s.source} style={styles.barItem}>
                <View style={styles.barLabelRow}>
                  <View style={[styles.sourceDot, { backgroundColor: s.color }]} />
                  <Text style={styles.barLabel}>{s.label}</Text>
                  <Text style={styles.barPct}>{(pct * 100).toFixed(0)}%</Text>
                  <Text style={styles.barCount}>{s.count}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct * 100}%` as any, backgroundColor: s.color }]} />
                </View>
              </View>
            );
          })}
        </View>

        {/* Sales Person Performance */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Sales Performance</Text>
            {/* Agent Dropdown */}
            <TouchableOpacity style={styles.agentPicker} onPress={() => setPickerVisible(true)} activeOpacity={0.8}>
              <Ionicons name="person-outline" size={13} color={Colors.primary} />
              <Text style={styles.agentPickerText} numberOfLines={1}>
                {selectedAgent ? selectedAgent.displayName.split(' ')[0] : 'All Agents'}
              </Text>
              <Ionicons name="chevron-down" size={13} color={Colors.gray400} />
            </TouchableOpacity>
          </View>

          {salesPersons.length === 0 ? (
            <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
          ) : displayAgents.map(sp => {
            const stats = agentStats[sp.uid] ?? { totalLeads: 0, newLeads: 0, interested: 0, siteVisits: 0, closed: 0, missed: 0, convRate: '0' };
            return (
              <View key={sp.uid} style={styles.agentCard}>
                <View style={styles.agentCardHeader}>
                  <View style={styles.agentAvatar}>
                    <Text style={styles.agentAvatarLetter}>{sp.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agentName}>{sp.displayName}</Text>
                    <Text style={styles.agentRegion}>{sp.region ?? sp.email}</Text>
                  </View>
                  <View style={styles.convBadge}>
                    <Text style={styles.convBadgeText}>{stats.convRate}%</Text>
                    <Text style={styles.convBadgeSub}>conv.</Text>
                  </View>
                </View>

                <View style={styles.agentStats}>
                  <AgentStat label="Total" value={stats.totalLeads} color={Colors.primary} />
                  <AgentStat label="New" value={stats.newLeads} color="#64748B" />
                  <AgentStat label="Interested" value={stats.interested} color="#059669" />
                  <AgentStat label="Visits" value={stats.siteVisits} color="#0891B2" />
                  <AgentStat label="Closed" value={stats.closed} color={Colors.success} />
                  <AgentStat label="Missed" value={stats.missed} color={Colors.danger} />
                </View>

                {/* Mini progress bar */}
                {stats.totalLeads > 0 && (
                  <View style={styles.agentProgressRow}>
                    {[
                      { pct: stats.newLeads / stats.totalLeads, color: '#64748B' },
                      { pct: stats.interested / stats.totalLeads, color: '#059669' },
                      { pct: stats.siteVisits / stats.totalLeads, color: '#0891B2' },
                      { pct: stats.closed / stats.totalLeads, color: Colors.success },
                    ].map((seg, i) => seg.pct > 0 ? (
                      <View key={i} style={[styles.agentProgressSeg, { flex: seg.pct, backgroundColor: seg.color }]} />
                    ) : null)}
                  </View>
                )}
              </View>
            );
          })}
        </View>
        {/* ── AI Review Report ── */}
        <View style={styles.section}>
          {/* Section header */}
          <View style={styles.reportHeader}>
            <View>
              <Text style={styles.sectionTitle}>Review Meeting Report</Text>
              <Text style={styles.reportSubtitle}>AI-generated · ready to download as PDF</Text>
            </View>
            <Ionicons name="document-text-outline" size={22} color={Colors.primary} />
          </View>

          {/* Report type toggle */}
          <View style={styles.reportToggle}>
            <TouchableOpacity
              style={[styles.reportToggleBtn, reportType === 'sales' && styles.reportToggleBtnActive]}
              onPress={() => { setReportType('sales'); setReportText(null); }}
              activeOpacity={0.8}
            >
              <Ionicons name="people-outline" size={14} color={reportType === 'sales' ? Colors.white : Colors.gray500} />
              <Text style={[styles.reportToggleText, reportType === 'sales' && { color: Colors.white }]}>Sales Persons</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reportToggleBtn, reportType === 'ads' && styles.reportToggleBtnActive]}
              onPress={() => { setReportType('ads'); setReportText(null); }}
              activeOpacity={0.8}
            >
              <Ionicons name="megaphone-outline" size={14} color={reportType === 'ads' ? Colors.white : Colors.gray500} />
              <Text style={[styles.reportToggleText, reportType === 'ads' && { color: Colors.white }]}>Ad Accounts</Text>
            </TouchableOpacity>
          </View>

          {/* What's included info */}
          <View style={styles.reportInfo}>
            {reportType === 'sales' ? (
              <>
                <ReportInfoRow icon="checkmark-circle" text={`${salesPersons.length} sales agents · ${periodLabel}`} />
                <ReportInfoRow icon="checkmark-circle" text="Individual leads, closures, conversion & missed follow-ups" />
                <ReportInfoRow icon="checkmark-circle" text="Top performers + areas needing attention" />
                <ReportInfoRow icon="checkmark-circle" text="AI recommendations for next review actions" />
              </>
            ) : (
              <>
                <ReportInfoRow icon="checkmark-circle" text="Meta Acc 1, 2, 3 + Google Ads breakdown" />
                <ReportInfoRow icon="checkmark-circle" text="Leads per account, conversions, CPL & estimated spend" />
                <ReportInfoRow icon="checkmark-circle" text="Best vs underperforming ad sources analysis" />
                <ReportInfoRow icon="checkmark-circle" text="AI budget & optimisation recommendations" />
              </>
            )}
          </View>

          {/* Generate button */}
          <TouchableOpacity
            style={[styles.generateBtn, reportGenerating && { opacity: 0.7 }]}
            onPress={generateReport}
            disabled={reportGenerating}
            activeOpacity={0.85}
          >
            {reportGenerating
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="sparkles" size={16} color={Colors.white} />}
            <Text style={styles.generateBtnText}>
              {reportGenerating ? 'Generating AI Report…' : `Generate ${reportType === 'sales' ? 'Sales' : 'Ad Account'} Report`}
            </Text>
          </TouchableOpacity>

          {/* Generated report output */}
          {reportText ? (
            <View style={styles.reportOutput}>
              <View style={styles.reportOutputHeader}>
                <View style={styles.reportOutputBadge}>
                  <Ionicons name="sparkles" size={12} color={Colors.primary} />
                  <Text style={styles.reportOutputBadgeText}>AI Generated</Text>
                </View>
                <Text style={styles.reportOutputPeriod}>{periodLabel}</Text>
              </View>

              <Text style={styles.reportOutputText}>{reportText}</Text>

              {/* Data table summary */}
              <View style={styles.reportTable}>
                <Text style={styles.reportTableTitle}>
                  {reportType === 'sales' ? 'Agent Summary Table' : 'Account Summary Table'}
                </Text>
                {reportType === 'sales' ? (
                  <>
                    <View style={[styles.reportTableRow, styles.reportTableHead]}>
                      {['Agent', 'Leads', 'Closed', 'Missed', 'Conv%'].map(h => (
                        <Text key={h} style={[styles.reportTableCell, styles.reportTableHeadCell]}>{h}</Text>
                      ))}
                    </View>
                    {salesPersons.map(sp => {
                      const s = agentStats[sp.uid];
                      if (!s) return null;
                      return (
                        <View key={sp.uid} style={styles.reportTableRow}>
                          <Text style={[styles.reportTableCell, { flex: 1.5, fontWeight: FontWeight.semibold }]} numberOfLines={1}>{sp.displayName.split(' ')[0]}</Text>
                          <Text style={styles.reportTableCell}>{s.totalLeads}</Text>
                          <Text style={[styles.reportTableCell, { color: Colors.success }]}>{s.closed}</Text>
                          <Text style={[styles.reportTableCell, { color: s.missed > 0 ? Colors.danger : Colors.gray400 }]}>{s.missed}</Text>
                          <Text style={[styles.reportTableCell, { color: Colors.primary, fontWeight: FontWeight.semibold }]}>{s.convRate}%</Text>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <>
                    <View style={[styles.reportTableRow, styles.reportTableHead]}>
                      {['Account', 'Leads', 'Closed', 'CPL'].map(h => (
                        <Text key={h} style={[styles.reportTableCell, styles.reportTableHeadCell]}>{h}</Text>
                      ))}
                    </View>
                    {[
                      { label: 'Meta Acc 1', acc: 1 as const, cpl: 150 },
                      { label: 'Meta Acc 2', acc: 2 as const, cpl: 150 },
                      { label: 'Meta Acc 3', acc: 3 as const, cpl: 150 },
                      { label: 'Google', acc: null, cpl: 200 },
                    ].map(({ label, acc, cpl }) => {
                      const count = acc !== null
                        ? filteredLeads.filter((l: Lead) => l.source === 'meta' && l.metaAccount === acc).length
                        : filteredLeads.filter((l: Lead) => l.source === 'google').length;
                      const closed = filteredLeads.filter((l: Lead) =>
                        (acc !== null ? l.source === 'meta' && l.metaAccount === acc : l.source === 'google') && l.status === 'closed_won'
                      ).length;
                      return (
                        <View key={label} style={styles.reportTableRow}>
                          <Text style={[styles.reportTableCell, { flex: 1.5, fontWeight: FontWeight.semibold }]}>{label}</Text>
                          <Text style={styles.reportTableCell}>{count}</Text>
                          <Text style={[styles.reportTableCell, { color: Colors.success }]}>{closed}</Text>
                          <Text style={[styles.reportTableCell, { color: Colors.primary }]}>₹{cpl}</Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>

              {/* Download PDF button */}
              <TouchableOpacity style={styles.downloadBtn} onPress={downloadPDF} activeOpacity={0.85}>
                <Ionicons name={Platform.OS === 'web' ? 'download-outline' : 'share-outline'} size={16} color={Colors.white} />
                <Text style={styles.downloadBtnText}>
                  {Platform.OS === 'web' ? 'Download as PDF' : 'Share Report'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

      </ScrollView>

      {/* Agent Picker Modal */}
      <Modal visible={pickerVisible} transparent animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerVisible(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.modalTitle}>Select Agent</Text>
          <TouchableOpacity
            style={[styles.pickerItem, !selectedAgent && styles.pickerItemActive]}
            onPress={() => { setSelectedAgent(null); setPickerVisible(false); }}
          >
            <Ionicons name="people-outline" size={16} color={!selectedAgent ? Colors.primary : Colors.gray500} />
            <Text style={[styles.pickerItemText, !selectedAgent && { color: Colors.primary, fontWeight: FontWeight.semibold }]}>All Agents</Text>
            {!selectedAgent && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
          </TouchableOpacity>
          <FlatList
            data={salesPersons}
            keyExtractor={sp => sp.uid}
            renderItem={({ item: sp }) => {
              const isSelected = selectedAgent?.uid === sp.uid;
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  onPress={() => { setSelectedAgent(sp); setPickerVisible(false); }}
                >
                  <View style={styles.pickerAvatar}>
                    <Text style={styles.pickerAvatarLetter}>{sp.displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pickerItemText, isSelected && { color: Colors.primary, fontWeight: FontWeight.semibold }]}>{sp.displayName}</Text>
                    {sp.region && <Text style={styles.pickerItemSub}>{sp.region}</Text>}
                  </View>
                  {isSelected && <Ionicons name="checkmark" size={16} color={Colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function ReportInfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
      <Ionicons name={icon as any} size={13} color={Colors.primary} style={{ marginTop: 1 }} />
      <Text style={{ fontSize: FontSize.xs, color: Colors.gray600, flex: 1, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

function AgentStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.agentStatItem}>
      <Text style={[styles.agentStatValue, { color }]}>{value}</Text>
      <Text style={styles.agentStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  header: { backgroundColor: Colors.navy, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  content: { padding: Spacing.base },

  periodRow: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: Radius.full, padding: 4, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.gray100 },
  periodBtn: { flex: 1, paddingVertical: Spacing.xs, borderRadius: Radius.full, alignItems: 'center' },
  periodBtnActive: { backgroundColor: Colors.navy },
  periodLabel: { fontSize: FontSize.sm, color: Colors.gray500, fontWeight: FontWeight.medium },
  periodLabelActive: { color: Colors.white },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  kpiCard: { flex: 1, minWidth: '45%', backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, alignItems: 'center', ...Shadow.sm },
  kpiIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  kpiValue: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.navy },
  kpiLabel: { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 2, fontWeight: FontWeight.medium },
  ctaBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 6, backgroundColor: Colors.primaryLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  ctaBadgeText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold },

  section: { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.base, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.gray100, ...Shadow.sm },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.navy },
  emptyText: { fontSize: FontSize.sm, color: Colors.gray400 },

  barItem: { marginBottom: Spacing.sm },
  barLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  sourceDot: { width: 8, height: 8, borderRadius: 4, marginRight: Spacing.xs },
  barLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.gray700 },
  barPct: { fontSize: FontSize.xs, color: Colors.gray400, marginRight: 6 },
  barCount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy, minWidth: 28, textAlign: 'right' },
  barTrack: { height: 8, backgroundColor: Colors.gray100, borderRadius: Radius.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.full },

  agentPicker: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Colors.primaryLight, paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: Radius.full, maxWidth: 140 },
  agentPickerText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold, flex: 1 },

  agentCard: { backgroundColor: Colors.gray50, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.gray100 },
  agentCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  agentAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  agentAvatarLetter: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary },
  agentName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy },
  agentRegion: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 1 },
  convBadge: { alignItems: 'center', backgroundColor: Colors.primaryLight, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.md },
  convBadgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },
  convBadgeSub: { fontSize: 9, color: Colors.primary, opacity: 0.7 },

  agentStats: { flexDirection: 'row', justifyContent: 'space-between' },
  agentStatItem: { alignItems: 'center', flex: 1 },
  agentStatValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  agentStatLabel: { fontSize: 9, color: Colors.gray400, marginTop: 1 },

  agentProgressRow: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: Spacing.sm, backgroundColor: Colors.gray100 },
  agentProgressSeg: { height: '100%' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: Spacing.base, maxHeight: '70%' },
  modalTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.navy, marginBottom: Spacing.md },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray50 },
  pickerItemActive: { backgroundColor: Colors.primaryLight + '60', marginHorizontal: -Spacing.base, paddingHorizontal: Spacing.base },
  pickerItemText: { fontSize: FontSize.sm, color: Colors.gray700, flex: 1 },
  pickerItemSub: { fontSize: FontSize.xs, color: Colors.gray400 },
  pickerAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  pickerAvatarLetter: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.primary },

  // ── Review Report styles ──
  reportHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.md },
  reportSubtitle: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 2 },
  reportToggle: { flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: Radius.lg, padding: 3, marginBottom: Spacing.md },
  reportToggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: Radius.md },
  reportToggleBtnActive: { backgroundColor: Colors.navy },
  reportToggleText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500 },
  reportInfo: { backgroundColor: Colors.primaryLight, borderRadius: Radius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 13 },
  generateBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  reportOutput: { marginTop: Spacing.md, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.primary + '30', overflow: 'hidden' },
  reportOutputHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.primaryLight, paddingHorizontal: Spacing.md, paddingVertical: 10 },
  reportOutputBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reportOutputBadgeText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },
  reportOutputPeriod: { fontSize: FontSize.xs, color: Colors.gray500 },
  reportOutputText: { fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 22, padding: Spacing.md },
  reportTable: { borderTopWidth: 1, borderTopColor: Colors.gray100, paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  reportTableTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, paddingVertical: Spacing.sm },
  reportTableRow: { flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: Colors.gray50 },
  reportTableHead: { backgroundColor: Colors.gray50, marginHorizontal: -Spacing.md, paddingHorizontal: Spacing.md },
  reportTableCell: { flex: 1, fontSize: FontSize.xs, color: Colors.gray700, textAlign: 'center' },
  reportTableHeadCell: { color: Colors.navy, fontWeight: FontWeight.semibold },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.navy, margin: Spacing.md, marginTop: Spacing.sm, borderRadius: Radius.lg, paddingVertical: 12 },
  downloadBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
});

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useCreateLead } from '@/hooks/useLeads';
import { parseLeadFile, bulkCreateLeads, RawLeadData, ParseLeadFileResult } from '@/services/leadsService';
import { useAuth } from '@/hooks/useAuth';
import { fetchSalesUsers } from '@/services/teamService';
import { User } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { LEAD_SOURCES } from '@/constants/theme';
import { LeadSource } from '@/types';
import { Ionicons } from '@expo/vector-icons';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().min(8, 'Enter a valid phone number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  source: z.enum(['meta', 'google', 'uploaded', 'whatsapp', 'referral', 'website', 'facebook', 'manual'] as const),
  budget: z.string().optional(),
  requirements: z.string().optional(),
  preferredLocation: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

type TabType = 'manual' | 'upload';

const SAMPLE_COLUMNS = [
  { key: 'name',  aliases: 'name, names, full name, client name' },
  { key: 'phone', aliases: 'phone, phones, mobile, contact, contacts' },
  { key: 'email', aliases: 'email, emails, mail' },
];

// Sources available when uploading a file
const UPLOAD_SOURCES: { key: LeadSource; label: string; icon: string; color: string }[] = [
  { key: 'uploaded', label: 'Uploaded',    icon: 'cloud-upload-outline', color: '#F59E0B' },
  { key: 'google',   label: 'Google Ads',  icon: 'logo-google',          color: '#EA4335' },
  { key: 'referral', label: 'Referral',    icon: 'people-outline',       color: '#8B5CF6' },
  { key: 'website',  label: 'Website',     icon: 'globe-outline',        color: '#3B82F6' },
  { key: 'manual',   label: 'Manual',      icon: 'create-outline',       color: '#64748B' },
];

export default function NewLeadScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { mutateAsync: createLead, isPending } = useCreateLead();
  const [activeTab, setActiveTab] = useState<TabType>('manual');
  const [selectedFile, setSelectedFile] = useState<{ name: string; rows: number } | null>(null);
  const [parseResult, setParseResult] = useState<ParseLeadFileResult | null>(null);
  const [parsedData, setParsedData] = useState<RawLeadData[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; batchId: string } | null>(null);
  const [uploadSource, setUploadSource] = useState<LeadSource>('uploaded');
  const [salesUsers, setSalesUsers] = useState<User[]>([]);
  const [selectedSalesUser, setSelectedSalesUser] = useState<User | null>(null);
  const [loadingSales, setLoadingSales] = useState(false);

  useEffect(() => {
    if (activeTab === 'upload') {
      loadSalesUsers();
    }
  }, [activeTab]);

  const loadSalesUsers = async () => {
    setLoadingSales(true);
    try {
      const users = await fetchSalesUsers();
      setSalesUsers(users);
    } catch (e) {
      console.error('Error loading sales users:', e);
    } finally {
      setLoadingSales(false);
    }
  };

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { source: 'manual' },
  });

  const selectedSource = watch('source');

  const onSubmit = async (data: FormData) => {
    try {
      const leadId = await createLead({
        name: data.name,
        phone: data.phone,
        email: data.email || undefined,
        source: data.source,
        budget: data.budget ? parseFloat(data.budget) : undefined,
        requirements: data.requirements || undefined,
        preferredLocation: data.preferredLocation || undefined,
        notes: data.notes || undefined,
      });
      Toast.show({ type: 'success', text1: 'Lead Created', text2: `${data.name} added successfully` });
      router.replace(`/(app)/leads/${leadId}`);
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create lead. Please try again.' });
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
               'text/csv', 'application/vnd.ms-excel',
               'application/octet-stream'],
        copyToCacheDirectory: true,
        base64: Platform.OS !== 'web', // base64 only on native; web uses blob URI
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];

      // ── Read file data ──────────────────────────────────────────────────────
      let fileData: string | ArrayBuffer;

      if (Platform.OS === 'web') {
        // On web, DocumentPicker gives a blob URI — fetch it as ArrayBuffer
        try {
          const resp = await fetch(file.uri);
          fileData = await resp.arrayBuffer();
        } catch {
          Alert.alert('Error', 'Could not read the selected file. Please try again.');
          return;
        }
      } else {
        // On native, use the base64 string directly
        fileData = file.base64 || '';
        if (!fileData) {
          Alert.alert('Error', 'Could not read file data. Please try again.');
          return;
        }
      }

      const parsed = parseLeadFile(fileData, file.name);
      setParseResult(parsed);

      if (parsed.leads.length === 0) {
        const headerInfo = parsed.detectedHeaders.length > 0
          ? '\n\nFound columns: ' + parsed.detectedHeaders.slice(0, 6).join(', ')
            + '\nRecognised: ' + (parsed.mappedHeaders.join(', ') || 'none')
          : '\n\nFile appears empty or unreadable.';
        Alert.alert(
          'No Valid Leads Found',
          'The file had ' + parsed.totalRows + ' rows but none matched the required columns.'
            + headerInfo + '\n\nRequired: name, phone (see help below)',
        );
        return;
      }

      setSelectedFile({ name: file.name, rows: parsed.leads.length });
      setParsedData(parsed.leads);
    } catch (error: any) {
      console.error('Pick document error:', error);
      Alert.alert('Error', 'Failed to read file: ' + (error?.message || String(error)));
    }
  };

  const handleImport = async () => {
    if (!parsedData || !user) return;
    if (!selectedSalesUser) {
      Alert.alert('Select Sales Person', 'Please select a sales person to assign these leads to.');
      return;
    }

    setIsImporting(true);
    setImportResult(null);
    try {
      const result = await bulkCreateLeads(
        parsedData,
        selectedSalesUser.uid,
        uploadSource,
        selectedSalesUser.displayName,
        user.uid,
        user.displayName,
      );

      setImportResult({ success: result.successCount, failed: result.failedCount, batchId: result.uploadBatchId });

      if (result.successCount > 0) {
        Toast.show({
          type: 'success',
          text1: `${result.successCount} leads imported`,
          text2: `Assigned to ${selectedSalesUser.displayName} · Source: ${uploadSource}`,
        });
        if (result.failedCount === 0) router.back();
      } else {
        Alert.alert(
          'Import Failed',
          `No leads could be imported.\n\nErrors:\n${result.errors.slice(0, 5).join('\n')}`,
        );
      }
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Import Error', text2: error?.message ?? 'Failed to import leads.' });
    } finally {
      setIsImporting(false);
    }
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setParsedData(null);
    setParseResult(null);
    setImportResult(null);
  };

  return (
    <View style={styles.screen}>
      <Header title="New Lead" showBack />
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'manual' && styles.tabActive]}
          onPress={() => setActiveTab('manual')}
        >
          <Ionicons name="create-outline" size={20} color={activeTab === 'manual' ? Colors.primary : Colors.gray400} />
          <Text style={[styles.tabText, activeTab === 'manual' && styles.tabTextActive]}>Manual Entry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upload' && styles.tabActive]}
          onPress={() => setActiveTab('upload')}
        >
          <Ionicons name="cloud-upload-outline" size={20} color={activeTab === 'upload' ? Colors.primary : Colors.gray400} />
          <Text style={[styles.tabText, activeTab === 'upload' && styles.tabTextActive]}>Upload File</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'manual' ? (
          <>
            <Text style={styles.sectionTitle}>Contact Information</Text>

            <Controller
              control={control}
              name="name"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Full Name" placeholder="Ahmed Al Mansoori" value={value} onChangeText={onChange} onBlur={onBlur} leftIcon="person-outline" error={errors.name?.message} required />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Phone Number" placeholder="+971 50 123 4567" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="phone-pad" leftIcon="call-outline" error={errors.phone?.message} required />
              )}
            />
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Email Address" placeholder="ahmed@example.com" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" error={errors.email?.message} />
              )}
            />

            <Text style={styles.sectionTitle}>Lead Source</Text>
            <View style={styles.sourceGrid}>
              {LEAD_SOURCES.map((src) => (
                <TouchableOpacity
                  key={src.key}
                  onPress={() => setValue('source', src.key)}
                  style={[
                    styles.sourceChip,
                    selectedSource === src.key && [styles.sourceChipActive, { borderColor: src.color }],
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons name={src.icon as any} size={16} color={selectedSource === src.key ? src.color : Colors.gray400} />
                  <Text style={[styles.sourceLabel, selectedSource === src.key && { color: src.color, fontWeight: FontWeight.semibold }]}>
                    {src.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.source && <Text style={styles.errMsg}>{errors.source.message}</Text>}

            <Text style={styles.sectionTitle}>Requirements</Text>
            <Controller
              control={control}
              name="budget"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Budget (₹)" placeholder="e.g. 5000000" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="numeric" leftIcon="cash-outline" />
              )}
            />
            <Controller
              control={control}
              name="preferredLocation"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Preferred Location" placeholder="e.g. Dubai Marina, JVC" value={value} onChangeText={onChange} onBlur={onBlur} leftIcon="location-outline" />
              )}
            />
            <Controller
              control={control}
              name="requirements"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Requirements" placeholder="e.g. 2BR apartment, pool, near metro" value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={3} leftIcon="list-outline" />
              )}
            />
            <Controller
              control={control}
              name="notes"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Notes" placeholder="Any additional notes..." value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={3} leftIcon="document-text-outline" />
              )}
            />

            <Button title="Create Lead" onPress={handleSubmit(onSubmit)} loading={isPending} fullWidth size="lg" icon="checkmark-outline" style={styles.submitBtn} />
          </>
        ) : (
          <>
            {/* Step 1: Assign to sales person — shown immediately */}
            <Text style={styles.sectionTitle}>Step 1 — Assign to Sales Person</Text>
            <Text style={styles.fieldSubtitle}>These leads will only be visible to the selected person</Text>
            {loadingSales ? (
              <Text style={styles.loadingText}>Loading sales team...</Text>
            ) : salesUsers.length === 0 ? (
              <Text style={styles.noSalesText}>No active sales team members found</Text>
            ) : (
              <View style={styles.salesGrid}>
                {salesUsers.map((sales) => (
                  <TouchableOpacity
                    key={sales.uid}
                    onPress={() => setSelectedSalesUser(sales)}
                    style={[styles.salesChip, selectedSalesUser?.uid === sales.uid && styles.salesChipActive]}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="person" size={16} color={selectedSalesUser?.uid === sales.uid ? Colors.primary : Colors.gray400} />
                    <Text style={[styles.salesLabel, selectedSalesUser?.uid === sales.uid && styles.salesLabelActive]}>
                      {sales.displayName}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Step 2: Lead source */}
            <Text style={styles.sectionTitle}>Step 2 — Lead Source</Text>
            <Text style={styles.fieldSubtitle}>Where did these leads come from?</Text>
            <View style={styles.sourceGrid}>
              {UPLOAD_SOURCES.map((src) => (
                <TouchableOpacity
                  key={src.key}
                  onPress={() => setUploadSource(src.key)}
                  style={[
                    styles.sourceChip,
                    uploadSource === src.key && [styles.sourceChipActive, { borderColor: src.color }],
                  ]}
                  activeOpacity={0.8}
                >
                  <Ionicons name={src.icon as any} size={14} color={uploadSource === src.key ? src.color : Colors.gray400} />
                  <Text style={[styles.sourceLabel, uploadSource === src.key && { color: src.color, fontWeight: FontWeight.semibold }]}>
                    {src.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Step 3: Upload the file */}
            <Text style={styles.sectionTitle}>Step 3 — Upload File</Text>
            <View style={styles.uploadSection}>
              <Ionicons name="cloud-upload-outline" size={48} color={Colors.gray300} />
              <Text style={styles.uploadTitle}>Excel or CSV</Text>
              <Text style={styles.uploadSubtitle}>Supports .xlsx, .xls, .csv files</Text>
              <Button title="Select File" onPress={pickDocument} variant="outline" icon="folder-open-outline" style={styles.selectBtn} />
            </View>

            {/* Selected file info */}
            {selectedFile && (
              <View style={styles.fileInfo}>
                <Ionicons name="document-text" size={24} color={Colors.primary} />
                <View style={styles.fileDetails}>
                  <Text style={styles.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                  <Text style={styles.fileMeta}>{selectedFile.rows} leads found</Text>
                </View>
                <TouchableOpacity onPress={resetUpload}>
                  <Ionicons name="close-circle" size={24} color={Colors.gray400} />
                </TouchableOpacity>
              </View>
            )}

            {/* Preview + Import (only after successful parse) */}
            {parsedData && parsedData.length > 0 && (
              <>
                <View style={styles.previewSection}>
                  <Text style={styles.previewTitle}>Preview — first {Math.min(3, parsedData.length)} of {parsedData.length} leads</Text>
                  {parsedData.slice(0, 3).map((row, index) => (
                    <View key={index} style={styles.previewRow}>
                      <Text style={styles.previewIndex}>{'#' + (index + 1)}</Text>
                      <Text style={styles.previewText} numberOfLines={1}>{row.name ?? 'Unnamed'} — {row.phone ?? 'No phone'}</Text>
                    </View>
                  ))}
                  {parsedData.length > 3 && <Text style={styles.moreText}>{'+ ' + (parsedData.length - 3) + ' more leads'}</Text>}
                </View>

                {importResult && importResult.failed > 0 && (
                  <View style={styles.resultBanner}>
                    <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                    <Text style={styles.resultText}>
                      {importResult.success + ' imported · ' + importResult.failed + ' skipped (invalid name/phone)'}
                    </Text>
                    <TouchableOpacity onPress={router.back} style={styles.resultDone}>
                      <Text style={styles.resultDoneText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <Button
                  title={isImporting ? 'Importing...' : 'Import ' + parsedData.length + ' Leads'}
                  onPress={handleImport}
                  loading={isImporting}
                  fullWidth
                  size="lg"
                  icon="cloud-done-outline"
                  style={styles.submitBtn}
                />
              </>
            )}

            {/* Show detected vs recognised headers when parse failed */}
            {parseResult && parseResult.leads.length === 0 && parseResult.detectedHeaders.length > 0 && (
              <View style={styles.warnSection}>
                <Ionicons name="warning-outline" size={16} color={Colors.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.warnTitle}>Could not map any columns</Text>
                  <Text style={styles.warnText}>
                    {'File columns: ' + parseResult.detectedHeaders.join(', ')}
                  </Text>
                  <Text style={styles.warnText}>
                    {parseResult.mappedHeaders.length > 0
                      ? 'Recognised: ' + parseResult.mappedHeaders.join(', ')
                      : 'None recognised — rename your column headers to match below'}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.helpSection}>
              <Text style={styles.helpTitle}>Supported Column Names (case-insensitive)</Text>
              {SAMPLE_COLUMNS.map((col) => (
                <Text key={col.key} style={styles.helpItem}>
                  <Text style={styles.helpKey}>{col.key}:</Text>{' ' + col.aliases}
                </Text>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: Spacing.base },
  tabBar: { flexDirection: 'row', padding: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  tabActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.sm, color: Colors.gray400 },
  tabTextActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy, marginTop: Spacing.base, marginBottom: Spacing.md },
  sourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  sourceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.white, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray200 },
  sourceChipActive: { backgroundColor: Colors.white },
  sourceLabel: { fontSize: FontSize.sm, color: Colors.gray500 },
  sourceLabelActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  fieldSubtitle: { fontSize: FontSize.sm, color: Colors.gray500, marginTop: -Spacing.sm, marginBottom: Spacing.sm },
  loadingText: { fontSize: FontSize.sm, color: Colors.gray500, textAlign: 'center', padding: Spacing.md },
  salesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  noSalesText: { fontSize: FontSize.sm, color: Colors.gray500, textAlign: 'center', padding: Spacing.md },
  salesChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.white, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.gray200 },
  salesChipActive: { backgroundColor: Colors.white, borderColor: Colors.primary },
  salesLabel: { fontSize: FontSize.sm, color: Colors.gray500 },
  salesLabelActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  errMsg: { fontSize: FontSize.xs, color: Colors.danger, marginBottom: Spacing.sm, marginTop: -Spacing.xs },
  submitBtn: { marginTop: Spacing.lg },
  uploadSection: { alignItems: 'center', paddingVertical: Spacing.xl, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: Colors.gray200, marginBottom: Spacing.base },
  uploadTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.navy, marginTop: Spacing.md },
  uploadSubtitle: { fontSize: FontSize.sm, color: Colors.gray500, marginTop: Spacing.xs },
  selectBtn: { marginTop: Spacing.base },
  fileInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.white, padding: Spacing.base, borderRadius: Radius.md, marginBottom: Spacing.base },
  fileDetails: { flex: 1 },
  fileName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.navy },
  fileMeta: { fontSize: FontSize.sm, color: Colors.gray500, marginTop: 2 },
  previewSection: { backgroundColor: Colors.white, borderRadius: Radius.md, overflow: 'hidden', marginBottom: Spacing.base },
  previewTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy, padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  previewRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  previewIndex: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray400, width: 30 },
  previewText: { flex: 1, fontSize: FontSize.sm, color: Colors.navy },
  moreText: { padding: Spacing.md, fontSize: FontSize.sm, color: Colors.gray500, textAlign: 'center' },
  warnSection: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '50' },
  warnTitle:   { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy, marginBottom: 3 },
  warnText:    { fontSize: FontSize.xs, color: Colors.gray600, lineHeight: 16 },
  helpSection: { marginTop: Spacing.lg, padding: Spacing.base, backgroundColor: Colors.gray100, borderRadius: Radius.md },
  helpTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy, marginBottom: Spacing.sm },
  helpItem: { fontSize: FontSize.xs, color: Colors.gray600, marginBottom: 2 },
  helpKey: { fontWeight: FontWeight.semibold, color: Colors.primary },
  resultBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warningLight, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.warning + '40' },
  resultText: { flex: 1, fontSize: FontSize.sm, color: Colors.gray700 },
  resultDone: { backgroundColor: Colors.warning, paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full },
  resultDoneText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.white },
});

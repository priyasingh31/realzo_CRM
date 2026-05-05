import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { LeadStatus, DealStage, LeadSource, PropertyStatus } from '@/types';

interface BadgeProps {
  label: string;
  color?: string;
  bgColor?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export function Badge({ label, color = Colors.white, bgColor = Colors.primary, size = 'md', style }: BadgeProps) {
  return (
    <View style={[styles.badge, size === 'sm' && styles.sm, { backgroundColor: bgColor }, style]}>
      <Text style={[styles.text, size === 'sm' && styles.textSm, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Semantic Badges ──────────────────────────────────────────────────────────
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const config: Record<LeadStatus, { label: string; bg: string; color: string }> = {
    new:                  { label: 'New',            bg: Colors.infoLight,    color: Colors.info },
    assigned:             { label: 'Assigned',        bg: '#EDE9FE',           color: '#7C3AED' },
    contacted:            { label: 'Contacted',       bg: '#DBEAFE',           color: '#2563EB' },
    interested:           { label: 'Interested',      bg: Colors.successLight, color: Colors.success },
    not_interested:       { label: 'Not Interested',  bg: Colors.dangerLight,  color: Colors.danger },
    follow_up:            { label: 'Follow Up',       bg: Colors.warningLight, color: Colors.warning },
    site_visit_scheduled: { label: 'Visit Scheduled', bg: '#CFFAFE',           color: '#0891B2' },
    site_visit_done:      { label: 'Visit Done',      bg: '#CCFBF1',           color: '#0D9488' },
    negotiation:          { label: 'Negotiation',     bg: '#FFEDD5',           color: '#EA580C' },
    closed_won:           { label: 'Closed Won',      bg: '#DCFCE7',           color: '#16A34A' },
    dead:                 { label: 'Dead',            bg: Colors.gray100,      color: Colors.gray500 },
    invalid:              { label: 'Invalid',         bg: '#F9FAFB',           color: Colors.gray400 },
    qualified:            { label: 'Qualified',       bg: Colors.primaryLight, color: Colors.primary },
  };
  const { label, bg, color } = config[status] ?? config.new;
  return <Badge label={label} bgColor={bg} color={color} size="sm" />;
}

export function DealStageBadge({ stage }: { stage: DealStage }) {
  const config: Record<DealStage, { label: string; bg: string; color: string }> = {
    new: { label: 'New', bg: Colors.infoLight, color: Colors.info },
    contacted: { label: 'Contacted', bg: '#EDE9FE', color: '#7C3AED' },
    site_visit: { label: 'Site Visit', bg: Colors.warningLight, color: Colors.warning },
    negotiation: { label: 'Negotiation', bg: '#FCE7F3', color: '#DB2777' },
    closed_won: { label: 'Closed Won', bg: Colors.successLight, color: Colors.success },
    closed_lost: { label: 'Closed Lost', bg: Colors.dangerLight, color: Colors.danger },
  };
  const { label, bg, color } = config[stage] ?? config.new;
  return <Badge label={label} bgColor={bg} color={color} size="sm" />;
}

export function LeadSourceBadge({ source }: { source: LeadSource }) {
  const config: Record<LeadSource, { label: string; bg: string; color: string }> = {
    meta:     { label: 'Meta',     bg: '#DBEAFE', color: '#1877F2' },
    google:   { label: 'Google',   bg: Colors.dangerLight, color: Colors.danger },
    whatsapp: { label: 'WhatsApp', bg: '#DCFCE7', color: '#25D366' },
    uploaded: { label: 'Uploaded', bg: Colors.warningLight, color: Colors.warning },
    referral: { label: 'Referral', bg: '#EDE9FE', color: '#7C3AED' },
    website:  { label: 'Website',  bg: Colors.infoLight,   color: Colors.info },
    facebook: { label: 'Facebook', bg: '#DBEAFE', color: '#1877F2' },
    manual:   { label: 'Manual',   bg: Colors.gray100,     color: Colors.gray600 },
  };
  const { label, bg, color } = config[source] ?? { label: source, bg: Colors.gray100, color: Colors.gray600 };
  return <Badge label={label} bgColor={bg} color={color} size="sm" />;
}

export function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  const config: Record<PropertyStatus, { label: string; bg: string; color: string }> = {
    available: { label: 'Available', bg: Colors.successLight, color: Colors.success },
    under_offer: { label: 'Under Offer', bg: Colors.warningLight, color: Colors.warning },
    sold: { label: 'Sold', bg: Colors.dangerLight, color: Colors.danger },
    reserved: { label: 'Reserved', bg: '#EDE9FE', color: '#7C3AED' },
  };
  const { label, bg, color } = config[status] ?? config.available;
  return <Badge label={label} bgColor={bg} color={color} size="sm" />;
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    alignSelf: 'flex-start',
  },
  sm: { paddingHorizontal: Spacing.xs + 2, paddingVertical: 2 },
  text: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },
  textSm: { fontSize: FontSize.xs },
});

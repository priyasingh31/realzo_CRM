import { Platform } from 'react-native';
import { Colors } from './colors';

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  '2xl': 28,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,
} as const;

export const FontWeight = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
};

export const Shadow = {
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
    android: { elevation: 2 },
    web: { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
    default: { elevation: 2 },
  }),
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
    android: { elevation: 4 },
    web: { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
    default: { elevation: 4 },
  }),
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16 },
    android: { elevation: 8 },
    web: { boxShadow: '0 4px 16px rgba(0,0,0,0.12)' },
    default: { elevation: 8 },
  }),
} as const;

export const DEAL_STAGES = [
  { key: 'new', label: 'New', color: Colors.stages.new, icon: 'star-outline' },
  { key: 'contacted', label: 'Contacted', color: Colors.stages.contacted, icon: 'call-outline' },
  { key: 'site_visit', label: 'Site Visit', color: Colors.stages.site_visit, icon: 'location-outline' },
  { key: 'negotiation', label: 'Negotiation', color: Colors.stages.negotiation, icon: 'chatbubbles-outline' },
  { key: 'closed_won', label: 'Closed Won', color: Colors.stages.closed_won, icon: 'checkmark-circle-outline' },
  { key: 'closed_lost', label: 'Closed Lost', color: Colors.stages.closed_lost, icon: 'close-circle-outline' },
] as const;

export const LEAD_SOURCES = [
  { key: 'meta',     label: 'Meta Ads',    color: Colors.sources.meta,     icon: 'logo-facebook' },
  { key: 'google',   label: 'Google Ads',  color: Colors.sources.google,   icon: 'logo-google' },
  { key: 'whatsapp', label: 'WhatsApp',    color: Colors.sources.whatsapp, icon: 'logo-whatsapp' },
  { key: 'uploaded', label: 'Uploaded',    color: Colors.sources.uploaded, icon: 'cloud-upload-outline' },
  { key: 'referral', label: 'Referral',    color: Colors.sources.referral, icon: 'people-outline' },
  { key: 'website',  label: 'Website',     color: Colors.sources.website,  icon: 'globe-outline' },
  { key: 'manual',   label: 'Manual',      color: Colors.sources.manual,   icon: 'create-outline' },
  { key: 'facebook', label: 'Facebook',    color: Colors.sources.facebook, icon: 'logo-facebook' },
] as const;

export const PROPERTY_TYPES = [
  { key: 'apartment', label: 'Apartment', icon: 'business-outline' },
  { key: 'villa', label: 'Villa', icon: 'home-outline' },
  { key: 'townhouse', label: 'Townhouse', icon: 'home-outline' },
  { key: 'plot', label: 'Plot', icon: 'map-outline' },
  { key: 'commercial', label: 'Commercial', icon: 'storefront-outline' },
  { key: 'office', label: 'Office', icon: 'briefcase-outline' },
] as const;

export const AI_SCORE_COLORS = {
  high: Colors.success,    // 8-10
  medium: Colors.warning,  // 5-7
  low: Colors.danger,      // 1-4
} as const;

export const getAIScoreColor = (score: number) => {
  if (score >= 8) return AI_SCORE_COLORS.high;
  if (score >= 5) return AI_SCORE_COLORS.medium;
  return AI_SCORE_COLORS.low;
};

export const formatCurrency = (amount: number, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

export const SCREEN_PADDING = Spacing.base;
export const HEADER_HEIGHT = 56;
export const TAB_BAR_HEIGHT = 60;

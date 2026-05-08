// Relazo CRM — Brand Colors
// Primary: Dark Navy + Teal (matching PDF report branding)

export const Colors = {
  // Brand
  primary: '#1A9B6C',       // Teal green — CTAs, active states
  primaryDark: '#147A54',   // Darker teal — pressed states
  primaryLight: '#E8F8F2',  // Light teal — backgrounds

  // Navy (main background/dark theme base)
  navy: '#0D1B2A',
  navyMid: '#1A2E42',
  navyLight: '#243B53',

  // Accent
  accent: '#3D7EBF',        // Steel blue — highlights
  accentLight: '#EBF3FB',

  // Semantic
  success: '#22C55E',
  successLight: '#DCFCE7',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  info: '#3B82F6',
  infoLight: '#DBEAFE',

  // Neutral
  white: '#FFFFFF',
  gray50: '#F8FAFC',
  gray100: '#F1F5F9',
  gray200: '#E2E8F0',
  gray300: '#CBD5E1',
  gray400: '#94A3B8',
  gray500: '#64748B',
  gray600: '#475569',
  gray700: '#334155',
  gray800: '#1E293B',
  gray900: '#0F172A',
  black: '#000000',

  // Pipeline Stage Colors
  stages: {
    new: '#3B82F6',
    contacted: '#8B5CF6',
    site_visit: '#F59E0B',
    negotiation: '#EC4899',
    Booked: '#22C55E',
    closed_lost: '#EF4444',
  },

  // Lead Source Colors
  sources: {
    meta:     '#1877F2',
    facebook: '#1877F2',
    google:   '#EA4335',
    whatsapp: '#25D366',
    uploaded: '#F59E0B',
    manual:   '#64748B',
    referral: '#8B5CF6',
    website:  '#3B82F6',
  },

  // Status Colors
  leadStatus: {
    new: '#3B82F6',
    contacted: '#8B5CF6',
    qualified: '#22C55E',
    unqualified: '#EF4444',
    converted: '#1A9B6C',
  },

  propertyStatus: {
    available: '#22C55E',
    under_offer: '#F59E0B',
    sold: '#EF4444',
    reserved: '#8B5CF6',
  },

  // Transparent overlays
  overlay: 'rgba(13, 27, 42, 0.6)',
  overlayLight: 'rgba(13, 27, 42, 0.3)',

  // Tab bar
  tabBar: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabActive: '#1A9B6C',
  tabInactive: '#94A3B8',
} as const;

export type ColorKey = keyof typeof Colors;

// ─── Roles ───────────────────────────────────────────────────────────────────
export type UserRole = 'admin' | 'manager' | 'mis' | 'sales';

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  photoURL?: string;
  phone?: string;
  region?: string;
  managerId?: string;
  projectIds?: string[];
  assignedLeads?: number;
  isActive?: boolean;
  pushToken?: string;
  createdAt: string;
  lastActive?: string;
  updatedAt?: string;
}

// ─── Project ─────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  location: string;
  type: PropertyType;
  priceMin?: number;
  priceMax?: number;
  metaPageId?: string;
  metaAccount?: 1 | 2 | 3;
  campaignIds?: string[];          // Meta campaign IDs linked to this project
  campaignNames?: string[];        // Display names matching campaignIds by index
  salesPersonIds: string[];
  salesPersonNames?: string[];     // Display names matching salesPersonIds by index
  roundRobinIndex: number;
  managerId?: string;
  managerName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

// ─── Lead ────────────────────────────────────────────────────────────────────
export type LeadSource = 'meta' | 'google' | 'uploaded' | 'whatsapp' | 'referral' | 'website' | 'facebook' | 'manual';

export type LeadStatus =
  | 'new'
  | 'assigned'
  | 'contacted'
  | 'interested'
  | 'not_interested'
  | 'follow_up'
  | 'site_visit_scheduled'
  | 'site_visit_done'
  | 'negotiation'
  | 'Booked'
  | 'EOICustomer'
  | 'invalid'
  | 'qualified'
  | 'rnr'
  | 'switch_off';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email?: string;
  jobTitle?: string;
  source: LeadSource;
  status: LeadStatus;
  projectId?: string;
  projectName?: string;
  assignedTo?: string;
  assignedToName?: string;
  managerId?: string;
  managerName?: string;
  respondedAt?: string | null;
  respondedBy?: string;
  budget?: number;
  requirements?: string;
  preferredLocation?: string;
  location?: string;
  aiScore?: number;
  aiScoreReason?: string;
  tags?: string[];
  metaLeadId?: string;
  metaFormId?: string;
  metaPageId?: string;
  metaAccount?: 1 | 2 | 3;
  metaFields?: Record<string, string>;
  metaAdId?: string;
  metaAdName?: string;
  metaCampaignId?: string;
  metaCampaignName?: string;
  metaAdsetName?: string;
  metaPlatform?: string;
  followUpDate?: string | null;
  visitDate?: string | null;
  closureValue?: number;
  closureDate?: string;
  notes?: string;
  assignmentNote?: string | null;
  createdAt: string;
  updatedAt: string;
  lastContactedAt?: string | null;
}

export interface LeadComment {
  id: string;
  leadId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  text: string;
  createdAt: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  type: 'call' | 'whatsapp' | 'email' | 'note' | 'site_visit' | 'status_change' | 'assigned' | 'escalation';
  description: string;
  performedBy: string;
  performedByName?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ─── Deal ────────────────────────────────────────────────────────────────────
export type DealStage = 'new' | 'contacted' | 'site_visit' | 'negotiation' | 'Booked' | 'closed_lost';

export interface Deal {
  id: string;
  title: string;
  leadId: string;
  leadName?: string;
  propertyId?: string;
  propertyName?: string;
  projectId?: string;
  projectName?: string;
  stage: DealStage;
  value: number;
  probability: number;
  assignedAgent: string;
  assignedAgentName?: string;
  managerId?: string;
  expectedCloseDate?: string;
  closedAt?: string;
  notes?: string;
  stageHistory?: Array<{ stage: DealStage; changedAt: string; changedBy: string }>;
  createdAt: string;
  updatedAt: string;
}

// ─── Property ────────────────────────────────────────────────────────────────
export type PropertyType = 'apartment' | 'villa' | 'townhouse' | 'office' | 'plot' | 'penthouse' | 'commercial';
export type PropertyStatus = 'available' | 'reserved' | 'sold' | 'under_offer';

export interface Property {
  id: string;
  title: string;
  type: PropertyType;
  status: PropertyStatus;
  price: number;
  location: string;
  projectId?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  description?: string;
  amenities?: string[];
  images?: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export type NotificationType =
  | 'new_lead'
  | 'lead_assigned'
  | 'lead_escalation'
  | 'follow_up'
  | 'deal_update'
  | 'visit_reminder'
  | 'mention'
  | 'status_change';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  leadId?: string;
  dealId?: string;
  assignedAgent?: string | null;
  read: boolean;
  createdAt: string;
}

// ─── Dashboard Metrics ────────────────────────────────────────────────────────
export interface SalesDashboardMetrics {
  myLeadsToday: number;
  pendingFollowUps: number;
  todayVisits: number;
  missedFollowUps: number;
  totalAssigned: number;
  closedThisMonth: number;
  totalRevenue: number;
}

export interface AdminDashboardMetrics {
  totalLeads: number;
  leadsToday: number;
  todayFollowUps: number;
  todayVisits: number;
  missedFollowUps: number;
  totalClosed: number;
  totalRevenue: number;
  roi: number;
  conversionRate: number;
  cpl: number;
  leadsBySource: Partial<Record<LeadSource, number>>;
  leadsByStatus: Partial<Record<LeadStatus, number>>;
  metaAccount1: number;
  metaAccount2: number;
  metaAccount3: number;
}

export interface AgentPerformance {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  region?: string;
  managerId?: string;
  totalLeads: number;
  leadsFromMeta: number;
  leadsFromGoogle: number;
  leadsFromUploaded: number;
  interested: number;
  notInterested: number;
  EOICustomer: number;
  invalid: number;
  siteVisits: number;
  closures: number;
  revenue: number;
  responseRate: number;
  lastActive?: string;
}

// ─── Forms ───────────────────────────────────────────────────────────────────
export interface LoginForm { email: string; password: string; }

export interface CreateLeadForm {
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  projectId?: string;
  budget?: number;
  requirements?: string;
  location?: string;
  notes?: string;
}

export interface CreateUserForm {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  region?: string;
  managerId?: string;
}

export interface AISuggestion {
  type: 'reply' | 'score' | 'match' | 'insight' | 'followup' | 'lead_score' | 'property_match' | 'call_summary' | 'follow_up' | 'pipeline_insight';
  content: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  generatedAt?: string;
}

// ─── Form Data ────────────────────────────────────────────────────────────────
export interface LeadFormData {
  name: string;
  phone: string;
  email?: string;
  source: LeadSource;
  projectId?: string;
  budget?: number;
  requirements?: string;
  preferredLocation?: string;
  notes?: string;
}

export interface DealFormData {
  title: string;
  leadId: string;
  propertyId?: string;
  projectId?: string;
  stage: DealStage;
  value: number;
  probability: number;
  assignedAgent: string;
  expectedCloseDate?: string;
  notes?: string;
}

export interface PropertyFormData {
  title: string;
  type: PropertyType;
  status: PropertyStatus;
  price: number;
  location: string;
  projectId?: string;
  bedrooms?: number;
  bathrooms?: number;
  area?: number;
  description?: string;
  amenities?: string[];
  images?: string[];
}

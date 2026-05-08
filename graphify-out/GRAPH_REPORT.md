# Graph Report - .  (2026-04-24)

## Corpus Check
- 69 files · ~61,534 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 313 nodes · 411 edges · 47 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Brand Assets & Icons|Brand Assets & Icons]]
- [[_COMMUNITY_Lead Creation Flow|Lead Creation Flow]]
- [[_COMMUNITY_Cloud Functions & Round Robin|Cloud Functions & Round Robin]]
- [[_COMMUNITY_Meta Sync & App Layout|Meta Sync & App Layout]]
- [[_COMMUNITY_Lead Detail & AI Score|Lead Detail & AI Score]]
- [[_COMMUNITY_Admin Dashboard & Analytics|Admin Dashboard & Analytics]]
- [[_COMMUNITY_Settings & Meta Auth|Settings & Meta Auth]]
- [[_COMMUNITY_Notifications & Copy Lead|Notifications & Copy Lead]]
- [[_COMMUNITY_Gemini AI Service|Gemini AI Service]]
- [[_COMMUNITY_Lead Hooks & Query Keys|Lead Hooks & Query Keys]]
- [[_COMMUNITY_Auth & User Management|Auth & User Management]]
- [[_COMMUNITY_Project Settings CRUD|Project Settings CRUD]]
- [[_COMMUNITY_Deal Service|Deal Service]]
- [[_COMMUNITY_Push Notification Service|Push Notification Service]]
- [[_COMMUNITY_Deal Hooks|Deal Hooks]]
- [[_COMMUNITY_Property Hooks|Property Hooks]]
- [[_COMMUNITY_Badge Components|Badge Components]]
- [[_COMMUNITY_Team Service|Team Service]]
- [[_COMMUNITY_Auth Role Hooks|Auth Role Hooks]]
- [[_COMMUNITY_Seed Data Scripts|Seed Data Scripts]]
- [[_COMMUNITY_Email Service|Email Service]]
- [[_COMMUNITY_User Admin Screen|User Admin Screen]]
- [[_COMMUNITY_Theme & Formatting|Theme & Formatting]]
- [[_COMMUNITY_Auth Hook|Auth Hook]]
- [[_COMMUNITY_Pipeline Index|Pipeline Index]]
- [[_COMMUNITY_Foreground Sync Handler|Foreground Sync Handler]]
- [[_COMMUNITY_Pipeline Stage Move|Pipeline Stage Move]]
- [[_COMMUNITY_Manager Detail Screen|Manager Detail Screen]]
- [[_COMMUNITY_Auth Layout|Auth Layout]]
- [[_COMMUNITY_Lead Card Component|Lead Card Component]]
- [[_COMMUNITY_Card UI Component|Card UI Component]]
- [[_COMMUNITY_Input UI Component|Input UI Component]]
- [[_COMMUNITY_Responsive Utilities|Responsive Utilities]]
- [[_COMMUNITY_Babel Config|Babel Config]]
- [[_COMMUNITY_Expo Env Types|Expo Env Types]]
- [[_COMMUNITY_Metro Config|Metro Config]]
- [[_COMMUNITY_Properties Index|Properties Index]]
- [[_COMMUNITY_Property Detail|Property Detail]]
- [[_COMMUNITY_Metric Card|Metric Card]]
- [[_COMMUNITY_Deal Card|Deal Card]]
- [[_COMMUNITY_Property Card|Property Card]]
- [[_COMMUNITY_Button Component|Button Component]]
- [[_COMMUNITY_Header Component|Header Component]]
- [[_COMMUNITY_Firebase Config|Firebase Config]]
- [[_COMMUNITY_Color Constants|Color Constants]]
- [[_COMMUNITY_App Store|App Store]]
- [[_COMMUNITY_Types Index|Types Index]]

## God Nodes (most connected - your core abstractions)
1. `Relazo CRM â€” Real Estate CRM App` - 26 edges
2. `processMetaAccount()` - 11 edges
3. `syncConnectedPages()` - 10 edges
4. `callGemini()` - 9 edges
5. `syncMetaAccount()` - 9 edges
6. `load()` - 8 edges
7. `syncOneAccount()` - 8 edges
8. `saveLead()` - 7 edges
9. `sendPushBatch()` - 6 edges
10. `getAdminManagerTokens()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Splash Screen (solid brand green #1A9B6C background)` --conceptually_related_to--> `Relazo CRM â€” Real Estate CRM App`  [INFERRED]
  assets/splash.png → README.md
- `Android Notification Icon (solid brand green #1A9B6C)` --conceptually_related_to--> `Relazo CRM â€” Real Estate CRM App`  [INFERRED]
  assets/notification-Fav.png → README.md
- `Splash Screen (solid brand green #1A9B6C background)` --conceptually_related_to--> `Brand Primary Color #1A9B6C (CTAs, buttons, active states)`  [INFERRED]
  assets/splash.png → README.md
- `Android Notification Icon (solid brand green #1A9B6C)` --conceptually_related_to--> `Brand Primary Color #1A9B6C (CTAs, buttons, active states)`  [INFERRED]
  assets/notification-Fav.png → README.md
- `Relazo App Icon (solid brand green #1A9B6C)` --conceptually_related_to--> `Relazo CRM â€” Real Estate CRM App`  [INFERRED]
  assets/Fav.png → README.md

## Communities

### Community 0 - "Brand Assets & Icons"
Cohesion: 0.1
Nodes (33): Android Adaptive Icon (solid brand green #1A9B6C foreground layer), Relazo App Icon (solid brand green #1A9B6C), Web Favicon (solid brand green #1A9B6C), Android Notification Icon (solid brand green #1A9B6C), Splash Screen (solid brand green #1A9B6C background), AI Lead Scoring (0-100, auto on lead creation), AI Pipeline Insights (Reports â†’ Generate button), AI Property Matching (Lead detail â†’ Match button) (+25 more)

### Community 1 - "Lead Creation Flow"
Cohesion: 0.09
Nodes (9): createLead(), getLead(), toLead(), handleSubmit(), onSubmit(), addPropertyImage(), createProperty(), getProperty() (+1 more)

### Community 2 - "Cloud Functions & Round Robin"
Cohesion: 0.31
Nodes (18): assignRoundRobin(), escalateLead(), fetchForms(), fetchLeadsFromForm(), getAdminManagerTokens(), getAllUserTokens(), getLastSync(), getPageToken() (+10 more)

### Community 3 - "Meta Sync & App Layout"
Cohesion: 0.18
Nodes (15): triggerBackgroundSync(), fetchLeadForms(), fetchLeadsFromForm(), fullSyncAllMetaAccounts(), getLastSyncTime(), getPageToken(), leadExists(), parseFields() (+7 more)

### Community 4 - "Lead Detail & AI Score"
Cohesion: 0.18
Nodes (11): handleAIScore(), handleWhatsApp(), formatPhoneForWhatsApp(), getAccount(), getAccountsSummary(), getActiveAccount(), getWhatsAppDeepLink(), sendWhatsAppTemplate() (+3 more)

### Community 5 - "Admin Dashboard & Analytics"
Cohesion: 0.17
Nodes (10): load(), fetchWithRetry(), getAdminDashboardMetrics(), getAgentMonthlyTrend(), getAgentPerformance(), getAllManagersSummary(), getManagerTeamPerformance(), getMetaLeadsCount() (+2 more)

### Community 6 - "Settings & Meta Auth"
Cohesion: 0.17
Nodes (10): handleConnectMeta(), loadMetaConnection(), loadSyncStatus(), verifyBothAccounts(), connectMetaAccount(), fetchPagesFromToken(), getMetaConnection(), isMetaConnected() (+2 more)

### Community 7 - "Notifications & Copy Lead"
Cohesion: 0.19
Nodes (8): buildCopyText(), copyLead(), handleCopy(), pickMetaField(), pickMetaFieldByKeyword(), resolveMetaAcc(), sourceColor(), sourceLabel()

### Community 8 - "Gemini AI Service"
Cohesion: 0.24
Nodes (12): callGemini(), callGeminiScore(), callGeminiWithKey(), draftFollowUp(), generateAdAccountReviewReport(), generateSalesReviewReport(), getPipelineInsights(), matchProperties() (+4 more)

### Community 9 - "Lead Hooks & Query Keys"
Cohesion: 0.2
Nodes (4): LEAD_ACTIVITIES_KEY(), LEAD_QUERY_KEY(), useLead(), useLeadActivities()

### Community 10 - "Auth & User Management"
Cohesion: 0.18
Nodes (3): getUserProfile(), signIn(), onSubmit()

### Community 11 - "Project Settings CRUD"
Cohesion: 0.25
Nodes (2): emptyForm(), openCreate()

### Community 12 - "Deal Service"
Cohesion: 0.33
Nodes (5): createDeal(), getDeal(), getStageProbability(), toDeal(), updateDealStage()

### Community 13 - "Push Notification Service"
Cohesion: 0.22
Nodes (0): 

### Community 14 - "Deal Hooks"
Cohesion: 0.32
Nodes (4): DEAL_QUERY_KEY(), useDeal(), useDeals(), useKanbanDeals()

### Community 15 - "Property Hooks"
Cohesion: 0.29
Nodes (2): PROPERTY_QUERY_KEY(), useProperty()

### Community 16 - "Badge Components"
Cohesion: 0.33
Nodes (0): 

### Community 17 - "Team Service"
Cohesion: 0.33
Nodes (0): 

### Community 18 - "Auth Role Hooks"
Cohesion: 0.4
Nodes (0): 

### Community 19 - "Seed Data Scripts"
Cohesion: 0.83
Nodes (2): createUser(), main()

### Community 20 - "Email Service"
Cohesion: 0.83
Nodes (3): sendEmail(), sendFollowUpEmail(), sendPropertyBrochure()

### Community 21 - "User Admin Screen"
Cohesion: 0.67
Nodes (0): 

### Community 22 - "Theme & Formatting"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Auth Hook"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "Pipeline Index"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Foreground Sync Handler"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Pipeline Stage Move"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Manager Detail Screen"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Auth Layout"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Lead Card Component"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Card UI Component"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Input UI Component"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Responsive Utilities"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Babel Config"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Expo Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Metro Config"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Properties Index"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Property Detail"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Metric Card"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Deal Card"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Property Card"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Button Component"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Header Component"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Firebase Config"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Color Constants"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "App Store"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Types Index"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **5 isolated node(s):** `React Hook Form + Zod`, `Kanban Pipeline (6-stage deal board: New â†’ Booked/Lost)`, `Property Listings (grid/list view, image gallery, availability management)`, `Brand Navy #0D1B2A (Headers, backgrounds)`, `Brand Accent #F59E0B (Warnings, highlights)`
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Pipeline Index`** (2 nodes): `index.tsx`, `Index()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Foreground Sync Handler`** (2 nodes): `_layout.tsx`, `handleAppState()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pipeline Stage Move`** (2 nodes): `index.tsx`, `handleMoveStage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Manager Detail Screen`** (2 nodes): `[managerId].tsx`, `ManagerDetailScreen()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Layout`** (2 nodes): `_layout.tsx`, `AuthLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Lead Card Component`** (2 nodes): `handlePress()`, `LeadCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Card UI Component`** (2 nodes): `Card()`, `Card.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Input UI Component`** (2 nodes): `isPassword()`, `Input.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Responsive Utilities`** (2 nodes): `useResponsive()`, `responsive.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Babel Config`** (1 nodes): `babel.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Expo Env Types`** (1 nodes): `expo-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Metro Config`** (1 nodes): `metro.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Properties Index`** (1 nodes): `index.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Property Detail`** (1 nodes): `[id].tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Metric Card`** (1 nodes): `MetricCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Deal Card`** (1 nodes): `DealCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Property Card`** (1 nodes): `PropertyCard.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Button Component`** (1 nodes): `Button.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Header Component`** (1 nodes): `Header.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Firebase Config`** (1 nodes): `firebase.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Color Constants`** (1 nodes): `colors.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `App Store`** (1 nodes): `appStore.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Types Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `syncConnectedPages()` connect `Meta Sync & App Layout` to `Settings & Meta Auth`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `verifyBothAccounts()` connect `Settings & Meta Auth` to `Lead Detail & AI Score`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `verifyWhatsAppAccount()` connect `Lead Detail & AI Score` to `Settings & Meta Auth`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `Relazo CRM â€” Real Estate CRM App` (e.g. with `Relazo App Icon (solid brand green #1A9B6C)` and `Android Adaptive Icon (solid brand green #1A9B6C foreground layer)`) actually correct?**
  _`Relazo CRM â€” Real Estate CRM App` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `syncConnectedPages()` (e.g. with `triggerBackgroundSync()` and `handleConnectMeta()`) actually correct?**
  _`syncConnectedPages()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `React Hook Form + Zod`, `Kanban Pipeline (6-stage deal board: New â†’ Booked/Lost)`, `Property Listings (grid/list view, image gallery, availability management)` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Brand Assets & Icons` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
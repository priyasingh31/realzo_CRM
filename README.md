# Relazo CRM — Real Estate CRM App

A full-featured Real Estate CRM built with **React Native + Expo**, supporting **Android** and **Web**, powered by **Firebase**, **Gemini AI**, **WhatsApp Cloud API**, and **Meta Lead Ads**.

---

## ✨ Features

- **Lead Management** — Full CRUD, AI scoring, status tracking, activity log
- **Kanban Pipeline** — Drag-free deal board with 6 stages (New → Closed Won/Lost)
- **Property Listings** — Grid/list view, image gallery, availability management
- **Reports & Analytics** — KPIs, conversion rate, revenue, AI-powered insights
- **Role-Based Access** — Admin / Manager / Agent permissions (UI + Firestore rules)
- **AI Assistant** — Gemini 1.5 Flash for lead scoring, reply suggestions, property matching
- **WhatsApp Integration** — Direct messaging + incoming webhook logging
- **Gmail SMTP** — Email follow-ups via Cloud Functions
- **Meta Lead Ads** — Auto-import Facebook/Instagram leads via webhook
- **Real-time sync** — Firestore live subscriptions across devices

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native + Expo SDK 52 |
| Navigation | Expo Router v4 (file-based) |
| Backend | Firebase (Firestore, Auth, Storage, Functions) |
| State | Zustand v5 + React Query v5 |
| Forms | React Hook Form + Zod |
| AI | Google Gemini 1.5 Flash |
| Messaging | WhatsApp Cloud API (Meta) |
| Email | Gmail SMTP via Nodemailer (Cloud Functions) |
| Build | Expo EAS Build |

---

## 📁 Project Structure

```
RelazoApp/
├── app/                          # Expo Router screens
│   ├── _layout.tsx               # Root layout (providers, toast)
│   ├── index.tsx                 # Auth redirect
│   ├── (auth)/
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   └── (app)/
│       ├── _layout.tsx           # Tab navigation
│       ├── dashboard/index.tsx
│       ├── leads/
│       │   ├── index.tsx
│       │   ├── new.tsx
│       │   └── [id].tsx
│       ├── pipeline/index.tsx
│       ├── properties/
│       │   ├── index.tsx
│       │   ├── new.tsx
│       │   └── [id].tsx
│       ├── reports/index.tsx
│       └── settings/index.tsx
├── src/
│   ├── components/
│   │   ├── ui/                   # Button, Card, Input, Badge, Header
│   │   ├── dashboard/            # MetricCard
│   │   ├── leads/                # LeadCard
│   │   ├── deals/                # DealCard
│   │   └── properties/           # PropertyCard
│   ├── config/
│   │   └── firebase.ts
│   ├── constants/
│   │   ├── colors.ts
│   │   └── theme.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useLeads.ts
│   │   ├── useDeals.ts
│   │   └── useProperties.ts
│   ├── services/
│   │   ├── authService.ts
│   │   ├── leadsService.ts
│   │   ├── dealsService.ts
│   │   ├── propertiesService.ts
│   │   ├── aiService.ts
│   │   ├── whatsappService.ts
│   │   └── emailService.ts
│   ├── store/
│   │   ├── authStore.ts
│   │   └── appStore.ts
│   └── types/
│       └── index.ts
├── functions/                    # Firebase Cloud Functions
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts              # sendEmail, metaLeadWebhook, whatsappWebhook, onLeadCreated
├── firestore.rules               # Firestore security rules (RBAC)
├── firestore.indexes.json        # Composite indexes
├── storage.rules                 # Firebase Storage rules
├── firebase.json                 # Firebase project config
├── app.json                      # Expo config
├── package.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
└── eas.json                      # EAS build profiles
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- Firebase CLI: `npm install -g firebase-tools`
- EAS CLI: `npm install -g eas-cli`

### 1. Clone & Install

```bash
cd RelazoApp
npm install

# Install Cloud Functions dependencies
cd functions && npm install && cd ..
```

### 2. Firebase Setup

1. Create a new project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Email/Password
3. Create **Firestore** database (production mode)
4. Enable **Storage**
5. Copy your Firebase config from **Project Settings → General → Your apps**

### 3. Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
# Firebase
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
EXPO_PUBLIC_FIREBASE_APP_ID=your_app_id

# Gemini AI
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_key

# WhatsApp Cloud API
EXPO_PUBLIC_WHATSAPP_PHONE_ID=your_phone_number_id
EXPO_PUBLIC_WHATSAPP_TOKEN=your_permanent_access_token

# Cloud Functions URL (after deploy)
EXPO_PUBLIC_FUNCTIONS_URL=https://us-central1-your_project.cloudfunctions.net
```

### 4. Deploy Firestore Rules & Indexes

```bash
firebase login
firebase use --add   # select your project
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

### 5. Configure Cloud Functions (Gmail SMTP)

```bash
firebase functions:config:set \
  gmail.user="realhubbmktg@gmail.com" \
  gmail.pass="ycjb tkuu vuko bkeu" \
  gemini.key="AIzaSyBO0ux8SG9ohQHrh6Ge7tnK_oe7khnCNS4" \
  meta.verify_token="18d7986aae2dac8deeb0080ce0eaa4c8" \
  whatsapp.verify_token="01b61671804e5a4a39f9d24aa2dae8c4"
```

### 6. Deploy Cloud Functions

```bash
cd functions
npm run build
cd ..
firebase deploy --only functions
```

### 7. Create First Admin User

After running the app and signing up, manually set the role in Firestore:

1. Open **Firestore Console → users → {your_uid}**
2. Set `role: "admin"`

Or use the Firebase Admin SDK:
```javascript
// In Firebase console → Functions → Shell
admin.firestore().doc('users/YOUR_UID').update({ role: 'admin' });
```

---

## 📱 Running the App

### Development (Expo Go)

```bash
# Start development server
npx expo start

# Android
npx expo start --android

# Web
npx expo start --web
```

### Local Emulators

```bash
# Start Firebase emulators
firebase emulators:start

# Then in your .env, set:
# EXPO_PUBLIC_USE_EMULATOR=true
```

---

## 🏗️ Building for Production

### Android (EAS Build)

```bash
# Configure EAS
eas build:configure

# Development APK (for testing)
eas build --platform android --profile development

# Production AAB (for Play Store)
eas build --platform android --profile production
```

### Web (Static Export)

```bash
npx expo export --platform web
# Output: dist/ folder — deploy to Firebase Hosting, Vercel, or Netlify
```

### Deploy to Firebase Hosting

```bash
# Build
npx expo export --platform web

# Add to firebase.json hosting config, then:
firebase deploy --only hosting
```

---

## 🔗 Webhook Setup

### Meta Lead Ads

1. In [Meta Developer Console](https://developers.facebook.com), create an app
2. Add **Webhooks** product → Subscribe to `leadgen` events
3. Set callback URL: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/metaLeadWebhook`
4. Set verify token: matches `meta.verify_token` config

### WhatsApp Cloud API

1. In Meta Developer Console, add **WhatsApp** product
2. Set webhook URL: `https://us-central1-YOUR_PROJECT.cloudfunctions.net/whatsappWebhook`
3. Set verify token: matches `whatsapp.verify_token` config
4. Subscribe to `messages` webhook field

---

## 👥 Roles & Permissions

| Feature | Admin | Manager | Agent |
|---------|-------|---------|-------|
| View all leads | ✅ | ✅ | Own only |
| Assign leads | ✅ | ✅ | ❌ |
| Delete leads | ✅ | ✅ | ❌ |
| View all deals | ✅ | ✅ | Own only |
| Manage properties | ✅ | ✅ | Read only |
| Manage team | ✅ | ❌ | ❌ |
| Pipeline stages config | ✅ | ❌ | ❌ |
| View reports | ✅ | ✅ | ✅ |
| AI insights | ✅ | ✅ | ✅ |

---

## 🤖 AI Features (Gemini)

| Feature | Trigger |
|---------|---------|
| Lead Scoring (0-100) | Auto on lead creation |
| Reply Suggestion | Lead detail → AI tab |
| Property Matching | Lead detail → Match button |
| Call Notes Summary | Lead activity → Summarise |
| Pipeline Insights | Reports → Generate button |
| Follow-up Draft | Lead detail → Draft button |

Get your Gemini API key at: [aistudio.google.com](https://aistudio.google.com)

---

## 🎨 Brand Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#1A9B6C` | CTAs, buttons, active states |
| `navy` | `#0D1B2A` | Headers, backgrounds |
| `accent` | `#F59E0B` | Warnings, highlights |
| `success` | `#10B981` | Closed won, available |
| `danger` | `#EF4444` | Closed lost, sold, delete |

---

## 📦 Key Dependencies

```json
{
  "expo": "~52.0.0",
  "expo-router": "~4.0.0",
  "firebase": "^11.0.0",
  "zustand": "^5.0.0",
  "@tanstack/react-query": "^5.0.0",
  "react-hook-form": "^7.0.0",
  "zod": "^3.22.0",
  "date-fns": "^3.0.0",
  "expo-linear-gradient": "~13.0.0",
  "@expo/vector-icons": "^14.0.0",
  "react-native-safe-area-context": "4.12.0",
  "react-native-toast-message": "^2.2.0"
}
```

---

## 🛠️ Troubleshooting

**"Firebase app already initialized"** — Normal on hot reload. The `getApps().length` check in `firebase.ts` handles this.

**"AsyncStorage is not supported on web"** — Auth persistence uses `getReactNativePersistence` only on native; web uses default browser persistence.

**Emulator connection issues** — Make sure `EXPO_PUBLIC_USE_EMULATOR=true` and emulators are running before starting Expo.

**EAS build fails** — Run `eas doctor` and ensure your `app.json` has a valid `bundleIdentifier` (iOS) and `package` (Android).

---

## 📄 License

Private — Relazo CRM — All Rights Reserved
Login Credentials

  Role       Email                            Password
  ─────────  ───────────────────────────────  ──────────────────────
  admin      admin@relazo.com                   Admin@relazo2024!
  mis        mis@relazo.com                     Mis@relazo2024!
  manager    manager1@relazo.com                Manager@relazo2024!
  manager    manager2@relazo.com                Manager@relazo2024!
  sales      sales1@relazo.com                  Sales@relazo2024!
  sales      sales2@relazo.com                  Sales@relazo2024!
  sales      sales3@relazo.com                  Sales@relazo2024!
  sales      sales4@relazo.com                  Sales@relazo2024!
  sales      sales5@relazo.com                  Sales@relazo2024!
/**
 * Meta Ads OAuth Connection Service
 *
 * Flow:
 *   1. Admin taps "Connect Meta Ads" in Settings.
 *   2. Device browser opens Meta OAuth dialog.
 *   3. User logs in → grants leads_retrieval + pages permissions.
 *   4. Meta redirects back to relazo://meta-auth?access_token=...
 *   5. We call /me/accounts to get page access tokens (permanent).
 *   6. Page tokens stored in Firestore  settings/metaConnection  + SecureStore.
 *   7. syncConnectedPages() uses these tokens; falls back to .env tokens if
 *      no connection is stored.
 *
 * IMPORTANT — one-time Meta App setup (done once per app):
 *   In Meta App Dashboard → Facebook Login → Valid OAuth Redirect URIs, add:
 *     relazo://meta-auth
 *   App ID used: EXPO_PUBLIC_META_APP_ID_1 (941478028470158)
 */

import * as WebBrowser from 'expo-web-browser';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import * as SecureStore from 'expo-secure-store';

const GRAPH = 'https://graph.facebook.com/v19.0';
const META_APP_ID = process.env.EXPO_PUBLIC_META_APP_ID_1 || '941478028470158';
const REDIRECT_URI = 'relazo://meta-auth';
const SECURE_KEY = 'meta_connection_v1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaPage {
  id: string;
  name: string;
  pageAccessToken: string;
  category: string;
}

export interface MetaConnection {
  connected: boolean;
  userToken: string;
  pages: MetaPage[];
  connectedAt: string;
  connectedByUserId: string;
  connectedByName: string;
}

// ─── OAuth Login ──────────────────────────────────────────────────────────────

/**
 * Opens the Meta OAuth dialog in the system browser.
 * Returns the connection object (pages + tokens) on success, null on cancel.
 * Throws on API error.
 */
export async function connectMetaAccount(): Promise<Omit<MetaConnection, 'connectedByUserId' | 'connectedByName'> | null> {
  const scope = [
    'leads_retrieval',
    'pages_read_engagement',
    'pages_manage_ads',
    'pages_show_list',
  ].join(',');

  const authUrl =
    `https://www.facebook.com/dialog/oauth` +
    `?client_id=${META_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&response_type=token` +
    `&display=touch`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, REDIRECT_URI);

  if (result.type !== 'success') return null;

  // Meta returns token in the URL fragment: relazo://meta-auth#access_token=...
  // expo-web-browser converts # to ? in the returned URL for easier parsing
  const rawUrl = result.url;
  const queryPart = rawUrl.includes('#') ? rawUrl.split('#')[1] : rawUrl.split('?').slice(1).join('?');
  const params = new URLSearchParams(queryPart);
  const userToken = params.get('access_token');

  if (!userToken) {
    throw new Error('Meta login succeeded but no access_token was returned.');
  }

  const pages = await fetchPagesFromToken(userToken);

  return {
    connected: true,
    userToken,
    pages,
    connectedAt: new Date().toISOString(),
  };
}

// ─── Graph API helpers ────────────────────────────────────────────────────────

/** Fetches all pages managed by the user and returns their page access tokens. */
export async function fetchPagesFromToken(userToken: string): Promise<MetaPage[]> {
  const url = `${GRAPH}/me/accounts?fields=id,name,access_token,category&limit=50&access_token=${userToken}`;
  const res = await fetch(url);
  const json = await res.json() as {
    data?: { id: string; name: string; access_token: string; category: string }[];
    error?: { message: string };
  };
  if (!res.ok || json.error) {
    throw new Error(`Meta API error: ${json.error?.message ?? res.status}`);
  }
  return (json.data || []).map(p => ({
    id: p.id,
    name: p.name,
    pageAccessToken: p.access_token,
    category: p.category || '',
  }));
}

/** Validate a page access token by calling the debug endpoint. */
export async function validatePageToken(pageToken: string): Promise<boolean> {
  try {
    const url = `${GRAPH}/me?access_token=${pageToken}`;
    const res = await fetch(url);
    const json = await res.json() as { id?: string; error?: object };
    return res.ok && !!json.id && !json.error;
  } catch {
    return false;
  }
}

// ─── Persist / Load / Clear ───────────────────────────────────────────────────

export async function saveMetaConnection(connection: MetaConnection): Promise<void> {
  await setDoc(doc(db, 'settings', 'metaConnection'), connection);
  try {
    await SecureStore.setItemAsync(SECURE_KEY, JSON.stringify(connection));
  } catch {
    // SecureStore unavailable on web — Firestore is the fallback
  }
}

/**
 * Returns the stored connection, or null if never connected.
 * Reads SecureStore first (fast), falls back to Firestore.
 */
export async function getMetaConnection(): Promise<MetaConnection | null> {
  // 1. Try local SecureStore
  try {
    const raw = await SecureStore.getItemAsync(SECURE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MetaConnection;
      if (parsed.connected && parsed.pages?.length > 0) return parsed;
    }
  } catch {
    // SecureStore may not be available (web)
  }

  // 2. Firestore fallback
  try {
    const snap = await getDoc(doc(db, 'settings', 'metaConnection'));
    if (snap.exists()) {
      const data = snap.data() as MetaConnection;
      if (data?.connected && data.pages?.length > 0) return data;
    }
  } catch {}

  return null;
}

export async function disconnectMeta(): Promise<void> {
  await setDoc(
    doc(db, 'settings', 'metaConnection'),
    { connected: false, pages: [], userToken: '', connectedAt: null },
    { merge: true },
  );
  try { await SecureStore.deleteItemAsync(SECURE_KEY); } catch {}
}

export async function isMetaConnected(): Promise<boolean> {
  const conn = await getMetaConnection();
  return !!(conn?.connected && conn.pages?.length > 0);
}

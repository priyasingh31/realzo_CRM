/**
 * WhatsApp Cloud API Service — Dual Account Support
 * Account 1: Phone ID 1132168796636153 / WABA 1395486652252829 / Page 1018805394651044
 * Account 2: Phone ID 1034962913036449 / WABA 4541558149412954 / Page 968440359693058
 *
 * Switch active account via EXPO_PUBLIC_ACTIVE_WHATSAPP_ACCOUNT (1 or 2).
 * In production: route sends through Firebase Cloud Functions to keep tokens server-side.
 */

export type WhatsAppAccount = 1 | 2 | 3;

export interface WhatsAppAccountConfig {
  accountNumber: WhatsAppAccount;
  phoneNumberId: string;
  accessToken: string;
  businessAccountId: string;
  metaAppId: string;
  metaAccessToken: string;
  pageId: string;
  label: string;
}

export interface WhatsAppMessage {
  to: string;
  type: 'text' | 'template' | 'image' | 'document';
  text?: string;
  templateName?: string;
  templateParams?: string[];
  mediaUrl?: string;
}

export interface WhatsAppMessageLog {
  id: string;
  leadId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  phoneNumber: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  waMessageId?: string;
  account: WhatsAppAccount;
}

// ─── Account Configs ──────────────────────────────────────────────────────────
export const WHATSAPP_ACCOUNTS: Record<WhatsAppAccount, WhatsAppAccountConfig> = {
  1: {
    accountNumber: 1,
    label: 'Account 1 (Primary)',
    phoneNumberId: process.env.EXPO_PUBLIC_WHATSAPP_PHONE_NUMBER_ID_1 || '1132168796636153',
    accessToken: process.env.EXPO_PUBLIC_WHATSAPP_ACCESS_TOKEN_1 || 'EAANYRO9zZA44BRAhTJuegy1mRzUTxgA9fbMZA0ZB1roZAJJ5UwINiFQ69SR0kXm8GsnKUVrWN5EOAd3otP1mU3F9frSaJBVR8skZAapV4ZB8XYBUb04ktTLPKZBIFx5VXuc3fSy41jbxYYwsVQPYUx13aW6i7H8hjiYEUWPvfYCu4jrEXV8AIJ6xEJ0AOjdkwZDZD',
    businessAccountId: process.env.EXPO_PUBLIC_WHATSAPP_BUSINESS_ACCOUNT_ID_1 || '1395486652252829',
    metaAppId: process.env.EXPO_PUBLIC_META_APP_ID_1 || '941478028470158',
    metaAccessToken: process.env.EXPO_PUBLIC_META_ACCESS_TOKEN_1 || 'EAANYRO9zZA44BRG2TIblrLUSeuMv5Gc875FzZCc0lAxNrJwpCi2cSHPPjpRnQJX9J7k5zBGhJTYWjGYTpp8VL6XacHABFKaZBhxD38QW0N5GZB7prVTLS2vsCHEZCC0HJZCTQ9ZAGaSO9fGrQ0qHkdGyZCXgkNZAPVvjxIxPEmN7MxCJf60QHZAlYwsNrgbIw5fAZDZD',
    pageId: process.env.EXPO_PUBLIC_META_PAGE_ID_1 || '1018805394651044',
  },
  3: {
    accountNumber: 3,
    label: 'Account 3 (Meta Leads)',
    phoneNumberId: '',
    accessToken: '',
    businessAccountId: '',
    metaAppId: process.env.EXPO_PUBLIC_META_APP_ID_3 || '3344802635689410',
    metaAccessToken: process.env.EXPO_PUBLIC_META_ACCESS_TOKEN_3 || 'EAAviFIzxrcIBRd7oxq9Domk5oAlshAPWwuV320kxACDBrBFXur4NshIdnKLoZBG6dI3kR36uOxalhkL14KTFmoEcOOsSbdx6vIZCjwZCVhTVImazizZBkTA4x87spO6a4FheCTfaU1iNOmqIAaGYyWdVYsnZBnfNW7imSMnUjTqbg3RGL9ryhkLSXNsqsEQZDZD',
    pageId: process.env.EXPO_PUBLIC_META_PAGE_ID_3 || '337675829430214',
  },
  2: {
    accountNumber: 2,
    label: 'Account 2 (Secondary)',
    phoneNumberId: process.env.EXPO_PUBLIC_WHATSAPP_PHONE_NUMBER_ID_2 || '1034962913036449',
    accessToken: process.env.EXPO_PUBLIC_WHATSAPP_ACCESS_TOKEN_2 || 'EAAY4aFUbg1cBROa0lZBAgNTc5LPW2b3g4hkWGAwcVzZCIk8tXNy4OUACXABCf3pp6zVwN9Pk14dmmlh4Ge7G81CI3TVNyZCFtPRP7kbO3NtvyklvtlJhZA8c4SLtRqzqVvZCEAGkEynrZCCrt7FgUvswf32Y5xfst9jnxCFGBaBYfzPSGrNzU2fP9nzAsDY4QtiwZDZD',
    businessAccountId: process.env.EXPO_PUBLIC_WHATSAPP_BUSINESS_ACCOUNT_ID_2 || '4541558149412954',
    metaAppId: process.env.EXPO_PUBLIC_META_APP_ID_2 || '1750870615884631',
    metaAccessToken: process.env.EXPO_PUBLIC_META_ACCESS_TOKEN_2 || 'EAAY4aFUbg1cBReyuvZAIggEueFZBZAUcsvJJxER6oRMPc3tTQjQ6N1T0jBIMoTZBonWnU3neztKIYMHifbr2jxSXwVR8s8VRY3AlFd8QJPsyPTu2TA9hfPUq7GgAEu8v8AR8fDU0Ul3BVsPBN8x7njlUJY1VJcb8JZArE58N1oAhhFwlR8VM3caqhzWwc4PHCMwZDZD',
    pageId: process.env.EXPO_PUBLIC_META_PAGE_ID_2 || '968440359693058',
  },
};

// ─── Get Active Account ───────────────────────────────────────────────────────
export function getActiveAccount(): WhatsAppAccountConfig {
  const active = (process.env.EXPO_PUBLIC_ACTIVE_WHATSAPP_ACCOUNT || '1') as string;
  const accountNum: WhatsAppAccount = active === '2' ? 2 : 1;
  return WHATSAPP_ACCOUNTS[accountNum];
}

export function getAccount(accountNum: WhatsAppAccount): WhatsAppAccountConfig {
  return WHATSAPP_ACCOUNTS[accountNum];
}

// ─── Send Text Message ────────────────────────────────────────────────────────
export async function sendWhatsAppText(
  to: string,
  message: string,
  accountNum?: WhatsAppAccount
): Promise<{ success: boolean; messageId?: string; error?: string; account: WhatsAppAccount }> {
  const account = accountNum ? getAccount(accountNum) : getActiveAccount();
  const url = `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: message },
      }),
    });

    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };

    if (!res.ok) {
      console.error(`WhatsApp Account ${account.accountNumber} send error:`, data.error?.message);
      return { success: false, error: data.error?.message, account: account.accountNumber };
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
      account: account.accountNumber,
    };
  } catch (error) {
    return { success: false, error: String(error), account: account.accountNumber };
  }
}

// ─── Send Template Message ────────────────────────────────────────────────────
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[],
  languageCode = 'en',
  accountNum?: WhatsAppAccount
): Promise<{ success: boolean; messageId?: string; error?: string; account: WhatsAppAccount }> {
  const account = accountNum ? getAccount(accountNum) : getActiveAccount();
  const url = `https://graph.facebook.com/v19.0/${account.phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: params.length > 0 ? [{
        type: 'body',
        parameters: params.map((p) => ({ type: 'text', text: p })),
      }] : [],
    },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string } };
    if (!res.ok) return { success: false, error: data.error?.message, account: account.accountNumber };
    return { success: true, messageId: data.messages?.[0]?.id, account: account.accountNumber };
  } catch (error) {
    return { success: false, error: String(error), account: account.accountNumber };
  }
}

// ─── Send with Fallback (try account 1, fallback to account 2) ────────────────
export async function sendWhatsAppWithFallback(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string; account: WhatsAppAccount }> {
  // Try primary account first
  const primary = await sendWhatsAppText(to, message, 1);
  if (primary.success) return primary;

  console.warn('Account 1 failed, trying Account 2 as fallback...');
  return sendWhatsAppText(to, message, 2);
}

// ─── Verify WhatsApp Account Token ────────────────────────────────────────────
export async function verifyWhatsAppAccount(
  accountNum: WhatsAppAccount
): Promise<{ valid: boolean; phoneNumber?: string; displayName?: string; error?: string }> {
  const account = getAccount(accountNum);
  const url = `https://graph.facebook.com/v19.0/${account.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating&access_token=${account.accessToken}`;

  try {
    const res = await fetch(url);
    const data = await res.json() as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { message: string };
    };

    if (!res.ok) return { valid: false, error: data.error?.message };
    return {
      valid: true,
      phoneNumber: data.display_phone_number,
      displayName: data.verified_name,
    };
  } catch (error) {
    return { valid: false, error: String(error) };
  }
}

// ─── Format Phone for WhatsApp (UAE format) ───────────────────────────────────
export function formatPhoneForWhatsApp(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('05') || cleaned.startsWith('04')) {
    return '971' + cleaned.substring(1);
  }
  if (cleaned.startsWith('971')) return cleaned;
  // For non-UAE numbers already with country code
  return cleaned;
}

// ─── Open WhatsApp Deep Link ──────────────────────────────────────────────────
export function getWhatsAppDeepLink(phone: string, message?: string): string {
  const formatted = formatPhoneForWhatsApp(phone);
  const encodedMsg = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${formatted}${encodedMsg}`;
}

// ─── Get Account Status Summary ───────────────────────────────────────────────
export function getAccountsSummary() {
  return [
    {
      id: 1 as WhatsAppAccount,
      label: WHATSAPP_ACCOUNTS[1].label,
      phoneNumberId: WHATSAPP_ACCOUNTS[1].phoneNumberId,
      businessAccountId: WHATSAPP_ACCOUNTS[1].businessAccountId,
      pageId: WHATSAPP_ACCOUNTS[1].pageId,
      isActive: getActiveAccount().accountNumber === 1,
    },
    {
      id: 2 as WhatsAppAccount,
      label: WHATSAPP_ACCOUNTS[2].label,
      phoneNumberId: WHATSAPP_ACCOUNTS[2].phoneNumberId,
      businessAccountId: WHATSAPP_ACCOUNTS[2].businessAccountId,
      pageId: WHATSAPP_ACCOUNTS[2].pageId,
      isActive: getActiveAccount().accountNumber === 2,
    },
  ];
}

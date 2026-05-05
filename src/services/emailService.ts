/**
 * Email Service — calls Firebase Cloud Functions which use Nodemailer + Gmail SMTP
 * This keeps Gmail credentials server-side in Firebase Secret Manager.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  body: string;
  leadId?: string;
  agentId?: string;
}

// Replace with your Firebase Cloud Functions URL
const CLOUD_FUNCTIONS_BASE = 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net';

// ─── Send Email via Cloud Function ───────────────────────────────────────────
export async function sendEmail(
  payload: EmailPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${CLOUD_FUNCTIONS_BASE}/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.message || 'Failed to send email' };
    }

    return { success: true };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: String(error) };
  }
}

// ─── Send Follow-up Email ─────────────────────────────────────────────────────
export async function sendFollowUpEmail(
  leadEmail: string,
  leadName: string,
  agentName: string,
  emailBody: string,
  leadId: string,
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: leadEmail,
    subject: `Following up — ${agentName} from Relazo`,
    body: `Dear ${leadName},\n\n${emailBody}\n\nBest regards,\n${agentName}\nRelazo Real Estate`,
    leadId,
    agentId,
  });
}

// ─── Send Property Brochure ───────────────────────────────────────────────────
export async function sendPropertyBrochure(
  leadEmail: string,
  leadName: string,
  propertyTitle: string,
  propertyUrl: string,
  agentName: string
): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: leadEmail,
    subject: `Property Details: ${propertyTitle}`,
    body: `Dear ${leadName},\n\nThank you for your interest. Please find the details for ${propertyTitle} below:\n\n${propertyUrl}\n\nI am available to arrange a viewing at your convenience. Please feel free to contact me.\n\nBest regards,\n${agentName}\nRelazo Real Estate`,
  });
}

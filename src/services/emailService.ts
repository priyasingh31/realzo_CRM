/**
 * Email Service — calls Firebase Cloud Functions which use Nodemailer + Gmail SMTP
 * This keeps Gmail credentials server-side in Firebase Secret Manager.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  leadId?: string;
  agentId?: string;
}

const CLOUD_FUNCTIONS_BASE = 'https://us-central1-relazo-crm.cloudfunctions.net';

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
    text: `Dear ${leadName},\n\n${emailBody}\n\nBest regards,\n${agentName}\nRelazo Real Estate`,
    leadId,
    agentId,
  });
}

// ─── Send Status Change Confirmation to Sales Person ─────────────────────────
export async function sendStatusChangeEmail(
  salesEmail: string,
  salesName: string,
  leadName: string,
  oldStatus: string,
  newStatus: string,
  leadId: string,
  agentId: string
): Promise<{ success: boolean; error?: string }> {
  const text = `Hi ${salesName},\n\nYou have successfully updated a lead status in Relazo CRM.\n\nLead: ${leadName}\nStatus Change: ${oldStatus} → ${newStatus}\n\nThis is an automated confirmation of your action.\n\nBest regards,\nRelazo CRM`;
  const html = `<p>Hi <strong>${salesName}</strong>,</p><p>You have successfully updated a lead status in Relazo CRM.</p><table style="border-collapse:collapse;margin:12px 0"><tr><td style="padding:4px 12px 4px 0;color:#6b7280">Lead</td><td style="padding:4px 0;font-weight:600;color:#1e293b">${leadName}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#6b7280">Status Change</td><td style="padding:4px 0;font-weight:600;color:#1e293b">${oldStatus} → ${newStatus}</td></tr></table><p style="color:#6b7280;font-size:13px">This is an automated confirmation of your action.</p><p>Best regards,<br><strong>Relazo CRM</strong></p>`;
  return sendEmail({ to: salesEmail, subject: `Lead Updated: ${leadName} → ${newStatus}`, text, html, leadId, agentId });
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
    text: `Dear ${leadName},\n\nThank you for your interest. Please find the details for ${propertyTitle} below:\n\n${propertyUrl}\n\nI am available to arrange a viewing at your convenience. Please feel free to contact me.\n\nBest regards,\n${agentName}\nRelazo Real Estate`,
  });
}

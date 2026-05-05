import { Lead, Property, AISuggestion, LeadActivity } from '@/types';

const GEMINI_API_KEY       = 'AIzaSyAGH95I76gNw2UdjxDQ1pMSbz0It0mWwPg'; // reports / reply / pipeline
const GEMINI_SCORE_API_KEY = 'AIzaSyAgdDguZS4yusem_zcj-wVaD5aE0eTYXKw'; // lead scoring only

const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

async function callGeminiWithKey(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(GEMINI_BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`Gemini API error: ${data?.error?.message ?? `HTTP ${response.status}`}`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

// Default key for everything except lead scoring
const callGemini = (prompt: string) => callGeminiWithKey(prompt, GEMINI_API_KEY);
// Dedicated key for lead scoring
const callGeminiScore = (prompt: string) => callGeminiWithKey(prompt, GEMINI_SCORE_API_KEY);

// ─── Lead Scoring ─────────────────────────────────────────────────────────────
export async function scoreLeadAI(lead: Lead): Promise<AISuggestion> {
  // Build extra meta fields context
  const metaExtras = Object.entries(lead.metaFields ?? {})
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `  ${k.replace(/_/g, ' ')}: ${v}`)
    .join('\n');

  const prompt = `You are an expert real estate sales coach analyzing a lead for a sales agent in India.

Lead Information:
- Name: ${lead.name}
- Phone: ${lead.phone}
- Email: ${lead.email || 'Not provided'}
- Source: ${lead.source === 'meta' ? `Meta Ads (Account ${lead.metaAccount ?? '?'})` : lead.source}
- Campaign: ${lead.metaCampaignName || 'Unknown'}
- Budget: ${lead.budget ? `₹${lead.budget.toLocaleString()}` : 'Not specified'}
- Requirements: ${lead.requirements || 'Not specified'}
- Location Preference: ${lead.preferredLocation || lead.location || 'Not specified'}
- Job Title: ${lead.jobTitle || 'Not specified'}
- Current Status: ${lead.status}
- Notes: ${lead.notes || 'None'}
${metaExtras ? `\nForm Responses:\n${metaExtras}` : ''}

Analyze this lead thoroughly and respond ONLY with this exact JSON (no markdown):
{
  "score": <number 1-10>,
  "quality": "<Hot | Warm | Cold | Junk>",
  "summary": "<1 sentence on why this score>",
  "strengths": ["<positive signal 1>", "<positive signal 2>"],
  "concerns": ["<risk or gap 1>", "<risk or gap 2>"],
  "pitch": {
    "opening": "<How to open the first call — what to say in first 10 seconds>",
    "key_points": ["<pitch point 1>", "<pitch point 2>", "<pitch point 3>"],
    "objection": "<Most likely objection and how to handle it>",
    "cta": "<Best call-to-action to close this lead — site visit / video call / brochure etc>"
  },
  "next_action": "<Single most important next step for the sales person>"
}`;

  const text = await callGeminiScore(prompt);
  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    return {
      type: 'lead_score',
      content: json.summary ?? '',
      confidence: (json.score ?? 5) / 10,
      metadata: {
        score: json.score,
        quality: json.quality,
        strengths: json.strengths,
        concerns: json.concerns,
        pitch: json.pitch,
        next_action: json.next_action,
      },
    };
  } catch {
    return {
      type: 'lead_score',
      content: 'Could not parse AI analysis. Try again.',
      confidence: 0.5,
    };
  }
}

// ─── WhatsApp Reply Suggestion ────────────────────────────────────────────────
export async function suggestReply(
  lead: Lead,
  lastMessage: string,
  conversationHistory: LeadActivity[]
): Promise<AISuggestion> {
  const history = conversationHistory
    .slice(-5)
    .map((a) => `${a.performedByName ?? 'Agent'}: ${a.description}`)
    .join('\n');

  const prompt = `You are a professional real estate agent assistant. Suggest a WhatsApp reply to this lead.

Lead: ${lead.name}, Budget: ${lead.budget ? `AED ${lead.budget.toLocaleString()}` : 'Unknown'}
Requirements: ${lead.requirements || 'Not specified'}

Recent conversation:
${history}

Lead's latest message: "${lastMessage}"

Write a professional, friendly, concise reply in 2-3 sentences. Focus on their needs. Do not use emojis excessively.`;

  const content = await callGemini(prompt);
  return { type: 'reply', content: content.trim() };
}

// ─── Property Match ───────────────────────────────────────────────────────────
export async function matchProperties(lead: Lead, properties: Property[]): Promise<AISuggestion> {
  const propList = properties
    .slice(0, 20)
    .map((p, i) => `${i + 1}. ${p.title} - ${p.type} - AED ${p.price.toLocaleString()} - ${p.location} - ${p.area ?? 'N/A'} sqft - ${p.bedrooms || 'N/A'} beds`)
    .join('\n');

  const prompt = `You are a real estate AI. Match the best 3 properties for this client.

Client: ${lead.name}
Budget: AED ${lead.budget?.toLocaleString() || 'Unknown'}
Requirements: ${lead.requirements || 'Not specified'}
Preferred location: ${lead.preferredLocation || lead.location || 'Flexible'}

Available properties:
${propList}

Respond with JSON: {"matches": [{"index": <1-based>, "reason": "<why this matches>"}]}`;

  const text = await callGemini(prompt);
  try {
    const json = JSON.parse(text.replace(/```json\n?|\n?```/g, '').trim());
    const matchedProps = json.matches
      .map((m: { index: number; reason: string }) => ({ property: properties[m.index - 1], reason: m.reason }))
      .filter((m: { property: Property | undefined }) => m.property);
    return {
      type: 'property_match',
      content: `Found ${matchedProps.length} matching properties for ${lead.name}`,
      metadata: { matches: matchedProps },
    };
  } catch {
    return { type: 'property_match', content: 'Unable to match properties at this time.' };
  }
}

// ─── Call Summarisation ───────────────────────────────────────────────────────
export async function summariseCallNotes(rawNotes: string, leadName: string): Promise<AISuggestion> {
  const prompt = `Summarise these call notes from a real estate agent's conversation with ${leadName}.

Raw notes:
"${rawNotes}"

Provide a structured summary with:
1. Key points discussed
2. Client needs/requirements identified
3. Next action items

Keep it concise (under 150 words).`;

  const content = await callGemini(prompt);
  return { type: 'call_summary', content: content.trim() };
}

// ─── Follow-up Draft ──────────────────────────────────────────────────────────
export async function draftFollowUp(lead: Lead, context: string): Promise<AISuggestion> {
  const prompt = `Draft a personalised follow-up email for a real estate lead.

Agent context: ${context}
Lead name: ${lead.name}
Lead status: ${lead.status}
Budget: ${lead.budget ? `AED ${lead.budget.toLocaleString()}` : 'Not specified'}
Requirements: ${lead.requirements || 'Not specified'}
Last contact: ${lead.lastContactedAt ? new Date(lead.lastContactedAt).toLocaleDateString() : 'Unknown'}

Write a professional, concise follow-up email (subject + body). Keep it under 150 words.`;

  const content = await callGemini(prompt);
  return { type: 'follow_up', content: content.trim() };
}

// ─── Pipeline Insight ─────────────────────────────────────────────────────────
export async function getPipelineInsights(dealsSummary: string): Promise<AISuggestion> {
  const prompt = `Analyse this real estate sales pipeline and provide 3 actionable insights.

Pipeline summary:
${dealsSummary}

Provide concise, actionable recommendations to improve conversion rates. Format as a numbered list.`;

  const content = await callGemini(prompt);
  return { type: 'pipeline_insight', content: content.trim() };
}

// ─── Review Meeting Report Generator ─────────────────────────────────────────
export interface SalesPersonReportData {
  name: string; region?: string;
  totalLeads: number; newLeads: number; interested: number;
  siteVisits: number; closed: number; missed: number; convRate: string;
}

export interface AdAccountReportData {
  label: string; totalLeads: number; newToday: number;
  convRate: string; cpl: number;
}

export async function generateSalesReviewReport(
  period: string,
  agents: SalesPersonReportData[],
  totals: { totalLeads: number; closed: number; missed: number; convRate: string }
): Promise<string> {
  const agentSummary = agents.map(a =>
    `${a.name} (${a.region ?? 'N/A'}): ${a.totalLeads} leads, ${a.closed} closed, ${a.convRate}% conv, ${a.missed} missed`
  ).join('\n');

  const prompt = `You are a real estate CRM analyst. Write a professional sales review meeting report in clear sections.

Period: ${period}
Team Overview: ${totals.totalLeads} total leads, ${totals.closed} closed, ${totals.convRate}% conversion, ${totals.missed} missed follow-ups

Individual Performance:
${agentSummary}

Write a structured report with these sections:
1. Executive Summary (2-3 sentences)
2. Team Performance Overview (key numbers and trend)
3. Top Performers (highlight best agents)
4. Areas Needing Attention (missed follow-ups, low converters)
5. Action Items & Recommendations (3-5 bullet points)

Keep it professional, data-driven, and under 400 words. Use plain text, no markdown symbols.`;

  return callGemini(prompt);
}

export async function generateAdAccountReviewReport(
  period: string,
  accounts: AdAccountReportData[],
  totalLeads: number
): Promise<string> {
  const accountSummary = accounts.map(a =>
    `${a.label}: ${a.totalLeads} leads, ${a.convRate}% conversion, CPL ₹${a.cpl}`
  ).join('\n');

  const prompt = `You are a real estate digital marketing analyst. Write a professional ad account review report for a management meeting.

Period: ${period}
Total Leads from All Sources: ${totalLeads}

Ad Account Breakdown:
${accountSummary}

Write a structured report with these sections:
1. Executive Summary (2-3 sentences)
2. Account-wise Performance Analysis (detail each source)
3. Best Performing Source & Why
4. Underperforming Sources & Issues
5. Budget & CPL Recommendations (3-5 actionable bullet points)

Keep it professional, data-driven, and under 400 words. Use plain text, no markdown symbols.`;

  return callGemini(prompt);
}

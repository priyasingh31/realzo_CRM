/**
 * Relazo CRM — Firebase Cloud Functions  (index.js)
 *
 * ▸ Meta Lead Ads polling  — every 1 minute (no webhook needed)
 * ▸ triggerMetaSync        — callable: manual sync from app
 * ▸ Instant push to ALL admins + managers on new lead
 * ▸ Push to assigned sales person after round-robin
 * ▸ 10-min escalation timer  + checkUnansweredLeads every 2 min
 * ▸ WhatsApp send / webhook
 * ▸ Email (Gmail SMTP)
 * ▸ User management (create / update / deactivate)
 * ▸ Webhook verify endpoints (kept for future use)
 */

const functions  = require("firebase-functions");
const admin      = require("firebase-admin");
const nodemailer = require("nodemailer");
const cors       = require("cors");

admin.initializeApp();
const db          = admin.firestore();
const corsHandler = cors({ origin: true });

// ─── Expo Push API ────────────────────────────────────────────────────────────
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// ─── Collections ──────────────────────────────────────────────────────────────
const COL = {
  LEADS:         "leads",
  USERS:         "users",
  NOTIFICATIONS: "notifications",
  META_SYNC:     "metaSync",
};

// ─── Meta Account Configs ─────────────────────────────────────────────────────
const META_ACCOUNTS = {
  1: {
    appId:             "941478028470158",
    accessToken:       "EAANYRO9zZA44BRG2TIblrLUSeuMv5Gc875FzZCc0lAxNrJwpCi2cSHPPjpRnQJX9J7k5zBGhJTYWjGYTpp8VL6XacHABFKaZBhxD38QW0N5GZB7prVTLS2vsCHEZCC0HJZCTQ9ZAGaSO9fGrQ0qHkdGyZCXgkNZAPVvjxIxPEmN7MxCJf60QHZAlYwsNrgbIw5fAZDZD",
    waAccessToken:     "EAANYRO9zZA44BRAhTJuegy1mRzUTxgA9fbMZA0ZB1roZAJJ5UwINiFQ69SR0kXm8GsnKUVrWN5EOAd3otP1mU3F9frSaJBVR8skZAapV4ZB8XYBUb04ktTLPKZBIFx5VXuc3fSy41jbxYYwsVQPYUx13aW6i7H8hjiYEUWPvfYCu4jrEXV8AIJ6xEJ0AOjdkwZDZD",
    businessAccountId: "1395486652252829",
    phoneNumberId:     "1132168796636153",
    pageId:            "1018805394651044",
    verifyToken:       "relazo_meta_verify_acc1",
  },
  2: {
    appId:             "1750870615884631",
    accessToken:       "EAAY4aFUbg1cBRArRvqtd8ErssTJVk42GYnKa9ZBXZCTfA6caBmEQahC7sfZBWKPWuSZBsYGBC3VlaOEY0ZB62IprIqMZCQ8SyFjeRwwd3SPRZA18lGxjmJtLv7OIrzKEuVzw2Y7A9a9MkWPjLAU5FoFT6wbaE3YZA53jPwagaykx5NA7zytox2oW7okNZCEb5Q6vH1SY2lbjE",
    waAccessToken:     "EAAY4aFUbg1cBROa0lZBAgNTc5LPW2b3g4hkWGAwcVzZCIk8tXNy4OUACXABCf3pp6zVwN9Pk14dmmlh4Ge7G81CI3TVNyZCFtPRP7kbO3NtvyklvtlJhZA8c4SLtRqzqVvZCEAGkEynrZCCrt7FgUvswf32Y5xfst9jnxCFGBaBYfzPSGrNzU2fP9nzAsDY4QtiwZDZD",
    businessAccountId: "4541558149412954",
    phoneNumberId:     "1034962913036449",
    pageId:            "968440359693058",
    verifyToken:       "relazo_meta_verify_acc2",
  },
};

const GRAPH = "https://graph.facebook.com/v19.0";

// =============================================================================
// SHARED HELPERS
// =============================================================================

/** Send a batch of Expo push messages */
async function sendPushBatch(messages) {
  if (!messages || !messages.length) return;
  try {
    await fetch(EXPO_PUSH_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body:    JSON.stringify(messages),
    });
  } catch (err) {
    console.warn("sendPushBatch error:", err);
  }
}

/** Collect push tokens for every active admin + manager */
async function getAdminManagerTokens() {
  const [adminSnap, managerSnap] = await Promise.all([
    db.collection(COL.USERS).where("role", "==", "admin").where("isActive", "==", true).get(),
    db.collection(COL.USERS).where("role", "==", "manager").where("isActive", "==", true).get(),
  ]);
  const tokens = [];
  for (const doc of [...adminSnap.docs, ...managerSnap.docs]) {
    const t = doc.data().pushToken;
    if (t && !tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

/** Get last Meta sync timestamp (default: 7 days back on first run) */
async function getLastSync(accountNum) {
  const snap = await db.collection(COL.META_SYNC).doc(String(accountNum)).get();
  if (snap.exists && snap.data().lastSyncAt) return new Date(snap.data().lastSyncAt);
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

/** Save last sync timestamp */
async function setLastSync(accountNum, time) {
  await db.collection(COL.META_SYNC).doc(String(accountNum)).set(
    { lastSyncAt: time.toISOString(), updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

/** True if a lead with this metaLeadId already exists */
async function leadExists(metaLeadId) {
  const snap = await db.collection(COL.LEADS)
    .where("metaLeadId", "==", metaLeadId).limit(1).get();
  return !snap.empty;
}

/** Find the active project mapped to a Meta page ID */
async function getProjectByPageId(pageId) {
  const snap = await db.collection("projects")
    .where("metaPageId", "==", pageId)
    .where("isActive",   "==", true)
    .limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

/** Assign lead to next sales person in round-robin and push-notify */
async function assignRoundRobin(leadId, leadName, leadPhone, accountNum, projectDoc) {
  const project = projectDoc.data();
  const salesPersonIds  = project.salesPersonIds  || [];
  const roundRobinIndex = project.roundRobinIndex || 0;
  if (!salesPersonIds.length) return;

  const idx     = roundRobinIndex % salesPersonIds.length;
  const uid     = salesPersonIds[idx];
  const userSnap = await db.collection(COL.USERS).doc(uid).get();
  if (!userSnap.exists) return;

  const salesUser  = userSnap.data();
  const escalateAt = new Date(Date.now() + 10 * 60 * 1000);

  // Atomic update: increment project index + assign lead
  await db.runTransaction(async (tx) => {
    tx.update(projectDoc.ref, { roundRobinIndex: idx + 1 });
    tx.update(db.collection(COL.LEADS).doc(leadId), {
      assignedTo:     uid,
      assignedToName: salesUser.displayName || "",
      managerId:      project.managerId || null,
      status:         "assigned",
      respondedAt:    null,
      escalateAt:     admin.firestore.Timestamp.fromDate(escalateAt),
      updatedAt:      new Date().toISOString(),
    });
  });

  // Push to assigned sales person
  if (salesUser.pushToken) {
    await sendPushBatch([{
      to:        salesUser.pushToken,
      title:     "🔔 New Lead Assigned to You!",
      body:      `${leadName} (${leadPhone || "no phone"}) — Facebook Acc ${accountNum}. Respond within 10 min!`,
      data:      { type: "lead_assigned", leadId },
      sound:     "lead_alert.wav",
      priority:  "high",
      channelId: "new_leads",
    }]);
  }

  // Push to project manager (if different from sales person)
  if (project.managerId) {
    const mgrSnap = await db.collection(COL.USERS).doc(project.managerId).get();
    const mgr = mgrSnap.data();
    if (mgr && mgr.pushToken && mgr.pushToken !== salesUser.pushToken) {
      await sendPushBatch([{
        to:        mgr.pushToken,
        title:     "📋 Lead Assigned",
        body:      `${leadName} → ${salesUser.displayName || "Sales"} (Acc ${accountNum})`,
        data:      { type: "lead_assigned", leadId },
        sound:     "default",
        priority:  "high",
        channelId: "new_leads",
      }]);
    }
  }
}

// =============================================================================
// META LEADS SYNC — CORE LOGIC (used by both scheduled + callable)
// =============================================================================

async function syncOneAccount(accountNum) {
  const account   = META_ACCOUNTS[accountNum];
  const lastSync  = await getLastSync(accountNum);
  const syncStart = new Date();
  let   newLeads  = 0;
  const errors    = [];

  // 1. Get all active lead forms for this page
  let forms = [];
  try {
    const res  = await fetch(`${GRAPH}/${account.pageId}/leadgen_forms?fields=id,name,status&limit=100&access_token=${account.accessToken}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    forms = (json.data || []).filter(f => f.status === "ACTIVE");
  } catch (err) {
    return { newLeads: 0, errors: [`Acc${accountNum} fetch forms: ${err}`] };
  }

  // 2. For each form, fetch leads created after lastSync
  const sinceUnix = Math.floor(lastSync.getTime() / 1000);
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }])
  );

  for (const form of forms) {
    try {
      // Cursor-based pagination
      let nextUrl = `${GRAPH}/${form.id}/leads?fields=id,created_time,field_data&filtering=${filtering}&limit=100&access_token=${account.accessToken}`;
      while (nextUrl) {
        const res  = await fetch(nextUrl);
        const json = await res.json();
        if (json.error) { console.warn(`Form ${form.id}:`, json.error.message); break; }

        for (const lead of (json.data || [])) {
          // Skip duplicates
          if (await leadExists(lead.id)) continue;

          // Parse field_data
          const f = {};
          for (const field of (lead.field_data || [])) f[field.name] = field.values?.[0] || "";

          const firstName = f["first_name"] || "";
          const lastName  = f["last_name"]  || "";
          const name      = f["full_name"]  || `${firstName} ${lastName}`.trim() || "Unknown";
          const phone     = f["phone_number"] || f["phone"] || "";
          const email     = f["email"] || "";
          const budget    = parseFloat(f["budget"] || "0") || null;

          // Save to Firestore
          const leadRef = db.collection(COL.LEADS).doc();
          await leadRef.set({
            id:              leadRef.id,
            name,  phone,  email,
            source:          "meta",
            status:          "new",
            budget,
            requirements:    f["requirements"] || f["message"] || "",
            location:        f["location"]     || f["city"]    || "",
            assignedTo:      null,
            assignedToName:  null,
            aiScore:         null,
            metaLeadId:      lead.id,
            metaFormId:      form.id,
            metaPageId:      account.pageId,
            metaAccount:     accountNum,
            notes:           "",
            tags:            [],
            respondedAt:     null,
            lastContactedAt: null,
            nextFollowUpAt:  null,
            createdAt:       lead.created_time,
            updatedAt:       new Date().toISOString(),
          });

          newLeads++;

          // Push notify ALL admins + managers immediately
          try {
            const tokens = await getAdminManagerTokens();
            if (tokens.length) {
              await sendPushBatch(tokens.map(token => ({
                to:        token,
                title:     "🔔 New Lead from Facebook!",
                body:      `${name} (${phone || "no phone"}) — Account ${accountNum}`,
                data:      { type: "new_lead", leadId: leadRef.id },
                sound:     "lead_alert.wav",
                priority:  "high",
                channelId: "new_leads",
              })));
            }
          } catch (e) { console.warn("Admin/manager notification failed:", e); }

          // Round-robin assignment (notifies sales person + manager inside)
          try {
            const projectDoc = await getProjectByPageId(account.pageId);
            if (projectDoc) {
              await assignRoundRobin(leadRef.id, name, phone, accountNum, projectDoc);
            }
          } catch (e) { console.warn("Assignment failed:", e); }

          // Firestore in-app notification record
          await db.collection(COL.NOTIFICATIONS).add({
            title:    `New Lead — Facebook Account ${accountNum}`,
            body:     `${name} (${phone || "no phone"}) submitted a lead form`,
            type:     "new_lead",
            leadId:   leadRef.id,
            read:     false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        nextUrl = json.paging?.next || null;
      }
    } catch (err) {
      errors.push(`Form ${form.id} (${form.name}): ${err}`);
    }
  }

  // Advance sync cursor
  if (!errors.length || newLeads > 0) await setLastSync(accountNum, syncStart);

  return { newLeads, errors };
}

// =============================================================================
// 0. CALLABLE: TEST META API CONNECTION (admin only)
// =============================================================================

exports.testMetaConnection = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const results = {};

  for (const accountNum of [1, 2]) {
    const account = META_ACCOUNTS[accountNum];
    const result  = { ok: false, forms: [], totalLeads: 0, error: null };

    try {
      // Step 1: fetch forms
      const res  = await fetch(
        `${GRAPH}/${account.pageId}/leadgen_forms?fields=id,name,status&limit=10&access_token=${account.accessToken}`
      );
      const json = await res.json();

      if (json.error) {
        result.error = `${json.error.code}: ${json.error.message}`;
      } else {
        const forms = json.data || [];
        result.forms = forms.map(f => ({ id: f.id, name: f.name, status: f.status }));
        result.ok    = true;

        // Step 2: count recent leads from first active form (quick check only)
        const activeForm = forms.find(f => f.status === "ACTIVE");
        if (activeForm) {
          const sinceUnix = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000); // last 30 days
          const filtering = encodeURIComponent(
            JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }])
          );
          const lr   = await fetch(
            `${GRAPH}/${activeForm.id}/leads?fields=id&filtering=${filtering}&limit=100&access_token=${account.accessToken}`
          );
          const lj   = await lr.json();
          result.totalLeads = (lj.data || []).length;
          if (lj.error) result.error = `leads fetch: ${lj.error.message}`;
        }
      }
    } catch (err) {
      result.error = String(err);
    }

    results[`account${accountNum}`] = result;
  }

  return results;
});

// =============================================================================
// 1. SCHEDULED: POLL META EVERY 1 MINUTE
// =============================================================================

exports.syncMetaLeads = functions.pubsub
  .schedule("every 1 minutes")
  .onRun(async () => {
    console.log("[syncMetaLeads] Polling Meta Lead Ads API…");
    const [r1, r2] = await Promise.all([syncOneAccount(1), syncOneAccount(2)]);
    console.log(
      `[syncMetaLeads] Done. Acc1: ${r1.newLeads} new leads | Acc2: ${r2.newLeads} new leads`,
      [...r1.errors, ...r2.errors].length ? `Errors: ${[...r1.errors, ...r2.errors].join("; ")}` : ""
    );
  });

// =============================================================================
// 2. CALLABLE: MANUAL SYNC (from app "Sync Now" button)
// =============================================================================

exports.triggerMetaSync = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const callerDoc = await db.collection(COL.USERS).doc(context.auth.uid).get();
  const role = callerDoc.data()?.role;
  if (!["admin", "manager"].includes(role)) {
    throw new functions.https.HttpsError("permission-denied", "Only admins or managers can trigger sync");
  }

  const [r1, r2] = await Promise.all([syncOneAccount(1), syncOneAccount(2)]);
  return {
    success: true,
    results: { account1: r1, account2: r2 },
  };
});

// =============================================================================
// 3. FIRESTORE TRIGGER: START 10-MIN ESCALATION TIMER ON ASSIGNMENT
// =============================================================================

exports.onLeadAssigned = functions.firestore
  .document("leads/{leadId}")
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after  = change.after.exists  ? change.after.data()  : null;
    if (!after) return;

    // Fire only when assignedTo is newly set and lead hasn't been responded to
    const justAssigned =
      after.assignedTo &&
      after.respondedAt === null &&
      (!before || !before.assignedTo || before.assignedTo !== after.assignedTo);

    if (!justAssigned) return;

    const escalateAt = new Date(Date.now() + 10 * 60 * 1000);
    await change.after.ref.update({
      escalateAt: admin.firestore.Timestamp.fromDate(escalateAt),
    });
    console.log(`Escalation scheduled for lead ${context.params.leadId}`);
  });

// =============================================================================
// 4. SCHEDULED: CHECK UNANSWERED LEADS EVERY 2 MINUTES
// =============================================================================

exports.checkUnansweredLeads = functions.pubsub
  .schedule("every 2 minutes")
  .onRun(async () => {
    const now  = admin.firestore.Timestamp.now();
    const snap = await db.collection(COL.LEADS)
      .where("respondedAt", "==", null)
      .where("escalateAt",  "<=", now)
      .where("status",      "==", "assigned")
      .get();

    if (snap.empty) return;
    console.log(`[escalation] Found ${snap.size} unanswered leads`);

    for (const leadDoc of snap.docs) {
      const lead = leadDoc.data();
      const { assignedTo, assignedToName, managerId, name: leadName } = lead;
      const tokensToNotify = [];

      // Sales person
      if (assignedTo) {
        const salesSnap = await db.collection(COL.USERS).doc(assignedTo).get();
        const t = salesSnap.data()?.pushToken;
        if (t) tokensToNotify.push(t);
      }

      // Manager
      if (managerId) {
        const mgrSnap = await db.collection(COL.USERS).doc(managerId).get();
        const t = mgrSnap.data()?.pushToken;
        if (t && !tokensToNotify.includes(t)) tokensToNotify.push(t);
      }

      // All admins
      const adminSnap = await db.collection(COL.USERS)
        .where("role", "==", "admin").where("isActive", "==", true).get();
      for (const d of adminSnap.docs) {
        const t = d.data()?.pushToken;
        if (t && !tokensToNotify.includes(t)) tokensToNotify.push(t);
      }

      if (tokensToNotify.length) {
        await sendPushBatch(tokensToNotify.map(token => ({
          to:        token,
          title:     "⚠️ Lead Not Responded!",
          body:      `${assignedToName || "Sales"} hasn't contacted ${leadName} in 10 minutes`,
          data:      { type: "lead_escalation", leadId: leadDoc.id },
          sound:     "escalation_alert.wav",
          priority:  "high",
          channelId: "escalations",
        })));
      }

      // Activity log
      await db.collection(COL.LEADS).doc(leadDoc.id)
        .collection("activities").add({
          type:            "escalation",
          description:     `Lead escalated — ${assignedToName || "Sales"} did not respond within 10 minutes`,
          performedBy:     "system",
          performedByName: "System",
          createdAt:       admin.firestore.FieldValue.serverTimestamp(),
        });

      // Firestore notification
      await db.collection(COL.NOTIFICATIONS).add({
        title:        "⚠️ Lead Not Responded",
        body:         `${assignedToName || "Sales"} hasn't contacted ${leadName} in 10+ minutes`,
        type:         "lead_escalation",
        leadId:       leadDoc.id,
        assignedAgent: assignedTo,
        managerId:    managerId || null,
        read:         false,
        createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mark escalated (remove escalateAt so it doesn't fire again)
      await db.collection(COL.LEADS).doc(leadDoc.id).update({
        escalateAt:  admin.firestore.FieldValue.delete(),
        escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

// =============================================================================
// 5. CALLABLE: MARK LEAD RESPONDED
// =============================================================================

exports.markLeadResponded = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const { leadId } = data;
  if (!leadId) throw new functions.https.HttpsError("invalid-argument", "leadId required");

  const leadRef  = db.collection(COL.LEADS).doc(leadId);
  const snap     = await leadRef.get();
  if (!snap.exists) throw new functions.https.HttpsError("not-found", "Lead not found");

  const lead = snap.data();
  if (lead.assignedTo !== context.auth.uid) {
    const callerDoc = await db.collection(COL.USERS).doc(context.auth.uid).get();
    const role      = callerDoc.data()?.role;
    if (!["admin", "manager"].includes(role)) {
      throw new functions.https.HttpsError("permission-denied", "Only assigned sales or admins can mark responded");
    }
  }

  await leadRef.update({
    respondedAt: new Date().toISOString(),
    respondedBy: context.auth.uid,
    escalateAt:  admin.firestore.FieldValue.delete(),
    status:      lead.status === "assigned" ? "contacted" : lead.status,
    updatedAt:   new Date().toISOString(),
  });

  return { success: true };
});

// =============================================================================
// 6. CALLABLE: SEND EXPO PUSH NOTIFICATION
// =============================================================================

exports.sendPushNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const { token, title, body, notifData, channelId = "general" } = data;
  await sendPushBatch([{
    to:        token,
    title,
    body,
    data:      notifData || {},
    channelId,
    sound:     "default",
    priority:  "high",
  }]);
  return { success: true };
});

// =============================================================================
// 7. CALLABLE: CREATE USER (Admin only)
// =============================================================================

exports.createUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const callerDoc = await db.collection(COL.USERS).doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can create users");
  }

  const { email, password, displayName, role, phone, region, managerId } = data;
  if (!email || !password || !displayName || !role) {
    throw new functions.https.HttpsError("invalid-argument", "email, password, displayName, role required");
  }
  if (!["admin", "manager", "mis", "sales"].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid role");
  }

  try {
    const fbUser = await admin.auth().createUser({ email, password, displayName, emailVerified: false });
    await admin.auth().setCustomUserClaims(fbUser.uid, { role });
    await db.collection(COL.USERS).doc(fbUser.uid).set({
      uid:           fbUser.uid,
      email,
      displayName,
      role,
      phone:         phone      || "",
      region:        region     || "",
      managerId:     managerId  || null,
      assignedLeads: 0,
      isActive:      true,
      pushToken:     null,
      passwordPlain: password,
      createdAt:     new Date().toISOString(),
      lastActive:    null,
    });
    return { success: true, uid: fbUser.uid };
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      throw new functions.https.HttpsError("already-exists", "A user with this email already exists");
    }
    throw new functions.https.HttpsError("internal", err.message);
  }
});

// =============================================================================
// 8. CALLABLE: UPDATE USER PASSWORD (Admin only)
// =============================================================================

exports.updateUserPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const callerDoc = await db.collection(COL.USERS).doc(context.auth.uid).get();
  if (callerDoc.data()?.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can update passwords");
  }

  const { uid, newPassword } = data;
  if (!uid || !newPassword || newPassword.length < 6) {
    throw new functions.https.HttpsError("invalid-argument", "uid and newPassword (min 6 chars) required");
  }

  await admin.auth().updateUser(uid, { password: newPassword });
  await db.collection(COL.USERS).doc(uid).update({ passwordPlain: newPassword });
  return { success: true };
});

// =============================================================================
// 9. CALLABLE: UPDATE USER ROLE (Admin only)
// =============================================================================

exports.updateUserRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const callerDoc = await db.collection(COL.USERS).doc(context.auth.uid).get();
  if (callerDoc.data()?.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can update roles");
  }

  const { uid, role, managerId } = data;
  if (!uid || !role) throw new functions.https.HttpsError("invalid-argument", "uid and role required");
  if (!["admin", "manager", "mis", "sales"].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Invalid role");
  }
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError("failed-precondition", "Cannot change your own role");
  }

  await admin.auth().setCustomUserClaims(uid, { role });
  const update = { role, updatedAt: new Date().toISOString() };
  if (managerId !== undefined) update.managerId = managerId;
  await db.collection(COL.USERS).doc(uid).update(update);
  return { success: true };
});

// =============================================================================
// 10. CALLABLE: DEACTIVATE / REACTIVATE USER (Admin only)
// =============================================================================

exports.deactivateUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Must be logged in");

  const callerDoc = await db.collection(COL.USERS).doc(context.auth.uid).get();
  if (callerDoc.data()?.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Only admins can deactivate users");
  }

  const { uid, disabled } = data;
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "uid required");
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError("failed-precondition", "Cannot deactivate yourself");
  }

  await admin.auth().updateUser(uid, { disabled });
  await db.collection(COL.USERS).doc(uid).update({
    isActive:  !disabled,
    updatedAt: new Date().toISOString(),
  });
  return { success: true };
});

// =============================================================================
// 11. HTTP: SEND EMAIL (Gmail SMTP)
// =============================================================================

exports.sendEmail = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { to, subject, html, text } = req.body;
    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({ error: "Missing required fields: to, subject, html/text" });
    }

    const gmailUser = functions.config().gmail?.user;
    const gmailPass = functions.config().gmail?.pass;

    if (!gmailUser || !gmailPass) {
      console.log("[DEV] Email would be sent to:", to, "| Subject:", subject);
      return res.status(200).json({ success: true, messageId: "mock-" + Date.now() });
    }

    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth:    { user: gmailUser, pass: gmailPass },
      });
      const info = await transporter.sendMail({
        from:    `"Relazo CRM" <${gmailUser}>`,
        to, subject, html, text,
      });
      return res.status(200).json({ success: true, messageId: info.messageId });
    } catch (err) {
      console.error("sendEmail error:", err);
      return res.status(500).json({ error: "Failed to send email" });
    }
  });
});

// =============================================================================
// 12. HTTP: SEND WHATSAPP MESSAGE
// =============================================================================

exports.sendWhatsApp = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { to, message, accountNum = 1 } = req.body;
    if (!to || !message) return res.status(400).json({ error: "Missing: to, message" });

    const account = META_ACCOUNTS[accountNum] || META_ACCOUNTS[1];
    const url     = `${GRAPH}/${account.phoneNumberId}/messages`;

    try {
      const resp = await fetch(url, {
        method:  "POST",
        headers: { Authorization: `Bearer ${account.waAccessToken}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type:    "individual",
          to,
          type:              "text",
          text:              { body: message },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) return res.status(400).json({ success: false, error: data.error?.message });
      return res.status(200).json({ success: true, messageId: data.messages?.[0]?.id, account: accountNum });
    } catch (err) {
      console.error("sendWhatsApp error:", err);
      return res.status(500).json({ error: "Failed to send WhatsApp message" });
    }
  });
});

// =============================================================================
// 13. HTTP: WHATSAPP INCOMING WEBHOOK (account 1)
// =============================================================================

exports.whatsappWebhook1 = functions.https.onRequest((req, res) => {
  corsHandler(req, res, () => handleWhatsAppWebhook(req, res, META_ACCOUNTS[1].verifyToken, 1));
});

// 14. HTTP: WHATSAPP INCOMING WEBHOOK (account 2)
exports.whatsappWebhook2 = functions.https.onRequest((req, res) => {
  corsHandler(req, res, () => handleWhatsAppWebhook(req, res, META_ACCOUNTS[2].verifyToken, 2));
});

async function handleWhatsAppWebhook(req, res, verifyToken, accountNum) {
  // Verification handshake
  if (req.method === "GET") {
    const mode      = req.query["hub.mode"];
    const token     = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === verifyToken) return res.status(200).send(challenge);
    return res.sendStatus(403);
  }

  if (req.method === "POST") {
    try {
      const body = req.body;
      if (body.object === "whatsapp_business_account") {
        for (const entry of (body.entry || [])) {
          for (const change of (entry.changes || [])) {
            if (change.field === "messages") {
              for (const msg of (change.value.messages || [])) {
                await processIncomingWhatsApp(msg, change.value.contacts?.[0], accountNum);
              }
            }
          }
        }
      }
      return res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error(`whatsappWebhook${accountNum} error:`, err);
      return res.status(500).json({ error: "Internal error" });
    }
  }
  return res.sendStatus(405);
}

async function processIncomingWhatsApp(message, contact, accountNum) {
  const phone      = "+" + message.from;
  const text       = message.text?.body || "";
  const senderName = contact?.profile?.name || phone;

  const snap = await db.collection(COL.LEADS).where("phone", "==", phone).limit(1).get();
  if (!snap.empty) {
    const leadDoc = snap.docs[0];
    await leadDoc.ref.collection("activities").add({
      type:        "whatsapp",
      description: `Incoming WhatsApp (Acc ${accountNum}): "${text.substring(0, 100)}${text.length > 100 ? "…" : ""}"`,
      performedBy: "system",
      metadata:    { messageId: message.id, direction: "incoming", account: accountNum },
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    await leadDoc.ref.update({
      lastContactedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // New lead via WhatsApp
    const leadRef = db.collection(COL.LEADS).doc();
    await leadRef.set({
      id:              leadRef.id,
      name:            senderName,
      phone,
      email:           "",
      source:          "whatsapp",
      status:          "new",
      budget:          null,
      requirements:    text.substring(0, 500),
      location:        "",
      assignedTo:      null,
      assignedToName:  null,
      aiScore:         null,
      metaAccount:     accountNum,
      notes:           "",
      tags:            [],
      respondedAt:     null,
      lastContactedAt: null,
      nextFollowUpAt:  null,
      createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
    });

    // Notify admins + managers
    const tokens = await getAdminManagerTokens();
    if (tokens.length) {
      await sendPushBatch(tokens.map(token => ({
        to:        token,
        title:     "💬 New WhatsApp Lead!",
        body:      `${senderName} (${phone}) — Account ${accountNum}`,
        data:      { type: "new_lead", leadId: leadRef.id },
        sound:     "lead_alert.wav",
        priority:  "high",
        channelId: "new_leads",
      })));
    }
  }
}

// =============================================================================
// 15. HTTP: META WEBHOOK VERIFICATION (kept for future use / manual verify)
// =============================================================================

exports.metaWebhookVerify = functions.https.onRequest((req, res) => {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const matched =
    token === META_ACCOUNTS[1].verifyToken ||
    token === META_ACCOUNTS[2].verifyToken;

  if (mode === "subscribe" && matched) {
    console.log("✅ Meta webhook verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

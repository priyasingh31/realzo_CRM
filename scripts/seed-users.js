/**
 * Relazo CRM — Seed Initial Users Script
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates users in Firebase Auth + Firestore with role-based access.
 *
 * Roles: admin | manager | mis | sales
 *
 * Usage:
 *   cd RelazoApp
 *   npm install firebase-admin --save-dev   (run once)
 *   node scripts/seed-users.js
 *
 * Requires:
 *   scripts/serviceAccountKey.json
 *   (Firebase Console → Project Settings → Service Accounts → Generate new private key)
 */

const admin = require('firebase-admin');

// ─── Load service account ─────────────────────────────────────────────────────
let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch {
  console.error('\n❌  Missing scripts/serviceAccountKey.json');
  console.error('   Download from: Firebase Console → Project Settings → Service Accounts\n');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const authAdmin = admin.auth();

// ─────────────────────────────────────────────────────────────────────────────
// 👇 EDIT THIS — your team structure
// ─────────────────────────────────────────────────────────────────────────────
const USERS = [
  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    email:       'admin@relazo.com',
    password:    'Admin@relazo2024!',
    displayName: 'Admin User',
    role:        'admin',
    phone:       '+971501111111',
    region:      'Dubai',
    managerId:   null,
  },
  // ── MIS ───────────────────────────────────────────────────────────────────
  {
    email:       'mis@relazo.com',
    password:    'Mis@relazo2024!',
    displayName: 'MIS Analyst',
    role:        'mis',
    phone:       '+971501111112',
    region:      'Dubai',
    managerId:   null,
  },
  // ── Manager 1 ─────────────────────────────────────────────────────────────
  {
    email:       'manager1@relazo.com',
    password:    'Manager@relazo2024!',
    displayName: 'Ahmed Al Mansoor',
    role:        'manager',
    phone:       '+971502222221',
    region:      'Dubai Marina',
    managerId:   null,  // managers have no manager above them
    _key:        'manager1',   // internal reference key
  },
  // ── Manager 2 ─────────────────────────────────────────────────────────────
  {
    email:       'manager2@relazo.com',
    password:    'Manager@relazo2024!',
    displayName: 'Sara Al Hamdan',
    role:        'manager',
    phone:       '+971502222222',
    region:      'Downtown Dubai',
    managerId:   null,
    _key:        'manager2',
  },
  // ── Sales — under Manager 1 ───────────────────────────────────────────────
  {
    email:       'sales1@relazo.com',
    password:    'Sales@relazo2024!',
    displayName: 'Omar Farooq',
    role:        'sales',
    phone:       '+971503333331',
    region:      'Dubai Marina',
    managerId:   null,  // will be resolved from _managerKey
    _managerKey: 'manager1',
  },
  {
    email:       'sales2@relazo.com',
    password:    'Sales@relazo2024!',
    displayName: 'Fatima Noor',
    role:        'sales',
    phone:       '+971503333332',
    region:      'Dubai Marina',
    managerId:   null,
    _managerKey: 'manager1',
  },
  {
    email:       'sales3@relazo.com',
    password:    'Sales@relazo2024!',
    displayName: 'Bilal Shaikh',
    role:        'sales',
    phone:       '+971503333333',
    region:      'JBR',
    managerId:   null,
    _managerKey: 'manager1',
  },
  // ── Sales — under Manager 2 ───────────────────────────────────────────────
  {
    email:       'sales4@relazo.com',
    password:    'Sales@relazo2024!',
    displayName: 'Aisha Rahman',
    role:        'sales',
    phone:       '+971503333334',
    region:      'Downtown Dubai',
    managerId:   null,
    _managerKey: 'manager2',
  },
  {
    email:       'sales5@relazo.com',
    password:    'Sales@relazo2024!',
    displayName: 'Hassan Al Zein',
    role:        'sales',
    phone:       '+971503333335',
    region:      'Business Bay',
    managerId:   null,
    _managerKey: 'manager2',
  },
  // ── Add more users here ────────────────────────────────────────────────────
];
// ─────────────────────────────────────────────────────────────────────────────

async function createUser(userData, uidMap) {
  const { email, password, displayName, role, phone, region, managerId, _key, _managerKey, ...rest } = userData;

  // Resolve manager UID from key
  const resolvedManagerId = _managerKey ? uidMap[_managerKey] || null : managerId;

  try {
    let fbUser;
    try {
      fbUser = await authAdmin.createUser({ email, password, displayName, emailVerified: true });
      console.log(`  ✅  Auth created: ${email} → ${fbUser.uid}`);
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        fbUser = await authAdmin.getUserByEmail(email);
        console.log(`  ⚠️   Already exists: ${email} → ${fbUser.uid}`);
      } else throw err;
    }

    // Set custom claim
    await authAdmin.setCustomUserClaims(fbUser.uid, { role });

    // Create Firestore profile — passwordPlain stored for admin visibility
    await db.collection('users').doc(fbUser.uid).set({
      uid:           fbUser.uid,
      email,
      displayName,
      role,
      phone:         phone || '',
      region:        region || '',
      managerId:     resolvedManagerId,
      assignedLeads: 0,
      isActive:      true,
      pushToken:     null,
      passwordPlain: password,   // admin-visible credential record
      createdAt:     new Date().toISOString(),
      lastActive:    null,
    }, { merge: true });

    // Store UID so sales persons can reference it
    if (_key) uidMap[_key] = fbUser.uid;

    console.log(`  ✅  Firestore: role="${role}"${resolvedManagerId ? ` managerId="${resolvedManagerId}"` : ''}`);
    return { email, uid: fbUser.uid, role, success: true };

  } catch (err) {
    console.error(`  ❌  Failed: ${email} — ${err.message}`);
    return { email, success: false, error: err.message };
  }
}

async function main() {
  console.log('\n🚀  Relazo CRM — Seeding Users\n');
  console.log(`   Project: ${serviceAccount.project_id}`);
  console.log(`   Users:   ${USERS.length}\n`);

  const uidMap = {}; // _key → uid
  const results = [];

  // Create in order so managers exist before sales persons reference them
  for (const user of USERS) {
    console.log(`\n👤  ${user.displayName} <${user.email}> [${user.role}]`);
    results.push(await createUser(user, uidMap));
  }

  // Print summary
  console.log('\n════════════════════════════════════════');
  console.log('📋  Results\n');
  const ok = results.filter(r => r.success);
  const fail = results.filter(r => !r.success);
  ok.forEach(r => console.log(`  ✅  ${r.role.padEnd(8)}  ${r.email}`));
  fail.forEach(r => console.log(`  ❌  ${r.email}  →  ${r.error}`));

  console.log('\n════════════════════════════════════════');
  console.log('🔑  Login Credentials\n');
  console.log('  Role       Email                            Password');
  console.log('  ─────────  ───────────────────────────────  ──────────────────────');
  USERS.filter(u => ok.find(r => r.email === u.email)).forEach(u => {
    console.log(`  ${u.role.padEnd(9)}  ${u.email.padEnd(33)}  ${u.password}`);
  });

  console.log(`\n  ✅ ${ok.length} created   ❌ ${fail.length} failed\n`);
  process.exit(fail.length > 0 ? 1 : 0);
}

main().catch(err => { console.error('\n💥', err); process.exit(1); });

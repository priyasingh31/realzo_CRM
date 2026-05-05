/**
 * Seed Script: Create Test Users for All Roles
 *
 * Prerequisites:
 *   1. Download a Firebase service account key:
 *      Firebase Console → Project Settings → Service Accounts → Generate new private key
 *      Save it as: functions/serviceAccountKey.json
 *   2. Run from the functions/ folder:
 *      node seed-users.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db = admin.firestore();

// ─── Test Users ───────────────────────────────────────────────────────────────
const TEST_USERS = [
  {
    displayName: 'Admin User',
    email: 'admin@relazo.test',
    password: 'Test@1234',
    role: 'admin',
    phone: '+1234567890',
    region: 'All Regions',
  },
  {
    displayName: 'Manager User',
    email: 'manager@relazo.test',
    password: 'Test@1234',
    role: 'manager',
    phone: '+1234567891',
    region: 'North Zone',
  },
  {
    displayName: 'Agent One',
    email: 'agent1@relazo.test',
    password: 'Test@1234',
    role: 'agent',
    phone: '+1234567892',
    region: 'North Zone',
  },
  {
    displayName: 'Agent Two',
    email: 'agent2@relazo.test',
    password: 'Test@1234',
    role: 'agent',
    phone: '+1234567893',
    region: 'South Zone',
  },
];

// ─── Create each user ─────────────────────────────────────────────────────────
async function createUser(userData) {
  const { email, password, displayName, role, phone, region } = userData;

  try {
    // 1. Create Firebase Auth user
    let authUser;
    try {
      authUser = await auth.createUser({ email, password, displayName });
      console.log(`  ✓ Auth user created: ${email} (uid: ${authUser.uid})`);
    } catch (err) {
      if (err.code === 'auth/email-already-exists') {
        authUser = await auth.getUserByEmail(email);
        console.log(`  ↺ Auth user already exists: ${email} (uid: ${authUser.uid})`);
      } else {
        throw err;
      }
    }

    const now = new Date().toISOString();

    // 2. Write Firestore user document
    await db.collection('users').doc(authUser.uid).set(
      {
        uid: authUser.uid,
        email,
        displayName,
        role,
        phone: phone || null,
        region: region || null,
        photoURL: null,
        assignedLeads: 0,
        createdAt: now,
        lastActive: now,
      },
      { merge: true }
    );
    console.log(`  ✓ Firestore profile written for ${displayName} (role: ${role})`);

    return { uid: authUser.uid, email, role };
  } catch (err) {
    console.error(`  ✗ Failed for ${email}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('\n🌱 Relazo CRM — Seeding Test Users\n');
  console.log('─'.repeat(50));

  const results = [];
  for (const user of TEST_USERS) {
    console.log(`\n[${user.role.toUpperCase()}] ${user.displayName}`);
    const result = await createUser(user);
    if (result) results.push(result);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('\n✅ Done! Login credentials:\n');
  console.log('Role      | Email                    | Password');
  console.log('----------|--------------------------|----------');
  TEST_USERS.forEach((u) => {
    const role = u.role.padEnd(9);
    const email = u.email.padEnd(25);
    console.log(`${role} | ${email} | ${u.password}`);
  });
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

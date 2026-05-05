/**
 * Round-Robin Lead Assignment Service
 * Assigns incoming leads to sales persons in rotation per project.
 * Uses Firestore transaction to guarantee atomic index increment.
 */

import {
  doc, getDoc, updateDoc, collection,
  query, where, getDocs, runTransaction,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Lead, Project } from '@/types';

// ─── Assign lead to next sales person in round-robin ─────────────────────────
export async function assignLeadRoundRobin(
  leadId: string,
  projectId: string
): Promise<{ assignedTo: string; assignedToName: string } | null> {
  const projectRef = doc(db, 'projects', projectId);

  try {
    return await runTransaction(db, async (tx) => {
      const projectSnap = await tx.get(projectRef);
      if (!projectSnap.exists()) throw new Error('Project not found');

      const project = projectSnap.data() as Project;
      const { salesPersonIds, roundRobinIndex } = project;

      if (!salesPersonIds || salesPersonIds.length === 0) {
        throw new Error('No sales persons assigned to this project');
      }

      // Get next index (wrap around)
      const nextIndex = roundRobinIndex % salesPersonIds.length;
      const assignedUid = salesPersonIds[nextIndex];

      // Fetch sales person profile
      const userSnap = await tx.get(doc(db, 'users', assignedUid));
      if (!userSnap.exists()) {
        // Skip this user, increment anyway
        tx.update(projectRef, { roundRobinIndex: nextIndex + 1 });
        throw new Error(`Sales person ${assignedUid} not found`);
      }
      const salesPerson = userSnap.data();

      // Update project index
      tx.update(projectRef, { roundRobinIndex: nextIndex + 1 });

      // Update lead with assignment
      const leadRef = doc(db, 'leads', leadId);
      tx.update(leadRef, {
        assignedTo: assignedUid,
        assignedToName: salesPerson.displayName,
        managerId: project.managerId || null,
        projectId,
        projectName: project.name,
        status: 'assigned',
        respondedAt: null,  // null triggers escalation timer
        updatedAt: new Date().toISOString(),
      });

      // Log activity
      const activityRef = doc(collection(db, 'leads', leadId, 'activities'));
      tx.set(activityRef, {
        type: 'assigned',
        description: `Lead assigned to ${salesPerson.displayName} via round-robin`,
        performedBy: 'system',
        performedByName: 'System',
        metadata: { projectId, roundRobinIndex: nextIndex },
        createdAt: new Date().toISOString(),
      });

      return {
        assignedTo: assignedUid,
        assignedToName: salesPerson.displayName as string,
      };
    });
  } catch (error) {
    console.error('Round-robin assignment failed:', error);
    return null;
  }
}

// ─── Get project by meta page ID ─────────────────────────────────────────────
export async function getProjectByPageId(pageId: string): Promise<Project | null> {
  const snap = await getDocs(
    query(collection(db, 'projects'), where('metaPageId', '==', pageId), where('isActive', '==', true))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Project;
}

// ─── Get project by Meta campaign ID (more specific than page match) ──────────
export async function getProjectByCampaignId(campaignId: string): Promise<Project | null> {
  const snap = await getDocs(
    query(collection(db, 'projects'), where('campaignIds', 'array-contains', campaignId), where('isActive', '==', true))
  );
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Project;
}

// ─── Get all active projects ──────────────────────────────────────────────────
export async function fetchProjects(): Promise<Project[]> {
  const snap = await getDocs(
    query(collection(db, 'projects'), where('isActive', '==', true))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
}

// ─── Manually reassign lead ───────────────────────────────────────────────────
export async function reassignLead(
  leadId: string,
  newAgentId: string,
  newAgentName: string,
  reassignedBy: string
): Promise<void> {
  const leadRef = doc(db, 'leads', leadId);
  await updateDoc(leadRef, {
    assignedTo: newAgentId,
    assignedToName: newAgentName,
    respondedAt: null,
    status: 'assigned',
    updatedAt: new Date().toISOString(),
  });

  // Log activity
  const actRef = doc(collection(db, 'leads', leadId, 'activities'));
  await updateDoc(actRef, {
    type: 'assigned',
    description: `Lead reassigned to ${newAgentName}`,
    performedBy: reassignedBy,
    createdAt: new Date().toISOString(),
  });
}

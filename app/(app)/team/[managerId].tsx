import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ManagerTeamView } from './index';
import { useEffect, useState } from 'react';

export default function ManagerDetailScreen() {
  const { managerId } = useLocalSearchParams<{ managerId: string }>();
  const [managerName, setManagerName] = useState('Manager');

  useEffect(() => {
    if (!managerId) return;
    getDocs(query(collection(db, 'users'), where('uid', '==', managerId)))
      .then(snap => { if (!snap.empty) setManagerName(snap.docs[0].data().displayName); })
      .catch(console.error);
  }, [managerId]);

  if (!managerId) return null;
  return <ManagerTeamView managerId={managerId} managerName={managerName} />;
}

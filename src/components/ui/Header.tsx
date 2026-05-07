import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: { icon: string; onPress: () => void };
  rightAction2?: { icon: string; onPress: () => void };
};

export const Header = ({ title, subtitle, showBack, rightAction, rightAction2 }: Props) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
      <View style={styles.inner}>
        {showBack && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={20} color="#fff" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {rightAction2 && (
          <TouchableOpacity onPress={rightAction2.onPress} style={styles.backBtn}>
            <Ionicons name={rightAction2.icon as any} size={20} color="#fff" />
          </TouchableOpacity>
        )}
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress} style={styles.backBtn}>
            <Ionicons name={rightAction.icon as any} size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    marginRight: 12,
    padding: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 12,
    color: '#CBD5F5',
    marginTop: 2,
  },
});

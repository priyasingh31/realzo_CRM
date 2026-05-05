import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Pressable } from 'react-native';
import { Colors } from '@/constants/colors';
import { Radius, Shadow, Spacing } from '@/constants/theme';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padding?: number | 'none';
  variant?: 'white' | 'navy' | 'teal';
}

export function Card({ children, style, onPress, padding = Spacing.base, variant = 'white' }: CardProps) {
  const content = (
    <View style={[
      styles.card,
      variant === 'white' && styles.white,
      variant === 'navy' && styles.navy,
      variant === 'teal' && styles.teal,
      padding !== 'none' && { padding: typeof padding === 'number' ? padding : Spacing.base },
      style,
    ]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.9 : 1 }]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    ...Shadow.md,
  },
  white: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  navy: {
    backgroundColor: Colors.navyMid,
  },
  teal: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
});

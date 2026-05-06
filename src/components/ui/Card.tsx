import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  padding?: 'none' | 'sm' | 'md';
};

export const Card = ({ children, style, padding = 'md' }: Props) => {
  return (
    <View
      style={[
        styles.card,
        padding === 'sm' && styles.paddingSm,
        padding === 'md' && styles.paddingMd,
        padding === 'none' && styles.paddingNone,
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    ...(Platform.OS === 'web' && {
      boxShadow: '0px 8px 24px rgba(0,0,0,0.06)',
    }),
  },
  paddingMd: {
    padding: 16,
  },
  paddingSm: {
    padding: 10,
  },
  paddingNone: {
    padding: 0,
  },
});

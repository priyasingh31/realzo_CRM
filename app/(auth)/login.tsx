import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, TouchableOpacity, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Toast from 'react-native-toast-message';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type FormData = z.infer<typeof schema>;

export default function LoginScreen() {
  const { signIn, resetPassword } = useAuth();
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const {
    control, handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    const result = await signIn(data.email, data.password);
    if (!result.success) {
      Toast.show({ type: 'error', text1: 'Sign In Failed', text2: result.error });
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail.includes('@')) {
      Toast.show({ type: 'error', text1: 'Invalid Email', text2: 'Enter a valid email address' });
      return;
    }
    setResetLoading(true);
    const result = await resetPassword(resetEmail);
    setResetLoading(false);
    if (result.success) {
      Toast.show({ type: 'success', text1: 'Email Sent', text2: 'Check your inbox for the reset link' });
      setShowReset(false);
    } else {
      Toast.show({ type: 'error', text1: 'Error', text2: result.error });
    }
  };

  return (
    <LinearGradient colors={[Colors.navy, Colors.navyMid, '#1A3A5C']} style={styles.gradient}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoWrap}>
            <Image
              source={require('../../assets/relazo_white_bg_logo.png')}
              style={styles.logoImg}
              resizeMode="contain"
            />
            <Text style={styles.logoTagline}>Real Estate Intelligence Platform</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {!showReset ? (
              <>
                <Text style={styles.heading}>Welcome Back</Text>
                <Text style={styles.subheading}>Sign in to your account</Text>

                <Controller
                  control={control}
                  name="email"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      label="Email Address"
                      placeholder="you@example.com"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      leftIcon="mail-outline"
                      error={errors.email?.message}
                      required
                    />
                  )}
                />

                <Controller
                  control={control}
                  name="password"
                  render={({ field: { value, onChange, onBlur } }) => (
                    <Input
                      label="Password"
                      placeholder="Enter your password"
                      value={value}
                      onChangeText={onChange}
                      onBlur={onBlur}
                      secureTextEntry
                      leftIcon="lock-closed-outline"
                      error={errors.password?.message}
                      required
                    />
                  )}
                />

                <TouchableOpacity onPress={() => setShowReset(true)} style={styles.forgotWrap}>
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                <Button
                  title="Sign In"
                  onPress={handleSubmit(onSubmit)}
                  loading={isSubmitting}
                  fullWidth
                  size="lg"
                  icon="log-in-outline"
                  iconPosition="right"
                />

                <View style={styles.demoHint}>
                  <Text style={styles.demoText}>
                    Contact your administrator for access credentials.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => setShowReset(false)} style={styles.backBtn}>
                  <Text style={styles.backText}>← Back to sign in</Text>
                </TouchableOpacity>
                <Text style={styles.heading}>Reset Password</Text>
                <Text style={styles.subheading}>Enter your email to receive a reset link</Text>

                <Input
                  label="Email Address"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  leftIcon="mail-outline"
                />

                <Button
                  title="Send Reset Link"
                  onPress={handlePasswordReset}
                  loading={resetLoading}
                  fullWidth
                  size="lg"
                />
              </>
            )}
          </View>

          <Text style={styles.footer}>
            Relazo CRM © {new Date().getFullYear()} · Powered by Firebase + Expo
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: isWeb ? Spacing['4xl'] : Spacing.lg,
    paddingVertical: Spacing['3xl'],
    ...(isWeb && { alignItems: 'center' } as any),
  },
  logoWrap: { alignItems: 'center', marginBottom: Spacing['2xl'], width: '100%' },
  logoImg: { width: 200, height: 66, marginBottom: Spacing.sm },
  logoTagline: { fontSize: FontSize.sm, color: Colors.white + '99', marginTop: 4 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    width: '100%',
    ...(isWeb && { maxWidth: 480, alignSelf: 'center' } as any),
  },
  heading: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.navy, marginBottom: 4 },
  subheading: { fontSize: FontSize.base, color: Colors.gray500, marginBottom: Spacing.xl },
  forgotWrap: { alignSelf: 'flex-end', marginBottom: Spacing.base, marginTop: -Spacing.sm },
  forgotText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium },
  demoHint: { marginTop: Spacing.md, padding: Spacing.sm, backgroundColor: Colors.primaryLight, borderRadius: Radius.md },
  demoText: { fontSize: FontSize.xs, color: Colors.gray600, textAlign: 'center' },
  backBtn: { marginBottom: Spacing.base },
  backText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium },
  footer: { textAlign: 'center', color: Colors.white + '55', fontSize: FontSize.xs, marginTop: Spacing.xl, width: '100%' },
});

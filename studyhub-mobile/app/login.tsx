import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { login } from '@/lib/api';
import { saveAuthToken } from '@/lib/auth';

export default function LoginScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim()) {
      setError(t('emailRequired'));
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      await saveAuthToken(result.token);
      router.replace('/(tabs)');
    } catch {
      setError(t('loginError'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 justify-center bg-canvas px-6">
      <View className="mb-8 self-start rounded-2xl bg-brand px-4 py-3">
        <Text className="text-xl font-black text-white">S</Text>
      </View>
      <Text className="text-3xl font-extrabold tracking-tight text-ink">{t('appName')}</Text>
      <Text className="mt-2 max-w-sm text-base leading-6 text-muted">{t('signInHint')}</Text>

      <View className="mt-9 gap-4 rounded-3xl border border-line bg-white p-5">
        <View>
          <Text className="mb-2 text-sm font-semibold text-ink">{t('email')}</Text>
          <TextInput
            accessibilityLabel={t('email')}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#9AA7B8"
            value={email}
            className="rounded-xl border border-line bg-white px-4 py-3 text-base text-ink"
          />
        </View>
        <View>
          <Text className="mb-2 text-sm font-semibold text-ink">{t('password')}</Text>
          <TextInput
            accessibilityLabel={t('password')}
            autoComplete="password"
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#9AA7B8"
            secureTextEntry
            value={password}
            className="rounded-xl border border-line bg-white px-4 py-3 text-base text-ink"
          />
        </View>
        {error ? <Text accessibilityRole="alert" className="text-sm text-red-600">{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          className="mt-1 min-h-12 items-center justify-center rounded-xl bg-brand px-4 py-3 active:bg-blue-800"
          disabled={loading}
          onPress={handleLogin}
        >
          {loading ? <ActivityIndicator color="white" /> : <Text className="font-bold text-white">{t('signIn')}</Text>}
        </Pressable>
      </View>
      <Text className="mt-5 text-center text-xs leading-5 text-muted">StudyHub Mobile · Expo starter</Text>
    </View>
  );
}

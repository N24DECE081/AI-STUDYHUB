import '../global.css';
import '../i18n';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { getAuthToken, subscribeToAuth } from '@/lib/auth';

export default function RootLayout() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuth((nextToken) => setToken(nextToken));
    void getAuthToken().then((savedToken) => {
      setToken(savedToken);
      setReady(true);
    });
    return unsubscribe;
  }, []);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#2563EB" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={Boolean(token)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings' }} />
        <Stack.Screen name="about" options={{ headerShown: true, title: 'About StudyHub' }} />
      </Stack.Protected>
      <Stack.Protected guard={!token}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

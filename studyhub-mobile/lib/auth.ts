import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'studyhub.session-token';
const listeners = new Set<(token: string | null) => void>();

export function getAuthToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveAuthToken(token: string) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  listeners.forEach((listener) => listener(token));
}

export async function clearAuthToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  listeners.forEach((listener) => listener(null));
}

export function subscribeToAuth(listener: (token: string | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

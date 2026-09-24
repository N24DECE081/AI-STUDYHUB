import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function AboutScreen() {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center bg-canvas px-7">
      <View className="mb-5 h-16 w-16 items-center justify-center rounded-3xl bg-brand">
        <MaterialCommunityIcons name="school-outline" size={32} color="white" />
      </View>
      <Text className="text-2xl font-extrabold text-ink">{t('appName')}</Text>
      <Text className="mt-3 max-w-xs text-center text-base leading-6 text-muted">{t('aboutHint')}</Text>
      <Text className="mt-8 text-xs font-semibold tracking-wide text-muted">VERSION 1.0.0 · EXPO STARTER</Text>
    </View>
  );
}

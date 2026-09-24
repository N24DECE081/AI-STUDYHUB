import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { clearAuthToken } from '@/lib/auth';

function MoreLink({ href, icon, label }: { href: '/settings' | '/about'; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }) {
  return (
    <Link href={href} asChild>
      <Pressable className="flex-row items-center rounded-2xl border border-line bg-white p-4 active:bg-slate-50">
        <View className="mr-4 h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
          <MaterialCommunityIcons name={icon} size={22} color="#2563EB" />
        </View>
        <Text className="flex-1 text-base font-semibold text-ink">{label}</Text>
        <MaterialCommunityIcons name="chevron-right" size={22} color="#8996A8" />
      </Pressable>
    </Link>
  );
}

export default function MoreScreen() {
  const { t } = useTranslation();
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="gap-3 px-5 pb-8 pt-16">
      <Text className="mb-1 text-2xl font-extrabold text-ink">{t('more')}</Text>
      <MoreLink href="/settings" icon="cog-outline" label={t('settings')} />
      <MoreLink href="/about" icon="information-outline" label={t('about')} />
      <Pressable
        accessibilityRole="button"
        className="mt-3 min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-red-100 bg-white px-4 py-3"
        onPress={() => void clearAuthToken()}
      >
        <MaterialCommunityIcons name="logout" size={19} color="#DC2626" />
        <Text className="font-semibold text-red-600">{t('signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

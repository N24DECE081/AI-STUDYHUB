import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function HomeScreen() {
  const { t } = useTranslation();
  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="px-5 pb-8 pt-16">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-semibold text-muted">{t('today')}</Text>
          <Text className="mt-1 text-2xl font-extrabold text-ink">{t('appName')}</Text>
        </View>
        <View className="h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
          <MaterialCommunityIcons name="school-outline" size={24} color="#2563EB" />
        </View>
      </View>

      <Text className="mt-6 max-w-xs text-base leading-6 text-muted">{t('welcome')}</Text>

      <View className="mt-7 overflow-hidden rounded-3xl bg-ink p-6">
        <View className="flex-row items-center justify-between">
          <View className="rounded-full bg-white/15 px-3 py-1.5">
            <Text className="text-xs font-bold uppercase tracking-wider text-blue-100">{t('studyPlan')}</Text>
          </View>
          <MaterialCommunityIcons name="creation" size={22} color="#A5D8FF" />
        </View>
        <Text className="mt-5 text-2xl font-bold leading-8 text-white">{t('continueLearning')}</Text>
        <Text className="mt-2 text-sm leading-5 text-blue-100">{t('studyPlanHint')}</Text>
        <View className="mt-5 h-2 overflow-hidden rounded-full bg-white/20">
          <View className="h-full w-2/5 rounded-full bg-emerald-300" />
        </View>
        <Text className="mt-2 text-xs font-medium text-blue-100">2 / 5 {t('weeklyGoal')}</Text>
      </View>

      <View className="mt-5 flex-row gap-3">
        <View className="flex-1 rounded-3xl border border-line bg-white p-5">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-amber-100">
            <MaterialCommunityIcons name="fire" size={22} color="#E89518" />
          </View>
          <Text className="mt-4 text-2xl font-extrabold text-ink">3</Text>
          <Text className="mt-1 text-xs text-muted">{t('streak')}</Text>
        </View>
        <View className="flex-1 rounded-3xl border border-line bg-white p-5">
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
            <MaterialCommunityIcons name="clock-outline" size={22} color="#15966A" />
          </View>
          <Text className="mt-4 text-2xl font-extrabold text-ink">80</Text>
          <Text className="mt-1 text-xs text-muted">{t('minutes')}</Text>
        </View>
      </View>

      <View className="mt-6 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-ink">{t('weeklyGoal')}</Text>
        <Text className="text-sm font-semibold text-brand">40%</Text>
      </View>
      <View className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <View className="h-full w-2/5 rounded-full bg-brand" />
      </View>
    </ScrollView>
  );
}

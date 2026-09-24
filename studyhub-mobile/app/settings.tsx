import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  return (
    <View className="flex-1 bg-canvas p-5">
      <Text className="mb-2 text-2xl font-extrabold text-ink">{t('settings')}</Text>
      <Text className="mb-6 text-sm leading-5 text-muted">{t('settingsHint')}</Text>
      <Text className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{t('language')}</Text>
      <View className="gap-3 rounded-3xl border border-line bg-white p-4">
        <Pressable onPress={() => void i18n.changeLanguage('en')} className={`rounded-xl px-4 py-3 ${i18n.language === 'en' ? 'bg-blue-50' : 'bg-white'}`}>
          <Text className={`font-semibold ${i18n.language === 'en' ? 'text-brand' : 'text-ink'}`}>{t('english')}</Text>
        </Pressable>
        <Pressable onPress={() => void i18n.changeLanguage('vi')} className={`rounded-xl px-4 py-3 ${i18n.language === 'vi' ? 'bg-blue-50' : 'bg-white'}`}>
          <Text className={`font-semibold ${i18n.language === 'vi' ? 'text-brand' : 'text-ink'}`}>{t('vietnamese')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

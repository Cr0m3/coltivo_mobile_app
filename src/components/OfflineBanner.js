import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {useTranslation} from 'react-i18next';

export default function OfflineBanner({queueCount = 0}) {
  const {t} = useTranslation();
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{t('no_network')}</Text>
      {queueCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('queued_count', {count: queueCount})}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#c0392b',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  text: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  badge: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#c0392b',
    fontWeight: '700',
    fontSize: 12,
  },
});

import i18next from 'i18next';
import {initReactI18next} from 'react-i18next';
import {getLocales} from 'react-native-localize';

import en from './locales/en.json';
import de from './locales/de.json';
import pl from './locales/pl.json';
import tr from './locales/tr.json';
import hu from './locales/hu.json';
import ro from './locales/ro.json';
import cs from './locales/cs.json';

export const SUPPORTED_LANGUAGES = [
  {code: 'en', name: 'English', flag: '🇬🇧'},
  {code: 'de', name: 'Deutsch', flag: '🇩🇪'},
  {code: 'pl', name: 'Polski', flag: '🇵🇱'},
  {code: 'tr', name: 'Türkçe', flag: '🇹🇷'},
  {code: 'hu', name: 'Magyar', flag: '🇭🇺'},
  {code: 'ro', name: 'Română', flag: '🇷🇴'},
  {code: 'cs', name: 'Čeština', flag: '🇨🇿'},
];

const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map(l => l.code);

function detectSystemLanguage() {
  try {
    const locales = getLocales();
    for (const locale of locales) {
      if (SUPPORTED_CODES.includes(locale.languageCode)) {
        return locale.languageCode;
      }
    }
  } catch {
    // native module not available in test env
  }
  return 'en';
}

i18next.use(initReactI18next).init({
  lng: detectSystemLanguage(),
  fallbackLng: 'en',
  resources: {
    en: {translation: en},
    de: {translation: de},
    pl: {translation: pl},
    tr: {translation: tr},
    hu: {translation: hu},
    ro: {translation: ro},
    cs: {translation: cs},
  },
  interpolation: {escapeValue: false},
  compatibilityJSON: 'v4',
});

export default i18next;

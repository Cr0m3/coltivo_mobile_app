import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useTranslation} from 'react-i18next';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {useBarcodeScanner} from '@mgcrea/vision-camera-barcode-scanner';
import api from '../services/api';
import appConfig from '../config/appConfig';
import i18next, {SUPPORTED_LANGUAGES} from '../i18n';

function companyNameToSlug(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function LoginScreen({navigation}) {
  const {t, i18n} = useTranslation();

  const [companyName, setCompanyName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyLocked, setCompanyLocked] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [configScanVisible, setConfigScanVisible] = useState(false);
  const [configScanned, setConfigScanned] = useState(false);

  const {hasPermission, requestPermission} = useCameraPermission();
  const device = useCameraDevice('back');

  const {props: cameraScanProps} = useBarcodeScanner({
    fps: 5,
    barcodeTypes: ['qr'],
    onBarcodeScanned: useCallback(
      async barcodes => {
        if (configScanned) return;
        const raw = barcodes[0]?.value;
        if (!raw) return;
        try {
          const cfg = JSON.parse(raw);
          if (cfg.type !== 'coltivo_config' || !cfg.companyName || !cfg.serverUrl) return;
          if (
            typeof cfg.companyName !== 'string' ||
            typeof cfg.serverUrl !== 'string' ||
            cfg.companyName.trim().length === 0 ||
            cfg.companyName.trim().length > 100 ||
            cfg.serverUrl.trim().length > 2048
          ) return;

          // Validate server URL: must be a valid HTTPS URL
          const trimmedUrl = cfg.serverUrl.trim();
          let parsedUrl;
          try {
            parsedUrl = new URL(trimmedUrl);
          } catch {
            Alert.alert(t('error'), t('invalid_server_url') || 'Invalid server URL');
            return;
          }
          if (parsedUrl.protocol !== 'https:') {
            Alert.alert(t('error'), t('https_required') || 'Server URL must use HTTPS');
            return;
          }

          setConfigScanned(true);
          await AsyncStorage.setItem('saved_company_name', cfg.companyName.trim());
          await AsyncStorage.setItem('server_url', trimmedUrl);
          setCompanyName(cfg.companyName.trim());
          setCompanyLocked(true);
          setConfigScanVisible(false);
          setConfigScanned(false);
          Alert.alert(t('config_applied'), cfg.companyName.trim());
        } catch (_) {
          // not a config QR — ignore and keep scanning
        }
      },
      [configScanned, t],
    ),
  });

  async function openConfigScanner() {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(t('permission_required'), t('camera_permission'));
        return;
      }
    }
    setConfigScanned(false);
    setConfigScanVisible(true);
  }

  // On mount: restore saved company name, falling back to the build-time default
  useEffect(() => {
    AsyncStorage.getItem('saved_company_name').then(saved => {
      if (saved) {
        setCompanyName(saved);
        setCompanyLocked(true);
      } else if (appConfig.DEFAULT_COMPANY_NAME) {
        setCompanyName(appConfig.DEFAULT_COMPANY_NAME);
        setCompanyLocked(true);
      }
    });
  }, []);

  async function changeLang(code) {
    await i18next.changeLanguage(code);
    await AsyncStorage.setItem('app_language', code);
    setLangModalVisible(false);
  }

  async function handleLogin() {
    if (!companyName.trim() || !username.trim() || !password) {
      Alert.alert(t('error'), t('fields_required'));
      return;
    }

    if (username.trim().length > 100 || password.length > 500 || companyName.trim().length > 100) {
      Alert.alert(t('error'), t('fields_required'));
      return;
    }

    const organizationSlug = companyNameToSlug(companyName);

    setLoading(true);
    try {
      // Use server URL from QR config if available, otherwise fall back to build-time default
      const storedUrl = await AsyncStorage.getItem('server_url');
      if (!storedUrl) {
        await AsyncStorage.setItem('server_url', appConfig.SERVER_URL);
      }

      const response = await api.post('/users/login', {
        username: username.trim(),
        password,
        organizationSlug,
      });

      const {token, user} = response.data;

      if (user.role !== 'driver' && user.role !== 'admin' && user.role !== 'manager') {
        Alert.alert(t('access_denied'), t('drivers_only'));
        if (!companyLocked) await AsyncStorage.removeItem('server_url');
        return;
      }

      await AsyncStorage.setItem('auth_token', token);
      await AsyncStorage.setItem('auth_user', JSON.stringify(user));
      await AsyncStorage.setItem('saved_company_name', companyName.trim());

      navigation.replace('RouteList');
    } catch (err) {
      const status = err?.response?.status;
      let message;
      if (status === 401 || status === 403) {
        message = t('invalid_credentials') || t('login_failed_msg');
      } else if (status === 404) {
        message = t('company_not_found') || t('login_failed_msg');
      } else {
        message = t('login_failed_msg');
      }
      Alert.alert(t('login_failed'), message);
      if (!companyLocked) await AsyncStorage.removeItem('server_url');
    } finally {
      setLoading(false);
    }
  }

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">

        {/* Language picker button */}
        <TouchableOpacity
          style={styles.langButton}
          onPress={() => setLangModalVisible(true)}>
          <Text style={styles.langButtonText}>
            {currentLang?.flag ?? '🌐'} {(currentLang?.code ?? 'en').toUpperCase()}
          </Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('app_title')}</Text>
        <Text style={styles.subtitle}>{t('app_subtitle')}</Text>

        {/* Scan Setup QR button */}
        {!companyLocked && (
          <TouchableOpacity
            style={styles.scanConfigButton}
            onPress={openConfigScanner}>
            <Text style={styles.scanConfigText}>
              {t('scan_setup_qr')}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.form}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{t('company')}</Text>
            {companyLocked && (
              <TouchableOpacity
                onPress={() => {
                  setCompanyLocked(false);
                  setCompanyName('');
                  AsyncStorage.removeItem('saved_company_name');
                }}>
                <Text style={styles.changeLink}>{t('change')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={[styles.input, companyLocked && styles.inputLocked]}
            placeholder={t('company_placeholder')}
            value={companyName}
            onChangeText={setCompanyName}
            autoCapitalize="words"
            autoCorrect={false}
            editable={!companyLocked}
          />

          <Text style={styles.label}>{t('username')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('username_placeholder')}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>{t('password')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('login')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Config QR scanner modal */}
      <Modal
        visible={configScanVisible}
        animationType="slide"
        onRequestClose={() => setConfigScanVisible(false)}>
        <View style={styles.flex}>
          {device ? (
            <Camera
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={configScanVisible}
              {...cameraScanProps}
            />
          ) : null}
          <View style={styles.scanOverlay}>
            <Text style={styles.scanTitle}>{t('scan_setup_qr')}</Text>
            <Text style={styles.scanHint}>{t('scan_config_hint')}</Text>
            <TouchableOpacity
              style={styles.scanCloseButton}
              onPress={() => setConfigScanVisible(false)}>
              <Text style={styles.scanCloseText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Language selection modal */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLangModalVisible(false)}>
          <View style={styles.langCard}>
            <Text style={styles.langTitle}>{t('select_language')}</Text>
            {SUPPORTED_LANGUAGES.map(lang => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.langOption,
                  i18n.language === lang.code && styles.langOptionActive,
                ]}
                onPress={() => changeLang(lang.code)}>
                <Text style={styles.langOptionText}>
                  {lang.flag}{'  '}{lang.name}
                </Text>
                {i18n.language === lang.code && (
                  <Text style={styles.langCheck}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1, backgroundColor: '#f0f2f5'},
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  langButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  langButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a2e',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
    marginBottom: 6,
    marginTop: 16,
  },
  changeLink: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '600',
    marginTop: 16,
  },
  inputLocked: {
    backgroundColor: '#f0f4ff',
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a2e',
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  // Scan Setup QR
  scanConfigButton: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  scanConfigText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
  },
  scanOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 24,
    alignItems: 'center',
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  scanHint: {
    fontSize: 14,
    color: '#e5e7eb',
    marginBottom: 20,
    textAlign: 'center',
  },
  scanCloseButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  scanCloseText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },

  // Language modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  langCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  langTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 16,
    textAlign: 'center',
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  langOptionActive: {
    backgroundColor: '#eff6ff',
  },
  langOptionText: {
    fontSize: 15,
    color: '#1a1a2e',
    fontWeight: '500',
  },
  langCheck: {
    fontSize: 16,
    color: '#2563eb',
    fontWeight: '700',
  },
});

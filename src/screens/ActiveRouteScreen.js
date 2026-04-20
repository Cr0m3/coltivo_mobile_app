import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
  TextInput,
  Modal,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {useTranslation} from 'react-i18next';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';
import {useBarcodeScanner} from '@mgcrea/vision-camera-barcode-scanner';
import Geolocation from 'react-native-geolocation-service';
import api from '../services/api';
import {addToQueue} from '../services/offline';
import OfflineBanner from '../components/OfflineBanner';

const FILL_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const OVERFILL_STEPS = [110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230, 240, 250];

export default function ActiveRouteScreen({route: navRoute, navigation}) {
  const {t} = useTranslation();
  const {route} = navRoute.params;
  const bins = route.bins ?? [];

  const [currentIndex, setCurrentIndex] = useState(0);
  const [fillPercentage, setFillPercentage] = useState(50);
  const [overfill, setOverfill] = useState(false);
  const [overfillPercentage, setOverfillPercentage] = useState(110);
  const [overfillReason, setOverfillReason] = useState('');
  const [notes, setNotes] = useState('');
  const [qrScanned, setQrScanned] = useState(false);
  const [qrManual, setQrManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualReason, setManualReason] = useState('');

  const {hasPermission, requestPermission} = useCameraPermission();
  const device = useCameraDevice('back');

  const currentBin = bins[currentIndex];
  const binData = currentBin?.bin ?? currentBin;

  useEffect(() => {
    navigation.setOptions({title: t('active_route_title')});
  }, [t, navigation]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return unsubscribe;
  }, []);

  // QR barcode scanner hook — only active when scanning=true
  const {props: cameraProps} = useBarcodeScanner({
    fps: 5,
    barcodeTypes: ['qr'],
    onBarcodeScanned: useCallback(
      barcodes => {
        if (!scanning || !currentBin) {
          return;
        }
        const code = barcodes[0]?.value;
        if (!code) {
          return;
        }
        const expected = currentBin.bin?.qrCode ?? currentBin.qrCode;
        if (code === expected) {
          setQrScanned(true);
          setScanning(false);
          Alert.alert(t('qr_verified'), t('bin_scanned_ok'));
        } else {
          Alert.alert(
            t('wrong_qr'),
            t('wrong_qr_msg', {scanned: code, expected}),
          );
        }
      },
      [scanning, currentBin],
    ),
  });

  async function openScanner() {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(t('permission_required'), t('camera_permission'));
        return;
      }
    }
    setScanning(true);
  }

  async function getCurrentLocation() {
    return new Promise(resolve => {
      Geolocation.getCurrentPosition(
        pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
        () => resolve({lat: 0, lng: 0}),
        {enableHighAccuracy: true, timeout: 8000, maximumAge: 10000},
      );
    });
  }

  function openNavigation() {
    const lat = Number(binData?.coordinates?.lat);
    const lng = Number(binData?.coordinates?.lng);

    if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      Alert.alert(t('no_location'), t('no_gps'));
      return;
    }

    const url = Platform.select({
      ios: `maps://app?daddr=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&dirflg=d`,
      android: `google.navigation:q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`,
    });
    const fallback = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;

    Linking.canOpenURL(url).then(supported => {
      Linking.openURL(supported ? url : fallback);
    });
  }

  async function handleSubmit() {
    if (!currentBin) {
      return;
    }
    if (overfill && !overfillReason.trim()) {
      Alert.alert(t('required'), t('describe_container'));
      return;
    }
    setSubmitting(true);

    const location = await getCurrentLocation();
    const userRaw = await AsyncStorage.getItem('auth_user');
    let user = {};
    try {
      user = userRaw ? JSON.parse(userRaw) : {};
    } catch {
      // corrupted storage — proceed with empty user
    }

    const overfillNote = overfill ? `[Overfill >100%] ${overfillReason.trim()}` : '';
    const combinedNotes = [notes, overfillNote].filter(Boolean).join('\n');

    const payload = {
      bin: currentBin.bin?._id ?? currentBin._id ?? currentBin.bin,
      route: route._id,
      driver: user._id,
      fillPercentage: overfill ? overfillPercentage : fillPercentage,
      notes: combinedNotes,
      qrCodeScanned: qrScanned,
      location,
    };

    try {
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        await api.post('/collections/add', payload);
        Alert.alert(t('submitted'), t('collection_recorded'));
      } else {
        const count = await addToQueue(payload);
        setQueueCount(count);
        Alert.alert(t('saved_offline'), t('queued_msg', {count}));
      }
      advanceToNext();
    } catch (err) {
      // Network error mid-request — queue it
      const count = await addToQueue(payload);
      setQueueCount(count);
      Alert.alert(t('saved_offline'), t('server_error_msg', {count}));
      advanceToNext();
    } finally {
      setSubmitting(false);
    }
  }

  function handleManualSubmit() {
    const expected = binData?.qrCode ?? '—';
    if (!manualCode.trim()) {
      Alert.alert(t('required'), t('enter_bin_code'));
      return;
    }
    if (!manualReason.trim()) {
      Alert.alert(t('required'), t('enter_reason'));
      return;
    }
    if (manualCode.trim() !== expected) {
      Alert.alert(t('wrong_code'), t('wrong_code_msg', {expected}));
      return;
    }
    setQrScanned(true);
    setQrManual(true);
    setNotes(prev => {
      const reasonNote = `[Manual QR] Reason: ${manualReason.trim()}`;
      return prev ? `${prev}\n${reasonNote}` : reasonNote;
    });
    setManualModalVisible(false);
    setManualCode('');
    setManualReason('');
  }

  function advanceToNext() {
    setQrScanned(false);
    setQrManual(false);
    setFillPercentage(50);
    setOverfill(false);
    setOverfillPercentage(110);
    setOverfillReason('');
    setNotes('');
    setManualCode('');
    setManualReason('');
    if (currentIndex + 1 < bins.length) {
      setCurrentIndex(idx => idx + 1);
    } else {
      Alert.alert(t('route_complete'), t('all_bins_collected'), [
        {text: t('done'), onPress: () => navigation.navigate('RouteList')},
      ]);
    }
  }

  function handleSkip() {
    Alert.alert(t('skip_bin'), t('skip_bin_msg'), [
      {text: t('cancel'), style: 'cancel'},
      {text: t('skip'), style: 'destructive', onPress: advanceToNext},
    ]);
  }

  if (scanning) {
    return (
      <View style={styles.cameraContainer}>
        {device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={scanning}
            {...cameraProps}
          />
        ) : (
          <Text style={styles.cameraError}>{t('no_camera')}</Text>
        )}
        <TouchableOpacity
          style={styles.cancelScan}
          onPress={() => setScanning(false)}>
          <Text style={styles.cancelScanText}>{t('cancel')}</Text>
        </TouchableOpacity>
        <View style={styles.scanOverlay}>
          <Text style={styles.scanHint}>{t('scan_hint')}</Text>
        </View>
      </View>
    );
  }

  if (!currentBin) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t('no_bins')}</Text>
        <TouchableOpacity style={styles.doneButton} onPress={() => navigation.navigate('RouteList')}>
          <Text style={styles.doneButtonText}>{t('back_routes')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rawAddress = binData?.address ?? binData?.location?.address ?? t('unknown_address');
  const address =
    typeof rawAddress === 'object'
      ? [rawAddress.street, rawAddress.city, rawAddress.postalCode, rawAddress.country]
          .filter(Boolean)
          .join(', ')
      : rawAddress;
  const qrCode = binData.qrCode ?? '—';

  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner queueCount={queueCount} />}

      <View style={styles.progressBar}>
        <View
          style={[
            styles.progressFill,
            {width: `${((currentIndex + 1) / bins.length) * 100}%`},
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.progressText}>
          {t('bin_progress', {current: currentIndex + 1, total: bins.length})}
        </Text>

        <TouchableOpacity style={styles.binCard} onPress={openNavigation} activeOpacity={0.75}>
          <View style={styles.binCardRow}>
            <View style={styles.binCardText}>
              <Text style={styles.binAddress}>{address}</Text>
              <Text style={styles.binQR}>QR: {qrCode}</Text>
            </View>
            <View style={styles.navIcon}>
              <Text style={styles.navIconText}>↗</Text>
            </View>
          </View>
          <Text style={styles.navHint}>{t('tap_navigate')}</Text>
        </TouchableOpacity>

        {/* QR Scan */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('qr_verification')}</Text>
          {qrScanned ? (
            <View style={[styles.qrSuccess, qrManual && styles.qrManualSuccess]}>
              <Text style={[styles.qrSuccessText, qrManual && styles.qrManualSuccessText]}>
                {qrManual ? t('code_manual') : t('bin_scanned')}
              </Text>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.scanButton} onPress={openScanner}>
                <Text style={styles.scanButtonText}>{t('scan_qr')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.manualButton}
                onPress={() => setManualModalVisible(true)}>
                <Text style={styles.manualButtonText}>{t('enter_manual')}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Manual Code Modal */}
        <Modal
          visible={manualModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setManualModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{t('manual_entry_title')}</Text>
              <Text style={styles.modalLabel}>{t('bin_code_label')}</Text>
              <TextInput
                style={styles.modalInput}
                placeholder={t('bin_code_placeholder')}
                value={manualCode}
                onChangeText={setManualCode}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={100}
              />
              <Text style={styles.modalLabel}>{t('manual_reason_label')}</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline]}
                placeholder={t('manual_reason_placeholder')}
                value={manualReason}
                onChangeText={setManualReason}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => {
                    setManualModalVisible(false);
                    setManualCode('');
                    setManualReason('');
                  }}>
                  <Text style={styles.modalCancelText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirm} onPress={handleManualSubmit}>
                  <Text style={styles.modalConfirmText}>{t('confirm')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Fill Percentage Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {overfill
              ? t('fill_level_overfill', {level: overfillPercentage})
              : t('fill_level', {level: fillPercentage})}
          </Text>
          <View style={styles.fillBar}>
            <View
              style={[
                styles.fillFill,
                {
                  width: overfill ? `${Math.min((overfillPercentage / 250) * 100, 100)}%` : `${fillPercentage}%`,
                  backgroundColor: overfill ? '#7c3aed' : fillPercentage > 80 ? '#e74c3c' : fillPercentage > 50 ? '#f39c12' : '#2ecc71',
                },
              ]}
            />
          </View>
          {!overfill ? (
            <View style={styles.fillSteps}>
              {FILL_STEPS.map(step => (
                <TouchableOpacity
                  key={step}
                  style={[styles.fillStep, fillPercentage === step && styles.fillStepActive]}
                  onPress={() => setFillPercentage(step)}>
                  <Text
                    style={[
                      styles.fillStepText,
                      fillPercentage === step && styles.fillStepTextActive,
                    ]}>
                    {step}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.fillSteps}>
              {OVERFILL_STEPS.map(step => (
                <TouchableOpacity
                  key={step}
                  style={[styles.fillStep, styles.fillStepOverfill, overfillPercentage === step && styles.fillStepOverfillActive]}
                  onPress={() => setOverfillPercentage(step)}>
                  <Text
                    style={[
                      styles.fillStepText,
                      overfillPercentage === step && styles.fillStepOverfillTextActive,
                    ]}>
                    {step}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity
            style={[styles.overfillToggle, overfill && styles.overfillToggleActive]}
            onPress={() => setOverfill(v => !v)}>
            <Text style={[styles.overfillToggleText, overfill && styles.overfillToggleTextActive]}>
              {overfill ? t('overfill_active') : t('overfill_toggle')}
            </Text>
          </TouchableOpacity>
          {overfill && (
            <>
              <Text style={styles.overfillLabel}>{t('overfill_label')}</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMultiline, styles.overfillInput]}
                placeholder={t('overfill_placeholder')}
                value={overfillReason}
                onChangeText={setOverfillReason}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
            </>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={submitting}>
            <Text style={styles.skipButtonText}>{t('skip')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, submitting && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>
                {currentIndex + 1 === bins.length ? t('complete_route') : t('submit_next')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f0f2f5'},
  centered: {flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24},
  scrollContent: {padding: 16, paddingBottom: 40},
  progressBar: {height: 4, backgroundColor: '#ddd'},
  progressFill: {height: 4, backgroundColor: '#2563eb'},
  progressText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 13,
    marginBottom: 16,
    marginTop: 8,
  },
  binCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  binCardRow: {flexDirection: 'row', alignItems: 'center'},
  binCardText: {flex: 1},
  navIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  navIconText: {color: '#fff', fontSize: 18, fontWeight: '700'},
  navHint: {fontSize: 11, color: '#2563eb', marginTop: 8, fontWeight: '500'},
  binAddress: {fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 4},
  binQR: {fontSize: 13, color: '#888', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'},
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionLabel: {fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 12},
  qrSuccess: {
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  qrSuccessText: {color: '#166534', fontWeight: '700', fontSize: 15},
  scanButton: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  scanButtonText: {color: '#fff', fontWeight: '600', fontSize: 15},
  manualButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
  },
  manualButtonText: {color: '#2563eb', fontWeight: '600', fontSize: 14},
  qrManualSuccess: {backgroundColor: '#fef9c3'},
  qrManualSuccessText: {color: '#854d0e'},
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 20},
  modalLabel: {fontSize: 13, fontWeight: '600', color: '#444', marginBottom: 6, marginTop: 12},
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1a1a2e',
    backgroundColor: '#fafafa',
  },
  modalInputMultiline: {height: 80, textAlignVertical: 'top'},
  modalActions: {flexDirection: 'row', gap: 12, marginTop: 24},
  modalCancel: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCancelText: {color: '#555', fontWeight: '600', fontSize: 15},
  modalConfirm: {
    flex: 2,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalConfirmText: {color: '#fff', fontWeight: '700', fontSize: 15},
  fillBar: {
    height: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  fillFill: {height: '100%', borderRadius: 6},
  fillSteps: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12},
  overfillToggle: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#7c3aed',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  fillStepOverfill: {borderColor: '#7c3aed'},
  fillStepOverfillActive: {borderColor: '#7c3aed', backgroundColor: '#7c3aed'},
  fillStepOverfillTextActive: {color: '#fff', fontWeight: '700'},
  overfillToggleActive: {backgroundColor: '#7c3aed'},
  overfillToggleText: {color: '#7c3aed', fontWeight: '600', fontSize: 14},
  overfillToggleTextActive: {color: '#fff'},
  overfillLabel: {fontSize: 13, fontWeight: '600', color: '#7c3aed', marginTop: 14, marginBottom: 6},
  overfillInput: {marginTop: 0},
  fillStep: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fafafa',
  },
  fillStepActive: {borderColor: '#2563eb', backgroundColor: '#2563eb'},
  fillStepText: {fontSize: 13, color: '#333'},
  fillStepTextActive: {color: '#fff', fontWeight: '700'},
  actions: {flexDirection: 'row', gap: 12, marginTop: 8},
  skipButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipButtonText: {color: '#555', fontWeight: '600', fontSize: 15},
  submitButton: {
    flex: 2,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {opacity: 0.6},
  submitButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  cameraContainer: {flex: 1, backgroundColor: '#000'},
  cameraError: {color: '#fff', textAlign: 'center', marginTop: 80},
  cancelScan: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  cancelScanText: {color: '#fff', fontWeight: '600', fontSize: 15},
  scanOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scanHint: {
    color: '#fff',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyText: {fontSize: 16, color: '#666', marginBottom: 20},
  doneButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  doneButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});

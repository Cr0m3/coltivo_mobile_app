import React, {useMemo, useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
} from 'react-native';
import {WebView} from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import {useTranslation} from 'react-i18next';

function formatAddress(raw, unknownFallback) {
  if (!raw) {
    return unknownFallback;
  }
  if (typeof raw === 'object') {
    return [raw.street, raw.city, raw.postalCode, raw.country].filter(Boolean).join(', ');
  }
  return raw;
}

function openNavigation(bin) {
  const lat = bin?.coordinates?.lat;
  const lng = bin?.coordinates?.lng;
  if (!lat || !lng) {
    return;
  }
  const url = Platform.select({
    ios: `maps://app?daddr=${lat},${lng}&dirflg=d`,
    android: `google.navigation:q=${lat},${lng}`,
  });
  const fallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  Linking.canOpenURL(url).then(supported => {
    Linking.openURL(supported ? url : fallback);
  });
}

function buildLeafletHTML(markers) {
  if (markers.length === 0) {
    return '';
  }

  const lats = markers.map(m => m.lat);
  const lngs = markers.map(m => m.lng);
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  const markersJS = markers
    .map(
      (m, i) => `
        var icon${i} = L.divIcon({
          className: '',
          html: '<div style="background:${i === 0 ? '#2563eb' : '#e74c3c'};color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)">${i + 1}</div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        var marker${i} = L.marker([${m.lat}, ${m.lng}], {icon: icon${i}})
          .addTo(map)
          .bindPopup(${JSON.stringify(`${i + 1}. ${m.label}`)});
      `,
    )
    .join('');

  const polylinePoints = markers.map(m => `[${m.lat}, ${m.lng}]`).join(',');
  const markerRefs = markers.map((_, i) => `marker${i}`).join(',');

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    ${markersJS}

    L.polyline([${polylinePoints}], {color: '#2563eb', weight: 3, opacity: 0.8}).addTo(map);

    var group = L.featureGroup([${markerRefs}]);
    map.fitBounds(group.getBounds().pad(0.2));
  </script>
</body>
</html>`;
}

export default function RouteOverviewScreen({route: navRoute, navigation}) {
  const {t} = useTranslation();
  const {route} = navRoute.params;
  const bins = route.bins ?? [];
  const date = route.date ? new Date(route.date).toLocaleDateString() : t('no_date');
  const distance = route.calculatedDistance
    ? `${(route.calculatedDistance / 1000).toFixed(1)} km`
    : null;
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    navigation.setOptions({title: t('route_overview_title')});
  }, [t, navigation]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return unsubscribe;
  }, []);

  const markers = useMemo(() => {
    return bins
      .map(item => {
        const bin = item.bin ?? item;
        const lat = bin?.coordinates?.lat;
        const lng = bin?.coordinates?.lng;
        if (!lat || !lng) {
          return null;
        }
        return {
          lat,
          lng,
          label: formatAddress(bin.address ?? bin.location?.address, t('unknown_address')),
        };
      })
      .filter(Boolean);
  }, [bins, t]);

  const leafletHTML = useMemo(() => buildLeafletHTML(markers), [markers]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.routeName}>{route.name || `Route #${route._id?.slice(-6)}`}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{date}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaText}>{t('bins', {count: bins.length})}</Text>
          {distance ? (
            <>
              <Text style={styles.metaDot}>·</Text>
              <Text style={styles.metaText}>{distance}</Text>
            </>
          ) : null}
        </View>
        {route.notes ? <Text style={styles.routeNotes}>{route.notes}</Text> : null}
      </View>

      {/* Leaflet map */}
      {markers.length > 0 && (
        isOnline ? (
          <WebView
            style={styles.map}
            source={{html: leafletHTML, baseUrl: 'https://unpkg.com'}}
            originWhitelist={['*']}
            scrollEnabled={false}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
          />
        ) : (
          <View style={styles.mapOffline}>
            <Text style={styles.mapOfflineText}>{t('map_offline')}</Text>
          </View>
        )
      )}

      <Text style={styles.sectionTitle}>{t('stops_in_order')}</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {bins.length === 0 && (
          <Text style={styles.emptyText}>{t('no_bins_route')}</Text>
        )}
        {bins.map((item, index) => {
          const bin = item.bin ?? item;
          const address = formatAddress(bin.address ?? bin.location?.address, t('unknown_address'));
          const hasCoords = !!(bin?.coordinates?.lat && bin?.coordinates?.lng);

          return (
            <View key={bin._id ?? index} style={styles.stopCard}>
              <View style={styles.stopIndex}>
                <Text style={styles.stopIndexText}>{index + 1}</Text>
              </View>

              <View style={styles.stopInfo}>
                <Text style={styles.stopAddress}>{address}</Text>
                <Text style={styles.stopQR}>QR: {bin.qrCode ?? '—'}</Text>
                {bin.fillLevel != null && (
                  <View style={styles.fillRow}>
                    <View style={styles.fillBg}>
                      <View
                        style={[
                          styles.fillFg,
                          {
                            width: `${bin.fillLevel}%`,
                            backgroundColor:
                              bin.fillLevel > 80
                                ? '#e74c3c'
                                : bin.fillLevel > 50
                                ? '#f39c12'
                                : '#2ecc71',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.fillLabel}>{bin.fillLevel}%</Text>
                  </View>
                )}
              </View>

              {hasCoords && (
                <TouchableOpacity
                  style={styles.navBtn}
                  onPress={() => openNavigation(bin)}>
                  <Text style={styles.navBtnText}>↗</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => navigation.replace('ActiveRoute', {route})}>
          <Text style={styles.startButtonText}>{t('start_route')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f0f2f5'},
  headerCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  routeName: {fontSize: 18, fontWeight: '800', color: '#1a1a2e', marginBottom: 4},
  metaRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  metaText: {fontSize: 13, color: '#666'},
  metaDot: {fontSize: 13, color: '#bbb'},
  routeNotes: {fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 6},
  map: {
    height: 240,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  mapOffline: {
    height: 240,
    backgroundColor: '#f0f2f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  mapOfflineText: {fontSize: 14, color: '#999'},
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: {paddingHorizontal: 16, paddingBottom: 24, gap: 10},
  emptyText: {color: '#999', textAlign: 'center', marginTop: 40},
  stopCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  stopIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stopIndexText: {color: '#fff', fontWeight: '800', fontSize: 14},
  stopInfo: {flex: 1},
  stopAddress: {fontSize: 14, fontWeight: '600', color: '#1a1a2e', marginBottom: 2},
  stopQR: {
    fontSize: 12,
    color: '#888',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  fillRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2},
  fillBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  fillFg: {height: '100%', borderRadius: 3},
  fillLabel: {fontSize: 11, color: '#666', width: 30},
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  navBtnText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  startButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonText: {color: '#fff', fontWeight: '800', fontSize: 16},
});

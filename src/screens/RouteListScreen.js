import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import {WebView} from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {useTranslation} from 'react-i18next';
import api from '../services/api';
import OfflineBanner from '../components/OfflineBanner';
import {getQueue} from '../services/offline';

function isValidCoord(lat, lng) {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function buildMiniMapHTML(markers) {
  if (markers.length === 0) {
    return '';
  }
  // Sanitize: only use markers with valid numeric coordinates
  const safe = markers.filter(m => isValidCoord(m.lat, m.lng));
  if (safe.length === 0) {
    return '';
  }
  const markersJS = safe
    .map(
      (m, i) => `
      L.circleMarker([${Number(m.lat)}, ${Number(m.lng)}], {
        radius: ${i === 0 ? 7 : 5},
        fillColor: '${i === 0 ? '#2563eb' : '#e74c3c'}',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(map);`,
    )
    .join('');
  const polylinePoints = safe.map(m => `[${Number(m.lat)},${Number(m.lng)}]`).join(',');
  const boundsPoints = safe.map(m => `[${Number(m.lat)},${Number(m.lng)}]`).join(',');
  return `<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>*{margin:0;padding:0;box-sizing:border-box}html,body,#map{width:100%;height:100%}</style>
</head><body>
  <div id="map"></div>
  <script>
    var map=L.map('map',{zoomControl:true,attributionControl:false,dragging:true,touchZoom:true,scrollWheelZoom:false,doubleClickZoom:true,boxZoom:false,keyboard:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
    ${markersJS}
    L.polyline([${polylinePoints}],{color:'#2563eb',weight:2,opacity:0.8}).addTo(map);
    map.fitBounds([${boundsPoints}],{padding:[14,14]});
    map.on('dragstart',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('dragStart');});
    map.on('dragend',function(){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('dragEnd');});
  </script>
</body></html>`;
}

function getMiniMapMarkers(route) {
  return (route.bins ?? [])
    .map(item => {
      const bin = item.bin ?? item;
      const lat = bin?.coordinates?.lat;
      const lng = bin?.coordinates?.lng;
      if (!lat || !lng) {
        return null;
      }
      return {lat, lng};
    })
    .filter(Boolean);
}

export default function RouteListScreen({navigation}) {
  const {t} = useTranslation();
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [user, setUser] = useState(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!state.isConnected);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    const raw = await AsyncStorage.getItem('auth_user');
    if (raw) {
      setUser(JSON.parse(raw));
    }
  }

  const loadRoutes = useCallback(async () => {
    try {
      const netState = await NetInfo.fetch();
      const online = !!netState.isConnected;
      setIsOnline(online);

      if (online) {
        const userRaw = await AsyncStorage.getItem('auth_user');
        const currentUser = userRaw ? JSON.parse(userRaw) : null;
        const params = {status: 'planned'};
        if (currentUser?._id) {
          params.driver = currentUser._id;
        }
        const response = await api.get('/routes', {params});
        const data = response.data;
        setRoutes(data);
        await AsyncStorage.setItem('cached_routes', JSON.stringify(data));
      } else {
        const cached = await AsyncStorage.getItem('cached_routes');
        setRoutes(cached ? JSON.parse(cached) : []);
      }
    } catch (err) {
      // Fall back to cache on error
      const cached = await AsyncStorage.getItem('cached_routes');
      setRoutes(cached ? JSON.parse(cached) : []);
    }

    const queue = await getQueue();
    setQueueCount(queue.length);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  function onRefresh() {
    setRefreshing(true);
    loadRoutes();
  }

  async function handleLogout() {
    Alert.alert(t('logout_title'), t('logout_confirm'), [
      {text: t('cancel'), style: 'cancel'},
      {
        text: t('logout'),
        style: 'destructive',
        onPress: async () => {
          await AsyncStorage.multiRemove(['auth_token', 'auth_user', 'server_url', 'cached_routes']);
          navigation.replace('Login');
        },
      },
    ]);
  }

  function renderRoute({item}) {
    const binCount = item.bins?.length ?? 0;
    const date = item.date
      ? new Date(item.date).toLocaleDateString()
      : t('no_date');
    const miniMarkers = getMiniMapMarkers(item);
    const miniMapHTML = isOnline && miniMarkers.length > 0 ? buildMiniMapHTML(miniMarkers) : '';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.routeName}>{item.name || `Route #${item._id?.slice(-6)}`}</Text>
          <View style={[styles.statusBadge, styles[`status_${item.status}`] || styles.status_planned]}>
            <Text style={styles.statusText}>{item.status || 'planned'}</Text>
          </View>
        </View>
        <Text style={styles.cardMeta}>
          {t('bins', {count: binCount})} · {date}
        </Text>
        {item.notes ? <Text style={styles.cardNotes}>{item.notes}</Text> : null}
        {miniMapHTML ? (
          <View style={styles.miniMapContainer}>
            <WebView
              style={styles.miniMap}
              source={{html: miniMapHTML, baseUrl: 'https://unpkg.com'}}
              originWhitelist={['https://unpkg.com', 'https://tile.openstreetmap.org']}
              scrollEnabled={false}
              javaScriptEnabled
              domStorageEnabled
              mixedContentMode="never"
              onMessage={e => {
                if (e.nativeEvent.data === 'dragStart') setScrollEnabled(false);
                if (e.nativeEvent.data === 'dragEnd') setScrollEnabled(true);
              }}
            />
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.startButton}
          onPress={() => navigation.navigate('RouteOverview', {route: item})}>
          <Text style={styles.startButtonText}>{t('view_route')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!isOnline && <OfflineBanner queueCount={queueCount} />}

      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('my_routes')}</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>{t('logout')}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#2563eb" />
      ) : (
        <FlatList
          data={routes}
          keyExtractor={item => item._id}
          renderItem={renderRoute}
          scrollEnabled={scrollEnabled}
          contentContainerStyle={routes.length === 0 ? styles.emptyContainer : styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{t('no_planned_routes')}</Text>
              <Text style={styles.emptySubtitle}>
                {isOnline ? t('no_routes_online') : t('no_routes_offline')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f0f2f5'},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {fontSize: 20, fontWeight: '700', color: '#1a1a2e'},
  logoutText: {fontSize: 14, color: '#c0392b', fontWeight: '600'},
  loader: {marginTop: 40},
  list: {padding: 16, gap: 12},
  emptyContainer: {flexGrow: 1, justifyContent: 'center', padding: 16},
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  routeName: {fontSize: 16, fontWeight: '700', color: '#1a1a2e', flex: 1},
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  status_planned: {backgroundColor: '#dbeafe'},
  status_in_progress: {backgroundColor: '#fef9c3'},
  status_completed: {backgroundColor: '#dcfce7'},
  statusText: {fontSize: 11, fontWeight: '600', color: '#374151'},
  cardMeta: {fontSize: 13, color: '#666', marginBottom: 4},
  cardNotes: {fontSize: 13, color: '#888', fontStyle: 'italic', marginBottom: 8},
  miniMapContainer: {
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 4,
  },
  miniMap: {flex: 1},
  startButton: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  startButtonText: {color: '#fff', fontWeight: '700', fontSize: 14},
  empty: {alignItems: 'center'},
  emptyTitle: {fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 8},
  emptySubtitle: {fontSize: 14, color: '#666', textAlign: 'center'},
});

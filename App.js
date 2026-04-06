import React, {useEffect, useRef, useState} from 'react';
import {DeviceEventEmitter} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import i18next from './src/i18n';

import LoginScreen from './src/screens/LoginScreen';
import RouteListScreen from './src/screens/RouteListScreen';
import RouteOverviewScreen from './src/screens/RouteOverviewScreen';
import ActiveRouteScreen from './src/screens/ActiveRouteScreen';
import {syncOfflineQueue} from './src/services/sync';

const Stack = createNativeStackNavigator();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);
  const wasConnected = useRef(null);
  const navigationRef = useRef(null);

  // Restore stored language and determine initial screen before first render
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('auth_token'),
      AsyncStorage.getItem('app_language'),
    ]).then(([token, lang]) => {
      if (lang) {
        i18next.changeLanguage(lang);
      }
      setInitialRoute(token ? 'RouteList' : 'Login');
    });
  }, []);

  // Navigate to Login when session expires (401)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('session_expired', () => {
      navigationRef.current?.reset({index: 0, routes: [{name: 'Login'}]});
    });
    return () => sub.remove();
  }, []);

  // Auto-sync when connectivity is restored
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async state => {
      const isNowConnected = !!state.isConnected;

      if (wasConnected.current === false && isNowConnected) {
        // Transitioned offline → online
        try {
          const {synced, failed} = await syncOfflineQueue();
          if (__DEV__) {
            if (synced > 0) {
              console.log(`[sync] Synced ${synced} offline collection(s).`);
            }
            if (failed > 0) {
              console.warn(`[sync] ${failed} item(s) failed to sync.`);
            }
          }
        } catch (err) {
          if (__DEV__) {
            console.warn('[sync] Sync error:', err);
          }
        }
      }

      wasConnected.current = isNowConnected;
    });

    return unsubscribe;
  }, []);

  if (!initialRoute) {
    return null; // Splash while checking storage
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{headerShown: false}}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="RouteList" component={RouteListScreen} />
        <Stack.Screen
          name="RouteOverview"
          component={RouteOverviewScreen}
          options={{headerShown: true, title: 'Route Overview'}}
        />
        <Stack.Screen
          name="ActiveRoute"
          component={ActiveRouteScreen}
          options={{headerShown: true, title: 'Active Route'}}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

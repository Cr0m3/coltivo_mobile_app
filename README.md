# Driver App — React Native Android

Offline-capable Android app for bin collection drivers. Caches routes locally and queues collections when there is no network, syncing automatically when connectivity returns.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| JDK | 17 |
| Android Studio | Hedgehog (2023.1) or newer |
| Android SDK | API 35 |
| Android NDK | 26.1.10909125 |
| `ANDROID_HOME` | Set in environment |

## Setup

```bash
cd driver-app
npm install

# Android only: accept SDK licences
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
```

## Testen in Android Studio

### Emulator einrichten

1. Android Studio öffnen → **More Actions → Virtual Device Manager**
2. **Create Device** → z.B. Pixel 7 → API 35 (Android 15) auswählen
3. Emulator starten (grüner Play-Button)

### App auf dem Emulator starten

**Option A — über Terminal (empfohlen):**
```bash
# Terminal 1: Metro Bundler starten
cd driver-app
npm start

# Terminal 2: App auf laufenden Emulator deployen
npm run android
```

**Option B — direkt aus Android Studio:**
1. In Android Studio: **File → Open** → `driver-app/android/` Ordner öffnen
2. Warten bis Gradle-Sync abgeschlossen ist
3. Oben rechts den gewünschten Emulator auswählen
4. **Run 'app'** (grüner Play-Button) klicken
5. Separat im Terminal Metro starten: `npm start`

> **Hinweis:** Android Studio startet nur die native App. Der JavaScript-Bundler (Metro) muss separat im Terminal laufen.

### Physisches Gerät (USB)

1. Am Android-Gerät: **Einstellungen → Über das Telefon** → 7x auf Build-Nummer tippen → Developer Options aktivieren
2. **Developer Options → USB-Debugging** aktivieren
3. Gerät per USB anschließen und Debugging-Prompt bestätigen
4. Verbindung prüfen:
   ```bash
   adb devices
   # Sollte das Gerät mit "device" Status zeigen
   ```
5. App deployen:
   ```bash
   npm start        # Terminal 1
   npm run android  # Terminal 2
   ```

### Wichtige SDK-Einstellungen in Android Studio

**SDK Manager** (Tools → SDK Manager) — folgende Pakete müssen installiert sein:

| Paket | Version |
|-------|---------|
| Android SDK Platform | 35 |
| Android SDK Build-Tools | 35.0.0 |
| NDK (Side by side) | 26.1.10909125 |
| CMake | 3.22.1 |
| Android Emulator | Latest |

**NDK-Version installieren:**
SDK Manager → SDK Tools → NDK (Side by side) → Haken bei `26.1.10909125` setzen → Apply

## Development

```bash
# 1. Start Metro bundler (keep this running)
npm start

# 2. In a second terminal — run on connected device or emulator
npm run android
```

## Release APK

```bash
cd android
./gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`

For a signed release you will need a keystore — follow the [React Native docs](https://reactnative.dev/docs/signed-apk-android).

## App Flow

```
LoginScreen  ──────────────────────────────────────────────────────────┐
  Enter server URL (e.g. https://myapp.fly.dev)                        │
  Enter driver username + password                                      │
  Token + URL saved to AsyncStorage                                     │
       ↓                                                                │
RouteListScreen  ←──────────────────────────────────────────┐          │
  Online  → fetch /routes?driver=id&status=planned           │          │
           → cache in AsyncStorage (cached_routes)           │          │
  Offline → read from cached_routes                          │          │
  Tap "Start Route"                                          │          │
       ↓                                                     │          │
ActiveRouteScreen                                            │          │
  For each bin:                                              │          │
    • Scan QR code (optional, marks qrCodeScanned: true)     │          │
    • Adjust fill level slider (0–100%)                      │          │
    • Submit → GPS coords captured automatically             │          │
      Online  → POST /collections/add directly               │          │
      Offline → add to offline_queue in AsyncStorage         │          │
    • Skip bin without recording                             │          │
  All bins done → "Complete Route"                           │          │
       └───────────────────────────────────────────────────┘           │
  Logout ──────────────────────────────────────────────────────────────┘
```

## Offline Behaviour

- Routes are cached on every successful fetch.
- Collections submitted while offline are stored in `AsyncStorage` key `offline_queue`.
- A red banner shows when offline, with a badge showing how many collections are queued.
- When the device reconnects, `App.js` detects the transition via `NetInfo` and automatically flushes the queue (`sync.js`).
- Failed sync items remain in the queue for the next connectivity window.

## Key AsyncStorage Keys

| Key | Contents |
|-----|---------|
| `server_url` | Base URL of the backend (e.g. `https://myapp.fly.dev`) |
| `auth_token` | JWT token (`x-auth-token`) |
| `auth_user` | JSON-serialised user object (includes `_id`) |
| `cached_routes` | JSON array of route objects last fetched from API |
| `offline_queue` | JSON array of pending collection payloads |

## API Endpoints Used

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/auth/login` | Authenticate driver |
| `GET` | `/routes` | List planned routes |
| `POST` | `/collections/add` | Submit a bin collection |
| `GET` | `/bins/qr/:code` | (Optional) server-side QR verify |

All requests include the `x-auth-token` header automatically via the Axios interceptor in `src/services/api.js`.

## Permissions

| Permission | Reason |
|-----------|--------|
| `INTERNET` | API calls + sync |
| `CAMERA` | QR code scanning |
| `ACCESS_FINE_LOCATION` | GPS coordinates per collection |
| `ACCESS_COARSE_LOCATION` | Fallback location |

## Troubleshooting

**Metro can't find modules after `npm install`**
```bash
npm start -- --reset-cache
```

**Build fails: SDK not found**
`ANDROID_HOME` setzen (macOS):
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools
```
Dauerhaft in `~/.zshrc` oder `~/.bash_profile` eintragen.

**Build fails: CMake / Codegen-Fehler (JNI directory not found)**
```bash
cd driver-app
rm -rf node_modules android/app/.cxx android/app/build android/build
npm install
npm run android
```

**Gradle-Sync schlägt in Android Studio fehl**
1. File → Invalidate Caches → Invalidate and Restart
2. Danach: File → Sync Project with Gradle Files

**`adb devices` zeigt kein Gerät**
```bash
adb kill-server
adb start-server
adb devices
```

**Camera not working on emulator**
Emulator unterstützt keine echte Kamera-Hardware für QR-Scanning. Für QR-Tests zwingend ein **physisches Gerät** verwenden oder den manuellen Code-Eingabe-Modus nutzen (im ActiveRouteScreen verfügbar).

**App startet, aber weißer Bildschirm**
Metro-Bundler läuft nicht. In einem separaten Terminal:
```bash
cd driver-app
npm start
```
Dann in der App: Schütteln → "Reload" tippen.

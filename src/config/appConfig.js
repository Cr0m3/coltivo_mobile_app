/**
 * Build-time app configuration.
 *
 * To create a company-specific build, set DEFAULT_COMPANY_NAME to the
 * company's name before building the APK/AAB.  Leave it empty ('') to
 * ship a generic build where drivers type their company name on first login.
 *
 * The value here is only used on first launch (or after the app is cleared).
 * Once the user logs in, the company is persisted in AsyncStorage and
 * this default is no longer consulted.
 */
const appConfig = {
  // Human-readable company name shown in the login field.
  // e.g. 'Coltivo GmbH'  →  pre-fills the Company Name field for that tenant.
  DEFAULT_COMPANY_NAME: '',

  // Backend server URL. Change this for dev/staging builds.
  SERVER_URL: 'https://app.coltivo.de',
};

export default appConfig;

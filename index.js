import './src/i18n'; // must be imported before App so i18next is initialized first
import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

AppRegistry.registerComponent(appName, () => App);

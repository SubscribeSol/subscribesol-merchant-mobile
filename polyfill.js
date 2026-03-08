import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import 'react-native-url-polyfill/auto';

// @ts-ignore
global.Buffer = global.Buffer || Buffer;

console.log('[Polyfill] Minimal baseline loaded');

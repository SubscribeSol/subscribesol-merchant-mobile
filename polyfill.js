import { Buffer } from 'buffer';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Globálna inicializácia Bufferu pre všetky knižnice
if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

// Fix pre process, ktorý niektoré Solana knižnice vyžadujú
if (typeof global.process === 'undefined') {
  global.process = require('process');
}

console.log('[Polyfill] Solana & Buffer environment ready');

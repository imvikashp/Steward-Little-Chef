import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAODoIB_zF17MqJz_Bzxc1BBZjA_KVvLeE',
  authDomain: 'steward-little.firebaseapp.com',
  databaseURL:
    'https://steward-little-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'steward-little',
  storageBucket: 'steward-little.firebasestorage.app',
  messagingSenderId: '729461128944',
  appId: '1:729461128944:web:8ee1358db9405115064c35',
  measurementId: 'G-6NMKPB051J',
};

export const app = initializeApp(firebaseConfig);

// Same Firestore project the customer ordering app writes to.
export const db = getFirestore(app);

// Chef sign-in uses Firebase Authentication (Email/Password provider).
export const auth = getAuth(app);

export const ORDERS_COLLECTION = 'orders';
export const BOTS_COLLECTION = 'bots';
export const HISTORY_COLLECTION = 'history';

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDJYOGqleI2DirseHiw0fVb31VMeTBLN4c",
  authDomain: "pokabu-match.firebaseapp.com",
  projectId: "pokabu-match",
  storageBucket: "pokabu-match.firebasestorage.app",
  messagingSenderId: "1031110145048",
  appId: "1:1031110145048:web:22f7c5517ddfcc15807f6d",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
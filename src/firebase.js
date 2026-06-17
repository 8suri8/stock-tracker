// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyARxMvqiMVUZMGz2otrcyZUOQxyMSQE3hk",
  authDomain: "inventory-test-45e49.firebaseapp.com",
  projectId: "inventory-test-45e49",
  storageBucket: "inventory-test-45e49.firebasestorage.app",
  messagingSenderId: "450218980751",
  appId: "1:450218980751:web:0870d53c41d09c129007fa",
  measurementId: "G-Z57K82EWJH",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Analytics can fail in some environments (e.g. ad blockers) — don't let it crash the app
try {
  getAnalytics(app);
} catch (e) {
  console.warn("Firebase Analytics not initialized:", e);
}

export const db = getFirestore(app);

// ── Inventory document helpers ──────────────────────────────────────────
export async function fbGet(docId) {
  try {
    const snap = await getDoc(doc(db, "inventory", docId));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function fbSet(docId, data) {
  try {
    await setDoc(doc(db, "inventory", docId), data, { merge: true });
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

// ── History helpers ───────────────────────────────────────────────────
export async function fbGetHistory() {
  try {
    const q = query(collection(db, "inventory_history"), orderBy("date", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (e) {
    console.error(e);
    return [];
  }
}

export async function fbSaveHistory(entry) {
  try {
    await setDoc(doc(db, "inventory_history", entry.date), entry);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

export async function fbDeleteHistory(date) {
  try {
    await deleteDoc(doc(db, "inventory_history", date));
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

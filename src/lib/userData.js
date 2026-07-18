import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { DEFAULT_CONFIG } from "./climbLogic";

export function userDocRef(uid) {
  return doc(db, "users", uid);
}

// Creates the user's document with defaults on first login, otherwise no-op.
export async function ensureUserDoc(uid) {
  const ref = userDocRef(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { climbs: [], pyramidConfig: DEFAULT_CONFIG });
  }
}

// Live-subscribes to the user's data. Works offline too: fires immediately
// from the local cache, then again whenever the server confirms a sync.
export function subscribeUserData(uid, onData) {
  return onSnapshot(userDocRef(uid), (snap) => {
    if (!snap.exists()) return;
    const data = snap.data();
    onData({
      climbs: data.climbs || [],
      pyramidConfig: data.pyramidConfig || DEFAULT_CONFIG,
    });
  });
}

export async function saveClimbs(uid, climbs) {
  await setDoc(userDocRef(uid), { climbs }, { merge: true });
}

export async function savePyramidConfig(uid, pyramidConfig) {
  await setDoc(userDocRef(uid), { pyramidConfig }, { merge: true });
}

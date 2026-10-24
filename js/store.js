// Data layer: one interface, two backends.
//  - Firebase (Auth + Firestore) when js/config.js is filled in
//  - Local (localStorage) otherwise, so the app works out of the box
import { firebaseConfig } from './config.js';

export const COLLECTIONS = ['plans', 'workouts', 'bodyweight', 'measurements', 'exercises'];

export const isCloud = Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

const clean = (o) => JSON.parse(JSON.stringify(o)); // strips undefined (Firestore rejects it)

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10))
    .replace(/-/g, '').slice(0, 20);

/* ---------------- Local backend ---------------- */
function localBackend() {
  const DB_KEY = 'gymflow:db:v1';
  const SESSION_KEY = 'gymflow:session:v1';
  let listener = null;

  const read = () => {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || null; } catch { return null; }
  };
  const write = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
  const empty = () => ({ profile: {}, ...Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) });
  const getDb = () => read() || empty();

  const session = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };

  return {
    mode: 'local',
    init(cb) { listener = cb; cb(session()); },
    async signUp(name, email) {
      const user = { uid: 'local', email: email || '', displayName: name || '' };
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      const db = getDb();
      db.profile = { ...db.profile, name: name || db.profile.name || '' };
      write(db);
      listener && listener(user);
    },
    async signIn(email) { return this.signUp(getDb().profile.name || '', email); },
    async signInGoogle() { throw { code: 'local/no-google' }; },
    async resetPassword() { throw { code: 'local/no-reset' }; },
    async signOut() { localStorage.removeItem(SESSION_KEY); listener && listener(null); },
    async loadAll() {
      const db = getDb();
      const out = { profile: db.profile || {} };
      COLLECTIONS.forEach((c) => (out[c] = Object.values(db[c] || {})));
      return out;
    },
    async put(col, obj) { const db = getDb(); db[col] = db[col] || {}; db[col][obj.id] = clean(obj); write(db); },
    async putMany(col, list) { const db = getDb(); db[col] = db[col] || {}; list.forEach((o) => (db[col][o.id] = clean(o))); write(db); },
    async remove(col, id) { const db = getDb(); if (db[col]) delete db[col][id]; write(db); },
    async setProfile(p) { const db = getDb(); db.profile = clean(p); write(db); },
    async deleteAllData() { write(empty()); },
  };
}

/* ---------------- Firebase backend ---------------- */
async function cloudBackend() {
  const fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(firebaseConfig);
  const auth = fb.getAuth(app);
  await fb.setPersistence(auth, fb.browserLocalPersistence).catch(() => {});
  let db;
  try {
    db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  } catch {
    db = fb.initializeFirestore(app, {});
  }
  const me = () => auth.currentUser && auth.currentUser.uid;
  const userDoc = () => fb.doc(db, 'users', me());

  return {
    mode: 'cloud',
    init(cb) { fb.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null)); },
    async signUp(name, email, pw) {
      const cred = await fb.createUserWithEmailAndPassword(auth, email, pw);
      if (name) await fb.updateProfile(cred.user, { displayName: name }).catch(() => {});
      await fb.setDoc(fb.doc(db, 'users', cred.user.uid), { name: name || '', createdAt: Date.now() }, { merge: true });
    },
    signIn: (email, pw) => fb.signInWithEmailAndPassword(auth, email, pw),
    signInGoogle: () => fb.signInWithPopup(auth, new fb.GoogleAuthProvider()),
    resetPassword: (email) => fb.sendPasswordResetEmail(auth, email),
    signOut: () => fb.signOut(auth),
    async loadAll() {
      const out = {};
      const p = await fb.getDoc(userDoc());
      out.profile = p.exists() ? p.data() : {};
      await Promise.all(COLLECTIONS.map(async (c) => {
        const snap = await fb.getDocs(fb.collection(db, 'users', me(), c));
        out[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      }));
      return out;
    },
    put: (col, obj) => fb.setDoc(fb.doc(db, 'users', me(), col, obj.id), clean(obj)),
    async putMany(col, list) {
      for (let i = 0; i < list.length; i += 400) {
        const batch = fb.writeBatch(db);
        list.slice(i, i + 400).forEach((o) => batch.set(fb.doc(db, 'users', me(), col, o.id), clean(o)));
        await batch.commit();
      }
    },
    remove: (col, id) => fb.deleteDoc(fb.doc(db, 'users', me(), col, id)),
    setProfile: (p) => fb.setDoc(userDoc(), clean(p), { merge: true }),
    async deleteAllData() {
      for (const c of COLLECTIONS) {
        const snap = await fb.getDocs(fb.collection(db, 'users', me(), c));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = fb.writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await fb.setDoc(userDoc(), { name: '', createdAt: Date.now() });
    },
  };
}

export async function createStore() {
  if (!isCloud) return localBackend();
  return cloudBackend();
}

// Map auth error codes to i18n keys
export function authErrorKey(err) {
  const code = (err && err.code) || '';
  const map = {
    'auth/invalid-email': 'err_email',
    'auth/missing-email': 'err_email',
    'auth/user-not-found': 'err_credentials',
    'auth/wrong-password': 'err_credentials',
    'auth/invalid-credential': 'err_credentials',
    'auth/invalid-login-credentials': 'err_credentials',
    'auth/email-already-in-use': 'err_in_use',
    'auth/weak-password': 'err_weak',
    'auth/missing-password': 'err_weak',
    'auth/too-many-requests': 'err_too_many',
    'auth/network-request-failed': 'err_network',
    'auth/popup-closed-by-user': 'err_popup',
    'auth/cancelled-popup-request': 'err_popup',
    'auth/popup-blocked': 'err_popup_blocked',
    'auth/unauthorized-domain': 'err_domain',
    'auth/operation-not-allowed': 'err_provider',
    'local/no-google': 'err_local_google',
    'local/no-reset': 'err_local_reset',
  };
  return map[code] || 'err_generic';
}

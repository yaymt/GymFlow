// Data layer: one interface, two backends.
//  - Firebase (Auth + Firestore) when js/config.js is filled in
//  - Local (localStorage) otherwise, so the app works out of the box
import { firebaseConfig } from './config.js';

export const COLLECTIONS = ['plans', 'workouts', 'bodyweight', 'measurements', 'exercises'];

export const isCloud = Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);

const clean = (o) => JSON.parse(JSON.stringify(o)); // strips undefined (Firestore rejects it)

const uid_ = () => uid();
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
    async deleteAllData() { const keep = getDb().rewards; const db = empty(); if (keep) db.rewards = keep; write(db); },

    // Stars (local mode keeps them in the same browser; only used for testing the screens)
    async loadRewards() { return Object.values(getDb().rewards || {}); },
    async adminUsers() { const p = getDb().profile || {}; return [{ id: 'local', name: p.name || '', email: (session() || {}).email || '', username: p.username || '', usernameKey: p.usernameKey || '', lastSeen: p.lastSeen || null, createdAt: p.createdAt || null }]; },
    async adminUsernames() { const m = {}; Object.entries(getDb().usernames || {}).forEach(([k, v]) => (m[k] = v.uid)); return m; },

    // Permissions given by the owner, and unique usernames
    async myPerms() { return (getDb().staff || {}).local || {}; },
    async staffList() { return Object.entries(getDb().staff || {}).map(([id, v]) => ({ ...v, id })); },
    async staffSet(uid, perms) {
      const db = getDb(); db.staff = db.staff || {};
      if (!perms.view && !perms.stars) delete db.staff[uid]; else db.staff[uid] = { uid, view: !!perms.view, stars: !!perms.stars, at: Date.now(), by: 'local' };
      write(db);
    },
    async usernameFree(key) { const u = (getDb().usernames || {})[key]; return !u || u.uid === 'local'; },
    async claimUsername(name, key, oldKey) {
      const db = getDb(); db.usernames = db.usernames || {};
      if (db.usernames[key] && db.usernames[key].uid !== 'local') throw { code: 'username/taken' };
      if (oldKey && oldKey !== key) delete db.usernames[oldKey];
      db.usernames[key] = { uid: 'local', name, at: Date.now() };
      db.profile = { ...(db.profile || {}), username: name, usernameKey: key };
      write(db);
    },
    async adminRewards() { return Object.values(getDb().rewards || {}); },
    async adminUserData() {
      const db = getDb();
      const out = { profile: db.profile || {}, rewards: Object.values(db.rewards || {}) };
      COLLECTIONS.forEach((c) => (out[c] = Object.values(db[c] || {})));
      return out;
    },
    async adminAddReward(uid, { stars, note, byName }) {
      const db = getDb(); db.rewards = db.rewards || {};
      const r = { id: uid_(), stars, note: note || '', at: Date.now(), by: 'local', byName: byName || '' };
      db.rewards[r.id] = r; write(db); return r;
    },
    async adminRemoveReward(uid, id) { const db = getDb(); if (db.rewards) delete db.rewards[id]; write(db); },
  };
}

/* ---------------- Firebase backend ---------------- */
const genId = () => uid();

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

    // Stars given by the owner. Members can read their own; only the owner can write (enforced by firestore.rules).
    async loadRewards() {
      const snap = await fb.getDocs(fb.collection(db, 'users', me(), 'rewards'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async adminUsers() {
      const snap = await fb.getDocs(fb.collection(db, 'users'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    // username key -> uid, used to show a name only when it really belongs to that account
    async adminUsernames() {
      const snap = await fb.getDocs(fb.collection(db, 'usernames'));
      const m = {};
      snap.docs.forEach((d) => (m[d.id] = d.data().uid));
      return m;
    },

    // Permissions (the owner gives them; a member can read only their own)
    async myPerms() {
      const d = await fb.getDoc(fb.doc(db, 'staff', me()));
      return d.exists() ? d.data() : {};
    },
    async staffList() {
      const snap = await fb.getDocs(fb.collection(db, 'staff'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async staffSet(uid, perms) {
      const ref = fb.doc(db, 'staff', uid);
      if (!perms.view && !perms.stars) return fb.deleteDoc(ref);
      return fb.setDoc(ref, { uid, view: !!perms.view, stars: !!perms.stars, at: Date.now(), by: me() });
    },

    // Unique usernames: one document per name, so two people can never hold the same one
    async usernameFree(key) {
      const d = await fb.getDoc(fb.doc(db, 'usernames', key));
      return !d.exists() || d.data().uid === me();
    },
    async claimUsername(name, key, oldKey) {
      const batch = fb.writeBatch(db);
      batch.set(fb.doc(db, 'usernames', key), { uid: me(), name, at: Date.now() });
      if (oldKey && oldKey !== key) batch.delete(fb.doc(db, 'usernames', oldKey));
      batch.set(userDoc(), { username: name, usernameKey: key }, { merge: true });
      await batch.commit();
    },
    async adminRewards(uid) {
      const snap = await fb.getDocs(fb.collection(db, 'users', uid, 'rewards'));
      return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    },
    async adminUserData(uid) {
      const out = {};
      const p = await fb.getDoc(fb.doc(db, 'users', uid));
      out.profile = p.exists() ? p.data() : {};
      // a person who may only give stars cannot read workouts: keep what is allowed and mark the rest
      out.limited = false;
      await Promise.all([...COLLECTIONS, 'rewards'].map(async (c) => {
        try {
          const snap = await fb.getDocs(fb.collection(db, 'users', uid, c));
          out[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        } catch (e) {
          if (e && e.code === 'permission-denied' && c !== 'rewards') { out[c] = []; out.limited = true; } else throw e;
        }
      }));
      return out;
    },
    async adminAddReward(uid, { stars, note, byName }) {
      const r = { id: genId(), stars, note: note || '', at: Date.now(), by: me(), byName: byName || '' };
      await fb.setDoc(fb.doc(db, 'users', uid, 'rewards', r.id), r);
      return r;
    },
    adminRemoveReward: (uid, id) => fb.deleteDoc(fb.doc(db, 'users', uid, 'rewards', id)),
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

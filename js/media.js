/* Stockage des photos/vidéos d'évolution (IndexedDB) + verrouillage (PIN + biométrie WebAuthn).
   Les photos/vidéos ne tiennent pas dans localStorage : elles vivent dans IndexedDB, en local
   sur l'appareil uniquement (aucun envoi réseau). */

const MEDIA_DB_NAME = 'fittrack_media';
const MEDIA_STORE = 'media';

function openMediaDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        const store = db.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
        store.createIndex('date', 'date', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addMediaItem({ date, type, blob, mimeType }) {
  const db = await openMediaDB();
  const item = { id: uid('media'), date, type, blob, mimeType, createdAt: Date.now() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).add(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllMediaItems() {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readonly');
    const req = tx.objectStore(MEDIA_STORE).getAll();
    req.onsuccess = () => {
      const items = req.result || [];
      items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

async function deleteMediaItem(id) {
  const db = await openMediaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    tx.objectStore(MEDIA_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ===== Code PIN (dissuasif, pas un vrai chiffrement) ===== */

async function hashPin(pin) {
  const salted = 'fittrack_salt_' + pin;
  // crypto.subtle n'existe qu'en contexte sécurisé (HTTPS/localhost) ; on retombe sur un
  // hash simple sinon pour que le code fonctionne même testé en http local. Ce n'est qu'un
  // écran de confidentialité, pas un vrai chiffrement, donc c'est suffisant dans les deux cas.
  if (window.crypto && window.crypto.subtle) {
    try {
      const enc = new TextEncoder().encode(salted);
      const buf = await crypto.subtle.digest('SHA-256', enc);
      return 'sha256_' + Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // on tombe sur le fallback ci-dessous
    }
  }
  let hash = 0;
  for (let i = 0; i < salted.length; i++) {
    hash = ((hash << 5) - hash + salted.charCodeAt(i)) | 0;
  }
  return 'fallback_' + (hash >>> 0).toString(16);
}

/* ===== Biométrie (WebAuthn, meilleur effort — pas de vérification cryptographique serveur) ===== */

function bufToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function isBiometricAvailable() {
  return !!(window.PublicKeyCredential && navigator.credentials);
}

async function registerBiometric() {
  if (!isBiometricAvailable()) return null;
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'FitTrack' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'fittrack-utilisateur',
          displayName: 'FitTrack'
        },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
        timeout: 60000
      }
    });
    return cred ? bufToBase64(cred.rawId) : null;
  } catch (e) {
    return null;
  }
}

async function verifyBiometric(credentialIdBase64) {
  if (!isBiometricAvailable() || !credentialIdBase64) return false;
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ id: base64ToBuf(credentialIdBase64), type: 'public-key' }],
        userVerification: 'required',
        timeout: 60000
      }
    });
    return !!assertion;
  } catch (e) {
    return false;
  }
}

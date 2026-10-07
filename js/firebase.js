import { firebaseConfig } from "../firebase-config.js";

const SDK_VERSION = "12.19.0";
const sdk = (service) => `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${service}.js`;

export const firebaseReady = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.messagingSenderId,
  firebaseConfig.appId,
].every((value) => typeof value === "string" && value.trim().length > 0);
// Mantener en false hasta habilitar Storage y desplegar sus reglas.
const STORAGE_ENABLED = false;
export const firebaseStorageAvailable = STORAGE_ENABLED
  && typeof firebaseConfig.storageBucket === "string"
  && firebaseConfig.storageBucket.trim().length > 0;

let servicesPromise;

export function getFirebaseServices() {
  if (!firebaseReady) {
    throw new Error("Completa firebase-config.js con la configuración pública de tu app web de Firebase.");
  }
  servicesPromise ??= Promise.all([
    import(sdk("app")),
    import(sdk("auth")),
    import(sdk("firestore")),
    firebaseStorageAvailable ? import(sdk("storage")) : Promise.resolve(null),
  ]).then(([appSdk, authSdk, firestoreSdk, storageSdk]) => {
    const app = appSdk.initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    const db = firestoreSdk.getFirestore(app);
    const storage = storageSdk ? storageSdk.getStorage(app) : null;
    return { app, auth, db, storage, authSdk, firestoreSdk, storageSdk, storageAvailable: Boolean(storageSdk) };
  });
  return servicesPromise;
}

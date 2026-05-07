const DB_NAME = 'whatsfake-web-db';
const DB_VERSION = 3;
const SESSION_STORE = 'session';
const CHATS_STORE = 'chats';
const OUTBOX_STORE = 'outbox';
const CONTACTS_STORE = 'contacts';
let dbPromise = null;
function hasIndexedDb() {
    return typeof indexedDB !== 'undefined';
}
function openDatabase() {
    if (!hasIndexedDb()) {
        return Promise.reject(new Error('IndexedDB no está disponible en este entorno.'));
    }
    if (dbPromise) {
        return dbPromise;
    }
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(SESSION_STORE)) {
                db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(CHATS_STORE)) {
                db.createObjectStore(CHATS_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
                db.createObjectStore(OUTBOX_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(CONTACTS_STORE)) {
                db.createObjectStore(CONTACTS_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
    });
    return dbPromise;
}
function runStoreOperation(storeName, mode, handler) {
    if (!hasIndexedDb()) {
        return Promise.resolve(undefined);
    }
    return openDatabase()
        .then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            const request = handler(store);
            if (!request) {
                resolve(undefined);
                return;
            }
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('Error en operación de IndexedDB.'));
        });
    })
        .catch(() => undefined);
}
function runWriteTransaction(storeName, writer) {
    if (!hasIndexedDb()) {
        return Promise.resolve(undefined);
    }
    return openDatabase()
        .then((db) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            writer(store);
            transaction.oncomplete = () => resolve(undefined);
            transaction.onerror = () => reject(transaction.error ?? new Error('Error en transacción de IndexedDB.'));
            transaction.onabort = () => reject(transaction.error ?? new Error('Transacción de IndexedDB abortada.'));
        });
    })
        .catch(() => undefined);
}
export async function loadCachedSession() {
    const raw = await runStoreOperation(SESSION_STORE, 'readonly', (store) => {
        return store.get('current');
    });
    if (!raw) {
        return null;
    }
    return {
        userId: raw.userId,
        name: raw.name,
        username: raw.username,
        token: raw.token,
        avatar: raw.avatar
    };
}
export async function saveCachedSession(session) {
    const payload = {
        id: 'current',
        userId: session.userId,
        name: session.name,
        username: session.username,
        token: session.token,
        avatar: session.avatar,
        updatedAt: Date.now()
    };
    await runStoreOperation(SESSION_STORE, 'readwrite', (store) => store.put(payload));
}
export async function clearCachedSession() {
    await runStoreOperation(SESSION_STORE, 'readwrite', (store) => store.delete('current'));
}
export async function loadCachedChats(userId) {
    const raw = await runStoreOperation(CHATS_STORE, 'readonly', (store) => store.get(userId));
    return raw?.chats ?? [];
}
export async function saveCachedChats(userId, chats) {
    const payload = {
        id: userId,
        userId,
        chats,
        updatedAt: Date.now()
    };
    await runStoreOperation(CHATS_STORE, 'readwrite', (store) => store.put(payload));
}
export async function clearCachedChats(userId) {
    await runStoreOperation(CHATS_STORE, 'readwrite', (store) => store.delete(userId));
}
export async function loadCachedContacts(userId) {
    const raw = await runStoreOperation(CONTACTS_STORE, 'readonly', (store) => store.get(userId));
    return raw?.contacts ?? [];
}
export async function saveCachedContacts(userId, contacts) {
    const payload = {
        id: userId,
        userId,
        contacts,
        updatedAt: Date.now()
    };
    await runStoreOperation(CONTACTS_STORE, 'readwrite', (store) => store.put(payload));
}
export async function clearCachedContacts(userId) {
    await runStoreOperation(CONTACTS_STORE, 'readwrite', (store) => store.delete(userId));
}
export async function loadPendingMessages(userId) {
    const all = await runStoreOperation(OUTBOX_STORE, 'readonly', (store) => {
        return store.getAll();
    });
    return (all ?? [])
        .filter((item) => item.userId === userId)
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .map((item) => ({
        id: item.id,
        userId: item.userId,
        chatId: item.chatId,
        text: item.text,
        sentAt: item.sentAt,
        status: item.status,
        attempts: item.attempts,
        lastError: item.lastError
    }));
}
export async function upsertPendingMessage(message) {
    const payload = {
        ...message,
        updatedAt: Date.now()
    };
    await runStoreOperation(OUTBOX_STORE, 'readwrite', (store) => store.put(payload));
}
export async function removePendingMessage(id) {
    await runStoreOperation(OUTBOX_STORE, 'readwrite', (store) => store.delete(id));
}
export async function clearPendingMessagesByUser(userId) {
    const all = await runStoreOperation(OUTBOX_STORE, 'readonly', (store) => store.getAll());
    const ids = (all ?? []).filter((item) => item.userId === userId).map((item) => item.id);
    if (ids.length === 0) {
        return;
    }
    await runWriteTransaction(OUTBOX_STORE, (store) => {
        ids.forEach((id) => store.delete(id));
    });
}

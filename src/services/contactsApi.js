function resolveApiUrl() {
    const env = import.meta.env;
    const viteUrl = env?.VITE_API_URL ?? env?.EXPO_PUBLIC_API_URL;
    if (viteUrl) {
        return viteUrl;
    }
    const runtime = globalThis;
    return runtime.process?.env?.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
}
async function parseError(response, fallbackMessage) {
    const raw = await response.text();
    try {
        const parsed = JSON.parse(raw);
        return new Error(parsed.message ?? parsed.error ?? fallbackMessage);
    }
    catch {
        return new Error(raw || fallbackMessage);
    }
}
function normalizeContact(raw) {
    const name = raw.name ?? raw.fullName ?? raw.username ?? 'Usuario';
    const handleSeed = raw.handle ?? raw.username ?? name.toLowerCase().replace(/\s+/g, '');
    return {
        // Preferimos userId real para crear chats directos en backend.
        id: raw.userId ?? raw.id ?? handleSeed,
        userId: raw.userId ?? raw.id,
        name,
        handle: handleSeed.startsWith('@') ? handleSeed : `@${handleSeed}`,
        avatar: raw.avatar ?? name.slice(0, 2).toUpperCase()
    };
}
async function requestContacts(path, token) {
    const baseUrl = resolveApiUrl();
    let response;
    try {
        response = await fetch(`${baseUrl}${path}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
    }
    catch {
        throw new Error('No se pudo conectar con el backend para cargar contactos.');
    }
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw await parseError(response, 'No se pudieron cargar los contactos.');
    }
    const payload = (await response.json());
    const list = Array.isArray(payload)
        ? payload
        : payload.contacts ?? payload.users ?? payload.data ?? payload.results ?? [];
    return list.map(normalizeContact);
}
export async function fetchContacts(token) {
    const contacts = await requestContacts('/api/v1/contacts', token);
    if (contacts) {
        return contacts;
    }
    const users = await requestContacts('/api/v1/users', token);
    if (users) {
        return users;
    }
    throw new Error('No existe endpoint de contactos. Esperado: /api/v1/contacts o /api/v1/users');
}

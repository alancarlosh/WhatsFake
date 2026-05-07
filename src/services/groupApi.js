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
function normalizeGroupMember(raw) {
    const userId = raw.userId ?? raw.id ?? raw.memberId ?? '';
    const name = raw.name ?? raw.fullName ?? raw.username ?? userId;
    return {
        userId,
        name,
        username: raw.username,
        role: raw.role ?? 'member'
    };
}
async function authorizedRequest(path, token, method, body) {
    const baseUrl = resolveApiUrl();
    try {
        return await fetch(`${baseUrl}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify(body) : undefined
        });
    }
    catch {
        throw new Error('No se pudo conectar con el backend para gestionar el grupo.');
    }
}
export async function fetchGroupMembers(token, groupId) {
    const endpoints = [`/api/v1/groups/${groupId}/members`, `/api/v1/chats/${groupId}/members`];
    for (const path of endpoints) {
        const response = await authorizedRequest(path, token, 'GET');
        if (response.status === 404) {
            continue;
        }
        if (!response.ok) {
            throw await parseError(response, 'No se pudieron cargar los miembros del grupo.');
        }
        const payload = (await response.json());
        const list = Array.isArray(payload) ? payload : payload.members ?? payload.data ?? payload.users ?? [];
        return list.map(normalizeGroupMember).filter((member) => member.userId.length > 0);
    }
    throw new Error('No existe endpoint para obtener miembros del grupo.');
}
export async function addGroupMember(token, groupId, userId) {
    const response = await authorizedRequest(`/api/v1/groups/${groupId}/members`, token, 'POST', {
        userId,
        memberId: userId,
        targetUserId: userId
    });
    if (!response.ok) {
        throw await parseError(response, 'No se pudo agregar miembro al grupo.');
    }
}
export async function removeGroupMember(token, groupId, userId) {
    const response = await authorizedRequest(`/api/v1/groups/${groupId}/members/${userId}`, token, 'DELETE');
    if (!response.ok) {
        throw await parseError(response, 'No se pudo quitar miembro del grupo.');
    }
}
export async function updateGroupMemberRole(token, groupId, userId, role) {
    const response = await authorizedRequest(`/api/v1/groups/${groupId}/members/${userId}/role`, token, 'PATCH', {
        role
    });
    if (!response.ok) {
        throw await parseError(response, 'No se pudo actualizar el rol del miembro.');
    }
}

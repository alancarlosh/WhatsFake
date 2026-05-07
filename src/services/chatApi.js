function resolveApiUrl() {
    const env = import.meta.env;
    const viteUrl = env?.VITE_API_URL ?? env?.EXPO_PUBLIC_API_URL;
    if (viteUrl) {
        return viteUrl;
    }
    const runtime = globalThis;
    return runtime.process?.env?.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
}
function buildUrl(path) {
    const baseUrl = resolveApiUrl().replace(/\/$/, '');
    return `${baseUrl}${path}`;
}
function formatTimestamp(sentAt) {
    if (!sentAt) {
        return '';
    }
    const parsedDate = new Date(sentAt);
    if (Number.isNaN(parsedDate.getTime())) {
        return sentAt;
    }
    return parsedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function normalizeMessage(raw) {
    const senderName = raw.senderName ?? raw.fromName ?? raw.sender?.name ?? raw.user?.name ?? raw.senderUsername ?? raw.sender?.username ?? raw.user?.username;
    return {
        id: raw.id ?? raw.messageId ?? `msg-${Date.now()}`,
        author: raw.author === 'other' ? 'other' : 'me',
        senderName,
        text: raw.text ?? '',
        timestamp: formatTimestamp(raw.sentAt),
        status: raw.status
    };
}
async function authorizedRequest(path, token, init) {
    try {
        return await fetch(buildUrl(path), init);
    }
    catch {
        throw new Error('No se pudo conectar con el backend.');
    }
}
async function authorizedGet(path, token) {
    return authorizedRequest(path, token, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
}
async function authorizedPost(path, token, body) {
    return authorizedRequest(path, token, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
}
async function ensureOk(response, fallbackMessage) {
    if (response.ok) {
        return;
    }
    const raw = await response.text();
    const normalized = raw.trim();
    try {
        const parsed = JSON.parse(normalized);
        throw new Error(parsed.message ?? parsed.error ?? fallbackMessage);
    }
    catch {
        throw new Error(normalized || fallbackMessage);
    }
}
function normalizeChat(rawChat) {
    const contact = rawChat.contact ?? rawChat.user ?? rawChat.participant;
    const lastMessage = rawChat.lastMessage ?? rawChat.latestMessage ?? rawChat.last_message;
    const seededLast = lastMessage
        ? normalizeMessage({
            id: lastMessage.id,
            author: lastMessage.author,
            text: lastMessage.text,
            sentAt: lastMessage.sentAt,
            status: lastMessage.status
        })
        : null;
    const isGroup = rawChat.kind === 'group' || rawChat.type === 'group' || Boolean(rawChat.group);
    const groupName = rawChat.groupName ?? rawChat.group?.name ?? rawChat.group?.title ?? rawChat.name ?? rawChat.title;
    const contactName = isGroup
        ? groupName ?? 'Grupo'
        : rawChat.contactName ?? contact?.name ?? contact?.fullName ?? contact?.username ?? 'Contacto';
    const handleSeed = rawChat.contactHandle ?? contact?.handle ?? contact?.username ?? contactName.toLowerCase().replace(/\s+/g, '');
    const avatar = rawChat.avatar ??
        rawChat.group?.avatar ??
        contact?.avatar ??
        (isGroup ? 'GR' : contactName.slice(0, 2).toUpperCase());
    const isOnline = Boolean(rawChat.isOnline ?? contact?.isOnline ?? rawChat.presence?.isOnline);
    const chatId = rawChat.id ?? rawChat.chatId;
    const myRole = rawChat.myRole ??
        rawChat.role ??
        rawChat.memberRole ??
        rawChat.permissions?.role ??
        rawChat.membership?.role ??
        rawChat.group?.myRole ??
        rawChat.group?.role;
    return {
        id: chatId,
        contactName,
        contactHandle: handleSeed.startsWith('@') ? handleSeed : `@${handleSeed}`,
        avatar,
        updatedAt: rawChat.updatedAt,
        isGroup,
        myRole,
        isOnline,
        unreadCount: rawChat.unreadCount ?? rawChat.unread ?? 0,
        pinned: Boolean(rawChat.pinned),
        messages: seededLast ? [seededLast] : []
    };
}
export async function fetchChatsPage(token, options) {
    const search = new URLSearchParams();
    if (options?.limit !== undefined) {
        search.set('limit', String(options.limit));
    }
    if (options?.cursor) {
        search.set('cursor', options.cursor);
    }
    const path = search.size > 0 ? `/api/v1/chats?${search.toString()}` : '/api/v1/chats';
    const response = await authorizedGet(path, token);
    await ensureOk(response, 'No se pudieron cargar los chats.');
    const payload = (await response.json());
    const list = Array.isArray(payload) ? payload : payload.chats ?? payload.data ?? [];
    return {
        items: list.map((rawChat) => normalizeChat(rawChat)),
        nextCursor: Array.isArray(payload) ? null : payload.nextCursor ?? null
    };
}
export async function fetchChats(token) {
    const page = await fetchChatsPage(token);
    return page.items;
}
export async function fetchChatMessagesPage(token, chatId, options) {
    const search = new URLSearchParams();
    if (options?.before) {
        search.set('before', options.before);
    }
    if (options?.limit !== undefined) {
        search.set('limit', String(options.limit));
    }
    const path = search.size > 0 ? `/api/v1/chats/${chatId}/messages?${search.toString()}` : `/api/v1/chats/${chatId}/messages`;
    const response = await authorizedGet(path, token);
    await ensureOk(response, 'No se pudieron cargar los mensajes.');
    const payload = (await response.json());
    const list = payload.messages ?? [];
    return {
        items: list.map((raw) => normalizeMessage(raw)),
        nextCursor: payload.nextCursor ?? null
    };
}
export async function fetchChatMessages(token, chatId) {
    const page = await fetchChatMessagesPage(token, chatId);
    return page.items;
}
export async function markChatAsRead(token, chatId) {
    const response = await authorizedPost(`/api/v1/chats/${chatId}/read`, token);
    await ensureOk(response, 'No se pudo marcar el chat como leído.');
}
export async function createChatFromContact(token, contactId) {
    const response = await authorizedPost('/api/v1/chats', token, {
        contactId,
        userId: contactId,
        targetUserId: contactId
    });
    await ensureOk(response, 'No se pudo crear el chat.');
    if (response.status === 204) {
        return null;
    }
    const payload = (await response.json());
    return payload.chat?.id ?? payload.id ?? payload.chatId ?? null;
}
export async function createChatByUserIdViaChats(token, targetUserId) {
    const response = await authorizedPost('/api/v1/chats', token, {
        userId: targetUserId,
        targetUserId
    });
    await ensureOk(response, 'No se pudo crear el chat por userId.');
    if (response.status === 204) {
        return null;
    }
    const payload = (await response.json());
    return payload.chat?.id ?? payload.id ?? payload.chatId ?? null;
}
export async function createDirectChatByUserId(token, targetUserId) {
    const response = await authorizedPost('/api/v1/chats/direct', token, {
        targetUserId
    });
    await ensureOk(response, 'No se pudo crear o recuperar el chat directo.');
    if (response.status === 204) {
        return null;
    }
    const payload = (await response.json());
    return payload.chatId ?? payload.chat?.id ?? payload.id ?? null;
}
export async function createGroupChat(token, name, memberIds) {
    const baseBody = {
        name,
        title: name,
        memberIds,
        participants: memberIds
    };
    const attempts = [
        () => authorizedPost('/api/v1/groups', token, baseBody),
        () => authorizedPost('/api/v1/chats/groups', token, baseBody),
        () => authorizedPost('/api/v1/chats/group', token, baseBody)
    ];
    let lastError = null;
    for (const attempt of attempts) {
        try {
            const response = await attempt();
            if (response.status === 404) {
                continue;
            }
            await ensureOk(response, 'No se pudo crear el grupo.');
            if (response.status === 204) {
                return null;
            }
            const payload = (await response.json());
            return payload.group?.chatId ?? payload.group?.id ?? payload.chat?.id ?? payload.chatId ?? payload.id ?? null;
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error('No se pudo crear el grupo.');
        }
    }
    throw lastError ?? new Error('No existe endpoint para crear grupos.');
}

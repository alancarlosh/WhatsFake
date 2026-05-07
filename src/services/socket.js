function resolveSocketUrl() {
    const env = import.meta.env;
    return env?.VITE_SOCKET_URL ?? env?.EXPO_PUBLIC_SOCKET_URL;
}
function buildWsUrl(baseUrl, token) {
    const normalized = baseUrl.replace(/\/$/, '');
    const withProtocol = normalized.startsWith('ws://') || normalized.startsWith('wss://')
        ? normalized
        : normalized.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    const wsBase = withProtocol.endsWith('/ws') ? withProtocol : `${withProtocol}/ws`;
    const separator = wsBase.includes('?') ? '&' : '?';
    return `${wsBase}${separator}token=${encodeURIComponent(token)}`;
}
class NativeWebSocketAdapter {
    ws = null;
    handlers = new Map();
    get isConnected() {
        return this.ws?.readyState === WebSocket.OPEN;
    }
    on(event, handler) {
        const set = this.handlers.get(event) ?? new Set();
        set.add(handler);
        this.handlers.set(event, set);
    }
    off(event, handler) {
        const set = this.handlers.get(event);
        if (!set) {
            return;
        }
        set.delete(handler);
        if (set.size === 0) {
            this.handlers.delete(event);
        }
    }
    dispatch(event, payload) {
        const set = this.handlers.get(event);
        if (!set) {
            return;
        }
        set.forEach((handler) => {
            handler(payload);
        });
    }
    async connect(token) {
        const baseUrl = resolveSocketUrl();
        if (!baseUrl) {
            throw new Error('Falta VITE_SOCKET_URL o EXPO_PUBLIC_SOCKET_URL para conectar por WebSocket.');
        }
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return;
        }
        const targetUrl = buildWsUrl(baseUrl, token);
        await new Promise((resolve, reject) => {
            const ws = new WebSocket(targetUrl);
            this.ws = ws;
            ws.onopen = () => {
                this.dispatch('connected', { transport: 'websocket' });
                resolve();
            };
            ws.onclose = () => {
                this.dispatch('disconnected', undefined);
            };
            ws.onerror = () => {
                this.dispatch('error', { reason: 'WebSocket error' });
            };
            ws.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    if (!parsed?.event) {
                        return;
                    }
                    this.dispatch(parsed.event, parsed.payload);
                }
                catch {
                    this.dispatch('error', { reason: 'Mensaje WS inválido (JSON).' });
                }
            };
            const failConnectTimeout = setTimeout(() => {
                if (ws.readyState !== WebSocket.OPEN) {
                    ws.close();
                    reject(new Error('Timeout conectando al WebSocket.'));
                }
            }, 10000);
            ws.addEventListener('open', () => clearTimeout(failConnectTimeout), { once: true });
            ws.addEventListener('error', () => {
                clearTimeout(failConnectTimeout);
                if (ws.readyState !== WebSocket.OPEN) {
                    reject(new Error('No se pudo conectar al WebSocket.'));
                }
            }, { once: true });
        });
    }
    disconnect() {
        if (!this.ws) {
            return;
        }
        this.ws.close();
        this.ws = null;
    }
    emit(event, payload) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            return;
        }
        this.ws.send(JSON.stringify({
            event,
            payload
        }));
    }
}
export class ChatSocketService {
    adapter = new NativeWebSocketAdapter();
    messageHandlers = new Set();
    typingHandlers = new Set();
    readHandlers = new Set();
    messageAckHandlers = new Set();
    messageStatusHandlers = new Set();
    chatUpdatedHandlers = new Set();
    presenceHandlers = new Set();
    presenceSnapshotHandlers = new Set();
    groupRoleHandlers = new Set();
    groupMembersHandlers = new Set();
    connectedHandlers = new Set();
    disconnectedHandlers = new Set();
    errorHandlers = new Set();
    relays = new Map();
    isBound = false;
    get isConnected() {
        return this.adapter.isConnected;
    }
    bindRelay(event, sink) {
        const relay = (payload) => {
            sink.forEach((handler) => handler(payload));
        };
        this.relays.set(event, relay);
        this.adapter.on(event, relay);
    }
    bindEvents() {
        if (this.isBound) {
            return;
        }
        this.bindRelay('connected', this.connectedHandlers);
        this.bindRelay('disconnected', this.disconnectedHandlers);
        this.bindRelay('error', this.errorHandlers);
        this.bindRelay('message_received', this.messageHandlers);
        this.bindRelay('message_ack', this.messageAckHandlers);
        this.bindRelay('message_status_updated', this.messageStatusHandlers);
        this.bindRelay('chat_updated', this.chatUpdatedHandlers);
        this.bindRelay('typing', this.typingHandlers);
        this.bindRelay('read', this.readHandlers);
        this.bindRelay('presence_update', this.presenceHandlers);
        this.bindRelay('presence_snapshot', this.presenceSnapshotHandlers);
        this.bindRelay('group_role_updated', this.groupRoleHandlers);
        this.bindRelay('group_members_updated', this.groupMembersHandlers);
        // Compatibilidad con eventos legacy de presencia
        const userConnectedRelay = (payload) => {
            const incoming = payload;
            this.presenceHandlers.forEach((handler) => handler({
                userId: incoming.userId ?? incoming.id,
                username: incoming.username,
                name: incoming.name,
                isOnline: true
            }));
        };
        const userDisconnectedRelay = (payload) => {
            const incoming = payload;
            this.presenceHandlers.forEach((handler) => handler({
                userId: incoming.userId ?? incoming.id,
                username: incoming.username,
                name: incoming.name,
                isOnline: false
            }));
        };
        this.relays.set('user_connected', userConnectedRelay);
        this.relays.set('user_disconnected', userDisconnectedRelay);
        this.adapter.on('user_connected', userConnectedRelay);
        this.adapter.on('user_disconnected', userDisconnectedRelay);
        this.isBound = true;
    }
    unbindEvents() {
        if (!this.isBound) {
            return;
        }
        this.relays.forEach((relay, event) => {
            this.adapter.off(event, relay);
        });
        this.relays.clear();
        this.isBound = false;
    }
    async connect(token) {
        if (this.adapter.isConnected) {
            return;
        }
        this.bindEvents();
        try {
            await this.adapter.connect(token);
        }
        catch (error) {
            this.unbindEvents();
            throw error;
        }
    }
    disconnect() {
        this.unbindEvents();
        this.adapter.disconnect();
    }
    emit(event, payload) {
        this.adapter.emit(event, payload);
    }
    joinChat(chatId) {
        this.emit('join_chat', { chatId });
    }
    sendMessage(payload) {
        this.emit('send_message', payload);
    }
    sendTyping(payload) {
        this.emit('typing', payload);
    }
    sendRead(payload) {
        this.emit('read', payload);
    }
    sendDelivered(payload) {
        this.emit('delivered', payload);
    }
    on(event, handler) {
        this.adapter.on(event, handler);
    }
    off(event, handler) {
        this.adapter.off(event, handler);
    }
    onMessageReceived(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }
    onTyping(handler) {
        this.typingHandlers.add(handler);
        return () => this.typingHandlers.delete(handler);
    }
    onRead(handler) {
        this.readHandlers.add(handler);
        return () => this.readHandlers.delete(handler);
    }
    onMessageAck(handler) {
        this.messageAckHandlers.add(handler);
        return () => this.messageAckHandlers.delete(handler);
    }
    onMessageStatusUpdated(handler) {
        this.messageStatusHandlers.add(handler);
        return () => this.messageStatusHandlers.delete(handler);
    }
    onChatUpdated(handler) {
        this.chatUpdatedHandlers.add(handler);
        return () => this.chatUpdatedHandlers.delete(handler);
    }
    onPresenceUpdate(handler) {
        this.presenceHandlers.add(handler);
        return () => this.presenceHandlers.delete(handler);
    }
    onPresenceSnapshot(handler) {
        this.presenceSnapshotHandlers.add(handler);
        return () => this.presenceSnapshotHandlers.delete(handler);
    }
    onGroupRoleUpdated(handler) {
        this.groupRoleHandlers.add(handler);
        return () => this.groupRoleHandlers.delete(handler);
    }
    onGroupMembersUpdated(handler) {
        this.groupMembersHandlers.add(handler);
        return () => this.groupMembersHandlers.delete(handler);
    }
    onConnected(handler) {
        this.connectedHandlers.add(handler);
        return () => this.connectedHandlers.delete(handler);
    }
    onDisconnected(handler) {
        this.disconnectedHandlers.add(handler);
        return () => this.disconnectedHandlers.delete(handler);
    }
    onError(handler) {
        this.errorHandlers.add(handler);
        return () => this.errorHandlers.delete(handler);
    }
}
export const chatSocket = new ChatSocketService();

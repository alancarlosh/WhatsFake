import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatsScreen } from './src/screens/ChatsScreen';
import { ChatRoomScreen } from './src/screens/ChatRoomScreen';
import { GroupDetailsScreen } from './src/screens/GroupDetailsScreen';
import { ContactsScreen } from './src/screens/ContactsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { loginWithCredentials } from './src/services/auth';
import { createChatByUserIdViaChats, createChatFromContact, createDirectChatByUserId, createGroupChat, fetchChats, fetchChatMessagesPage, markChatAsRead } from './src/services/chatApi';
import { clearCachedChats, clearCachedContacts, clearPendingMessagesByUser, clearCachedSession, loadPendingMessages, saveCachedSession } from './src/services/localDb';
import { chatSocket } from './src/services/socket';
import { useResponsiveLayout } from './src/hooks/useResponsiveLayout';
import { useChatDerivedState } from './src/hooks/useChatDerivedState';
import { usePresenceState } from './src/hooks/usePresenceState';
import { useRealtimeChatEvents } from './src/hooks/useRealtimeChatEvents';
import { useGroupManagement } from './src/hooks/useGroupManagement';
import { useMessageComposer } from './src/hooks/useMessageComposer';
import { useAppBootstrap } from './src/hooks/useAppBootstrap';
function normalizeIdentity(value) {
    return value.trim().toLowerCase();
}
function normalizeHandle(value) {
    return normalizeIdentity(value.replace(/^@/, ''));
}
function mergeContacts(current, incoming) {
    const merged = [...current];
    incoming.forEach((candidate) => {
        const normalizedCandidateHandle = normalizeHandle(candidate.handle);
        const existingIndex = merged.findIndex((contact) => contact.id === candidate.id || normalizeHandle(contact.handle) === normalizedCandidateHandle);
        if (existingIndex < 0) {
            merged.push(candidate);
            return;
        }
        const existing = merged[existingIndex];
        if (!existing) {
            return;
        }
        merged[existingIndex] = {
            ...existing,
            ...candidate
        };
    });
    return merged.sort((left, right) => left.name.localeCompare(right.name));
}
function parseActivityMillis(chat) {
    if (chat.updatedAt) {
        const parsed = Date.parse(chat.updatedAt);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    const lastTimestamp = chat.messages.at(-1)?.timestamp;
    if (lastTimestamp) {
        const parsed = Date.parse(lastTimestamp);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return 0;
}
function sortChatsByActivity(chats) {
    return [...chats].sort((left, right) => parseActivityMillis(right) - parseActivityMillis(left));
}
export default function App() {
    const { isDesktop } = useResponsiveLayout();
    const [activeTab, setActiveTab] = useState('chats');
    const [selectedChatId, setSelectedChatId] = useState(null);
    const [chats, setChats] = useState([]);
    const [session, setSession] = useState(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [contactsError, setContactsError] = useState(null);
    const [isCreatingChat, setIsCreatingChat] = useState(false);
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [typingByChat, setTypingByChat] = useState({});
    const loadedMessagesRef = useRef(new Set());
    const typingTimeoutRef = useRef(new Map());
    const selectedChatIdRef = useRef(selectedChatId);
    const activeTabRef = useRef(activeTab);
    const { selectedChat, typingStatusText } = useChatDerivedState({
        chats,
        selectedChatId,
        typingByChat
    });
    const {
        isGroupDetailsOpen,
        selectedGroupMembers,
        isLoadingGroupMembers,
        isMutatingGroup,
        groupMembersError,
        setGroupMembersByChat,
        syncGroupMembers,
        loadGroupMembers,
        openGroupDetails,
        closeGroupDetails,
        handleAddGroupMember,
        handleRemoveGroupMember,
        handleChangeGroupRole
    } = useGroupManagement({
        session,
        selectedChat,
        setChats,
        sortChatsByActivity
    });
    const {
        onlineUsers,
        onlineUsersCount,
        applyPresencePayload,
        upsertOnlineUserFromPresence,
        replaceOnlineUsersFromSnapshot,
        updateSelfPresenceName
    } = usePresenceState(session, setChats);
    const contactFromChat = useCallback((chat) => {
        if (!session || chat.isGroup) {
            return null;
        }
        if (normalizeHandle(chat.contactHandle) === normalizeIdentity(session.username)) {
            return null;
        }
        return {
            id: chat.id,
            name: chat.contactName,
            handle: chat.contactHandle.startsWith('@') ? chat.contactHandle : `@${chat.contactHandle}`,
            avatar: chat.avatar
        };
    }, [session]);
    const upsertContacts = useCallback((incoming) => {
        if (incoming.length === 0) {
            return;
        }
        setContacts((prev) => mergeContacts(prev, incoming));
    }, []);
    const mergePendingMessagesIntoChats = useCallback(async (baseChats, userId) => {
        const pending = await loadPendingMessages(userId);
        if (pending.length === 0) {
            return baseChats;
        }
        const merged = baseChats.map((chat) => {
            const messages = [...chat.messages];
            const byChat = pending.filter((item) => item.chatId === chat.id);
            byChat.forEach((item) => {
                const exists = messages.some((message) => message.id === item.id);
                if (exists) {
                    return;
                }
                const sentDate = new Date(item.sentAt);
                const timestamp = Number.isNaN(sentDate.getTime())
                    ? item.sentAt
                    : sentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                messages.push({
                    id: item.id,
                    author: 'me',
                    text: item.text,
                    timestamp,
                    status: item.status === 'failed' ? 'failed' : 'sending'
                });
            });
            return {
                ...chat,
                messages
            };
        });
        return sortChatsByActivity(merged);
    }, []);
    const { isRestoringSession, isBootstrappingChats, chatBootstrapError, isLoadingContacts } = useAppBootstrap({
        session,
        chats,
        contacts,
        setSession,
        setChats,
        setContacts,
        setSelectedChatId,
        setContactsError,
        sortChatsByActivity,
        mergePendingMessagesIntoChats,
        upsertContacts,
        loadedMessagesRef
    });
    const resolveUniqueMessageId = useCallback((messages, candidateId, author, fallbackId) => {
        const collision = messages.find((item) => item.id === candidateId);
        if (!collision) {
            return candidateId;
        }
        if (collision.author === author) {
            return candidateId;
        }
        return `${fallbackId}-${Date.now()}`;
    }, []);
    const upsertChatFromRealtimeUpdate = useCallback((payload) => {
        setChats((prev) => {
            const existingIndex = prev.findIndex((chat) => chat.id === payload.id);
            if (existingIndex < 0) {
                const created = {
                    id: payload.id,
                    contactName: payload.contactName,
                    contactHandle: payload.contactHandle,
                    avatar: payload.avatar,
                    isOnline: false,
                    unreadCount: payload.unreadCount,
                    updatedAt: payload.updatedAt,
                    myRole: payload.myRole,
                    isGroup: payload.isGroup,
                    messages: payload.lastMessage ? [payload.lastMessage] : []
                };
                return sortChatsByActivity([...prev, created]);
            }
            const next = [...prev];
            const existing = next[existingIndex];
            if (!existing) {
                return prev;
            }
            const messages = [...existing.messages];
            if (payload.lastMessage) {
                const messageIndex = messages.findIndex((message) => message.id === payload.lastMessage?.id);
                if (messageIndex >= 0) {
                    messages[messageIndex] = { ...messages[messageIndex], ...payload.lastMessage };
                }
                else {
                    messages.push(payload.lastMessage);
                }
            }
            next[existingIndex] = {
                ...existing,
                contactName: payload.contactName || existing.contactName,
                contactHandle: payload.contactHandle || existing.contactHandle,
                avatar: payload.avatar || existing.avatar,
                unreadCount: payload.unreadCount,
                updatedAt: payload.updatedAt ?? existing.updatedAt,
                myRole: payload.myRole ?? existing.myRole,
                isGroup: payload.isGroup ?? existing.isGroup,
                messages
            };
            return sortChatsByActivity(next);
        });
    }, []);
    const clearTypingTimer = useCallback((chatId) => {
        const timer = typingTimeoutRef.current.get(chatId);
        if (timer) {
            clearTimeout(timer);
            typingTimeoutRef.current.delete(chatId);
        }
    }, []);
    const setTypingForChat = useCallback((chatId, isTyping) => {
        clearTypingTimer(chatId);
        setTypingByChat((prev) => {
            if (!isTyping) {
                if (!prev[chatId]) {
                    return prev;
                }
                const next = { ...prev };
                delete next[chatId];
                return next;
            }
            return { ...prev, [chatId]: true };
        });
        if (isTyping) {
            const timeoutId = setTimeout(() => {
                setTypingByChat((prev) => {
                    if (!prev[chatId]) {
                        return prev;
                    }
                    const next = { ...prev };
                    delete next[chatId];
                    return next;
                });
                typingTimeoutRef.current.delete(chatId);
            }, 3000);
            typingTimeoutRef.current.set(chatId, timeoutId);
        }
    }, [clearTypingTimer]);
    const syncReadState = useCallback((chatId) => {
        setChats((prev) => prev.map((chat) => {
            if (chat.id !== chatId) {
                return chat;
            }
            return { ...chat, unreadCount: 0 };
        }));
        if (!session) {
            return;
        }
        void markChatAsRead(session.token, chatId).catch(() => { });
        chatSocket.sendRead({ chatId, readAt: new Date().toISOString() });
    }, [session]);
    const handleContactDiscoveredFromChat = useCallback((chat) => {
        const derived = contactFromChat(chat);
        if (derived) {
            upsertContacts([derived]);
        }
    }, [contactFromChat, upsertContacts]);
    const { sendMessage, retryMessage, markPendingAsFailed, flushOutbox } = useMessageComposer({
        session,
        chats,
        setChats,
        onContactDiscovered: handleContactDiscoveredFromChat
    });
    const loadChatMessagesIfNeeded = (chatId) => {
        if (!session || loadedMessagesRef.current.has(chatId)) {
            return;
        }
        void fetchChatMessagesPage(session.token, chatId, { limit: 50 })
            .then((page) => {
            const messages = page.items;
            loadedMessagesRef.current.add(chatId);
            setChats((prev) => prev.map((chat) => {
                if (chat.id !== chatId) {
                    return chat;
                }
                return {
                    ...chat,
                    messages
                };
            }));
        })
            .catch(() => { });
    };
    useEffect(() => {
        selectedChatIdRef.current = selectedChatId;
    }, [selectedChatId]);
    useEffect(() => {
        activeTabRef.current = activeTab;
    }, [activeTab]);
    useEffect(() => {
        return () => {
            typingTimeoutRef.current.forEach((timer) => clearTimeout(timer));
            typingTimeoutRef.current.clear();
        };
    }, []);
    useRealtimeChatEvents({
        session,
        setChats,
        setSelectedChatId,
        setGroupMembersByChat,
        selectedChatIdRef,
        activeTabRef,
        sortChatsByActivity,
        mergePendingMessagesIntoChats,
        syncReadState,
        markPendingAsFailed,
        setTypingForChat,
        syncGroupMembers,
        applyPresencePayload,
        upsertOnlineUserFromPresence,
        replaceOnlineUsersFromSnapshot,
        upsertChatFromRealtimeUpdate,
        resolveUniqueMessageId,
        flushOutbox
    });
    useEffect(() => {
        if (!selectedChatId || !session) {
            return;
        }
        chatSocket.joinChat(selectedChatId);
        syncReadState(selectedChatId);
        loadChatMessagesIfNeeded(selectedChatId);
    }, [selectedChatId, session]);
    const openChat = (chatId) => {
        setSelectedChatId(chatId);
        chatSocket.joinChat(chatId);
        syncReadState(chatId);
        loadChatMessagesIfNeeded(chatId);
    };
    const handleTyping = (chatId, isTyping) => {
        if (!session) {
            return;
        }
        chatSocket.sendTyping({
            chatId,
            userId: session.userId,
            isTyping
        });
    };
    const startChatFromContact = async (contact) => {
        if (!session || isCreatingChat) {
            return;
        }
        const normalizedHandle = normalizeIdentity(contact.handle.replace(/^@/, ''));
        const normalizedName = normalizeIdentity(contact.name);
        const existingChat = chats.find((chat) => {
            const chatHandle = normalizeIdentity(chat.contactHandle.replace(/^@/, ''));
            const chatName = normalizeIdentity(chat.contactName);
            return chat.id === contact.id || chatHandle === normalizedHandle || chatName === normalizedName;
        });
        if (existingChat) {
            setActiveTab('chats');
            openChat(existingChat.id);
            return;
        }
        setIsCreatingChat(true);
        setContactsError(null);
        try {
            let createdChatId = null;
            const candidateUserIds = Array.from(new Set([
                contact.userId,
                contact.id,
                contact.handle.replace(/^@/, '')
            ].filter((value) => value !== undefined && value.trim().length > 0)));
            for (const candidate of candidateUserIds) {
                if (createdChatId) {
                    break;
                }
                try {
                    createdChatId = await createDirectChatByUserId(session.token, candidate);
                    break;
                }
                catch { }
                try {
                    createdChatId = await createChatByUserIdViaChats(session.token, candidate);
                    break;
                }
                catch { }
            }
            if (!createdChatId) {
                createdChatId = await createChatFromContact(session.token, contact.id);
            }
            const serverChats = await fetchChats(session.token);
            setChats(sortChatsByActivity(serverChats));
            const matchedChat = (createdChatId ? serverChats.find((chat) => chat.id === createdChatId) : null) ??
                serverChats.find((chat) => {
                    const chatHandle = normalizeIdentity(chat.contactHandle.replace(/^@/, ''));
                    const chatName = normalizeIdentity(chat.contactName);
                    return chat.id === contact.id || chatHandle === normalizedHandle || chatName === normalizedName;
                }) ??
                serverChats[0] ??
                null;
            setActiveTab('chats');
            setSelectedChatId(matchedChat?.id ?? null);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo crear el chat.';
            setContactsError(message);
        }
        finally {
            setIsCreatingChat(false);
        }
    };
    const createGroupFromContacts = async (name, memberIds) => {
        if (!session || isCreatingGroup) {
            return;
        }
        setIsCreatingGroup(true);
        setContactsError(null);
        try {
            const chatId = await createGroupChat(session.token, name, memberIds);
            const serverChats = await fetchChats(session.token);
            setChats(sortChatsByActivity(serverChats));
            const matchedChat = (chatId ? serverChats.find((chat) => chat.id === chatId) : null) ?? serverChats[0] ?? null;
            setActiveTab('chats');
            setSelectedChatId(matchedChat?.id ?? null);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo crear el grupo.';
            setContactsError(message);
        }
        finally {
            setIsCreatingGroup(false);
        }
    };
    const openChatFromOnlineUser = async (user) => {
        if (user.isSelf || !session || isCreatingChat) {
            return;
        }
        const normalizedUsername = user.username ? normalizeIdentity(user.username) : null;
        const normalizedName = user.name ? normalizeIdentity(user.name) : null;
        const existingChat = chats.find((chat) => {
            const handle = normalizeIdentity(chat.contactHandle.replace(/^@/, ''));
            const name = normalizeIdentity(chat.contactName);
            return ((normalizedUsername !== null && handle === normalizedUsername) ||
                (normalizedName !== null && name === normalizedName) ||
                (user.userId !== undefined && chat.id === user.userId));
        });
        if (existingChat) {
            setActiveTab('chats');
            openChat(existingChat.id);
            return;
        }
        if (user.userId) {
            try {
                const directChatId = await createDirectChatByUserId(session.token, user.userId);
                const serverChats = await fetchChats(session.token);
                setChats(sortChatsByActivity(serverChats));
                const matchedChat = (directChatId ? serverChats.find((chat) => chat.id === directChatId) : null) ??
                    serverChats.find((chat) => chat.id === user.userId) ??
                    null;
                if (matchedChat) {
                    setActiveTab('chats');
                    openChat(matchedChat.id);
                }
                else {
                    setContactsError('No se encontró el chat directo para ese usuario.');
                }
                return;
            }
            catch {
                // Fallback to legacy contact flow if direct endpoint fails.
            }
        }
        const contactMatch = contacts.find((contact) => {
            const handle = normalizeIdentity(contact.handle.replace(/^@/, ''));
            const name = normalizeIdentity(contact.name);
            return ((normalizedUsername !== null && handle === normalizedUsername) ||
                (normalizedName !== null && name === normalizedName) ||
                (user.userId !== undefined && contact.id === user.userId));
        });
        if (contactMatch) {
            await startChatFromContact(contactMatch);
            return;
        }
        if (user.userId) {
            await startChatFromContact({
                id: user.userId,
                name: user.name ?? user.username ?? 'Usuario',
                handle: user.username ? `@${user.username}` : `@${user.userId}`,
                avatar: (user.name ?? user.username ?? 'US').slice(0, 2).toUpperCase()
            });
            return;
        }
        setContactsError('No se pudo identificar ese usuario online para iniciar chat.');
    };
    const handleLogin = async (nextUsername, password) => {
        setIsAuthenticating(true);
        setLoginError(null);
        try {
            const response = await loginWithCredentials(nextUsername, password);
            const nextSession = {
                userId: response.user.id,
                name: response.user.name,
                username: response.user.username,
                token: response.token,
                avatar: response.user.avatar
            };
            setSession(nextSession);
            void saveCachedSession(nextSession);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
            setLoginError(message);
        }
        finally {
            setIsAuthenticating(false);
        }
    };
    const handleLogout = () => {
        const userIdToClear = session?.userId;
        typingTimeoutRef.current.forEach((timer) => clearTimeout(timer));
        typingTimeoutRef.current.clear();
        setTypingByChat({});
        setSession(null);
        setSelectedChatId(null);
        closeGroupDetails();
        setActiveTab('chats');
        setChats([]);
        setContacts([]);
        setGroupMembersByChat({});
        setContactsError(null);
        loadedMessagesRef.current.clear();
        chatSocket.disconnect();
        if (userIdToClear) {
            void clearCachedChats(userIdToClear);
            void clearCachedContacts(userIdToClear);
            void clearPendingMessagesByUser(userIdToClear);
        }
        void clearCachedSession();
    };
    const handleProfileUpdate = (nextName, nextAvatar) => {
        if (!session) {
            return;
        }
        const normalizedName = nextName.trim();
        if (normalizedName.length < 3) {
            return;
        }
        const updatedSession = {
            ...session,
            name: normalizedName,
            avatar: nextAvatar
        };
        setSession(updatedSession);
        updateSelfPresenceName(normalizedName);
        void saveCachedSession(updatedSession);
    };
    if (isRestoringSession) {
        return (
            <div className="wf-app-root">
                <div className="wf-bg-orb wf-bg-orb-top" />
                <div className="wf-bg-orb wf-bg-orb-bottom" />
                <div className="wf-center-wrap">
                    <p className="wf-help">Restaurando sesión local...</p>
                </div>
            </div>
        );
    }
    if (!session) {
        return (
            <div className="wf-app-root">
                <div className="wf-bg-orb wf-bg-orb-top" />
                <div className="wf-bg-orb wf-bg-orb-bottom" />
                <LoginScreen onSubmit={handleLogin} loading={isAuthenticating} errorMessage={loginError} />
            </div>
        );
    }
    if (!isDesktop && selectedChat && activeTab === 'chats') {
        if (isGroupDetailsOpen && selectedChat.isGroup) {
            return (
                <div className="wf-app-root">
                    <GroupDetailsScreen
                        chat={selectedChat}
                        members={selectedGroupMembers}
                        contacts={contacts}
                        loading={isLoadingGroupMembers}
                        mutating={isMutatingGroup}
                        errorMessage={groupMembersError}
                        onBack={closeGroupDetails}
                        onRefresh={() => void loadGroupMembers(selectedChat.id)}
                        onAddMember={handleAddGroupMember}
                        onRemoveMember={handleRemoveGroupMember}
                        onChangeRole={handleChangeGroupRole}
                    />
                </div>
            );
        }
        return (
            <div className="wf-app-root">
                <ChatRoomScreen
                    chat={selectedChat}
                    onBack={() => setSelectedChatId(null)}
                    onSend={sendMessage}
                    onRetryMessage={(chatId, messageId) => void retryMessage(chatId, messageId)}
                    onTyping={handleTyping}
                    typingStatusText={typingStatusText}
                    onOpenGroupDetails={openGroupDetails}
                    canSendMessages={!(selectedChat.isGroup && selectedChat.myRole === 'readonly')}
                />
            </div>
        );
    }
    return (
        <div className="wf-app-root">
            <div className="wf-bg-orb wf-bg-orb-top" />
            <div className="wf-bg-orb wf-bg-orb-bottom" />

            <div className={`wf-shell ${isDesktop ? 'is-desktop' : ''}`}>
                <aside className={`wf-sidebar ${isDesktop ? 'is-desktop' : ''}`}>
                    <div className="wf-brand-row">
                        <div>
                            <h1 className="wf-brand-title">WhatsFake</h1>
                            <p className="wf-brand-subtitle">@{session.username}</p>
                        </div>
                        <button type="button" className="wf-link" onClick={handleLogout}>
                            Salir
                        </button>
                    </div>

                    <div className="wf-tab-bar">
                        <TabButton label="Chats" active={activeTab === 'chats'} onPress={() => setActiveTab('chats')} />
                        <TabButton
                            label="Contactos"
                            active={activeTab === 'contacts'}
                            onPress={() => setActiveTab('contacts')}
                        />
                        <TabButton
                            label="Ajustes"
                            active={activeTab === 'settings'}
                            onPress={() => setActiveTab('settings')}
                        />
                    </div>

                    <div className="wf-sidebar-content">
                        {activeTab === 'chats' ? (
                            <div className="wf-chats-host">
                                {isBootstrappingChats ? <p className="wf-help">Cargando chats...</p> : null}
                                {chatBootstrapError ? <p className="wf-error">{chatBootstrapError}</p> : null}
                                <ChatsScreen
                                    chats={chats}
                                    onlineUsersCount={onlineUsersCount}
                                    onlineUsers={onlineUsers}
                                    selectedChatId={selectedChatId}
                                    onOpenChat={openChat}
                                    onOpenOnlineUser={openChatFromOnlineUser}
                                    compact={isDesktop}
                                />
                            </div>
                        ) : null}
                        {activeTab === 'contacts' ? (
                            <ContactsScreen
                                contacts={contacts}
                                loading={isLoadingContacts || isCreatingChat}
                                creatingGroup={isCreatingGroup}
                                errorMessage={contactsError}
                                onStartChat={startChatFromContact}
                                onCreateGroup={createGroupFromContacts}
                            />
                        ) : null}
                        {activeTab === 'settings' ? (
                            <SettingsScreen
                                username={session.username}
                                currentName={session.name}
                                currentAvatar={session.avatar}
                                onSaveProfile={handleProfileUpdate}
                            />
                        ) : null}
                    </div>
                </aside>

                {isDesktop ? (
                    <main className="wf-chat-panel">
                        {activeTab === 'chats' && selectedChat && isGroupDetailsOpen && selectedChat.isGroup ? (
                            <GroupDetailsScreen
                                chat={selectedChat}
                                members={selectedGroupMembers}
                                contacts={contacts}
                                loading={isLoadingGroupMembers}
                                mutating={isMutatingGroup}
                                errorMessage={groupMembersError}
                                onBack={closeGroupDetails}
                                onRefresh={() => void loadGroupMembers(selectedChat.id)}
                                onAddMember={handleAddGroupMember}
                                onRemoveMember={handleRemoveGroupMember}
                                onChangeRole={handleChangeGroupRole}
                            />
                        ) : activeTab === 'chats' && selectedChat ? (
                            <ChatRoomScreen
                                chat={selectedChat}
                                onBack={() => setSelectedChatId(null)}
                                onSend={sendMessage}
                                onRetryMessage={(chatId, messageId) => void retryMessage(chatId, messageId)}
                                onTyping={handleTyping}
                                typingStatusText={typingStatusText}
                                onOpenGroupDetails={openGroupDetails}
                                canSendMessages={!(selectedChat.isGroup && selectedChat.myRole === 'readonly')}
                                showBackButton={false}
                                embedded
                            />
                        ) : (
                            <div className="wf-placeholder">
                                <h3>Panel de conversación</h3>
                                <p>
                                    Selecciona un chat para continuar o explora contactos y ajustes desde la barra lateral.
                                </p>
                            </div>
                        )}
                    </main>
                ) : null}
            </div>
        </div>
    );
}
function TabButton({ label, active, onPress }) {
    return (
        <button type="button" className={`wf-tab-btn ${active ? 'is-active' : ''}`} onClick={onPress}>
            {label}
        </button>
    );
}

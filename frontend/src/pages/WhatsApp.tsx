import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getLiveChats, getLiveChatMessages, sendLiveMessage, getWhatsAppStatus } from '../services/api';
import { socket } from '../components/Layout';
import toast from 'react-hot-toast';
import {
  Search, Send, Users, User, MessageCircle, ChevronLeft,
  Wifi, WifiOff, RefreshCw, Check, CheckCheck, Clock,
  SmilePlus, Phone, Video, MoreVertical, Circle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveChat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  timestamp: number | null;
  lastMessage: {
    body: string;
    fromMe: boolean;
    type: string;
    timestamp: number | null;
  } | null;
  profilePicUrl: string | null;
  archived: boolean;
  pinned: boolean;
  members?: number;
}

interface LiveMessage {
  id: string;
  body: string;
  fromMe: boolean;
  type: string;
  timestamp: number | null;
  hasMedia: boolean;
  mediaUrl?: string | null;
  mediaType?: string | null;
  author: string | null;
  ack: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatChatTime(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Ontem';
  return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

function formatMessageTime(ts: number | null): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return 'Hoje';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AckIcon({ ack }: { ack: number }) {
  if (ack === 3) return <CheckCheck size={14} className="text-blue-400 shrink-0" />;
  if (ack === 2) return <CheckCheck size={14} className="text-gray-400 shrink-0" />;
  if (ack === 1) return <Check size={14} className="text-gray-400 shrink-0" />;
  return <Clock size={14} className="text-gray-300 shrink-0" />;
}

function Avatar({
  name,
  isGroup,
  profilePicUrl,
  size = 'md',
}: {
  name: string;
  isGroup: boolean;
  profilePicUrl: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';
  const iconSize = size === 'lg' ? 22 : size === 'sm' ? 14 : 18;
  const textSize = size === 'lg' ? 'text-base' : size === 'sm' ? 'text-xs' : 'text-sm';

  if (profilePicUrl) {
    return (
      <img
        src={profilePicUrl}
        alt={name}
        className={`${dim} rounded-full object-cover shrink-0`}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center shrink-0 font-bold ${textSize} ${
        isGroup ? 'bg-teal-100 text-teal-700' : 'bg-whatsapp/10 text-whatsapp'
      }`}
    >
      {isGroup ? <Users size={iconSize} /> : name.charAt(0).toUpperCase()}
    </div>
  );
}

function ChatListItem({
  chat,
  isActive,
  onClick,
}: {
  chat: LiveChat;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-[#f0f2f5] transition-colors text-left border-b border-gray-100 ${
        isActive ? 'bg-[#e9edef]' : ''
      }`}
    >
      <Avatar name={chat.name} isGroup={chat.isGroup} profilePicUrl={chat.profilePicUrl} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="font-medium text-sm text-gray-900 truncate">{chat.name}</span>
          <span
            className={`text-[11px] shrink-0 ${
              chat.unreadCount > 0 ? 'text-[#25d366] font-semibold' : 'text-gray-400'
            }`}
          >
            {formatChatTime(chat.timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
            {chat.lastMessage?.fromMe && (
              <AckIcon ack={2} />
            )}
            <span className="truncate">
              {chat.lastMessage?.body || (chat.lastMessage ? '[Mídia]' : 'Nenhuma mensagem')}
            </span>
          </p>
          {chat.unreadCount > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-[#25d366] text-white text-[10px] font-bold flex items-center justify-center px-1">
              {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function MessageBubble({ msg, isGroup }: { msg: LiveMessage; isGroup: boolean }) {
  const isOut = msg.fromMe;
  return (
    <div className={`flex ${isOut ? 'justify-end' : 'justify-start'} px-2 sm:px-4`}>
      <div
        className={`max-w-[85%] sm:max-w-[65%] min-w-[60px] px-2 sm:px-3 py-2 rounded-xl shadow-sm text-xs sm:text-sm relative ${
          isOut ? 'bg-[#d9fdd3] rounded-tr-none' : 'bg-white rounded-tl-none text-gray-800'
        }`}
      >
        {/* Group author label */}
        {isGroup && !isOut && msg.author && (
          <p className="text-[10px] sm:text-xs font-semibold text-teal-600 mb-0.5 truncate">
            {msg.author.split('@')[0]}
          </p>
        )}
        {/* Media */}
        {msg.mediaUrl && msg.mediaType === 'image' ? (
          <img 
            src={msg.mediaUrl} 
            alt="Imagem" 
            className="max-w-[200px] sm:max-w-xs rounded-lg mb-1"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : msg.mediaUrl && msg.mediaType === 'audio' ? (
          <audio 
            controls 
            className="max-w-[200px] sm:max-w-xs h-8"
            controlsList="nodownload"
          >
            <source src={msg.mediaUrl} />
            Seu navegador não suporta reprodução de áudio.
          </audio>
        ) : msg.mediaUrl && msg.mediaType === 'video' ? (
          <video 
            controls 
            className="max-w-[200px] sm:max-w-xs rounded-lg"
            controlsList="nodownload"
          >
            <source src={msg.mediaUrl} />
            Seu navegador não suporta reprodução de vídeo.
          </video>
        ) : msg.body && msg.body !== '[Mídia]' ? (
          <p className="whitespace-pre-wrap break-words leading-relaxed text-xs sm:text-sm">{msg.body}</p>
        ) : msg.hasMedia ? (
          <p className="text-gray-400 italic text-[10px] sm:text-xs">📎 Mídia</p>
        ) : null}
        {/* Footer */}
        <div className="flex items-center justify-end gap-1 mt-1">
          <span className="text-[9px] sm:text-[10px] text-gray-400">{formatMessageTime(msg.timestamp)}</span>
          {isOut && <AckIcon ack={msg.ack} />}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WhatsApp() {
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [search, setSearch] = useState('');
  const [activeChat, setActiveChat] = useState<LiveChat | null>(null);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: waStatus } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: getWhatsAppStatus,
    refetchInterval: 5000,
  });

  const isConnected = waStatus?.status === 'connected';

  const {
    data: chats = [],
    isLoading: chatsLoading,
    refetch: refetchChats,
  } = useQuery<LiveChat[]>({
    queryKey: ['live-chats'],
    queryFn: getLiveChats,
    enabled: isConnected,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filteredChats = chats
    .filter((c) => {
      if (filter === 'unread') return c.unreadCount > 0;
      if (filter === 'groups') return c.isGroup;
      return true;
    })
    .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // Pinned first, then by timestamp desc
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

  // ── Load messages ─────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (chat: LiveChat) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      const data = await getLiveChatMessages(chat.id, 40);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
      toast.error('Erro ao carregar mensagens');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const selectChat = useCallback(
    (chat: LiveChat) => {
      setActiveChat(chat);
      setShowSidebar(false);
      loadMessages(chat);
      setText('');
    },
    [loadMessages]
  );

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // ── Socket: real-time new messages ────────────────────────────────────────

  useEffect(() => {
    const handler = (payload: any) => {
      // Refresh chat list to update last message / unread count
      qc.invalidateQueries({ queryKey: ['live-chats'] });

      // If the incoming message belongs to the active chat, append it
      if (activeChat) {
        const fromId = payload.message?.from || payload.contactId;
        const activeChatUser = activeChat.id.split('@')[0];
        if (fromId && (fromId === activeChatUser || payload.contactId === activeChatUser)) {
          const newMsg: LiveMessage = {
            id: payload.message?.id || String(Date.now()),
            body: payload.message?.body || '',
            fromMe: false,
            type: payload.message?.type || 'chat',
            timestamp: payload.message?.timestamp
              ? payload.message.timestamp * 1000
              : Date.now(),
            hasMedia: payload.message?.hasMedia || false,
            author: payload.message?.author || null,
            ack: 0,
          };
          setMessages((prev) => [...prev, newMsg]);
        }
      }
    };

    socket.on('message:received', handler);
    return () => {
      socket.off('message:received', handler);
    };
  }, [activeChat, qc]);

  // ── Send message ──────────────────────────────────────────────────────────

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!activeChat || sending || !text.trim()) return;

    const body = text.trim();
    setText('');
    setSending(true);

    // Optimistic update
    const optimisticMsg: LiveMessage = {
      id: `optimistic-${Date.now()}`,
      body,
      fromMe: true,
      type: 'chat',
      timestamp: Date.now(),
      hasMedia: false,
      author: null,
      ack: 0,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const result = await sendLiveMessage(activeChat.id, body);
      // Replace optimistic with real id
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticMsg.id
            ? { ...m, id: result.messageId || m.id, ack: 1 }
            : m
        )
      );
      qc.invalidateQueries({ queryKey: ['live-chats'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao enviar mensagem');
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      setText(body);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // ── Date separators ───────────────────────────────────────────────────────

  const messagesWithSeparators = (() => {
    const result: Array<{ type: 'separator'; label: string; key: string } | { type: 'message'; msg: LiveMessage }> = [];
    let lastDate = '';
    for (const msg of messages) {
      if (msg.timestamp) {
        const d = new Date(msg.timestamp);
        const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (dateKey !== lastDate) {
          lastDate = dateKey;
          result.push({ type: 'separator', label: formatDateSeparator(msg.timestamp), key: dateKey });
        }
      }
      result.push({ type: 'message', msg });
    }
    return result;
  })();

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden" style={{ background: '#111b21' }}>
      {/* ── Left Sidebar ── */}
      <aside
        className={`
          ${showSidebar ? 'flex' : 'hidden md:flex'}
          w-full md:w-[360px] lg:w-[400px] flex-col shrink-0
        `}
        style={{ background: '#111b21', borderRight: '1px solid #2a3942' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ background: '#202c33' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#25d366]/20 flex items-center justify-center">
              <MessageCircle size={20} className="text-[#25d366]" />
            </div>
            <div>
              <h1 className="font-semibold text-white text-sm">WhatsApp</h1>
              <div className="flex items-center gap-1.5">
                {isConnected ? (
                  <>
                    <Circle size={7} className="text-[#25d366] fill-[#25d366]" />
                    <span className="text-[11px] text-[#25d366]">Conectado · {waStatus?.phone}</span>
                  </>
                ) : (
                  <>
                    <Circle size={7} className="text-red-400 fill-red-400" />
                    <span className="text-[11px] text-red-400">Desconectado</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => refetchChats()}
            className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Atualizar conversas"
          >
            <RefreshCw size={16} className={chatsLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Search + Filter */}
        <div className="px-3 py-2 space-y-2" style={{ background: '#111b21' }}>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: '#202c33' }}
          >
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm outline-none text-white placeholder-gray-500"
              placeholder="Pesquisar ou começar nova conversa"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1.5">
            {(['all', 'unread', 'groups'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === f
                    ? 'bg-[#25d366] text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                style={filter !== f ? { background: '#202c33' } : {}}
              >
                {f === 'all' ? 'Todas' : f === 'unread' ? 'Não lidas' : 'Grupos'}
              </button>
            ))}
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto" style={{ background: '#111b21' }}>
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
              <WifiOff size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm font-medium">WhatsApp desconectado</p>
              <p className="text-gray-600 text-xs mt-1">
                Vá em Configurações → WhatsApp para conectar
              </p>
            </div>
          ) : chatsLoading ? (
            <div className="flex flex-col items-center justify-center h-full py-10">
              <RefreshCw size={28} className="text-[#25d366] animate-spin mb-3" />
              <p className="text-gray-400 text-sm">Carregando conversas...</p>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-10">
              <MessageCircle size={40} className="text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">
                {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
              </p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={activeChat?.id === chat.id}
                onClick={() => selectChat(chat)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ── Chat Area ── */}
      <div
        className={`${!showSidebar ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}
        style={{ background: '#0b141a' }}
      >
        {!activeChat ? (
          /* Welcome / empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{ background: '#202c33' }}
            >
              <MessageCircle size={44} className="text-[#25d366]" />
            </div>
            <h2 className="text-2xl font-light text-white mb-2">WhatsApp Web</h2>
            <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
              Selecione uma conversa na lista ao lado para começar a enviar e receber mensagens.
            </p>
            {!isConnected && (
              <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-red-900/30 text-red-400 text-sm">
                <WifiOff size={14} />
                <span>WhatsApp não está conectado</span>
              </div>
            )}
            {isConnected && (
              <div className="mt-6 flex items-center gap-2 px-4 py-2 rounded-full bg-[#25d366]/10 text-[#25d366] text-sm">
                <Wifi size={14} />
                <span>Conectado como +{waStatus?.phone}</span>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div
              className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 shrink-0"
              style={{ background: '#202c33' }}
            >
              <button
                onClick={() => setShowSidebar(true)}
                className="md:hidden p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <Avatar
                name={activeChat.name}
                isGroup={activeChat.isGroup}
                profilePicUrl={activeChat.profilePicUrl}
                size="sm"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-xs sm:text-sm truncate">{activeChat.name}</p>
                <p className="text-[10px] sm:text-xs text-gray-400">
                  {activeChat.isGroup
                    ? `${activeChat.members ?? 0} participantes`
                    : activeChat.id.split('@')[0]}
                </p>
              </div>
              <div className="flex items-center gap-0.5 sm:gap-1">
                <button className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="Chamada de voz">
                  <Phone size={14} className="sm:w-[18px] sm:h-[18px]" />
                </button>
                <button className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="Chamada de vídeo">
                  <Video size={14} className="sm:w-[18px] sm:h-[18px]" />
                </button>
                <button
                  onClick={() => loadMessages(activeChat)}
                  className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  title="Recarregar mensagens"
                >
                  <RefreshCw size={14} className={`sm:w-4 sm:h-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                </button>
                <button className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title="Mais opções">
                  <MoreVertical size={14} className="sm:w-[18px] sm:h-[18px]" />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto py-2 sm:py-4 space-y-1 px-1 sm:px-0"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg width=\'400\' height=\'400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Crect width=\'400\' height=\'400\' fill=\'%230b141a\'/%3E%3C/svg%3E")',
                backgroundColor: '#0b141a',
              }}
            >
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw size={28} className="text-[#25d366] animate-spin" />
                    <p className="text-gray-400 text-sm">Carregando mensagens...</p>
                  </div>
                </div>
              ) : messagesWithSeparators.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div
                    className="text-center px-6 py-4 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    <MessageCircle size={28} className="text-gray-500 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">Nenhuma mensagem ainda.</p>
                    <p className="text-gray-500 text-xs mt-1">Envie a primeira mensagem abaixo.</p>
                  </div>
                </div>
              ) : (
                messagesWithSeparators.map((item) => {
                  if (item.type === 'separator') {
                    return (
                      <div key={item.key} className="flex items-center justify-center py-2">
                        <span
                          className="text-xs text-gray-300 px-3 py-1 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.08)' }}
                        >
                          {item.label}
                        </span>
                      </div>
                    );
                  }
                  return (
                    <MessageBubble
                      key={item.msg.id}
                      msg={item.msg}
                      isGroup={activeChat.isGroup}
                    />
                  );
                })
              )}
            </div>

            {/* Input Area */}
            <div
              className="px-2 sm:px-4 py-2 sm:py-3 shrink-0"
              style={{ background: '#202c33' }}
            >
              <form onSubmit={handleSend} className="flex items-end gap-1 sm:gap-2">
                <button
                  type="button"
                  className="p-1.5 sm:p-2.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                  title="Emoji"
                >
                  <SmilePlus size={16} className="sm:w-5 sm:h-5" />
                </button>

                <textarea
                  ref={inputRef}
                  className="flex-1 rounded-lg px-2 sm:px-4 py-2 text-xs sm:text-sm outline-none resize-none max-h-32 text-white placeholder-gray-500"
                  style={{ background: '#2a3942', minHeight: '36px' }}
                  placeholder="Digite uma mensagem"
                  value={text}
                  rows={1}
                  onChange={(e) => {
                    setText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />

                <button
                  type="submit"
                  disabled={sending || !text.trim()}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shrink-0 disabled:opacity-40"
                  style={{ background: '#25d366' }}
                  title="Enviar mensagem"
                >
                  {sending ? (
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send size={14} className="sm:w-4 sm:h-4 text-white" />
                  )}
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

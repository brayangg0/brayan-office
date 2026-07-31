import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getContacts, getGroups, getContactMessages, getGroupMessages,
  sendMessageToContact, sendMessageToGroup, getAttentionMessages, resolveContactAttention,
} from '../services/api';
import { socket } from '../components/Layout';
import toast from 'react-hot-toast';
import {
  Search, Send, Users, User, Paperclip, X, MessageCircle,
  Image, FileAudio, FileVideo, FileText, CheckCheck, Check,
  Clock, ChevronLeft, AlertTriangle, Bell, CheckCircle,
} from 'lucide-react';

type ConversationType = 'contact' | 'group';

interface Conversation {
  type: ConversationType;
  id: string;
  name: string;
  phone?: string;
  members?: number;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body?: string;
  mediaPath?: string;
  status: string;
  createdAt: string;
}

function attentionMessageText(message: any): string {
  if (!message) return 'Mensagem não identificada';
  if (message.body && !['[Mídia]', '[MEDIA]'].includes(message.body)) return message.body;
  if (message.type === 'audio' || message.type === 'ptt') return 'Mensagem de áudio';
  if (message.type === 'image') return 'Imagem recebida';
  if (message.type === 'video') return 'Vídeo recebido';
  if (message.type === 'document') return 'Documento recebido';
  return message.body || 'Mensagem recebida';
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck size={12} className="text-blue-400" />;
  if (status === 'delivered') return <CheckCheck size={12} className="text-gray-400" />;
  if (status === 'sent') return <Check size={12} className="text-gray-400" />;
  return <Clock size={12} className="text-gray-300" />;
}

function MediaPreview({ mediaPath, type }: { mediaPath: string; type: string }) {
  const url = mediaPath.startsWith('http') ? mediaPath : mediaPath;
  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt="Imagem" className="max-w-[200px] max-h-[200px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition" />
      </a>
    );
  }
  if (type === 'audio') {
    return <audio controls src={url} className="max-w-[220px]" />;
  }
  if (type === 'video') {
    return <video controls src={url} className="max-w-[220px] max-h-[160px] rounded-lg" />;
  }
  // document
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 text-blue-600 hover:underline text-sm">
      <FileText size={16} /> Abrir documento
    </a>
  );
}

export default function Messages() {
  const location = useLocation();
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'contacts' | 'groups'>('contacts');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [onlyPending, setOnlyPending] = useState(false);

  // Queries
  const { data: contactsData } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => getContacts({ search, limit: 100 }),
  });
  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  });
  const { data: attentionData } = useQuery({
    queryKey: ['attention-messages'],
    queryFn: getAttentionMessages,
    refetchInterval: 15000,
  });

  const pendingByContact = new Map<string, any>(
    (attentionData?.conversations || []).map((item: any) => [item.contactId, item])
  );
  const queriedContacts: any[] = contactsData?.contacts || [];
  const pendingContacts: any[] = (attentionData?.conversations || [])
    .map((item: any) => item.contact)
    .filter((contact: any) =>
      !search ||
      contact.name.toLowerCase().includes(search.toLowerCase()) ||
      contact.phone.includes(search)
    );
  const allContacts: any[] = [
    ...pendingContacts,
    ...queriedContacts.filter((contact: any) =>
      !pendingContacts.some((pending: any) => pending.id === contact.id)
    ),
  ];
  const contacts = onlyPending
    ? allContacts.filter((contact: any) => pendingByContact.has(contact.id))
    : allContacts;
  const groups: any[] = groupsData || [];

  // Filtra grupos pelo search
  const filteredGroups = groups.filter((g: any) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  // Carrega mensagens quando muda a conversa selecionada
  const loadMessages = useCallback(async (conv: Conversation) => {
    setMessages([]);
    try {
      if (conv.type === 'contact') {
        const data = await getContactMessages(conv.id);
        setMessages(data.messages || []);
      } else {
        const data = await getGroupMessages(conv.id);
        setMessages(data.messages || []);
      }
    } catch {
      setMessages([]);
    }
  }, []);

  // Seleciona conversa
  const selectConversation = useCallback((conv: Conversation) => {
    setSelected(conv);
    setShowSidebar(false);
    loadMessages(conv);
    setText('');
    setFile(null);
    setCaption('');
  }, [loadMessages]);

  // Lê parâmetros de navegação (vindos de Contacts ou WhatsAppSetup)
  useEffect(() => {
    const state = location.state as { contactId?: string; contactName?: string; contactPhone?: string; groupId?: string; groupName?: string; groupMembers?: number } | null;
    if (!state) return;

    if (state.contactId) {
      selectConversation({
        type: 'contact',
        id: state.contactId,
        name: state.contactName || 'Contato',
        phone: state.contactPhone,
      });
      setActiveTab('contacts');
    } else if (state.groupId) {
      selectConversation({
        type: 'group',
        id: state.groupId,
        name: state.groupName || 'Grupo',
        members: state.groupMembers,
      });
      setActiveTab('groups');
    }
  }, [location.state, selectConversation]);

  // Scroll para o fim
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Socket: mensagens em tempo real
  useEffect(() => {
    const handler = (payload: any) => {
      if (selected?.type === 'contact' && selected.id === payload.contactId) {
        setMessages((prev) => [...prev, payload.message]);
      }
      qc.invalidateQueries({ queryKey: ['contacts'] });
    };
    socket.on('message:received', handler);
    const attentionHandler = () => qc.invalidateQueries({ queryKey: ['attention-messages'] });
    socket.on('attention:required', attentionHandler);
    socket.on('attention:resolved', attentionHandler);
    return () => {
      socket.off('message:received', handler);
      socket.off('attention:required', attentionHandler);
      socket.off('attention:resolved', attentionHandler);
    };
  }, [selected, qc]);

  const enableBrowserAlerts = async () => {
    if (!('Notification' in window)) {
      toast.error('Este navegador não oferece notificações.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') toast.success('Notificações do navegador ativadas!');
    else toast.error('Permissão de notificação não concedida.');
  };

  const resolvePending = async (contactId: string) => {
    await resolveContactAttention(contactId);
    await qc.invalidateQueries({ queryKey: ['attention-messages'] });
    toast.success('Atendimento marcado como resolvido.');
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || sending) return;
    if (!file && !text.trim()) return;

    const currentSelected = selected;
    setSending(true);
    const fd = new FormData();

    try {
      if (currentSelected.type === 'contact') {
        fd.append('contactId', currentSelected.id);
        if (file) {
          fd.append('media', file);
          fd.append('type', 'media');
          if (caption.trim()) fd.append('caption', caption.trim());
        } else {
          fd.append('type', 'text');
          fd.append('body', text.trim());
        }
        const result = await sendMessageToContact(fd);
        // Adiciona a mensagem localmente para feedback imediato
        setMessages((prev) => [...prev, {
          id: result.messageId,
          direction: 'outbound',
          type: file ? (file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'document') : 'text',
          body: text.trim() || caption.trim() || '[Mídia]',
          status: result.status || 'sent',
          createdAt: new Date().toISOString(),
        }]);
      } else {
        fd.append('groupId', currentSelected.id);
        if (file) {
          fd.append('media', file);
          fd.append('type', 'media');
          if (caption.trim()) fd.append('caption', caption.trim());
        } else {
          fd.append('type', 'text');
          fd.append('body', text.trim());
        }
        const result = await sendMessageToGroup(fd);
        setMessages((prev) => [...prev, {
          id: result.messageId,
          direction: 'outbound',
          type: file ? (file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'document') : 'text',
          body: text.trim() || caption.trim() || '[Mídia]',
          status: result.status || 'sent',
          createdAt: new Date().toISOString(),
        }]);
      }

      setText('');
      setFile(null);
      setCaption('');
      toast.success('Mensagem enviada!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Erro ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    if (f) setText('');
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const fileTypeIcon = (f: File) => {
    if (f.type.startsWith('image/')) return <Image size={14} />;
    if (f.type.startsWith('audio/')) return <FileAudio size={14} />;
    if (f.type.startsWith('video/')) return <FileVideo size={14} />;
    return <FileText size={14} />;
  };

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">
      {/* ── Sidebar ── */}
      <aside className={`
        ${showSidebar ? 'flex' : 'hidden md:flex'}
        w-full md:w-80 lg:w-96 flex-col bg-white border-r border-gray-200 shrink-0
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <h1 className="text-lg font-bold mb-3 flex items-center gap-2">
            <MessageCircle size={20} className="text-whatsapp" /> Mensagens
          </h1>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setOnlyPending(!onlyPending)}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium ${
                onlyPending ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'
              }`}
            >
              <AlertTriangle size={14} />
              Pendentes ({attentionData?.total || 0})
            </button>
            <button
              type="button"
              onClick={enableBrowserAlerts}
              className="rounded-lg px-3 py-2 text-xs bg-gray-100 text-gray-600"
              title="Ativar notificações do navegador"
            >
              <Bell size={15} />
            </button>
          </div>
          {/* Search */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm outline-none placeholder-gray-400"
              placeholder="Buscar contato ou grupo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {/* Tabs */}
          <div className="flex mt-3 bg-gray-100 rounded-lg p-1 gap-1">
            <button
              onClick={() => setActiveTab('contacts')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'contacts' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <User size={13} /> Contatos ({contacts.length})
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'groups' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Users size={13} /> Grupos ({filteredGroups.length})
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'contacts' ? (
            contacts.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">Nenhum contato encontrado</p>
            ) : (
              contacts.map((c: any) => {
                const pending = pendingByContact.get(c.id);
                return (
                <button
                  key={c.id}
                  onClick={() => selectConversation({ type: 'contact', id: c.id, name: c.name, phone: c.phone })}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b ${pending ? 'bg-red-50 border-red-100' : 'border-gray-50'} ${selected && selected.id === c.id && selected.type === 'contact' ? 'border-l-2 border-l-whatsapp' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full bg-whatsapp/10 flex items-center justify-center text-whatsapp font-bold text-sm shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">
                      {c.name}
                      {pending && <span className="ml-1 text-[10px] font-semibold text-red-600">PRECISA DE ATENDIMENTO</span>}
                    </p>
                    <p className={`text-xs ${pending ? 'text-red-700 line-clamp-2 whitespace-normal' : 'text-gray-400 truncate'}`}>
                      {pending ? `“${attentionMessageText(pending.latestMessage)}”` : c.phone}
                    </p>
                  </div>
                  {pending && (
                    <span className="min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                      {pending.count}
                    </span>
                  )}
                </button>
              )})
            )
          ) : (
            filteredGroups.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-10">Nenhum grupo encontrado</p>
            ) : (
              filteredGroups.map((g: any) => (
                <button
                  key={g.id}
                  onClick={() => selectConversation({ type: 'group', id: g.id, name: g.name, members: g.members })}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 ${selected?.id === g.id && selected?.type === 'group' ? 'bg-green-50 border-l-2 border-l-whatsapp' : ''}`}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <Users size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{g.name}</p>
                    <p className="text-xs text-gray-400">{g.members} membros</p>
                  </div>
                </button>
              ))
            )
          )}
        </div>
      </aside>

      {/* ── Chat Area ── */}
      <div className={`${!showSidebar ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {!selected ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-full bg-whatsapp/10 flex items-center justify-center mb-4">
              <MessageCircle size={36} className="text-whatsapp" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Selecione uma conversa</h2>
            <p className="text-gray-400 text-sm max-w-xs">
              Escolha um contato ou grupo na lista ao lado para começar a enviar mensagens.
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shadow-sm">
              <button
                onClick={() => setShowSidebar(true)}
                className="md:hidden p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <ChevronLeft size={20} />
              </button>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${selected.type === 'group' ? 'bg-blue-100 text-blue-600' : 'bg-whatsapp/10 text-whatsapp'}`}>
                {selected.type === 'group' ? <Users size={18} /> : selected.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{selected.name}</p>
                <p className="text-xs text-gray-400">
                  {selected.type === 'group' ? `${selected.members || 0} membros` : selected.phone}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-2"
              style={{ backgroundImage: 'radial-gradient(#d1d1d1 0.5px, #e5ddd5 0.5px)', backgroundSize: '10px 10px' }}
            >
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center bg-white/80 rounded-xl px-6 py-4 shadow-sm">
                    <MessageCircle size={28} className="text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Nenhuma mensagem ainda.</p>
                    <p className="text-gray-400 text-xs mt-1">Envie a primeira mensagem abaixo.</p>
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-xl shadow-sm text-sm relative ${
                      m.direction === 'outbound'
                        ? 'bg-[#dcf8c6] rounded-tr-none'
                        : 'bg-white rounded-tl-none text-gray-800'
                    }`}>
                      {/* Media */}
                      {m.mediaPath && (
                        <div className="mb-1">
                          <MediaPreview mediaPath={m.mediaPath} type={m.type} />
                        </div>
                      )}
                      {/* Body */}
                      {m.body && m.body !== '[Mídia]' && (
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      )}
                      {/* Footer */}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-gray-400">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {m.direction === 'outbound' && <StatusIcon status={m.status} />}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Area */}
            {selected.type === 'contact' && pendingByContact.has(selected.id) && (
              <div className="bg-red-50 border-t border-red-100 px-3 py-3 flex items-start justify-between gap-3">
                <div className="text-xs text-red-800 min-w-0">
                  <span className="font-semibold flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={14} /> A automação não encontrou uma resposta
                  </span>
                  <p className="break-words">
                    Pergunta recebida: “{attentionMessageText(pendingByContact.get(selected.id)?.latestMessage)}”
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => resolvePending(selected.id)}
                  className="text-xs text-green-700 font-medium flex items-center gap-1"
                >
                  <CheckCircle size={14} /> Marcar resolvido
                </button>
              </div>
            )}
            <div className="bg-white border-t border-gray-200 p-3">
              {/* File preview */}
              {file && (
                <div className="flex items-center gap-2 mb-2 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200">
                  <span className="text-whatsapp">{fileTypeIcon(file)}</span>
                  <span className="text-xs text-gray-600 truncate flex-1">{file.name}</span>
                  <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 transition">
                    <X size={14} />
                  </button>
                </div>
              )}
              {/* Caption for media */}
              {file && (
                <input
                  className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-2 outline-none focus:ring-2 focus:ring-whatsapp/20"
                  placeholder="Legenda (opcional)..."
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              )}
              <form onSubmit={handleSend} className="flex items-end gap-2">
                {/* File upload button */}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,audio/*,video/*,application/pdf,.doc,.docx"
                  onChange={handleFileChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 rounded-full text-gray-500 hover:bg-gray-100 transition shrink-0"
                  title="Anexar arquivo"
                >
                  <Paperclip size={18} />
                </button>

                {/* Text input */}
                {!file && (
                  <textarea
                    className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-whatsapp/20 resize-none max-h-32"
                    placeholder="Digite uma mensagem..."
                    value={text}
                    rows={1}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e as any);
                      }
                    }}
                  />
                )}
                {file && <div className="flex-1" />}

                {/* Send button */}
                <button
                  type="submit"
                  disabled={sending || (!file && !text.trim())}
                  className="w-10 h-10 rounded-full bg-whatsapp text-white flex items-center justify-center shadow hover:bg-green-600 transition-all disabled:opacity-50 disabled:grayscale shrink-0"
                >
                  {sending
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Send size={16} />
                  }
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

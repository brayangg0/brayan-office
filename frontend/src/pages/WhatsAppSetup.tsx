import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWhatsAppStatus, getQrCode, syncGroups, restartWhatsApp, logoutWhatsApp, sendMessage, getGroups, toggleWhatsAppGroup } from '../services/api';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { Wifi, WifiOff, RefreshCw, Send, Users, Smartphone, RefreshCcw, LogOut } from 'lucide-react';

const socket = io({ 
  path: '/socket.io',
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
});

export default function WhatsAppSetup() {
  const qc = useQueryClient();
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [sendForm, setSendForm] = useState({ to: '', body: '', type: 'text', isGroup: false });
  const [file, setFile] = useState<File | null>(null);

  const { data: status, refetch, isLoading: statusLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: getWhatsAppStatus,
    refetchInterval: 3000, // Mais rápido (antes era 5000)
  });
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: getGroups });

  useEffect(() => {
    // Socket listeners para tempo real
    socket.on('whatsapp:qr', ({ qr }: { qr: string }) => {
      console.log('📱 QR Code recebido via Socket.IO');
      setQrImage(qr);
      setLoadingQr(false);
    });
    
    socket.on('whatsapp:ready', () => {
      console.log('✅ WhatsApp conectado!');
      setQrImage(null);
      setLoadingQr(false);
      refetch();
      toast.success('WhatsApp conectado! ✅');
    });
    
    socket.on('whatsapp:disconnected', () => {
      console.log('❌ WhatsApp desconectado');
      setQrImage(null);
      refetch();
      toast.error('WhatsApp desconectado');
    });

    return () => {
      socket.off('whatsapp:qr');
      socket.off('whatsapp:ready');
      socket.off('whatsapp:disconnected');
    };
  }, [refetch]);

  // Carrega QR se já disponível no banco
  useEffect(() => {
    if (status?.status === 'qr_ready' && !qrImage) {
      setLoadingQr(true);
      getQrCode()
        .then((d) => setQrImage(d.qr))
        .catch((err) => {
          console.error('Erro ao buscar QR:', err);
          toast.error('Erro ao buscar QR Code');
        })
        .finally(() => setLoadingQr(false));
    } else if (status?.status === 'connected') {
      setQrImage(null);
      setLoadingQr(false);
    }
  }, [status?.status, qrImage]);

  const restartMut = useMutation({
    mutationFn: restartWhatsApp,
    onSuccess: () => {
      setQrImage(null);
      setLoadingQr(true);
      toast.success('🔄 Reiniciando WhatsApp...');
    }
  });

  const logoutMut = useMutation({
    mutationFn: logoutWhatsApp,
    onSuccess: () => {
      setQrImage(null);
      setLoadingQr(true);
      toast.success('Desconectado com sucesso! Aguarde novo QR Code.');
    }
  });

  const reloadQrMut = useMutation({
    mutationFn: () => getQrCode(),
    onSuccess: (d) => {
      setQrImage(d.qr);
      toast.success('✅ QR Code recarregado!');
    },
    onError: () => toast.error('❌ Erro ao recarregar QR')
  });

  const syncMut = useMutation({
    mutationFn: syncGroups,
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      toast.success(d.message);
    }
  });

  const toggleMut = useMutation({
    mutationFn: toggleWhatsAppGroup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
    }
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('to', sendForm.to);
      fd.append('type', sendForm.type);
      fd.append('isGroup', String(sendForm.isGroup));
      if (sendForm.type === 'text') fd.append('body', sendForm.body);
      else if (file) { fd.append('media', file); fd.append('caption', sendForm.body); }
      return sendMessage(fd);
    },
    onSuccess: () => {
      toast.success('✅ Mensagem enviada!');
      setSendForm({ to: '', body: '', type: 'text', isGroup: false });
      setFile(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || '❌ Erro ao enviar'),
  });

  const isConnected = status?.status === 'connected';

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Configuração WhatsApp</h1>

      {/* Status Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${isConnected ? 'bg-green-100' : status?.status === 'qr_ready' ? 'bg-yellow-100' : 'bg-red-100'}`}>
              <Smartphone size={24} className={isConnected ? 'text-green-600' : status?.status === 'qr_ready' ? 'text-yellow-600' : 'text-red-500'} />
            </div>
            <div>
              <p className="font-semibold text-lg">
                {isConnected ? '✅ Conectado' :
                  status?.status === 'qr_ready' ? '⏳ Aguardando Escaneamento' :
                  '❌ Desconectado'}
              </p>
              {isConnected && <p className="text-sm text-gray-500">📱 Número: +{status?.phone}</p>}
              {status?.status === 'qr_ready' && <p className="text-sm text-yellow-600">⏱️ QR válido por 30 segundos</p>}
            </div>
          </div>
          <div className="flex gap-2">
            {!isConnected && (
              <button
                onClick={() => reloadQrMut.mutate()}
                className="btn-secondary flex items-center gap-2 py-2 px-3"
                disabled={reloadQrMut.isPending || loadingQr}
                title="Recarregar QR Code se expirou"
              >
                <RefreshCcw size={14} className={reloadQrMut.isPending ? 'animate-spin' : ''} />
                <span className="text-sm">QR</span>
              </button>
            )}
            <button
              onClick={() => restartMut.mutate()}
              className="btn-secondary flex items-center gap-2 py-2 px-3"
              disabled={restartMut.isPending}
              title="Reiniciar conexão WhatsApp"
            >
              <RefreshCw size={14} className={restartMut.isPending ? 'animate-spin' : ''} />
              <span className="text-sm">Reiniciar</span>
            </button>
            {isConnected && (
              <button
                onClick={() => logoutMut.mutate()}
                className="btn-secondary flex items-center gap-2 py-2 px-3 text-red-600 hover:bg-red-50 border-red-200"
                disabled={logoutMut.isPending}
                title="Sair desta conta do WhatsApp"
              >
                <LogOut size={14} className={logoutMut.isPending ? 'animate-spin' : ''} />
                <span className="text-sm">Sair</span>
              </button>
            )}
          </div>
        </div>

        {/* QR Code */}
        {!isConnected && (
          <div className="mt-6 text-center">
            {loadingQr || statusLoading ? (
              <div className="py-8">
                <div className="inline-block">
                  <RefreshCcw size={32} className="text-whatsapp animate-spin mb-3" />
                </div>
                <p className="text-gray-600 text-sm">⏳ Gerando QR Code... (pode levar 10-20 segundos)</p>
              </div>
            ) : qrImage ? (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  📱 <strong>Abra o WhatsApp no celular → Mais → Dispositivos conectados → Conectar dispositivo</strong>
                </p>
                <div className="flex justify-center mb-3">
                  <img 
                    src={qrImage} 
                    alt="QR Code WhatsApp" 
                    className="w-56 h-56 border-4 border-whatsapp rounded-xl shadow-lg"
                  />
                </div>
                <p className="text-xs text-gray-500">⏱️ QR válido por 30 segundos</p>
              </div>
            ) : (
              <div className="py-8 bg-gray-50 rounded-lg">
                <Smartphone size={32} className="text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">🔄 Aguardando QR Code...</p>
                <p className="text-xs text-gray-400 mt-2">Clique em "Reiniciar" se não aparecer</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grupos */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2"><Users size={18} /> Grupos ({groups?.length || 0})</h2>
          <button onClick={() => syncMut.mutate()} className="btn-secondary text-sm" disabled={syncMut.isPending || !isConnected}>
            <RefreshCw size={14} className={`inline mr-1 ${syncMut.isPending ? 'animate-spin' : ''}`} /> Sincronizar Grupos
          </button>
        </div>
        {groups && groups.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {groups.map((g: any) => (
              <div key={g.id} className={`p-3 border border-gray-100 rounded-lg flex items-center justify-between transition-colors ${!g.active ? 'bg-gray-50 opacity-60 grayscale' : ''}`}>
                <div>
                  <p className="font-medium text-sm flex items-center gap-2">
                    {g.name}
                    {!g.active && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded">Inativo</span>}
                  </p>
                  <p className="text-xs text-gray-400">{g.members} membros · ID: {g.groupId.split('@')[0]}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-2" title={g.active ? "Desativar grupo (não aparecerá para envios)" : "Ativar grupo"} onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="sr-only peer" checked={g.active} onChange={() => toggleMut.mutate(g.id)} disabled={toggleMut.isPending} />
                  <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[100%] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-whatsapp"></div>
                </label>
              </div>
            ))}
          </div>
        ) : <p className="text-gray-400 text-sm">Nenhum grupo. Clique em "Sincronizar Grupos".</p>}
      </div>

      {/* Envio rápido */}
      {isConnected && (
        <div className="card">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><Send size={18} /> Envio Rápido</h2>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="label">Destino (número ou ID do grupo)</label>
                <input className="input" placeholder="5511999999999" value={sendForm.to}
                  onChange={(e) => setSendForm({ ...sendForm, to: e.target.value })} />
              </div>
              <div>
                <label className="label">Tipo</label>
                <select className="input w-28" value={sendForm.type} onChange={(e) => setSendForm({ ...sendForm, type: e.target.value })}>
                  <option value="text">Texto</option>
                  <option value="image">Imagem</option>
                  <option value="audio">Áudio</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>
              <div className="flex items-end pb-0.5">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={sendForm.isGroup} onChange={(e) => setSendForm({ ...sendForm, isGroup: e.target.checked })} />
                  Grupo
                </label>
              </div>
            </div>

            {sendForm.type === 'text' ? (
              <div>
                <label className="label">Mensagem</label>
                <textarea className="input h-24 resize-none" placeholder="Digite sua mensagem..." value={sendForm.body}
                  onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })} />
              </div>
            ) : (
              <div>
                <label className="label">Arquivo ({sendForm.type})</label>
                <input type="file" className="input" accept={sendForm.type === 'audio' ? 'audio/*' : sendForm.type === 'video' ? 'video/*' : 'image/*'}
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <textarea className="input mt-2 resize-none" rows={3} placeholder="Legenda (opcional) - Pode pular linhas normalmente" value={sendForm.body}
                  onChange={(e) => setSendForm({ ...sendForm, body: e.target.value })} />
              </div>
            )}

            <button onClick={() => sendMut.mutate()} className="btn-primary" disabled={sendMut.isPending}>
              {sendMut.isPending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

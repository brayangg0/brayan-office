import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../services/api';

interface SequenceMessage {
  id?: string;
  order: number;
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
  body?: string;
  mediaPath?: string;
  caption?: string;
  delayBefore: number;
  messageDelay?: number; // Atraso até a próxima mensagem (3000ms padrão)
  repeatDays?: string[]; // Array de dias: ["seg", "ter", "qua", "qui", "sex", "sab", "dom"]
  repeatTimes?: string[]; // Array de horários: ["09:00", "14:00", "18:30"]
}

interface MessageSequence {
  id: string;
  name: string;
  description?: string;
  targetType: string;
  targetId?: string;
  targetTags: string;
  scheduledAt: string;
  status: string;
  totalSent: number;
  totalFailed: number;
  messages: SequenceMessage[];
}

export const Sequences: React.FC = () => {
  const queryClient = useQueryClient();

  // Estados
  const [showForm, setShowForm] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<MessageSequence | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    targetType: 'contact',
    targetId: '',
    targetTags: [] as string[],
    scheduledAt: '',
    scheduledTime: '',
  });
  const [messages, setMessages] = useState<SequenceMessage[]>([
    { order: 0, type: 'text', body: '', delayBefore: 2000, messageDelay: 3000, repeatDays: [], repeatTimes: [] },
  ]);
  const [messageFiles, setMessageFiles] = useState<Map<number, File>>(new Map());
  const [timeInputs, setTimeInputs] = useState<Map<number, string>>(new Map());

  // Queries
  const { data: sequences = [] } = useQuery({
    queryKey: ['sequences'],
    queryFn: async () => {
      const res = await api.get('/sequences');
      return res.data.sequences;
    },
    refetchInterval: 5000,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts'],
    queryFn: async () => {
      const res = await api.get('/contacts?limit=1000');
      return res.data.contacts;
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const res = await api.get('/whatsapp/groups');
      return res.data;
    },
  });

  // Mutations
  const createSequence = useMutation({
    mutationFn: async () => {
      // Validações
      if (!formData.name.trim()) {
        throw new Error('Nome da sequência é obrigatório');
      }
      if (!formData.scheduledAt || !formData.scheduledTime) {
        throw new Error('Data e hora são obrigatórias');
      }
      if (!formData.targetId && formData.targetType !== 'all_students' && formData.targetType !== 'all' && formData.targetTags.length === 0) {
        throw new Error(`Selecione um ${formData.targetType === 'contact' ? 'contato' : formData.targetType === 'group' ? 'grupo' : 'destino'}`);
      }
      if (messages.length === 0) {
        throw new Error('Adicione pelo menos uma mensagem');
      }

      // Processar e validar horários
      const processedMessages = messages.map((msg) => ({
        ...msg,
        repeatTimes: (timeInputs.get(msg.order) || '')
          .split(',')
          .map(t => t.trim())
          .filter(t => t.length > 0 && t.match(/^\d{1,2}:\d{2}$/)),
      }));

      const datetime = `${formData.scheduledAt}T${formData.scheduledTime}`;
      
      // Verificar se há arquivos a enviar
      const hasFiles = messageFiles.size > 0;
      
      if (hasFiles) {
        // Enviar como FormData (com arquivos)
        const formDataToSend = new FormData();
        formDataToSend.append('name', formData.name);
        formDataToSend.append('description', formData.description || '');
        formDataToSend.append('targetType', formData.targetType);
        formDataToSend.append('targetId', formData.targetId || '');
        formDataToSend.append('targetTags', JSON.stringify(formData.targetTags || []));
        formDataToSend.append('scheduledAt', new Date(datetime).toISOString());
        
        // Preparar dados das mensagens
        const messageData = processedMessages.map((msg, idx) => ({
          order: msg.order,
          type: msg.type,
          body: msg.body || null,
          caption: msg.caption || null,
          delayBefore: msg.delayBefore || 2000,
          messageDelay: msg.messageDelay || 3000,
          repeatDays: msg.repeatDays || [],
          repeatTimes: msg.repeatTimes || [],
        }));
        formDataToSend.append('messages', JSON.stringify(messageData));
        
        // Anexar arquivos
        for (const [idx, file] of messageFiles.entries()) {
          formDataToSend.append(`file_${idx}`, file);
        }
        
        return api.post('/sequences', formDataToSend);
      } else {
        // Enviar como JSON (sem arquivos)
        const payload = {
          name: formData.name,
          description: formData.description || '',
          targetType: formData.targetType,
          targetId: formData.targetId || '',
          targetTags: formData.targetTags || [],
          scheduledAt: new Date(datetime).toISOString(),
          messages: processedMessages.map((msg) => ({
            order: msg.order,
            type: msg.type,
            body: msg.body || null,
            caption: msg.caption || null,
            delayBefore: msg.delayBefore || 2000,
            messageDelay: msg.messageDelay || 3000,
            repeatDays: msg.repeatDays || [],
            repeatTimes: msg.repeatTimes || [],
          })),
        };
        
        return api.post('/sequences', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
      toast.success('Sequência criada com sucesso!');
      resetForm();
    },
    onError: (error: any) => {
      console.error('Erro:', error);
      toast.error(error.response?.data?.error || error.message || 'Erro ao criar sequência');
    },
  });

  const deleteSequence = useMutation({
    mutationFn: (id: string) => api.delete(`/sequences/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
      toast.success('Sequência deletada');
    },
  });

  const sendNow = useMutation({
    mutationFn: (id: string) => api.post(`/sequences/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sequences'] });
      toast.success('Sequência enviada!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erro ao enviar');
    },
  });

  // Funções auxiliares
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      targetType: 'contact',
      targetId: '',
      targetTags: [],
      scheduledAt: '',
      scheduledTime: '',
    });
    setMessages([{ order: 0, type: 'text', body: '', delayBefore: 2000, messageDelay: 3000, repeatDays: [], repeatTimes: [] }]);
    setMessageFiles(new Map());
    setTimeInputs(new Map());
    setShowForm(false);
  };

  const addMessage = () => {
    setMessages([...messages, { order: messages.length, type: 'text', body: '', delayBefore: 2000, messageDelay: 3000, repeatDays: [], repeatTimes: [] }]);
  };

  const removeMessage = (index: number) => {
    setMessages(messages.filter((_, i) => i !== index));
  };

  const updateMessage = (index: number, field: string, value: any) => {
    const updated = [...messages];
    updated[index] = { ...updated[index], [field]: value };
    setMessages(updated);
  };

  const handleFileChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const newMap = new Map(messageFiles);
      newMap.set(index, e.target.files[0]);
      setMessageFiles(newMap);
      updateMessage(index, 'mediaPath', e.target.files[0].name);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-gray-800">📨 Sequências de Mensagens</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
        >
          {showForm ? 'Cancelar' : '+ Criar Sequência'}
        </button>
      </div>

      {/* Formulário de Criação */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-md mb-8 border-l-4 border-blue-500">
          <h2 className="text-2xl font-bold mb-6">Criar Nova Sequência</h2>

          {/* Dados Básicos */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <input
              type="text"
              placeholder="Nome da sequência"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="col-span-2 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Descrição (opcional)"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="col-span-2 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Data e Hora */}
            <input
              type="date"
              value={formData.scheduledAt}
              onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              className="p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="time"
              value={formData.scheduledTime}
              onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
              className="p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Tipo de Alvo */}
            <select
              value={formData.targetType}
              onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
              className="p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="contact">Contato Específico</option>
              <option value="group">Grupo Específico</option>
              <option value="all">Todos</option>
              <option value="tagged">Com Tag</option>
              <option value="all_students">Todos os Alunos</option>
            </select>

            {/* Seleção de Alvo */}
            {formData.targetType === 'contact' && (
              <select
                value={formData.targetId}
                onChange={(e) => setFormData({ ...formData, targetId: e.target.value })}
                className="p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione um contato</option>
                {contacts.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            )}

            {formData.targetType === 'group' && (
              <select
                value={formData.targetId}
                onChange={(e) => setFormData({ ...formData, targetId: e.target.value })}
                className="p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecione um grupo</option>
                {groups.map((g: any) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Mensagens */}
          <div className="mb-6">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
              📝 Mensagens ({messages.length})
            </h3>

            {messages.map((msg, idx) => (
              <div key={idx} className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-gray-700">Mensagem {idx + 1}</span>
                  {messages.length > 1 && (
                    <button
                      onClick={() => removeMessage(idx)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      ❌ Remover
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <select
                    value={msg.type}
                    onChange={(e) => updateMessage(idx, 'type', e.target.value)}
                    className="p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="text">📄 Texto</option>
                    <option value="image">🖼️ Imagem</option>
                    <option value="audio">🎵 Áudio</option>
                    <option value="video">🎬 Vídeo</option>
                    <option value="document">📎 Documento</option>
                  </select>

                  <input
                    type="number"
                    placeholder="Delay antes (ms)"
                    value={msg.delayBefore}
                    onChange={(e) => updateMessage(idx, 'delayBefore', parseInt(e.target.value))}
                    className="p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  <input
                    type="number"
                    placeholder="Delay próxima mensagem (ms, padrão 3000)"
                    value={msg.messageDelay || 3000}
                    onChange={(e) => updateMessage(idx, 'messageDelay', parseInt(e.target.value))}
                    className="col-span-2 p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Opções de Repetição */}
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-900 mb-3">🔄 Repetição (Opcional)</h4>
                  
                  {/* Seleção de Dias */}
                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">📅 Dias da Semana</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'].map((day) => (
                        <label key={day} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(msg.repeatDays || []).includes(day)}
                            onChange={(e) => {
                              const days = msg.repeatDays || [];
                              if (e.target.checked) {
                                updateMessage(idx, 'repeatDays', [...days, day]);
                              } else {
                                updateMessage(idx, 'repeatDays', days.filter(d => d !== day));
                              }
                            }}
                            className="w-4 h-4 rounded cursor-pointer"
                          />
                          <span className="text-xs text-gray-700">{day}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Input para Horários */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">⏰ Horários (ex: 09:00, 14:30)</label>
                    <input
                      type="text"
                      placeholder="Separe por vírgula: 09:00, 14:00, 18:30"
                      value={timeInputs.get(idx) || ''}
                      onChange={(e) => {
                        const newMap = new Map(timeInputs);
                        newMap.set(idx, e.target.value);
                        setTimeInputs(newMap);
                      }}
                      className="w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {(timeInputs.get(idx) || '').length > 0 && (
                      <div className="text-xs text-blue-600 mt-1">
                        💡 Formato: HH:MM (ex: 09:00, 14:30, 18:45)
                      </div>
                    )}
                  </div>
                </div>

                {msg.type === 'text' && (
                  <textarea
                    placeholder="Texto da mensagem"
                    value={msg.body || ''}
                    onChange={(e) => updateMessage(idx, 'body', e.target.value)}
                    className="w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                )}

                {msg.type !== 'text' && (
                  <>
                    <input
                      type="file"
                      onChange={(e) => handleFileChange(idx, e)}
                      accept={msg.type === 'image' ? 'image/*' : msg.type === 'audio' ? 'audio/*' : msg.type === 'video' ? 'video/*' : '*/*'}
                      className="w-full p-2 border rounded text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {msg.mediaPath && (
                      <p className="text-xs text-green-600 mb-2">✅ Arquivo: {msg.mediaPath}</p>
                    )}
                    <input
                      type="text"
                      placeholder="Legenda (opcional)"
                      value={msg.caption || ''}
                      onChange={(e) => updateMessage(idx, 'caption', e.target.value)}
                      className="w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </>
                )}
              </div>
            ))}

            <button
              onClick={addMessage}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm"
            >
              + Adicionar Mensagem
            </button>
          </div>

          {/* Botões */}
          <div className="flex gap-3">
            <button
              onClick={() => createSequence.mutate()}
              disabled={createSequence.isPending}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold disabled:bg-gray-400"
            >
              {createSequence.isPending ? '⏳ Criando...' : '✅ Criar Sequência'}
            </button>
            <button
              onClick={resetForm}
              className="flex-1 bg-gray-400 text-white py-3 rounded-lg hover:bg-gray-500 transition font-semibold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de Sequências */}
      <div className="space-y-4">
        {sequences.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500 text-lg">Nenhuma sequência criada ainda</p>
          </div>
        ) : (
          sequences.map((seq: MessageSequence) => (
            <div key={seq.id} className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg transition">
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-gray-500 text-sm">Nome</p>
                  <p className="font-bold text-lg">{seq.name}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Status</p>
                  <p className="text-sm">
                    {seq.status === 'pending' && '⏳ Agendada'}
                    {seq.status === 'running' && '🚀 Em progresso'}
                    {seq.status === 'completed' && '✅ Concluída'}
                    {seq.status === 'cancelled' && '❌ Cancelada'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Mensagens</p>
                  <p className="font-bold">{seq.messages.length}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-sm">Agendada para</p>
                  <p className="text-sm font-mono">{new Date(seq.scheduledAt).toLocaleString('pt-BR')}</p>
                </div>
              </div>

              {seq.description && <p className="text-gray-600 text-sm mb-3">{seq.description}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedSequence(seq)}
                  className="flex-1 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition text-sm"
                >
                  👁️ Ver Detalhes
                </button>
                <button
                  onClick={() => sendNow.mutate(seq.id)}
                  disabled={sendNow.isPending}
                  className="flex-1 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition text-sm disabled:bg-gray-400"
                >
                  {sendNow.isPending ? '⏳' : '🚀'} Enviar Agora
                </button>
                <button
                  onClick={() => {
                    if (confirm('Tem certeza?')) deleteSequence.mutate(seq.id);
                  }}
                  className="flex-1 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition text-sm"
                >
                  🗑️ Deletar
                </button>
              </div>

              {seq.status === 'completed' && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    ✅ <strong>{seq.totalSent}</strong> enviadas | ❌ <strong>{seq.totalFailed}</strong> falhadas
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal de Detalhes */}
      {selectedSequence && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setSelectedSequence(null)}
        >
          <div
            className="bg-white rounded-lg p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">{selectedSequence.name}</h2>
              <button
                onClick={() => setSelectedSequence(null)}
                className="text-gray-500 hover:text-black text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {selectedSequence.messages.map((msg, idx) => (
                <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <p className="font-semibold mb-2">
                    Mensagem {idx + 1} - {msg.type === 'text' ? '📄' : '📎'} {msg.type}
                  </p>
                  {msg.body && <p className="text-gray-700 whitespace-pre-wrap">{msg.body}</p>}
                  {msg.caption && <p className="text-gray-600 text-sm italic">Legenda: {msg.caption}</p>}
                  <p className="text-gray-500 text-sm mt-2">⏱️ Delay: {msg.delayBefore}ms</p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setSelectedSequence(null)}
              className="w-full bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Sequences;

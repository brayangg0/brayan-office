import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Bot, Settings, List, MessageSquare, Clock, Plus, Trash2,
  Edit2, Save, X, Check, RefreshCw,
  ToggleLeft, ToggleRight, Send, AlertCircle,
} from 'lucide-react';
import {
  getOpenAIAutoResponseConfig,
  updateOpenAIAutoResponseConfig,
  getOpenAIAutoResponseRules,
  createOpenAIAutoResponseRule,
  updateOpenAIAutoResponseRule,
  deleteOpenAIAutoResponseRule,
  getOpenAIAutoResponseConversations,
  getOpenAIAutoResponseConversation,
  getOpenAIAutoResponsePendingApprovals,
  approveOpenAIAutoResponseMessage,
  rejectOpenAIAutoResponseMessage,
  testOpenAIAutoResponse,
} from '../services/api';

type Tab = 'config' | 'rules' | 'conversations' | 'approvals';

export default function AutoResponse() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('config');

  // ─── Config state ─────────────────────────────────────────────────────────
  const [configDraft, setConfigDraft] = useState<{
    enabled: boolean;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  } | null>(null);

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['openai-ar-config'],
    queryFn: getOpenAIAutoResponseConfig,
  });

  // Sync draft when config loads for the first time
  useEffect(() => {
    if (config && !configDraft) {
      setConfigDraft({
        enabled: (config as any).enabled,
        systemPrompt: (config as any).systemPrompt,
        temperature: (config as any).temperature,
        maxTokens: (config as any).maxTokens,
      });
    }
  }, [config]);

  const cfg = config as any;
  const draft = configDraft ?? (cfg
    ? { enabled: cfg.enabled, systemPrompt: cfg.systemPrompt, temperature: cfg.temperature, maxTokens: cfg.maxTokens }
    : { enabled: false, systemPrompt: '', temperature: 0.7, maxTokens: 150 });

  const updateConfigMut = useMutation({
    mutationFn: updateOpenAIAutoResponseConfig,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openai-ar-config'] });
      toast.success('Configuração salva!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao salvar'),
  });

  // ─── Rules state ──────────────────────────────────────────────────────────
  const [newRule, setNewRule] = useState({ keyword: '', response: '', priority: 0 });
  const [editRuleId, setEditRuleId] = useState<string | null>(null);
  const [editRuleDraft, setEditRuleDraft] = useState<any>(null);

  const { data: rules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['openai-ar-rules'],
    queryFn: getOpenAIAutoResponseRules,
  });

  const createRuleMut = useMutation({
    mutationFn: createOpenAIAutoResponseRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openai-ar-rules'] });
      setNewRule({ keyword: '', response: '', priority: 0 });
      toast.success('Regra criada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao criar regra'),
  });

  const updateRuleMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateOpenAIAutoResponseRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openai-ar-rules'] });
      setEditRuleId(null);
      setEditRuleDraft(null);
      toast.success('Regra atualizada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao atualizar'),
  });

  const deleteRuleMut = useMutation({
    mutationFn: deleteOpenAIAutoResponseRule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openai-ar-rules'] });
      toast.success('Regra removida!');
    },
  });

  const toggleRuleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateOpenAIAutoResponseRule(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['openai-ar-rules'] }),
  });

  // ─── Conversations state ──────────────────────────────────────────────────
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const { data: conversations = [], isLoading: convsLoading } = useQuery({
    queryKey: ['openai-ar-conversations'],
    queryFn: getOpenAIAutoResponseConversations,
    enabled: activeTab === 'conversations',
  });

  const { data: conversationDetail } = useQuery({
    queryKey: ['openai-ar-conversation', selectedChatId],
    queryFn: () => getOpenAIAutoResponseConversation(selectedChatId!),
    enabled: !!selectedChatId,
  });

  // ─── Approvals state ──────────────────────────────────────────────────────
  const { data: pendingApprovals = [], isLoading: approvalsLoading } = useQuery({
    queryKey: ['openai-ar-pending'],
    queryFn: getOpenAIAutoResponsePendingApprovals,
    enabled: activeTab === 'approvals',
    refetchInterval: activeTab === 'approvals' ? 10000 : false,
  });

  const approveMut = useMutation({
    mutationFn: approveOpenAIAutoResponseMessage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openai-ar-pending'] });
      toast.success('Mensagem aprovada!');
    },
  });

  const rejectMut = useMutation({
    mutationFn: rejectOpenAIAutoResponseMessage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['openai-ar-pending'] });
      toast.success('Mensagem rejeitada.');
    },
  });

  // ─── Test state ───────────────────────────────────────────────────────────
  const [testMsg, setTestMsg] = useState('');
  const [testChatId, setTestChatId] = useState('test-chat-001');
  const [testResult, setTestResult] = useState<{ response: string | null; type: string } | null>(null);

  const testMut = useMutation({
    mutationFn: testOpenAIAutoResponse,
    onSuccess: (data: any) => {
      setTestResult(data);
      toast.success(data.type === 'rule' ? 'Resposta gerada via regra!' : 'Sem regra: atendimento manual.');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro no teste'),
  });

  // ─── Render ───────────────────────────────────────────────────────────────

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'config', label: 'Configuração', icon: <Settings size={16} /> },
    { id: 'rules', label: 'Regras', icon: <List size={16} /> },
    { id: 'conversations', label: 'Conversas', icon: <MessageSquare size={16} /> },
    { id: 'approvals', label: 'Aprovações', icon: <Clock size={16} /> },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bot size={28} className="text-purple-600" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Resposta Automática com IA</h1>
          <p className="text-sm text-gray-500">
            Responde automaticamente mensagens do WhatsApp usando OpenAI
          </p>
        </div>
      </div>

      {/* Status badge */}
      {cfg && (
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
            cfg.enabled && cfg.apiKeyConfigured
              ? 'bg-green-100 text-green-700'
              : cfg.enabled
              ? 'bg-yellow-100 text-yellow-700'
              : 'bg-gray-100 text-gray-500'
          }`}
        >
          {cfg.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {cfg.enabled && cfg.apiKeyConfigured
            ? `Sistema ativo - ${cfg.model}`
            : cfg.enabled
            ? 'Sistema ativo - falta configurar OPENAI_API_KEY'
            : 'Sistema inativo'}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 font-medium border-b-2 transition text-sm whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'approvals' && (pendingApprovals as any[]).length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {(pendingApprovals as any[]).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── CONFIG TAB ─── */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          {configLoading ? (
            <div className="text-center py-8 text-gray-400">Carregando...</div>
          ) : (
            <>
              {/* Enable toggle */}
              <div className="card !p-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Ativar sistema de resposta automática</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Quando ativo, o sistema responde automaticamente todas as mensagens recebidas
                  </p>
                </div>
                <button
                  onClick={() =>
                    setConfigDraft((d) => ({ ...d!, enabled: !d!.enabled }))
                  }
                  className={`relative w-14 h-7 rounded-full transition-colors duration-200 ${
                    draft.enabled ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      draft.enabled ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* System prompt */}
              <div className="card !p-5 space-y-3">
                <h3 className="font-semibold">Prompt do sistema (personalidade da IA)</h3>
                <p className="text-sm text-gray-500">
                  Instrua a IA sobre como ela deve se comportar, o tom das respostas e o contexto do negócio.
                </p>
                <textarea
                  className="input font-mono text-sm"
                  rows={6}
                  value={draft.systemPrompt}
                  onChange={(e) =>
                    setConfigDraft((d) => ({ ...d!, systemPrompt: e.target.value }))
                  }
                  placeholder="Ex: Você é um assistente de atendimento da empresa XYZ. Responda de forma educada e concisa em português..."
                />
              </div>

              {/* Temperature & max tokens */}
              <div className="card !p-5 space-y-4">
                <h3 className="font-semibold">Parâmetros do modelo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">
                      Temperatura: <strong>{draft.temperature.toFixed(1)}</strong>
                    </label>
                    <p className="text-xs text-gray-400 mb-2">
                      0 = respostas mais previsíveis · 1 = mais criativas
                    </p>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={draft.temperature}
                      onChange={(e) =>
                        setConfigDraft((d) => ({
                          ...d!,
                          temperature: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-purple-600"
                    />
                  </div>
                  <div>
                    <label className="label">Máximo de tokens: <strong>{draft.maxTokens}</strong></label>
                    <p className="text-xs text-gray-400 mb-2">
                      Controla o tamanho máximo da resposta (~0.75 palavras por token)
                    </p>
                    <input
                      type="range"
                      min={50}
                      max={500}
                      step={10}
                      value={draft.maxTokens}
                      onChange={(e) =>
                        setConfigDraft((d) => ({
                          ...d!,
                          maxTokens: parseInt(e.target.value),
                        }))
                      }
                      className="w-full accent-purple-600"
                    />
                  </div>
                </div>
              </div>

              {/* Save */}
              <button
                onClick={() => updateConfigMut.mutate(draft)}
                disabled={updateConfigMut.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={16} />
                {updateConfigMut.isPending ? 'Salvando...' : 'Salvar configuração'}
              </button>

              {/* Test panel */}
              <div className="card !p-5 space-y-3 border-dashed border-purple-200 bg-purple-50/30">
                <h3 className="font-semibold flex items-center gap-2">
                  <Send size={16} className="text-purple-600" />
                  Testar resposta
                </h3>
                <p className="text-sm text-gray-500">
                  Simule uma mensagem recebida para ver como a IA responderia.
                </p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Digite uma mensagem de teste..."
                    value={testMsg}
                    onChange={(e) => setTestMsg(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && testMsg.trim()) {
                        testMut.mutate({ message: testMsg, chatId: testChatId });
                      }
                    }}
                  />
                  <input
                    className="input w-40"
                    placeholder="Chat ID"
                    value={testChatId}
                    onChange={(e) => setTestChatId(e.target.value)}
                  />
                  <button
                    onClick={() => testMut.mutate({ message: testMsg, chatId: testChatId })}
                    disabled={testMut.isPending || !testMsg.trim()}
                    className="btn-primary px-4"
                  >
                    {testMut.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
                {testResult && (
                  <div className="bg-white border rounded-lg p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          testResult.type === 'rule'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}
                      >
                        {testResult.type === 'rule' ? '📋 Regra' : '🤖 OpenAI'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {testResult.response || 'Nenhuma regra combinou. A conversa fica registrada para você responder manualmente.'}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── RULES TAB ─── */}
      {activeTab === 'rules' && (
        <div className="space-y-5">
          <div className="card !p-5 space-y-4">
            <h3 className="font-semibold">
              {editRuleId ? 'Editar regra' : 'Nova regra de palavra-chave'}
            </h3>
            <p className="text-sm text-gray-500">
              Quando a mensagem contiver a palavra-chave, a resposta definida é enviada diretamente — sem chamar a IA.
            </p>

            {editRuleId && editRuleDraft ? (
              <div className="space-y-3">
                <input
                  className="input"
                  placeholder="Palavra-chave (ex: preço, horário, suporte)"
                  value={editRuleDraft.keyword}
                  onChange={(e) => setEditRuleDraft({ ...editRuleDraft, keyword: e.target.value })}
                />
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Resposta automática"
                  value={editRuleDraft.response}
                  onChange={(e) => setEditRuleDraft({ ...editRuleDraft, response: e.target.value })}
                />
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">Prioridade:</label>
                  <input
                    type="number"
                    className="input w-24"
                    value={editRuleDraft.priority}
                    onChange={(e) =>
                      setEditRuleDraft({ ...editRuleDraft, priority: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      updateRuleMut.mutate({ id: editRuleId, data: editRuleDraft })
                    }
                    disabled={updateRuleMut.isPending}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Save size={15} /> Salvar
                  </button>
                  <button
                    onClick={() => { setEditRuleId(null); setEditRuleDraft(null); }}
                    className="btn-secondary flex items-center gap-2"
                  >
                    <X size={15} /> Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <input
                  className="input"
                  placeholder="Palavra-chave (ex: preço, horário, suporte)"
                  value={newRule.keyword}
                  onChange={(e) => setNewRule({ ...newRule, keyword: e.target.value })}
                />
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Resposta automática"
                  value={newRule.response}
                  onChange={(e) => setNewRule({ ...newRule, response: e.target.value })}
                />
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">Prioridade:</label>
                  <input
                    type="number"
                    className="input w-24"
                    value={newRule.priority}
                    onChange={(e) =>
                      setNewRule({ ...newRule, priority: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <button
                  onClick={() => createRuleMut.mutate(newRule)}
                  disabled={createRuleMut.isPending || !newRule.keyword || !newRule.response}
                  className="btn-primary flex items-center gap-2"
                >
                  <Plus size={15} />
                  {createRuleMut.isPending ? 'Criando...' : 'Criar regra'}
                </button>
              </div>
            )}
          </div>

          {/* Rules list */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-700">
              Regras cadastradas ({(rules as any[]).length})
            </h3>
            {rulesLoading ? (
              <div className="text-center py-6 text-gray-400">Carregando...</div>
            ) : (rules as any[]).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <List size={32} className="mx-auto mb-2 opacity-40" />
                <p>Nenhuma regra cadastrada ainda.</p>
              </div>
            ) : (
              (rules as any[]).map((rule: any) => (
                <div
                  key={rule.id}
                  className={`card !p-4 flex items-start gap-3 ${
                    !rule.enabled ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                        {rule.keyword}
                      </span>
                      <span className="text-xs text-gray-400">
                        prioridade: {rule.priority}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          rule.enabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {rule.enabled ? 'ativa' : 'inativa'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">{rule.response}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() =>
                        toggleRuleMut.mutate({ id: rule.id, enabled: !rule.enabled })
                      }
                      className="p-2 rounded hover:bg-gray-100 text-gray-500"
                      title={rule.enabled ? 'Desativar' : 'Ativar'}
                    >
                      {rule.enabled ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} />}
                    </button>
                    <button
                      onClick={() => {
                        setEditRuleId(rule.id);
                        setEditRuleDraft({
                          keyword: rule.keyword,
                          response: rule.response,
                          priority: rule.priority,
                        });
                      }}
                      className="p-2 rounded hover:bg-blue-50 text-blue-500"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => deleteRuleMut.mutate(rule.id)}
                      className="p-2 rounded hover:bg-red-50 text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── CONVERSATIONS TAB ─── */}
      {activeTab === 'conversations' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Conversation list */}
          <div className="md:col-span-1 space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-700">Conversas</h3>
              <button
                onClick={() => qc.invalidateQueries({ queryKey: ['openai-ar-conversations'] })}
                className="text-gray-400 hover:text-gray-600"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            {convsLoading ? (
              <div className="text-center py-6 text-gray-400">Carregando...</div>
            ) : (conversations as any[]).length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Nenhuma conversa ainda.</p>
              </div>
            ) : (
              (conversations as any[]).map((conv: any) => (
                <button
                  key={conv.id}
                  onClick={() => setSelectedChatId(conv.chatId)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    selectedChatId === conv.chatId
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-sm truncate">{conv.contactName}</p>
                  <p className="text-xs text-gray-400 truncate">{conv.chatId}</p>
                  {conv.messages?.[0] && (
                    <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                      {conv.messages[0].content}
                    </p>
                  )}
                  <p className="text-xs text-gray-300 mt-1">
                    {new Date(conv.updatedAt).toLocaleString('pt-BR')}
                  </p>
                </button>
              ))
            )}
          </div>

          {/* Conversation detail */}
          <div className="md:col-span-2">
            {!selectedChatId ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <MessageSquare size={40} className="mb-3 opacity-30" />
                <p>Selecione uma conversa para ver o histórico</p>
              </div>
            ) : !conversationDetail ? (
              <div className="text-center py-8 text-gray-400">Carregando...</div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">
                      {conversationDetail.conversation.contactName}
                    </h3>
                    <p className="text-xs text-gray-400">
                      {conversationDetail.conversation.chatId}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
                    {conversationDetail.history.length} mensagens
                  </span>
                </div>

                <div className="bg-[#e5ddd5] rounded-xl p-4 space-y-2 max-h-[500px] overflow-y-auto">
                  {conversationDetail.history.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-4">
                      Nenhuma mensagem nesta conversa.
                    </p>
                  ) : (
                    conversationDetail.history.map((msg: any) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-3 shadow-sm ${
                            msg.role === 'user'
                              ? 'bg-white rounded-tl-none'
                              : 'bg-[#dcf8c6] rounded-tr-none'
                          }`}
                        >
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {msg.content}
                          </p>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {msg.requiresApproval && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  msg.approved === true
                                    ? 'bg-green-100 text-green-700'
                                    : msg.approved === false
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}
                              >
                                {msg.approved === true
                                  ? '✓ aprovada'
                                  : msg.approved === false
                                  ? '✗ rejeitada'
                                  : '⏳ pendente'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── APPROVALS TAB ─── */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Aprovações pendentes</h3>
              <p className="text-sm text-gray-500">
                Respostas geradas pela IA que aguardam aprovação manual antes de serem enviadas.
              </p>
            </div>
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['openai-ar-pending'] })}
              className="text-gray-400 hover:text-gray-600"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Info banner */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <p>
              Para ativar o fluxo de aprovação, altere o parâmetro{' '}
              <code className="bg-blue-100 px-1 rounded">requiresApproval</code> para{' '}
              <code className="bg-blue-100 px-1 rounded">true</code> na integração do WhatsApp
              (<code className="bg-blue-100 px-1 rounded">whatsapp.service.ts</code>).
            </p>
          </div>

          {approvalsLoading ? (
            <div className="text-center py-8 text-gray-400">Carregando...</div>
          ) : (pendingApprovals as any[]).length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Check size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhuma aprovação pendente</p>
              <p className="text-sm mt-1">Todas as respostas foram processadas.</p>
            </div>
          ) : (
            (pendingApprovals as any[]).map((msg: any) => (
              <div key={msg.id} className="card !p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">
                      {msg.conversation?.contactName || 'Contato desconhecido'}
                    </p>
                    <p className="text-xs text-gray-400">{msg.conversation?.chatId}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(msg.createdAt).toLocaleString('pt-BR')}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 mb-1">Resposta gerada pela IA:</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{msg.content}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => approveMut.mutate(msg.id)}
                    disabled={approveMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
                  >
                    <Check size={15} /> Aprovar e enviar
                  </button>
                  <button
                    onClick={() => rejectMut.mutate(msg.id)}
                    disabled={rejectMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium transition"
                  >
                    <X size={15} /> Rejeitar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAutoResponseStatus,
  getAutoResponseTemplates,
  createAutoResponseTemplate,
  updateAutoResponseTemplate,
  deleteAutoResponseTemplate,
  getAutomationCampaigns,
  createAutomationCampaign,
  sendAutomationCampaignNow,
  deleteAutomationCampaign,
  getContacts,
  getGroups,
  getCourses,
  getAIAutoResponseConfig,
  enableAIAutoResponse,
  setAIAutoResponseOption,
  setContactAutomationBlocked,
  getAutomationBlockedPhones,
  addAutomationBlockedPhone,
  deleteAutomationBlockedPhone,
} from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Send, Clock, MessageSquare, Zap, Edit2, Bot, Save, Eye, UserMinus, UserPlus } from 'lucide-react';
import AutoResponse from './AutoResponse';

function isAutomationBlocked(tags: string): boolean {
  try {
    const parsed = JSON.parse(tags || '[]');
    return Array.isArray(parsed) && parsed.includes('automacao_bloqueada');
  } catch {
    return false;
  }
}

export default function Automation() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'responses' | 'openai' | 'campaigns' | 'messages'>('responses');

  // === AUTORRESPONSE ===
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState<{ name: string, type: string, body: string, variables: any[] }>({ name: '', type: 'text', body: '', variables: [] });

  const { data: arStatus } = useQuery({ queryKey: ['ar-status'], queryFn: getAutoResponseStatus });
  const { data: templates } = useQuery({ queryKey: ['ar-templates'], queryFn: getAutoResponseTemplates });

  const createTemplateMut = useMutation({
    mutationFn: createAutoResponseTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-templates'] });
      setNewTemplate({ name: '', type: 'text', body: '', variables: [] });
      toast.success('Template criado!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao criar'),
  });

  const updateTemplateMut = useMutation({
    mutationFn: (data: any) => updateAutoResponseTemplate(editTemplateId!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-templates'] });
      setNewTemplate({ name: '', type: 'text', body: '', variables: [] });
      setEditTemplateId(null);
      toast.success('Template atualizado!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao atualizar'),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: deleteAutoResponseTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-templates'] });
      toast.success('Template removido!');
    },
  });

  // === AI AUTO-RESPONSE ===
  const DEFAULT_WELCOME = `Olá! 👋 Bem-vindo(a) ao nosso atendimento!\n\nPor favor, selecione uma das opções abaixo:\n\n1️⃣ Dúvidas Do Curso\n2️⃣ Suporte\n3️⃣ Segunda via\n4️⃣ Outros Assuntos\n\nResponda apenas com o número desejado.`;

  const DEFAULT_CLOSING = `😊 Ficamos felizes em ajudar!\nSe precisar de alguma coisa novamente, é só mandar uma mensagem.\nAté mais!`;
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiWelcome, setAiWelcome] = useState(DEFAULT_WELCOME);
  const [aiOptions, setAiOptions] = useState({ 1: '', 2: '', 3: '', 4: '' });
  const [aiQaRules, setAiQaRules] = useState<{ question: string; answer: string }[]>([]);
  const [closingEnabled, setClosingEnabled] = useState(true);
  const [closingMessage, setClosingMessage] = useState(DEFAULT_CLOSING);
  const [showAiPreview, setShowAiPreview] = useState(false);

  const { data: aiConfig } = useQuery({
    queryKey: ['ai-autoresponse-config'],
    queryFn: getAIAutoResponseConfig,
  });

  useEffect(() => {
    if (aiConfig) {
      setAiEnabled(aiConfig.enabled ?? false);
      setAiWelcome(aiConfig.welcomeMessage || DEFAULT_WELCOME);
      setAiOptions({
        1: aiConfig.options?.[1] || '',
        2: aiConfig.options?.[2] || '',
        3: aiConfig.options?.[3] || '',
        4: aiConfig.options?.[4] || '',
      });
      setAiQaRules(Array.isArray(aiConfig.qaRules) ? aiConfig.qaRules : []);
      setClosingEnabled(aiConfig.closingEnabled ?? true);
      setClosingMessage(aiConfig.closingMessage || DEFAULT_CLOSING);
    }
  }, [aiConfig]);

  const saveAIConfigMut = useMutation({
    mutationFn: async () => {
      // Save enable/welcome config
      await enableAIAutoResponse({
        enabled: aiEnabled,
        welcomeMessage: aiWelcome,
        qaRules: aiQaRules,
        closingEnabled,
        closingMessage,
      });
      // Save each option response
      const optionEntries = ([1, 2, 3, 4] as const);
      for (const num of optionEntries) {
        await setAIAutoResponseOption(num, aiOptions[num] || '');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-autoresponse-config'] });
      toast.success('Menu automático salvo com sucesso!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao salvar menu automático'),
  });

  // === CAMPANHAS AGENDADAS ===
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    templateId: '',
    targetType: 'contacts',
    targetTags: [] as string[],
    targetGroups: [] as string[],
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  });
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [automationBlockSearch, setAutomationBlockSearch] = useState('');
  const [blockedPhone, setBlockedPhone] = useState('');
  const [blockedPhoneName, setBlockedPhoneName] = useState('');

  const { data: campaigns } = useQuery({ queryKey: ['automation-campaigns'], queryFn: getAutomationCampaigns });
  const { data: contacts } = useQuery({ queryKey: ['contacts', { limit: 1000 }], queryFn: () => getContacts({ limit: 1000 }) });
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: getGroups });
  const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: getCourses });
  const { data: blockedPhones = [] } = useQuery({
    queryKey: ['automation-blocked-phones'],
    queryFn: getAutomationBlockedPhones,
  });

  const addBlockedPhoneMut = useMutation({
    mutationFn: () => addAutomationBlockedPhone({ phone: blockedPhone, name: blockedPhoneName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-blocked-phones'] });
      setBlockedPhone('');
      setBlockedPhoneName('');
      toast.success('Número bloqueado para mensagens automáticas');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error || 'Informe um número válido com DDD'),
  });

  const deleteBlockedPhoneMut = useMutation({
    mutationFn: deleteAutomationBlockedPhone,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-blocked-phones'] });
      toast.success('Número removido da lista de bloqueio');
    },
    onError: () => toast.error('Erro ao remover o número'),
  });

  const automationBlockMut = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) =>
      setContactAutomationBlocked(id, blocked),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      toast.success(
        variables.blocked
          ? 'Contato adicionado à lista de bloqueio'
          : 'Contato removido da lista de bloqueio'
      );
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error || 'Erro ao alterar o bloqueio do contato'),
  });

  const createCampaignMut = useMutation({
    mutationFn: async () => {
      if (!newCampaign.name) throw new Error('Nome é obrigatório');
      if (!newCampaign.templateId) throw new Error('Template é obrigatório');
      if (newCampaign.targetType === 'contacts' && selectedContacts.length === 0) {
        throw new Error('Selecione pelo menos um contato');
      }
      if (newCampaign.targetType === 'groups' && selectedGroups.length === 0) {
        throw new Error('Selecione pelo menos um grupo');
      }
      return createAutomationCampaign({
        ...newCampaign,
        targetContacts: newCampaign.targetType === 'contacts' ? selectedContacts : [],
        targetGroups: newCampaign.targetType === 'groups' ? selectedGroups : [],
        userId: 'default',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-campaigns'] });
      setNewCampaign({
        name: '',
        description: '',
        templateId: '',
        targetType: 'contacts',
        targetTags: [],
        targetGroups: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
      setSelectedContacts([]);
      setSelectedGroups([]);
      toast.success('Campanha criada!');
    },
    onError: (err: any) => {
      const message = err.message || err.response?.data?.error || 'Erro ao criar campanha';
      toast.error(message);
    },
  });

  const sendCampaignMut = useMutation({
    mutationFn: (id: string) => sendAutomationCampaignNow(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-campaigns'] });
      toast.success('Campanha disparada!');
    },
  });

  const deleteCampaignMut = useMutation({
    mutationFn: deleteAutomationCampaign,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-campaigns'] });
      toast.success('Campanha deletada!');
    },
  });

  const contactList = contacts?.contacts || [];
  const blockedAutomationContacts = contactList.filter((contact: any) =>
    isAutomationBlocked(contact.tags)
  );
  const normalizedBlockSearch = automationBlockSearch.trim().toLowerCase();
  const availableAutomationContacts = contactList
    .filter((contact: any) => !isAutomationBlocked(contact.tags))
    .filter((contact: any) =>
      !normalizedBlockSearch ||
      contact.name.toLowerCase().includes(normalizedBlockSearch) ||
      contact.phone.includes(normalizedBlockSearch)
    )
    .slice(0, 8);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <h1 className="text-xl md:text-3xl font-bold flex items-center gap-2"><Zap size={22} className="md:w-7 md:h-7" /> Automação WhatsApp</h1>

      {/* Tabs */}
      <div className="flex gap-1 md:gap-2 border-b overflow-x-auto">
        {['responses', 'openai', 'campaigns', 'messages'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-3 py-2 md:px-4 font-medium border-b-2 transition text-xs md:text-sm whitespace-nowrap ${activeTab === tab
                ? 'border-whatsapp text-whatsapp'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {tab === 'responses' && 'Autorresponse'}
            {tab === 'openai' && 'IA OpenAI'}
            {tab === 'campaigns' && 'Campanhas'}
            {tab === 'messages' && 'Agendadas'}
          </button>
        ))}
      </div>

      {activeTab === 'openai' && (
        <AutoResponse />
      )}

      {/* ─── AUTORRESPONSE ─── */}
      {activeTab === 'responses' && (
        <div className="space-y-4 md:space-y-6">
          <div className="card !p-4 md:!p-6">
            <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center gap-2"><MessageSquare size={18} /> Respostas Automáticas</h2>
            <p className="text-gray-600 mb-3 md:mb-4 text-sm md:text-base">O bot responderá automaticamente com base em palavras-chave da mensagem recebida.</p>

            {/* Criar / Editar template */}
            <div className="bg-gray-50 p-4 rounded-lg mb-6 space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">{editTemplateId ? 'Editar Template ou Menu' : 'Novo Template de Resposta'}</h3>
                {editTemplateId && (
                  <button onClick={() => { setEditTemplateId(null); setNewTemplate({ name: '', type: 'text', body: '', variables: [] }); }} className="text-sm text-gray-500 hover:text-gray-800">Cancelar Edição</button>
                )}
              </div>
              <input
                type="text"
                placeholder="Nome (ex: Menu Principal ou Horário do Curso)"
                className="input"
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
              <select
                className="input"
                value={newTemplate.type}
                onChange={(e) => setNewTemplate({ ...newTemplate, type: e.target.value })}
              >
                <option value="text">Texto</option>
                <option value="image">Imagem</option>
                <option value="audio">Áudio</option>
                <option value="video">Vídeo</option>
              </select>
              <textarea
                placeholder="Mensagem de resposta (use {{nome}}, {{email}}, {{phone}} para variáveis)"
                className="input"
                rows={4}
                value={newTemplate.body}
                onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })}
              />

              {/* Opções aninhadas (Menu) */}
              <div className="mt-4 p-4 border border-blue-100 rounded-lg bg-blue-50/30">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-semibold text-sm text-blue-900">🪄 Ações e Respostas Automáticas</h4>
                  <button
                    onClick={() => {
                      const currentVars = Array.isArray(newTemplate.variables) ? newTemplate.variables : [];
                      // Fila os antigos ["nome"] se existirem por acidente
                      const safeVars = currentVars.filter(v => typeof v === 'object');
                      setNewTemplate({ ...newTemplate, variables: [...safeVars, { trigger: '', response: '' }] });
                    }}
                    className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 bg-white px-2 py-1 rounded shadow-sm border"
                  >
                    <Plus size={12} /> Adicionar Ação
                  </button>
                </div>
                {(!newTemplate.variables || !Array.isArray(newTemplate.variables) || newTemplate.variables.filter(v => typeof v === 'object').length === 0) && <p className="text-xs text-gray-500">Nenhuma ação vinculada. Clique em "Adicionar Ação" para criar opções como "1 - Valor do curso".</p>}

                {Array.isArray(newTemplate.variables) && newTemplate.variables.filter(v => typeof v === 'object').map((opt, idx) => (
                  <div key={idx} className="flex flex-col gap-2 mb-4 p-3 border rounded-lg bg-white shadow-sm transition-all hover:border-blue-200">
                    <div className="flex gap-2 items-start">
                      <input
                        className="input w-1/3 text-sm py-2 bg-gray-50 border-gray-200"
                        placeholder="Ação (ex: 1, 2, cancelar)"
                        value={opt.trigger || ''}
                        onChange={e => {
                          const currentVars = newTemplate.variables.filter(v => typeof v === 'object');
                          currentVars[idx].trigger = e.target.value;
                          setNewTemplate({ ...newTemplate, variables: currentVars })
                        }}
                      />
                      <textarea
                        className="input flex-1 text-sm py-2 bg-gray-50 border-gray-200"
                        placeholder="Resposta da ação"
                        value={opt.response || ''}
                        rows={1}
                        onChange={e => {
                          const currentVars = newTemplate.variables.filter(v => typeof v === 'object');
                          currentVars[idx].response = e.target.value;
                          setNewTemplate({ ...newTemplate, variables: currentVars })
                        }}
                      />
                      <button
                        onClick={() => {
                          const currentVars = newTemplate.variables.filter(v => typeof v === 'object');
                          currentVars.splice(idx, 1);
                          setNewTemplate({ ...newTemplate, variables: currentVars })
                        }}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition"
                      ><Trash2 size={16} /></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[10px] uppercase font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Etiqueta automática:</div>
                      <input
                        className="flex-1 text-xs py-1 px-3 border border-dashed rounded bg-blue-50/50 border-blue-200 focus:outline-none focus:border-blue-400"
                        placeholder="Escreva a tag (ex: Interessado, Suporte...)"
                        value={opt.tag || ''}
                        onChange={e => {
                          const currentVars = newTemplate.variables.filter(v => typeof v === 'object');
                          currentVars[idx].tag = e.target.value;
                          setNewTemplate({ ...newTemplate, variables: currentVars })
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {editTemplateId ? (
                <button
                  onClick={() => updateTemplateMut.mutate(newTemplate)}
                  className="btn-primary w-full bg-blue-600 hover:bg-blue-700 mt-4"
                  disabled={updateTemplateMut.isPending}
                >
                  <Edit2 size={18} className="inline mr-2" />
                  Salvar Alterações
                </button>
              ) : (
                <button
                  onClick={() => createTemplateMut.mutate(newTemplate)}
                  className="btn-primary w-full mt-4"
                  disabled={createTemplateMut.isPending}
                >
                  <Plus size={18} className="inline mr-2" />
                  Criar Template ou Menu
                </button>
              )}
            </div>

            {/* Listar templates */}
            <div className="space-y-3">
              <h3 className="font-semibold">Templates Ativos ({templates?.length || 0})</h3>
              {templates && templates.length > 0 ? (
                templates.map((t: any) => (
                  <div key={t.id} className="p-3 border rounded-lg bg-white hover:shadow-md transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded inline-block mt-1">{t.type}</p>
                        {t.body && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{t.body}</p>}
                        {t.variables && Array.isArray(t.variables) && t.variables.some((v: any) => v.tag) && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {t.variables.filter((v: any) => v.tag).map((v: any, idx: number) => (
                              <span key={idx} className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold uppercase">🏷️ {v.tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditTemplateId(t.id); setNewTemplate({ name: t.name, type: t.type, body: t.body || '', variables: t.variables || [] }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="text-blue-500 hover:bg-blue-50 p-2 rounded"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => deleteTemplateMut.mutate(t.id)}
                          className="text-red-500 hover:bg-red-50 p-2 rounded"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">Nenhum template ainda. Crie um acima!</p>
              )}
            </div>
          </div>

          {/* Palavras-chave exemplo */}
          <div className="card !p-4 md:!p-6 bg-blue-50 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3 text-sm md:text-base">💡 Palavras-chave que ativam respostas:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm text-blue-800">
              <div>• "horário" / "hora" → Horário do curso</div>
              <div>• "duração" → Duração do curso</div>
              <div>• "preço" / "valor" → Preço</div>
              <div>• "inscrição" → Como se inscrever</div>
              <div>• "dúvida" / "ajuda" → Oferece suporte</div>
              <div>• "informações" → Informações gerais</div>
            </div>
          </div>

          {/* ─── AI AUTO-RESPONSE MENU ─── */}
          <div className="card !p-4 md:!p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
                <Bot size={20} className="text-purple-600" />
                Menu de Atendimento Automático
              </h2>
              {/* Enable/Disable Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className={`text-sm font-medium ${aiEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {aiEnabled ? 'Ativo' : 'Inativo'}
                </span>
                <div
                  onClick={() => setAiEnabled(!aiEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${aiEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${aiEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                </div>
              </label>
            </div>

            <p className="text-gray-500 text-sm mb-5">
              Quando ativado, o sistema envia automaticamente a mensagem de boas-vindas com o menu de opções para novos contatos. Ao responder com 1, 2, 3 ou 4, o contato recebe a resposta correspondente.
            </p>

            <div className="border border-red-100 bg-red-50/30 rounded-xl p-4 mb-5">
              <div className="flex items-start gap-3 mb-4">
                <UserMinus size={20} className="text-red-500 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-800">Contatos sem mensagens automáticas</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Eles continuam aparecendo no atendimento, mas não recebem menu nem respostas automáticas.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2 mb-3">
                <input
                  className="input bg-white"
                  value={blockedPhone}
                  onChange={(event) => setBlockedPhone(event.target.value)}
                  placeholder="Número com DDD (ex: 61999999999)"
                  inputMode="tel"
                />
                <input
                  className="input bg-white"
                  value={blockedPhoneName}
                  onChange={(event) => setBlockedPhoneName(event.target.value)}
                  placeholder="Nome ou observação (opcional)"
                />
                <button
                  type="button"
                  className="btn-primary flex items-center justify-center gap-2"
                  disabled={addBlockedPhoneMut.isPending || blockedPhone.replace(/\D/g, '').length < 10}
                  onClick={() => addBlockedPhoneMut.mutate()}
                >
                  <Plus size={15} />
                  Adicionar número
                </button>
              </div>

              {(blockedPhones as any[]).length > 0 && (
                <div className="border bg-white rounded-lg divide-y mb-4 max-h-64 overflow-y-auto">
                  {(blockedPhones as any[]).map((item: any) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.name || 'Número não salvo nos contatos'}</p>
                        <p className="text-xs text-gray-500">{item.phone}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary text-xs text-green-700 flex items-center gap-1 shrink-0"
                        disabled={deleteBlockedPhoneMut.isPending}
                        onClick={() => deleteBlockedPhoneMut.mutate(item.id)}
                      >
                        <UserPlus size={14} />
                        Permitir
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs font-semibold text-gray-500 mb-2">
                Ou escolha um contato já salvo:
              </p>
              <input
                className="input mb-3 bg-white"
                value={automationBlockSearch}
                onChange={(event) => setAutomationBlockSearch(event.target.value)}
                placeholder="Buscar contato pelo nome ou telefone"
              />

              {automationBlockSearch.trim() && (
                <div className="border bg-white rounded-lg divide-y mb-4 max-h-64 overflow-y-auto">
                  {availableAutomationContacts.length > 0 ? (
                    availableAutomationContacts.map((contact: any) => (
                      <div key={contact.id} className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{contact.name}</p>
                          <p className="text-xs text-gray-500">{contact.phone}</p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary text-xs text-red-600 flex items-center gap-1 shrink-0"
                          disabled={automationBlockMut.isPending}
                          onClick={() => {
                            automationBlockMut.mutate({ id: contact.id, blocked: true });
                            setAutomationBlockSearch('');
                          }}
                        >
                          <UserMinus size={14} />
                          Bloquear
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 p-3">Nenhum contato disponível encontrado.</p>
                  )}
                </div>
              )}

              <p className="text-sm font-semibold mb-2">
                Lista bloqueada ({blockedAutomationContacts.length})
              </p>
              {blockedAutomationContacts.length > 0 ? (
                <div className="border bg-white rounded-lg divide-y max-h-64 overflow-y-auto">
                  {blockedAutomationContacts.map((contact: any) => (
                    <div key={contact.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{contact.name}</p>
                        <p className="text-xs text-gray-500">{contact.phone}</p>
                      </div>
                      <button
                        type="button"
                        className="btn-secondary text-xs text-green-700 flex items-center gap-1 shrink-0"
                        disabled={automationBlockMut.isPending}
                        onClick={() => automationBlockMut.mutate({ id: contact.id, blocked: false })}
                      >
                        <UserPlus size={14} />
                        Permitir
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 bg-white rounded-lg p-3">
                  Nenhum contato bloqueado. Use a busca acima para adicionar.
                </p>
              )}
            </div>

            <div className="border border-green-200 bg-green-50/40 rounded-xl p-4 mb-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">Mensagem de encerramento</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Enviada quando a pessoa disser “obrigado”, “era só isso”, “até mais” ou indicar que o problema foi resolvido.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setClosingEnabled(!closingEnabled)}
                  className={`relative w-12 h-6 rounded-full shrink-0 transition-colors ${closingEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
                  title={closingEnabled ? 'Desativar encerramento' : 'Ativar encerramento'}
                >
                  <span
                    className={`absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform ${closingEnabled ? 'translate-x-7' : 'translate-x-1'}`}
                  />
                </button>
              </div>
              <textarea
                className="input text-sm bg-white resize-y"
                rows={4}
                value={closingMessage}
                onChange={(event) => setClosingMessage(event.target.value)}
                disabled={!closingEnabled}
                placeholder="Digite a mensagem de despedida"
              />
              <p className="text-xs text-green-700 mt-2">
                Funciona apenas em conversas privadas, respeita a lista de bloqueio e não repete a despedida na mesma conversa.
              </p>
            </div>

            {/* Welcome Message */}
            <div className="space-y-4">
              <div>
                <label className="label font-semibold text-gray-700 mb-1 block">
                  📩 Mensagem de Boas-Vindas (Menu Principal)
                </label>
                <textarea
                  className="input text-sm font-sans leading-relaxed resize-y min-h-48"
                  rows={8}
                  value={aiWelcome}
                  onChange={(e) => setAiWelcome(e.target.value)}
                  placeholder="Digite a mensagem de boas-vindas com as opções do menu..."
                />
              </div>

              {/* Option Responses */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([1, 2, 3, 4] as const).map((num) => {
                  const labels: Record<number, string> = {
                    1: '1️⃣ Resposta para Opção 1',
                    2: '2️⃣ Resposta para Opção 2',
                    3: '3️⃣ Resposta para Opção 3',
                    4: '4️⃣ Resposta para Opção 4',
                  };
                  const placeholders: Record<number, string> = {
                    1: 'Ex: Dúvidas Do Curso — Nosso curso tem duração de 40h...',
                    2: 'Ex: Suporte — Entre em contato com nosso suporte pelo e-mail...',
                    3: 'Ex: Segunda via — Para solicitar segunda via, envie seu CPF...',
                    4: 'Ex: Outros Assuntos — Descreva sua dúvida e retornaremos em breve...',
                  };
                  return (
                    <div key={num}>
                      <label className="label font-semibold text-gray-700 mb-1 block">{labels[num]}</label>
                      <textarea
                        className="input text-sm"
                        rows={4}
                        value={aiOptions[num]}
                        onChange={(e) => setAiOptions({ ...aiOptions, [num]: e.target.value })}
                        placeholder={placeholders[num]}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="border border-gray-200 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">Perguntas e respostas automáticas</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Cadastre variações de perguntas. Se a mensagem for parecida, o sistema responde sem mostrar o menu.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setAiQaRules([...aiQaRules, { question: '', answer: '' }])}
                      className="btn-secondary text-sm flex items-center justify-center gap-2"
                    >
                      <Plus size={14} />
                      Adicionar pergunta
                    </button>
                    <button
                      type="button"
                      onClick={() => saveAIConfigMut.mutate()}
                      disabled={saveAIConfigMut.isPending}
                      className="btn-primary text-sm flex items-center justify-center gap-2"
                    >
                      <Save size={14} />
                      {saveAIConfigMut.isPending ? 'Salvando...' : 'Salvar perguntas'}
                    </button>
                  </div>
                </div>

                {aiQaRules.length === 0 ? (
                  <div className="text-sm text-gray-400 bg-gray-50 rounded-lg p-3">
                    Nenhuma pergunta cadastrada. Ex: pergunta "valor do curso, quanto custa" e resposta com o preço.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {aiQaRules.map((rule, index) => (
                      <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-start bg-gray-50 rounded-lg p-3">
                        <div>
                          <label className="label">Perguntas parecidas</label>
                          <textarea
                            className="input text-sm"
                            rows={3}
                            placeholder="Ex: valor do curso, quanto custa, preço"
                            value={rule.question}
                            onChange={(e) => {
                              const next = [...aiQaRules];
                              next[index] = { ...next[index], question: e.target.value };
                              setAiQaRules(next);
                            }}
                          />
                        </div>
                        <div>
                          <label className="label">Resposta</label>
                          <textarea
                            className="input text-sm"
                            rows={3}
                            placeholder="Digite a resposta que será enviada"
                            value={rule.answer}
                            onChange={(e) => {
                              const next = [...aiQaRules];
                              next[index] = { ...next[index], answer: e.target.value };
                              setAiQaRules(next);
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setAiQaRules(aiQaRules.filter((_, itemIndex) => itemIndex !== index))}
                          className="btn-secondary text-red-600 hover:bg-red-50 md:mt-6"
                          title="Remover pergunta"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={() => saveAIConfigMut.mutate()}
                  disabled={saveAIConfigMut.isPending}
                  className="btn-primary flex items-center justify-center gap-2 flex-1"
                >
                  <Save size={16} />
                  {saveAIConfigMut.isPending ? 'Salvando...' : 'Salvar Configuração'}
                </button>
                <button
                  onClick={() => setShowAiPreview(!showAiPreview)}
                  className="btn-secondary flex items-center justify-center gap-2 px-4"
                >
                  <Eye size={16} />
                  {showAiPreview ? 'Ocultar Preview' : 'Preview do Menu'}
                </button>
              </div>

              {/* Preview */}
              {showAiPreview && (
                <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <p className="text-xs font-bold text-gray-500 uppercase mb-3">📱 Preview — Como o usuário verá:</p>
                  <div className="bg-[#e5ddd5] rounded-xl p-4 space-y-3 max-w-sm">
                    {/* Welcome bubble */}
                    <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-xs">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{aiWelcome || '(mensagem de boas-vindas vazia)'}</p>
                      <p className="text-[10px] text-gray-400 text-right mt-1">✓✓</p>
                    </div>
                    {/* Option responses */}
                    {([1, 2, 3, 4] as const).map((num) =>
                      aiOptions[num] ? (
                        <div key={num} className="flex flex-col gap-1">
                          <div className="bg-[#dcf8c6] rounded-lg rounded-tr-none p-2 shadow-sm self-end max-w-[60px] text-center">
                            <p className="text-sm font-bold text-gray-800">{num}</p>
                          </div>
                          <div className="bg-white rounded-lg rounded-tl-none p-3 shadow-sm max-w-xs">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{aiOptions[num]}</p>
                            <p className="text-[10px] text-gray-400 text-right mt-1">✓✓</p>
                          </div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CAMPANHAS AGENDADAS ─── */}
      {activeTab === 'campaigns' && (
        <div className="space-y-4 md:space-y-6">
          <div className="card !p-4 md:!p-6">
            <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center gap-2"><Clock size={18} /> Campanhas Agendadas</h2>

            {/* Criar nova campanha */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4 md:mb-6 space-y-3">
              <h3 className="font-semibold text-sm md:text-base">Nova Campanha</h3>
              <input
                type="text"
                placeholder="Nome da campanha"
                className="input"
                value={newCampaign.name}
                onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
              />
              <textarea
                placeholder="Descrição (opcional)"
                className="input"
                rows={2}
                value={newCampaign.description}
                onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Template de mensagem *</label>
                  <select
                    className="input"
                    value={newCampaign.templateId}
                    onChange={(e) => setNewCampaign({ ...newCampaign, templateId: e.target.value })}
                  >
                    <option value="">Selecione um template...</option>
                    {templates && templates.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Tipo de destino</label>
                  <select
                    className="input"
                    value={newCampaign.targetType}
                    onChange={(e) => setNewCampaign({ ...newCampaign, targetType: e.target.value })}
                  >
                    <option value="contacts">Contatos</option>
                    <option value="groups">Grupos</option>
                    <option value="all">Todos</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Data/Hora de envio</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={newCampaign.scheduledAt.slice(0, 16)}
                  onChange={(e) =>
                    setNewCampaign({
                      ...newCampaign,
                      scheduledAt: new Date(e.target.value).toISOString(),
                    })
                  }
                />
              </div>

              {newCampaign.targetType === 'contacts' && (
                <div>
                  <label className="label">Selecione contatos ({selectedContacts.length} selecionados)</label>
                  <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1 bg-white">
                    {contacts && contacts.length > 0 ? (
                      contacts.slice(0, 50).map((c: any) => (
                        <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedContacts.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedContacts([...selectedContacts, c.id]);
                              } else {
                                setSelectedContacts(selectedContacts.filter(id => id !== c.id));
                              }
                            }}
                          />
                          <span>{c.name}</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">Nenhum contato disponível</p>
                    )}
                  </div>
                </div>
              )}

              {newCampaign.targetType === 'groups' && (
                <div>
                  <label className="label">Selecione grupos ({selectedGroups.length} selecionados)</label>
                  <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1 bg-white">
                    {groups && groups.filter((g: any) => g.active).length > 0 ? (
                      groups.filter((g: any) => g.active).map((g: any) => (
                        <label key={g.groupId} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(g.groupId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedGroups([...selectedGroups, g.groupId]);
                              } else {
                                setSelectedGroups(selectedGroups.filter(id => id !== g.groupId));
                              }
                            }}
                          />
                          <span>{g.name} ({g.members} membros)</span>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">Nenhum grupo disponível</p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => createCampaignMut.mutate()}
                className="btn-primary w-full"
                disabled={createCampaignMut.isPending}
              >
                <Plus size={18} className="inline mr-2" />
                Criar Campanha
              </button>
            </div>

            {/* Listar campanhas */}
            <div className="space-y-3">
              <h3 className="font-semibold">Campanhas Ativas ({campaigns?.filter((c: any) => c.status !== 'completed').length || 0})</h3>
              {campaigns && campaigns.length > 0 ? (
                campaigns.map((c: any) => (
                  <div key={c.id} className="p-4 border rounded-lg bg-white hover:shadow-md transition">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-gray-500">{c.description}</p>
                        <div className="flex gap-4 text-xs text-gray-600 mt-2">
                          <span>📅 {new Date(c.scheduledAt).toLocaleString('pt-BR')}</span>
                          <span>🎯 {c.targetType}</span>
                          <span className={`px-2 py-1 rounded ${c.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
                              c.status === 'running' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                            }`}>
                            {c.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => sendCampaignMut.mutate(c.id)}
                          className="btn-secondary px-3 py-2 text-sm"
                          disabled={sendCampaignMut.isPending}
                        >
                          <Send size={16} />
                        </button>
                        <button
                          onClick={() => deleteCampaignMut.mutate(c.id)}
                          className="text-red-500 hover:bg-red-50 p-2 rounded"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">Nenhuma campanha ainda</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MENSAGENS AGENDADAS ─── */}
      {activeTab === 'messages' && (
        <div className="card !p-4 md:!p-6">
          <h2 className="text-lg md:text-xl font-bold mb-3 md:mb-4 flex items-center gap-2"><Clock size={18} /> Mensagens Agendadas</h2>
          <p className="text-gray-600 text-sm md:text-base">Configure mensagens recorrentes ou agendadas para cursos e contatos específicos.</p>

          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">⏰ <strong>Exemplos de agendamento:</strong></p>
            <ul className="text-sm text-yellow-700 mt-2 space-y-1 ml-4">
              <li>→ Enviar informações de novo curso toda segunda às 19h</li>
              <li>→ Enviar lembrança de aula 1 hora antes</li>
              <li>→ Enviar certificado automaticamente após conclusão</li>
              <li>→ Bomba diária com as novidades do dia</li>
            </ul>
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <p className="text-gray-600 text-sm">Mensagens recorrentes em desenvolvimento...</p>
          </div>
        </div>
      )}
    </div>
  );
}

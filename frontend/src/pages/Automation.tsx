import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAutoResponseStatus,
  getAutoResponseTemplates,
  createAutoResponseTemplate,
  deleteAutoResponseTemplate,
  getAutomationCampaigns,
  createAutomationCampaign,
  sendAutomationCampaignNow,
  deleteAutomationCampaign,
  getContacts,
  getGroups,
  getCourses
} from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Send, Clock, MessageSquare, Zap } from 'lucide-react';

export default function Automation() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'responses' | 'campaigns' | 'messages'>('responses');

  // === AUTORRESPONSE ===
  const [newTemplate, setNewTemplate] = useState({ name: '', type: 'text', body: '' });
  
  const { data: arStatus } = useQuery({ queryKey: ['ar-status'], queryFn: getAutoResponseStatus });
  const { data: templates } = useQuery({ queryKey: ['ar-templates'], queryFn: getAutoResponseTemplates });
  
  const createTemplateMut = useMutation({
    mutationFn: createAutoResponseTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-templates'] });
      setNewTemplate({ name: '', type: 'text', body: '' });
      toast.success('Template criado!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao criar'),
  });

  const deleteTemplateMut = useMutation({
    mutationFn: deleteAutoResponseTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ar-templates'] });
      toast.success('Template removido!');
    },
  });

  // === CAMPANHAS AGENDADAS ===
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    targetType: 'contacts',
    targetTags: [] as string[],
    targetGroups: [] as string[],
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
  });

  const { data: campaigns } = useQuery({ queryKey: ['automation-campaigns'], queryFn: getAutomationCampaigns });
  const { data: contacts } = useQuery({ queryKey: ['contacts', { limit: 1000 }], queryFn: () => getContacts({ limit: 1000 }) });
  const { data: groups } = useQuery({ queryKey: ['groups'], queryFn: getGroups });
  const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: getCourses });

  const createCampaignMut = useMutation({
    mutationFn: async () => {
      if (!newCampaign.name) throw new Error('Nome é obrigatório');
      return createAutomationCampaign({
        ...newCampaign,
        userId: 'default',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['automation-campaigns'] });
      setNewCampaign({
        name: '',
        description: '',
        targetType: 'contacts',
        targetTags: [],
        targetGroups: [],
        scheduledAt: new Date(Date.now() + 3600000).toISOString(),
      });
      toast.success('Campanha criada!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Erro ao criar'),
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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold flex items-center gap-2"><Zap size={28} /> Automação WhatsApp</h1>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {['responses', 'campaigns', 'messages'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 font-medium border-b-2 transition ${
              activeTab === tab
                ? 'border-whatsapp text-whatsapp'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'responses' && 'Autorresponse'}
            {tab === 'campaigns' && 'Campanhas'}
            {tab === 'messages' && 'Agendadas'}
          </button>
        ))}
      </div>

      {/* ─── AUTORRESPONSE ─── */}
      {activeTab === 'responses' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><MessageSquare size={20} /> Respostas Automáticas</h2>
            <p className="text-gray-600 mb-4">O bot responderá automaticamente com base em palavras-chave da mensagem recebida.</p>

            {/* Criar novo template */}
            <div className="bg-gray-50 p-4 rounded-lg mb-6 space-y-3">
              <h3 className="font-semibold">Novo Template de Resposta</h3>
              <input
                type="text"
                placeholder="Nome (ex: Horário do Curso)"
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
              <button
                onClick={() => createTemplateMut.mutate(newTemplate)}
                className="btn-primary w-full"
                disabled={createTemplateMut.isPending}
              >
                <Plus size={18} className="inline mr-2" />
                Criar Template
              </button>
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
                      </div>
                      <button
                        onClick={() => deleteTemplateMut.mutate(t.id)}
                        className="text-red-500 hover:bg-red-50 p-2 rounded"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-400 text-sm">Nenhum template ainda. Crie um acima!</p>
              )}
            </div>
          </div>

          {/* Palavras-chave exemplo */}
          <div className="card bg-blue-50 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">💡 Palavras-chave que ativam respostas:</h3>
            <div className="grid grid-cols-2 gap-3 text-sm text-blue-800">
              <div>• "horário" / "hora" → Horário do curso</div>
              <div>• "duração" → Duração do curso</div>
              <div>• "preço" / "valor" → Preço</div>
              <div>• "inscrição" → Como se inscrever</div>
              <div>• "dúvida" / "ajuda" → Oferece suporte</div>
              <div>• "informações" → Informações gerais</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── CAMPANHAS AGENDADAS ─── */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Clock size={20} /> Campanhas Agendadas</h2>

            {/* Criar nova campanha */}
            <div className="bg-gray-50 p-4 rounded-lg mb-6 space-y-3">
              <h3 className="font-semibold">Nova Campanha</h3>
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

              <div className="grid grid-cols-2 gap-3">
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
              </div>

              {newCampaign.targetType === 'contacts' && (
                <div>
                  <label className="label">Selecione contatos</label>
                  <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                    {contacts && contacts.slice(0, 20).map((c: any) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" />
                        <span>{c.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {newCampaign.targetType === 'groups' && (
                <div>
                  <label className="label">Selecione grupos</label>
                  <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                    {groups && groups.map((g: any) => (
                      <label key={g.groupId} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" />
                        <span>{g.name} ({g.members} membros)</span>
                      </label>
                    ))}
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
                          <span className={`px-2 py-1 rounded ${
                            c.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
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
        <div className="card">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Clock size={20} /> Mensagens Agendadas</h2>
          <p className="text-gray-600">Configure mensagens recorrentes ou agendadas para cursos e contatos específicos.</p>
          
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

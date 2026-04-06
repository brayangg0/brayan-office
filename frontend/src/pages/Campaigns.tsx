import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCampaigns, createCampaign, sendCampaign, scheduleCampaign, getTemplates, getGroups } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Send, Calendar, Play, CheckCircle, Clock, XCircle, Megaphone } from 'lucide-react';
import { format } from 'date-fns';

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  draft: { label: 'Rascunho', icon: Clock, color: 'bg-gray-100 text-gray-600' },
  scheduled: { label: 'Agendada', icon: Calendar, color: 'bg-blue-100 text-blue-600' },
  running: { label: 'Enviando', icon: Play, color: 'bg-yellow-100 text-yellow-600' },
  completed: { label: 'Concluída', icon: CheckCircle, color: 'bg-green-100 text-green-600' },
  cancelled: { label: 'Cancelada', icon: XCircle, color: 'bg-red-100 text-red-600' },
};

export default function Campaigns() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState<{ open: boolean; id?: string }>({ open: false });
  const [scheduleDate, setScheduleDate] = useState('');
  const [form, setForm] = useState({ name: '', description: '', templateId: '', targetType: 'all_students', sendInterval: '3000' });

  const { data } = useQuery({ queryKey: ['campaigns'], queryFn: () => getCampaigns({ limit: 50 }) });
  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: getTemplates });

  const createMut = useMutation({
    mutationFn: createCampaign,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); setModal(false); toast.success('Campanha criada!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao criar'),
  });

  const sendMut = useMutation({
    mutationFn: sendCampaign,
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast.success(d.message); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao disparar'),
  });

  const scheduleMut = useMutation({
    mutationFn: ({ id, at }: { id: string; at: string }) => scheduleCampaign(id, at),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); setScheduleModal({ open: false }); toast.success('Campanha agendada!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao agendar'),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Campanhas</h1>
        <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Nova Campanha</button>
      </div>

      <div className="grid gap-4">
        {data?.campaigns?.length === 0 && <div className="card text-center py-12 text-gray-400">Nenhuma campanha criada</div>}
        {data?.campaigns?.map((c: any) => {
          const cfg = statusConfig[c.status] || statusConfig.draft;
          const Icon = cfg.icon;
          return (
            <div key={c.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg"><Megaphone size={20} className="text-purple-600" /></div>
                  <div>
                    <h3 className="font-semibold">{c.name}</h3>
                    {c.description && <p className="text-sm text-gray-500">{c.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>Template: {c.template?.name || 'Nenhum'}</span>
                      <span>Destino: {c.targetType}</span>
                      {c.scheduledAt && <span>Agendada: {format(new Date(c.scheduledAt), 'dd/MM/yyyy HH:mm')}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-green-600">✓ {c.totalSent} enviados</span>
                      {c.totalFailed > 0 && <span className="text-red-500">✗ {c.totalFailed} falhas</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`badge ${cfg.color} flex items-center gap-1`}><Icon size={12} />{cfg.label}</span>
                  {c.status === 'draft' && c.template && (
                    <>
                      <button onClick={() => { if (confirm('Disparar agora?')) sendMut.mutate(c.id); }}
                        className="btn-primary text-xs py-1.5 flex items-center gap-1" disabled={sendMut.isPending}>
                        <Send size={12} /> Disparar
                      </button>
                      <button onClick={() => setScheduleModal({ open: true, id: c.id })}
                        className="btn-secondary text-xs py-1.5 flex items-center gap-1">
                        <Calendar size={12} /> Agendar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Nova Campanha */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b font-semibold">Nova Campanha</div>
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ ...form, sendInterval: parseInt(form.sendInterval) }); }} className="p-4 space-y-3">
              <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div><label className="label">Descrição</label><input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div>
                <label className="label">Template de Mensagem *</label>
                <select className="input" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} required>
                  <option value="">Selecione um template...</option>
                  {templates?.map((t: any) => <option key={t.id} value={t.id}>{t.name} [{t.type}]</option>)}
                </select>
              </div>
              <div>
                <label className="label">Público-alvo</label>
                <select className="input" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
                  <option value="all_students">Todos os Alunos</option>
                  <option value="all">Todos os Contatos</option>
                  <option value="tagged">Por Tag</option>
                  <option value="groups">Grupos</option>
                </select>
              </div>
              <div>
                <label className="label">Intervalo entre envios (ms)</label>
                <input className="input" type="number" min="1000" value={form.sendInterval} onChange={(e) => setForm({ ...form, sendInterval: e.target.value })} />
                <p className="text-xs text-gray-400 mt-1">Mínimo recomendado: 3000ms para evitar bloqueios</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={createMut.isPending}>{createMut.isPending ? 'Criando...' : 'Criar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Agendar */}
      {scheduleModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-4 border-b font-semibold">Agendar Campanha</div>
            <div className="p-4 space-y-3">
              <div><label className="label">Data e Hora</label><input className="input" type="datetime-local" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} /></div>
              <div className="flex gap-3">
                <button onClick={() => setScheduleModal({ open: false })} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={() => scheduleMut.mutate({ id: scheduleModal.id!, at: scheduleDate })}
                  className="btn-primary flex-1" disabled={!scheduleDate || scheduleMut.isPending}>
                  {scheduleMut.isPending ? 'Agendando...' : 'Agendar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

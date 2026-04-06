import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSchedules, createSchedule, cancelSchedule, getContacts, getGroups } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Calendar, Trash2, Clock, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

const statusIcon: Record<string, any> = {
  pending: Clock, sent: CheckCircle, failed: XCircle, cancelled: XCircle,
};
const statusColor: Record<string, string> = {
  pending: 'text-blue-600 bg-blue-100', sent: 'text-green-600 bg-green-100',
  failed: 'text-red-600 bg-red-100', cancelled: 'text-gray-500 bg-gray-100',
};

export default function Schedule() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    targetType: 'all_students', targetId: '', targetTags: [] as string[], type: 'text', body: '',
    scheduledAt: '', cronExpr: '', recurring: false,
  });

  const { data: schedules } = useQuery({ queryKey: ['schedules'], queryFn: () => getSchedules() });
  const { data: contacts, isPending: loadingContacts } = useQuery({ queryKey: ['contacts-list'], queryFn: () => getContacts({ limit: 500 }) });
  const { data: groups, isPending: loadingGroups } = useQuery({ queryKey: ['groups'], queryFn: getGroups });

  const createMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('targetType', form.targetType);
      if (form.targetId) fd.append('targetId', form.targetId);
      if (form.targetTags.length > 0) fd.append('targetTags', JSON.stringify(form.targetTags));
      fd.append('type', form.type);
      if (form.body) fd.append('body', form.body);
      // datetime-local vem como "2026-04-02T10:30"
      // Parse como ISO string local e converte para UTC
      const parts = form.scheduledAt.split('T');
      const [year, month, day] = parts[0].split('-');
      const [hours, minutes] = parts[1].split(':');
      const scheduledDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
      fd.append('scheduledAt', scheduledDate.toISOString());
      if (form.cronExpr) fd.append('cronExpr', form.cronExpr);
      fd.append('recurring', String(form.recurring));
      if (file) fd.append('media', file);
      return createSchedule(fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedules'] });
      setModal(false);
      setFile(null);
      setForm({ targetType: 'all_students', targetId: '', targetTags: [], type: 'text', body: '', scheduledAt: '', cronExpr: '', recurring: false });
      toast.success('Mensagem agendada com sucesso!');
    },
    onError: (e: any) => {
      const msg = e.response?.data?.error || e.response?.data?.details || e.message || 'Erro ao agendar';
      console.error('[Schedule Error]', msg, e);
      toast.error(msg);
    },
  });

  const cancelMut = useMutation({
    mutationFn: cancelSchedule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['schedules'] }); toast.success('Agendamento cancelado'); },
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Agendamentos</h1>
          <p className="text-sm text-gray-500">Programe envios automáticos de mensagens, áudios e vídeos</p>
        </div>
        <button onClick={() => setModal(true)} className="btn-primary flex items-center gap-2"><Plus size={16} /> Agendar Mensagem</button>
      </div>

      <div className="space-y-3">
        {!schedules?.length && <div className="card text-center py-12 text-gray-400">Nenhum agendamento</div>}
        {schedules?.map((s: any) => {
          const Icon = statusIcon[s.status] || Clock;
          return (
            <div key={s.id} className="card flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${statusColor[s.status] || 'bg-gray-100 text-gray-500'}`}><Calendar size={18} /></div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{s.targetType === 'all_students' ? 'Todos os Alunos' : s.targetType === 'all' ? 'Todos' : s.targetType === 'group' ? 'Grupo' : 'Contato'}</p>
                    <span className={`badge text-xs ${statusColor[s.status]}`}><Icon size={10} className="inline mr-1" />{s.status}</span>
                    {s.recurring && <span className="badge bg-purple-100 text-purple-600 text-xs"><RefreshCw size={10} className="inline mr-1" />Recorrente</span>}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{s.body?.substring(0, 80) || `[${s.type}]`}</p>
                  {s.cronExpr && <p className="text-xs text-gray-400 mt-1">Cron: {s.cronExpr}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    <Clock size={10} className="inline mr-1" />
                    {format(new Date(s.scheduledAt), 'dd/MM/yyyy HH:mm')}
                    {s.user && ` · por ${s.user.name}`}
                  </p>
                </div>
              </div>
              {s.status === 'pending' && (
                <button onClick={() => { if (confirm('Cancelar agendamento?')) cancelMut.mutate(s.id); }}
                  className="p-2 hover:bg-red-50 rounded text-red-400 shrink-0">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-4 border-b font-semibold">Agendar Mensagem</div>
            <form onSubmit={(e) => {
              e.preventDefault();
              
              // Validações
              if ((form.targetType === 'contact' || form.targetType === 'group') && !form.targetId) {
                toast.error(`Selecione um ${form.targetType === 'contact' ? 'contato' : 'grupo'}`);
                return;
              }
              if (form.targetType === 'tagged' && form.targetTags.length === 0) {
                toast.error('Selecione ao menos uma tag');
                return;
              }
              if (!form.scheduledAt) {
                toast.error('Selecione data e hora');
                return;
              }
              // Parse data da mesma forma que a mutation
              const dateParts = form.scheduledAt.split('T');
              const [year, month, day] = dateParts[0].split('-');
              const [hours, minutes] = dateParts[1].split(':');
              const scheduledDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
              const now = new Date();
              const minAllowed = new Date(now.getTime() + 10000); // 10 segundos
              if (scheduledDate < minAllowed) {
                toast.error('Agende para pelo menos 10 segundos no futuro');
                return;
              }
              if (form.type === 'text' && !form.body.trim()) {
                toast.error('Digite a mensagem');
                return;
              }
              if (form.type !== 'text' && !file) {
                toast.error(`Selecione um arquivo ${form.type}`);
                return;
              }
              if (form.recurring && !form.cronExpr) {
                toast.error('Digite a expressão cron para mensagens recorrentes');
                return;
              }
              
              createMut.mutate();
            }} className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="label">Destino *</label>
                <select className="input" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value, targetId: '', targetTags: [] })}>
                  <option value="all_students">Todos os Alunos</option>
                  <option value="all">Todos os Contatos</option>
                  <option value="contact">Contato Específico</option>
                  <option value="group">Grupo Específico</option>
                  <option value="tagged">Por Tag</option>
                </select>
              </div>

              {form.targetType === 'contact' && (
                <div>
                  <label className="label">Contato *</label>
                  {loadingContacts ? (
                    <div className="input bg-gray-50 text-gray-500">Carregando contatos...</div>
                  ) : contacts?.contacts?.length === 0 ? (
                    <div className="input bg-red-50 text-red-600">Nenhum contato encontrado</div>
                  ) : (
                    <select className="input" value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} required>
                      <option value="">Selecione um contato...</option>
                      {contacts?.contacts?.map((c: any) => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                    </select>
                  )}
                </div>
              )}

              {form.targetType === 'group' && (
                <div>
                  <label className="label">Grupo *</label>
                  {loadingGroups ? (
                    <div className="input bg-gray-50 text-gray-500">Carregando grupos...</div>
                  ) : !groups || groups.length === 0 ? (
                    <div className="input bg-red-50 text-red-600">Nenhum grupo encontrado. Sincronize os grupos WhatsApp primeiro.</div>
                  ) : (
                    <select className="input" value={form.targetId} onChange={(e) => setForm({ ...form, targetId: e.target.value })} required>
                      <option value="">Selecione um grupo...</option>
                      {groups?.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.members} membros)</option>)}
                    </select>
                  )}
                </div>
              )}

              {form.targetType === 'tagged' && (
                <div>
                  <label className="label">Tags *</label>
                  <div className="space-y-2">
                    {(Array.from(new Set(contacts?.contacts?.flatMap((c: any) => JSON.parse(c.tags || '[]')) || [])) as string[]).map((tag: string) => (
                      <label key={tag} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={form.targetTags.includes(tag)}
                          onChange={(e) => setForm({
                            ...form,
                            targetTags: e.target.checked
                              ? [...form.targetTags, tag]
                              : form.targetTags.filter(t => t !== tag)
                          })}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{tag}</span>
                      </label>
                    ))}
                  </div>
                  {(Array.from(new Set(contacts?.contacts?.flatMap((c: any) => JSON.parse(c.tags || '[]')) || [])) as string[]).length === 0 && (
                    <p className="text-xs text-gray-400">Nenhuma tag encontrada nos contatos</p>
                  )}
                </div>
              )}

              <div>
                <label className="label">Tipo de Mensagem *</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, body: '' })} required>
                  <option value="text">Texto</option>
                  <option value="image">Imagem</option>
                  <option value="audio">Áudio</option>
                  <option value="video">Vídeo</option>
                </select>
              </div>

              {form.type === 'text' ? (
                <div><label className="label">Mensagem *</label><textarea className="input h-24 resize-none" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Digite sua mensagem..." required /></div>
              ) : (
                <div>
                  <label className="label">Arquivo ({form.type}) *</label>
                  <input type="file" className="input"
                    accept={form.type === 'audio' ? 'audio/*' : form.type === 'video' ? 'video/*' : 'image/*'}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        const maxSize = form.type === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
                        if (f.size > maxSize) {
                          toast.error(`Arquivo muito grande (máximo ${form.type === 'video' ? '100' : '20'}MB)`);
                          e.target.value = '';
                        } else {
                          setFile(f);
                        }
                      }
                    }}
                    required
                  />
                  <input className="input mt-2" placeholder="Legenda (opcional)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
                </div>
              )}

              <div><label className="label">Data e Hora do Envio *</label><input className="input" type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} required /></div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <input type="checkbox" id="recurring" checked={form.recurring} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} className="w-4 h-4" />
                <label htmlFor="recurring" className="text-sm cursor-pointer">Mensagem Recorrente (cron)</label>
              </div>

              {form.recurring && (
                <div>
                  <label className="label">Expressão Cron *</label>
                  <input className="input" placeholder="0 9 * * * (diariamente 9h)" value={form.cronExpr} onChange={(e) => setForm({ ...form, cronExpr: e.target.value })} required />
                  <p className="text-xs text-gray-400 mt-1">
                    Exemplos: <br />
                    "0 9 * * *" = Diariamente às 9h <br />
                    "0 8 * * 1-5" = Seg-Sex às 8h <br />
                    "*/30 * * * *" = A cada 30 minutos
                  </p>
                </div>
              )}

              {createMut.isPending && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                  ⏳ Agendando mensagem...
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setModal(false); setFile(null); }} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={createMut.isPending}>{createMut.isPending ? 'Agendando...' : 'Agendar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

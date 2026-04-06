import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTemplates, createTemplate, updateTemplate } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, FileText, Image, Mic, Video, File as FileIcon } from 'lucide-react';

const typeIcons: Record<string, any> = {
  text: FileText, image: Image, audio: Mic, video: Video, document: FileIcon,
};
const typeColors: Record<string, string> = {
  text: 'bg-blue-100 text-blue-600', image: 'bg-pink-100 text-pink-600',
  audio: 'bg-purple-100 text-purple-600', video: 'bg-orange-100 text-orange-600',
  document: 'bg-gray-100 text-gray-600',
};

export default function Templates() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; template?: any }>({ open: false });
  const [form, setForm] = useState({ name: '', type: 'text', body: '', variables: '' });
  const [file, setFile] = useState<File | null>(null);

  const { data: templates } = useQuery({ queryKey: ['templates'], queryFn: getTemplates });

  const saveMut = useMutation({
    mutationFn: (fd: FormData) => modal.template ? updateTemplate(modal.template.id, fd) : createTemplate(fd),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setModal({ open: false }); toast.success('Template salvo!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao salvar'),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('type', form.type);
    fd.append('body', form.body);
    fd.append('variables', JSON.stringify(form.variables.split(',').map((v) => v.trim()).filter(Boolean)));
    if (file) fd.append('media', file);
    saveMut.mutate(fd);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates de Mensagem</h1>
          <p className="text-sm text-gray-500">Crie modelos reutilizáveis com texto, imagem, áudio ou vídeo</p>
        </div>
        <button onClick={() => { setForm({ name: '', type: 'text', body: '', variables: '' }); setFile(null); setModal({ open: true }); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Novo Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates?.length === 0 && <div className="col-span-3 card text-center py-12 text-gray-400">Nenhum template criado</div>}
        {templates?.map((t: any) => {
          const Icon = typeIcons[t.type] || FileText;
          return (
            <div key={t.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => {
              setForm({ name: t.name, type: t.type, body: t.body || '', variables: JSON.parse(t.variables || '[]').join(', ') });
              setFile(null);
              setModal({ open: true, template: t });
            }}>
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${typeColors[t.type] || 'bg-gray-100 text-gray-600'}`}>
                  <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{t.name}</p>
                  <span className={`badge text-xs ${typeColors[t.type] || 'bg-gray-100 text-gray-600'}`}>{t.type}</span>
                  {t.body && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{t.body}</p>}
                  {t.mediaPath && <p className="text-xs text-blue-500 mt-1">📎 Mídia anexada</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-4 border-b font-semibold">{modal.template ? 'Editar Template' : 'Novo Template'}</div>
            <form onSubmit={submit} className="p-4 space-y-3">
              <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div>
                <label className="label">Tipo</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.keys(typeIcons).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Texto / Legenda</label>
                <textarea className="input h-28 resize-none" placeholder="Use {nome}, {curso} para variáveis..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
              </div>
              {form.type !== 'text' && (
                <div>
                  <label className="label">Arquivo de Mídia</label>
                  <input type="file" className="input"
                    accept={form.type === 'audio' ? 'audio/*' : form.type === 'video' ? 'video/*' : form.type === 'image' ? 'image/*' : '*'}
                    onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  {modal.template?.mediaPath && !file && <p className="text-xs text-blue-500 mt-1">Arquivo atual: {modal.template.mediaPath}</p>}
                </div>
              )}
              <div>
                <label className="label">Variáveis (separadas por vírgula)</label>
                <input className="input" placeholder="nome, curso, data" value={form.variables} onChange={(e) => setForm({ ...form, variables: e.target.value })} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal({ open: false })} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={saveMut.isPending}>{saveMut.isPending ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

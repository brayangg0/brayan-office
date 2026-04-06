import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getContacts, createContact, updateContact, deleteContact, importContactsCsv } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Search, Pencil, Trash2, UserCheck, Phone, Upload, Download } from 'lucide-react';

export default function Contacts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; contact?: any }>({ open: false });
  const [importModal, setImportModal] = useState(false);
  const [totalUploaded, setTotalUploaded] = useState(0);
  const [form, setForm] = useState({ name: '', phone: '', email: '', tags: '', notes: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search],
    queryFn: () => getContacts({ search, limit: 100 }),
  });

  const saveMut = useMutation({
    mutationFn: (d: any) => modal.contact ? updateContact(modal.contact.id, d) : createContact(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); setModal({ open: false }); toast.success('Contato salvo!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao salvar'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteContact,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contacts'] }); toast.success('Contato removido'); },
    onError: () => toast.error('Erro ao remover'),
  });

  const importMut = useMutation({
    mutationFn: importContactsCsv,
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      const msg = `✅ ${data.created} contatos importados${data.skipped > 0 ? ` (${data.skipped} pulados)` : ''}`;
      toast.success(msg);
      setTotalUploaded(data.created);
      setImportModal(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao importar'),
  });

  const openModal = (contact?: any) => {
    setForm(contact
      ? { name: contact.name, phone: contact.phone, email: contact.email || '', tags: JSON.parse(contact.tags || '[]').join(', '), notes: contact.notes || '' }
      : { name: '', phone: '', email: '', tags: '', notes: '' }
    );
    setModal({ open: true, contact });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMut.mutate({ ...form, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean) });
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.csv')) {
      toast.error('Por favor selecione um arquivo CSV');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máximo 5MB)');
      return;
    }
    
    importMut.mutate(file);
  };

  const downloadTemplate = () => {
    const csv = 'Nome,Telefone,Email,Tags\nJoão Silva,5511999999999,joao@email.com,cliente;novo\nMaria Santos,5511988888888,maria@email.com,cliente;quente';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template-contatos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusBadge = (s: string) => ({
    active: 'badge bg-green-100 text-green-700',
    blocked: 'badge bg-red-100 text-red-700',
    inactive: 'badge bg-gray-100 text-gray-500',
  }[s] || 'badge bg-gray-100 text-gray-500');

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contatos</h1>
        <div className="flex gap-2">
          <button onClick={() => setImportModal(true)} className="btn-secondary flex items-center gap-2">
            <Upload size={16} /> Importar CSV
          </button>
          <button onClick={() => openModal()} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> Novo Contato
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 card !p-3">
        <Search size={16} className="text-gray-400 shrink-0" />
        <input className="flex-1 text-sm outline-none" placeholder="Buscar por nome, telefone ou e-mail..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Nome', 'Telefone', 'Tags', 'Status', 'Aluno', ''].map((h) => (
                <th key={h} className="text-left py-3 px-4 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : data?.contacts?.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">Nenhum contato encontrado</td></tr>
            ) : data?.contacts?.map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="py-3 px-4 font-medium">{c.name}</td>
                <td className="py-3 px-4 text-gray-500 flex items-center gap-1">
                  <Phone size={12} /> {c.phone}
                </td>
                <td className="py-3 px-4">
                  {JSON.parse(c.tags || '[]').map((t: string) => (
                    <span key={t} className="badge bg-blue-100 text-blue-700 mr-1">{t}</span>
                  ))}
                </td>
                <td className="py-3 px-4"><span className={statusBadge(c.status)}>{c.status}</span></td>
                <td className="py-3 px-4">
                  {c.student && <span className="badge bg-green-100 text-green-700 flex items-center gap-1 w-fit"><UserCheck size={10} /> {c.student.course?.name || 'Aluno'}</span>}
                </td>
                <td className="py-3 px-4">
                  <div className="flex gap-2">
                    <button onClick={() => openModal(c)} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm('Remover contato?')) deleteMut.mutate(c.id); }} className="p-1.5 hover:bg-red-50 rounded text-red-400"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && <div className="px-4 py-3 border-t text-xs text-gray-400">{data.total} contatos</div>}
      </div>

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b font-semibold">{modal.contact ? 'Editar Contato' : 'Novo Contato'}</div>
            <form onSubmit={submit} className="p-4 space-y-3">
              <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div><label className="label">Telefone * (com DDD)</label><input className="input" placeholder="11999999999" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required /></div>
              <div><label className="label">E-mail</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><label className="label">Tags (separadas por vírgula)</label><input className="input" placeholder="aluno, turma-A" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
              <div><label className="label">Notas</label><textarea className="input h-20 resize-none" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal({ open: false })} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={saveMut.isPending}>{saveMut.isPending ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Importação */}
      {importModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b font-semibold">Importar Contatos via CSV</div>
            <div className="p-4 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
                <p className="font-medium text-blue-900 mb-2">📋 Formato esperado:</p>
                <p className="text-blue-800 font-mono text-xs mb-2 bg-white p-2 rounded border border-blue-100">Nome,Telefone,Email,Tags</p>
                <ul className="text-blue-800 text-xs space-y-1 mb-3">
                  <li>• <strong>Nome:</strong> nome do contato</li>
                  <li>• <strong>Telefone:</strong> com DDD (ex: 5511999999999)</li>
                  <li>• <strong>Email:</strong> opcional</li>
                  <li>• <strong>Tags:</strong> separadas por ponto-e-vírgula (ex: cliente;novo)</li>
                </ul>
                <button onClick={downloadTemplate} className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-medium">
                  <Download size={12} /> Baixar template
                </button>
              </div>

              <div className={`border-2 border-dashed rounded-lg p-6 text-center transition ${importMut.isPending ? 'border-gray-300 bg-gray-50' : 'border-gray-300 hover:border-blue-400'}`}>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCsv}
                  disabled={importMut.isPending}
                  className="hidden"
                  id="csv-upload"
                />
                <label htmlFor="csv-upload" className={`cursor-pointer block ${importMut.isPending ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {importMut.isPending ? (
                    <>
                      <div className="animate-spin inline-block w-6 h-6 mb-2 border-2 border-blue-300 border-t-blue-600 rounded-full"></div>
                      <p className="text-sm font-medium text-gray-600">Importando contatos...</p>
                    </>
                  ) : (
                    <>
                      <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                      <p className="text-sm font-medium">Clique ou arraste um arquivo CSV</p>
                      <p className="text-xs text-gray-400 mt-1">Máximo 5MB</p>
                    </>
                  )}
                </label>
              </div>

              {totalUploaded > 0 && (
                <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800 flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  <div>
                    <strong>{totalUploaded} contato(s) importado(s) com sucesso!</strong>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setImportModal(false); setTotalUploaded(0); }}
                  className="btn-secondary flex-1"
                  disabled={importMut.isPending}
                >
                  {totalUploaded > 0 ? 'Fechar' : 'Cancelar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

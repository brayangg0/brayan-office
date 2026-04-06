import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getStudents, getContacts, getCourses, createStudent, updateStudent, uploadStudentRg } from '../services/api';
import toast from 'react-hot-toast';
import { Plus, Search, Upload, Eye, GraduationCap, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function Students() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; student?: any }>({ open: false });
  const [rgModal, setRgModal] = useState<{ open: boolean; studentId?: string }>({ open: false });
  const [rgFile, setRgFile] = useState<File | null>(null);
  const [form, setForm] = useState({ contactId: '', courseId: '', cpf: '', rg: '', expiresAt: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['students', search],
    queryFn: () => getStudents({ search, limit: 100 }),
  });

  const { data: contacts } = useQuery({ queryKey: ['contacts-list'], queryFn: () => getContacts({ limit: 500 }) });
  const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: getCourses });

  const saveMut = useMutation({
    mutationFn: (d: any) => modal.student ? updateStudent(modal.student.id, d) : createStudent(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['students'] }); setModal({ open: false }); toast.success('Aluno salvo!'); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao salvar'),
  });

  const rgMut = useMutation({
    mutationFn: () => uploadStudentRg(rgModal.studentId!, rgFile!),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['students'] });
      setRgModal({ open: false });
      setRgFile(null);
      toast.success(`RG processado! ${d.rgData.nome ? `Nome: ${d.rgData.nome}` : ''}`);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Erro ao processar RG'),
  });

  const statusColor = { active: 'text-green-600 bg-green-100', completed: 'text-blue-600 bg-blue-100', suspended: 'text-red-600 bg-red-100' };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Alunos</h1>
        <button onClick={() => { setForm({ contactId: '', courseId: '', cpf: '', rg: '', expiresAt: '' }); setModal({ open: true }); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> Matricular Aluno
        </button>
      </div>

      <div className="flex items-center gap-3 card !p-3">
        <Search size={16} className="text-gray-400" />
        <input className="flex-1 text-sm outline-none" placeholder="Buscar aluno..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="card !p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Aluno', 'Telefone', 'Curso', 'CPF', 'Validade', 'Status', 'RG', ''].map((h) => (
                <th key={h} className="text-left py-3 px-4 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : data?.students?.map((s: any) => {
              const expired = s.expiresAt && new Date(s.expiresAt) < new Date();
              const expiringSoon = s.expiresAt && !expired && new Date(s.expiresAt) < new Date(Date.now() + 30 * 864e5);
              return (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <p className="font-medium">{s.contact.name}</p>
                    <p className="text-xs text-gray-400">{s.contact.email}</p>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{s.contact.phone}</td>
                  <td className="py-3 px-4">{s.course?.name || <span className="text-gray-300">—</span>}</td>
                  <td className="py-3 px-4 text-gray-500">{s.cpf || '—'}</td>
                  <td className="py-3 px-4">
                    {s.expiresAt ? (
                      <span className={`flex items-center gap-1 text-xs ${expired ? 'text-red-600' : expiringSoon ? 'text-yellow-600' : 'text-gray-500'}`}>
                        {(expired || expiringSoon) && <AlertTriangle size={12} />}
                        {format(new Date(s.expiresAt), 'dd/MM/yyyy')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`badge ${(statusColor as any)[s.status] || 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                  </td>
                  <td className="py-3 px-4">
                    {s.rgPhotoPath
                      ? <a href={s.rgPhotoPath} target="_blank" className="text-whatsapp text-xs flex items-center gap-1"><Eye size={12} /> Ver RG</a>
                      : <button onClick={() => setRgModal({ open: true, studentId: s.id })} className="text-xs text-blue-500 flex items-center gap-1"><Upload size={12} /> Enviar RG</button>
                    }
                  </td>
                  <td className="py-3 px-4">
                    <button onClick={() => { setForm({ contactId: s.contactId, courseId: s.courseId || '', cpf: s.cpf || '', rg: s.rg || '', expiresAt: s.expiresAt?.slice(0, 10) || '' }); setModal({ open: true, student: s }); }}
                      className="text-xs text-gray-400 hover:text-gray-700">Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && <div className="px-4 py-3 border-t text-xs text-gray-400">{data.total} alunos</div>}
      </div>

      {/* Modal Matrícula */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-4 border-b font-semibold flex items-center gap-2"><GraduationCap size={18} /> {modal.student ? 'Editar Matrícula' : 'Nova Matrícula'}</div>
            <form onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }} className="p-4 space-y-3">
              {!modal.student && (
                <div>
                  <label className="label">Contato *</label>
                  <select className="input" value={form.contactId} onChange={(e) => setForm({ ...form, contactId: e.target.value })} required>
                    <option value="">Selecione um contato...</option>
                    {contacts?.contacts?.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">Curso</label>
                <select className="input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
                  <option value="">Sem curso</option>
                  {courses?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">CPF</label><input className="input" placeholder="000.000.000-00" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} /></div>
                <div><label className="label">RG</label><input className="input" value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} /></div>
              </div>
              <div><label className="label">Validade do Acesso</label><input className="input" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal({ open: false })} className="btn-secondary flex-1">Cancelar</button>
                <button type="submit" className="btn-primary flex-1" disabled={saveMut.isPending}>{saveMut.isPending ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal RG */}
      {rgModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="p-4 border-b font-semibold flex items-center gap-2"><Upload size={18} /> Enviar Foto do RG</div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-500">Envie uma foto nítida do RG. O sistema extrairá os dados automaticamente via OCR.</p>
              <input type="file" accept="image/*" className="input" onChange={(e) => setRgFile(e.target.files?.[0] || null)} />
              <div className="flex gap-3">
                <button onClick={() => setRgModal({ open: false })} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={() => rgMut.mutate()} className="btn-primary flex-1" disabled={!rgFile || rgMut.isPending}>
                  {rgMut.isPending ? 'Processando OCR...' : 'Enviar e Processar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

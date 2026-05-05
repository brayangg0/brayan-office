import { useQuery } from '@tanstack/react-query';
import { getContacts, getStudents, getCampaigns, getWhatsAppStatus, getSchedules } from '../services/api';
import { Users, GraduationCap, Megaphone, Calendar, Wifi, WifiOff, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="card flex items-center gap-3 p-4 md:p-6">
      <div className={`p-2 md:p-3 rounded-xl ${color} shrink-0`}><Icon size={20} className="text-white md:w-6 md:h-6" /></div>
      <div>
        <p className="text-xl md:text-2xl font-bold">{value.toLocaleString()}</p>
        <p className="text-xs md:text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: contactsData } = useQuery({ queryKey: ['contacts', 'count'], queryFn: () => getContacts({ limit: 1 }) });
  const { data: studentsData } = useQuery({ queryKey: ['students', 'count'], queryFn: () => getStudents({ limit: 1 }) });
  const { data: campaignsData } = useQuery({ queryKey: ['campaigns', 'count'], queryFn: () => getCampaigns({ limit: 1 }) });
  const { data: waStatus } = useQuery({ queryKey: ['whatsapp-status'], queryFn: getWhatsAppStatus, refetchInterval: 10000 });
  const { data: schedules } = useQuery({ queryKey: ['schedules', 'pending'], queryFn: () => getSchedules({ status: 'pending' }) });
  const { data: campaigns } = useQuery({ queryKey: ['campaigns', 'recent'], queryFn: () => getCampaigns({ limit: 5 }) });

  const chartData = campaigns?.campaigns?.map((c: any) => ({
    name: c.name.substring(0, 15),
    enviados: c.totalSent,
    falhas: c.totalFailed,
  })) || [];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-xs md:text-sm">Visão geral do sistema</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium self-start sm:self-auto ${
          waStatus?.status === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
        }`}>
          {waStatus?.status === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
          {waStatus?.status === 'connected' ? `WhatsApp: ${waStatus.phone}` : 'WhatsApp desconectado'}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Contatos" value={contactsData?.total || 0} icon={Users} color="bg-blue-500" />
        <StatCard label="Alunos" value={studentsData?.total || 0} icon={GraduationCap} color="bg-whatsapp" />
        <StatCard label="Campanhas" value={campaignsData?.total || 0} icon={Megaphone} color="bg-purple-500" />
        <StatCard label="Agendamentos" value={schedules?.length || 0} icon={Calendar} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Gráfico */}
        <div className="card !p-4 md:!p-6">
          <h2 className="font-semibold mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
            <TrendingUp size={16} className="text-whatsapp md:w-[18px] md:h-[18px]" /> Campanhas Recentes
          </h2>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="enviados" fill="#25D366" radius={[4, 4, 0, 0]} name="Enviados" />
                <Bar dataKey="falhas" fill="#ef4444" radius={[4, 4, 0, 0]} name="Falhas" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-400 text-sm text-center py-10">Nenhuma campanha ainda</p>
          )}
        </div>

        {/* Agendamentos pendentes */}
        <div className="card !p-4 md:!p-6">
          <h2 className="font-semibold mb-3 md:mb-4 flex items-center gap-2 text-sm md:text-base">
            <Calendar size={16} className="text-whatsapp md:w-[18px] md:h-[18px]" /> Próximos Agendamentos
          </h2>
          {schedules && schedules.length > 0 ? (
            <ul className="space-y-2 md:space-y-3">
              {schedules.slice(0, 5).map((s: any) => (
                <li key={s.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 p-2.5 md:p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="text-xs md:text-sm font-medium">{s.targetType}</p>
                    <p className="text-xs text-gray-500">{s.body?.substring(0, 50) || `[${s.type}]`}</p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {new Date(s.scheduledAt).toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-400 text-sm text-center py-10">Nenhum agendamento pendente</p>
          )}
        </div>
      </div>
    </div>
  );
}

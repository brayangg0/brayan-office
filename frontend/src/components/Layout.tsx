import { Outlet, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getWhatsAppStatus } from '../services/api';
import {
  LayoutDashboard, Users, GraduationCap, Megaphone,
  FileText, Calendar, Smartphone, Wifi, WifiOff, Menu, X, Zap, Send
} from 'lucide-react';

const socket = io({ path: '/socket.io' });

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/contacts', icon: Users, label: 'Contatos' },
  { to: '/students', icon: GraduationCap, label: 'Alunos' },
  { to: '/campaigns', icon: Megaphone, label: 'Campanhas' },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/schedule', icon: Calendar, label: 'Agendamentos' },
  { to: '/sequences', icon: Send, label: 'Sequências' },
  { to: '/whatsapp', icon: Smartphone, label: 'WhatsApp' },
  { to: '/automation', icon: Zap, label: 'Automação' },
];

export default function Layout() {
  const [waStatus, setWaStatus] = useState<'connected' | 'disconnected' | 'qr_ready'>('disconnected');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Carrega status inicial do servidor e atualiza a cada 5s
  const { data: statusData } = useQuery({
    queryKey: ['whatsapp-status-layout'],
    queryFn: getWhatsAppStatus,
    refetchInterval: 5000,
  });

  // Sincroniza estado com servidor
  useEffect(() => {
    if (statusData?.status === 'connected') {
      setWaStatus('connected');
    } else if (statusData?.status === 'qr_ready') {
      setWaStatus('qr_ready');
    } else {
      setWaStatus('disconnected');
    }
  }, [statusData?.status]);

  // Socket listeners para atualizações em tempo real
  useEffect(() => {
    socket.on('whatsapp:ready', () => setWaStatus('connected'));
    socket.on('whatsapp:disconnected', () => setWaStatus('disconnected'));
    socket.on('whatsapp:qr', () => setWaStatus('qr_ready'));
    return () => { socket.off('whatsapp:ready'); socket.off('whatsapp:disconnected'); socket.off('whatsapp:qr'); };
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 text-white flex flex-col transition-all duration-300 shrink-0`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          {sidebarOpen && (
            <div>
              <h1 className="font-bold text-lg text-whatsapp">CRM WhatsApp</h1>
              <p className="text-xs text-gray-400">Treinamentos</p>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* WhatsApp status badge */}
        <div className={`mx-3 my-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
          waStatus === 'connected' ? 'bg-green-900/50 text-green-400' :
          waStatus === 'qr_ready' ? 'bg-yellow-900/50 text-yellow-400' :
          'bg-red-900/50 text-red-400'
        }`}>
          {waStatus === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
          {sidebarOpen && (
            <span>{waStatus === 'connected' ? 'Conectado' : waStatus === 'qr_ready' ? 'Aguard. QR' : 'Desconectado'}</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 space-y-1 px-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-whatsapp text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }>
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

import { Outlet, NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { getWhatsAppStatus } from '../services/api';
import {
  LayoutDashboard, Users, GraduationCap, Megaphone,
  FileText, Calendar, Smartphone, Wifi, WifiOff, Menu, X, Zap, Send
} from 'lucide-react';

export const socket = io({ path: '/socket.io' });

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const sidebarContent = (onNavClick?: () => void) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        {sidebarOpen && (
          <div>
            <h1 className="font-bold text-lg text-whatsapp">Brayan Office</h1>
            <p className="text-xs text-gray-400">CRM WhatsApp</p>
          </div>
        )}
        {!onNavClick && (
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}
        {onNavClick && (
          <div className="flex items-center justify-between w-full">
            <div>
              <h1 className="font-bold text-lg text-whatsapp">Brayan Office</h1>
              <p className="text-xs text-gray-400">CRM WhatsApp</p>
            </div>
            <button onClick={onNavClick} className="text-gray-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
        )}
      </div>

      {/* WhatsApp status badge */}
      <div className={`mx-3 my-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${waStatus === 'connected' ? 'bg-green-900/50 text-green-400' :
          waStatus === 'qr_ready' ? 'bg-yellow-900/50 text-yellow-400' :
            'bg-red-900/50 text-red-400'
        }`}>
        {waStatus === 'connected' ? <Wifi size={14} /> : <WifiOff size={14} />}
        {(sidebarOpen || onNavClick) && (
          <span>{waStatus === 'connected' ? 'Conectado' : waStatus === 'qr_ready' ? 'Aguard. QR' : 'Desconectado'}</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} onClick={onNavClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-whatsapp text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }>
            <Icon size={18} className="shrink-0" />
            {(sidebarOpen || onNavClick) && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white flex flex-col transition-transform duration-300 md:hidden ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {sidebarContent(() => setMobileOpen(false))}
      </aside>

      {/* Desktop sidebar */}
      <aside className={`hidden md:flex ${sidebarOpen ? 'w-64' : 'w-16'} bg-gray-900 text-white flex-col transition-all duration-300 shrink-0`}>
        {sidebarContent()}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button onClick={() => setMobileOpen(true)} className="text-gray-600 hover:text-gray-900 p-1">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-base text-whatsapp">Brayan Office</h1>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${waStatus === 'connected' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {waStatus === 'connected' ? <Wifi size={12} /> : <WifiOff size={12} />}
          </div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

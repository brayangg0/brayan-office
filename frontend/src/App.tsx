import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Students from './pages/Students';
import Campaigns from './pages/Campaigns';
import Templates from './pages/Templates';
import Schedule from './pages/Schedule';
import Sequences from './pages/Sequences';
import WhatsAppSetup from './pages/WhatsAppSetup';
import Automation from './pages/Automation';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="students" element={<Students />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="templates" element={<Templates />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="sequences" element={<Sequences />} />
          <Route path="whatsapp" element={<WhatsAppSetup />} />
          <Route path="automation" element={<Automation />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

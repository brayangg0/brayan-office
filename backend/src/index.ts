import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import http from 'http';
import { Server as SocketIO } from 'socket.io';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

import { prisma } from './services/database';
import { whatsappService } from './services/whatsapp.service';
import { schedulerService } from './services/scheduler.service';
import { sequenceService } from './services/sequence.service';

// Rotas
import authRoutes from './routes/auth';
import contactRoutes from './routes/contacts';
import studentRoutes from './routes/students';
import campaignRoutes from './routes/campaigns';
import messageRoutes from './routes/messages';
import whatsappRoutes from './routes/whatsapp';
import courseRoutes from './routes/courses';
import templateRoutes from './routes/templates';
import scheduleRoutes from './routes/schedules';
import automationRoutes from './routes/automation';
import sequenceRoutes from './routes/sequences';
import { setSocketIO } from './services/whatsapp.service';

const app = express();
const server = http.createServer(app);

// Socket.IO para comunicação em tempo real (QR Code, status WhatsApp)
export const io = new SocketIO(server, {
  cors: { origin: '*', credentials: true } // Alterado para permitir ngrok/rede
});

// Middlewares
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: '*', credentials: true })); // Alterado para permitir ngrok/rede
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos de upload
const UPLOADS_PATH = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(UPLOADS_PATH));
console.log(`[Server] Servindo uploads de: ${UPLOADS_PATH}`);

// Rotas da API
app.use('/api/auth',        authRoutes);
app.use('/api/contacts',    contactRoutes);
app.use('/api/students',    studentRoutes);
app.use('/api/campaigns',   campaignRoutes);
app.use('/api/messages',    messageRoutes);
app.use('/api/whatsapp',    whatsappRoutes);
app.use('/api/courses',     courseRoutes);
app.use('/api/templates',   templateRoutes);
app.use('/api/schedules',   scheduleRoutes);
app.use('/api/automation',  automationRoutes);
app.use('/api/sequences',   sequenceRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend em produção (Railway)
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(process.cwd(), '..', 'frontend', 'dist');
  app.use(express.static(frontendDistPath));
  // Qualquer rota que não seja /api serve o index.html do React
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
  console.log(`[Server] Servindo frontend de: ${frontendDistPath}`);
}

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});

// Socket.IO events
io.on('connection', (socket) => {
  console.log('[Socket] Cliente conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('[Socket] Cliente desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3333;

async function bootstrap() {
  try {
    await prisma.$connect();
    console.log('[DB] Conectado ao banco de dados');

    // Passa o Socket.IO para o serviço WhatsApp
    setSocketIO(io);

    // Inicializa WhatsApp em background
    whatsappService.initialize();
    console.log('[WhatsApp] Serviço iniciado');

    // Inicializa o scheduler de mensagens
    await schedulerService.initialize();
    console.log('[Scheduler] Agendador iniciado');

    // Inicializa o serviço de autorrespostas (Bot) e timers de inatividade
    const { autoResponseService } = await import('./services/autoresponse.service');
    await autoResponseService.initialize();
    console.log('[AutoResponse] Bot de atendimento iniciado');

    // Recarrega sequências agendadas
    await sequenceService.reloadSchedules();
    console.log('[Sequence] Sequências agendadas recarregadas');

    server.listen(PORT, () => {
      console.log(`\n🚀 Servidor rodando em http://localhost:${PORT}`);
      console.log(`📊 API disponível em http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('[Bootstrap] Erro ao iniciar:', error);
    process.exit(1);
  }
}

bootstrap();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[Shutdown] Encerrando servidor...');
  await whatsappService.destroy();
  await prisma.$disconnect();
  process.exit(0);
});

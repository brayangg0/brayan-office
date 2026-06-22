import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import { prisma } from '../services/database';
import { uploadMedia } from '../middleware/upload';
import path from 'path';

const router = Router();

// GET /api/whatsapp/status
router.get('/status', async (_req, res) => {
  const session = await prisma.whatsAppSession.findUnique({ where: { id: 'default' } });
  const status = whatsappService.getStatus();
  const isReady = status.isReady;
  const qrAgeMs = session?.updatedAt ? Date.now() - new Date(session.updatedAt).getTime() : Number.POSITIVE_INFINITY;
  const hasFreshQr = !!session?.qrCode && session.status === 'qr_ready' && qrAgeMs < 45_000;
  const effectiveStatus = isReady
    ? (session?.status || 'connected')
    : status.isAuthenticated
      ? 'authenticated'
      : hasFreshQr
        ? 'qr_ready'
        : (status.hasClient || status.isInitializing ? 'connecting' : 'disconnected');
  res.json({
    ...session,
    status: effectiveStatus,
    isReady,
    isAuthenticated: status.isAuthenticated,
    isInitializing: status.isInitializing,
    lastError: status.lastError,
    retryAfterSeconds: status.retryAfterSeconds,
  });
});

// GET /api/whatsapp/qr - Obtém QR code atual ou força novo
router.get('/qr', async (_req, res) => {
  try {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: 'default' } });
    const qrAgeMs = session?.updatedAt ? Date.now() - new Date(session.updatedAt).getTime() : Number.POSITIVE_INFINITY;
    const hasFreshQr = !!session?.qrCode && session.status === 'qr_ready' && qrAgeMs < 45_000;

    if (hasFreshQr) {
      return res.json({
        qr: session!.qrCode,
        expiresIn: Math.max(0, Math.ceil((45_000 - qrAgeMs) / 1000)),
      });
    }

    const currentStatus = whatsappService.getStatus();
    if (currentStatus.isReady) {
      return res.status(404).json({ error: 'WhatsApp ja esta conectado' });
    }

    if (currentStatus.retryAfterSeconds > 0) {
      return res.status(202).json({
        message: currentStatus.lastError || 'Sessao em recuperacao. Aguarde alguns segundos.',
        retry: true,
        retryAfterSeconds: currentStatus.retryAfterSeconds,
      });
    }

    if (currentStatus.isInitializing || currentStatus.hasClient) {
      return res.status(202).json({
        message: 'Gerando novo QR Code, aguarde alguns segundos...',
        retry: true,
      });
    }

    console.log('[WhatsApp] Iniciando cliente para gerar novo QR Code');
    setTimeout(() => whatsappService.initialize(), 0);
    return res.status(202).json({
      message: 'Gerando novo QR Code, aguarde alguns segundos...',
      retry: true,
    });
  } catch (err: any) {
    console.error('[WhatsApp] Erro ao obter QR:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/restart
router.post('/restart', async (_req, res) => {
  await whatsappService.destroy();
  setTimeout(() => whatsappService.initialize(), 1000);
  res.json({ message: 'Reiniciando conexão WhatsApp...' });
});

// POST /api/whatsapp/logout
router.post('/logout', async (_req, res) => {
  await whatsappService.logout();
  res.json({ message: 'Desconectado do WhatsApp' });
});

// POST /api/whatsapp/send - Envio direto
router.post('/send', uploadMedia.single('media'), async (req, res) => {
  const { to, body, type = 'text', caption } = req.body;
  if (!to) return res.status(400).json({ error: 'Campo "to" é obrigatório (número ou groupId)' });

  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });

  const isGroup = to.includes('@g.us') || req.body.isGroup === 'true';

  if (type === 'text') {
    if (!body) return res.status(400).json({ error: 'Campo "body" é obrigatório para mensagens de texto' });
    if (isGroup) await whatsappService.sendToGroup(to, body);
    else await whatsappService.sendText(to, body);
  } else {
    if (!req.file) return res.status(400).json({ error: 'Arquivo de mídia não enviado' });
    const filePath = req.file.path;
    if (isGroup) await whatsappService.sendMediaToGroup(to, filePath, caption);
    else await whatsappService.sendMedia(to, filePath, caption);
  }

  // NOVO: Salva a mensagem no histórico do banco de dados
  try {
    const phone = to.replace(/@c\.us|@g\.us/, '');
    const contact = await prisma.contact.findUnique({ where: { phone } });

    if (contact) {
    }
  } catch (err) {
    console.error('[WhatsApp Route] Erro ao salvar histórico:', err);
  }

  res.json({ message: 'Mensagem enviada com sucesso' });
});

// GET /api/whatsapp/chats - Lista chats ao vivo do WhatsApp (contatos + grupos)
router.get('/chats', async (_req, res) => {
  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });
  const chats = await whatsappService.getLiveChats();
  res.json(chats);
});

// GET /api/whatsapp/chats/:chatId/messages - Mensagens de um chat específico
router.get('/chats/:chatId/messages', async (req, res) => {
  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });
  const { chatId } = req.params;
  const limit = parseInt(String(req.query.limit || '30'), 10);
  const messages = await whatsappService.getLiveChatMessages(decodeURIComponent(chatId), limit);
  res.json(messages);
});

// POST /api/whatsapp/send-message - Envia mensagem para um chat
router.post('/send-message', async (req, res) => {
  const { chatId, message } = req.body;
  if (!chatId || !message) return res.status(400).json({ error: 'Campos "chatId" e "message" são obrigatórios' });
  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });
  const result = await whatsappService.sendLiveMessage(chatId, message);
  res.json(result);
});

// GET /api/whatsapp/contacts - Lista contatos ao vivo do WhatsApp
router.get('/contacts', async (_req, res) => {
  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });
  const contacts = await whatsappService.getLiveContacts();
  res.json(contacts);
});

// GET /api/whatsapp/groups - Lista grupos sincronizados
router.get('/groups', async (_req, res) => {
  const groups = await prisma.whatsAppGroup.findMany({ orderBy: { name: 'asc' } });
  res.json(groups);
});

// POST /api/whatsapp/groups/sync - Sincroniza grupos do WhatsApp
router.post('/groups/sync', async (_req, res) => {
  await whatsappService.syncGroups();
  const groups = await prisma.whatsAppGroup.findMany({ orderBy: { name: 'asc' } });
  res.json({ message: `${groups.length} grupos sincronizados`, groups });
});

// POST /api/whatsapp/chats/sync - Sincroniza contatos e mensagens antigas
router.post('/chats/sync', async (_req, res) => {
  const result = await whatsappService.syncContactsAndChats();
  if (result?.error) return res.status(400).json(result);
  res.json(result);
});

// POST /api/whatsapp/groups/:id/toggle - Alterna disponibilidade do grupo
router.post('/groups/:id/toggle', async (req, res) => {
  const { id } = req.params;
  const group = await prisma.whatsAppGroup.findUnique({ where: { id } });
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });
  
  const updated = await prisma.whatsAppGroup.update({
    where: { id },
    data: { active: !group.active }
  });
  res.json({ message: 'Status atualizado com sucesso', active: updated.active });
});

export default router;

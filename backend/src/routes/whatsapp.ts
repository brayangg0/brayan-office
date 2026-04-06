import { Router } from 'express';
import { whatsappService } from '../services/whatsapp.service';
import { prisma } from '../services/database';
import { uploadMedia } from '../middleware/upload';
import path from 'path';

const router = Router();

// GET /api/whatsapp/status
router.get('/status', async (_req, res) => {
  const session = await prisma.whatsAppSession.findUnique({ where: { id: 'default' } });
  const { isReady } = whatsappService.getStatus();
  res.json({ ...session, isReady });
});

// GET /api/whatsapp/qr - Obtém QR code atual
router.get('/qr', async (_req, res) => {
  const session = await prisma.whatsAppSession.findUnique({ where: { id: 'default' } });
  if (!session?.qrCode) return res.status(404).json({ error: 'QR Code não disponível' });
  res.json({ qr: session.qrCode });
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

  res.json({ message: 'Mensagem enviada com sucesso' });
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

export default router;

import { Router } from 'express';
import { prisma } from '../services/database';
import { whatsappService } from '../services/whatsapp.service';
import { uploadMedia } from '../middleware/upload';

const router = Router();

// GET /api/messages - Histórico geral
router.get('/', async (req, res) => {
  const { contactId, direction, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where: any = {};
  if (contactId) where.contactId = contactId;
  if (direction) where.direction = direction;

  const [messages, total] = await Promise.all([
    prisma.message.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }, include: { contact: { select: { name: true, phone: true } } } }),
    prisma.message.count({ where }),
  ]);
  res.json({ messages, total });
});

// GET /api/messages/rg-pending - Mensagens de RG não processadas
router.get('/rg-pending', async (_req, res) => {
  const messages = await prisma.message.findMany({
    where: { isRgData: true, rgProcessed: false },
    include: { contact: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(messages);
});

// GET /api/messages/contact/:contactId - Histórico de mensagens com um contato
router.get('/contact/:contactId', async (req, res) => {
  const { contactId } = req.params;
  const { page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { contactId },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'asc' },
    }),
    prisma.message.count({ where: { contactId } }),
  ]);

  res.json({ messages, total, contact });
});

// GET /api/messages/group/:groupId - Histórico de mensagens de um grupo (enviadas pelo sistema)
router.get('/group/:groupId', async (req, res) => {
  const { groupId } = req.params;
  const { page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const group = await prisma.whatsAppGroup.findUnique({ where: { id: groupId } });
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  // Busca mensagens enviadas para este grupo (armazenadas com groupId no body como referência)
  // Como o modelo Message não tem groupId, buscamos pelo whatsappId que contém o groupId
  const waGroupId = group.groupId; // ex: 1234567890@g.us
  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: {
        OR: [
          { whatsappId: { contains: waGroupId.split('@')[0] } },
          { body: { contains: `[Grupo: ${group.name}]` } },
        ],
        direction: 'outbound',
      },
      skip,
      take: parseInt(limit),
      orderBy: { createdAt: 'asc' },
    }),
    prisma.message.count({
      where: {
        OR: [
          { whatsappId: { contains: waGroupId.split('@')[0] } },
          { body: { contains: `[Grupo: ${group.name}]` } },
        ],
        direction: 'outbound',
      },
    }),
  ]);

  res.json({ messages, total, group });
});

// POST /api/messages/send-to-contact - Envia mensagem para um contato
router.post('/send-to-contact', uploadMedia.single('media'), async (req, res) => {
  const { contactId, type = 'text', body, caption } = req.body;

  if (!contactId) return res.status(400).json({ error: 'contactId é obrigatório' });

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });

  let mediaPath: string | null = null;
  let messageType = type;

  try {
    if (type === 'text') {
      if (!body) return res.status(400).json({ error: 'body é obrigatório para mensagens de texto' });
      await whatsappService.sendText(contact.phone, body);
    } else {
      if (!req.file) return res.status(400).json({ error: 'Arquivo de mídia não enviado' });
      const filePath = req.file.path;
      mediaPath = `/uploads/media/${req.file.filename}`;
      // Detecta tipo pelo mimetype se não informado
      const mime = req.file.mimetype;
      if (mime.startsWith('image/')) messageType = 'image';
      else if (mime.startsWith('audio/')) messageType = 'audio';
      else if (mime.startsWith('video/')) messageType = 'video';
      else messageType = 'document';
      await whatsappService.sendMedia(contact.phone, filePath, caption || body);
    }

    // Persiste a mensagem no banco
    const message = await prisma.message.create({
      data: {
        contactId: contact.id,
        direction: 'outbound',
        type: messageType,
        body: body || caption || (mediaPath ? '[Mídia]' : ''),
        mediaPath,
        status: 'sent',
      },
    });

    res.json({ success: true, messageId: message.id, status: message.status });
  } catch (err: any) {
    console.error('[Messages Route] Erro ao enviar para contato:', err.message);
    res.status(500).json({ error: err.message || 'Erro ao enviar mensagem' });
  }
});

// POST /api/messages/send-to-group - Envia mensagem para um grupo
router.post('/send-to-group', uploadMedia.single('media'), async (req, res) => {
  const { groupId, type = 'text', body, caption } = req.body;

  if (!groupId) return res.status(400).json({ error: 'groupId é obrigatório' });

  const group = await prisma.whatsAppGroup.findUnique({ where: { id: groupId } });
  if (!group) return res.status(404).json({ error: 'Grupo não encontrado' });

  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });

  let mediaPath: string | null = null;
  let messageType = type;

  try {
    if (type === 'text') {
      if (!body) return res.status(400).json({ error: 'body é obrigatório para mensagens de texto' });
      await whatsappService.sendToGroup(group.groupId, body);
    } else {
      if (!req.file) return res.status(400).json({ error: 'Arquivo de mídia não enviado' });
      const filePath = req.file.path;
      mediaPath = `/uploads/media/${req.file.filename}`;
      const mime = req.file.mimetype;
      if (mime.startsWith('image/')) messageType = 'image';
      else if (mime.startsWith('audio/')) messageType = 'audio';
      else if (mime.startsWith('video/')) messageType = 'video';
      else messageType = 'document';
      await whatsappService.sendMediaToGroup(group.groupId, filePath, caption || body);
    }

    // Para grupos, usamos o primeiro contato disponível como referência (ou criamos um registro especial)
    // Como o modelo Message requer contactId, buscamos ou criamos um contato "grupo"
    let groupContact = await prisma.contact.findUnique({ where: { phone: group.groupId.split('@')[0] } });
    if (!groupContact) {
      groupContact = await prisma.contact.create({
        data: {
          name: `[Grupo] ${group.name}`,
          phone: group.groupId.split('@')[0],
          status: 'active',
        },
      });
    }

    const message = await prisma.message.create({
      data: {
        contactId: groupContact.id,
        direction: 'outbound',
        type: messageType,
        body: body || caption || (mediaPath ? '[Mídia]' : ''),
        mediaPath,
        whatsappId: group.groupId,
        status: 'sent',
      },
    });

    res.json({ success: true, messageId: message.id, status: message.status });
  } catch (err: any) {
    console.error('[Messages Route] Erro ao enviar para grupo:', err.message);
    res.status(500).json({ error: err.message || 'Erro ao enviar mensagem' });
  }
});

export default router;


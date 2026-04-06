import { Router } from 'express';
import path from 'path';
import { prisma } from '../services/database';
import { sequenceService } from '../services/sequence.service';
import { uploadMedia } from '../middleware/upload';

const router = Router();

async function getSystemUserId(): Promise<string> {
  let user = await prisma.user.findFirst();
  
  if (!user) {
    console.warn('[Sequences] ⚠️ Nenhum usuário encontrado. Criando usuário padrão...');
    user = await prisma.user.create({
      data: {
        name: 'Sistema',
        email: 'sistema@crm.local',
        password: 'admin123',
        role: 'admin',
      },
    });
    console.log('[Sequences] ✅ Usuário padrão criado:', user.id);
  }
  
  return user.id;
}

// GET /api/sequences - Listar todas as sequências
router.get('/', async (req, res) => {
  const { status, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const where: any = status ? { status } : {};

  const [sequences, total] = await Promise.all([
    prisma.messageSequence.findMany({
      where,
      skip,
      take: parseInt(limit as string),
      orderBy: { createdAt: 'desc' },
      include: {
        messages: { orderBy: { order: 'asc' } },
        user: { select: { name: true } },
      },
    }),
    prisma.messageSequence.count({ where }),
  ]);

  res.json({ sequences, total });
});

// GET /api/sequences/:id - Detalhes de uma sequência
router.get('/:id', async (req, res) => {
  const sequence = await prisma.messageSequence.findUnique({
    where: { id: req.params.id },
    include: { messages: { orderBy: { order: 'asc' } } },
  });

  if (!sequence) return res.status(404).json({ error: 'Sequência não encontrada' });
  res.json(sequence);
});

// POST /api/sequences - Criar nova sequência
router.post('/', uploadMedia.any(), async (req, res) => {
  try {
    // Parse de headers corretamente para suportar JSON ou FormData
    let body: any = req.body;
    let messages: any[] = [];

    // Se for FormData, as mensagens vêm como string JSON
    if (typeof body.messages === 'string') {
      messages = JSON.parse(body.messages);
    } else if (Array.isArray(body.messages)) {
      messages = body.messages;
    } else {
      messages = [];
    }

    // Processar arquivos enviados (se houver)
    const filesMap = new Map<number, string>();
    if (req.files && Array.isArray(req.files)) {
      for (const file of req.files) {
        // Nome do campo vem como "file_0", "file_1", etc
        const match = file.fieldname.match(/^file_(\d+)$/);
        if (match) {
          const msgIndex = parseInt(match[1]);
          // Converter caminho absoluto para relativo (uploads/media/uuid.ext)
          const relativePath = path.relative(process.cwd(), file.path);
          filesMap.set(msgIndex, relativePath);
        }
      }
    }

    // Processar mensagens com caminhos de arquivo
    const messageData = messages.map((msg: any, idx: number) => ({
      order: msg.order,
      type: msg.type,
      body: msg.body || null,
      caption: msg.caption || null,
      delayBefore: msg.delayBefore || 2000,
      messageDelay: msg.messageDelay || 3000,
      repeatDays: JSON.stringify(msg.repeatDays || []),
      repeatTimes: JSON.stringify(msg.repeatTimes || []),
      mediaPath: filesMap.get(idx) || null, // Usar o caminho do arquivo se existir
    }));

    const { name, description, targetType, targetId, targetTags, scheduledAt } = body;

    if (!name) return res.status(400).json({ error: 'name é obrigatório' });
    if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt é obrigatório' });
    if (!Array.isArray(messageData) || messageData.length === 0) {
      return res.status(400).json({ error: 'Deve haver pelo menos uma mensagem' });
    }

    const userId = await getSystemUserId();
    
    // Garantir que targetTags é um array
    let tagsArray = [];
    if (Array.isArray(targetTags)) {
      tagsArray = targetTags;
    } else if (typeof targetTags === 'string') {
      try {
        tagsArray = JSON.parse(targetTags);
      } catch {
        tagsArray = [];
      }
    }

    const sequence = await prisma.messageSequence.create({
      data: {
        name,
        description,
        userId,
        targetType,
        targetId,
        targetTags: JSON.stringify(tagsArray),
        scheduledAt: new Date(scheduledAt),
        messages: {
          createMany: {
            data: messageData,
          },
        },
      },
      include: { messages: { orderBy: { order: 'asc' } } },
    });

    // Agendar a sequência
    await sequenceService.scheduleSequence(sequence.id);

    res.status(201).json(sequence);
  } catch (err: any) {
    console.error('[Sequences] ❌ Erro ao criar sequência:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Erro ao criar sequência' });
  }
});

// PUT /api/sequences/:id - Atualizar sequência
router.put('/:id', async (req, res) => {
  const { name, description, status } = req.body;

  const data: any = {};
  if (name) data.name = name;
  if (description !== undefined) data.description = description;
  if (status) data.status = status;

  try {
    const sequence = await prisma.messageSequence.update({
      where: { id: req.params.id },
      data,
      include: { messages: { orderBy: { order: 'asc' } } },
    });
    res.json(sequence);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sequences/:id - Deletar sequência
router.delete('/:id', async (req, res) => {
  try {
    await sequenceService.cancelSequence(req.params.id);
    await prisma.messageSequence.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sequences/:id/send - Enviar sequência agora (sem esperar horário)
router.post('/:id/send', async (req, res) => {
  try {
    await sequenceService.sendSequenceNow(req.params.id);
    res.json({ message: 'Sequência enviada com sucesso' });
  } catch (err: any) {
    console.error('[Sequences] ❌ Erro ao enviar:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sequences/:id/cancel - Cancelar sequência agendada
router.post('/:id/cancel', async (req, res) => {
  try {
    await sequenceService.cancelSequence(req.params.id);
    const sequence = await prisma.messageSequence.findUnique({ where: { id: req.params.id } });
    res.json({ message: 'Sequência cancelada', sequence });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sequences/:id/message - Adicionar mensagem à sequência
router.post('/:id/message', uploadMedia.single('media'), async (req, res) => {
  const { type = 'text', body, caption } = req.body;

  try {
    // Buscar próxima ordem
    const maxOrder = await prisma.sequenceMessage.aggregate({
      where: { sequenceId: req.params.id },
      _max: { order: true },
    });

    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const message = await prisma.sequenceMessage.create({
      data: {
        sequenceId: req.params.id,
        order: nextOrder,
        type,
        body,
        caption,
        mediaPath: req.file ? req.file.path : undefined,
        delayBefore: 2000,
      },
    });

    res.status(201).json(message);
  } catch (err: any) {
    console.error('[Sequences] ❌ Erro ao adicionar mensagem:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sequences/:id/message/:msgId - Atualizar mensagem
router.put('/:id/message/:msgId', uploadMedia.single('media'), async (req, res) => {
  const { type, body, caption, delayBefore } = req.body;

  try {
    const data: any = {};
    if (type) data.type = type;
    if (body !== undefined) data.body = body;
    if (caption !== undefined) data.caption = caption;
    if (delayBefore !== undefined) data.delayBefore = delayBefore;
    if (req.file) data.mediaPath = req.file.path;

    const message = await prisma.sequenceMessage.update({
      where: { id: req.params.msgId },
      data,
    });
    res.json(message);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sequences/:id/message/:msgId - Deletar mensagem
router.delete('/:id/message/:msgId', async (req, res) => {
  try {
    await prisma.sequenceMessage.delete({ where: { id: req.params.msgId } });
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

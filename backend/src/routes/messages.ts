import { Router } from 'express';
import { prisma } from '../services/database';


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

export default router;

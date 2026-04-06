import { Router } from 'express';
import { prisma } from '../services/database';
import { whatsappService } from '../services/whatsapp.service';
import { schedulerService } from '../services/scheduler.service';

const router = Router();

async function getSystemUserId(): Promise<string> {
  const user = await prisma.user.findFirst();
  return user!.id;
}

// GET /api/campaigns
router.get('/', async (req, res) => {
  const { status, page = '1', limit = '20' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const where: any = status ? { status } : {};

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where, skip, take: parseInt(limit),
      orderBy: { createdAt: 'desc' },
      include: { template: true, user: { select: { name: true } }, _count: { select: { sends: true } } },
    }),
    prisma.campaign.count({ where }),
  ]);
  res.json({ campaigns, total });
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: {
      template: true,
      sends: { include: { contact: true, group: true }, take: 100, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
  res.json(campaign);
});

// POST /api/campaigns
router.post('/', async (req, res) => {
  const { name, description, templateId, targetType, targetTags, targetGroups, scheduledAt, sendInterval } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const campaign = await prisma.campaign.create({
    data: {
      name, description,
      templateId: templateId || null,
      userId: await getSystemUserId(),
      targetType: targetType || 'contacts',
      targetTags: JSON.stringify(targetTags || []),
      targetGroups: JSON.stringify(targetGroups || []),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      sendInterval: sendInterval || 3000,
    },
    include: { template: true },
  });
  res.status(201).json(campaign);
});

// PUT /api/campaigns/:id
router.put('/:id', async (req, res) => {
  const { name, description, templateId, targetType, targetTags, targetGroups, scheduledAt, sendInterval, status } = req.body;
  const data: any = {};
  if (name) data.name = name;
  if (description !== undefined) data.description = description;
  if (templateId !== undefined) data.templateId = templateId;
  if (targetType) data.targetType = targetType;
  if (targetTags !== undefined) data.targetTags = JSON.stringify(targetTags);
  if (targetGroups !== undefined) data.targetGroups = JSON.stringify(targetGroups);
  if (scheduledAt !== undefined) data.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
  if (sendInterval) data.sendInterval = sendInterval;
  if (status) data.status = status;

  const campaign = await prisma.campaign.update({ where: { id: req.params.id }, data });
  res.json(campaign);
});

// POST /api/campaigns/:id/send - Dispara campanha agora
router.post('/:id/send', async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { id: req.params.id },
    include: { template: true },
  });
  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
  if (!campaign.template) return res.status(400).json({ error: 'Campanha sem template de mensagem' });

  const { isReady } = whatsappService.getStatus();
  if (!isReady) return res.status(503).json({ error: 'WhatsApp não está conectado' });

  const targets: { id: string; isGroup: boolean; refId: string }[] = [];
  const tags: string[] = JSON.parse(campaign.targetTags);
  const groupIds: string[] = JSON.parse(campaign.targetGroups);

  if (campaign.targetType === 'groups' || groupIds.length > 0) {
    const groups = await prisma.whatsAppGroup.findMany({ where: { id: { in: groupIds }, active: true } });
    groups.forEach((g) => targets.push({ id: g.groupId, isGroup: true, refId: g.id }));
  }

  if (campaign.targetType === 'contacts' || campaign.targetType === 'all' || campaign.targetType === 'tagged') {
    const where: any = { status: 'active' };
    if (campaign.targetType === 'tagged' && tags.length > 0) {
      where.tags = { contains: tags[0] };
    }
    const contacts = await prisma.contact.findMany({ where });
    contacts.forEach((c) => targets.push({ id: c.phone, isGroup: false, refId: c.id }));
  }

  if (campaign.targetType === 'all_students') {
    const contacts = await prisma.contact.findMany({ where: { student: { isNot: null }, status: 'active' } });
    contacts.forEach((c) => targets.push({ id: c.phone, isGroup: false, refId: c.id }));
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'running', startedAt: new Date(), totalPending: targets.length },
  });

  await prisma.campaignSend.createMany({
    data: targets.map((t) => ({
      campaignId: campaign.id,
      contactId: !t.isGroup ? t.refId : null,
      groupId: t.isGroup ? t.refId : null,
    })),
  });

  const content = {
    type: campaign.template.type,
    body: campaign.template.body || undefined,
    mediaPath: campaign.template.mediaPath || undefined,
    caption: campaign.template.body || undefined,
  };

  whatsappService.sendWithDelay(targets, content, campaign.sendInterval).then(async ({ sent, failed }) => {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'completed', completedAt: new Date(), totalSent: sent, totalFailed: failed },
    });
  });

  res.json({ message: `Campanha iniciada. ${targets.length} destinatários na fila.`, total: targets.length });
});

// POST /api/campaigns/:id/schedule - Agenda campanha
router.post('/:id/schedule', async (req, res) => {
  const { scheduledAt } = req.body;
  if (!scheduledAt) return res.status(400).json({ error: 'scheduledAt é obrigatório' });

  const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id }, include: { template: true } });
  if (!campaign || !campaign.template) return res.status(400).json({ error: 'Campanha inválida ou sem template' });

  await schedulerService.scheduleMessage({
    userId: await getSystemUserId(),
    campaignId: campaign.id,
    targetType: campaign.targetType,
    targetTags: JSON.parse(campaign.targetTags),
    type: campaign.template.type,
    body: campaign.template.body || undefined,
    mediaPath: campaign.template.mediaPath || undefined,
    scheduledAt: new Date(scheduledAt),
  });

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'scheduled', scheduledAt: new Date(scheduledAt) } });
  res.json({ message: 'Campanha agendada com sucesso' });
});

// DELETE /api/campaigns/:id
router.delete('/:id', async (req, res) => {
  await prisma.campaign.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;

import { Router } from 'express';
import { prisma } from '../services/database';
import { autoResponseService } from '../services/autoresponse.service';
import path from 'path';
import fs from 'fs';

const router = Router();

// ─── AUTORRESPONSE ─────────────────────────────────────────────────────────

// GET /api/automation/autoresponse/status
router.get('/autoresponse/status', async (_req, res) => {
  try {
    const templates = await prisma.messageTemplate.findMany({ where: { active: true } });
    res.json({
      enabled: true,
      templatesCount: templates.length,
      templates: templates.map(t => ({ id: t.id, name: t.name, type: t.type }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/autoresponse/template
// Cria template para autorresponse
router.post('/autoresponse/template', async (req, res) => {
  try {
    const { name, type, body, mediaPath, variables } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'name e type são obrigatórios' });
    }

    const template = await prisma.messageTemplate.create({
      data: {
        name,
        type,
        body: body || null,
        mediaPath: mediaPath || null,
        variables: JSON.stringify(variables || []),
        active: true
      }
    });

    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automation/autoresponse/templates
router.get('/autoresponse/templates', async (_req, res) => {
  try {
    const templates = await prisma.messageTemplate.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' }
    });

    const formatted = templates.map(t => ({
      id: t.id,
      name: t.name,
      type: t.type,
      body: t.body,
      mediaPath: t.mediaPath,
      variables: JSON.parse(t.variables || '[]')
    }));

    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/automation/autoresponse/template/:id
router.delete('/autoresponse/template/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.messageTemplate.update({
      where: { id },
      data: { active: false }
    });
    res.json({ message: 'Template desativado' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CAMPANHAS AGENDADAS ────────────────────────────────────────────────────

// GET /api/automation/campaigns
router.get('/campaigns', async (req, res) => {
  try {
    const { status } = req.query;
    const campaigns = await prisma.campaign.findMany({
      where: status ? { status: status as string } : {},
      include: { template: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json(campaigns.map(c => ({
      ...c,
      targetTags: JSON.parse(c.targetTags || '[]'),
      targetGroups: JSON.parse(c.targetGroups || '[]')
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/campaigns
// Cria nova campanha de envio programado
router.post('/campaigns', async (req, res) => {
  try {
    const {
      name,
      description,
      templateId,
      targetType,
      targetTags,
      targetGroups,
      scheduledAt,
      sendInterval,
      userId
    } = req.body;

    if (!name || !templateId || !userId) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, templateId, userId' });
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description: description || '',
        templateId,
        userId,
        targetType: targetType || 'contacts',
        targetTags: JSON.stringify(targetTags || []),
        targetGroups: JSON.stringify(targetGroups || []),
        status: 'scheduled',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 60000),
        sendInterval: sendInterval || 3000
      }
    });

    res.json(campaign);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/campaigns/:id/send
// Envia campanha agora (ou reschedule)
router.post('/campaigns/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { sendNow } = req.body;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

    if (sendNow) {
      // Cria mensagens agendadas imediatas
      const schedMsgs = await createScheduledMessagesForCampaign(campaign);
      res.json({ message: 'Mensagens criadas para envio', count: schedMsgs.length });
    } else {
      await prisma.campaign.update({ where: { id }, data: { status: 'running' } });
      res.json({ message: 'Campanha iniciada' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/automation/campaigns/:id
router.delete('/campaigns/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.campaign.update({
      where: { id },
      data: { status: 'cancelled' }
    });
    res.json({ message: 'Campanha cancelada' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── MENSAGENS AGENDADAS ────────────────────────────────────────────────────

// GET /api/automation/scheduled-messages
router.get('/scheduled-messages', async (req, res) => {
  try {
    const { status, campaignId } = req.query;

    const messages = await prisma.scheduledMessage.findMany({
      where: {
        status: status ? (status as string) : undefined,
        campaignId: campaignId ? (campaignId as string) : undefined
      },
      include: { campaign: true, user: { select: { name: true } } },
      orderBy: { scheduledAt: 'asc' }
    });

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/scheduled-messages
// Agenda uma mensagem para contato ou grupo
router.post('/scheduled-messages', async (req, res) => {
  try {
    const {
      userId,
      targetType,
      targetId,
      type,
      body,
      mediaPath,
      scheduledAt,
      recurring,
      cronExpr
    } = req.body;

    if (!userId || !targetType || !targetId || !scheduledAt) {
      return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        userId,
        targetType,
        targetId,
        type: type || 'text',
        body: body || '',
        mediaPath: mediaPath || null,
        scheduledAt: new Date(scheduledAt),
        recurring: recurring || false,
        cronExpr: cronExpr || null,
        status: 'pending'
      }
    });

    res.json(scheduled);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/scheduled-messages/:id/cancel
router.post('/scheduled-messages/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'cancelled' }
    });
    res.json({ message: 'Mensagem cancelada' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPER FUNCTION ───────────────────────────────────────────────────────

async function createScheduledMessagesForCampaign(campaign: any) {
  const targets: { id: string; type: 'contact' | 'group' }[] = [];

  if (campaign.targetType === 'contacts') {
    const tags = JSON.parse(campaign.targetTags || '[]');
    const contacts = await prisma.contact.findMany({
      where: tags.length > 0 ? { status: 'active' } : { status: 'active' }
    });
    contacts.forEach(c => targets.push({ id: c.id, type: 'contact' }));
  } else if (campaign.targetType === 'groups') {
    const groupIds = JSON.parse(campaign.targetGroups || '[]');
    const groups = await prisma.whatsAppGroup.findMany({
      where: { groupId: { in: groupIds } }
    });
    groups.forEach(g => targets.push({ id: g.id, type: 'group' }));
  }

  const template = campaign.template;
  const msgs = [];

  for (const target of targets) {
    const msg = await prisma.scheduledMessage.create({
      data: {
        campaignId: campaign.id,
        userId: campaign.userId,
        targetType: target.type === 'contact' ? 'contact' : 'group',
        targetId: target.id,
        type: template.type,
        body: template.body,
        mediaPath: template.mediaPath,
        scheduledAt: new Date(Date.now() + 5000),
        status: 'pending'
      }
    });
    msgs.push(msg);
  }

  return msgs;
}

export default router;

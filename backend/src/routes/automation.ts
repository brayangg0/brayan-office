import { Router } from 'express';
import { prisma } from '../services/database';
import { autoResponseService } from '../services/autoresponse.service';
import { whatsappService } from '../services/whatsapp.service';
import path from 'path';
import fs from 'fs';

const router = Router();

router.get('/blocked-phones', async (_req, res) => {
  const blockedPhones = await prisma.automationBlockedPhone.findMany({
    orderBy: { createdAt: 'desc' },
  });
  res.json(blockedPhones);
});

router.post('/blocked-phones', async (req, res) => {
  const phone = String(req.body?.phone || '').replace(/\D/g, '');
  const name = String(req.body?.name || '').trim() || null;
  if (phone.length < 10 || phone.length > 15) {
    return res.status(400).json({ error: 'Informe o número com DDD e, se necessário, o código do país.' });
  }
  const blockedPhone = await prisma.automationBlockedPhone.upsert({
    where: { phone },
    update: { name },
    create: { phone, name },
  });
  res.status(201).json(blockedPhone);
});

router.delete('/blocked-phones/:id', async (req, res) => {
  await prisma.automationBlockedPhone.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

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

// PUT /api/automation/autoresponse/template/:id
router.put('/autoresponse/template/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, body, mediaPath, variables } = req.body;

    const template = await prisma.messageTemplate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        ...(body !== undefined && { body: body || null }),
        ...(mediaPath !== undefined && { mediaPath: mediaPath || null }),
        ...(variables !== undefined && { variables: JSON.stringify(variables) })
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
      targetContacts,
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
        targetTags: JSON.stringify(targetType === 'contacts' && targetContacts ? targetContacts : targetTags || []),
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

    const campaign = await prisma.campaign.findUnique({ where: { id }, include: { template: true } });
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

// ─── AI AUTO-RESPONSE ──────────────────────────────────────────────────────

// POST /api/automation/ai-response/enable
router.post('/ai-response/enable', async (req, res) => {
  try {
    const { enabled, welcomeMessage, qaRules, closingEnabled, closingMessage } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '"enabled" deve ser um booleano' });
    }
    if (!welcomeMessage || typeof welcomeMessage !== 'string') {
      return res.status(400).json({ error: '"welcomeMessage" é obrigatório' });
    }

    // Upsert: only one config record (id = 'default')
    const normalizedQaRules = Array.isArray(qaRules)
      ? qaRules
          .map((rule: any) => ({
            question: String(rule?.question || '').trim(),
            answer: String(rule?.answer || '').trim(),
          }))
          .filter((rule) => rule.question && rule.answer)
      : undefined;

    const qaRulesData = normalizedQaRules ? JSON.stringify(normalizedQaRules) : undefined;
    const closingData = {
      ...(typeof closingEnabled === 'boolean' ? { closingEnabled } : {}),
      ...(typeof closingMessage === 'string' && closingMessage.trim()
        ? { closingMessage: closingMessage.trim() }
        : {}),
    };

    const config = await prisma.aIAutoResponse.upsert({
      where: { id: 'default' },
      update: {
        enabled,
        welcomeMessage,
        ...(qaRulesData !== undefined ? { qaRules: qaRulesData } : {}),
        ...closingData,
      },
      create: {
        id: 'default',
        enabled,
        welcomeMessage,
        qaRules: qaRulesData || '[]',
        ...closingData,
      },
    });

    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/ai-response/option/:number
router.post('/ai-response/option/:number', async (req, res) => {
  try {
    const optionNumber = parseInt(req.params.number, 10);
    const { response } = req.body;

    if (![1, 2, 3, 4].includes(optionNumber)) {
      return res.status(400).json({ error: 'Número de opção inválido. Use 1, 2, 3 ou 4.' });
    }
    if (typeof response !== 'string') {
      return res.status(400).json({ error: '"response" é obrigatório' });
    }

    const fieldName = `option${optionNumber}` as 'option1' | 'option2' | 'option3' | 'option4';

    const existing = await prisma.aIAutoResponse.findUnique({ where: { id: 'default' } });
    if (!existing) {
      return res.status(404).json({ error: 'Configuração de AI não encontrada. Habilite primeiro via /enable.' });
    }

    const updated = await prisma.aIAutoResponse.update({
      where: { id: 'default' },
      data: { [fieldName]: response },
    });

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/automation/ai-response/config
router.get('/ai-response/config', async (_req, res) => {
  try {
    const config = await prisma.aIAutoResponse.findUnique({ where: { id: 'default' } });

    if (!config) {
      return res.json({
        enabled: false,
        welcomeMessage: '',
        options: { 1: '', 2: '', 3: '', 4: '' },
        qaRules: [],
        closingEnabled: true,
        closingMessage: '😊 Ficamos felizes em ajudar!\nSe precisar de alguma coisa novamente, é só mandar uma mensagem.\nAté mais!',
      });
    }

    let qaRules: any[] = [];
    try {
      qaRules = JSON.parse((config as any).qaRules || '[]');
      if (!Array.isArray(qaRules)) qaRules = [];
    } catch {
      qaRules = [];
    }

    res.json({
      enabled: config.enabled,
      welcomeMessage: config.welcomeMessage,
      options: {
        1: config.option1 || '',
        2: config.option2 || '',
        3: config.option3 || '',
        4: config.option4 || '',
      },
      qaRules,
      closingEnabled: config.closingEnabled,
      closingMessage: config.closingMessage,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/ai-response/handle-message
router.post('/ai-response/handle-message', async (req, res) => {
  try {
    const { contactId, message } = req.body;

    if (!contactId || !message) {
      return res.status(400).json({ error: '"contactId" e "message" são obrigatórios' });
    }

    const config = await prisma.aIAutoResponse.findUnique({ where: { id: 'default' } });
    if (!config || !config.enabled) {
      return res.status(400).json({ error: 'AI Auto-Response não está habilitado' });
    }

    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    const trimmed = message.trim();
    const optionNumber = parseInt(trimmed, 10);
    const isValidOption = [1, 2, 3, 4].includes(optionNumber);
    const existingState = await prisma.conversationState.findUnique({ where: { contactId } });
    const interactionAt = existingState?.updatedAt?.getTime() || 0;
    const welcomeAlreadySentInSession = Date.now() - interactionAt < 6 * 60 * 60 * 1000;

    if (isValidOption) {
      // User selected a menu option — send the corresponding response
      const fieldName = `option${optionNumber}` as 'option1' | 'option2' | 'option3' | 'option4';
      const optionResponse = config[fieldName];

      if (!optionResponse) {
        return res.json({ action: 'ignored', reason: 'option_not_configured' });
      }

      await whatsappService.sendText(contact.phone, optionResponse);

      // Persist conversation state
      await prisma.conversationState.upsert({
        where: { contactId },
        update: { lastOption: optionNumber },
        create: { contactId, lastOption: optionNumber },
      });

      return res.json({ action: 'option_response_sent', option: optionNumber });
    } else if (!welcomeAlreadySentInSession) {
      // Not a valid option — send the welcome message
      await whatsappService.sendText(contact.phone, config.welcomeMessage);

      // Reset conversation state
      await prisma.conversationState.upsert({
        where: { contactId },
        update: { lastOption: null },
        create: { contactId, lastOption: null },
      });

      return res.json({ action: 'welcome_sent' });
    } else {
      return res.json({ action: 'ignored', reason: 'welcome_already_sent' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HELPER FUNCTION ───────────────────────────────────────────────────────

async function createScheduledMessagesForCampaign(campaign: any) {
  const targets: { id: string; type: 'contact' | 'group' }[] = [];

  if (campaign.targetType === 'contacts') {
    try {
      const contactIdsOrTags = JSON.parse(campaign.targetTags || '[]');
      const selectedContacts = contactIdsOrTags.length > 0
        ? await prisma.contact.findMany({ where: { id: { in: contactIdsOrTags }, status: 'active' } })
        : [];

      if (selectedContacts.length > 0) {
        selectedContacts.forEach(c => targets.push({ id: c.id, type: 'contact' }));
      } else {
        const where: any = { status: 'active' };
        if (contactIdsOrTags.length > 0) {
          where.tags = { contains: contactIdsOrTags[0] };
        }
        const contacts = await prisma.contact.findMany({ where });
        contacts.forEach(c => targets.push({ id: c.id, type: 'contact' }));
      }
    } catch (e) {
      console.error('Erro ao filtrar contatos por tags:', e);
      const contacts = await prisma.contact.findMany({ where: { status: 'active' } });
      contacts.forEach(c => targets.push({ id: c.id, type: 'contact' }));
    }
  } else if (campaign.targetType === 'groups') {
    try {
      const groupIds = JSON.parse(campaign.targetGroups || '[]');
      const groups = await prisma.whatsAppGroup.findMany({
        where: { groupId: { in: groupIds } }
      });
      groups.forEach(g => targets.push({ id: g.id, type: 'group' }));
    } catch (e) {
      console.error('Erro ao filtrar grupos:', e);
    }
  } else if (campaign.targetType === 'all') {
    const contacts = await prisma.contact.findMany({ where: { status: 'active' } });
    contacts.forEach(c => targets.push({ id: c.id, type: 'contact' }));
  }

  if (!campaign.template) {
    throw new Error('Template da campanha não encontrado');
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

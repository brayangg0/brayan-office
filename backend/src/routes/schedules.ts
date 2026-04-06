import { Router } from 'express';
import { prisma } from '../services/database';
import { schedulerService } from '../services/scheduler.service';
import { uploadMedia } from '../middleware/upload';

const router = Router();

const VALID_TYPES = ['text', 'image', 'audio', 'video'];
const VALID_TARGET_TYPES = ['all_students', 'all', 'contact', 'group', 'tagged'];

function isValidCron(expr: string): boolean {
  // Validação básica de cron: 5 ou 6 campos numéricos/wildcards
  const parts = expr.trim().split(/\s+/);
  return (parts.length === 5 || parts.length === 6) && parts.every(p => /^(\*|[0-9,\-\/]+)$/.test(p));
}

async function getSystemUserId(): Promise<string> {
  const user = await prisma.user.findFirst();
  if (!user) {
    const newUser = await prisma.user.create({
      data: { name: 'System', email: 'system@crm.local', password: 'system', role: 'admin' },
    });
    console.log('[Schedules] 🆕 Usuário sistema criado:', newUser.id);
    return newUser.id;
  }
  return user.id;
}

// GET /api/schedules
router.get('/', async (req, res) => {
  const { status } = req.query as Record<string, string>;
  const where: any = status ? { status } : {};
  const schedules = await prisma.scheduledMessage.findMany({
    where, orderBy: { scheduledAt: 'asc' },
    include: { user: { select: { name: true } } },
  });
  res.json(schedules);
});

// POST /api/schedules
router.post('/', uploadMedia.single('media'), async (req, res) => {
  const { targetType, targetId, targetTags, type = 'text', body, scheduledAt, cronExpr, recurring } = req.body;

  console.log('[Schedules POST] Recebido:', { targetType, targetId, targetTags, type, body: body?.substring(0, 50), scheduledAt, cronExpr, recurring, hasFile: !!req.file });
  console.log('[Schedules POST] Body completo:', JSON.stringify(req.body, null, 2));
  console.log('[Schedules POST] File:', req.file ? { size: req.file.size, mimetype: req.file.mimetype, path: req.file.path } : 'nenhum');

  // ✅ Validação 1: Campos obrigatórios
  if (!targetType || !scheduledAt) {
    console.error('[Schedules] ❌ Campos obrigatórios faltando:', { targetType: !!targetType, scheduledAt: !!scheduledAt });
    return res.status(400).json({ error: 'targetType e scheduledAt são obrigatórios' });
  }

  // ✅ Validação 2: targetType válido
  if (!VALID_TARGET_TYPES.includes(targetType)) {
    console.error('[Schedules] ❌ targetType inválido:', targetType, 'válidos:', VALID_TARGET_TYPES);
    return res.status(400).json({ error: `targetType inválido. Use: ${VALID_TARGET_TYPES.join(', ')}` });
  }

  // ✅ Validação 3: Validar targetId quando obrigatório
  if ((targetType === 'contact' || targetType === 'group') && !targetId) {
    console.error('[Schedules] ❌ targetId obrigatório para:', targetType);
    return res.status(400).json({ error: `targetId é obrigatório para targetType '${targetType}'` });
  }

  // ✅ Validação 4: Validar targetTags quando targetType é 'tagged'
  if (targetType === 'tagged') {
    try {
      const tags = targetTags ? JSON.parse(targetTags) : [];
      if (!Array.isArray(tags) || tags.length === 0) {
        console.error('[Schedules] ❌ targetTags vazio para tagged');
        return res.status(400).json({ error: 'targetTags deve ser um array não vazio para targetType "tagged"' });
      }
    } catch (e) {
      console.error('[Schedules] ❌ Erro ao parsear targetTags:', e);
      return res.status(400).json({ error: 'targetTags deve ser um JSON válido' });
    }
  }

  // ✅ Validação 5: Tipo válido
  if (!VALID_TYPES.includes(type)) {
    console.error('[Schedules] ❌ type inválido:', type, 'válidos:', VALID_TYPES);
    return res.status(400).json({ error: `type inválido. Use: ${VALID_TYPES.join(', ')}` });
  }

  // ✅ Validação 6: Body obrigatório para tipo texto
  if (type === 'text' && !body?.trim()) {
    console.error('[Schedules] ❌ body obsceno para texto');
    return res.status(400).json({ error: 'body é obrigatório para mensagens de tipo texto' });
  }

  // ✅ Validação 7: Arquivo obrigatório para mídia
  if (type !== 'text' && !req.file) {
    console.error('[Schedules] ❌ arquivo obrigatório para tipo:', type);
    return res.status(400).json({ error: `arquivo é obrigatório para tipo '${type}'` });
  }

  // ✅ Validação 8: Data no futuro (com buffer de 10 segundos)
  const now = new Date();
  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) {
    console.error('[Schedules] ❌ Data inválida:', scheduledAt);
    return res.status(400).json({ error: `Data inválida: ${scheduledAt}. Use formato ISO: 2026-04-02T10:30:00.000Z` });
  }
  // Buffer de 10 segundos para evitar race conditions
  const minAllowed = new Date(now.getTime() + 10000);
  if (scheduledDate < minAllowed) {
    console.error('[Schedules] ❌ Data no passado/muito próxima:', { now: now.toISOString(), minAllowed: minAllowed.toISOString(), scheduledDate: scheduledDate.toISOString() });
    return res.status(400).json({ error: `Agende para pelo menos 10 segundos no futuro (agora: ${now.toISOString()}, enviado: ${scheduledAt})` });
  }

  // ✅ Validação 9: Expressão cron válida se recorrente
  if (recurring === 'true' || recurring === true) {
    if (!cronExpr) {
      console.error('[Schedules] ❌ cronExpr obrigatório para recorrente');
      return res.status(400).json({ error: 'cronExpr é obrigatório para agendamentos recorrentes' });
    }
    if (!isValidCron(cronExpr)) {
      console.error('[Schedules] ❌ cronExpr inválida:', cronExpr);
      return res.status(400).json({ error: 'cronExpr inválida. Exemplo: "0 9 * * *" (diário 9h) ou "0 8 * * 1" (segunda 8h)' });
    }
    console.log('[Schedules] ✅ cronExpr válida:', cronExpr);
  }

  try {
    const msg = await schedulerService.scheduleMessage({
      userId: await getSystemUserId(),
      targetType,
      targetId: targetId || undefined,
      targetTags: targetTags ? JSON.parse(targetTags) : [],
      type,
      body: body || undefined,
      mediaPath: req.file ? req.file.path : undefined,
      scheduledAt: scheduledDate,
      cronExpr: cronExpr || undefined,
      recurring: recurring === 'true' || recurring === true,
    });

    console.log('[Schedules] ✅ Mensagem agendada:', msg.id);
    res.status(201).json(msg);
  } catch (err: any) {
    console.error('[Schedules] ❌ Erro ao agendar:', err);
    console.error('[Schedules] Stack:', err.stack);
    res.status(500).json({ 
      error: err.message || 'Erro ao agendar mensagem',
      details: process.env.NODE_ENV === 'development' ? err.toString() : undefined
    });
  }
});

// DELETE /api/schedules/:id
router.delete('/:id', async (req, res) => {
  await schedulerService.cancelSchedule(req.params.id);
  res.status(204).send();
});

export default router;

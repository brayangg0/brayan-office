import { Router } from 'express';
import { prisma } from '../services/database';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const AUTOMATION_BLOCK_TAG = 'automacao_bloqueada';

function parseContactTags(rawTags: string): string[] {
  try {
    const parsed = JSON.parse(rawTags || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

// GET /api/contacts
router.get('/', async (req, res) => {
  const { search, tag, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: any = {};
  if (status) where.status = status;
  if (search) where.OR = [
    { name: { contains: search } },
    { phone: { contains: search } },
    { email: { contains: search } },
  ];
  if (tag) where.tags = { contains: tag };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({ where, skip, take: parseInt(limit), orderBy: { createdAt: 'desc' }, include: { student: { select: { id: true, status: true, course: { select: { name: true } } } } } }),
    prisma.contact.count({ where }),
  ]);

  res.json({ contacts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// POST /api/contacts/import-csv - Importar contatos via arquivo CSV (deve estar ANTES de POST /:id)
router.post('/import-csv', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  try {
    const csv = req.file.buffer.toString('utf-8');
    const lines = csv.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) return res.status(400).json({ error: 'CSV vazio ou sem dados' });

    // Parse header - encontra índices das colunas
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    let nameIdx = header.indexOf('nome');
    if (nameIdx === -1) nameIdx = header.indexOf('name');
    if (nameIdx === -1) nameIdx = 0;

    let phoneIdx = header.indexOf('telefone');
    if (phoneIdx === -1) phoneIdx = header.indexOf('phone');
    if (phoneIdx === -1) phoneIdx = 1;

    const emailIdx = header.indexOf('email');
    const tagsIdx = header.indexOf('tags') !== -1 ? header.indexOf('tags') : header.indexOf('etiquetas');

    let created = 0, skipped = 0, errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const parts = lines[i].split(',').map(p => p.trim());
        const name = parts[nameIdx]?.trim();
        const phone = parts[phoneIdx]?.trim();
        const email = emailIdx >= 0 ? parts[emailIdx]?.trim() : undefined;
        const tagsStr = tagsIdx >= 0 ? parts[tagsIdx]?.trim() : undefined;

        if (!name || !phone) {
          skipped++;
          continue;
        }

        const normalized = phone.replace(/\D/g, '');
        if (normalized.length < 10) {
          skipped++;
          continue;
        }

        const tags = tagsStr ? tagsStr.split(';').map(t => t.trim()).filter(Boolean) : [];

        await prisma.contact.upsert({
          where: { phone: normalized },
          update: { name, email },
          create: { name, phone: normalized, email, tags: JSON.stringify(tags) },
        });
        created++;
      } catch (err) {
        skipped++;
        errors.push(`Linha ${i + 1}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
      }
    }

    res.json({ created, skipped, errors: errors.slice(0, 5) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao processar CSV' });
  }
});

// POST /api/contacts/import - Importar lista JSON
router.post('/import', async (req, res) => {
  const { contacts } = req.body as { contacts: Array<{ name: string; phone: string; email?: string; tags?: string[] }> };
  if (!Array.isArray(contacts)) return res.status(400).json({ error: 'contacts deve ser um array' });

  let created = 0, skipped = 0;
  for (const c of contacts) {
    try {
      const normalized = c.phone.replace(/\D/g, '');
      await prisma.contact.upsert({
        where: { phone: normalized },
        update: { name: c.name, email: c.email },
        create: { name: c.name, phone: normalized, email: c.email, tags: JSON.stringify(c.tags || []) },
      });
      created++;
    } catch {
      skipped++;
    }
  }
  res.json({ created, skipped });
});

// GET /api/contacts/:id
router.get('/:id', async (req, res) => {
  const contact = await prisma.contact.findUnique({
    where: { id: req.params.id },
    include: { student: { include: { course: true } }, messages: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });
  res.json(contact);
});

// POST /api/contacts
router.post('/', async (req, res) => {
  const { name, phone, email, tags, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'name e phone são obrigatórios' });

  const normalized = phone.replace(/\D/g, '');
  const contact = await prisma.contact.create({
    data: { name, phone: normalized, email, tags: JSON.stringify(tags || []), notes },
  });
  res.status(201).json(contact);
});

// POST /api/contacts/:id/automation-block
router.post('/:id/automation-block', async (req, res) => {
  const blocked = req.body?.blocked === true;
  const current = await prisma.contact.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: 'Contato não encontrado' });

  const tags = parseContactTags(current.tags).filter((tag) => tag !== AUTOMATION_BLOCK_TAG);
  if (blocked) tags.push(AUTOMATION_BLOCK_TAG);

  const contact = await prisma.contact.update({
    where: { id: current.id },
    data: { tags: JSON.stringify(tags) },
  });

  res.json({ contact, automationBlocked: blocked });
});

// PUT /api/contacts/:id
router.put('/:id', async (req, res) => {
  const { name, phone, email, tags, notes, status } = req.body;
  const data: any = {};
  if (name) data.name = name;
  if (phone) data.phone = phone.replace(/\D/g, '');
  if (email !== undefined) data.email = email;
  if (tags !== undefined) data.tags = JSON.stringify(tags);
  if (notes !== undefined) data.notes = notes;
  if (status) data.status = status;

  const contact = await prisma.contact.update({ where: { id: req.params.id }, data });
  res.json(contact);
});

// DELETE /api/contacts/:id
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Usamos uma transação para garantir que tudo seja apagado corretamente
    await prisma.$transaction([
      prisma.message.deleteMany({ where: { contactId: id } }),
      prisma.groupMember.deleteMany({ where: { contactId: id } }),
      prisma.campaignSend.deleteMany({ where: { contactId: id } }),
      prisma.student.deleteMany({ where: { contactId: id } }), // Garantia extra (embora o schema já tenha cascade)
      prisma.contact.delete({ where: { id } })
    ]);
    res.status(204).send();
  } catch (err) {
    console.error('[Contacts Route] Erro ao deletar contato:', err);
    res.status(500).json({ error: 'Erro ao remover contato e suas dependências' });
  }
});

export default router;

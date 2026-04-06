import { Router } from 'express';
import { prisma } from '../services/database';

import { uploadMedia } from '../middleware/upload';

const router = Router();

// GET /api/templates
router.get('/', async (_req, res) => {
  const templates = await prisma.messageTemplate.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
  res.json(templates);
});

// GET /api/templates/:id
router.get('/:id', async (req, res) => {
  const template = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
  if (!template) return res.status(404).json({ error: 'Template não encontrado' });
  res.json(template);
});

// POST /api/templates
router.post('/', uploadMedia.single('media'), async (req, res) => {
  const { name, type = 'text', body, variables } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });

  const template = await prisma.messageTemplate.create({
    data: {
      name, type,
      body: body || null,
      mediaPath: req.file ? req.file.path : null,
      variables: variables ? JSON.stringify(JSON.parse(variables)) : '[]',
    },
  });
  res.status(201).json(template);
});

// PUT /api/templates/:id
router.put('/:id', uploadMedia.single('media'), async (req, res) => {
  const { name, type, body, variables, active } = req.body;
  const data: any = {};
  if (name) data.name = name;
  if (type) data.type = type;
  if (body !== undefined) data.body = body;
  if (variables !== undefined) data.variables = JSON.stringify(JSON.parse(variables));
  if (active !== undefined) data.active = active === 'true';
  if (req.file) data.mediaPath = req.file.path;

  const template = await prisma.messageTemplate.update({ where: { id: req.params.id }, data });
  res.json(template);
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  await prisma.messageTemplate.update({ where: { id: req.params.id }, data: { active: false } });
  res.status(204).send();
});

export default router;

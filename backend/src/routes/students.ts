import { Router } from 'express';
import { prisma } from '../services/database';
import { uploadRg } from '../middleware/upload';
import { ocrService } from '../services/ocr.service';
import path from 'path';

const router = Router();

// GET /api/students
router.get('/', async (req, res) => {
  const { search, courseId, status, page = '1', limit = '50' } = req.query as Record<string, string>;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where: any = {};
  if (status) where.status = status;
  if (courseId) where.courseId = courseId;
  if (search) {
    where.contact = { OR: [{ name: { contains: search } }, { phone: { contains: search } }] };
  }

  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where, skip, take: parseInt(limit),
      orderBy: { enrolledAt: 'desc' },
      include: { contact: true, course: true },
    }),
    prisma.student.count({ where }),
  ]);

  res.json({ students, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
});

// GET /api/students/:id
router.get('/:id', async (req, res) => {
  const student = await prisma.student.findUnique({
    where: { id: req.params.id },
    include: { contact: { include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } } }, course: true },
  });
  if (!student) return res.status(404).json({ error: 'Aluno não encontrado' });
  res.json(student);
});

// POST /api/students - Matricular um contato como aluno
router.post('/', async (req, res) => {
  const { contactId, courseId, cpf, rg, birthDate, address, city, state, expiresAt } = req.body;
  if (!contactId) return res.status(400).json({ error: 'contactId é obrigatório' });

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return res.status(404).json({ error: 'Contato não encontrado' });

  const student = await prisma.student.create({
    data: {
      contactId,
      courseId: courseId || null,
      cpf: cpf?.replace(/\D/g, '') || null,
      rg: rg || null,
      birthDate: birthDate ? new Date(birthDate) : null,
      address, city, state,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
    include: { contact: true, course: true },
  });

  // Adiciona tag 'aluno' ao contato
  const tags: string[] = JSON.parse(contact.tags || '[]');
  if (!tags.includes('aluno')) {
    await prisma.contact.update({ where: { id: contactId }, data: { tags: JSON.stringify([...tags, 'aluno']) } });
  }

  res.status(201).json(student);
});

// PUT /api/students/:id
router.put('/:id', async (req, res) => {
  const { cpf, rg, birthDate, address, city, state, status, courseId, expiresAt } = req.body;
  const data: any = {};
  if (cpf !== undefined) data.cpf = cpf?.replace(/\D/g, '') || null;
  if (rg !== undefined) data.rg = rg;
  if (birthDate !== undefined) data.birthDate = birthDate ? new Date(birthDate) : null;
  if (address !== undefined) data.address = address;
  if (city !== undefined) data.city = city;
  if (state !== undefined) data.state = state;
  if (status) data.status = status;
  if (courseId !== undefined) data.courseId = courseId;
  if (expiresAt !== undefined) data.expiresAt = expiresAt ? new Date(expiresAt) : null;

  const student = await prisma.student.update({ where: { id: req.params.id }, data, include: { contact: true, course: true } });
  res.json(student);
});

// POST /api/students/:id/rg - Upload e OCR do RG
router.post('/:id/rg', uploadRg.single('rg'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });

  const filePath = req.file.path;
  const rgUrl = `/uploads/rg/${req.file.filename}`;

  // Processa OCR
  const rgData = await ocrService.extractRgData(filePath);

  // Atualiza aluno com dados do RG
  const student = await prisma.student.update({
    where: { id: req.params.id },
    data: {
      rgPhotoPath: rgUrl,
      rgDataExtracted: JSON.stringify(rgData),
      rg: rgData.rg || undefined,
      cpf: rgData.cpf || undefined,
    },
    include: { contact: true, course: true },
  });

  res.json({ student, rgData });
});

// GET /api/students/expiring - Alunos com acesso expirando em X dias
router.get('/expiring', async (req, res) => {
  const days = parseInt((req.query.days as string) || '30');
  const limit = new Date();
  limit.setDate(limit.getDate() + days);

  const students = await prisma.student.findMany({
    where: { expiresAt: { lte: limit, gte: new Date() }, status: 'active' },
    include: { contact: true, course: true },
  });
  res.json(students);
});

export default router;

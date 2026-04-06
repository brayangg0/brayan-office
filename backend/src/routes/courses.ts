import { Router } from 'express';
import { prisma } from '../services/database';


const router = Router();

router.get('/', async (_req, res) => {
  const courses = await prisma.course.findMany({ where: { active: true }, orderBy: { name: 'asc' }, include: { _count: { select: { students: true } } } });
  res.json(courses);
});

router.post('/', async (req, res) => {
  const { name, description, duration, price } = req.body;
  if (!name) return res.status(400).json({ error: 'name é obrigatório' });
  const course = await prisma.course.create({ data: { name, description, duration: duration ? parseInt(duration) : null, price: price ? parseFloat(price) : null } });
  res.status(201).json(course);
});

router.put('/:id', async (req, res) => {
  const { name, description, duration, price, active } = req.body;
  const data: any = {};
  if (name) data.name = name;
  if (description !== undefined) data.description = description;
  if (duration !== undefined) data.duration = duration ? parseInt(duration) : null;
  if (price !== undefined) data.price = price ? parseFloat(price) : null;
  if (active !== undefined) data.active = active;
  const course = await prisma.course.update({ where: { id: req.params.id }, data });
  res.json(course);
});

router.delete('/:id', async (req, res) => {
  await prisma.course.update({ where: { id: req.params.id }, data: { active: false } });
  res.status(204).send();
});

export default router;

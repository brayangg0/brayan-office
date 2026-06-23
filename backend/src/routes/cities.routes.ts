import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { cityIdentificationService } from '../services/cityIdentification.service';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/cities
 * Lista todas as cidades
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const cities = await prisma.city.findMany({
      where: { active: true },
      include: {
        responses: {
          where: { active: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json(cities);
  } catch (error) {
    console.error('[Cities] Erro ao listar cidades:', error);
    res.status(500).json({ error: 'Erro ao listar cidades' });
  }
});

/**
 * POST /api/cities
 * Cria uma nova cidade
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, state } = req.body;

    if (!name || !state) {
      return res.status(400).json({ error: 'Nome e estado são obrigatórios' });
    }

    const city = await prisma.city.create({
      data: { name, state },
    });

    res.status(201).json(city);
  } catch (error) {
    console.error('[Cities] Erro ao criar cidade:', error);
    res.status(500).json({ error: 'Erro ao criar cidade' });
  }
});

/**
 * PUT /api/cities/:cityId
 * Atualiza uma cidade
 */
router.put('/:cityId', async (req: Request, res: Response) => {
  try {
    const { cityId } = req.params;
    const { name, state, active } = req.body;

    const city = await prisma.city.update({
      where: { id: cityId },
      data: {
        ...(name && { name }),
        ...(state && { state }),
        ...(active !== undefined && { active }),
      },
    });

    res.json(city);
  } catch (error) {
    console.error('[Cities] Erro ao atualizar cidade:', error);
    res.status(500).json({ error: 'Erro ao atualizar cidade' });
  }
});

/**
 * DELETE /api/cities/:cityId
 * Deleta uma cidade (soft delete)
 */
router.delete('/:cityId', async (req: Request, res: Response) => {
  try {
    const { cityId } = req.params;

    await prisma.city.update({
      where: { id: cityId },
      data: { active: false },
    });

    res.json({ message: 'Cidade deletada com sucesso' });
  } catch (error) {
    console.error('[Cities] Erro ao deletar cidade:', error);
    res.status(500).json({ error: 'Erro ao deletar cidade' });
  }
});

/**
 * POST /api/cities/:cityId/responses
 * Cria uma resposta personalizada para uma cidade
 */
router.post('/:cityId/responses', async (req: Request, res: Response) => {
  try {
    const { cityId } = req.params;
    const { type, message, order } = req.body;

    if (!type || !message) {
      return res.status(400).json({ error: 'Tipo e mensagem são obrigatórios' });
    }

    const response = await prisma.cityResponse.upsert({
      where: {
        cityId_type: {
          cityId,
          type,
        },
      },
      update: {
        message,
        order: order || 0,
      },
      create: {
        cityId,
        type,
        message,
        order: order || 0,
      },
    });

    res.status(201).json(response);
  } catch (error) {
    console.error('[Cities] Erro ao criar resposta:', error);
    res.status(500).json({ error: 'Erro ao criar resposta' });
  }
});

/**
 * PUT /api/cities/:cityId/responses/:responseId
 * Atualiza uma resposta personalizada
 */
router.put('/:cityId/responses/:responseId', async (req: Request, res: Response) => {
  try {
    const { responseId } = req.params;
    const { message, order, active } = req.body;

    const response = await prisma.cityResponse.update({
      where: { id: responseId },
      data: {
        ...(message && { message }),
        ...(order !== undefined && { order }),
        ...(active !== undefined && { active }),
      },
    });

    res.json(response);
  } catch (error) {
    console.error('[Cities] Erro ao atualizar resposta:', error);
    res.status(500).json({ error: 'Erro ao atualizar resposta' });
  }
});

/**
 * DELETE /api/cities/:cityId/responses/:responseId
 * Deleta uma resposta personalizada
 */
router.delete('/:cityId/responses/:responseId', async (req: Request, res: Response) => {
  try {
    const { responseId } = req.params;

    await prisma.cityResponse.update({
      where: { id: responseId },
      data: { active: false },
    });

    res.json({ message: 'Resposta deletada com sucesso' });
  } catch (error) {
    console.error('[Cities] Erro ao deletar resposta:', error);
    res.status(500).json({ error: 'Erro ao deletar resposta' });
  }
});

/**
 * POST /api/cities/identify
 * Identifica a cidade baseado na resposta do usuário
 */
router.post('/identify', async (req: Request, res: Response) => {
  try {
    const { userAnswer, contactId } = req.body;

    if (!userAnswer) {
      return res.status(400).json({ error: 'Resposta do usuário é obrigatória' });
    }

    const identified = await cityIdentificationService.identifyCity(userAnswer);

    if (!identified) {
      return res.json({ success: false, message: 'Não foi possível identificar a cidade' });
    }

    // Salva a cidade identificada para o contato
    if (contactId) {
      await cityIdentificationService.saveCityForContact(contactId, identified.cityId, userAnswer);
    }

    res.json({
      success: true,
      cityId: identified.cityId,
      cityName: identified.cityName,
    });
  } catch (error) {
    console.error('[Cities] Erro ao identificar cidade:', error);
    res.status(500).json({ error: 'Erro ao identificar cidade' });
  }
});

/**
 * GET /api/cities/contact/:contactId
 * Obtém a cidade de um contato
 */
router.get('/contact/:contactId', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const city = await cityIdentificationService.getContactCity(contactId);

    if (!city) {
      return res.json({ city: null });
    }

    res.json({ city });
  } catch (error) {
    console.error('[Cities] Erro ao buscar cidade do contato:', error);
    res.status(500).json({ error: 'Erro ao buscar cidade do contato' });
  }
});

/**
 * POST /api/cities/seed
 * Cria cidades padrão (apenas para desenvolvimento)
 */
router.post('/seed', async (req: Request, res: Response) => {
  try {
    await cityIdentificationService.seedCities();
    res.json({ message: 'Cidades padrão criadas com sucesso' });
  } catch (error) {
    console.error('[Cities] Erro ao criar cidades padrão:', error);
    res.status(500).json({ error: 'Erro ao criar cidades padrão' });
  }
});

export default router;


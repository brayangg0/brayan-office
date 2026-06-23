import { Router, Request, Response } from 'express';
import { conversationMemoryService } from '../services/conversationMemory.service';

const router = Router();

/**
 * POST /api/conversation/identify-city
 * Identifica a cidade do aluno e armazena na memória
 */
router.post('/identify-city', async (req: Request, res: Response) => {
  try {
    const { contactId, userMessage } = req.body;

    if (!contactId || !userMessage) {
      return res.status(400).json({
        error: 'contactId e userMessage são obrigatórios',
      });
    }

    const identified = await conversationMemoryService.identifyAndStoreCity(
      contactId,
      userMessage
    );

    if (!identified) {
      return res.json({
        success: false,
        message: 'Não foi possível identificar a cidade',
      });
    }

    res.json({
      success: true,
      cityId: identified.cityId,
      cityName: identified.cityName,
      message: `Cidade identificada: ${identified.cityName}`,
    });
  } catch (error) {
    console.error('[ConversationMemory] Erro ao identificar cidade:', error);
    res.status(500).json({ error: 'Erro ao identificar cidade' });
  }
});

/**
 * POST /api/conversation/message
 * Processa uma mensagem e gera resposta personalizada
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { contactId, userMessage, responseType } = req.body;

    if (!contactId || !userMessage) {
      return res.status(400).json({
        error: 'contactId e userMessage são obrigatórios',
      });
    }

    const response = await conversationMemoryService.generatePersonalizedResponse(
      contactId,
      userMessage,
      responseType || 'custom'
    );

    res.json({
      success: true,
      response,
      context: conversationMemoryService.getContext(contactId),
    });
  } catch (error) {
    console.error('[ConversationMemory] Erro ao processar mensagem:', error);
    res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
});

/**
 * GET /api/conversation/context/:contactId
 * Obtém o contexto de conversa de um contato
 */
router.get('/context/:contactId', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const context = conversationMemoryService.getContext(contactId);

    if (!context) {
      return res.json({
        message: 'Nenhum contexto encontrado para este contato',
      });
    }

    res.json(context);
  } catch (error) {
    console.error('[ConversationMemory] Erro ao obter contexto:', error);
    res.status(500).json({ error: 'Erro ao obter contexto' });
  }
});

/**
 * GET /api/conversation/summary/:contactId
 * Obtém um resumo da conversa
 */
router.get('/summary/:contactId', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const summary = conversationMemoryService.getConversationSummary(contactId);

    if (!summary) {
      return res.json({
        message: 'Nenhuma conversa encontrada para este contato',
      });
    }

    res.json(summary);
  } catch (error) {
    console.error('[ConversationMemory] Erro ao obter resumo:', error);
    res.status(500).json({ error: 'Erro ao obter resumo' });
  }
});

/**
 * POST /api/conversation/initialize/:contactId
 * Inicializa o contexto de conversa para um contato
 */
router.post('/initialize/:contactId', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    const context = await conversationMemoryService.initializeContext(contactId);

    res.json({
      success: true,
      message: 'Contexto inicializado',
      context,
    });
  } catch (error) {
    console.error('[ConversationMemory] Erro ao inicializar contexto:', error);
    res.status(500).json({ error: 'Erro ao inicializar contexto' });
  }
});

/**
 * DELETE /api/conversation/clear/:contactId
 * Limpa o contexto de conversa (quando a conversa termina)
 */
router.delete('/clear/:contactId', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    conversationMemoryService.clearContext(contactId);

    res.json({
      success: true,
      message: 'Contexto de conversa limpo',
    });
  } catch (error) {
    console.error('[ConversationMemory] Erro ao limpar contexto:', error);
    res.status(500).json({ error: 'Erro ao limpar contexto' });
  }
});

export default router;


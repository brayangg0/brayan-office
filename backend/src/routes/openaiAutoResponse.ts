import { Router } from 'express';
import { openaiAutoResponseService } from '../services/openaiAutoResponse.service';

const router = Router();

// ─── Config ──────────────────────────────────────────────────────────────────

// GET /api/openai-autoresponse/config
router.get('/config', async (_req, res) => {
  try {
    const config = await openaiAutoResponseService.getConfig();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get config' });
  }
});

// PUT /api/openai-autoresponse/config
router.put('/config', async (req, res) => {
  try {
    const config = await openaiAutoResponseService.updateConfig(req.body);
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update config' });
  }
});

// ─── Rules ───────────────────────────────────────────────────────────────────

// GET /api/openai-autoresponse/rules
router.get('/rules', async (_req, res) => {
  try {
    const rules = await openaiAutoResponseService.getRules();
    res.json(rules);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get rules' });
  }
});

// POST /api/openai-autoresponse/rules
router.post('/rules', async (req, res) => {
  try {
    const { keyword, response, priority } = req.body;
    if (!keyword || !response) {
      return res.status(400).json({ error: '"keyword" and "response" are required' });
    }
    const rule = await openaiAutoResponseService.addRule({ keyword, response, priority });
    res.status(201).json(rule);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create rule' });
  }
});

// PUT /api/openai-autoresponse/rules/:id
router.put('/rules/:id', async (req, res) => {
  try {
    const rule = await openaiAutoResponseService.updateRule(req.params.id, req.body);
    res.json(rule);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update rule' });
  }
});

// DELETE /api/openai-autoresponse/rules/:id
router.delete('/rules/:id', async (req, res) => {
  try {
    await openaiAutoResponseService.deleteRule(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete rule' });
  }
});

// ─── Conversations ────────────────────────────────────────────────────────────

// GET /api/openai-autoresponse/conversations
router.get('/conversations', async (_req, res) => {
  try {
    const conversations = await openaiAutoResponseService.getAllConversations();
    res.json(conversations);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get conversations' });
  }
});

// GET /api/openai-autoresponse/conversations/:chatId
router.get('/conversations/:chatId', async (req, res) => {
  try {
    const contactName = (req.query.contactName as string) || req.params.chatId;
    const conversation = await openaiAutoResponseService.getOrCreateConversation(
      req.params.chatId,
      contactName
    );
    const history = await openaiAutoResponseService.getConversationHistory(conversation.id);
    res.json({ conversation, history });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get conversation' });
  }
});

// ─── Approval workflow ────────────────────────────────────────────────────────

// GET /api/openai-autoresponse/pending-approvals
router.get('/pending-approvals', async (_req, res) => {
  try {
    const pending = await openaiAutoResponseService.getPendingApprovals();
    res.json(pending);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get pending approvals' });
  }
});

// POST /api/openai-autoresponse/approve/:messageId
router.post('/approve/:messageId', async (req, res) => {
  try {
    const message = await openaiAutoResponseService.approveMessage(req.params.messageId);
    res.json(message);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to approve message' });
  }
});

// POST /api/openai-autoresponse/reject/:messageId
router.post('/reject/:messageId', async (req, res) => {
  try {
    const message = await openaiAutoResponseService.rejectMessage(req.params.messageId);
    res.json(message);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to reject message' });
  }
});

// ─── Manual test ─────────────────────────────────────────────────────────────

// POST /api/openai-autoresponse/test
router.post('/test', async (req, res) => {
  try {
    const { message, chatId, contactName, requiresApproval } = req.body;
    if (!message || !chatId) {
      return res.status(400).json({ error: '"message" and "chatId" are required' });
    }
    const result = await openaiAutoResponseService.processMessage(
      message,
      chatId,
      contactName || chatId,
      requiresApproval ?? false
    );
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to process message' });
  }
});

export default router;

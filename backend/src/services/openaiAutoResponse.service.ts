import { prisma } from './database';

// Lazy-load OpenAI so the app still starts if the package is not installed
async function getOpenAIClient() {
  try {
    const { OpenAI } = await import('openai');
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch {
    throw new Error(
      '[OpenAIAutoResponse] openai package not installed. Run: npm install openai'
    );
  }
}

export class OpenAIAutoResponseService {
  // ─── Config ──────────────────────────────────────────────────────────────

  async getConfig() {
    let config = await prisma.autoResponseConfig.findFirst();
    if (!config) {
      config = await prisma.autoResponseConfig.create({
        data: {
          systemPrompt:
            'You are a helpful WhatsApp assistant. Respond concisely and naturally.',
        },
      });
    }
    return config;
  }

  async updateConfig(data: {
    enabled?: boolean;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }) {
    const config = await this.getConfig();
    return prisma.autoResponseConfig.update({
      where: { id: config.id },
      data,
    });
  }

  // ─── Rules ───────────────────────────────────────────────────────────────

  async addRule(data: { keyword: string; response: string; priority?: number }) {
    const config = await this.getConfig();
    return prisma.autoResponseRule.create({
      data: {
        configId: config.id,
        keyword: data.keyword,
        response: data.response,
        priority: data.priority ?? 0,
      },
    });
  }

  async getRules() {
    const config = await this.getConfig();
    return prisma.autoResponseRule.findMany({
      where: { configId: config.id },
      orderBy: { priority: 'desc' },
    });
  }

  async updateRule(id: string, data: Partial<{ keyword: string; response: string; priority: number; enabled: boolean }>) {
    return prisma.autoResponseRule.update({ where: { id }, data });
  }

  async deleteRule(id: string) {
    return prisma.autoResponseRule.delete({ where: { id } });
  }

  // ─── Conversations ────────────────────────────────────────────────────────

  async getOrCreateConversation(chatId: string, contactName: string) {
    const config = await this.getConfig();
    let conversation = await prisma.autoResponseConversation.findFirst({
      where: { chatId, configId: config.id },
    });

    if (!conversation) {
      conversation = await prisma.autoResponseConversation.create({
        data: { configId: config.id, chatId, contactName },
      });
    }

    return conversation;
  }

  async getConversationHistory(conversationId: string) {
    return prisma.autoResponseMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAllConversations() {
    return prisma.autoResponseConversation.findMany({
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ─── Keyword matching ─────────────────────────────────────────────────────

  async checkKeywordMatch(message: string): Promise<string | null> {
    const rules = await this.getRules();
    const enabledRules = rules.filter((r) => r.enabled);

    for (const rule of enabledRules) {
      if (message.toLowerCase().includes(rule.keyword.toLowerCase())) {
        return rule.response;
      }
    }

    return null;
  }

  // ─── AI response generation ───────────────────────────────────────────────

  async generateAIResponse(
    message: string,
    conversationId: string,
    requiresApproval = false
  ): Promise<string> {
    const config = await this.getConfig();
    const history = await this.getConversationHistory(conversationId);

    // Build conversation history for context (only approved or non-approval messages)
    const contextMessages = history
      .filter((m) => !m.requiresApproval || m.approved === true)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    // Append the current user message
    contextMessages.push({ role: 'user', content: message });

    const openai = await getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: config.systemPrompt },
        ...contextMessages,
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    });

    const aiResponse = completion.choices[0]?.message?.content ?? '';

    // Persist user message first, then assistant response
    await prisma.autoResponseMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: message,
        requiresApproval: false,
        approved: true,
      },
    });

    await prisma.autoResponseMessage.create({
      data: {
        conversationId,
        role: 'assistant',
        content: aiResponse,
        requiresApproval,
        approved: requiresApproval ? null : true,
      },
    });

    return aiResponse;
  }

  // ─── Main entry point ─────────────────────────────────────────────────────

  async processMessage(
    message: string,
    chatId: string,
    contactName: string,
    requiresApproval = false
  ): Promise<{ response: string; type: 'rule' | 'ai' }> {
    // 1. Check keyword rules first
    const ruleResponse = await this.checkKeywordMatch(message);
    if (ruleResponse) {
      return { response: ruleResponse, type: 'rule' };
    }

    // 2. Fall back to OpenAI
    const conversation = await this.getOrCreateConversation(chatId, contactName);
    const aiResponse = await this.generateAIResponse(
      message,
      conversation.id,
      requiresApproval
    );

    return { response: aiResponse, type: 'ai' };
  }

  // ─── Approval workflow ────────────────────────────────────────────────────

  async approveMessage(messageId: string) {
    return prisma.autoResponseMessage.update({
      where: { id: messageId },
      data: { approved: true },
    });
  }

  async rejectMessage(messageId: string) {
    return prisma.autoResponseMessage.update({
      where: { id: messageId },
      data: { approved: false },
    });
  }

  async getPendingApprovals() {
    return prisma.autoResponseMessage.findMany({
      where: { requiresApproval: true, approved: null },
      include: { conversation: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const openaiAutoResponseService = new OpenAIAutoResponseService();

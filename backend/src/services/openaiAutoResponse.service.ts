import { prisma } from './database';

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const STOP_WORDS = new Set([
  'a', 'o', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'e', 'ou', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'pra', 'pro', 'com',
  'me', 'te', 'se', 'eu', 'voce', 'vc', 'vcs', 'ele', 'ela', 'eles', 'elas',
  'oi', 'ola', 'bom', 'boa', 'dia', 'tarde', 'noite', 'favor', 'pfv', 'porfavor',
  'qual', 'quais', 'que', 'como', 'tem', 'ter', 'sobre', 'info', 'informacao',
  'gostaria', 'queria', 'quero', 'saber', 'vai', 'ser', 'sera', 'pode', 'poderia',
]);

const SYNONYM_GROUPS = [
  ['preco', 'valor', 'custa', 'custo', 'custar', 'quanto', 'investimento', 'mensalidade', 'pagamento', 'pagar'],
  ['horario', 'hora', 'quando', 'comeca', 'inicio', 'inicia', 'iniciar', 'data', 'dia'],
  ['inscricao', 'matricula', 'inscrever', 'cadastro', 'entrar', 'participar', 'vaga', 'vagas'],
  ['curso', 'aula', 'treinamento', 'turma', 'formacao'],
  ['certificado', 'certificacao', 'certificar', 'diploma', 'comprovante'],
  ['duracao', 'tempo', 'demora', 'horas', 'dias'],
  ['endereco', 'local', 'onde', 'localizacao', 'presencial'],
  ['online', 'ead', 'distancia', 'remoto', 'virtual'],
];

function normalizeText(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }

  return matrix[b.length][a.length];
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(' ')
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function expandSynonyms(words: string[]) {
  const expanded = new Set(words);
  for (const word of words) {
    const group = getSynonymGroup(word);
    if (group) {
      group.forEach((item) => expanded.add(item));
    }
  }
  return expanded;
}

function getSynonymGroup(word: string) {
  return SYNONYM_GROUPS.find((items) => items.includes(word));
}

function isGenericIntent(word: string) {
  const group = getSynonymGroup(word);
  return !!group && group.includes('curso');
}

function isCloseWord(a: string, b: string) {
  if (a === b) return true;
  if (a.length <= 3 || b.length <= 3) return false;
  const allowedTypos = Math.min(a.length, b.length) <= 6 ? 1 : 2;
  return levenshtein(a, b) <= allowedTypos;
}

function wordMatchesTarget(messageWord: string, target: string) {
  if (isCloseWord(messageWord, target)) return true;
  const targetGroup = getSynonymGroup(target);
  return !!targetGroup && targetGroup.some((synonym) => isCloseWord(messageWord, synonym));
}

function splitRuleKeywords(keyword: string) {
  return keyword
    .split(/[,;\n|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scoreRuleMatch(message: string, keyword: string) {
  const normalizedMessage = normalizeText(message);
  const messageWords = tokenize(message);
  const expandedMessageWords = expandSynonyms(messageWords);
  let bestScore = 0;

  for (const variant of splitRuleKeywords(keyword)) {
    const normalizedVariant = normalizeText(variant);
    const variantWords = tokenize(variant);
    if (!normalizedVariant || variantWords.length === 0) continue;

    if (normalizedMessage.includes(normalizedVariant)) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }

    if (variantWords.length === 1) {
      const target = variantWords[0];
      const synonymHit = expandedMessageWords.has(target);
      const fuzzyHit = messageWords.some((word) => wordMatchesTarget(word, target));
      if (synonymHit || fuzzyHit) {
        bestScore = Math.max(bestScore, 78);
      }
      continue;
    }

    let matchedWords = 0;
    let matchedStrongIntent = false;
    for (const target of variantWords) {
      if (
        expandedMessageWords.has(target) ||
        messageWords.some((word) => wordMatchesTarget(word, target))
      ) {
        matchedWords++;
        if (!isGenericIntent(target)) {
          matchedStrongIntent = true;
        }
      }
    }

    const coverage = matchedWords / variantWords.length;
    if (coverage >= 0.75) {
      bestScore = Math.max(bestScore, Math.round(70 + coverage * 20));
    } else if (coverage >= 0.5 && matchedStrongIntent) {
      bestScore = Math.max(bestScore, 76);
    }
  }

  return bestScore;
}

// Lazy-load OpenAI so the app still starts if the package is not installed
async function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY nao configurada. Adicione sua chave no arquivo backend/.env e reinicie o servidor.'
    );
  }

  try {
    const { OpenAI } = await import('openai');
    return new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
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
            'Voce e um assistente de atendimento no WhatsApp. Responda sempre em portugues do Brasil, de forma objetiva, educada e natural. Se nao souber uma informacao, diga que vai encaminhar para um atendente humano.',
        },
      });
    }
    return {
      ...config,
      model: DEFAULT_MODEL,
      apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    };
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

    if (conversation) {
      if (contactName && conversation.contactName !== contactName) {
        conversation = await prisma.autoResponseConversation.update({
          where: { id: conversation.id },
          data: { contactName },
        });
      }
      return conversation;
    }

    return prisma.autoResponseConversation.create({
      data: { configId: config.id, chatId, contactName },
    });
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
    let bestMatch: { response: string; score: number; priority: number; keyword: string } | null = null;

    for (const rule of enabledRules) {
      const score = scoreRuleMatch(message, rule.keyword);
      if (score < 70) continue;

      if (
        !bestMatch ||
        score > bestMatch.score ||
        (score === bestMatch.score && rule.priority > bestMatch.priority)
      ) {
        bestMatch = {
          response: rule.response,
          score,
          priority: rule.priority,
          keyword: rule.keyword,
        };
      }
    }

    if (bestMatch) {
      console.log(`[RuleAutoResponse] Match "${bestMatch.keyword}" score=${bestMatch.score}`);
      return bestMatch.response;
    }

    console.log(`[RuleAutoResponse] Nenhuma regra combinou com "${message}"`);
    return null;
  }

  private async persistExchange(
    conversationId: string,
    message: string,
    response: string,
    requiresApproval: boolean
  ) {
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
        content: response,
        requiresApproval,
        approved: requiresApproval ? null : true,
      },
    });
  }

  private async persistIncomingMessage(conversationId: string, message: string) {
    await prisma.autoResponseMessage.create({
      data: {
        conversationId,
        role: 'user',
        content: message,
        requiresApproval: false,
        approved: true,
      },
    });
  }

  // ─── AI response generation ───────────────────────────────────────────────

  async generateAIResponse(
    message: string,
    conversationId: string,
    requiresApproval = false
  ): Promise<string> {
    const config = await prisma.autoResponseConfig.findFirst();
    if (!config) {
      throw new Error('Configuracao de resposta automatica nao encontrada');
    }

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
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: config.systemPrompt },
        ...contextMessages,
      ],
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    });

    const aiResponse = completion.choices[0]?.message?.content?.trim() ?? '';
    if (!aiResponse) {
      throw new Error('A OpenAI retornou uma resposta vazia.');
    }

    await this.persistExchange(conversationId, message, aiResponse, requiresApproval);

    return aiResponse;
  }

  // ─── Main entry point ─────────────────────────────────────────────────────

  async processMessage(
    message: string,
    chatId: string,
    contactName: string,
    requiresApproval = false
  ): Promise<{ response: string | null; type: 'rule' | 'manual' }> {
    const config = await this.getConfig();
    if (!config?.enabled) {
      throw new Error('Resposta automatica esta desativada.');
    }

    const conversation = await this.getOrCreateConversation(chatId, contactName);

    // 1. Check keyword rules first
    const ruleResponse = await this.checkKeywordMatch(message);
    if (ruleResponse) {
      await this.persistExchange(conversation.id, message, ruleResponse, requiresApproval);
      return { response: ruleResponse, type: 'rule' };
    }

    // 2. No matching rule: keep the conversation for manual atendimento.
    // This mode intentionally does not call any paid AI provider.
    await this.persistIncomingMessage(conversation.id, message);
    return { response: null, type: 'manual' };
  }

  // ─── Approval workflow ────────────────────────────────────────────────────

  async approveMessage(messageId: string) {
    return prisma.autoResponseMessage.update({
      where: { id: messageId },
      data: { approved: true },
      include: { conversation: true },
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

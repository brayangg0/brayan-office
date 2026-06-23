import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();
const anthropic = new Anthropic();

interface ConversationContext {
  contactId: string;
  cityId?: string;
  cityName?: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  metadata?: {
    lastCityQuestion?: string;
    cityIdentified?: boolean;
    identifiedAt?: Date;
  };
}

export class ConversationMemoryService {
  private conversationContexts = new Map<string, ConversationContext>();

  /**
   * Inicializa ou recupera o contexto de conversa de um contato
   */
  async initializeContext(contactId: string): Promise<ConversationContext> {
    // Se já existe em memória, retorna
    if (this.conversationContexts.has(contactId)) {
      return this.conversationContexts.get(contactId)!;
    }

    // Busca no banco de dados
    const studentCity = await prisma.studentCity.findUnique({
      where: { contactId },
      include: { city: true },
    });

    const context: ConversationContext = {
      contactId,
      cityId: studentCity?.cityId,
      cityName: studentCity?.city?.name,
      conversationHistory: [],
      metadata: {
        cityIdentified: !!studentCity?.cityId,
        identifiedAt: studentCity?.updatedAt,
      },
    };

    this.conversationContexts.set(contactId, context);
    return context;
  }

  /**
   * Adiciona uma mensagem ao histórico de conversa
   */
  addMessageToHistory(
    contactId: string,
    role: 'user' | 'assistant',
    content: string
  ) {
    const context = this.conversationContexts.get(contactId);
    if (!context) return;

    context.conversationHistory.push({ role, content });

    // Mantém apenas as últimas 20 mensagens para não sobrecarregar
    if (context.conversationHistory.length > 20) {
      context.conversationHistory = context.conversationHistory.slice(-20);
    }
  }

  /**
   * Identifica a cidade e armazena na memória
   */
  async identifyAndStoreCity(
    contactId: string,
    userMessage: string
  ): Promise<{ cityId: string; cityName: string } | null> {
    const context = await this.initializeContext(contactId);

    // Se já identificou, não identifica novamente
    if (context.metadata?.cityIdentified) {
      return {
        cityId: context.cityId!,
        cityName: context.cityName!,
      };
    }

    // Busca todas as cidades
    const cities = await prisma.city.findMany({
      where: { active: true },
      select: { id: true, name: true, state: true },
    });

    if (cities.length === 0) {
      return null;
    }

    const citiesList = cities.map((c) => `${c.name} (${c.state})`).join(', ');

    // Usa IA para identificar
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: `O usuário respondeu: "${userMessage}"
          
Cidades disponíveis: ${citiesList}

Identifique qual cidade o usuário mencionou. Responda APENAS com o nome exato da cidade (ex: "São Paulo") ou "NENHUMA" se não conseguir identificar.`,
        },
      ],
    });

    const response = message.content[0];
    if (response.type !== 'text') {
      return null;
    }

    const identifiedCityName = response.text.trim();

    if (identifiedCityName === 'NENHUMA') {
      return null;
    }

    const city = cities.find(
      (c) => c.name.toLowerCase() === identifiedCityName.toLowerCase()
    );

    if (!city) {
      return null;
    }

    // Armazena no banco de dados
    await prisma.studentCity.upsert({
      where: { contactId },
      update: {
        cityId: city.id,
        cityAnswer: userMessage,
        status: 'identified',
      },
      create: {
        contactId,
        cityId: city.id,
        cityAnswer: userMessage,
        status: 'identified',
      },
    });

    // Armazena na memória
    context.cityId = city.id;
    context.cityName = city.name;
    context.metadata = {
      ...context.metadata,
      cityIdentified: true,
      identifiedAt: new Date(),
    };

    return {
      cityId: city.id,
      cityName: city.name,
    };
  }

  /**
   * Gera resposta personalizada usando a memória de conversa
   */
  async generatePersonalizedResponse(
    contactId: string,
    userMessage: string,
    responseType: string = 'custom'
  ): Promise<string> {
    const context = await this.initializeContext(contactId);

    // Adiciona mensagem do usuário ao histórico
    this.addMessageToHistory(contactId, 'user', userMessage);

    let systemPrompt = `Você é um assistente de atendimento ao cliente para um programa de treinamento.
Responda de forma amigável, profissional e concisa.`;

    // Se tem cidade identificada, personaliza a resposta
    if (context.cityId && context.cityName) {
      // Busca respostas personalizadas da cidade
      const cityResponses = await prisma.cityResponse.findMany({
        where: {
          cityId: context.cityId,
          active: true,
        },
        orderBy: { order: 'asc' },
      });

      if (cityResponses.length > 0) {
        const responsesText = cityResponses
          .map((r) => `[${r.type}]: ${r.message}`)
          .join('\n');

        systemPrompt += `

O aluno é de ${context.cityName}.
Aqui estão as informações personalizadas para essa cidade:
${responsesText}

Use essas informações para personalizar suas respostas quando relevante.`;
      }
    }

    // Constrói o histórico de conversa para o Claude
    const messages = context.conversationHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    // Adiciona a mensagem atual se não estiver no histórico
    if (
      messages.length === 0 ||
      messages[messages.length - 1].content !== userMessage
    ) {
      messages.push({
        role: 'user',
        content: userMessage,
      });
    }

    // Gera resposta com Claude
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages,
    });

    const assistantMessage = response.content[0];
    if (assistantMessage.type !== 'text') {
      return 'Desculpe, não consegui processar sua mensagem.';
    }

    const responseText = assistantMessage.text;

    // Armazena resposta na memória
    this.addMessageToHistory(contactId, 'assistant', responseText);

    return responseText;
  }

  /**
   * Obtém o contexto de conversa de um contato
   */
  getContext(contactId: string): ConversationContext | undefined {
    return this.conversationContexts.get(contactId);
  }

  /**
   * Limpa o contexto de conversa (quando a conversa termina)
   */
  clearContext(contactId: string) {
    this.conversationContexts.delete(contactId);
  }

  /**
   * Obtém o resumo da conversa
   */
  getConversationSummary(contactId: string): {
    contactId: string;
    city?: string;
    messageCount: number;
    lastMessages: Array<{ role: string; content: string }>;
  } | null {
    const context = this.conversationContexts.get(contactId);
    if (!context) return null;

    return {
      contactId,
      city: context.cityName,
      messageCount: context.conversationHistory.length,
      lastMessages: context.conversationHistory.slice(-5),
    };
  }
}

export const conversationMemoryService = new ConversationMemoryService();


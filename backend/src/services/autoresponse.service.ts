import { prisma } from './database';
import { whatsappService } from './whatsapp.service';

interface AutoResponseRule {
  id: string;
  trigger: string; // palavras-chave ou regex
  response: string;
  type: 'text' | 'template';
  enabled: boolean;
  delay?: number; // ms antes de responder
}

class AutoResponseService {
  private rules: AutoResponseRule[] = [];
  private isProcessing = false;

  async initialize() {
    console.log('[AutoResponse] Inicializando serviço de autorresposta...');
    await this.loadRules();
  }

  private async loadRules() {
    try {
      // Busca templates ativos do banco
      const templates = await prisma.messageTemplate.findMany({
        where: { active: true }
      });

      // Aqui você pode carregar regras de autorresponse do banco
      // Por enquanto, vamos usar templates como base
      console.log(`[AutoResponse] ${templates.length} templates carregados`);
    } catch (err) {
      console.error('[AutoResponse] Erro ao carregar regras:', err);
    }
  }

  /**
   * Processa mensagem de entrada e responde se houver match
   */
  async processIncomingMessage(contactId: string, phone: string, message: string): Promise<boolean> {
    try {
      console.log(`[AutoResponse] Processando mensagem: "${message}" de ${phone}`);
      
      if (this.isProcessing) {
        console.log('[AutoResponse] ⊘ Já está processando outra mensagem');
        return false;
      }

      // Busca contato
      const contact = await prisma.contact.findUnique({ where: { id: contactId } });
      if (!contact) {
        console.log('[AutoResponse] ❌ Contato não encontrado');
        return false;
      }

      // Verifica se contato não está bloqueado
      if (contact.status === 'blocked' || contact.status === 'inactive') {
        console.log(`[AutoResponse] ⊘ Contato ${contact.name} está ${contact.status}`);
        return false;
      }

      // Normaliza mensagem para busca
      const normalizedMsg = message.toLowerCase().trim();

      // Procura por trigger que combina
      const rule = await this.findMatchingRule(normalizedMsg);
      if (!rule) {
        console.log(`[AutoResponse] ℹ Nenhuma regra combinou para: "${message}"`);
        return false;
      }

      this.isProcessing = true;

      // Aguarda delay se configurado
      if (rule.delay) {
        console.log(`[AutoResponse] ⏳ Aguardando ${rule.delay}ms antes de responder...`);
        await new Promise(r => setTimeout(r, rule.delay));
      }

      // Envia resposta
      const formattedResponse = this.substituteVariables(rule.response, contact);
      console.log(`[AutoResponse] 📤 Enviando resposta para ${contact.name}: "${formattedResponse}"`);
      await whatsappService.sendText(phone, formattedResponse);

      // Log da autorresposta
      await prisma.message.create({
        data: {
          contactId,
          direction: 'outbound',
          type: 'text',
          body: formattedResponse,
          status: 'sent',
        }
      });

      console.log(`[AutoResponse] ✅ Resposta enviada para ${contact.name}`);
      return true;

    } catch (err) {
      console.error('[AutoResponse] ❌ Erro ao processar autorresposta:', err);
      return false;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Encontra regra que combina com mensagem
   */
  private async findMatchingRule(message: string): Promise<AutoResponseRule | null> {
    try {
      // 1. Primeiro tenta templates customizados do banco
      const templates = await prisma.messageTemplate.findMany({
        where: { active: true }
      });

      for (const template of templates) {
        // Usa o nome do template como palavras-chave
        const keywords = template.name.toLowerCase().split(/\s+/);
        
        // Se a mensagem contém alguma palavra-chave do template, usa ele
        if (keywords.some(kw => message.includes(kw))) {
          console.log(`[AutoResponse] Match encontrado: "${template.name}"`);
          return {
            id: template.id,
            trigger: template.name,
            response: template.body || template.name,
            type: 'text',
            enabled: true,
            delay: 500
          };
        }
      }

      // 2. Se nenhum template customizado combinou, usa keywords default
      const defaultKeywords = [
        { trigger: 'horário|hora|quando|começa', response: 'O curso começa às 19h. Dúvidas?' },
        { trigger: 'duração|tempo|quanto tempo|quanto demora', response: 'O curso tem 40 horas de duração.' },
        { trigger: 'preço|custa|valor|quanto custa', response: 'Entre em contato conosco para saber o preço especial do seu plano.' },
        { trigger: 'inscrição|matrícula|como faço', response: 'Para se inscrever, clique no link' },
        { trigger: 'dúvida|duvida|problema|ajuda|help', response: 'Oi! Como posso te ajudar?' },
      ];

      for (const kw of defaultKeywords) {
        const regex = new RegExp(kw.trigger, 'gi');
        if (regex.test(message)) {
          console.log(`[AutoResponse] Match padrão encontrado: "${kw.trigger}"`);
          return {
            id: kw.trigger,
            trigger: kw.trigger,
            response: kw.response,
            type: 'text',
            enabled: true,
            delay: 1000
          };
        }
      }

      console.log(`[AutoResponse] Nenhuma regra combinou com: "${message}"`);
      return null;
    } catch (err) {
      console.error('[AutoResponse] Erro ao buscar regras:', err);
      return null;
    }
  }

  /**
   * Substitui variáveis na mensagem ({{nome}}, {{curso}}, etc)
   */
  private substituteVariables(text: string, contact: any): string {
    let result = text;

    result = result.replace(/\{\{nome\}\}/gi, contact.name);
    result = result.replace(/\{\{phone\}\}/gi, contact.phone);
    result = result.replace(/\{\{email\}\}/gi, contact.email || 'não informado');

    return result;
  }

  /**
   * Busca templates customizados
   */
  async getTemplates() {
    return await prisma.messageTemplate.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Cria template para autorresponse
   */
  async createTemplate(data: {
    name: string;
    type: 'text' | 'image' | 'audio' | 'video' | 'document';
    body?: string;
    mediaPath?: string;
    variables?: string[];
  }) {
    return await prisma.messageTemplate.create({
      data: {
        name: data.name,
        type: data.type,
        body: data.body,
        mediaPath: data.mediaPath,
        variables: JSON.stringify(data.variables || []),
        active: true
      }
    });
  }

  /**
   * Habilita/desabilita autorresponse global
   */
  async toggleAutoResponse(enabled: boolean) {
    // Você pode adicionar uma tabela de configuração no banco
    console.log(`[AutoResponse] Autorresponse ${enabled ? 'ativado' : 'desativado'}`);
  }
}

export const autoResponseService = new AutoResponseService();

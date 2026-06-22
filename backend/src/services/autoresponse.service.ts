import { prisma } from './database';
import { whatsappService } from './whatsapp.service';

// --- Helpers para Fuzzy Matching ---
function removeAccents(str: string): string {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
}

function levenshtein(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export function fuzzyMatchPhrase(message: string, triggerPhrase: string): boolean {
    const msgWords = removeAccents(message).split(/\s+/).filter(w => w.length > 0);
    const triggerWords = removeAccents(triggerPhrase).split(/\s+/).filter(w => w.length > 0);
    
    if (triggerWords.length === 0) return false;
    if (msgWords.length < triggerWords.length) return false;

    // Sliding window over user message
    for (let i = 0; i <= msgWords.length - triggerWords.length; i++) {
        let matchCount = 0;
        for (let j = 0; j < triggerWords.length; j++) {
            const mWord = msgWords[i + j];
            const tWord = triggerWords[j];
            
            const allowedTypos = tWord.length <= 3 ? 0 : (tWord.length <= 6 ? 1 : 2);
            
            if (levenshtein(mWord, tWord) <= allowedTypos) {
                matchCount++;
            } else {
                break;
            }
        }
        if (matchCount === triggerWords.length) {
            return true;
        }
    }
    return false;
}
// -----------------------------------

function normalizeMenuText(text: string): string {
  return removeAccents(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMenuOption(message: string): number | null {
  const normalized = normalizeMenuText(message);
  const compact = normalized.replace(/\s+/g, '');

  const directMatch = compact.match(/^(?:opcao|op|alternativa|numero|n)?([1-4])$/);
  if (directMatch) return Number(directMatch[1]);

  const looseMatch = normalized.match(/\b(?:opcao|op|alternativa|numero|n)?\s*([1-4])\b/);
  if (looseMatch) return Number(looseMatch[1]);

  const wordOptions: Record<string, number> = {
    um: 1,
    uma: 1,
    primeiro: 1,
    primeira: 1,
    dois: 2,
    segundo: 2,
    segunda: 2,
    tres: 3,
    terceiro: 3,
    terceira: 3,
    quatro: 4,
    quarto: 4,
    quarta: 4,
  };

  for (const [word, option] of Object.entries(wordOptions)) {
    if (new RegExp(`\\b${word}\\b`).test(normalized)) return option;
  }

  return null;
}

function isMenuRequest(message: string): boolean {
  const normalized = normalizeMenuText(message);
  return [
    'menu',
    'opcoes',
    'opcao',
    'atendimento',
    'ajuda',
    'ola',
    'oi',
    'bom dia',
    'boa tarde',
    'boa noite',
    'voltar',
    'inicio',
  ].some((trigger) => fuzzyMatchPhrase(normalized, trigger));
}

function parseQaRules(rawRules: string | null | undefined): { question: string; answer: string }[] {
  try {
    const parsed = JSON.parse(rawRules || '[]');
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((rule) => ({
        question: String(rule?.question || '').trim(),
        answer: String(rule?.answer || '').trim(),
      }))
      .filter((rule) => rule.question && rule.answer);
  } catch {
    return [];
  }
}

function findQaAnswer(message: string, rawRules: string | null | undefined): string | null {
  const rules = parseQaRules(rawRules);

  for (const rule of rules) {
    const variants = rule.question
      .split(/[,;\n|/]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (variants.some((variant) => fuzzyMatchPhrase(message, variant))) {
      return rule.answer;
    }
  }

  return null;
}

interface AutoResponseRule {
  id: string;
  trigger: string;
  response: string;
  tag?: string; // NOVO: Etiqueta opcional para aplicar ao contato
  type: 'text' | 'template';
  enabled: boolean;
  delay?: number;
}

class AutoResponseService {
  private rules: AutoResponseRule[] = [];
  private isProcessing = false;
  private isEnabled = false; // DESATIVADO por padrão conforme solicitado
  private recentlyGreeted: Map<string, number> = new Map();
  private MENU_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 horas

  // Memória para o Follow-Up de Inatividade (5 minutos)
  private lastBotResponseTime: Map<string, number> = new Map();
  private lastUserMessageTime: Map<string, number> = new Map();
  private lastManualMessageTime: Map<string, number> = new Map(); // NOVO: Pausa manual
  private followUpSent: Map<string, boolean> = new Map();
  private contactPhones: Map<string, string> = new Map();
  private MANUAL_PAUSE_MS = 10 * 60 * 1000; // 10 minutos de pausa
  private aiMenuSent: Map<string, boolean> = new Map();

  async initialize() {
    console.log('[AutoResponse] Inicializando serviço de autorresposta...');
    await this.loadRules();
    
    // Varredura de inatividade a cada 1 minuto (60.000 ms)
    setInterval(() => this.checkInactivity(), 60000);
  }

  private async loadRules() {
    try {
      // Busca templates ativos do banco
      const templates = await prisma.messageTemplate.findMany({
        where: { active: true }
      });
      console.log(`[AutoResponse] ${templates.length} templates carregados`);
    } catch (err) {
      console.error('[AutoResponse] Erro ao carregar regras:', err);
    }
  }

  private async checkInactivity() {
    const now = Date.now();
    const FIVE_MINUTES_MS = 5 * 60 * 1000;

    for (const [contactId, botTime] of this.lastBotResponseTime.entries()) {
      if (!this.isEnabled) continue; // Pula se automação global estiver desativada

      const userTime = this.lastUserMessageTime.get(contactId) || 0;
      
      // Se não enviou follow up ainda, e robô falou por último, e passou de 5 mins
      const lastManual = this.lastManualMessageTime.get(contactId) || 0;
      const isPaused = (now - lastManual) < this.MANUAL_PAUSE_MS;

      if (!isPaused && !this.followUpSent.get(contactId) && botTime > userTime && (now - botTime) >= FIVE_MINUTES_MS) {
         
         const phone = this.contactPhones.get(contactId);
         if (!phone) continue;

         // Previne enviar multiplas vezes no mesmo loop
         this.followUpSent.set(contactId, true);
         
         try {
           const contact = await prisma.contact.findUnique({ where: { id: contactId } });
           if (!contact) continue;
           
           let followUpMsg = `Oi {{nome}}, percebi que você parou de responder. Posso ajudar em mais alguma coisa ou tirar mais alguma dúvida?`;
           
           const allTemplates = await prisma.messageTemplate.findMany({ where: { active: true } });
           const customTemplate = allTemplates.find(t => t.name.trim().toLowerCase() === 'retorno' || t.name.trim().toLowerCase() === 'inatividade');
           if (customTemplate && customTemplate.body) {
             followUpMsg = customTemplate.body;
           }

           const formatted = this.substituteVariables(followUpMsg, contact);
           console.log(`[AutoResponse] ⏰ Disparando follow-up de 5 minutos para ${contact.name}`);
           await whatsappService.sendText(phone, formatted);
           
           // O salvamento no histórico agora é feito centralmente pelo whatsapp.service.ts (message_create)
           
           // Atualiza timer do bot pra engatar o relógio novamente se preciso
           this.lastBotResponseTime.set(contactId, Date.now());
           
         } catch(e) {
            console.error('[AutoResponse] Erro no checkInactivity:', e);
         }
      }
    }
  }

  /**
   * Processa mensagem de entrada e responde se houver match
   */
  async processIncomingMessage(contactId: string, phone: string, message: string): Promise<boolean> {
    try {
      console.log(`[AutoResponse] Processando mensagem: "${message}" de ${phone}`);

      // -- Registra iteração do usuário --
      this.lastUserMessageTime.set(contactId, Date.now());
      this.followUpSent.set(contactId, false);
      this.contactPhones.set(contactId, phone);

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

      // Check if AI Auto-Response is enabled (runs independently of global automation toggle)
      const aiConfig = await (prisma as any).aIAutoResponse.findUnique({ where: { id: 'default' } });
      if (aiConfig?.enabled) {
        const aiResult = await this.handleAIAutoResponse(contactId, phone, message);
        if (aiResult) {
          this.isProcessing = false;
          return true;
        }
      }

      if (!this.isEnabled) {
        console.log(`[AutoResponse] ℹ Automação DESATIVADA globalmente. Ignorando mensagem de ${phone}`);
        return false;
      }

      // -- Verifica se o robô está em modo de "Pausa Manual" (Intervenção humana)
      const lastManual = this.lastManualMessageTime.get(contactId) || 0;
      if (Date.now() - lastManual < this.MANUAL_PAUSE_MS) {
        console.log(`[AutoResponse] 🛑 Robô em SILÊNCIO para ${phone} (Intervenção manual nas últimas 1h)`);
        return false;
      }
      
      if (this.isProcessing) {
        console.log('[AutoResponse] ⊘ Já está processando outra mensagem');
        return false;
      }

      // Normaliza mensagem para busca
      const normalizedMsg = message.toLowerCase().trim();

      // Procura por trigger que combina
      const rule = await this.findMatchingRule(normalizedMsg);
      this.isProcessing = true;

      if (!rule) {
        // Fallback: Menu de Boas Vindas
        const now = Date.now();
        const lastGreet = this.recentlyGreeted.get(contact.id) || 0;
        
        // Se conversou recetemente (últimas 6 horas), não mandar o menu
        if (now - lastGreet < this.MENU_COOLDOWN_MS) {
           console.log(`[AutoResponse] ℹ Nenhuma regra e Menu em Cooldown para: ${contact.name}`);
           this.isProcessing = false;
           return false;
        }

        // Se nunca conversou ou já passou as 6h, enviamos o Menu
        let menuMsg = `Olá, seja bem-vindo(a) ao nosso atendimento! {{nome}}, selecione algumas opções abaixo para você tirar suas dúvidas:\n\n1️⃣ Valor do curso\n2️⃣ Suporte\n3️⃣ Segunda via\n\nResponda apenas com o número desejado.`;
        
        // Busca se existe um template customizado pelo usuário para substituir o menu
        const customMenu = await prisma.messageTemplate.findFirst({
            where: { active: true }
        });
        // Como o SQLite não suporta CI nativo facilmente, buscamos todos ou validamos no JS
        const allTemplates = await prisma.messageTemplate.findMany({ where: { active: true } });
        const menuTemplate = allTemplates.find(t => t.name.trim().toLowerCase() === 'menu de opções' || t.name.trim().toLowerCase() === 'menu principal');
        
        if (menuTemplate && menuTemplate.body) {
            menuMsg = menuTemplate.body;
        }

        const formattedMenu = this.substituteVariables(menuMsg, contact);
        
        console.log(`[AutoResponse] 📤 Enviando Menu para ${contact.name}`);
        await whatsappService.sendText(phone, formattedMenu);
        this.recentlyGreeted.set(contact.id, now);
        this.lastBotResponseTime.set(contactId, Date.now());
        
        // O salvamento no histórico agora é feito centralmente pelo whatsapp.service.ts (message_create)
        
        this.isProcessing = false;
        return true;
      }
      
      // Se encontrou alguma regra específica (como "1" ou "boa tarde"), atualiza a memória de saudação
      this.recentlyGreeted.set(contact.id, Date.now());

      // Aguarda delay se configurado
      if (rule.delay) {
        console.log(`[AutoResponse] ⏳ Aguardando ${rule.delay}ms antes de responder...`);
        await new Promise(r => setTimeout(r, rule.delay));
      }

      // Envia resposta
      const formattedResponse = this.substituteVariables(rule.response, contact);
      console.log(`[AutoResponse] 📤 Enviando resposta para ${contact.name}: "${formattedResponse}"`);
      await whatsappService.sendText(phone, formattedResponse);
      this.lastBotResponseTime.set(contactId, Date.now());

      // -- NOVO: Aplica etiqueta automática se houver --
      if (rule.tag) {
        try {
          const currentTags = JSON.parse(contact.tags || '[]');
          if (Array.isArray(currentTags) && !currentTags.includes(rule.tag)) {
            const updatedTags = [...currentTags, rule.tag];
            await prisma.contact.update({
              where: { id: contactId },
              data: { tags: JSON.stringify(updatedTags) }
            });
            console.log(`[AutoResponse] 🏷️ Etiqueta "${rule.tag}" aplicada ao contato ${contact.name}`);
          }
        } catch (e) {
          console.error('[AutoResponse] Erro ao aplicar etiqueta:', e);
        }
      }

      // Log da autorresposta (removido para evitar duplicidade, message_create cuidará disso)
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
   * Handles AI auto-response menu logic
   */
  private async handleAIAutoResponse(contactId: string, phone: string, message: string): Promise<boolean> {
    try {
      const config = await (prisma as any).aIAutoResponse.findUnique({ where: { id: 'default' } });
      if (!config?.enabled) return false;

      const optionNumber = extractMenuOption(message);
      const isValidOption = optionNumber !== null && [1, 2, 3, 4].includes(optionNumber);
      const existingState = await (prisma as any).conversationState.findUnique({ where: { contactId } });
      const hasReceivedMenu = this.aiMenuSent.get(contactId) || !!existingState;
      const shouldSendMenu = !hasReceivedMenu || isMenuRequest(message);

      if (isValidOption) {
        // User selected a valid option
        const fieldName = `option${optionNumber}` as 'option1' | 'option2' | 'option3' | 'option4';
        const optionResponse = config[fieldName];

        if (!optionResponse) {
          await whatsappService.sendText(phone, config.welcomeMessage);
          this.aiMenuSent.set(contactId, true);
          return true;
        }

        await whatsappService.sendText(phone, optionResponse);

        // Persist conversation state
        await (prisma as any).conversationState.upsert({
          where: { contactId },
          update: { lastOption: optionNumber },
          create: { contactId, lastOption: optionNumber },
        });

        this.lastBotResponseTime.set(contactId, Date.now());
        return true;
      }

      const qaAnswer = findQaAnswer(message, config.qaRules);
      if (qaAnswer) {
        await whatsappService.sendText(phone, qaAnswer);
        this.lastBotResponseTime.set(contactId, Date.now());
        return true;
      } else if (shouldSendMenu) {
        // First message or explicit menu request - send the menu.
        await whatsappService.sendText(phone, config.welcomeMessage);

        // Mark that menu has been sent
        this.aiMenuSent.set(contactId, true);

        // Reset conversation state
        await (prisma as any).conversationState.upsert({
          where: { contactId },
          update: { lastOption: null },
          create: { contactId, lastOption: null },
        });

        this.lastBotResponseTime.set(contactId, Date.now());
        return true;
      } else {
        // Menu already sent and user sent invalid text - don't respond
        return false;
      }

    } catch (err) {
      console.error('[AutoResponse] Erro ao processar AI auto-response:', err);
      return false;
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
        // Usa o nome do template inteiro como frase-chave. Permite vírgulas para múltiplas frases.
        const triggerPhrases = template.name.toLowerCase().split(',').map(s => s.trim());
        
        // Se a mensagem contém alguma frase inteira do template, de forma aproximada (fuzzy e sem acento)
        if (triggerPhrases.some(phrase => phrase.length > 0 && fuzzyMatchPhrase(message, phrase))) {
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

        // NOVO: Verifica as 'Ações Rápidas' filhas dentro de variables
        try {
          const parsedVars = JSON.parse(template.variables || '[]');
          if (Array.isArray(parsedVars)) {
            for (const childOption of parsedVars) {
               if (!childOption.trigger || !childOption.response) continue;
               const childTriggers = childOption.trigger.toLowerCase().split(',').map((s: string) => s.trim());
               if (childTriggers.some((phrase: string) => phrase.length > 0 && fuzzyMatchPhrase(message, phrase))) {
                 console.log(`[AutoResponse] Match encontrado em Ação Aninhada de "${template.name}": "${childOption.trigger}"`);
                 return {
                   id: `${template.id}-opt-${childOption.trigger}`,
                   trigger: childOption.trigger,
                   response: childOption.response,
                   tag: childOption.tag, // NOVO: Extrai a tag da ação aninhada
                   type: 'text',
                   enabled: true,
                   delay: 500
                 };
               }
            }
          }
        } catch(e) {}
      }

      // 2. Se nenhum template customizado combinou, usa keywords default
      const defaultKeywords = [
        { trigger: 'horário, hora, quando, começa', response: 'O curso começa às 19h. Dúvidas?' },
        { trigger: 'duração, tempo, quanto tempo, quanto demora', response: 'O curso tem 40 horas de duração.' },
        { trigger: 'preço, custa, valor, quanto custa', response: 'Entre em contato conosco para saber o preço especial do seu plano.' },
        { trigger: 'inscrição, matrícula, como faço', response: 'Para se inscrever, clique no link' },
        { trigger: 'dúvida, problema, ajuda, help', response: 'Oi! Como posso te ajudar?' },
      ];

      for (const kw of defaultKeywords) {
        const triggerPhrases = kw.trigger.split(',').map(s => s.trim());
        if (triggerPhrases.some(phrase => phrase.length > 0 && fuzzyMatchPhrase(message, phrase))) {
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
    this.isEnabled = enabled;
    console.log(`[AutoResponse] Autorresponse ${enabled ? 'ativado' : 'desativado'}`);
  }
  /**
   * Registra uma mensagem manual do dono (para pausar o bot)
   */
  registerManualMessage(contactId: string) {
    const now = Date.now();
    const lastBot = this.lastBotResponseTime.get(contactId) || 0;

    // Se o robô acabou de falar (nos últimos 3 segundos), não é intervenção manual
    if (now - lastBot < 3000) {
      return; 
    }

    console.log(`[AutoResponse] 👤 Intervenção manual detectada para ${contactId}. Bot pausado por 10 min.`);
    this.lastManualMessageTime.set(contactId, now);
  }
}

export const autoResponseService = new AutoResponseService();

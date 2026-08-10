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

export function extractMenuOption(message: string): number | null {
  const normalized = normalizeMenuText(message);
  const compact = normalized.replace(/\s+/g, '');

  const directMatch = compact.match(/^(?:opcao|op|alternativa|numero|n)?([1-4])$/);
  if (directMatch) return Number(directMatch[1]);

  // Em frases maiores, só considera uma escolha quando o usuário escreve
  // explicitamente "opção", "alternativa" ou "número". Assim, quantidades
  // como "dá para fazer 1 máquina?" não são confundidas com a opção 1.
  const explicitMatch = normalized.match(
    /\b(?:opcao|op|alternativa|numero|n)\s*([1-4])\b/
  );
  if (explicitMatch) return Number(explicitMatch[1]);

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
    if (
      normalized === word ||
      new RegExp(`^(?:opcao|op|alternativa|numero|n)\\s+${word}$`).test(normalized)
    ) {
      return option;
    }
  }

  return null;
}

export function isClosingMessage(message: string): boolean {
  const normalized = normalizeMenuText(message);
  if (!normalized) return false;

  if (/\b(mas|porem|ainda|outra|tenho duvida|nao resolveu|nao consegui|preciso)\b/.test(normalized)) {
    return false;
  }

  return [
    'obrigado',
    'obrigada',
    'muito obrigado',
    'muito obrigada',
    'valeu',
    'era so isso',
    'e so isso',
    'ate mais',
    'tchau',
    'resolveu meu problema',
    'problema resolvido',
    'consegui resolver',
    'deu certo',
    'nao preciso de mais nada',
  ].some((phrase) => fuzzyMatchPhrase(normalized, phrase));
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

const QA_STOP_WORDS = new Set([
  'a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no',
  'um', 'uma', 'que', 'qual', 'quais', 'como', 'sobre', 'me', 'fala', 'falar',
  'gostaria', 'queria', 'quero', 'saber', 'tem', 'vai', 'ser', 'eh', 'dia',
  'para', 'pra', 'pro', 'por', 'favor', 'oq', 'fazer', 'faco', 'meu', 'minha',
  'fica', 'ficam',
  // "aula" e "curso" aparecem em quase todas as perguntas e não definem a intenção.
  'aula', 'curso',
]);

const QA_SYNONYM_GROUPS = [
  ['local', 'lugar', 'endereco', 'onde', 'localizacao'],
  ['data', 'quando', 'dia'],
  ['horario', 'hora'],
  ['preco', 'valor', 'custa', 'custar', 'custo', 'quanto', 'pagamento', 'pagar', 'investimento'],
  ['inscricao', 'inscrever', 'inscrevo', 'matricula', 'matricular', 'cadastro', 'cadastrar', 'participar'],
  ['requisito', 'requisitos', 'necessario', 'necessarios', 'precisa', 'preciso', 'exigencia', 'exigencias'],
  ['documento', 'documentos', 'documentacao', 'rg', 'cpf'],
  ['certificado', 'certificacao', 'diploma'],
  ['duracao', 'tempo', 'demora', 'carga', 'horas'],
  ['online', 'ead', 'remoto', 'virtual', 'distancia'],
  ['pratica', 'pratico', 'praticas'],
  ['teoria', 'teorica', 'teorico'],
];

function qaIntentWords(text: string): string[] {
  return normalizeMenuText(text)
    .split(' ')
    .filter((word) => word.length > 1 && !QA_STOP_WORDS.has(word));
}

function qaWordsMatch(left: string, right: string): boolean {
  if (left === right) return true;

  // Primeiro localiza o grupo mesmo quando uma palavra veio com erro de digitação
  // (por exemplo: "inscrevr", "matriculla" ou "documetos").
  const exactLeftGroup = QA_SYNONYM_GROUPS.find((items) => items.includes(left));
  const fuzzyLeftGroup = QA_SYNONYM_GROUPS.find((items) =>
    items.some((item) => {
      const allowedTypos = Math.min(left.length, item.length) <= 6 ? 1 : 2;
      return left.length > 3 && levenshtein(left, item) <= allowedTypos;
    })
  );
  const leftGroup = exactLeftGroup || fuzzyLeftGroup;
  if (leftGroup?.some((item) => {
    const allowedTypos = Math.min(right.length, item.length) <= 6 ? 1 : 2;
    return right === item || (right.length > 3 && levenshtein(right, item) <= allowedTypos);
  })) return true;

  const allowedTypos = Math.min(left.length, right.length) <= 6 ? 1 : 2;
  return left.length > 3 && right.length > 3 && levenshtein(left, right) <= allowedTypos;
}

function scoreQaVariant(message: string, variant: string): number {
  if (fuzzyMatchPhrase(message, variant)) return 100;

  const messageWords = qaIntentWords(message);
  const variantWords = qaIntentWords(variant);
  if (messageWords.length === 0 || variantWords.length === 0) return 0;

  // Uma pergunta salva pode se resumir a um conceito (ex.: "valor"). Aceita
  // frases como "quanto custa?" quando todas as palavras relevantes apontam
  // para esse mesmo conceito.
  if (
    variantWords.length === 1 &&
    messageWords.every((messageWord) => qaWordsMatch(messageWord, variantWords[0]))
  ) {
    return 90;
  }

  // Faz correspondência um-para-um. Isso impede que duas palavras parecidas da
  // mensagem contem como se fossem dois conceitos diferentes da pergunta salva.
  const usedVariantWords = new Set<number>();
  let matchedMessageWords = 0;
  for (const messageWord of messageWords) {
    const matchIndex = variantWords.findIndex(
      (variantWord, index) => !usedVariantWords.has(index) && qaWordsMatch(messageWord, variantWord)
    );
    if (matchIndex >= 0) {
      usedVariantWords.add(matchIndex);
      matchedMessageWords++;
    }
  }
  const messageCoverage = matchedMessageWords / messageWords.length;
  const ruleCoverage = usedVariantWords.size / variantWords.length;

  // Mensagens curtas como "e a prática?" são aceitas quando a palavra principal
  // identifica a regra. Em mensagens maiores, exigimos que a maior parte da
  // intenção enviada também esteja presente para evitar respostas aleatórias.
  if (messageCoverage === 1 && matchedMessageWords >= 1) {
    return Math.round(80 + ruleCoverage * 15);
  }
  if (messageCoverage >= 0.67 && matchedMessageWords >= 2) {
    return Math.round(70 + messageCoverage * 15);
  }

  // Perguntas reformuladas podem ter palavras adicionais, mas ainda cobrir quase
  // toda a intenção cadastrada. Ex.: "o que preciso para me inscrever?".
  if (ruleCoverage >= 0.67 && matchedMessageWords >= 2) {
    return Math.round(70 + ruleCoverage * 15);
  }

  return 0;
}

export function findQaAnswer(message: string, rawRules: string | null | undefined): string | null {
  const rules = parseQaRules(rawRules);
  let bestMatch: { answer: string; score: number } | null = null;

  for (const rule of rules) {
    const variants = rule.question
      .split(/[,;\n|/]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const score = variants.reduce(
      (best, variant) => Math.max(best, scoreQaVariant(message, variant)),
      0
    );

    if (score >= 70 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { answer: rule.answer, score };
    }
  }

  return bestMatch?.answer || null;
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
  private recentClosings: Map<string, number> = new Map();
  private readonly closingCooldownMs = 6 * 60 * 60 * 1000;

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
  async processIncomingMessage(
    contactId: string,
    phone: string,
    message: string,
    messageType?: string,
    isGroup = false
  ): Promise<boolean> {
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

      let contactTags: string[] = [];
      try {
        const parsedTags = JSON.parse(contact.tags || '[]');
        contactTags = Array.isArray(parsedTags) ? parsedTags.map(String) : [];
      } catch {
        contactTags = [];
      }

      if (contactTags.includes('automacao_bloqueada')) {
        console.log(`[AutoResponse] Automação bloqueada para ${contact.name}. Mensagem mantida para atendimento manual.`);
        // Impede também o segundo mecanismo de resposta automática.
        return true;
      }

      const normalizedPhone = phone.replace(/\D/g, '');
      const phoneVariants = new Set([normalizedPhone]);
      if (normalizedPhone.length === 10 || normalizedPhone.length === 11) {
        phoneVariants.add(`55${normalizedPhone}`);
      }
      if (
        (normalizedPhone.length === 12 || normalizedPhone.length === 13) &&
        normalizedPhone.startsWith('55')
      ) {
        phoneVariants.add(normalizedPhone.slice(2));
      }

      // O WhatsApp pode identificar celulares brasileiros no formato antigo,
      // sem o nono dígito. Comparamos as duas representações automaticamente.
      for (const variant of Array.from(phoneVariants)) {
        const localPhone = variant.startsWith('55') ? variant.slice(2) : variant;
        if (localPhone.length === 11 && localPhone.charAt(2) === '9') {
          const withoutNinthDigit = `${localPhone.slice(0, 2)}${localPhone.slice(3)}`;
          phoneVariants.add(withoutNinthDigit);
          phoneVariants.add(`55${withoutNinthDigit}`);
        } else if (localPhone.length === 10) {
          const withNinthDigit = `${localPhone.slice(0, 2)}9${localPhone.slice(2)}`;
          phoneVariants.add(withNinthDigit);
          phoneVariants.add(`55${withNinthDigit}`);
        }
      }

      const blockedPhone = await prisma.automationBlockedPhone.findFirst({
        where: { phone: { in: Array.from(phoneVariants) } },
      });
      if (blockedPhone) {
        console.log(`[AutoResponse] Automação bloqueada para o número ${normalizedPhone}.`);
        return true;
      }

      // A automação de mídia funciona independentemente do botão global, assim
      // como o menu configurado nesta tela.
      const aiConfig = await (prisma as any).aIAutoResponse.findUnique({ where: { id: 'default' } });
      const normalizedMessageType = String(messageType || '').trim().toLowerCase();
      const isAudioMessage = ['audio', 'ptt', 'voice', 'voice_message'].includes(normalizedMessageType);
      if (!isGroup && isAudioMessage) {
        await whatsappService.sendText(
          normalizedPhone,
          'Olá! No momento não consigo ouvir o áudio. Por favor, digite a sua dúvida para que eu possa ajudar.'
        );
        console.log(`[AutoResponse] Aviso de áudio enviado para ${normalizedPhone}.`);
        return true;
      }

      const isUnsupportedMedia = [
        'image', 'album', 'video', 'document', 'sticker', 'gif', 'location',
        'vcard', 'multi_vcard', 'contact_card', 'contacts_array', 'product', 'order', 'payment',
      ].includes(normalizedMessageType);
      if (!isGroup && isUnsupportedMedia) {
        const existingState = await (prisma as any).conversationState.findUnique({ where: { contactId } });

        // No primeiro contato, deixa o fluxo normal enviar o menu padrão.
        // Depois disso, a mídia recebe uma orientação sem repetir o menu.
        if (!aiConfig?.enabled || existingState) {
          await whatsappService.sendText(
            normalizedPhone,
            'Olá! No momento não consigo analisar essa mídia. Por favor, digite a sua dúvida para que eu possa ajudar.'
          );
          console.log(`[AutoResponse] Aviso de mídia enviado para ${normalizedPhone}.`);
          return true;
        }
      }

      // Check if AI Auto-Response is enabled (runs independently of global automation toggle)
      const closingMessageDetected = isClosingMessage(message);
      if (!isGroup && aiConfig?.closingEnabled && closingMessageDetected) {
        const lastClosing = this.recentClosings.get(contactId) || 0;
        if (Date.now() - lastClosing < this.closingCooldownMs) {
          console.log(`[AutoResponse] Despedida repetida ignorada para ${normalizedPhone}.`);
          return true;
        }

        await whatsappService.sendText(normalizedPhone, aiConfig.closingMessage);
        this.recentClosings.set(contactId, Date.now());
        console.log(`[AutoResponse] Mensagem de encerramento enviada para ${normalizedPhone}.`);
        return true;
      }

      if (!closingMessageDetected) {
        this.recentClosings.delete(contactId);
      }

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
      const shouldSendMenu = !hasReceivedMenu;

      if (isValidOption) {
        // User selected a valid option
        const fieldName = `option${optionNumber}` as 'option1' | 'option2' | 'option3' | 'option4';
        const optionResponse = config[fieldName];

        if (!optionResponse) {
          // O menu é enviado somente uma vez; uma opção vazia não deve repeti-lo.
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
        // Consome a mensagem para impedir que o menu legado seja enviado como fallback.
        return true;
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

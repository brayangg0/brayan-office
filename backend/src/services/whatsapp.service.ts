import { Client, LocalAuth, MessageMedia, Chat, GroupChat } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { prisma } from './database';

// Detecta o caminho real do Chromium (compatível com nix/Railway)
function detectChromiumPath(): string | undefined {
  const envPath = process.env.CHROMIUM_PATH;
  if (envPath && envPath.trim() !== '') {
    if (fs.existsSync(envPath)) {
      console.log(`[WhatsApp] ✅ Chromium via CHROMIUM_PATH: ${envPath}`);
      return envPath;
    }
    console.warn(`[WhatsApp] ⚠️  CHROMIUM_PATH=${envPath} não existe. Tentando auto-detectar...`);
  }

  if (process.platform === 'win32') {
    const windowsCandidates = [
      process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
        : '',
      process.env.PROGRAMFILES
        ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')
        : '',
      process.env['PROGRAMFILES(X86)']
        ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
        : '',
      process.env.PROGRAMFILES
        ? path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
        : '',
    ];

    const found = windowsCandidates.find((candidate) => candidate && fs.existsSync(candidate));
    if (found) {
      console.log(`[WhatsApp] Navegador detectado no Windows: ${found}`);
      return found;
    }
  }

  try {
    const found = execSync(
      'which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome-stable 2>/dev/null || which google-chrome 2>/dev/null',
      { encoding: 'utf8', timeout: 5000 }
    ).trim().split('\n')[0];
    if (found && fs.existsSync(found)) {
      console.log(`[WhatsApp] 🔍 Chromium auto-detectado em: ${found}`);
      return found;
    }
  } catch {
    // não encontrou via which
  }
  console.warn('[WhatsApp] ⚠️  Chromium não encontrado — usando padrão do Puppeteer');
  return undefined;
}


// io será injetado após bootstrap para evitar dependência circular
export let ioRef: any = null;
export function setSocketIO(io: any) { ioRef = io; }

class WhatsAppService {
  private client: Client | null = null;
  private isReady = false;
  private isInitializing = false;
  private isAuthenticated = false;
  private isSyncingGroups = false;
  private lastInitializeAt = 0;
  private lastInitializeError: string | null = null;
  private initializeBlockedUntil = 0;
  private sessionPath = process.env.SESSION_PATH || this.getDefaultSessionPath();
  private baseUploads = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');

  private getDefaultSessionPath() {
    if (process.platform === 'win32') {
      return path.join(process.env.LOCALAPPDATA || process.cwd(), 'BrayanOffice', 'whatsapp-auth');
    }

    return path.join(process.cwd(), '.wwebjs_auth');
  }

  async initialize() {
    const now = Date.now();
    if (now < this.initializeBlockedUntil) {
      console.log('[WhatsApp] Inicializacao em cooldown apos erro de sessao travada.');
      return;
    }

    if (now - this.lastInitializeAt < 10_000) {
      console.log('[WhatsApp] Inicializacao chamada muito rapido, ignorando.');
      return;
    }

    if (this.isReady) {
      console.log('[WhatsApp] Cliente ja conectado, ignorando nova inicializacao.');
      return;
    }

    if (this.isInitializing) {
      console.log('[WhatsApp] Inicializacao ja em andamento, aguardando QR/ready.');
      return;
    }

    this.lastInitializeAt = now;
    this.isInitializing = true;
    this.isReady = false;
    this.isAuthenticated = false;
    this.lastInitializeError = null;
    console.log('[WhatsApp] Inicializando cliente...');

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.sessionPath }),
      authTimeoutMs: 90_000,
      qrMaxRetries: 8,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      deviceName: 'Brayan Office',
      browserName: 'Chrome',
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-blink-features=AutomationControlled',
        ],
        executablePath: detectChromiumPath(),
        protocolTimeout: 180000, // 180 seconds for protocol operations
        timeout: 180000, // 180 seconds for browser launch
      },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0,
    });

    // Event: QR Code gerado
    client.on('qr', async (qr) => {
      if (this.client !== client) return;
      console.log('[WhatsApp] 🎯 QR Code gerado! Escaneie com WhatsApp...');
      try {
        // Validação: QR string não deve estar vazio
        if (!qr || typeof qr !== 'string' || qr.trim().length === 0) {
          console.error('[WhatsApp] QR Code inválido recebido:', qr);
          return;
        }

        const qrDataUrl = await qrcode.toDataURL(qr);

        // Validação: QR Data URL deve ter formato válido
        if (!qrDataUrl || !qrDataUrl.startsWith('data:image')) {
          console.error('[WhatsApp] QR Code Data URL inválido');
          return;
        }

        // Salva no banco para recuperação
        await prisma.whatsAppSession.upsert({
          where: { id: 'default' },
          update: { status: 'qr_ready', qrCode: qrDataUrl },
          create: { id: 'default', status: 'qr_ready', qrCode: qrDataUrl },
        });
        this.lastInitializeError = null;
        this.initializeBlockedUntil = 0;

        // Emite para todos os clientes conectados em tempo real
        if (ioRef) {
          console.log('[Socket.IO] ✅ Emitindo QR Code para ' + ioRef.engine.clientsCount + ' cliente(s)');
          ioRef.emit('whatsapp:qr', { qr: qrDataUrl });
        } else {
          console.warn('[Socket.IO] ⚠️  ioRef não inicializado!');
        }
      } catch (err) {
        console.error('[WhatsApp] Erro ao processar QR:', err);
      }
    });
    this.client = client;

    client.on('ready', async () => {
      if (this.client !== client) return;
      if (this.isReady) {
        console.log('[WhatsApp] Evento ready duplicado ignorado.');
        return;
      }

      this.isReady = true;
      this.isInitializing = false;
      this.isAuthenticated = true;
      const info = client.info;
      if (!info?.wid?.user) {
        console.error('[WhatsApp] Evento ready sem informacoes da conta. Ignorando.');
        this.isReady = false;
        return;
      }
      console.log(`[WhatsApp] Conectado como: ${info.pushname} (${info.wid.user})`);

      await prisma.whatsAppSession.upsert({
        where: { id: 'default' },
        update: { status: 'connected', phone: info.wid.user, qrCode: null, connectedAt: new Date() },
        create: { id: 'default', status: 'connected', phone: info.wid.user, connectedAt: new Date() },
      });
      this.lastInitializeError = null;
      this.initializeBlockedUntil = 0;

      if (ioRef) {
        console.log('[Socket.IO] Emitindo whatsapp:ready para clientes...');
        ioRef.emit('whatsapp:ready', { phone: info.wid.user, name: info.pushname });
      }

      if (process.env.WHATSAPP_SYNC_GROUPS_ON_READY === 'true') {
        this.syncGroups().catch((err) => {
          console.error('[WhatsApp] Erro ao sincronizar grupos apos conectar:', err);
        });
      } else {
        console.log('[WhatsApp] Sincronizacao automatica de grupos desativada. Use o botao Sincronizar Grupos quando precisar.');
      }
    });

    client.on('disconnected', async (reason) => {
      if (this.client !== client) return;
      this.isReady = false;
      this.isInitializing = false;
      this.isAuthenticated = false;
      this.client = null;
      console.log('[WhatsApp] Desconectado:', reason);

      await prisma.whatsAppSession.upsert({
        where: { id: 'default' },
        update: { status: 'disconnected', phone: null, qrCode: null, connectedAt: null },
        create: { id: 'default', status: 'disconnected' },
      });

      if (ioRef) {
        console.log('[Socket.IO] Emitindo whatsapp:disconnected para clientes...');
        ioRef.emit('whatsapp:disconnected', { reason });
      }
    });

    client.on('message_create', async (msg) => {
      if (this.client !== client) return;
      await this.handleMessage(msg);
    });

    client.on('auth_failure', (msg) => {
      if (this.client !== client) return;
      this.isInitializing = false;
      this.isReady = false;
      this.isAuthenticated = false;
      this.client = null;
      console.error('[WhatsApp] ❌ Falha na autenticação:', msg);
      if (ioRef) {
        ioRef.emit('whatsapp:auth_failure', { msg });
      }
    });

    client.on('remote_session_saved', () => {
      if (this.client !== client) return;
      console.log('[WhatsApp] ✅ Sessão salva com sucesso!');
    });

    client.on('authenticated', async () => {
      if (this.client !== client) return;
      this.isAuthenticated = true;
      this.isInitializing = false;
      this.lastInitializeError = null;
      console.log('[WhatsApp] Autenticado pelo celular. Aguardando WhatsApp ficar pronto...');

      await prisma.whatsAppSession.upsert({
        where: { id: 'default' },
        update: { status: 'authenticated', qrCode: null },
        create: { id: 'default', status: 'authenticated', qrCode: null },
      });

      if (ioRef) {
        ioRef.emit('whatsapp:authenticated');
      }
    });

    client.on('loading_screen', (percent, message) => {
      if (this.client !== client) return;
      console.log(`[WhatsApp] Carregando WhatsApp Web: ${percent}% ${message || ''}`);
    });

    client.on('change_state', (state) => {
      if (this.client !== client) return;
      console.log('[WhatsApp] Estado alterado:', state);
    });

    // Try initialize com retry
    try {
      console.log('[WhatsApp] 🌐 Conectando ao WhatsApp Web...');
      await client.initialize();
      console.log('[WhatsApp] ✅ Cliente inicializado com sucesso!');
    } catch (err: any) {
      const message = err?.message || 'Erro ao inicializar WhatsApp';
      this.lastInitializeError = message;
      if (message.includes('browser is already running') || message.includes('resource busy or locked') || message.includes('EBUSY')) {
        this.initializeBlockedUntil = Date.now() + 30_000;
        this.lastInitializeError = 'Sessao local do WhatsApp travada pelo Chrome. Aguarde alguns segundos ou clique em Limpar sessao.';
      }
      this.isInitializing = false;
      console.error('[WhatsApp] ❌ Erro ao inicializar:', err.message);
      if (this.client === client) {
        try {
          await client.destroy();
        } catch {
          // Ignora erros ao destruir um client parcialmente inicializado.
        }
        this.client = null;
      }
      this.isReady = false;
    }
  }

  private async handleMessage(msg: any) {
    try {
      const message = await this.persistMessage(msg);
      if (!message) return;

      const isFromMe = msg.fromMe;
      const remoteJid = isFromMe ? msg.to : msg.from;
      const phone = remoteJid.replace('@c.us', '').replace('@g.us', '');

      // Se a mensagem for MINHA (enviada pelo dono do número em qualquer lugar), pausa o robô
      if (isFromMe) {
        const { autoResponseService } = await import('./autoresponse.service');
        autoResponseService.registerManualMessage(message.contactId);
        return; // Para o robô por aqui (não responde o que o dono mandou)
      }

      // Se a mensagem for do ALUNO, passa para o robô decidir se responde
      const { autoResponseService } = await import('./autoresponse.service');
      const { openaiAutoResponseService } = await import('./openaiAutoResponse.service');
      const messageBody = msg.body || (msg.hasMedia ? '[MEDIA]' : '');
      
      // FILTRO DE SEGURANÇA: Ignora mensagens que não devem disparar o robô
      const isRevoked = msg.type === 'revoked' || msg.type === 'revoked_message';
      const isSystem = msg.isSystemMessage || msg.type === 'gp2' || msg.type === 'notification_template';
      const isEmpty = !messageBody || messageBody.trim().length === 0;
      const isDeletedText = messageBody?.toLowerCase().includes('mensagem apagada') || messageBody?.toLowerCase().includes('message was deleted');

      if (isRevoked || isSystem || isEmpty || isDeletedText) {
        console.log(`[WhatsApp] ⊘ Evento de sistema ou mensagem vazia de ${phone}, ignorando automação.`);
        return;
      }

      // A função processIncomingMessage agora lida com o log se isEnabled for false
      const handledByMenu = await autoResponseService.processIncomingMessage(message.contactId, phone, messageBody);
      if (handledByMenu) {
        return;
      }

      // OpenAI-powered auto-response (runs when enabled in AutoResponseConfig)
      openaiAutoResponseService.getConfig().then(async (cfg) => {
        if (!cfg.enabled) return;
        try {
          const waContact = await msg.getContact();
          const contactName = waContact.pushname || waContact.name || phone;
          const { response, type } = await openaiAutoResponseService.processMessage(
            messageBody,
            msg.from,
            contactName,
            false // set to true to require manual approval before sending
          );
          if (type === 'rule' && response) {
            await msg.reply(response);
            console.log(`[OpenAIAutoResponse] Sent rule response to ${msg.from}`);
          } else {
            console.log(`[OpenAIAutoResponse] No matching rule for ${msg.from}. Waiting for manual atendimento.`);
          }
        } catch (err) {
          console.error('[OpenAIAutoResponse] Error processing message:', err);
        }
      }).catch(console.error);
    } catch (err) {
      console.error('[WhatsApp] Erro ao processar mensagem:', err);
    }
  }

  private async persistMessage(msg: any, skipMedia: boolean = false) {
    try {
      const whatsappId = msg.id._serialized;
      const existing = await prisma.message.findFirst({ where: { whatsappId } });
      if (existing) return existing;

      const isFromMe = msg.fromMe;
      const remoteJid = isFromMe ? msg.to : msg.from;
      const phone = remoteJid.replace('@c.us', '').replace('@g.us', '');

      let contact = await prisma.contact.findUnique({ where: { phone } });
      if (!contact) {
        const waContact = await msg.getContact();
        contact = await prisma.contact.create({
          data: { name: waContact.pushname || waContact.name || phone, phone },
        });
      }

      const isMedia = msg.hasMedia;
      let mediaPath: string | null = null;
      let type = msg.type as string;

      if (isMedia && !skipMedia) {
        const media = await msg.downloadMedia();
        if (media) {
          const ext = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
          const filename = `${Date.now()}_${contact.id}.${ext}`;
          const dest = path.join(this.baseUploads, 'media', filename);
          if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, Buffer.from(media.data, 'base64'));
          mediaPath = `/uploads/media/${filename}`;
        }
      }

      const message = await prisma.message.create({
        data: {
          contactId: contact.id,
          direction: isFromMe ? 'outbound' : 'inbound',
          type,
          body: msg.body || (isMedia ? '[Mídia]' : ''),
          mediaPath,
          whatsappId,
          status: 'sent',
          isRgData: type === 'image' && (msg.body?.toLowerCase().includes('rg') || msg.body?.toLowerCase().includes('documento')),
        },
      });

      if (ioRef) {
        ioRef.emit('message:received', { contactId: contact.id, message });
      }

      return message;
    } catch (err) {
      console.error('[WhatsApp] Erro ao persistir mensagem:', err);
      return null;
    }
  }

  private async processRgDocument(messageId: string, mediaPath: string, contactId: string) {
    try {
      const { ocrService } = await import('./ocr.service');
      const fullPath = path.join(this.baseUploads, mediaPath.replace('/uploads/', ''));
      const result = await ocrService.extractRgData(fullPath);

      await prisma.message.update({ where: { id: messageId }, data: { rgProcessed: true } });

      // Copia foto para pasta de RG
      const dest = path.join(this.baseUploads, 'rg', path.basename(fullPath));
      if (!fs.existsSync(path.dirname(dest))) fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(fullPath, dest);

      // Atualiza dados do aluno se existir
      const student = await prisma.student.findUnique({ where: { contactId } });
      if (student) {
        await prisma.student.update({
          where: { id: student.id },
          data: { rgPhotoPath: `/uploads/rg/${path.basename(dest)}`, rgDataExtracted: JSON.stringify(result) },
        });
      }

      ioRef?.emit('rg:processed', { contactId, data: result });
    } catch (err) {
      console.error('[OCR] Erro ao processar RG:', err);
    }
  }

  // ─── Sincronização de Chats ──────────────────────────────────────────────
  async syncContactsAndChats() {
    if (!this.client || !this.getStatus().isReady) return { error: 'WhatsApp não está conectado' };
    try {
      console.log('[WhatsApp] Iniciando sincronização de conversas... (Isso pode levar alguns segundos)');
      const chats = await this.client.getChats();
      let syncedChats = 0;
      let syncedMessages = 0;

      // Pega os contatos privados mais recentes (últimas interações)
      const recentChats = chats.filter((c: any) => !c.isGroup).slice(0, 30);

      for (const chat of recentChats) {
        try {
          const phone = chat.id.user;
          let contact = await prisma.contact.findUnique({ where: { phone } });
          if (!contact) {
            const waContact = await this.client.getContactById(chat.id._serialized);
            contact = await prisma.contact.create({
              data: { name: waContact.pushname || waContact.name || chat.name || phone, phone },
            });
          }

          // Busca as últimas 15 mensagens do chat
          const messages = await chat.fetchMessages({ limit: 15 });
          for (const msg of messages) {
            const isNew = await this.persistMessage(msg, true); // true = Pula download de arquivos antigos
            if (isNew) syncedMessages++;
          }
          syncedChats++;
        } catch (err) {
          console.error(`[WhatsApp] Erro ao sincronizar chat de ${chat.name}:`, err);
        }
      }
      
      console.log(`[WhatsApp] Sincronização concluída: ${syncedChats} chats e ${syncedMessages} mensagens.`);
      return { message: `${syncedChats} contatos e ${syncedMessages} mensagens antigas foram importadas!`, syncedChats, syncedMessages };
    } catch (error) {
      console.error('[WhatsApp] Erro na sincronização:', error);
      return { error: 'Falha ao sincronizar conversas' };
    }
  }

  // ─── Envio de mensagens ──────────────────────────────────────────────────

  async sendText(to: string, body: string): Promise<boolean> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    const msg = await this.client.sendMessage(chatId, body);
    await this.persistMessage(msg);
    return true;
  }

  async sendMedia(to: string, filePath: string, caption?: string): Promise<boolean> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');

    // Verificar se arquivo existe
    if (!fs.existsSync(filePath)) {
      console.error(`[WhatsApp] ❌ Arquivo não encontrado: ${filePath}`);
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    try {
      const chatId = to.includes('@') ? to : `${to}@c.us`;
      const media = MessageMedia.fromFilePath(filePath);
      console.log(`[WhatsApp] 📤 Enviando mídia para ${chatId}...`);
      await this.client.sendMessage(chatId, media, { caption });
      console.log(`[WhatsApp] ✅ Mídia enviada com sucesso`);
      return true;
    } catch (err: any) {
      console.error(`[WhatsApp] ❌ Erro ao enviar mídia:`, err.message);
      throw err;
    }
  }

  async sendMediaUrl(to: string, url: string, caption?: string): Promise<boolean> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    const media = await MessageMedia.fromUrl(url, { unsafeMime: true });
    await this.client.sendMessage(chatId, media, { caption });
    return true;
  }

  async sendToGroup(groupId: string, body: string): Promise<boolean> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');
    const chatId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
    await this.client.sendMessage(chatId, body);
    return true;
  }

  async sendMediaToGroup(groupId: string, filePath: string, caption?: string): Promise<boolean> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');

    // Verificar se arquivo existe
    if (!fs.existsSync(filePath)) {
      console.error(`[WhatsApp] ❌ Arquivo não encontrado: ${filePath}`);
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    try {
      const chatId = groupId.includes('@') ? groupId : `${groupId}@g.us`;
      const media = MessageMedia.fromFilePath(filePath);
      console.log(`[WhatsApp] 📤 Enviando mídia para grupo ${groupId}...`);
      await this.client.sendMessage(chatId, media, { caption });
      console.log(`[WhatsApp] ✅ Mídia enviada para grupo com sucesso`);
      return true;
    } catch (err: any) {
      console.error(`[WhatsApp] ❌ Erro ao enviar mídia para grupo:`, err.message);
      throw err;
    }
  }

  // ─── Grupos ─────────────────────────────────────────────────────────────

  async syncGroups() {
    if (!this.isReady || !this.client) return;
    if (this.isSyncingGroups) return;
    this.isSyncingGroups = true;

    try {
      let chats = await Promise.race([
        this.client.getChats(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getChats timeout')), Number(process.env.WHATSAPP_SYNC_TIMEOUT_MS || 25000))
        ),
      ]);

      if (chats.length === 0) {
        console.log('[WhatsApp] getChats retornou vazio. Tentando fallback pelo Store do WhatsApp Web...');
        const fallbackGroups = await this.getGroupsFromBrowserStore();

        for (const group of fallbackGroups) {
          await prisma.whatsAppGroup.upsert({
            where: { groupId: group.groupId },
            update: { name: group.name, members: group.members },
            create: { groupId: group.groupId, name: group.name, members: group.members, active: !group.archived },
          });
        }

        console.log(`[WhatsApp] ${fallbackGroups.length} grupos sincronizados via fallback`);
        return;
      }

      const groups = chats.filter((c): c is GroupChat => c.isGroup);

      for (const group of groups) {
        await prisma.whatsAppGroup.upsert({
          where: { groupId: group.id._serialized },
          update: { name: group.name, members: group.participants?.length ?? 0 },
          create: { groupId: group.id._serialized, name: group.name, members: group.participants?.length ?? 0, active: !group.archived },
        });
      }

      console.log(`[WhatsApp] ${groups.length} grupos sincronizados`);
    } catch (err) {
      console.error('[WhatsApp] Erro ao sincronizar grupos:', err);
    } finally {
      this.isSyncingGroups = false;
    }
  }

  private async getGroupsFromBrowserStore(): Promise<Array<{ groupId: string; name: string; members: number; archived: boolean }>> {
    if (!this.client) return [];

    const page = (this.client as any).pupPage;
    if (!page) return [];

    try {
      return await page.evaluate(() => {
        const browserWindow = globalThis as any;
        const store = browserWindow.Store;
        const chatStore = store?.Chat;
        const chats = chatStore?.getModelsArray?.() || chatStore?.models || [];

        return chats
          .filter((chat: any) => {
            const id = chat?.id?._serialized || chat?.id?.toString?.() || '';
            return chat?.isGroup || id.endsWith('@g.us');
          })
          .map((chat: any) => {
            const id = chat?.id?._serialized || chat?.id?.toString?.() || '';
            const participants = chat?.groupMetadata?.participants || chat?.participants || [];
            return {
              groupId: id,
              name: chat?.name || chat?.formattedTitle || chat?.contact?.name || id,
              members: Array.isArray(participants) ? participants.length : 0,
              archived: Boolean(chat?.archive || chat?.archived),
            };
          })
          .filter((group: any) => group.groupId);
      });
    } catch (err) {
      console.error('[WhatsApp] Erro no fallback de grupos via Store:', err);
      return [];
    }
  }

  async getGroups(): Promise<Chat[]> {
    if (!this.isReady || !this.client) return [];
    const chats = await this.client.getChats();
    return chats.filter((c) => c.isGroup);
  }

  // ─── Live Chat / Contact data for WhatsApp Web UI ────────────────────────

  async getLiveChats(): Promise<any[]> {
    if (!this.isReady || !this.client) return [];
    try {
      const chats = await Promise.race([
        this.client.getChats(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('getChats timeout')), 120000) // 120s instead of 60s
        ),
      ]);
      return await Promise.all(
        chats.slice(0, 50).map(async (chat: any) => {
          let profilePicUrl: string | null = null;
          try {
            profilePicUrl = await Promise.race([
              this.client!.getProfilePicUrl(chat.id._serialized),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)), // 8s instead of 5s
            ]);
          } catch {
            profilePicUrl = null;
          }
          const lastMsg = chat.lastMessage;
          return {
            id: chat.id._serialized,
            name: chat.name || chat.id.user,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount || 0,
            timestamp: lastMsg?.timestamp ? lastMsg.timestamp * 1000 : null,
            lastMessage: lastMsg
              ? {
                  body: lastMsg.body || (lastMsg.hasMedia ? '[Mídia]' : ''),
                  fromMe: lastMsg.fromMe,
                  type: lastMsg.type,
                  timestamp: lastMsg.timestamp ? lastMsg.timestamp * 1000 : null,
                }
              : null,
            profilePicUrl,
            archived: chat.archived || false,
            pinned: chat.pinned || false,
            members: chat.isGroup ? (chat.participants?.length ?? 0) : undefined,
          };
        })
      );
    } catch (err) {
      console.error('[WhatsApp] Erro ao buscar chats ao vivo:', err);
      return [];
    }
  }

  async getLiveChatMessages(chatId: string, limit = 30): Promise<any[]> {
    if (!this.isReady || !this.client) return [];
    try {
      let chat;
      try {
        chat = await Promise.race([
          this.client.getChatById(chatId),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getChatById timeout')), 60000) // 60s instead of 30s
          ),
        ]);
      } catch (err) {
        console.error(`[WhatsApp] Erro ao obter chat ${chatId}:`, err);
        return [];
      }

      if (!chat) return [];

      let messages: any[] = [];
      try {
        messages = await Promise.race([
          chat.fetchMessages({ limit }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('fetchMessages timeout')), 120000) // 120s instead of 60s
          ),
        ]);
      } catch (err: any) {
        console.error(`[WhatsApp] Erro ao buscar mensagens do chat ${chatId}:`, err.message);
        // Return empty array instead of throwing - chat may be loading or unavailable
        return [];
      }

      if (!Array.isArray(messages)) {
        return [];
      }

      return await Promise.all(
        messages.map(async (msg: any) => {
          let mediaUrl: string | null = null;
          let mediaType: string | null = null;

          if (msg.hasMedia) {
            try {
              const media = await Promise.race([
                msg.downloadMedia(),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000)), // 15s instead of 10s
              ]);
              if (media) {
                mediaType = media.mimetype.split('/')[0];
                mediaUrl = `data:${media.mimetype};base64,${media.data}`;
              }
            } catch (e) {
              console.error('[WhatsApp] Erro ao baixar mídia:', e);
            }
          }

          return {
            id: msg.id._serialized,
            body: msg.body || (msg.hasMedia ? '[Mídia]' : ''),
            fromMe: msg.fromMe,
            type: msg.type,
            timestamp: msg.timestamp ? msg.timestamp * 1000 : null,
            hasMedia: msg.hasMedia,
            mediaUrl,
            mediaType,
            author: msg.author || null,
            ack: msg.ack,
          };
        })
      );
    } catch (err) {
      console.error(`[WhatsApp] Erro geral ao buscar mensagens do chat ${chatId}:`, err);
      return [];
    }
  }

  async sendLiveMessage(chatId: string, message: string): Promise<{ success: boolean; messageId?: string }> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');
    try {
      const msg = await this.client.sendMessage(chatId, message);
      
      // Persist message to database
      try {
        await this.persistMessage(msg);
      } catch (persistErr) {
        console.error('[WhatsApp] Erro ao persistir mensagem:', persistErr);
        // Don't fail the send if persistence fails
      }
      
      return { success: true, messageId: msg.id._serialized };
    } catch (err: any) {
      console.error(`[WhatsApp] Erro ao enviar mensagem para ${chatId}:`, err.message);
      throw err;
    }
  }

  async getLiveContacts(): Promise<any[]> {
    if (!this.isReady || !this.client) return [];
    try {
      const contacts = await this.client.getContacts();
      return contacts
        .filter((c: any) => !c.isMe && (c.isMyContact || c.pushname || c.name))
        .slice(0, 200)
        .map((c: any) => ({
          id: c.id._serialized,
          name: c.pushname || c.name || c.id.user,
          phone: c.number || c.id.user,
          isGroup: c.isGroup,
          isMyContact: c.isMyContact,
          profilePicUrl: null,
        }));
    } catch (err) {
      console.error('[WhatsApp] Erro ao buscar contatos ao vivo:', err);
      return [];
    }
  }

  // ─── Status ──────────────────────────────────────────────────────────────

  getStatus() {
    return {
      isReady: this.isReady,
      isInitializing: this.isInitializing,
      isAuthenticated: this.isAuthenticated,
      hasClient: !!this.client,
      lastError: this.lastInitializeError,
      retryAfterSeconds: Math.max(0, Math.ceil((this.initializeBlockedUntil - Date.now()) / 1000)),
    };
  }

  async logout() {
    console.log('[WhatsApp] Desconectando e limpando sessão...');
    const client = this.client;
    if (client) {
      try {
        await client.logout();
      } catch(err) {
        console.error('[WhatsApp] Erro remoto ao desconectar:', err);
      }

      try {
        await client.destroy();
      } catch(err) {
        console.error('[WhatsApp] Erro ao destruir cliente:', err);
      }
    }
    this.isReady = false;
    this.isInitializing = false;
    this.isAuthenticated = false;
    this.client = null;
    this.lastInitializeError = null;
    this.initializeBlockedUntil = 0;

    await this.stopLocalSessionBrowsers();
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (fs.existsSync(this.sessionPath)) {
      try {
        fs.rmSync(this.sessionPath, { recursive: true, force: true });
      } catch(e) {
        console.error('[WhatsApp] Erro ao deletar pasta auth:', e);
        this.lastInitializeError = 'Nao consegui limpar a sessao local porque o Chrome ainda esta usando os arquivos. Tente Limpar sessao novamente em alguns segundos.';
        this.initializeBlockedUntil = Date.now() + 30_000;
      }
    }

    await prisma.whatsAppSession.update({
      where: { id: 'default' },
      data: { status: 'disconnected', phone: null, qrCode: null, connectedAt: null }
    });

    // A tela/rota de QR inicia um novo cliente quando necessario.
  }

  async destroy() {
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err) {
        console.error('[WhatsApp] Erro ao destruir cliente:', err);
      }
    }
    this.client = null;
    this.isReady = false;
    this.isInitializing = false;
    this.isAuthenticated = false;
  }

  // ─── Envio com retry e intervalo (para campanhas) ────────────────────────

  private async stopLocalSessionBrowsers() {
    if (process.platform !== 'win32') return;

    const escapedSession = this.sessionPath.replace(/'/g, "''");
    const script = `
$session = '${escapedSession}'
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like "*$session*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
`;
    const encoded = Buffer.from(script, 'utf16le').toString('base64');

    try {
      execSync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, { stdio: 'ignore', timeout: 10_000 });
    } catch (err) {
      console.error('[WhatsApp] Nao foi possivel finalizar Chrome local da sessao:', err);
    }
  }

  async sendWithDelay(
    targets: { id: string; isGroup: boolean }[],
    content: { type: string; body?: string; mediaPath?: string; caption?: string },
    delayMs = Number(process.env.WHATSAPP_SEND_DELAY_MS || 20000)
  ): Promise<{ sent: number; failed: number }> {
    let sent = 0, failed = 0;
    for (const target of targets) {
      try {
        if (content.type === 'text') {
          if (target.isGroup) await this.sendToGroup(target.id, content.body!);
          else await this.sendText(target.id, content.body!);
        } else {
          const filePath = path.join(process.cwd(), content.mediaPath!);
          if (target.isGroup) await this.sendMediaToGroup(target.id, filePath, content.caption);
          else await this.sendMedia(target.id, filePath, content.caption);
        }
        sent++;
      } catch (err: any) {
        console.error(`[WhatsApp] ❌ Falha ao enviar para ${target.id}:`, err.message);
        failed++;
      }
      if (targets.indexOf(target) < targets.length - 1) {
        const jitterMs = Math.floor(Math.random() * 7000);
        await new Promise((r) => setTimeout(r, delayMs + jitterMs));
      }
    }
    return { sent, failed };
  }
}

export const whatsappService = new WhatsAppService();

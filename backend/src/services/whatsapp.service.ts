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
  private sessionPath = process.env.SESSION_PATH || path.join(process.cwd(), '.wwebjs_auth');
  private baseUploads = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');

  async initialize() {
    console.log('[WhatsApp] Inicializando cliente...');

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.sessionPath }),
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
          // Removido: '--single-process' é muito pesado
        ],
        executablePath: detectChromiumPath(),
      },
      takeoverOnConflict: true,
      takeoverTimeoutMs: 0,
    });

    // Event: QR Code gerado
    this.client.on('qr', async (qr) => {
      console.log('[WhatsApp] 🎯 QR Code gerado! Escaneie com WhatsApp...');
      try {
        const qrDataUrl = await qrcode.toDataURL(qr);

        // Salva no banco para recuperação
        await prisma.whatsAppSession.upsert({
          where: { id: 'default' },
          update: { status: 'qr_ready', qrCode: qrDataUrl },
          create: { id: 'default', status: 'qr_ready', qrCode: qrDataUrl },
        });

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

    this.client.on('ready', async () => {
      this.isReady = true;
      const info = this.client!.info;
      console.log(`[WhatsApp] Conectado como: ${info.pushname} (${info.wid.user})`);

      await prisma.whatsAppSession.upsert({
        where: { id: 'default' },
        update: { status: 'connected', phone: info.wid.user, qrCode: null, connectedAt: new Date() },
        create: { id: 'default', status: 'connected', phone: info.wid.user, connectedAt: new Date() },
      });

      if (ioRef) {
        console.log('[Socket.IO] Emitindo whatsapp:ready para clientes...');
        ioRef.emit('whatsapp:ready', { phone: info.wid.user, name: info.pushname });
      }

      // Sincroniza grupos
      await this.syncGroups();
    });

    this.client.on('disconnected', async (reason) => {
      this.isReady = false;
      console.log('[WhatsApp] Desconectado:', reason);

      await prisma.whatsAppSession.upsert({
        where: { id: 'default' },
        update: { status: 'disconnected', phone: null, connectedAt: null },
        create: { id: 'default', status: 'disconnected' },
      });

      if (ioRef) {
        console.log('[Socket.IO] Emitindo whatsapp:disconnected para clientes...');
        ioRef.emit('whatsapp:disconnected', { reason });
      }
    });

    this.client.on('message_create', async (msg) => {
      await this.handleMessage(msg);
    });

    this.client.on('auth_failure', (msg) => {
      console.error('[WhatsApp] ❌ Falha na autenticação:', msg);
      if (ioRef) {
        ioRef.emit('whatsapp:auth_failure', { msg });
      }
    });

    this.client.on('remote_session_saved', () => {
      console.log('[WhatsApp] ✅ Sessão salva com sucesso!');
    });

    // Try initialize com retry
    try {
      console.log('[WhatsApp] 🌐 Conectando ao WhatsApp Web...');
      await this.client.initialize();
      console.log('[WhatsApp] ✅ Cliente inicializado com sucesso!');
    } catch (err: any) {
      console.error('[WhatsApp] ❌ Erro ao inicializar:', err.message);
      // Retry automático após 5s
      setTimeout(() => this.initialize(), 5000);
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
      autoResponseService.processIncomingMessage(message.contactId, phone, messageBody).catch(console.error);
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
    try {
      const chats = await this.client.getChats();
      const groups = chats.filter((c): c is GroupChat => c.isGroup);

      for (const group of groups) {
        await prisma.whatsAppGroup.upsert({
          where: { groupId: group.id._serialized },
          update: { name: group.name, members: group.participants.length },
          create: { groupId: group.id._serialized, name: group.name, members: group.participants.length, active: !group.archived },
        });
      }

      console.log(`[WhatsApp] ${groups.length} grupos sincronizados`);
    } catch (err) {
      console.error('[WhatsApp] Erro ao sincronizar grupos:', err);
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
      const chats = await this.client.getChats();
      return await Promise.all(
        chats.slice(0, 50).map(async (chat: any) => {
          let profilePicUrl: string | null = null;
          try {
            profilePicUrl = await this.client!.getProfilePicUrl(chat.id._serialized);
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
      const chat = await this.client.getChatById(chatId);
      const messages = await chat.fetchMessages({ limit });
      return messages.map((msg: any) => ({
        id: msg.id._serialized,
        body: msg.body || (msg.hasMedia ? '[Mídia]' : ''),
        fromMe: msg.fromMe,
        type: msg.type,
        timestamp: msg.timestamp ? msg.timestamp * 1000 : null,
        hasMedia: msg.hasMedia,
        author: msg.author || null,
        ack: msg.ack,
      }));
    } catch (err) {
      console.error(`[WhatsApp] Erro ao buscar mensagens do chat ${chatId}:`, err);
      return [];
    }
  }

  async sendLiveMessage(chatId: string, message: string): Promise<{ success: boolean; messageId?: string }> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');
    try {
      const msg = await this.client.sendMessage(chatId, message);
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

  getStatus() { return { isReady: this.isReady }; }

  async logout() {
    console.log('[WhatsApp] Desconectando e limpando sessão...');
    try {
      if (this.client) {
        await this.client.logout();
        await this.client.destroy();
      }
    } catch(err) {
      console.error('[WhatsApp] Erro remoto ao desconectar:', err);
    }
    this.isReady = false;
    this.client = null;

    if (fs.existsSync(this.sessionPath)) {
      try {
        fs.rmSync(this.sessionPath, { recursive: true, force: true });
      } catch(e) {
        console.error('[WhatsApp] Erro ao deletar pasta auth:', e);
      }
    }

    await prisma.whatsAppSession.update({
      where: { id: 'default' },
      data: { status: 'disconnected', phone: null, qrCode: null, connectedAt: null }
    });

    setTimeout(() => this.initialize(), 1000);
  }

  async destroy() {
    if (this.client) {
      await this.client.destroy();
      this.isReady = false;
    }
  }

  // ─── Envio com retry e intervalo (para campanhas) ────────────────────────

  async sendWithDelay(
    targets: { id: string; isGroup: boolean }[],
    content: { type: string; body?: string; mediaPath?: string; caption?: string },
    delayMs = 3000
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
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return { sent, failed };
  }
}

export const whatsappService = new WhatsAppService();

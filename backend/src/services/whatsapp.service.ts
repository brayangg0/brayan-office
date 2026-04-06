import { Client, LocalAuth, MessageMedia, Chat, GroupChat } from 'whatsapp-web.js';
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { prisma } from './database';

// io será injetado após bootstrap para evitar dependência circular
let ioRef: any = null;
export function setSocketIO(io: any) { ioRef = io; }

class WhatsAppService {
  private client: Client | null = null;
  private isReady = false;
  private sessionPath = path.join(process.cwd(), '.wwebjs_auth');

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
        executablePath: undefined, // Usa Chrome do sistema se disponível
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

    this.client.on('message', async (msg) => {
      await this.handleIncomingMessage(msg);
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

  private async handleIncomingMessage(msg: any) {
    try {
      const from = msg.from.replace('@c.us', '');
      if (msg.from.includes('@g.us')) return; // ignora mensagens de grupos por enquanto

      // Busca ou cria contato
      let contact = await prisma.contact.findUnique({ where: { phone: from } });
      if (!contact) {
        const waContact = await msg.getContact();
        contact = await prisma.contact.create({
          data: { name: waContact.pushname || waContact.name || from, phone: from },
        });
      }

      const isMedia = msg.hasMedia;
      let mediaPath: string | null = null;
      let type = msg.type as string;

      if (isMedia) {
        const media = await msg.downloadMedia();
        if (media) {
          const ext = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
          const filename = `${Date.now()}_${contact.id}.${ext}`;
          const dest = path.join(process.cwd(), 'uploads', 'media', filename);
          fs.writeFileSync(dest, Buffer.from(media.data, 'base64'));
          mediaPath = `/uploads/media/${filename}`;
        }
      }

      const message = await prisma.message.create({
        data: {
          contactId: contact.id,
          direction: 'inbound',
          type,
          body: msg.body || null,
          mediaPath,
          whatsappId: msg.id._serialized,
          isRgData: type === 'image' && (msg.body?.toLowerCase().includes('rg') || msg.body?.toLowerCase().includes('documento')),
        },
      });

      // Se for imagem de RG, dispara OCR em background
      if (message.isRgData && mediaPath) {
        this.processRgDocument(message.id, mediaPath, contact.id).catch(console.error);
      }

      // Processa autorresponse para mensagens de texto
      if (type === 'text' && msg.body) {
        const { autoResponseService } = await import('./autoresponse.service');
        autoResponseService.processIncomingMessage(contact.id, from, msg.body).catch(console.error);
      }

      ioRef?.emit('message:received', { contactId: contact.id, message });
    } catch (err) {
      console.error('[WhatsApp] Erro ao processar mensagem:', err);
    }
  }

  private async processRgDocument(messageId: string, mediaPath: string, contactId: string) {
    try {
      const { ocrService } = await import('./ocr.service');
      const fullPath = path.join(process.cwd(), mediaPath.replace('/uploads', 'uploads'));
      const result = await ocrService.extractRgData(fullPath);

      await prisma.message.update({ where: { id: messageId }, data: { rgProcessed: true } });

      // Copia foto para pasta de RG
      const dest = path.join(process.cwd(), 'uploads', 'rg', path.basename(fullPath));
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

  // ─── Envio de mensagens ──────────────────────────────────────────────────

  async sendText(to: string, body: string): Promise<boolean> {
    if (!this.isReady || !this.client) throw new Error('WhatsApp não está conectado');
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    await this.client.sendMessage(chatId, body);
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
          update: { name: group.name, members: group.participants.length, active: !group.archived },
          create: { groupId: group.id._serialized, name: group.name, members: group.participants.length },
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

  // ─── Status ──────────────────────────────────────────────────────────────

  getStatus() { return { isReady: this.isReady }; }

  async logout() {
    if (this.client) {
      await this.client.logout();
      this.isReady = false;
    }
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

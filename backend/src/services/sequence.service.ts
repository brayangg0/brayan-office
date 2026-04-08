import { prisma } from './database';
import { whatsappService } from './whatsapp.service';
import path from 'path';
import fs from 'fs';

class SequenceService {
  private activeSchedules: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Agenda uma sequência de mensagens para envio
   */
  async scheduleSequence(sequenceId: string): Promise<void> {
    const sequence = await prisma.messageSequence.findUnique({
      where: { id: sequenceId },
      include: { messages: { orderBy: { order: 'asc' } } },
    });

    if (!sequence) throw new Error('Sequência não encontrada');
    if (sequence.messages.length === 0) throw new Error('Sequência sem mensagens');

    // Cancelar agendamento anterior se existir
    if (this.activeSchedules.has(sequenceId)) {
      clearTimeout(this.activeSchedules.get(sequenceId)!);
    }

    const delayMs = sequence.scheduledAt.getTime() - Date.now();
    if (delayMs <= 0) {
      // ✅ FIX: Executa em background para não bloquear a HTTP request de criação
      console.log(`[Sequence] ⚡ Sequência ${sequenceId} em execução imediata (background)`);
      setImmediate(() => {
        this.sendSequenceNow(sequenceId).catch((err) =>
          console.error(`[Sequence] ❌ Erro ao enviar sequência ${sequenceId}:`, err.message)
        );
      });
    } else {
      // Agendar para o horário especificado
      console.log(`[Sequence] ⏰ Sequência ${sequenceId} agendada para ${sequence.scheduledAt}`);
      const timeout = setTimeout(async () => {
        await this.sendSequenceNow(sequenceId);
        this.activeSchedules.delete(sequenceId);
      }, delayMs);

      this.activeSchedules.set(sequenceId, timeout);
    }
  }

  /**
   * Envia uma sequência NOW (sem esperar)
   * @param force - Se true, reenvia mesmo que já esteja completed/running (ex: botão "Enviar Agora")
   */
  async sendSequenceNow(sequenceId: string, force = false): Promise<void> {
    const sequence = await prisma.messageSequence.findUnique({
      where: { id: sequenceId },
      include: { messages: { orderBy: { order: 'asc' } } },
    });

    if (!sequence) throw new Error('Sequência não encontrada');

    // ✅ FIX: force=true reseta o status e permite reenvio explícito
    if (force) {
      await prisma.messageSequence.update({
        where: { id: sequenceId },
        data: { status: 'pending', startedAt: null, completedAt: null, totalSent: 0, totalFailed: 0 },
      });
    } else if (sequence.status === 'running' || sequence.status === 'completed') {
      console.log(`[Sequence] ⚠️ Sequência ${sequenceId} já foi executada (use force=true para reenviar)`);
      return;
    }

    const { isReady } = whatsappService.getStatus();
    if (!isReady) throw new Error('WhatsApp não está conectado');

    // Buscar destinatários baseado em targetType
    const targets = await this.getTargets(sequence);
    if (targets.length === 0) {
      throw new Error('Nenhum destinatário encontrado para esta sequência');
    }

    // Atualizar status para "running"
    await prisma.messageSequence.update({
      where: { id: sequenceId },
      data: { status: 'running', startedAt: new Date() },
    });

    console.log(`[Sequence] 🚀 Iniciando sequência ${sequenceId} com ${targets.length} destinatários`);

    let sent = 0,
      failed = 0;

    for (const target of targets) {
      try {
        // Para cada destinatário, enviar todas as mensagens em sequência
        for (let i = 0; i < sequence.messages.length; i++) {
          const message = sequence.messages[i];

          // ✅ FIX: delayBefore antes de enviar ESTA mensagem (exceto a primeira)
          if (i > 0 && message.delayBefore > 0) {
            await new Promise((r) => setTimeout(r, message.delayBefore));
          }

          const formattedMessage = {
            type: message.type,
            body: message.body || undefined,
            mediaPath: message.mediaPath || undefined,
            caption: message.caption || undefined,
          };
          await this.sendMessage(target, formattedMessage);

          // ✅ FIX: usa messageDelay entre mensagens (não delayBefore)
          if (i < sequence.messages.length - 1 && message.messageDelay > 0) {
            await new Promise((r) => setTimeout(r, message.messageDelay));
          }
        }
        sent++;
      } catch (err: any) {
        console.error(`[Sequence] ❌ Falha ao enviar sequência para ${target.id}:`, err.message);
        failed++;
      }

      // Esperar 2 segundos entre destinatários (evitar bloqueio)
      if (targets.indexOf(target) < targets.length - 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    // Atualizar status para "completed"
    await prisma.messageSequence.update({
      where: { id: sequenceId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        totalSent: sent,
        totalFailed: failed,
      },
    });

    console.log(`[Sequence] ✅ Sequência ${sequenceId} concluída: ${sent} enviadas, ${failed} falhadas`);
  }

  /**
   * Enviar uma mensagem individual
   */
  private async sendMessage(
    target: { id: string; isGroup: boolean },
    message: { type: string; body?: string; mediaPath?: string; caption?: string }
  ): Promise<void> {
    if (message.type === 'text') {
      if (!message.body || message.body.trim() === '') {
        throw new Error('Mensagem de texto sem conteúdo');
      }
      if (target.isGroup) {
        await whatsappService.sendToGroup(target.id, message.body!);
      } else {
        await whatsappService.sendText(target.id, message.body!);
      }
    } else {
      // ✅ FIX: Resolução robusta do caminho do arquivo de mídia
      const filePath = this.resolveMediaPath(message.mediaPath!);
      if (!filePath) {
        throw new Error(`Arquivo de mídia não encontrado: ${message.mediaPath}`);
      }

      if (target.isGroup) {
        await whatsappService.sendMediaToGroup(target.id, filePath, message.caption);
      } else {
        await whatsappService.sendMedia(target.id, filePath, message.caption);
      }
    }
  }

  /**
   * ✅ FIX: Resolve o caminho real do arquivo de mídia testando múltiplas estratégias
   */
  private resolveMediaPath(mediaPath: string): string | null {
    if (!mediaPath) return null;

    const candidates = [
      // 1. Caminho absoluto direto
      mediaPath,
      // 2. Relativo ao cwd (ex: uploads/media/file.ext ou ../data/uploads/media/file.ext)
      path.join(process.cwd(), mediaPath),
      // 3. Relativo ao UPLOADS_PATH
      process.env.UPLOADS_PATH
        ? path.join(process.env.UPLOADS_PATH, mediaPath)
        : null,
      // 4. Apenas o nome do arquivo dentro do UPLOADS_PATH/media
      process.env.UPLOADS_PATH
        ? path.join(process.env.UPLOADS_PATH, 'media', path.basename(mediaPath))
        : null,
      // 5. Dentro da pasta uploads local
      path.join(process.cwd(), 'uploads', 'media', path.basename(mediaPath)),
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        console.log(`[Sequence] 📁 Arquivo encontrado em: ${candidate}`);
        return candidate;
      }
    }

    console.error(`[Sequence] ❌ Arquivo não encontrado. Tentativas: ${candidates.join(', ')}`);
    return null;
  }

  /**
   * Buscar destinatários baseado no tipo
   */
  private async getTargets(sequence: any): Promise<{ id: string; isGroup: boolean }[]> {
    const targets: { id: string; isGroup: boolean }[] = [];

    if (sequence.targetType === 'contact' && sequence.targetId) {
      // Um único contato
      const contact = await prisma.contact.findUnique({ where: { id: sequence.targetId } });
      if (contact) targets.push({ id: contact.phone, isGroup: false });
    } else if (sequence.targetType === 'group' && sequence.targetId) {
      // Um único grupo
      const group = await prisma.whatsAppGroup.findUnique({ where: { id: sequence.targetId } });
      if (group) targets.push({ id: group.groupId, isGroup: true });
    } else if (sequence.targetType === 'all') {
      // Todos os contatos e grupos
      const contacts = await prisma.contact.findMany({ where: { status: 'active' } });
      contacts.forEach((c) => targets.push({ id: c.phone, isGroup: false }));

      const groups = await prisma.whatsAppGroup.findMany({ where: { active: true } });
      groups.forEach((g) => targets.push({ id: g.groupId, isGroup: true }));
    } else if (sequence.targetType === 'tagged') {
      // Contatos com tags específicas
      let tags: string[] = [];
      try { tags = JSON.parse(sequence.targetTags); } catch { tags = []; }

      if (tags.length > 0) {
        const contacts = await prisma.contact.findMany({
          where: {
            status: 'active',
            tags: { contains: tags[0] },
          },
        });
        contacts.forEach((c) => targets.push({ id: c.phone, isGroup: false }));
      }
    } else if (sequence.targetType === 'all_students') {
      // Todos os alunos
      const contacts = await prisma.contact.findMany({
        where: {
          status: 'active',
          student: { isNot: null },
        },
      });
      contacts.forEach((c) => targets.push({ id: c.phone, isGroup: false }));
    }

    return targets;
  }

  /**
   * Cancelar uma sequência agendada
   */
  async cancelSequence(sequenceId: string): Promise<void> {
    if (this.activeSchedules.has(sequenceId)) {
      clearTimeout(this.activeSchedules.get(sequenceId)!);
      this.activeSchedules.delete(sequenceId);
    }

    await prisma.messageSequence.update({
      where: { id: sequenceId },
      data: { status: 'cancelled' },
    });

    console.log(`[Sequence] ⛔ Sequência ${sequenceId} foi cancelada`);
  }

  /**
   * Recarregar sequências agendadas do banco (para quando o servidor reinicia)
   */
  async reloadSchedules(): Promise<void> {
    const sequences = await prisma.messageSequence.findMany({
      where: { status: 'pending', scheduledAt: { gt: new Date() } },
    });

    for (const seq of sequences) {
      await this.scheduleSequence(seq.id);
    }

    console.log(`[Sequence] 📅 ${sequences.length} sequências recarregadas do banco`);
  }
}

export const sequenceService = new SequenceService();

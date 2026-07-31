import { prisma } from './database';
import { whatsappService } from './whatsapp.service';
import path from 'path';
import fs from 'fs';

class SequenceService {
  private activeSchedules: Map<string, NodeJS.Timeout> = new Map();
  // Mídias levam alguns segundos para serem preparadas pelo WhatsApp Web.
  // Iniciamos um pouco antes para a primeira mensagem chegar no horário escolhido.
  private readonly sendLeadMs = Number(process.env.SEQUENCE_SEND_LEAD_MS || 4000);

  private parseStringArray(value: string): string[] {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  private getNextRepeatedOccurrence(
    sequence: any,
    after = new Date()
  ): { date: Date; messageIds: string[] } | null {
    const dayNames = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const startDate = new Date(sequence.scheduledAt);
    const candidates: Array<{ date: Date; messageId: string }> = [];

    for (const message of sequence.messages) {
      const times = this.parseStringArray(message.repeatTimes)
        .filter((time) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(time));
      const days = this.parseStringArray(message.repeatDays);

      for (let offset = 0; offset <= 370; offset++) {
        const date = new Date(startDate);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + offset);

        // Sem dias selecionados, os horários são executados somente na data escolhida.
        if (days.length === 0 && offset > 0) break;
        if (days.length > 0 && !days.includes(dayNames[date.getDay()])) continue;

        for (const time of times) {
          const [hour, minute] = time.split(':').map(Number);
          const occurrence = new Date(date);
          occurrence.setHours(hour, minute, 0, 0);
          const wasAlreadySent =
            message.lastSentAt && occurrence.getTime() <= new Date(message.lastSentAt).getTime();
          if (!wasAlreadySent && occurrence.getTime() > after.getTime() + 500) {
            candidates.push({ date: occurrence, messageId: message.id });
          }
        }

        // Para recorrência semanal basta procurar até a próxima semana.
        if (days.length > 0 && offset >= 7 && candidates.some((item) => item.messageId === message.id)) {
          break;
        }
      }
    }

    if (candidates.length === 0) return null;
    candidates.sort((left, right) => left.date.getTime() - right.date.getTime());
    const nextTime = candidates[0].date.getTime();
    return {
      date: candidates[0].date,
      messageIds: candidates
        .filter((item) => item.date.getTime() === nextTime)
        .map((item) => item.messageId),
    };
  }

  /**
   * Agenda uma sequência de mensagens para envio
   */
  async scheduleSequence(sequenceId: string, afterOccurrence?: Date): Promise<void> {
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

    const hasMultipleTimes = sequence.messages.some(
      (message) => this.parseStringArray(message.repeatTimes).length > 0
    );
    if (hasMultipleTimes) {
      const next = this.getNextRepeatedOccurrence(sequence, afterOccurrence || new Date());
      if (!next) {
        await prisma.messageSequence.update({
          where: { id: sequenceId },
          data: { status: 'completed', completedAt: new Date() },
        });
        this.activeSchedules.delete(sequenceId);
        return;
      }

      await prisma.messageSequence.update({
        where: { id: sequenceId },
        data: { status: 'pending', completedAt: null },
      });

      const delayMs = Math.max(0, next.date.getTime() - Date.now() - this.sendLeadMs);
      console.log(
        `[Sequence] Sequência ${sequenceId} agendada para ${next.date.toLocaleString('pt-BR')} ` +
        `(${next.messageIds.length} arquivo(s)/mensagem(ns))`
      );
      const timeout = setTimeout(async () => {
        try {
          await this.sendScheduledMessages(sequenceId, next.messageIds, next.date);
        } catch (err: any) {
          console.error(`[Sequence] Erro no horário agendado de ${sequenceId}:`, err.message);
        } finally {
          this.activeSchedules.delete(sequenceId);
          // Procura somente horários posteriores ao que acabou de ser executado.
          // Isso evita repetir o mesmo disparo quando a preparação começa antes.
          await this.scheduleSequence(sequenceId, next.date);
        }
      }, delayMs);
      this.activeSchedules.set(sequenceId, timeout);
      return;
    }

    const delayMs = sequence.scheduledAt.getTime() - Date.now() - this.sendLeadMs;
    if (delayMs <= 0) {
      // Executa em background para não bloquear a HTTP request de criação
      console.log(`[Sequence] ⚡ Sequência ${sequenceId} em execução imediata (background)`);
      setImmediate(() => {
        this.sendSequenceNow(sequenceId).catch((err: any) =>
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

  private async sendScheduledMessages(
    sequenceId: string,
    messageIds: string[],
    scheduledFor: Date
  ): Promise<void> {
    const sequence = await prisma.messageSequence.findUnique({
      where: { id: sequenceId },
      include: { messages: { orderBy: { order: 'asc' } } },
    });
    if (!sequence || sequence.status === 'cancelled') return;

    const { isReady } = whatsappService.getStatus();
    if (!isReady) throw new Error('WhatsApp não está conectado');

    const messages = sequence.messages.filter((message) => messageIds.includes(message.id));
    const targets = await this.getTargets(sequence);
    if (targets.length === 0) throw new Error('Nenhum destinatário encontrado');

    let sent = 0;
    let failed = 0;
    for (const target of targets) {
      try {
        for (let index = 0; index < messages.length; index++) {
          const message = messages[index];
          if (index > 0 && message.delayBefore > 0) {
            await new Promise((resolve) => setTimeout(resolve, message.delayBefore));
          }
          await this.sendMessage(target, {
            type: message.type,
            body: message.body || undefined,
            mediaPath: message.mediaPath || undefined,
            caption: message.caption || undefined,
          });
        }
        sent++;
      } catch (err: any) {
        failed++;
        console.error(`[Sequence] Falha no envio agendado para ${target.id}:`, err.message);
      }
    }

    await prisma.messageSequence.update({
      where: { id: sequenceId },
      data: {
        totalSent: { increment: sent },
        totalFailed: { increment: failed },
        startedAt: sequence.startedAt || new Date(),
      },
    });
    await prisma.sequenceMessage.updateMany({
      where: { id: { in: messageIds } },
      data: { lastSentAt: scheduledFor },
    });
    console.log(`[Sequence] Horário concluído: ${sent} destinatário(s), ${failed} falha(s).`);
  }

  /**
   * Envia uma sequência NOW (sem esperar agendamento)
   * @param force - Se true, reenvia mesmo que já esteja completed/running (ex: botão "Enviar Agora")
   */
  async sendSequenceNow(sequenceId: string, force = false): Promise<{ sent: number; failed: number; errors: string[] }> {
    const sequence = await prisma.messageSequence.findUnique({
      where: { id: sequenceId },
      include: { messages: { orderBy: { order: 'asc' } } },
    });

    if (!sequence) throw new Error('Sequência não encontrada');

    // force=true reseta o status e permite reenvio explícito
    if (force) {
      await prisma.messageSequence.update({
        where: { id: sequenceId },
        data: { status: 'pending', startedAt: null, completedAt: null, totalSent: 0, totalFailed: 0 },
      });
    } else if (sequence.status === 'running' || sequence.status === 'completed') {
      console.log(`[Sequence] ⚠️ Sequência ${sequenceId} já foi executada (use force=true para reenviar)`);
      return { sent: 0, failed: 0, errors: ['Sequência já foi executada'] };
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

    console.log(`[Sequence] 🚀 Iniciando sequência ${sequenceId} com ${targets.length} destinatário(s) e ${sequence.messages.length} mensagem(ns)`);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const target of targets) {
      try {
        // Para cada destinatário, enviar todas as mensagens em sequência
        for (let i = 0; i < sequence.messages.length; i++) {
          const message = sequence.messages[i];

          // delayBefore: espera ANTES de enviar esta mensagem (exceto a primeira)
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
          console.log(`[Sequence] ✉️ Mensagem ${i + 1}/${sequence.messages.length} enviada para ${target.id}`);

          // messageDelay: intervalo ENTRE mensagens (aguarda antes da próxima)
          if (i < sequence.messages.length - 1 && message.messageDelay > 0) {
            await new Promise((r) => setTimeout(r, message.messageDelay));
          }
        }
        sent++;
      } catch (err: any) {
        const errMsg = `${target.id}: ${err.message}`;
        console.error(`[Sequence] ❌ Falha para ${target.id}:`, err.message);
        errors.push(errMsg);
        failed++;
      }

      // Esperar 2 segundos entre destinatários (evitar bloqueio do WhatsApp)
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
    if (errors.length > 0) {
      console.error('[Sequence] Erros:', errors.join(' | '));
    }

    return { sent, failed, errors };
  }

  /**
   * Enviar uma mensagem individual para um destinatário
   */
  private async sendMessage(
    target: { id: string; isGroup: boolean },
    message: { type: string; body?: string; mediaPath?: string; caption?: string }
  ): Promise<void> {
    if (message.type === 'text') {
      if (!message.body || message.body.trim() === '') {
        throw new Error('Mensagem de texto sem conteúdo');
      }

      const WHATSAPP_MAX_CHARS = 4096;
      if (message.body.length > WHATSAPP_MAX_CHARS) {
        throw new Error(
          `Mensagem de texto excede o limite do WhatsApp (${message.body.length}/${WHATSAPP_MAX_CHARS} caracteres)`
        );
      }

      // Preserve line breaks: log the exact body being sent so truncation is detectable
      console.log(
        `[Sequence] 📝 Enviando texto para ${target.id} | ` +
        `Tamanho: ${message.body.length} chars | ` +
        `Quebras de linha: ${(message.body.match(/\n/g) || []).length} | ` +
        `Conteúdo completo:\n---\n${message.body}\n---`
      );

      // The body is passed as-is so \n characters are preserved by whatsapp-web.js
      if (target.isGroup) {
        await whatsappService.sendToGroup(target.id, message.body);
      } else {
        await whatsappService.sendText(target.id, message.body);
      }
    } else {
      // Resolução robusta do caminho do arquivo de mídia
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
   * Resolve o caminho real do arquivo de mídia testando múltiplas estratégias.
   * Aceita paths no formato '/uploads/media/filename.ext' (URL-style) ou absolutos.
   */
  private resolveMediaPath(mediaPath: string): string | null {
    if (!mediaPath) return null;

    const baseUploads = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
    // Remove leading slash para poder usar path.join corretamente
    const cleanPath = mediaPath.startsWith('/') ? mediaPath.slice(1) : mediaPath;
    const filename = path.basename(mediaPath);

    const candidates = [
      // 1. Caminho absoluto direto (caso já seja absoluto)
      mediaPath,
      // 2. Relativo ao cwd: /uploads/media/file -> cwd/uploads/media/file
      path.join(process.cwd(), cleanPath),
      // 3. Relativo ao UPLOADS_PATH base: /uploads/media/file -> UPLOADS_PATH/media/file
      process.env.UPLOADS_PATH
        ? path.join(baseUploads, 'media', filename)
        : null,
      // 4. Apenas filename dentro de uploads/media (fallback)
      path.join(process.cwd(), 'uploads', 'media', filename),
      // 5. Relativo ao UPLOADS_PATH diretamente (sem subpasta)
      process.env.UPLOADS_PATH
        ? path.join(process.env.UPLOADS_PATH, cleanPath)
        : null,
    ].filter(Boolean) as string[];

    // Remover duplicatas
    const unique = [...new Set(candidates)];

    console.log(`[Sequence] 🔍 Resolvendo mídia: "${mediaPath}" — tentando ${unique.length} caminho(s)...`);
    for (const candidate of unique) {
      if (fs.existsSync(candidate)) {
        console.log(`[Sequence] 📁 Arquivo encontrado em: ${candidate}`);
        return candidate;
      }
    }

    console.error(`[Sequence] ❌ Arquivo não encontrado após tentar:\n  ${unique.join('\n  ')}`);
    return null;
  }

  /**
   * Buscar destinatários baseado no tipo de alvo
   */
  /**
   * Normaliza o número de telefone: remove +, espaços, traços, parênteses.
   * Garante apenas dígitos (ex: +55 (11) 91234-5678 -> 5511912345678)
   */
  private normalizePhone(phone: string): string {
    return phone.replace(/[^\d]/g, '');
  }

  private async getTargets(sequence: any): Promise<{ id: string; isGroup: boolean }[]> {
    const targets: { id: string; isGroup: boolean }[] = [];

    // targetId vazio string não deve ser usado como ID
    const targetId = sequence.targetId && sequence.targetId.trim() !== '' ? sequence.targetId.trim() : null;

    if (sequence.targetType === 'contact' && targetId) {
      const contact = await prisma.contact.findUnique({ where: { id: targetId } });
      if (contact) {
        const normalizedPhone = this.normalizePhone(contact.phone);
        console.log(`[Sequence] 📞 Contato: ${contact.name} | Phone original: ${contact.phone} | Normalizado: ${normalizedPhone}`);
        targets.push({ id: normalizedPhone, isGroup: false });
      } else {
        console.warn(`[Sequence] ⚠️ Contato com ID ${targetId} não encontrado no banco`);
      }
    } else if (sequence.targetType === 'group' && targetId) {
      const group = await prisma.whatsAppGroup.findUnique({ where: { id: targetId } });
      if (group) {
        targets.push({ id: group.groupId, isGroup: true });
      } else {
        console.warn(`[Sequence] ⚠️ Grupo com ID ${targetId} não encontrado no banco`);
      }
    } else if (sequence.targetType === 'all') {
      const contacts = await prisma.contact.findMany({ where: { status: 'active' } });
      contacts.forEach((c) => targets.push({ id: this.normalizePhone(c.phone), isGroup: false }));

      const groups = await prisma.whatsAppGroup.findMany({ where: { active: true } });
      groups.forEach((g) => targets.push({ id: g.groupId, isGroup: true }));
    } else if (sequence.targetType === 'tagged') {
      let tags: string[] = [];
      try { tags = JSON.parse(sequence.targetTags); } catch { tags = []; }

      if (tags.length > 0) {
        const contacts = await prisma.contact.findMany({
          where: {
            status: 'active',
            tags: { contains: tags[0] },
          },
        });
        contacts.forEach((c) => targets.push({ id: this.normalizePhone(c.phone), isGroup: false }));
      }
    } else if (sequence.targetType === 'all_students') {
      const contacts = await prisma.contact.findMany({
        where: {
          status: 'active',
          student: { isNot: null },
        },
      });
      contacts.forEach((c) => targets.push({ id: this.normalizePhone(c.phone), isGroup: false }));
    } else {
      console.warn(`[Sequence] ⚠️ targetType desconhecido ou targetId ausente: type=${sequence.targetType}, targetId=${targetId}`);
    }

    console.log(`[Sequence] 🎯 ${targets.length} destinatário(s) encontrado(s) para targetType=${sequence.targetType}`);
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
      where: { status: 'pending' },
    });

    for (const seq of sequences) {
      await this.scheduleSequence(seq.id);
    }

    console.log(`[Sequence] 📅 ${sequences.length} sequências recarregadas do banco`);
  }
}

export const sequenceService = new SequenceService();

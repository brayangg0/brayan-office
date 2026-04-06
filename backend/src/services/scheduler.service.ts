import cron from 'node-cron';
import path from 'path';
import { prisma } from './database';
import { whatsappService } from './whatsapp.service';

class SchedulerService {
  private jobs: Map<string, cron.ScheduledTask> = new Map();

  async initialize() {
    // Verifica mensagens agendadas a cada minuto
    cron.schedule('* * * * *', () => this.processPendingMessages());

    // Recarrega agendamentos recorrentes na inicialização
    await this.loadRecurringSchedules();
    console.log('[Scheduler] Agendador configurado');
  }

  /** Processa mensagens agendadas com status 'pending' que já venceram */
  private async processPendingMessages() {
    const now = new Date();
    const pending = await prisma.scheduledMessage.findMany({
      where: { status: 'pending', scheduledAt: { lte: now }, recurring: false },
    });

    for (const msg of pending) {
      await this.sendScheduledMessage(msg);
    }
  }

  /** Carrega e registra mensagens recorrentes (com cronExpr) */
  private async loadRecurringSchedules() {
    const recurring = await prisma.scheduledMessage.findMany({
      where: { recurring: true, status: 'pending', cronExpr: { not: null } },
    });

    for (const msg of recurring) {
      this.registerCronJob(msg.id, msg.cronExpr!, msg);
    }
  }

  /** Registra um cron job para mensagem recorrente */
  private registerCronJob(id: string, cronExpr: string, msg: any) {
    if (this.jobs.has(id)) {
      this.jobs.get(id)!.stop();
    }
    const task = cron.schedule(cronExpr, () => this.sendScheduledMessage(msg), { scheduled: true });
    this.jobs.set(id, task);
    console.log(`[Scheduler] Cron job registrado: ${id} (${cronExpr})`);
  }

  /** Envia uma mensagem agendada */
  private async sendScheduledMessage(msg: any) {
    console.log(`[Scheduler] Enviando mensagem agendada: ${msg.id}`);
    try {
      const targets = await this.resolveTargets(msg);
      if (targets.length === 0) {
        console.warn(`[Scheduler] Nenhum destino encontrado para: ${msg.id}`);
        return;
      }

      const content = {
        type: msg.type,
        body: msg.body,
        mediaPath: msg.mediaPath,
        caption: msg.body,
      };

      const { sent, failed } = await whatsappService.sendWithDelay(targets, content, 3000);

      if (!msg.recurring) {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'sent', sentAt: new Date() },
        });
      }

      // Atualiza campanhas vinculadas
      if (msg.campaignId) {
        await prisma.campaign.update({
          where: { id: msg.campaignId },
          data: { totalSent: { increment: sent }, totalFailed: { increment: failed } },
        });
      }

      console.log(`[Scheduler] Mensagem ${msg.id}: ${sent} enviadas, ${failed} falhas`);
    } catch (err: any) {
      console.error(`[Scheduler] Erro ao enviar ${msg.id}:`, err.message);
      if (!msg.recurring) {
        await prisma.scheduledMessage.update({
          where: { id: msg.id },
          data: { status: 'failed', error: err.message },
        });
      }
    }
  }

  /** Resolve os destinos de uma mensagem agendada */
  private async resolveTargets(msg: any): Promise<{ id: string; isGroup: boolean }[]> {
    const targets: { id: string; isGroup: boolean }[] = [];
    const tags: string[] = msg.targetTags ? JSON.parse(msg.targetTags) : [];

    switch (msg.targetType) {
      case 'contact':
        if (msg.targetId) {
          const c = await prisma.contact.findUnique({ where: { id: msg.targetId } });
          if (c) targets.push({ id: c.phone, isGroup: false });
        }
        break;

      case 'group':
        if (msg.targetId) {
          const g = await prisma.whatsAppGroup.findUnique({ where: { id: msg.targetId } });
          if (g) targets.push({ id: g.groupId, isGroup: true });
        }
        break;

      case 'all_students':
        const students = await prisma.contact.findMany({ where: { student: { isNot: null }, status: 'active' } });
        students.forEach((s) => targets.push({ id: s.phone, isGroup: false }));
        break;

      case 'tagged':
        if (tags.length > 0) {
          const all = await prisma.contact.findMany({ where: { status: 'active' } });
          all.forEach((c) => {
            const ctags: string[] = JSON.parse(c.tags || '[]');
            if (tags.some((t) => ctags.includes(t))) targets.push({ id: c.phone, isGroup: false });
          });
        }
        break;

      case 'all':
        const allContacts = await prisma.contact.findMany({ where: { status: 'active' } });
        allContacts.forEach((c) => targets.push({ id: c.phone, isGroup: false }));
        break;
    }

    return targets;
  }

  /** Agenda uma nova mensagem */
  async scheduleMessage(data: {
    userId: string;
    targetType: string;
    targetId?: string;
    targetTags?: string[];
    type: string;
    body?: string;
    mediaPath?: string;
    scheduledAt: Date;
    cronExpr?: string;
    recurring?: boolean;
    campaignId?: string;
  }) {
    const msg = await prisma.scheduledMessage.create({
      data: {
        userId: data.userId,
        targetType: data.targetType,
        targetId: data.targetId,
        targetTags: JSON.stringify(data.targetTags || []),
        type: data.type,
        body: data.body,
        mediaPath: data.mediaPath,
        scheduledAt: data.scheduledAt,
        cronExpr: data.cronExpr,
        recurring: data.recurring || false,
        campaignId: data.campaignId,
      },
    });

    if (data.recurring && data.cronExpr) {
      this.registerCronJob(msg.id, data.cronExpr, msg);
    }

    return msg;
  }

  /** Cancela um agendamento */
  async cancelSchedule(id: string) {
    if (this.jobs.has(id)) {
      this.jobs.get(id)!.stop();
      this.jobs.delete(id);
    }
    return prisma.scheduledMessage.update({ where: { id }, data: { status: 'cancelled' } });
  }
}

export const schedulerService = new SchedulerService();

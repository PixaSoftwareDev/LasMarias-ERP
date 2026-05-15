import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Notification, NotificationKind, NotificationSeverity } from '@lasmarias/shared-schemas';
import { NotificationEntity } from './notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  async list(unreadOnly = false): Promise<Notification[]> {
    const rows = await this.repo.find({
      where: unreadOnly ? { read: false } : {},
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return rows.map((n) => this.toDto(n));
  }

  async create(input: {
    title: string;
    body?: string;
    severity: NotificationSeverity;
    kind: NotificationKind;
    referenceType?: string;
    referenceId?: string;
  }): Promise<Notification> {
    const n = this.repo.create({
      title: input.title,
      body: input.body ?? null,
      severity: input.severity,
      kind: input.kind,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      read: false,
    });
    return this.toDto(await this.repo.save(n));
  }

  async markRead(id: string): Promise<Notification> {
    await this.repo.update(id, { read: true });
    const r = await this.repo.findOneByOrFail({ id });
    return this.toDto(r);
  }

  async markAllRead(): Promise<{ updated: number }> {
    const res = await this.repo
      .createQueryBuilder()
      .update(NotificationEntity)
      .set({ read: true })
      .where('read = false')
      .execute();
    return { updated: res.affected ?? 0 };
  }

  async unreadCount(): Promise<number> {
    return this.repo.count({ where: { read: false } });
  }

  toDto(n: NotificationEntity): Notification {
    return {
      id: n.id,
      title: n.title,
      body: n.body ?? undefined,
      severity: n.severity,
      kind: n.kind,
      referenceType: n.referenceType ?? undefined,
      referenceId: n.referenceId ?? undefined,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CreateDeliveryExceptionInput,
  CreateDeliveryZoneInput,
  DeliveryException,
  DeliveryZone,
  Weekday,
} from '@lasmarias/shared-schemas';
import { DeliveryExceptionEntity, DeliveryZoneEntity } from './delivery-zone.entity';
import { DeliveryRules, nextDeliveryDate } from './next-delivery';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectRepository(DeliveryZoneEntity)
    private readonly zones: Repository<DeliveryZoneEntity>,
    @InjectRepository(DeliveryExceptionEntity)
    private readonly exceptions: Repository<DeliveryExceptionEntity>,
  ) {}

  async listZones(): Promise<DeliveryZone[]> {
    const rows = await this.zones.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return rows.map((z) => this.zoneToDto(z));
  }

  async getZone(id: string): Promise<DeliveryZoneEntity> {
    const z = await this.zones.findOne({ where: { id } });
    if (!z) throw new NotFoundException('Zona no encontrada');
    return z;
  }

  async createZone(input: CreateDeliveryZoneInput): Promise<DeliveryZone> {
    const z = this.zones.create({
      name: input.name,
      description: input.description ?? null,
      deliveryDays: input.deliveryDays,
      cutoffTime: input.cutoffTime,
      isActive: true,
    });
    return this.zoneToDto(await this.zones.save(z));
  }

  async listExceptions(zoneId?: string): Promise<DeliveryException[]> {
    const rows = await this.exceptions.find({
      where: zoneId ? { zoneId } : {},
      order: { date: 'ASC' },
    });
    return rows.map((e) => this.exceptionToDto(e));
  }

  async createException(input: CreateDeliveryExceptionInput): Promise<DeliveryException> {
    await this.getZone(input.zoneId);
    const e = this.exceptions.create({
      zoneId: input.zoneId,
      date: input.date,
      kind: input.kind,
      reason: input.reason ?? null,
    });
    return this.exceptionToDto(await this.exceptions.save(e));
  }

  // Construye las reglas y calcula la próxima fecha. Útil al cargar un pedido.
  async nextDateForZone(zoneId: string, from: Date = new Date()): Promise<string> {
    const zone = await this.getZone(zoneId);
    const rules = await this.buildRules(zone);
    return nextDeliveryDate(from, rules);
  }

  async buildRules(zone: DeliveryZoneEntity): Promise<DeliveryRules> {
    const exceptions = await this.exceptions.find({ where: { zoneId: zone.id } });
    return {
      deliveryDays: zone.deliveryDays as Weekday[],
      cutoffTime: zone.cutoffTime,
      suspendedDates: new Set(exceptions.filter((e) => e.kind === 'suspended').map((e) => e.date)),
      extraDates: new Set(exceptions.filter((e) => e.kind === 'extra').map((e) => e.date)),
    };
  }

  zoneToDto(z: DeliveryZoneEntity): DeliveryZone {
    return {
      id: z.id,
      name: z.name,
      description: z.description ?? undefined,
      deliveryDays: z.deliveryDays,
      cutoffTime: z.cutoffTime,
      isActive: z.isActive,
      createdAt: z.createdAt.toISOString(),
      updatedAt: z.updatedAt.toISOString(),
    };
  }

  exceptionToDto(e: DeliveryExceptionEntity): DeliveryException {
    return {
      id: e.id,
      zoneId: e.zoneId,
      date: e.date,
      kind: e.kind,
      reason: e.reason ?? undefined,
      createdAt: e.createdAt.toISOString(),
    };
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import type {
  ClientType,
  PriceListItem,
  UpsertPriceListInput,
} from '@lasmarias/shared-schemas';
import { PriceListItemEntity } from './price-list-item.entity';
import { resolvePrice, type PriceListEntry } from './accounts.helpers';

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PriceListItemEntity)
    private readonly repo: Repository<PriceListItemEntity>,
  ) {}

  // Precios vigentes de un tipo de cliente, con datos del producto para la grilla.
  async listByClientType(clientType: ClientType): Promise<PriceListItem[]> {
    const rows = await this.repo.find({
      where: { clientType, isActive: true },
      relations: { product: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toDto(r));
  }

  // Upsert masivo: desactiva los precios vigentes del tipo y crea los nuevos.
  // Transaccional para no dejar el tipo de cliente a medias.
  async upsert(input: UpsertPriceListInput): Promise<PriceListItem[]> {
    await this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(PriceListItemEntity);
      await repo.update({ clientType: input.clientType, isActive: true }, { isActive: false });
      for (const item of input.items) {
        await repo.save(
          repo.create({
            clientType: input.clientType,
            productId: item.productId,
            unitPrice: String(item.unitPrice),
            isActive: true,
          }),
        );
      }
    });
    return this.listByClientType(input.clientType);
  }

  // Carga las entradas de precio vigentes de un tipo de cliente como datos planos
  // para la función pura resolvePrice (usada al tomar el pedido).
  async loadEntries(
    clientType: ClientType,
    manager?: EntityManager,
  ): Promise<PriceListEntry[]> {
    const repo = manager ? manager.getRepository(PriceListItemEntity) : this.repo;
    const rows = await repo.find({ where: { clientType, isActive: true } });
    return rows.map((r) => ({
      clientType: r.clientType,
      productId: r.productId,
      unitPrice: Number(r.unitPrice),
    }));
  }

  // Reexporta la función pura para uso del servicio de ventas.
  resolve = resolvePrice;

  private toDto(e: PriceListItemEntity): PriceListItem {
    return {
      id: e.id,
      clientType: e.clientType,
      productId: e.productId,
      productName: e.product?.name ?? '',
      sku: e.product?.sku ?? '',
      unit: e.product?.unit ?? '',
      unitPrice: Number(e.unitPrice),
      isActive: e.isActive,
    };
  }
}

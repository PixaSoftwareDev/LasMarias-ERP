import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import type {
  CalculateSettlementInput,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  ProducerSettlement,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  Supplier,
} from '@lasmarias/shared-schemas';
import { SupplierEntity } from './supplier.entity';
import { PurchaseOrderEntity } from './purchase-order.entity';
import { ProducerSettlementEntity } from './producer-settlement.entity';
import { ProductsService } from '../products/products.service';
import { ProducersService } from '../producers/producers.service';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(SupplierEntity)
    private readonly suppliers: Repository<SupplierEntity>,
    @InjectRepository(PurchaseOrderEntity)
    private readonly orders: Repository<PurchaseOrderEntity>,
    @InjectRepository(ProducerSettlementEntity)
    private readonly settlements: Repository<ProducerSettlementEntity>,
    @InjectRepository(MilkReceptionEntity)
    private readonly milkReceptions: Repository<MilkReceptionEntity>,
    private readonly products: ProductsService,
    private readonly producers: ProducersService,
  ) {}

  async listSuppliers(): Promise<Supplier[]> {
    const rows = await this.suppliers.find({ where: { isActive: true }, order: { businessName: 'ASC' } });
    return rows.map((s) => this.supplierToDto(s));
  }

  async createSupplier(input: CreateSupplierInput): Promise<Supplier> {
    const s = this.suppliers.create({
      businessName: input.businessName,
      taxId: input.taxId || null,
      contactName: input.contactName ?? null,
      email: input.email || null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      isActive: true,
    });
    return this.supplierToDto(await this.suppliers.save(s));
  }

  async listPurchaseOrders(): Promise<PurchaseOrder[]> {
    const rows = await this.orders.find({
      relations: { supplier: true },
      order: { orderedAt: 'DESC' },
      take: 200,
    });
    return rows.map((o) => this.orderToDto(o));
  }

  async createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
    const supplier = await this.suppliers.findOne({ where: { id: input.supplierId } });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    const lines: PurchaseOrderLine[] = [];
    let total = 0;
    for (const l of input.lines) {
      const product = await this.products.get(l.productId);
      const subtotal = Math.round(l.quantity * l.unitPrice * 100) / 100;
      total += subtotal;
      lines.push({
        productId: product.id,
        productName: product.name,
        quantity: l.quantity,
        unit: product.unit,
        unitPrice: l.unitPrice,
        subtotal,
      });
    }
    const count = await this.orders.count();
    const order = this.orders.create({
      code: `OC-${String(count + 1).padStart(6, '0')}`,
      supplierId: supplier.id,
      status: 'draft',
      orderedAt: new Date(),
      expectedDate: input.expectedDate ?? null,
      lines,
      total: String(Math.round(total * 100) / 100),
      notes: input.notes ?? null,
    });
    const saved = await this.orders.save(order);
    const reloaded = await this.orders.findOne({ where: { id: saved.id }, relations: { supplier: true } });
    return this.orderToDto(reloaded!);
  }

  async updatePurchaseOrderStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    const o = await this.orders.findOne({ where: { id } });
    if (!o) throw new NotFoundException('Orden de compra no encontrada');
    o.status = status;
    await this.orders.save(o);
    const reloaded = await this.orders.findOne({ where: { id }, relations: { supplier: true } });
    return this.orderToDto(reloaded!);
  }

  // CLAUDE.md §4.5 — Liquidación a productores: cálculo de monto a pagar por período.
  // MVP: usa el precio acordado del productor × litros aceptados en el período.
  // En el futuro: ajuste por calidad (bonificación por grasa/proteína, descuento por RCS alto).
  async calculateSettlement(input: CalculateSettlementInput): Promise<ProducerSettlement> {
    const producer = await this.producers.get(input.producerId);
    if (!producer.agreedPricePerLiter)
      throw new BadRequestException('El productor no tiene precio acordado por litro');

    const from = new Date(`${input.periodFrom}T00:00:00`);
    const to = new Date(`${input.periodTo}T23:59:59`);
    const receptions = await this.milkReceptions.find({
      where: { producerId: producer.id, receivedAt: Between(from, to), status: 'aceptada' },
    });
    const totalLiters = receptions.reduce((sum, r) => sum + Number(r.liters), 0);
    const price = Number(producer.agreedPricePerLiter);
    const totalAmount = Math.round(totalLiters * price * 100) / 100;

    const entity = this.settlements.create({
      producerId: producer.id,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      totalLiters: String(totalLiters),
      averagePricePerLiter: String(price),
      totalAmount: String(totalAmount),
    });
    const saved = await this.settlements.save(entity);
    return this.settlementToDto(saved, producer.name);
  }

  async listSettlements(): Promise<ProducerSettlement[]> {
    const rows = await this.settlements.find({ relations: { producer: true }, order: { createdAt: 'DESC' } });
    return rows.map((s) => this.settlementToDto(s, s.producer?.name ?? ''));
  }

  supplierToDto(s: SupplierEntity): Supplier {
    return {
      id: s.id,
      businessName: s.businessName,
      taxId: s.taxId ?? undefined,
      contactName: s.contactName ?? undefined,
      email: s.email ?? undefined,
      phone: s.phone ?? undefined,
      address: s.address ?? undefined,
      notes: s.notes ?? undefined,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  orderToDto(o: PurchaseOrderEntity): PurchaseOrder {
    return {
      id: o.id,
      code: o.code,
      supplierId: o.supplierId,
      supplierName: o.supplier?.businessName ?? '',
      status: o.status,
      orderedAt: o.orderedAt.toISOString(),
      expectedDate: o.expectedDate ?? undefined,
      lines: o.lines,
      total: Number(o.total),
      notes: o.notes ?? undefined,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }

  settlementToDto(s: ProducerSettlementEntity, producerName: string): ProducerSettlement {
    return {
      id: s.id,
      producerId: s.producerId,
      producerName,
      periodFrom: s.periodFrom,
      periodTo: s.periodTo,
      totalLiters: Number(s.totalLiters),
      averagePricePerLiter: Number(s.averagePricePerLiter),
      totalAmount: Number(s.totalAmount),
      notes: s.notes ?? undefined,
      createdAt: s.createdAt.toISOString(),
    };
  }
}

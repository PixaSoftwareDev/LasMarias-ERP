import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CreateProductInput,
  CreateProductPresentationInput,
  Product,
  ProductPresentation,
  UpdateProductInput,
} from '@lasmarias/shared-schemas';
import { ProductEntity } from './product.entity';
import { ProductPresentationEntity } from './product-presentation.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
    @InjectRepository(ProductPresentationEntity)
    private readonly presentationRepo: Repository<ProductPresentationEntity>,
  ) {}

  async list(): Promise<Product[]> {
    const rows = await this.repo.find({ order: { name: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<Product> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return this.toDto(p);
  }

  async create(input: CreateProductInput): Promise<Product> {
    const entity = this.repo.create({
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      unit: input.unit,
      trackBatches: input.trackBatches,
      ivaRatePercent: String(input.ivaRatePercent ?? 10.5),
      isActive: true,
    });
    return this.toDto(await this.repo.save(entity));
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    Object.assign(p, {
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.trackBatches !== undefined && { trackBatches: input.trackBatches }),
      ...(input.ivaRatePercent !== undefined && { ivaRatePercent: String(input.ivaRatePercent) }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });
    return this.toDto(await this.repo.save(p));
  }

  toDto(e: ProductEntity): Product {
    return {
      id: e.id,
      sku: e.sku,
      name: e.name,
      description: e.description ?? undefined,
      category: e.category,
      unit: e.unit,
      trackBatches: e.trackBatches,
      ivaRatePercent: Number(e.ivaRatePercent),
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  async listPresentations(productId: string): Promise<ProductPresentation[]> {
    await this.get(productId); // 404 si no existe
    const rows = await this.presentationRepo.find({
      where: { productId },
      order: { name: 'ASC' },
    });
    return rows.map((r) => this.toPresentationDto(r));
  }

  async createPresentation(
    productId: string,
    input: CreateProductPresentationInput,
  ): Promise<ProductPresentation> {
    await this.get(productId); // 404 si no existe
    const entity = this.presentationRepo.create({
      productId,
      name: input.name,
      sku: input.sku,
      netWeightG: input.netWeightG != null ? String(input.netWeightG) : null,
      isActive: true,
    });
    return this.toPresentationDto(await this.presentationRepo.save(entity));
  }

  toPresentationDto(e: ProductPresentationEntity): ProductPresentation {
    return {
      id: e.id,
      productId: e.productId,
      name: e.name,
      sku: e.sku,
      netWeightG: e.netWeightG != null ? Number(e.netWeightG) : undefined,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}

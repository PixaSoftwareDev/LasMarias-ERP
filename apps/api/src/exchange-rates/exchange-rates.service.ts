import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import Big from 'big.js';
import type { Currency, ExchangeRate, UpsertExchangeRateInput } from '@lasmarias/shared-schemas';
import { ExchangeRateEntity } from './exchange-rate.entity';

// Fecha local YYYY-MM-DD.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Injectable()
export class ExchangeRatesService {
  constructor(
    @InjectRepository(ExchangeRateEntity)
    private readonly repo: Repository<ExchangeRateEntity>,
  ) {}

  async list(): Promise<ExchangeRate[]> {
    const rows = await this.repo.find({ order: { date: 'DESC' }, take: 120 });
    return rows.map((r) => this.toDto(r));
  }

  async latest(): Promise<ExchangeRate | null> {
    const row = await this.repo.findOne({ where: {}, order: { date: 'DESC' } });
    return row ? this.toDto(row) : null;
  }

  async upsert(input: UpsertExchangeRateInput): Promise<ExchangeRate> {
    const saved = await this.repo.save(
      this.repo.create({ date: input.date, usd: String(input.usd), eur: String(input.eur) }),
    );
    return this.toDto(saved);
  }

  // Cotización vigente para una fecha: la de esa fecha o la última anterior (fallback).
  private async rateRowFor(date: Date): Promise<ExchangeRateEntity | null> {
    return this.repo.findOne({ where: { date: LessThanOrEqual(dayKey(date)) }, order: { date: 'DESC' } });
  }

  // Multiplicador a PESOS para una moneda en una fecha. ARS → 1. USD/EUR → cotización vigente.
  // Si no hay cotización cargada, lanza error claro (no se puede convertir a ciegas).
  async rateToArs(currency: Currency, date: Date): Promise<Big> {
    if (currency === 'ARS') return new Big(1);
    const row = await this.rateRowFor(date);
    if (!row) {
      throw new BadRequestException(
        'No hay cotización cargada. Cargá el valor del dólar/euro en "Cotización del día" antes de usar precios en moneda extranjera.',
      );
    }
    return new Big(currency === 'USD' ? row.usd : row.eur);
  }

  // Convierte un monto en `currency` a pesos usando la cotización vigente a `date`.
  async toArs(amount: number | string, currency: Currency, date: Date): Promise<number> {
    const rate = await this.rateToArs(currency, date);
    return new Big(amount).times(rate).round(2).toNumber();
  }

  private toDto(e: ExchangeRateEntity): ExchangeRate {
    return {
      date: typeof e.date === 'string' ? e.date : dayKey(e.date as unknown as Date),
      usd: Number(e.usd),
      eur: Number(e.eur),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}

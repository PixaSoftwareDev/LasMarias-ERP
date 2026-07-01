import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_IVA_RATE,
  type AppSettings,
  type CompanySettings,
  type QualityLimits,
  type UpdateCompanySettingsInput,
  type UpdateQualityLimitsInput,
} from '@lasmarias/shared-schemas';
import { AppSettingEntity } from './app-setting.entity';
import { DEFAULT_QUALITY_LIMITS } from '../milk-receptions/milk-quality-limits';

const COMPANY_KEY = 'company';
const QUALITY_KEY = 'quality_limits';

// Valores por defecto si todavía no se guardó nada (primera vez).
const DEFAULT_COMPANY: CompanySettings = {
  name: 'Lácteos Las Marías',
  address: undefined,
  city: 'Pergamino, Buenos Aires',
  taxId: undefined,
  phone: undefined,
  ivaRate: DEFAULT_IVA_RATE,
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettingEntity)
    private readonly repo: Repository<AppSettingEntity>,
  ) {}

  private async read<T>(key: string, fallback: T): Promise<T> {
    const row = await this.repo.findOne({ where: { key } });
    if (!row || row.value == null) return fallback;
    // Mezclamos con el fallback para tolerar claves nuevas agregadas con el tiempo.
    return { ...fallback, ...(row.value as object) } as T;
  }

  private async write(key: string, value: unknown): Promise<void> {
    await this.repo.save(this.repo.create({ key, value }));
  }

  getCompany(): Promise<CompanySettings> {
    return this.read<CompanySettings>(COMPANY_KEY, DEFAULT_COMPANY);
  }

  getQualityLimits(): Promise<QualityLimits> {
    return this.read<QualityLimits>(QUALITY_KEY, DEFAULT_QUALITY_LIMITS);
  }

  // Alícuota de IVA (%) configurada para la empresa, con fallback al default.
  async getIvaRate(): Promise<number> {
    const company = await this.getCompany();
    return company.ivaRate ?? DEFAULT_IVA_RATE;
  }

  async getAll(): Promise<AppSettings> {
    const [company, qualityLimits] = await Promise.all([this.getCompany(), this.getQualityLimits()]);
    return { company, qualityLimits };
  }

  async updateCompany(input: UpdateCompanySettingsInput): Promise<CompanySettings> {
    await this.write(COMPANY_KEY, input);
    return this.getCompany();
  }

  async updateQualityLimits(input: UpdateQualityLimitsInput): Promise<QualityLimits> {
    await this.write(QUALITY_KEY, input);
    return this.getQualityLimits();
  }
}

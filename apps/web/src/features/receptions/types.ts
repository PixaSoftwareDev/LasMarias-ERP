export interface ProducerDto {
  id: string;
  name: string;
  taxId?: string;
  phone?: string;
  city?: string;
  agreedPricePerLiter?: number;
  priceCurrency?: 'ARS' | 'USD' | 'EUR';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

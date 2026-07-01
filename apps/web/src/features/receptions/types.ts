export interface ProducerDto {
  id: string;
  name: string;
  taxId?: string;
  phone?: string;
  city?: string;
  agreedPricePerLiter?: number;
  priceCurrency?: 'ARS' | 'USD' | 'EUR';
  priceIvaMode?: 'sin_iva' | 'con_iva';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

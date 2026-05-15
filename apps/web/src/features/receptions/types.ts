export interface ProducerDto {
  id: string;
  name: string;
  taxId?: string;
  phone?: string;
  city?: string;
  agreedPricePerLiter?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

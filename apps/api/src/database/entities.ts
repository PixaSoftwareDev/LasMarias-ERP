// Registro centralizado de entidades. Cuando se agrega una entidad nueva,
// se importa acá y queda disponible para TypeORM y migraciones.

import { UserEntity } from '../users/user.entity';
import { ClientEntity } from '../clients/client.entity';
import { ProductEntity } from '../products/product.entity';
import { BatchEntity } from '../batches/batch.entity';
import { ProducerEntity } from '../producers/producer.entity';
import { MilkReceptionEntity } from '../milk-receptions/milk-reception.entity';

export const entities = [
  UserEntity,
  ClientEntity,
  ProductEntity,
  BatchEntity,
  ProducerEntity,
  MilkReceptionEntity,
];

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnableContainerEntity } from './returnable-container.entity';
import { ReturnableContainerMovementEntity } from './returnable-container-movement.entity';
import { ReturnableContainersService } from './returnable-containers.service';
import { ReturnableContainersController } from './returnable-containers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ReturnableContainerEntity, ReturnableContainerMovementEntity])],
  providers: [ReturnableContainersService],
  controllers: [ReturnableContainersController],
  exports: [ReturnableContainersService],
})
export class ReturnableContainersModule {}

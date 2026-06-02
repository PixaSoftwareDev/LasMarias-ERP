import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingEntity } from './app-setting.entity';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettingEntity])],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService], // lo usa MilkReceptions para los límites de calidad
})
export class SettingsModule {}

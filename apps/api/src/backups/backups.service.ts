import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BackupConfig, BackupRun, BackupsOverview, UpdateBackupConfigInput } from '@lasmarias/shared-schemas';
import { EnvService } from '../config/env.service';
import { AppSettingEntity } from '../settings/app-setting.entity';
import { BackupRunEntity } from './backup-run.entity';
import {
  DEFAULT_BACKUP_CONFIG,
  computeWarnings,
  isDue,
  localDateKey,
  runsToPrune,
} from './backup-schedule';

const CONFIG_KEY = 'backups';
const TICK_MS = 60_000; // chequeo del calendario una vez por minuto
const DUMP_TIMEOUT_MS = 5 * 60_000;

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(BackupRunEntity)
    private readonly runs: Repository<BackupRunEntity>,
    @InjectRepository(AppSettingEntity)
    private readonly settings: Repository<AppSettingEntity>,
    private readonly env: EnvService,
  ) {}

  onModuleInit() {
    if (this.env.nodeEnv === 'test') return; // en tests no hay reloj
    // Primer chequeo al arrancar (ponerse al día si el servidor estuvo apagado a la hora).
    void this.tick().catch((e) => this.logger.error(`Chequeo de copias al arrancar: ${e}`));
    this.timer = setInterval(() => {
      void this.tick().catch((e) => this.logger.error(`Chequeo de copias: ${e}`));
    }, TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------- Configuración ----------

  // La HORA es fija (sale siempre de DEFAULT_BACKUP_CONFIG); de la base se respetan
  // prendido/apagado y los días elegidos. Así una hora guardada antes de este cambio
  // tampoco sigue en pie.
  async getConfig(): Promise<BackupConfig> {
    const row = await this.settings.findOne({ where: { key: CONFIG_KEY } });
    const saved = (row?.value ?? null) as Partial<BackupConfig> | null;
    const days = saved?.days?.length ? saved.days : DEFAULT_BACKUP_CONFIG.days;
    return {
      ...DEFAULT_BACKUP_CONFIG,
      enabled: saved?.enabled ?? DEFAULT_BACKUP_CONFIG.enabled,
      days: [...days].sort((a, b) => a - b),
    };
  }

  // Se prende/apaga y se eligen los días; la hora queda fija en DEFAULT_BACKUP_CONFIG.
  async updateConfig(input: UpdateBackupConfigInput): Promise<BackupConfig> {
    const value: BackupConfig = {
      ...DEFAULT_BACKUP_CONFIG,
      enabled: input.enabled,
      days: [...input.days].sort((a, b) => a - b),
    };
    await this.settings.save(this.settings.create({ key: CONFIG_KEY, value }));
    return this.getConfig();
  }

  // ---------- Calendario ----------

  private async tick(now = new Date()): Promise<void> {
    const config = await this.getConfig();
    const lastAuto = await this.runs.findOne({
      where: { trigger: 'auto' },
      order: { startedAt: 'DESC' },
    });
    const lastKey = lastAuto ? localDateKey(lastAuto.startedAt) : null;
    if (!isDue(config, lastKey, now)) return;
    this.logger.log('Copia de seguridad automática: arrancando…');
    await this.runBackup('auto');
  }

  // ---------- Ejecución ----------

  async runBackup(trigger: 'auto' | 'manual'): Promise<BackupRun> {
    if (this.running) throw new ConflictException('Ya hay una copia en curso. Esperá a que termine.');
    this.running = true;
    try {
      return await this.doRunBackup(trigger);
    } finally {
      this.running = false;
    }
  }

  private async doRunBackup(trigger: 'auto' | 'manual'): Promise<BackupRun> {
    const dir = this.env.backupDir;
    await mkdir(dir, { recursive: true });
    const now = new Date();
    const stamp = `${localDateKey(now).replace(/-/g, '')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const fileName = `lasmarias-${stamp}${trigger === 'manual' ? '-manual' : ''}.dump`;
    const filePath = join(dir, fileName);

    const row = this.runs.create({ status: 'error', trigger, fileName, sizeBytes: null, error: null, fileAvailable: false });
    try {
      await this.execDump(filePath);
      const info = await stat(filePath);
      if (info.size === 0) throw new Error('el archivo quedó vacío');
      row.status = 'ok';
      row.sizeBytes = String(info.size);
      row.fileAvailable = true;
      this.logger.log(`Copia OK: ${fileName} (${info.size} bytes)`);
    } catch (e) {
      row.error = e instanceof Error ? e.message.slice(0, 500) : String(e).slice(0, 500);
      row.fileName = null;
      await unlink(filePath).catch(() => undefined); // borrar el archivo a medias
      this.logger.error(`Copia FALLÓ: ${row.error}`);
    }
    const saved = await this.runs.save(row);
    await this.prune().catch((e) => this.logger.error(`Rotación de copias: ${e}`));
    return this.toDto(saved);
  }

  // Corre pg_dump en formato comprimido (-Fc) mandando el dump por stdout al archivo.
  // Por defecto usa el binario pg_dump con los datos de conexión del .env; se puede
  // reemplazar el comando completo con BACKUP_PG_DUMP (p. ej. "docker exec -i <ctn> pg_dump -U u db").
  private execDump(filePath: string): Promise<void> {
    const custom = this.env.backupPgDump;
    let cmd: string;
    let args: string[];
    let extraEnv: NodeJS.ProcessEnv = {};
    if (custom) {
      const parts = custom.split(' ').filter(Boolean);
      cmd = parts[0] ?? 'pg_dump';
      args = [...parts.slice(1), '-Fc'];
    } else {
      const pg = this.env.postgres;
      cmd = 'pg_dump';
      args = ['-h', pg.host, '-p', String(pg.port), '-U', pg.username, '-Fc', pg.database];
      extraEnv = { PGPASSWORD: pg.password };
    }

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { env: { ...process.env, ...extraEnv } });
      const out = createWriteStream(filePath);
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('pg_dump tardó demasiado (más de 5 minutos)'));
      }, DUMP_TIMEOUT_MS);

      // Sin este handler, un disco lleno o una carpeta sin permisos TIRA ABAJO el
      // proceso entero (el error del stream no pasa por el try/catch de la promesa).
      out.on('error', (e) => {
        clearTimeout(timeout);
        child.kill('SIGKILL');
        reject(new Error(`no se pudo escribir el archivo de la copia: ${e.message}`));
      });

      child.stdout.pipe(out);
      child.stderr.on('data', (d: Buffer) => {
        stderr = (stderr + d.toString()).slice(-1000);
      });
      child.on('error', (e) => {
        clearTimeout(timeout);
        reject(new Error(`no se pudo ejecutar ${cmd}: ${e.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        out.end(() => {
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `pg_dump terminó con código ${code}`));
        });
      });
    });
  }

  // Rotación: el servidor guarda solo la última semana (ver runsToPrune); el historial
  // completo vive en la PC donde se guardan las copias.
  private async prune(now = new Date()): Promise<void> {
    const all = await this.runs.find({ order: { startedAt: 'DESC' } });
    for (const old of runsToPrune(all, now)) {
      if (old.fileName) await unlink(join(this.env.backupDir, old.fileName)).catch(() => undefined);
      old.fileAvailable = false;
      await this.runs.save(old);
    }
  }

  // ---------- Lectura ----------

  async overview(now = new Date()): Promise<BackupsOverview> {
    const [config, rows] = await Promise.all([
      this.getConfig(),
      this.runs.find({ order: { startedAt: 'DESC' }, take: 60 }),
    ]);
    return {
      config,
      runs: rows.map((r) => this.toDto(r)),
      warnings: computeWarnings(config, rows, now),
    };
  }

  async getFile(id: string): Promise<{ path: string; fileName: string }> {
    const run = await this.runs.findOne({ where: { id } });
    if (!run || run.status !== 'ok' || !run.fileName) throw new NotFoundException('Esa copia no existe.');
    if (!run.fileAvailable) throw new NotFoundException('El archivo de esa copia ya se borró por rotación.');
    const path = join(this.env.backupDir, run.fileName);
    await stat(path).catch(() => {
      throw new NotFoundException('No se encontró el archivo de esa copia en el servidor.');
    });
    return { path, fileName: run.fileName };
  }

  private toDto(r: BackupRunEntity): BackupRun {
    return {
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      status: r.status,
      trigger: r.trigger,
      fileName: r.fileName,
      sizeBytes: r.sizeBytes == null ? null : Number(r.sizeBytes),
      error: r.error,
      fileAvailable: r.fileAvailable,
    };
  }
}

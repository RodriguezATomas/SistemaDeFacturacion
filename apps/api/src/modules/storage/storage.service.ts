import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join, normalize, resolve } from 'path';
import { AppConfigService } from '../../config/app-config.service';

/** Abstracción de almacenamiento de archivos: S3 compatible (SaaS / MinIO) o disco local (instalación privada). */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  exists(key: string): Promise<boolean>;
}

class S3Driver implements StorageDriver {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    opts: { endpoint?: string; region: string; accessKey: string; secretKey: string; forcePathStyle: boolean },
  ) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: opts.forcePathStyle,
      credentials: { accessKeyId: opts.accessKey, secretAccessKey: opts.secretKey },
    });
  }

  /** Crea el bucket si no existe (idempotente). */
  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

class LocalDriver implements StorageDriver {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(key: string): string {
    const full = resolve(join(this.root, normalize(key)));
    if (!full.startsWith(this.root)) throw new Error('Clave de almacenamiento inválida');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.writeFile(path, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.pathFor(key));
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

@Injectable()
export class StorageService implements StorageDriver, OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;

  async onModuleInit(): Promise<void> {
    if (this.driver instanceof S3Driver) {
      try {
        await this.driver.ensureBucket();
      } catch (err) {
        // No impide arrancar: las operaciones de archivo fallarán y quedarán registradas.
        this.logger.error('No se pudo verificar/crear el bucket S3', err as Error);
      }
    }
  }

  constructor(config: AppConfigService) {
    const env = config.env;
    if (env.STORAGE_DRIVER === 's3') {
      this.driver = new S3Driver(env.S3_BUCKET, {
        endpoint: env.S3_ENDPOINT,
        region: env.S3_REGION,
        accessKey: env.S3_ACCESS_KEY!,
        secretKey: env.S3_SECRET_KEY!,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
      });
    } else {
      this.driver = new LocalDriver(env.STORAGE_LOCAL_PATH);
    }
    this.logger.log(`Almacenamiento de archivos: ${env.STORAGE_DRIVER}`);
  }

  put(key: string, body: Buffer, contentType: string) {
    return this.driver.put(key, body, contentType);
  }

  get(key: string) {
    return this.driver.get(key);
  }

  exists(key: string) {
    return this.driver.exists(key);
  }
}

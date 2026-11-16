import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { AppConfigService } from '../../config/app-config.service';
import { InvoiceEmissionService } from './invoice-emission.service';

/** Concilia periódicamente con ARCA los comprobantes con resultado incierto. */
@Injectable()
export class ReconciliationScheduler {
  private readonly logger = new Logger(ReconciliationScheduler.name);
  private running = false;

  constructor(
    private readonly emission: InvoiceEmissionService,
    private readonly config: AppConfigService,
  ) {}

  @Interval(5 * 60 * 1000)
  async run(): Promise<void> {
    if (this.config.env.NODE_ENV === 'test' || this.running) return;
    this.running = true;
    try {
      const resolved = await this.emission.reconcilePending();
      if (resolved) this.logger.log(`Conciliación automática: ${resolved} comprobantes resueltos`);
    } catch (err) {
      this.logger.error('Error en conciliación automática', err as Error);
    } finally {
      this.running = false;
    }
  }
}

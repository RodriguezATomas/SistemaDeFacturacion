import { Injectable, Logger } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';
import { AppConfigService } from '../../config/app-config.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Envío de emails por SMTP. En desarrollo se usa Mailpit (docker compose).
 * Sin SMTP configurado (solo fuera de producción) el mensaje se escribe en el log.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;

  constructor(private readonly config: AppConfigService) {
    const env = config.env;
    if (env.SMTP_HOST) {
      this.transporter = createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
      });
    }
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP no configurado. Email para ${message.to} — "${message.subject}":\n${message.text}`,
      );
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.config.env.MAIL_FROM, ...message });
    } catch (err) {
      // El fallo de envío no debe revelar al cliente si el email existe; se registra para soporte.
      this.logger.error(`Error enviando email a ${message.to}`, err as Error);
    }
  }

  link(path: string): string {
    return new URL(path, this.config.env.APP_URL).toString();
  }
}

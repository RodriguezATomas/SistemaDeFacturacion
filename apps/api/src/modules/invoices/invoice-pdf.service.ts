import { Injectable, NotFoundException } from '@nestjs/common';
import { Company, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { formatCuit } from '../../common/utils/cuit';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { buildQrUrl } from '../fiscal/arca-qr';
import {
  DOCUMENT_TYPE_TO_ARCA,
  TAX_CONDITION_LABEL,
  VAT_CONDITION_LABEL,
  VOUCHER_TYPES,
} from '../fiscal/fiscal.constants';
import { invoiceDetailInclude } from './invoices.service';

type InvoiceWithDetail = Prisma.InvoiceGetPayload<{ include: typeof invoiceDetailInclude }>;

const money = (v: Prisma.Decimal | Decimal | string | number) =>
  new Decimal(v.toString()).toNumber().toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateAr = (d: Date | null | undefined) =>
  d ? `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` : '-';
const pad = (n: number | null, len: number) => (n === null ? '-'.repeat(len) : String(n).padStart(len, '0'));

const DOC_LABEL: Record<string, string> = {
  CUIT: 'CUIT',
  CUIL: 'CUIL',
  DNI: 'DNI',
  CDI: 'CDI',
  PASAPORTE: 'Pasaporte',
  SIN_IDENTIFICAR: 'Sin identificar',
};

/**
 * PDF del comprobante (PDFKit). Solo los comprobantes con CAE muestran QR y datos de autorización.
 * Cualquier otro estado se imprime con la leyenda "SIN VALIDEZ FISCAL": un PDF no equivale a un
 * comprobante autorizado.
 */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  storageKey(companyId: string, invoiceId: string) {
    return `companies/${companyId}/invoices/${invoiceId}.pdf`;
  }

  /** Devuelve el PDF: el almacenado si el comprobante está autorizado; si no, uno generado al vuelo. */
  async getPdf(companyId: string, invoiceId: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.load(companyId, invoiceId);
    const filename = this.filename(invoice);
    if (invoice.status === 'AUTHORIZED') {
      const key = invoice.pdfStorageKey ?? this.storageKey(companyId, invoiceId);
      const stored = await this.storage.get(key);
      if (stored) return { buffer: stored, filename };
      return { buffer: await this.generateAndStore(companyId, invoiceId), filename };
    }
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    return { buffer: await this.render(invoice, company), filename };
  }

  async generateAndStore(companyId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.load(companyId, invoiceId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const buffer = await this.render(invoice, company);
    if (invoice.status === 'AUTHORIZED') {
      const key = this.storageKey(companyId, invoiceId);
      await this.storage.put(key, buffer, 'application/pdf');
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { pdfStorageKey: key } });
    }
    return buffer;
  }

  private async load(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: invoiceDetailInclude,
    });
    if (!invoice) throw new NotFoundException('Comprobante no encontrado');
    return invoice;
  }

  private filename(inv: InvoiceWithDetail) {
    const type = VOUCHER_TYPES[inv.voucherType].name.replace(/\s+/g, '_');
    return inv.number
      ? `${type}_${pad(inv.pointOfSale.number, 5)}-${pad(inv.number, 8)}.pdf`
      : `${type}_borrador_${inv.id.slice(0, 8)}.pdf`;
  }

  async render(inv: InvoiceWithDetail, company: Company): Promise<Buffer> {
    const info = VOUCHER_TYPES[inv.voucherType];
    const authorized = inv.status === 'AUTHORIZED' && Boolean(inv.cae);
    const settings = await this.prisma.companySettings.findUnique({ where: { companyId: company.id } });
    const qrPng =
      authorized && inv.number
        ? await QRCode.toBuffer(
            buildQrUrl({
              issueDate: inv.issueDate.toISOString().slice(0, 10),
              cuit: company.cuit,
              pointOfSale: inv.pointOfSale.number,
              voucherType: inv.voucherType,
              number: inv.number,
              total: inv.total.toString(),
              currency: inv.currency,
              exchangeRate: inv.exchangeRate.toString(),
              receiverDocType: DOCUMENT_TYPE_TO_ARCA[inv.receiverDocumentType],
              receiverDocNumber: inv.receiverDocumentNumber,
              cae: inv.cae!,
            }),
            { margin: 1, width: 220 },
          )
        : null;

    const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: { Title: this.filename(inv), Author: company.legalName } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const L = 36;
    const R = 559;
    const W = R - L;
    const mid = L + W / 2;

    // Encabezado
    doc.rect(L, 36, W, 22).stroke();
    doc.font('Helvetica-Bold').fontSize(12).text('ORIGINAL', L, 42, { width: W, align: 'center' });
    doc.rect(L, 58, W, 120).stroke();
    doc.moveTo(mid, 98).lineTo(mid, 178).stroke();
    doc.rect(mid - 25, 58, 50, 40).fillAndStroke('#ffffff', '#000000');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(26).text(info.letter, mid - 25, 62, { width: 50, align: 'center' });
    doc.fontSize(7).text(`COD. ${pad(inv.voucherType, 2)}`, mid - 25, 88, { width: 50, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(14).text(company.tradeName || company.legalName, L + 8, 68, { width: W / 2 - 40 });
    doc.font('Helvetica').fontSize(8);
    let y = 104;
    const leftLine = (label: string, value: string) => {
      doc.font('Helvetica-Bold').text(`${label}: `, L + 8, y, { continued: true }).font('Helvetica').text(value, { width: W / 2 - 16 });
      y = doc.y + 2;
    };
    leftLine('Razón Social', company.legalName);
    leftLine('Domicilio Comercial', inv.pointOfSale.address || [company.address, company.city, company.province].filter(Boolean).join(', ') || '-');
    leftLine('Condición frente al IVA', TAX_CONDITION_LABEL[company.taxCondition]);

    doc.font('Helvetica-Bold').fontSize(16).text(info.name.replace(/ [ABC]$/, '').toUpperCase(), mid + 30, 66, { width: W / 2 - 38 });
    y = 104;
    const rightLine = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(8).text(`${label}: `, mid + 8, y, { continued: true }).font('Helvetica').text(value);
      y = doc.y + 2;
    };
    rightLine('Punto de Venta', pad(inv.pointOfSale.number, 5));
    rightLine('Comp. Nro', pad(inv.number, 8));
    rightLine('Fecha de Emisión', dateAr(inv.issueDate));
    rightLine('CUIT', formatCuit(company.cuit));
    rightLine('Ingresos Brutos', company.grossIncomeNumber || '-');
    rightLine('Inicio de Actividades', dateAr(company.activityStartDate));

    // Período de servicios
    y = 184;
    if (inv.concept !== 'PRODUCTS') {
      doc.rect(L, y, W, 20).stroke();
      doc.font('Helvetica-Bold').fontSize(8).text('Período Facturado Desde: ', L + 8, y + 6, { continued: true })
        .font('Helvetica').text(`${dateAr(inv.serviceFrom)}     `, { continued: true })
        .font('Helvetica-Bold').text('Hasta: ', { continued: true })
        .font('Helvetica').text(`${dateAr(inv.serviceTo)}     `, { continued: true })
        .font('Helvetica-Bold').text('Fecha de Vto. para el pago: ', { continued: true })
        .font('Helvetica').text(dateAr(inv.paymentDueDate));
      y += 26;
    }

    // Receptor
    doc.rect(L, y, W, 46).stroke();
    const ry = y + 6;
    const docLabel = DOC_LABEL[inv.receiverDocumentType];
    doc.font('Helvetica-Bold').fontSize(8).text(`${docLabel}: `, L + 8, ry, { continued: true })
      .font('Helvetica').text(inv.receiverDocumentType === 'CUIT' || inv.receiverDocumentType === 'CUIL' ? formatCuit(inv.receiverDocumentNumber) : inv.receiverDocumentNumber);
    doc.font('Helvetica-Bold').text('Apellido y Nombre / Razón Social: ', mid - 60, ry, { continued: true }).font('Helvetica').text(inv.receiverName, { width: 260 });
    doc.font('Helvetica-Bold').text('Condición frente al IVA: ', L + 8, ry + 14, { continued: true }).font('Helvetica').text(VAT_CONDITION_LABEL[inv.receiverVatCondition]);
    doc.font('Helvetica-Bold').text('Domicilio: ', mid - 60, ry + 14, { continued: true }).font('Helvetica').text(inv.receiverAddress || '-', { width: 260 });
    if (inv.associatedInvoice) {
      const a = inv.associatedInvoice;
      doc.font('Helvetica-Bold').text('Comprobante asociado: ', L + 8, ry + 28, { continued: true })
        .font('Helvetica').text(`${VOUCHER_TYPES[a.voucherType].name} ${pad(a.pointOfSale.number, 5)}-${pad(a.number, 8)} del ${dateAr(a.issueDate)}`);
    }
    y += 54;

    // Ítems
    const showVat = info.letter === 'A';
    const includeVatInPrice = info.letter === 'B';
    const cols = showVat
      ? [
          { t: 'Producto / Servicio', w: 175, a: 'left' as const },
          { t: 'Cantidad', w: 50, a: 'right' as const },
          { t: 'U. Medida', w: 45, a: 'left' as const },
          { t: 'Precio Unit.', w: 60, a: 'right' as const },
          { t: '% Bonif', w: 35, a: 'right' as const },
          { t: 'Subtotal', w: 60, a: 'right' as const },
          { t: 'IVA', w: 35, a: 'right' as const },
          { t: 'Subtotal c/IVA', w: 63, a: 'right' as const },
        ]
      : [
          { t: 'Producto / Servicio', w: 235, a: 'left' as const },
          { t: 'Cantidad', w: 55, a: 'right' as const },
          { t: 'U. Medida', w: 50, a: 'left' as const },
          { t: 'Precio Unit.', w: 70, a: 'right' as const },
          { t: '% Bonif', w: 40, a: 'right' as const },
          { t: 'Subtotal', w: 73, a: 'right' as const },
        ];
    const drawRow = (values: string[], bold = false, fill = false) => {
      const h = 16;
      if (fill) doc.rect(L, y, W, h).fill('#e5e7eb').fillColor('#000000');
      let x = L + 4;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5);
      values.forEach((v, i) => {
        doc.text(v, x, y + 4, { width: cols[i].w - 6, align: cols[i].a, lineBreak: false, ellipsis: true });
        x += cols[i].w;
      });
      y += h;
    };
    drawRow(cols.map((c) => c.t), true, true);
    for (const item of inv.items) {
      if (y > 640) {
        doc.addPage();
        y = 40;
        drawRow(cols.map((c) => c.t), true, true);
      }
      const unit = includeVatInPrice
        ? new Decimal(item.unitPrice.toString()).mul(new Decimal(1).plus(new Decimal(item.vatRate.toString()).div(100)))
        : new Decimal(item.unitPrice.toString());
      const subtotal = includeVatInPrice ? item.totalAmount : item.netAmount;
      const base = [
        item.description,
        new Decimal(item.quantity.toString()).toString(),
        item.product?.unit ?? 'unidad',
        money(unit),
        new Decimal(item.discountPercent.toString()).toFixed(2),
        money(subtotal),
      ];
      drawRow(
        showVat
          ? [...base, item.vatTreatment === 'GRAVADO' ? `${new Decimal(item.vatRate.toString()).toString()}%` : item.vatTreatment === 'EXENTO' ? 'Exento' : 'No grav.', money(item.totalAmount)]
          : base,
      );
    }
    doc.moveTo(L, y).lineTo(R, y).stroke();

    // Totales
    y = Math.max(y + 10, 560);
    if (y > 700) {
      doc.addPage();
      y = 40;
    }
    const totalsX = R - 230;
    const totalLine = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 8.5);
      doc.text(`${label}: ${inv.currency === 'PES' ? '$' : inv.currency}`, totalsX, y, { width: 140, align: 'right' });
      doc.text(value, totalsX + 145, y, { width: 85, align: 'right' });
      y += bold ? 16 : 13;
    };
    doc.rect(L, y - 6, W, 0.5).fill('#000000');
    if (showVat) {
      totalLine('Importe Neto Gravado', money(inv.netTaxed));
      if (!inv.netUntaxed.isZero()) totalLine('Importe No Gravado', money(inv.netUntaxed));
      if (!inv.exemptAmount.isZero()) totalLine('Importe Exento', money(inv.exemptAmount));
      for (const v of inv.vatBreakdown) totalLine(`IVA ${new Decimal(v.rate.toString()).toString()}%`, money(v.vatAmount));
    } else {
      totalLine('Subtotal', money(new Decimal(inv.total.toString()).minus(inv.otherTaxesAmount.toString())));
    }
    totalLine('Importe Otros Tributos', money(inv.otherTaxesAmount));
    totalLine('Importe Total', money(inv.total), true);
    if (inv.currency !== 'PES') {
      doc.font('Helvetica').fontSize(8).text(`Cotización: ${inv.exchangeRate.toString()}`, totalsX, y, { width: 230, align: 'right' });
      y += 12;
    }
    if (includeVatInPrice && !inv.vatAmount.isZero()) {
      doc.font('Helvetica').fontSize(7.5).text(
        `Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) — IVA contenido: $ ${money(inv.vatAmount)}`,
        L + 4,
        y,
        { width: W - 8 },
      );
      y = doc.y + 4;
    }
    if (inv.notes) {
      doc.font('Helvetica-Oblique').fontSize(8).text(inv.notes, L + 4, y + 4, { width: W - 240 });
      y = doc.y + 4;
    }

    // Pie: autorización ARCA
    const footerY = Math.max(y + 12, 700);
    if (authorized && qrPng) {
      doc.image(qrPng, L, footerY, { width: 90 });
      doc.font('Helvetica-Bold').fontSize(11).text('Comprobante Autorizado', L + 100, footerY + 10);
      doc.font('Helvetica').fontSize(7.5).text('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación', L + 100, footerY + 26, { width: 230 });
      doc.font('Helvetica-Bold').fontSize(9).text(`CAE N°: ${inv.cae}`, R - 200, footerY + 10, { width: 200, align: 'right' });
      doc.text(`Fecha de Vto. de CAE: ${dateAr(inv.caeDueDate)}`, R - 200, footerY + 24, { width: 200, align: 'right' });
      if (inv.arcaEnvironment === 'HOMOLOGATION') {
        doc.fillColor('#b91c1c').font('Helvetica-Bold').fontSize(8)
          .text('EMITIDO EN AMBIENTE DE HOMOLOGACIÓN (PRUEBAS) — SIN VALIDEZ FISCAL', L + 100, footerY + 58, { width: W - 100 });
        doc.fillColor('#000000');
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#b91c1c')
        .text('DOCUMENTO NO VÁLIDO COMO COMPROBANTE FISCAL — sin autorización (CAE) de ARCA', L, footerY + 10, { width: W, align: 'center' });
      doc.fillColor('#000000');
    }
    if (settings?.invoiceFooter) {
      doc.font('Helvetica').fontSize(7).fillColor('#374151').text(settings.invoiceFooter, L, 800, { width: W, align: 'center' });
      doc.fillColor('#000000');
    }

    if (!authorized) {
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.save();
        doc.rotate(-35, { origin: [300, 420] });
        doc.font('Helvetica-Bold').fontSize(48).fillColor('#dc2626').opacity(0.15)
          .text('BORRADOR — SIN VALIDEZ FISCAL', 0, 400, { width: 600, align: 'center' });
        doc.restore();
      }
    }
    doc.end();
    return done;
  }
}

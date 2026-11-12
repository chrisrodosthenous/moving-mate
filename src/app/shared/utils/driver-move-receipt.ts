import type { TransportOrder } from '../../core/services/orders.service';
import { orderVehicleTypeDisplayLabel } from './order-cargo-scoring.util';
import {
  driverNetEarningsForOrder,
  platformCommissionForOrder,
} from './order-commission.util';
import { orderShortId, orderSubmissionDateIso } from './order-utils';

export interface DriverReceiptFigures {
  movePrice: number;
  platformCommission: number;
  driverEarnings: number;
  cancelled: boolean;
}

function money(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `EUR ${value.toFixed(2)}`;
}

function customerName(order: TransportOrder): string {
  const customer = order.customerId;
  if (!customer || typeof customer !== 'object') return '-';
  const parts = [customer.firstName, customer.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return customer.name?.trim() || '-';
}

function statusLabel(status: string | undefined): string {
  if (status === 'delivered' || status === 'completed') return 'Delivered';
  if (status === 'cancelled' || status === 'canceled') return 'Cancelled';
  return status || '-';
}

/** Price lines for the driver receipt. Cancelled moves with no stored payout show zero earnings. */
export function driverReceiptFigures(order: TransportOrder): DriverReceiptFigures {
  const cancelled = statusLabel(order.status) === 'Cancelled';
  const stored = Number(order.driverEarnings) > 0 || Number(order.platformCommission) > 0;
  if (cancelled && !stored) {
    return {
      movePrice: Number(order.price) || 0,
      platformCommission: 0,
      driverEarnings: 0,
      cancelled: true,
    };
  }
  return {
    movePrice: Number(order.price) || 0,
    platformCommission: platformCommissionForOrder(order),
    driverEarnings: driverNetEarningsForOrder(order),
    cancelled,
  };
}

/** Open a tab during the click, then point it at the PDF so the browser shows it instead of downloading. */
function reserveReceiptTab(): Window | null {
  if (typeof window === 'undefined') return null;
  return window.open('', '_blank');
}

function showReceiptPdf(doc: { output: (type: 'blob') => Blob }, preview: Window | null): void {
  const url = URL.createObjectURL(doc.output('blob'));
  if (preview && !preview.closed) {
    preview.location.replace(url);
    return;
  }
  window.open(url, '_blank');
}

function submittedLabel(order: TransportOrder): string {
  const iso = orderSubmissionDateIso(order);
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Open a PDF receipt of the move price and the driver's earnings in the browser. */
export async function downloadDriverMoveReceipt(order: TransportOrder): Promise<void> {
  const preview = reserveReceiptTab();
  const { jsPDF } = await import('jspdf');
  const figures = driverReceiptFigures(order);
  const shortId = orderShortId(order._id);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(16, 36, 28);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(33, 196, 93);
  doc.rect(0, 32, pageWidth, 2.2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Moving Mate', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Driver receipt', 14, 23);

  doc.setTextColor(16, 36, 28);
  let y = 46;
  const labelX = 14;
  const valueX = 52;
  const valueWidth = pageWidth - valueX - 14;

  const row = (label: string, value: string): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(90, 98, 104);
    doc.text(label, labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 36, 28);
    const lines = doc.splitTextToSize(value || '-', valueWidth);
    doc.text(lines, valueX, y);
    y += Math.max(7, lines.length * 5 + 2);
  };

  row('Move', `#${shortId}`);
  row('Status', statusLabel(order.status));
  row('Submitted', submittedLabel(order));
  row('Customer', customerName(order));
  row('From', order.pickupLocation?.address || '-');
  row('To', order.dropoffLocation?.address || '-');
  if (order.distanceKm != null && Number.isFinite(Number(order.distanceKm))) {
    row('Distance', `${Number(order.distanceKm).toFixed(1)} km`);
  }
  row('Vehicle', orderVehicleTypeDisplayLabel(order.vehicleType));

  y += 4;
  doc.setDrawColor(33, 196, 93);
  doc.setLineWidth(0.4);
  doc.line(14, y, pageWidth - 14, y);
  y += 10;

  const amountRow = (label: string, value: string, emphasize = false): void => {
    doc.setFont('helvetica', emphasize ? 'bold' : 'normal');
    doc.setFontSize(emphasize ? 13 : 11);
    if (emphasize) doc.setTextColor(22, 120, 58);
    else doc.setTextColor(16, 36, 28);
    doc.text(label, labelX, y);
    doc.text(value, pageWidth - 14, y, { align: 'right' });
    y += emphasize ? 10 : 8;
  };

  amountRow('Move price', money(figures.movePrice));
  amountRow('Platform commission', money(figures.platformCommission));
  y += 2;
  amountRow('You earned', money(figures.driverEarnings), true);

  if (figures.cancelled && figures.driverEarnings <= 0) {
    y += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90, 98, 104);
    doc.text('No payout. This move was cancelled.', labelX, y);
  }

  doc.setFontSize(8);
  doc.setTextColor(120, 128, 134);
  doc.text('Moving Mate - Driver copy', 14, 287);

  showReceiptPdf(doc, preview);
}

function driverName(order: TransportOrder): string {
  const named = order.assignedDriverName?.trim();
  if (named) return named;
  const driver = order.driverId;
  if (driver && typeof driver === 'object') {
    const parts = [driver.firstName, driver.lastName].filter(Boolean);
    if (parts.length) return parts.join(' ');
    if (driver.name?.trim()) return driver.name.trim();
  }
  return '-';
}

function paymentLabel(status: string | undefined): string {
  switch (status) {
    case 'authorized':
      return 'Payment authorized';
    case 'captured':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    default:
      return 'Payment required';
  }
}

export interface CustomerReceiptFigures {
  movePrice: number;
  amountPaid: number;
  paymentStatus: string;
  refunded: boolean;
}

/** What the customer paid. Refunded and unpaid moves show a zero amount paid. */
export function customerReceiptFigures(order: TransportOrder): CustomerReceiptFigures {
  const paymentStatus = order.paymentStatus;
  const movePrice = Number(order.price) || 0;
  const paid = paymentStatus === 'captured' || paymentStatus === 'authorized';
  return {
    movePrice,
    amountPaid: paid ? movePrice : 0,
    paymentStatus: paymentLabel(paymentStatus),
    refunded: paymentStatus === 'refunded',
  };
}

/** Open a PDF receipt of the move price the customer paid in the browser. */
export async function downloadCustomerMoveReceipt(order: TransportOrder): Promise<void> {
  const preview = reserveReceiptTab();
  const { jsPDF } = await import('jspdf');
  const figures = customerReceiptFigures(order);
  const shortId = orderShortId(order._id);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(16, 36, 28);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(33, 196, 93);
  doc.rect(0, 32, pageWidth, 2.2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Moving Mate', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Customer receipt', 14, 23);

  doc.setTextColor(16, 36, 28);
  let y = 46;
  const labelX = 14;
  const valueX = 52;
  const valueWidth = pageWidth - valueX - 14;

  const row = (label: string, value: string): void => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(90, 98, 104);
    doc.text(label, labelX, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(16, 36, 28);
    const lines = doc.splitTextToSize(value || '-', valueWidth);
    doc.text(lines, valueX, y);
    y += Math.max(7, lines.length * 5 + 2);
  };

  row('Move', `#${shortId}`);
  row('Status', statusLabel(order.status));
  row('Submitted', submittedLabel(order));
  row('Driver', driverName(order));
  row('From', order.pickupLocation?.address || '-');
  row('To', order.dropoffLocation?.address || '-');
  if (order.distanceKm != null && Number.isFinite(Number(order.distanceKm))) {
    row('Distance', `${Number(order.distanceKm).toFixed(1)} km`);
  }
  row('Vehicle', orderVehicleTypeDisplayLabel(order.vehicleType));
  row('Payment', figures.paymentStatus);

  y += 4;
  doc.setDrawColor(33, 196, 93);
  doc.setLineWidth(0.4);
  doc.line(14, y, pageWidth - 14, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(16, 36, 28);
  doc.text('Move price', labelX, y);
  doc.text(money(figures.movePrice), pageWidth - 14, y, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(22, 120, 58);
  doc.text('You paid', labelX, y);
  doc.text(money(figures.amountPaid), pageWidth - 14, y, { align: 'right' });

  if (figures.refunded) {
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90, 98, 104);
    doc.text('This payment was refunded.', labelX, y);
  } else if (figures.amountPaid <= 0) {
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(90, 98, 104);
    doc.text('This move was not charged.', labelX, y);
  }

  doc.setFontSize(8);
  doc.setTextColor(120, 128, 134);
  doc.text('Moving Mate - Customer copy', 14, 287);

  showReceiptPdf(doc, preview);
}

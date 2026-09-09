import { createContext, useContext } from 'react';
import type { ReceiptOutput } from './ReceiptCapture';
import type { OrderResponse } from '../../lib/types';

/** How one print differs from another. */
export interface PrintOptions {
  /** Fired by the app rather than by a tap — a ticket arriving, a receipt on completion.
   *  These go to the printing app's own retry queue and stay quiet when they succeed. */
  auto?: boolean;
  /** Print on this device or not at all. The setup guide's test print is testing THIS
   *  tablet, and the print station's own jobs have already been delegated once — neither
   *  may be handed onward, or the first would enqueue a fake order and the second would
   *  loop. Everything else is free to fall through to the station. */
  local?: boolean;
  /** Called once with whether the printing app took the job. Drives the queue's ack: an
   *  unacknowledged job stays pending and is collected again on the next poll. */
  onResult?: (ok: boolean) => void;
}

/* Lets any button anywhere under the Shell (KDS board, order history, …) trigger a receipt
 * print — or a PDF save of the same invoice — without prop-drilling through every
 * intermediate component. Shell owns the actual state (ReceiptCapture.tsx) and provides the
 * trigger function down via this context — kept in its own file since DashboardApp.tsx and
 * OrdersPage.tsx already import each other.
 *
 * Shell's implementation also decides WHERE a print happens: a device with no printing app
 * of its own hands the job to the branch's print station rather than doing nothing, so every
 * call site below gets that for free. */
const Ctx = createContext<(order: OrderResponse, output?: ReceiptOutput, opts?: PrintOptions) => void>(() => {});

export const ReceiptPrinterProvider = Ctx.Provider;
export const useReceiptPrinter = () => useContext(Ctx);

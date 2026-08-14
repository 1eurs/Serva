import { createContext, useContext } from 'react';
import type { ReceiptOutput } from './ReceiptCapture';
import type { OrderResponse } from '../../lib/types';

/* Lets any button anywhere under the Shell (KDS board, order history, …) trigger a RawBT
 * receipt print — or a PDF save of the same invoice — without prop-drilling through every
 * intermediate component. Shell owns the actual state (ReceiptCapture.tsx) and provides the
 * trigger function down via this context — kept in its own file since DashboardApp.tsx and
 * OrdersPage.tsx already import each other. */
const Ctx = createContext<(order: OrderResponse, output?: ReceiptOutput) => void>(() => {});

export const ReceiptPrinterProvider = Ctx.Provider;
export const useReceiptPrinter = () => useContext(Ctx);

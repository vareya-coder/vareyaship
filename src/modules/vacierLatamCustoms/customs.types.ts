import type { Order } from '@/modules/shiphero/types';

export type VacierLatamOrderStatus = 'processed' | 'skipped' | 'error' | 'dry_run';

export interface VacierLatamConfig {
  enabled: boolean;
  dryRun: boolean;
  countries: string[];
  referenceValueEur: number;
  processedTag: string;
  processingStartDate: string;
  orderNumberFilter: string[];
  fulfillmentStatuses: string[];
  customerAccountId: string;
  runWindowTimezone: string;
  runWindowStart: string;
  runWindowEnd: string;
  maxPagesPerRun: number;
  maxOrdersPerRun: number;
  maxShipHeroCreditsPerRun: number;
}

export interface VacierLatamResolvedLineOverride {
  customsValue: number;
  customsValueFormatted: string;
  currency?: string;
  countryCode?: string;
  source?: string | null;
}

export interface VacierLatamProcessingDependencies {
  resolveOverride?: (sku: string, destinationCountry: string) => Promise<VacierLatamResolvedLineOverride>;
  updateLineItemsCustomsValue?: (
    orderId: string,
    updates: Array<{ id: string; customs_value: string }>,
    context?: { batchId?: string; orderNumber?: string },
  ) => Promise<{ success: boolean; complexity: number }>;
  addOrderTag?: (
    orderId: string,
    tag: string,
    context?: { batchId?: string; orderNumber?: string },
  ) => Promise<{ success: boolean; complexity: number }>;
}

export interface VacierLatamProcessingContext extends VacierLatamProcessingDependencies {
  batchId: string;
  config: VacierLatamConfig;
}

export interface VacierLatamOrderResult {
  orderId: string;
  orderNumber: string;
  orderDate?: string | null;
  destinationCountry?: string | null;
  status: VacierLatamOrderStatus;
  reason?: string;
  creditsUsed: number;
  copiedCustomsTotal?: string;
  aboveReferenceValue?: boolean;
  lineItemCount?: number;
  error?: Error;
}

export interface VacierLatamBatchResult {
  batchId: string;
  startedAt: Date;
  completedAt?: Date;
  ordersQueried: number;
  ordersProcessed: number;
  ordersSkipped: number;
  errorsCount: number;
  errorDetails: Array<{ orderId: string; orderNumber: string; error: string }>;
  creditsUsed: number;
  dryRun: boolean;
  status: 'running' | 'completed' | 'failed';
}

export type VacierLatamOrder = Order;

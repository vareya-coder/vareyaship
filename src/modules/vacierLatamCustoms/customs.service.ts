import { getFlags } from '@/modules/featureFlags/featureFlag.service';
import { fetchAllOrders, hasTag } from '@/modules/shiphero/orders';
import { addOrderTag, updateLineItemsCustomsValue } from '@/modules/shiphero/mutations';
import { getQuotaManager, resetQuotaManager } from '@/modules/shiphero/quota';
import { logger } from '@/utils/logger';
import { resolveLatamOverrideForSku } from './overrides.service';
import type {
  VacierLatamBatchResult,
  VacierLatamConfig,
  VacierLatamOrder,
  VacierLatamOrderResult,
  VacierLatamProcessingContext,
  VacierLatamProcessingDependencies,
} from './customs.types';

const ESTIMATED_ORDER_COST = 50;
const STALE_RUN_MINUTES = 30;

function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function getVacierLatamConfig(): VacierLatamConfig {
  const flags = getFlags();
  return {
    enabled: flags.vacier_latam_customs_enabled,
    dryRun: flags.vacier_latam_dry_run,
    countries: flags.vacier_latam_countries.map((country) => country.toUpperCase()),
    referenceValueEur: flags.vacier_latam_reference_value_eur,
    processedTag: flags.vacier_latam_processed_tag,
    processingStartDate: flags.vacier_latam_processing_start_date,
    orderNumberFilter: flags.vacier_latam_order_number_filter,
    fulfillmentStatuses: flags.vacier_latam_fulfillment_statuses,
    customerAccountId: process.env.VACIER_CUSTOMER_ACCOUNT_ID ?? '',
  };
}

export function validateVacierLatamConfig(config: VacierLatamConfig): string[] {
  const errors: string[] = [];
  if (!config.customerAccountId) errors.push('VACIER_CUSTOMER_ACCOUNT_ID is required');
  if (!config.processingStartDate || Number.isNaN(new Date(config.processingStartDate).getTime())) {
    errors.push('VACIER_LATAM_PROCESSING_START_DATE must be a valid ISO date');
  }
  if (config.countries.length === 0) errors.push('VACIER_LATAM_COUNTRIES must include at least one country');
  if (config.fulfillmentStatuses.length === 0) errors.push('VACIER_LATAM_FULFILLMENT_STATUSES must include at least one status');
  if (!process.env.SHIPHERO_ACCESS_TOKEN && !process.env.SHIPHERO_REFRESH_TOKEN) {
    errors.push('SHIPHERO_ACCESS_TOKEN or SHIPHERO_REFRESH_TOKEN is required');
  }
  return errors;
}

function getDestinationCountry(order: VacierLatamOrder): string | null {
  const country = order.shipping_address?.country_code || order.shipping_address?.country;
  return country ? String(country).toUpperCase() : null;
}

function normalizeOrderNumber(value: string): string {
  return value.trim().replace(/^#/, '');
}

function isOrderNumberAllowed(orderNumber: string, filters: string[]): boolean {
  if (filters.length === 0) return true;
  const normalizedOrder = normalizeOrderNumber(orderNumber);
  return filters.some((filter) => normalizeOrderNumber(filter) === normalizedOrder);
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

function getQuantity(value: number | null | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}

export async function buildLineItemCustomsUpdates(
  order: VacierLatamOrder,
  destinationCountry: string,
  resolveOverride: NonNullable<VacierLatamProcessingContext['resolveOverride']> = resolveLatamOverrideForSku,
): Promise<{ updates: Array<{ id: string; customs_value: string }>; total: number }> {
  const updates: Array<{ id: string; customs_value: string }> = [];
  let total = 0;

  for (const edge of order.line_items.edges) {
    const lineItem = edge.node;
    const sku = String(lineItem.sku ?? '').trim();
    if (!sku) throw new Error(`Missing SKU for line item ${lineItem.id}`);

    const override = await resolveOverride(sku, destinationCountry);
    const value = override.customsValue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Invalid LATAM customs override for SKU ${sku}`);
    }

    const formatted = override.customsValueFormatted ?? formatAmount(value);
    updates.push({ id: lineItem.id, customs_value: formatted });
    total += value * getQuantity(lineItem.quantity);
  }

  return { updates, total };
}

export async function processVacierLatamOrder(
  order: VacierLatamOrder,
  context: VacierLatamProcessingContext,
): Promise<VacierLatamOrderResult> {
  const { config, batchId } = context;
  const resolveOverride = context.resolveOverride ?? resolveLatamOverrideForSku;
  const updateLineItems = context.updateLineItemsCustomsValue ?? updateLineItemsCustomsValue;
  const tagOrder = context.addOrderTag ?? addOrderTag;
  let creditsUsed = 0;

  try {
    if (!order.shipping_address) {
      return skipResult(order, 'missing_address');
    }

    const destinationCountry = getDestinationCountry(order);
    if (!destinationCountry || !config.countries.includes(destinationCountry)) {
      return skipResult(order, 'not_latam_country', destinationCountry);
    }

    if (!isOrderNumberAllowed(order.order_number, config.orderNumberFilter)) {
      return skipResult(order, 'not_in_order_number_filter', destinationCountry);
    }

    if (hasTag(order, config.processedTag)) {
      return skipResult(order, 'already_tagged', destinationCountry);
    }

    if (order.line_items.edges.length === 0) {
      return skipResult(order, 'no_line_items', destinationCountry);
    }

    const { updates, total } = await buildLineItemCustomsUpdates(order, destinationCountry, resolveOverride);
    const copiedCustomsTotal = formatAmount(total);
    const aboveReferenceValue = total > config.referenceValueEur;

    if (aboveReferenceValue) {
      logger.warn('vacier_latam_above_reference_value', {
        batchId,
        orderId: order.id,
        orderNumber: order.order_number,
        destinationCountry,
        copiedCustomsTotal,
        referenceValueEur: config.referenceValueEur,
        dryRun: config.dryRun,
      });
    }

    if (config.dryRun) {
      return {
        orderId: order.id,
        orderNumber: order.order_number,
        orderDate: order.order_date,
        destinationCountry,
        status: 'dry_run',
        reason: aboveReferenceValue ? 'above_reference_value' : undefined,
        creditsUsed: 0,
        copiedCustomsTotal,
        aboveReferenceValue,
        lineItemCount: updates.length,
      };
    }

    const updateResult = await updateLineItems(order.id, updates, { batchId, orderNumber: order.order_number });
    creditsUsed += updateResult.complexity;

    const tagResult = await tagOrder(order.id, config.processedTag, { batchId, orderNumber: order.order_number });
    creditsUsed += tagResult.complexity;

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      orderDate: order.order_date,
      destinationCountry,
      status: 'processed',
      reason: aboveReferenceValue ? 'above_reference_value' : undefined,
      creditsUsed,
      copiedCustomsTotal,
      aboveReferenceValue,
      lineItemCount: updates.length,
    };
  } catch (error) {
    logger.error('vacier_latam_order_error', {
      batchId,
      orderId: order.id,
      orderNumber: order.order_number,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      orderDate: order.order_date,
      destinationCountry: getDestinationCountry(order),
      status: 'error',
      reason: error instanceof Error ? error.message : 'unknown_error',
      creditsUsed,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function skipResult(order: VacierLatamOrder, reason: string, destinationCountry = getDestinationCountry(order)): VacierLatamOrderResult {
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    orderDate: order.order_date,
    destinationCountry,
    status: 'skipped',
    reason,
    creditsUsed: 0,
  };
}

export async function processVacierLatamCustomsBatch(
  config = getVacierLatamConfig(),
  dependencies: VacierLatamProcessingDependencies = {},
): Promise<VacierLatamBatchResult> {
  const {
    createRun,
    getLatestOrderDate,
    getProcessingCursor,
    hasRecentRunningRun,
    insertOrderResult,
    updateProcessingCursor,
    updateRun,
  } = await import('./customs.repository');
  const batchId = generateBatchId();
  const startedAt = new Date();
  resetQuotaManager();

  const result: VacierLatamBatchResult = {
    batchId,
    startedAt,
    ordersQueried: 0,
    ordersProcessed: 0,
    ordersSkipped: 0,
    errorsCount: 0,
    errorDetails: [],
    creditsUsed: 0,
    dryRun: config.dryRun,
    status: 'running',
  };

  if (await hasRecentRunningRun(STALE_RUN_MINUTES)) {
    return { ...result, status: 'completed', completedAt: new Date() };
  }

  await createRun(result);
  const cursorOrders: Array<{ order_date: string }> = [];

  try {
    const processingStartDate = await getProcessingCursor(config.processingStartDate);
    const since = processingStartDate.toISOString();
    const context: VacierLatamProcessingContext = { batchId, config, ...dependencies };
    const quotaManager = getQuotaManager();

    for (const status of config.fulfillmentStatuses) {
      const orderGenerator = fetchAllOrders({
        customerAccountId: config.customerAccountId,
        fulfillmentStatus: status,
        orderDateFrom: since,
        first: 25,
      });

      for await (const orderBatch of orderGenerator) {
        result.ordersQueried += orderBatch.length;

        for (const order of orderBatch) {
          const quotaCheck = quotaManager.canProceed(ESTIMATED_ORDER_COST);
          if (!quotaCheck.ok) {
            const canProceed = await quotaManager.waitForCredits(ESTIMATED_ORDER_COST, 120000);
            if (!canProceed) {
              logger.warn('vacier_latam_quota_stop', { batchId, ordersQueried: result.ordersQueried });
              break;
            }
          }

          const orderResult = await processVacierLatamOrder(order, context);
          await insertOrderResult(batchId, orderResult);
          quotaManager.updateFromResponse(orderResult.creditsUsed);

          if (!config.dryRun && (orderResult.status === 'processed' || orderResult.status === 'skipped') && order.order_date) {
            cursorOrders.push({ order_date: order.order_date });
          }

          if (orderResult.status === 'processed' || orderResult.status === 'dry_run') result.ordersProcessed += 1;
          if (orderResult.status === 'skipped') result.ordersSkipped += 1;
          if (orderResult.status === 'error') {
            result.errorsCount += 1;
            result.errorDetails.push({
              orderId: orderResult.orderId,
              orderNumber: orderResult.orderNumber,
              error: orderResult.error?.message ?? orderResult.reason ?? 'Unknown error',
            });
          }

          result.creditsUsed += orderResult.creditsUsed;
        }
      }
    }

    result.status = 'completed';
    result.completedAt = new Date();

    if (!config.dryRun && cursorOrders.length > 0) {
      try {
        await updateProcessingCursor(getLatestOrderDate(cursorOrders), batchId);
      } catch (error) {
        logger.error('vacier_latam_cursor_update_failed', {
          batchId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    result.status = 'failed';
    result.completedAt = new Date();
    result.errorDetails.push({
      orderId: '',
      orderNumber: '',
      error: error instanceof Error ? error.message : String(error),
    });
    result.errorsCount += 1;
  } finally {
    await updateRun(result);
  }

  return result;
}

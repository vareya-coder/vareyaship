import { logger } from '@/utils/logger';
import { getShipHeroClient } from './client';
import type { Order, OrderFilters, OrdersQueryResponse } from './types';

export const GET_VACIER_ORDERS = `
  query GetVacierOrders(
    $cursor: String
    $status: String!
    $startDate: ISODateTime!
    $endDate: ISODateTime
    $customerId: String!
    $first: Int
  ) {
    orders(
      customer_account_id: $customerId
      fulfillment_status: $status
      order_date_from: $startDate
      order_date_to: $endDate
    ) {
      request_id
      complexity
      data(after: $cursor, first: $first) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            id
            legacy_id
            order_number
            fulfillment_status
            order_date
            total_price
            subtotal
            total_discounts
            email
            tags
            shipping_address {
              country
              country_code
            }
            line_items(first: 50) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  sku
                  product_name
                  quantity
                  price
                  customs_value
                  fulfillment_status
                  barcode
                  product {
                    warehouse_products {
                      id
                      warehouse_id
                      warehouse_identifier
                      customs_value
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function* fetchAllOrders(filters: OrderFilters): AsyncGenerator<Order[], void, undefined> {
  const client = getShipHeroClient();
  let cursor: string | undefined = filters.cursor;
  let totalOrders = 0;
  let pageCount = 0;
  const pageSize = filters.first ?? 25;

  while (true) {
    pageCount += 1;
    const response = await client.request<OrdersQueryResponse>(GET_VACIER_ORDERS, {
      cursor,
      status: filters.fulfillmentStatus,
      startDate: filters.orderDateFrom,
      endDate: filters.orderDateTo,
      customerId: filters.customerAccountId,
      first: pageSize,
    });

    const data = response.data?.orders?.data;
    if (!data) {
      logger.warn('vacier_latam_orders_query_empty', { pageCount, cursor });
      break;
    }

    const orders = data.edges.map((edge) => edge.node);
    if (orders.length === 0) break;

    totalOrders += orders.length;
    logger.info('vacier_latam_orders_queried', {
      pageCount,
      ordersInPage: orders.length,
      totalOrders,
      fulfillmentStatus: filters.fulfillmentStatus,
    });

    yield orders;

    if (!data.pageInfo.hasNextPage) break;
    cursor = data.pageInfo.endCursor ?? undefined;
  }
}

export function hasTag(order: Order, tag: string): boolean {
  return order.tags?.includes(tag) ?? false;
}

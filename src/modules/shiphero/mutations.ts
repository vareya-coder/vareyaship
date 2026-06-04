import { logger } from '@/utils/logger';
import { getShipHeroClient } from './client';
import type { AddTagsResponse, LineItemUpdate, UpdateLineItemsResponse } from './types';

const UPDATE_LINE_ITEMS_MUTATION = `
  mutation UpdateLineItems($orderId: String!, $lineItems: [UpdateLineItemInput!]!) {
    order_update_line_items(
      data: {
        order_id: $orderId,
        line_items: $lineItems
      }
    ) {
      request_id
      complexity
      order {
        id
        order_number
        line_items(first: 50) {
          edges {
            node {
              id
              sku
              customs_value
            }
          }
        }
      }
    }
  }
`;

const ADD_TAGS_MUTATION = `
  mutation AddTags($orderId: String!, $tags: [String!]!) {
    order_add_tags(
      data: {
        order_id: $orderId
        tags: $tags
      }
    ) {
      request_id
      complexity
      order {
        id
        order_number
        tags
      }
    }
  }
`;

export async function updateLineItemsCustomsValue(
  orderId: string,
  lineItems: LineItemUpdate[],
  context?: { batchId?: string; orderNumber?: string },
): Promise<{ success: boolean; complexity: number }> {
  logger.info('vacier_latam_line_items_update_started', {
    orderId,
    orderNumber: context?.orderNumber,
    batchId: context?.batchId,
    lineItemCount: lineItems.length,
  });

  const response = await getShipHeroClient().request<UpdateLineItemsResponse>(UPDATE_LINE_ITEMS_MUTATION, {
    orderId,
    lineItems,
  });

  const complexity = response.data?.order_update_line_items?.complexity ?? 0;
  logger.info('vacier_latam_line_items_updated', {
    orderId,
    orderNumber: context?.orderNumber,
    batchId: context?.batchId,
    complexity,
  });

  return { success: true, complexity };
}

export async function addOrderTag(
  orderId: string,
  tag: string,
  context?: { batchId?: string; orderNumber?: string },
): Promise<{ success: boolean; complexity: number }> {
  const response = await getShipHeroClient().request<AddTagsResponse>(ADD_TAGS_MUTATION, {
    orderId,
    tags: [tag],
  });

  const complexity = response.data?.order_add_tags?.complexity ?? 0;
  logger.info('vacier_latam_order_tagged', {
    orderId,
    orderNumber: context?.orderNumber,
    batchId: context?.batchId,
    tag,
    complexity,
  });

  return { success: true, complexity };
}

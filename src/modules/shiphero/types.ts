export interface WarehouseProduct {
  id?: string | null;
  warehouse_id?: string | null;
  warehouse_identifier?: string | null;
  customs_value?: string | number | null;
}

export interface ProductNode {
  warehouse_products?: WarehouseProduct[] | {
    edges?: Array<{ node: WarehouseProduct }>;
  } | null;
}

export interface LineItemNode {
  id: string;
  sku: string;
  product_name?: string | null;
  quantity: number;
  price?: string | null;
  customs_value?: string | null;
  fulfillment_status?: string | null;
  barcode?: string | null;
  product?: ProductNode | null;
}

export interface Order {
  id: string;
  legacy_id?: string | null;
  order_number: string;
  fulfillment_status?: string | null;
  order_date?: string | null;
  total_price?: string | null;
  subtotal?: string | null;
  total_discounts?: string | null;
  email?: string | null;
  tags?: string[] | null;
  shipping_address?: {
    country?: string | null;
    country_code?: string | null;
    [key: string]: unknown;
  } | null;
  line_items: {
    pageInfo?: {
      hasNextPage?: boolean;
      endCursor?: string | null;
    };
    edges: Array<{ node: LineItemNode }>;
  };
}

export interface OrdersQueryResponse {
  orders?: {
    request_id?: string;
    complexity?: number;
    data?: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor?: string | null;
      };
      edges: Array<{ cursor?: string; node: Order }>;
    };
  };
}

export interface OrderFilters {
  customerAccountId: string;
  fulfillmentStatus: string;
  orderDateFrom: string;
  orderDateTo?: string;
  cursor?: string;
  first?: number;
}

export interface LineItemUpdate {
  id: string;
  customs_value: string;
}

export interface UpdateLineItemsResponse {
  order_update_line_items?: {
    request_id?: string;
    complexity?: number;
    order?: {
      id: string;
      order_number: string;
    };
  };
}

export interface AddTagsResponse {
  order_add_tags?: {
    request_id?: string;
    complexity?: number;
    order?: {
      id: string;
      order_number: string;
      tags?: string[];
    };
  };
}

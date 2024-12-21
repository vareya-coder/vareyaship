export type ShipHeroWebhook = {
  shipping_method: string;
  order_id: number;
  profile: string;
  fulfillment_status: string;
  order_number: string;
  shop_name: string;
  account_id: number;
  partner_order_id: string;
  shipping_name: string;
  tax_type: string | null;
  tax_id: string | null;
  incoterms: string | null;
  currency: string;
  from_address: ShipHeroAddress;
  to_address: ShipHeroAddress;
  packages: ShipHeroPackage[];
};

type ShipHeroAddress = {
  name: string;
  company_name: string;
  address_1: string;
  address_2: string;
  email: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
};

type ShipHeroPackage = {
  name?: string;
  weight_in_oz: number;
  width?: number;
  length?: number;
  height?: number;
  line_items?: ShipHeroLineItem[];
  box_code?: string;
  box_id?: number;
  box_name?: string;
};

type ShipHeroLineItem = {
  sku: string;
  tariff_code: string;
  price: number;
  customs_description: string;
  customs_value: string;
  line_item_id: number;
  quantity: number;
  weight: number;
  partner_line_item_id: string;
  id: string;
  country_of_manufacture: string;
  product_name: string;
  name: string;
  ignore_on_customs: boolean;
};


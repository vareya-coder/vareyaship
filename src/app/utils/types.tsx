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

// Based on the Asendia Sync REST API OpenAPI spec

// ---- Asendia Authentication ----

export type AsendiaAuthRequest = {
    username: string;
    password: string;
}

export type AsendiaAuthResponse = {
    id_token: string;
}

// ---- Parcel Creation ----

export type AsendiaAddress = {
    name: string;
    company?: string;
    address1: string;
    address2?: string;
    address3?: string;
    postalCode: string;
    city: string;
    province?: string;
    country: string; // ISO 2-letter code
    email?: string;
    mobile?: string;
    phone?: string;
}

export type AsendiaCustomsItem = {
    articleDescription: string;
    articleUrl?: string;
    articleNumber?: string;
    articleComposition?: string;
    unitValue: number;
    currency: string;
    harmonizationCode?: string;
    originCountry: string; // ISO 2-letter code
    unitWeight: number; // Weight in KG
    quantity: number;
}

export type AsendiaParcelRequest = {
    customerId: string;
    labelType: "PDF" | "ZPL" | "EPL";
    referencenumber: string;
    sequencenumber?: string;
    senderEORI?: string;
    sellerEORI?: string;
    senderTaxId?: string;
    receiverTaxId?: string;
    weight: number; // Total weight in KG
    asendiaService: {
        format: "N" | "B"; // P=Packet, B=Box
        product: "EPAQSTD" | "EPAQPLUS" | "EPAQTRK" | "EPAQSEL" | string;
        service: "CUP" | string;
        options?: string[];
        insurance?: string;
        returnLabelOption?: {
            enabled: boolean;
            type: string;
            payment: string;
        };
    };
    addresses: {
        sender: AsendiaAddress;
        receiver: AsendiaAddress;
        importer?: AsendiaAddress;
    };
    customsInfo?: {
        currency: string;
        items: AsendiaCustomsItem[];
    };
}

export type AsendiaParcelResponse = {
    id: string;
    trackingNumber?: string;
    returnTrackingNumber?: string;
    errorMessages?: {
        field: string;
        message: string;
    }[];
    labelLocation?: string;
    returnLabelLocation?: string;
    customsDocumentLocation?: string;
    manifestLocation?: string;
    commercialInvoiceLocation?: string;
}

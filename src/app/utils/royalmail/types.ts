import { ShipHeroWebhook } from '@/app/utils/types';

export type RoyalMailPackageFormatIdentifier =
  | 'letter'
  | 'largeLetter'
  | 'smallParcel'
  | 'mediumParcel'
  | 'largeParcel'
  | 'parcel'
  | 'documents'
  | 'undefined';

export type RoyalMailMethodConfig = {
  canonicalMethod: string;
  packageFormatIdentifier: RoyalMailPackageFormatIdentifier;
  serviceCode?: string;
  serviceRegisterCode?: string;
};

export type RoyalMailAddressRequest = {
  fullName?: string;
  companyName?: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  city: string;
  county?: string;
  postcode?: string;
  countryCode: string;
};

export type RoyalMailCreateOrdersRequest = {
  items: RoyalMailCreateOrderRequest[];
};

export type RoyalMailCreateOrderRequest = {
  orderReference: string;
  recipient: {
    address: RoyalMailAddressRequest;
    phoneNumber?: string;
    emailAddress?: string;
  };
  sender?: {
    tradingName?: string;
    phoneNumber?: string;
    emailAddress?: string;
  };
  packages: RoyalMailShipmentPackageRequest[];
  orderDate: string;
  subtotal: number;
  shippingCostCharged: number;
  total: number;
  currencyCode: string;
  postageDetails: RoyalMailPostageDetailsRequest;
  label: {
    includeLabelInResponse: boolean;
    includeReturnsLabel: boolean;
    includeCN: boolean;
  };
  orderTax?: number;
  containsDangerousGoods?: boolean;
};

export type RoyalMailShipmentPackageRequest = {
  weightInGrams: number;
  packageFormatIdentifier: RoyalMailPackageFormatIdentifier;
  contents?: RoyalMailProductItemRequest[];
};

export type RoyalMailProductItemRequest = {
  name?: string;
  SKU?: string;
  quantity: number;
  unitValue: number;
  unitWeightInGrams?: number;
  customsDescription?: string;
  customsCode?: string;
  originCountryCode?: string;
};

export type RoyalMailPostageDetailsRequest = {
  serviceCode: string;
  serviceRegisterCode?: string;
  carrierName?: string;
  sendNotificationsTo?: 'sender' | 'recipient' | 'billing';
  receiveEmailNotification?: boolean;
  receiveSmsNotification?: boolean;
  requestSignatureUponDelivery?: boolean;
};

export type RoyalMailCreateOrdersResponse = {
  successCount?: number;
  errorsCount?: number;
  createdOrders?: RoyalMailCreateOrderResponse[];
  failedOrders?: RoyalMailFailedOrderResponse[];
};

export type RoyalMailCreateOrderResponse = {
  orderIdentifier: number;
  orderReference?: string;
  trackingNumber?: string;
  label?: string;
  labelErrors?: RoyalMailOrderError[];
  packages?: Array<{
    packageNumber?: number;
    trackingNumber?: string;
  }>;
};

export type RoyalMailFailedOrderResponse = {
  order?: RoyalMailCreateOrderRequest;
  errors?: RoyalMailOrderError[];
};

export type RoyalMailOrderError = {
  errorCode?: number | string;
  code?: string;
  errorMessage?: string;
  message?: string;
  details?: string;
  fields?: Array<{
    fieldName?: string;
    value?: string;
  }>;
};

export type RoyalMailNormalizedLabelResponse = {
  orderIdentifier: number;
  trackingNumber: string;
  labelBase64: string;
};

export type RoyalMailBuildRequestInput = {
  shipmentData: ShipHeroWebhook;
  methodConfig: RoyalMailMethodConfig;
};

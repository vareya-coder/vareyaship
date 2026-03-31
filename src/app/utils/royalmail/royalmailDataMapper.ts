import { ShipHeroWebhook } from '@/app/utils/types';
import {
  RoyalMailBuildRequestInput,
  RoyalMailCreateOrderRequest,
  RoyalMailCreateOrdersRequest,
  RoyalMailMethodConfig,
  RoyalMailPackageFormatIdentifier,
  RoyalMailProductItemRequest,
} from '@/app/utils/royalmail/types';

const OZ_TO_GRAMS_MULTIPLIER = 28.3495;
const FALLBACK_MIN_MONEY_VALUE = 0.01;

const ROYAL_MAIL_CANONICAL_METHODS = {
  tracked24NoSignature: 'royal_mail_tracked_24_no_signature',
  tracked48NoSignature: 'royal_mail_tracked_48_no_signature',
  trackedLetterBoxable48NoSignature: 'royal_mail_tracked_letter_boxable_48_no_signature',
} as const;

const ROYAL_MAIL_METHOD_ALIASES: Record<string, string> = {
  [ROYAL_MAIL_CANONICAL_METHODS.tracked24NoSignature]:
    ROYAL_MAIL_CANONICAL_METHODS.tracked24NoSignature,
  [`royalmail:${ROYAL_MAIL_CANONICAL_METHODS.tracked24NoSignature}`]:
    ROYAL_MAIL_CANONICAL_METHODS.tracked24NoSignature,
  [ROYAL_MAIL_CANONICAL_METHODS.tracked48NoSignature]:
    ROYAL_MAIL_CANONICAL_METHODS.tracked48NoSignature,
  [`royalmail:${ROYAL_MAIL_CANONICAL_METHODS.tracked48NoSignature}`]:
    ROYAL_MAIL_CANONICAL_METHODS.tracked48NoSignature,
  [ROYAL_MAIL_CANONICAL_METHODS.trackedLetterBoxable48NoSignature]:
    ROYAL_MAIL_CANONICAL_METHODS.trackedLetterBoxable48NoSignature,
  [`royalmail:${ROYAL_MAIL_CANONICAL_METHODS.trackedLetterBoxable48NoSignature}`]:
    ROYAL_MAIL_CANONICAL_METHODS.trackedLetterBoxable48NoSignature,
};

export function isRoyalMailShippingMethod(shippingMethod: string): boolean {
  const normalized = normalizeShippingMethod(shippingMethod);
  return Boolean(ROYAL_MAIL_METHOD_ALIASES[normalized]);
}

export function getRoyalMailMethodConfig(shippingMethod: string): RoyalMailMethodConfig | undefined {
  const normalized = normalizeShippingMethod(shippingMethod);
  const canonicalMethod = ROYAL_MAIL_METHOD_ALIASES[normalized];
  if (!canonicalMethod) {
    return undefined;
  }

  switch (canonicalMethod) {
    case ROYAL_MAIL_CANONICAL_METHODS.tracked24NoSignature:
      return {
        canonicalMethod,
        packageFormatIdentifier: 'smallParcel',
        serviceCode: process.env.ROYALMAIL_SERVICE_CODE_TRACKED_24_NS?.trim(),
        serviceRegisterCode: process.env.ROYALMAIL_SERVICE_REGISTER_CODE_TRACKED_24_NS?.trim(),
      };
    case ROYAL_MAIL_CANONICAL_METHODS.tracked48NoSignature:
      return {
        canonicalMethod,
        packageFormatIdentifier: 'smallParcel',
        serviceCode: process.env.ROYALMAIL_SERVICE_CODE_TRACKED_48_NS?.trim(),
        serviceRegisterCode: process.env.ROYALMAIL_SERVICE_REGISTER_CODE_TRACKED_48_NS?.trim(),
      };
    case ROYAL_MAIL_CANONICAL_METHODS.trackedLetterBoxable48NoSignature:
      return {
        canonicalMethod,
        packageFormatIdentifier: 'largeLetter',
        serviceCode: process.env.ROYALMAIL_SERVICE_CODE_TRACKED_LB48_NS?.trim(),
        serviceRegisterCode: process.env.ROYALMAIL_SERVICE_REGISTER_CODE_TRACKED_LB48_NS?.trim(),
      };
    default:
      return undefined;
  }
}

export function mapShipHeroToRoyalMailCreateOrdersRequest({
  shipmentData,
  methodConfig,
}: RoyalMailBuildRequestInput): RoyalMailCreateOrdersRequest {
  const order: RoyalMailCreateOrderRequest = {
    orderReference: buildOrderReference(shipmentData),
    recipient: {
      address: {
        fullName:
          cleanText(shipmentData.to_address.name) ||
          cleanText(shipmentData.to_address.company_name) ||
          'Recipient',
        companyName: cleanText(shipmentData.to_address.company_name) || undefined,
        addressLine1: cleanText(shipmentData.to_address.address_1) || 'Unknown address',
        addressLine2: cleanText(shipmentData.to_address.address_2) || undefined,
        city: cleanText(shipmentData.to_address.city) || 'Unknown city',
        postcode: cleanText(shipmentData.to_address.zip) || undefined,
        countryCode: normalizeCountryCode(shipmentData.to_address.country),
      },
      phoneNumber: cleanText(shipmentData.to_address.phone) || undefined,
      emailAddress: cleanText(shipmentData.to_address.email) || undefined,
    },
    sender: {
      tradingName:
        cleanText(shipmentData.from_address.company_name) ||
        cleanText(shipmentData.from_address.name) ||
        'Vareya',
      phoneNumber: cleanText(shipmentData.from_address.phone) || undefined,
      emailAddress: cleanText(shipmentData.from_address.email) || undefined,
    },
    packages: [
      {
        weightInGrams: calculatePackageWeightInGrams(shipmentData),
        packageFormatIdentifier: methodConfig.packageFormatIdentifier,
        contents: mapPackageContents(shipmentData),
      },
    ],
    orderDate: new Date().toISOString(),
    subtotal: getSafeMoneyValue(calculateSubtotal(shipmentData)),
    shippingCostCharged: 0,
    total: getSafeMoneyValue(calculateSubtotal(shipmentData)),
    currencyCode: normalizeCurrency(shipmentData.currency),
    postageDetails: {
      serviceCode: methodConfig.serviceCode || '',
      serviceRegisterCode: methodConfig.serviceRegisterCode || undefined,
      carrierName: 'Royal Mail',
      sendNotificationsTo: 'recipient',
      receiveEmailNotification: Boolean(cleanText(shipmentData.to_address.email)),
      receiveSmsNotification: Boolean(cleanText(shipmentData.to_address.phone)),
      requestSignatureUponDelivery: false,
    },
    label: {
      includeLabelInResponse: true,
      includeReturnsLabel: false,
      includeCN: false,
    },
    orderTax: 0,
    containsDangerousGoods: false,
  };

  return { items: [order] };
}

function normalizeShippingMethod(shippingMethod: string): string {
  return (shippingMethod || '').trim().toLowerCase();
}

function buildOrderReference(shipmentData: ShipHeroWebhook): string {
  const rawValue =
    cleanText(shipmentData.order_number) ||
    cleanText(shipmentData.partner_order_id) ||
    String(shipmentData.order_id || '');
  const sanitized = rawValue.replace(/[^\w\-./]/g, '').slice(0, 40);

  if (sanitized) {
    return sanitized;
  }

  return String(shipmentData.order_id || `order-${Date.now()}`).slice(0, 40);
}

function mapPackageContents(shipmentData: ShipHeroWebhook): RoyalMailProductItemRequest[] {
  const items = shipmentData.packages.flatMap((pkg) => pkg.line_items || []);

  return items.map((item) => {
    const customsCode = cleanText(item.tariff_code)?.replace(/\./g, '').slice(0, 10);

    return {
      name: cleanText(item.product_name) || cleanText(item.name) || cleanText(item.customs_description) || undefined,
      SKU: cleanText(item.sku) || undefined,
      quantity: Math.max(1, Number(item.quantity) || 1),
      unitValue: getSafeMoneyValue(Number(item.price) || 0),
      unitWeightInGrams: convertOzToGrams(Math.max(0, Number(item.weight) || 0)),
      customsDescription:
        cleanText(item.customs_description) ||
        cleanText(item.name) ||
        cleanText(item.product_name) ||
        undefined,
      customsCode: customsCode || undefined,
      originCountryCode: normalizeCountryCode(item.country_of_manufacture || 'NL'),
    };
  });
}

function calculatePackageWeightInGrams(shipmentData: ShipHeroWebhook): number {
  const firstPackageWeightOz = shipmentData.packages?.[0]?.weight_in_oz;
  if (firstPackageWeightOz && firstPackageWeightOz > 0) {
    return Math.max(1, convertOzToGrams(firstPackageWeightOz));
  }

  const totalLineItemWeightOz = shipmentData.packages.reduce((sum, pkg) => {
    const lineItemWeight = (pkg.line_items || []).reduce((itemSum, lineItem) => {
      return itemSum + Math.max(0, Number(lineItem.weight) || 0);
    }, 0);

    return sum + lineItemWeight;
  }, 0);

  return Math.max(1, convertOzToGrams(totalLineItemWeightOz));
}

function calculateSubtotal(shipmentData: ShipHeroWebhook): number {
  const subtotal = shipmentData.packages.reduce((packageSum, pkg) => {
    const packageLineTotal = (pkg.line_items || []).reduce((lineSum, lineItem) => {
      const quantity = Math.max(1, Number(lineItem.quantity) || 1);
      const unitPrice = Math.max(0, Number(lineItem.price) || 0);
      return lineSum + unitPrice * quantity;
    }, 0);

    return packageSum + packageLineTotal;
  }, 0);

  return roundTo2Dp(subtotal);
}

function normalizeCurrency(currency: string): string {
  const normalized = cleanText(currency)?.toUpperCase() || 'EUR';
  return normalized.slice(0, 3);
}

function normalizeCountryCode(countryCode: string): string {
  const normalized = cleanText(countryCode)?.toUpperCase() || 'NL';
  if (normalized === 'UK') {
    return 'GB';
  }

  return normalized.slice(0, 3);
}

function convertOzToGrams(weightInOz: number): number {
  return Math.round(weightInOz * OZ_TO_GRAMS_MULTIPLIER);
}

function roundTo2Dp(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getSafeMoneyValue(value: number): number {
  return Math.max(FALLBACK_MIN_MONEY_VALUE, roundTo2Dp(value));
}

function cleanText(value: string | null | undefined): string {
  return (value || '').trim();
}

export function getRoyalMailTrackingUrl(trackingNumber: string): string {
  if (!trackingNumber) {
    return '';
  }

  const template =
    process.env.ROYALMAIL_TRACKING_URL_TEMPLATE?.trim() ||
    'https://www.royalmail.com/track-your-item#/tracking-results/{trackingNumber}';

  if (template.includes('{trackingNumber}')) {
    return template.replace('{trackingNumber}', encodeURIComponent(trackingNumber));
  }

  return `${template}${encodeURIComponent(trackingNumber)}`;
}

export const ROYAL_MAIL_SHIPPING_METHODS = Object.keys(ROYAL_MAIL_METHOD_ALIASES);
export const ROYAL_MAIL_CANONICAL_SHIPPING_METHODS = Object.values(ROYAL_MAIL_CANONICAL_METHODS);
export type RoyalMailSupportedPackageFormat = RoyalMailPackageFormatIdentifier;

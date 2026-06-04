export type PostNLLabelErrorDetail = {
  barcode: string | null;
  productCodeDelivery: string | null;
  downPartnerID: string | null;
  code: string | null;
  description: string;
};

export type PostNLLabelErrorPayload = {
  message: string;
  provider: 'PostNL';
  errorCode: 'POSTNL_LABEL_ERROR';
  errors: PostNLLabelErrorDetail[];
};

export function extractPostNLResponseError(data: any): PostNLLabelErrorPayload | null {
  const responseShipments = Array.isArray(data?.ResponseShipments) ? data.ResponseShipments : [];
  const errors = responseShipments.flatMap((shipment: any) => {
    const shipmentErrors = Array.isArray(shipment?.Errors) ? shipment.Errors : [];
    return shipmentErrors.map((error: any) => ({
      barcode: shipment?.Barcode ?? null,
      productCodeDelivery: shipment?.ProductCodeDelivery ?? null,
      downPartnerID: shipment?.DownPartnerID ?? null,
      code: error?.Code ?? null,
      description: error?.Description ?? 'Unknown PostNL label error',
    }));
  });

  if (errors.length === 0) return null;

  return {
    message: formatPostNLErrors(errors),
    provider: 'PostNL',
    errorCode: 'POSTNL_LABEL_ERROR',
    errors,
  };
}

export function formatPostNLErrors(errors: Array<{ code?: string | null; description?: string | null; barcode?: string | null }>) {
  if (errors.length === 0) return 'PostNL label API returned an error.';

  return errors
    .map((error) => {
      const code = error.code ? `PostNL ${error.code}` : 'PostNL error';
      const barcode = error.barcode ? ` for barcode ${error.barcode}` : '';
      return `${code}${barcode}: ${error.description ?? 'Unknown label error'}`;
    })
    .join('; ');
}

import { findActiveAsendiaCustomerMappingByAccountId } from './customer.repository';

export type ResolvedAsendiaCustomerMapping = {
  accountId: number;
  customerName: string;
  crmId: string;
  senderTaxCode: string | null;
};

export async function getRequiredAsendiaCustomerMapping(accountId: number): Promise<ResolvedAsendiaCustomerMapping> {
  const mapping = await findActiveAsendiaCustomerMappingByAccountId(accountId);

  if (!mapping?.crm_id) {
    throw new Error(`Missing active Asendia CRM mapping for account_id ${accountId}.`);
  }

  return {
    accountId,
    customerName: mapping.customer_name,
    crmId: mapping.crm_id,
    senderTaxCode: mapping.sender_tax_code ?? null,
  };
}

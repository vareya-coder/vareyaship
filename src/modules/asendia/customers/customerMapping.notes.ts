// Active Asendia account_id -> CRM/customer mappings live in the
// "asendia_customer_mappings" database table and are seeded by migration.
//
// Keep unresolved entries with blank account_id commented here until the
// operational account_id is known and can be inserted into the DB seed.
export const ASENDIA_CUSTOMER_MAPPING_NOTES = {
  pendingAccountIds: [
    // { customer: 'Elevitae', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Milan Shah', accountId: '', crmId: 'NL21080009', senderTaxCode: 'GB289337944' },
    // { customer: 'Meridian', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB339713089000' },
    // { customer: 'Zitsticka', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Caterpy', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Lumin Skin', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB339713089000' },
    // { customer: 'Mfoodproduct', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Moneclat', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Youth Earth', accountId: '', crmId: 'Youth Earth', senderTaxCode: 'GB289337944' },
    // { customer: 'Keith Teh', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Arabeaute', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Coolado', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Saga Fitness', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Glamnetic', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Arena', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Crosshkt', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'Sanalyslab', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
    // { customer: 'I Am Authentic BV', accountId: '', crmId: 'NL21110007', senderTaxCode: 'GB289337944' },
  ],
} as const;

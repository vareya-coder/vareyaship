import assert from 'node:assert/strict';
import { extractPostNLResponseError } from './labelError';

const sample = {
  MergedLabels: [],
  ResponseShipments: [
    {
      Barcode: 'LA932766597NL',
      DownPartnerID: 'USA NON-DPP DUMMY',
      Errors: [
        {
          Code: '500',
          Description: 'No label available for this contract',
        },
      ],
      Warnings: [],
      Labels: [],
      ProductCodeDelivery: '6550',
    },
  ],
};

const parsed = extractPostNLResponseError(sample);
assert.equal(parsed?.provider, 'PostNL');
assert.equal(parsed?.errorCode, 'POSTNL_LABEL_ERROR');
assert.equal(parsed?.message, 'PostNL 500 for barcode LA932766597NL: No label available for this contract');
assert.equal(Object.prototype.hasOwnProperty.call(parsed, 'rawResponse'), false);
assert.deepEqual(parsed?.errors[0], {
  barcode: 'LA932766597NL',
  productCodeDelivery: '6550',
  downPartnerID: 'USA NON-DPP DUMMY',
  code: '500',
  description: 'No label available for this contract',
});
assert.equal(extractPostNLResponseError({ ResponseShipments: [{ Labels: [{ Content: 'abc' }], Errors: [] }] }), null);

console.log('PostNL label error parser tests passed.');

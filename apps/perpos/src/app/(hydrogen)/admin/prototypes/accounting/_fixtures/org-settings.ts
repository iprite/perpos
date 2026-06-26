// org-settings.ts — acc_org_settings (1 แถว)
// Non-VAT default ตาม spec §4.11

import type { AccOrgSettings } from "./types";

export const MOCK_ORG_ID = "00000000-0000-0000-0000-000000000001";

export const mockOrgSettings: AccOrgSettings = {
  org_id: MOCK_ORG_ID,
  is_vat_registered: false, // Non-VAT default (§4.11)
  vat_rate: 7.0,
  fiscal_start_month: 1,
  doc_number_prefix: {
    quotation: "QT",
    invoice: "INV",
    receipt: "RC",
  },
  address: "123/45 ถนนเพชรบุรี แขวงถนนเพชรบุรี เขตราชเทวี กรุงเทพฯ 10400",
  tax_id: "0105566001234",
  created_at: "2026-01-01T00:00:00.000Z",
};

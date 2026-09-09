const STORAGE_KEY = 'trex_issuer_subscription_requests_v1';

export const ISSUER_REQUEST_STATUS = Object.freeze({
  VERIFIED: 'verified',
  PENDING_KYC: 'pending_kyc',
  REJECTED: 'rejected',
  NEEDS_INFO: 'needs_info',
});

export const ISSUER_REQUEST_STATUS_META = Object.freeze({
  [ISSUER_REQUEST_STATUS.VERIFIED]: {
    label: 'Verified',
    tone: 'success',
    description: 'The investor identity profile is ready for issuer review.',
  },
  [ISSUER_REQUEST_STATUS.PENDING_KYC]: {
    label: 'Pending KYC',
    tone: 'warning',
    description: 'KYC or accreditation documents are still under review.',
  },
  [ISSUER_REQUEST_STATUS.REJECTED]: {
    label: 'Rejected',
    tone: 'danger',
    description: 'The subscription request has been rejected.',
  },
  [ISSUER_REQUEST_STATUS.NEEDS_INFO]: {
    label: 'Needs Info',
    tone: 'neutral',
    description: 'Additional information has been requested from the investor.',
  },
});

const createBaseActivity = (requestedAt) => ([
  {
    id: 'request_received',
    label: 'Request Received',
    note: 'Initial subscription request and investor profile were submitted.',
    at: requestedAt,
  },
  {
    id: 'kyc_started',
    label: 'Compliance Review Started',
    note: 'Identity and accreditation documents were routed to compliance.',
    at: new Date(new Date(requestedAt).getTime() + 1000 * 60 * 60 * 18).toISOString(),
  },
]);

const seedRequests = [
  {
    id: 'sub-bclp',
    investorName: 'Blackwood Capital LP',
    investorCode: '0x7A1...e92a',
    legalEntityName: 'Blackwood Capital LP',
    identityStatus: ISSUER_REQUEST_STATUS.VERIFIED,
    requestedDate: '2023-10-24T14:22:00Z',
    tokenName: 'RE-FUND-A',
    requestedUnits: '24.00',
    jurisdiction: 'United States (DE)',
    investmentAmount: 2500000,
    whitelistAddress: '0x716765...d289',
    requestReference: 'SUB-BK-2023-104',
    notes: 'Institutional request for the issuer minting queue.',
    kycTopicId: '0xAa...c12',
    accreditedTopicId: '0x9b...b44',
    claims: {
      kyc: {
        title: 'KYC Verification',
        description: 'Identify and verify the identity of the legal entity or natural person as per AML / CTF regulations.',
        status: 'verified',
        documents: [
          { id: 'bclp-passport', name: 'Passport / ID Document', file: 'BW_Passport_Front.pdf', size: '2.4 MB' },
          { id: 'bclp-address', name: 'Proof of Address', file: 'Utility_Bill_Q4.pdf', size: '1.0 MB' },
        ],
      },
      accredited: {
        title: 'Accredited Investor',
        description: 'Certification that the investor meets the financial requirements for private offerings under Reg D.',
        status: 'verified',
        documents: [
          { id: 'bclp-accredited', name: 'Accredited Certification', file: 'CPA_Letter_2023.pdf', size: '640 KB' },
        ],
      },
    },
    activity: createBaseActivity('2023-10-24T14:22:00Z'),
  },
  {
    id: 'sub-elr',
    investorName: 'Elena Rodriguez',
    investorCode: '0x5A3...9f11',
    legalEntityName: 'Elena Rodriguez',
    identityStatus: ISSUER_REQUEST_STATUS.PENDING_KYC,
    requestedDate: '2023-10-24T11:05:00Z',
    tokenName: 'RE-FUND-A',
    requestedUnits: '12.00',
    jurisdiction: 'Spain (ES)',
    investmentAmount: 750000,
    whitelistAddress: '0x2fC403...B8d1',
    requestReference: 'SUB-ER-2023-105',
    notes: 'Individual accredited investor application awaiting final claim verification.',
    kycTopicId: '0xA1...ee4',
    accreditedTopicId: '0xB3...441',
    claims: {
      kyc: {
        title: 'KYC Verification',
        description: 'Verify identity documents and proof of residence before whitelisting the subscription.',
        status: 'pending',
        documents: [
          { id: 'er-passport', name: 'Passport / ID Document', file: 'ER_Passport.pdf', size: '1.8 MB' },
          { id: 'er-address', name: 'Proof of Address', file: 'ER_Bank_Statement.pdf', size: '870 KB' },
        ],
      },
      accredited: {
        title: 'Accredited Investor',
        description: 'Review the investor accreditation evidence and confirm eligibility.',
        status: 'pending',
        documents: [
          { id: 'er-accredited', name: 'Accredited Certification', file: 'ER_Investment_Statement.pdf', size: '1.1 MB' },
        ],
      },
    },
    activity: createBaseActivity('2023-10-24T11:05:00Z'),
  },
  {
    id: 'sub-gwa',
    investorName: 'Global Wealth Alpha',
    investorCode: '0x6D1...aa56',
    legalEntityName: 'Global Wealth Alpha',
    identityStatus: ISSUER_REQUEST_STATUS.VERIFIED,
    requestedDate: '2023-10-23T16:45:00Z',
    tokenName: 'RE-FUND-A',
    requestedUnits: '5.00',
    jurisdiction: 'United Kingdom',
    investmentAmount: 420000,
    whitelistAddress: '0x611590...C141',
    requestReference: 'SUB-GWA-2023-099',
    notes: 'Existing investor account with refreshed accreditation documents.',
    kycTopicId: '0xC1...112',
    accreditedTopicId: '0xE0...919',
    claims: {
      kyc: {
        title: 'KYC Verification',
        description: 'All investor identity documents were previously validated.',
        status: 'verified',
        documents: [
          { id: 'gwa-corp', name: 'Certificate of Incorporation', file: 'GWA_Entity_Cert.pdf', size: '960 KB' },
        ],
      },
      accredited: {
        title: 'Accredited Investor',
        description: 'Accredited investor evidence remains current and valid.',
        status: 'verified',
        documents: [
          { id: 'gwa-accredited', name: 'Accredited Certification', file: 'GWA_Accredited.pdf', size: '540 KB' },
        ],
      },
    },
    activity: createBaseActivity('2023-10-23T16:45:00Z'),
  },
  {
    id: 'sub-mc',
    investorName: 'Marcus Chen',
    investorCode: '0x8b2...22e8',
    legalEntityName: 'Marcus Chen',
    identityStatus: ISSUER_REQUEST_STATUS.REJECTED,
    requestedDate: '2023-10-23T13:12:00Z',
    tokenName: 'RE-FUND-A',
    requestedUnits: '2.50',
    jurisdiction: 'Singapore',
    investmentAmount: 150000,
    whitelistAddress: '0xAB8292...19D0',
    requestReference: 'SUB-MC-2023-098',
    notes: 'Request rejected due to incomplete accredited-investor evidence.',
    kycTopicId: '0xD2...731',
    accreditedTopicId: '0xF1...AB1',
    claims: {
      kyc: {
        title: 'KYC Verification',
        description: 'Identity documents were reviewed, but the request was not advanced.',
        status: 'verified',
        documents: [
          { id: 'mc-passport', name: 'Passport / ID Document', file: 'MC_Passport.pdf', size: '1.2 MB' },
        ],
      },
      accredited: {
        title: 'Accredited Investor',
        description: 'Submitted financial evidence did not meet the required standards.',
        status: 'rejected',
        documents: [
          { id: 'mc-accredited', name: 'Accredited Certification', file: 'MC_Statement.pdf', size: '920 KB' },
        ],
      },
    },
    activity: [
      ...createBaseActivity('2023-10-23T13:12:00Z'),
      {
        id: 'rejected',
        label: 'Subscription Rejected',
        note: 'Accredited-investor evidence was not sufficient for approval.',
        at: '2023-10-24T07:45:00Z',
      },
    ],
  },
  {
    id: 'sub-ocm',
    investorName: 'Orchid Capital Management',
    investorCode: '0x42A...c991',
    legalEntityName: 'Orchid Capital Management',
    identityStatus: ISSUER_REQUEST_STATUS.PENDING_KYC,
    requestedDate: '2023-10-22T09:30:00Z',
    tokenName: 'RE-FUND-A',
    requestedUnits: '30.00',
    jurisdiction: 'Luxembourg',
    investmentAmount: 3100000,
    whitelistAddress: '0xBE2130...9088',
    requestReference: 'SUB-OCM-2023-095',
    notes: 'Pending final KYC verification before moving into minting queue.',
    kycTopicId: '0x51...731',
    accreditedTopicId: '0x71...99C',
    claims: {
      kyc: {
        title: 'KYC Verification',
        description: 'Legal-entity KYC pack is awaiting operator confirmation.',
        status: 'pending',
        documents: [
          { id: 'ocm-kyc', name: 'Entity KYC Pack', file: 'OCM_KYC.pdf', size: '3.1 MB' },
        ],
      },
      accredited: {
        title: 'Accredited Investor',
        description: 'Accredited investor evidence is already on file.',
        status: 'verified',
        documents: [
          { id: 'ocm-accredited', name: 'Accredited Certification', file: 'OCM_Accredited.pdf', size: '720 KB' },
        ],
      },
    },
    activity: createBaseActivity('2023-10-22T09:30:00Z'),
  },
  {
    id: 'sub-ath',
    investorName: 'Atlas Treasury Holdings',
    investorCode: '0x35D...6af1',
    legalEntityName: 'Atlas Treasury Holdings',
    identityStatus: ISSUER_REQUEST_STATUS.VERIFIED,
    requestedDate: '2023-10-21T15:10:00Z',
    tokenName: 'RE-FUND-A',
    requestedUnits: '18.00',
    jurisdiction: 'Switzerland',
    investmentAmount: 1950000,
    whitelistAddress: '0x09c110...9d44',
    requestReference: 'SUB-ATH-2023-091',
    notes: 'Verified institutional subscription with approved minting permissions.',
    kycTopicId: '0x44...872',
    accreditedTopicId: '0x76...B22',
    claims: {
      kyc: { title: 'KYC Verification', description: 'Verified KYC dossier on record.', status: 'verified', documents: [{ id: 'ath-kyc', name: 'Entity Verification', file: 'ATH_KYC.pdf', size: '1.4 MB' }] },
      accredited: { title: 'Accredited Investor', description: 'Approved accredited-investor claim on record.', status: 'verified', documents: [{ id: 'ath-acc', name: 'Accredited Certification', file: 'ATH_Accredited.pdf', size: '600 KB' }] },
    },
    activity: createBaseActivity('2023-10-21T15:10:00Z'),
  },
  {
    id: 'sub-bsp', investorName: 'BlueStone Partners', investorCode: '0xA40...8ab5', legalEntityName: 'BlueStone Partners', identityStatus: ISSUER_REQUEST_STATUS.PENDING_KYC, requestedDate: '2023-10-21T11:20:00Z', tokenName: 'RE-FUND-A', requestedUnits: '7.00', jurisdiction: 'United Arab Emirates', investmentAmount: 620000, whitelistAddress: '0x9f43...D112', requestReference: 'SUB-BSP-2023-089', notes: 'Pending compliance verification.', kycTopicId: '0x81...da2', accreditedTopicId: '0x12...ce1', claims: { kyc: { title: 'KYC Verification', description: 'KYC review in progress.', status: 'pending', documents: [{ id: 'bsp-kyc', name: 'Passport / ID Document', file: 'BSP_Passport.pdf', size: '1.7 MB' }] }, accredited: { title: 'Accredited Investor', description: 'Awaiting final accreditation review.', status: 'pending', documents: [{ id: 'bsp-acc', name: 'Accredited Certification', file: 'BSP_Accredited.pdf', size: '810 KB' }] } }, activity: createBaseActivity('2023-10-21T11:20:00Z') },
  { id: 'sub-hcf', investorName: 'Harbor Crest Family Office', investorCode: '0x351...A129', legalEntityName: 'Harbor Crest Family Office', identityStatus: ISSUER_REQUEST_STATUS.VERIFIED, requestedDate: '2023-10-20T10:45:00Z', tokenName: 'RE-FUND-A', requestedUnits: '10.00', jurisdiction: 'France', investmentAmount: 900000, whitelistAddress: '0x1A23...9E45', requestReference: 'SUB-HCF-2023-084', notes: 'Verified family office request.', kycTopicId: '0x18...E44', accreditedTopicId: '0x10...F31', claims: { kyc: { title: 'KYC Verification', description: 'Completed.', status: 'verified', documents: [{ id: 'hcf-kyc', name: 'Proof of Address', file: 'HCF_Address.pdf', size: '730 KB' }] }, accredited: { title: 'Accredited Investor', description: 'Completed.', status: 'verified', documents: [{ id: 'hcf-acc', name: 'Accredited Certification', file: 'HCF_Accredited.pdf', size: '540 KB' }] } }, activity: createBaseActivity('2023-10-20T10:45:00Z') },
  { id: 'sub-nvp', investorName: 'North Vista Partners', investorCode: '0x92E...4d21', legalEntityName: 'North Vista Partners', identityStatus: ISSUER_REQUEST_STATUS.NEEDS_INFO, requestedDate: '2023-10-20T08:05:00Z', tokenName: 'RE-FUND-A', requestedUnits: '15.00', jurisdiction: 'Germany', investmentAmount: 1230000, whitelistAddress: '0x44Af...0e88', requestReference: 'SUB-NVP-2023-082', notes: 'Issuer requested more information.', kycTopicId: '0x09...fa1', accreditedTopicId: '0x55...001', claims: { kyc: { title: 'KYC Verification', description: 'Awaiting additional legal-entity proof.', status: 'pending', documents: [{ id: 'nvp-kyc', name: 'Entity Verification', file: 'NVP_Entity.pdf', size: '1.2 MB' }] }, accredited: { title: 'Accredited Investor', description: 'Evidence submitted.', status: 'verified', documents: [{ id: 'nvp-acc', name: 'Accredited Certification', file: 'NVP_Accredited.pdf', size: '570 KB' }] } }, activity: [...createBaseActivity('2023-10-20T08:05:00Z'), { id: 'need-info', label: 'More Information Requested', note: 'Issuer requested an additional legal-entity proof document.', at: '2023-10-21T07:10:00Z' }] },
  { id: 'sub-ssl', investorName: 'Stonegate Strategic Ltd', investorCode: '0x510...c432', legalEntityName: 'Stonegate Strategic Ltd', identityStatus: ISSUER_REQUEST_STATUS.VERIFIED, requestedDate: '2023-10-19T18:22:00Z', tokenName: 'RE-FUND-A', requestedUnits: '9.00', jurisdiction: 'United Kingdom', investmentAmount: 860000, whitelistAddress: '0x91aa...E412', requestReference: 'SUB-SSL-2023-079', notes: 'Verified subscription request.', kycTopicId: '0x31...8dc', accreditedTopicId: '0x14...0ac', claims: { kyc: { title: 'KYC Verification', description: 'Completed.', status: 'verified', documents: [{ id: 'ssl-kyc', name: 'Entity Verification', file: 'SSL_KYC.pdf', size: '980 KB' }] }, accredited: { title: 'Accredited Investor', description: 'Completed.', status: 'verified', documents: [{ id: 'ssl-acc', name: 'Accredited Certification', file: 'SSL_Accredited.pdf', size: '690 KB' }] } }, activity: createBaseActivity('2023-10-19T18:22:00Z') },
  { id: 'sub-lif', investorName: 'Luma Investment Fund', investorCode: '0xEF2...da29', legalEntityName: 'Luma Investment Fund', identityStatus: ISSUER_REQUEST_STATUS.PENDING_KYC, requestedDate: '2023-10-18T17:09:00Z', tokenName: 'RE-FUND-A', requestedUnits: '21.00', jurisdiction: 'Italy', investmentAmount: 1750000, whitelistAddress: '0xBb29...0AA9', requestReference: 'SUB-LIF-2023-076', notes: 'Awaiting final claim review.', kycTopicId: '0x92...ca1', accreditedTopicId: '0x21...1ed', claims: { kyc: { title: 'KYC Verification', description: 'Pending review.', status: 'pending', documents: [{ id: 'lif-kyc', name: 'Entity Verification', file: 'LIF_KYC.pdf', size: '1.5 MB' }] }, accredited: { title: 'Accredited Investor', description: 'Pending review.', status: 'pending', documents: [{ id: 'lif-acc', name: 'Accredited Certification', file: 'LIF_Accredited.pdf', size: '780 KB' }] } }, activity: createBaseActivity('2023-10-18T17:09:00Z') },
  { id: 'sub-scc', investorName: 'Summit Crest Capital', investorCode: '0x7d2...B419', legalEntityName: 'Summit Crest Capital', identityStatus: ISSUER_REQUEST_STATUS.REJECTED, requestedDate: '2023-10-18T13:16:00Z', tokenName: 'RE-FUND-A', requestedUnits: '3.00', jurisdiction: 'Canada', investmentAmount: 225000, whitelistAddress: '0x0B19...2211', requestReference: 'SUB-SCC-2023-074', notes: 'Rejected by compliance.', kycTopicId: '0x61...ff3', accreditedTopicId: '0x62...ac7', claims: { kyc: { title: 'KYC Verification', description: 'Completed.', status: 'verified', documents: [{ id: 'scc-kyc', name: 'Passport / ID Document', file: 'SCC_ID.pdf', size: '1.0 MB' }] }, accredited: { title: 'Accredited Investor', description: 'Rejected.', status: 'rejected', documents: [{ id: 'scc-acc', name: 'Income Certificate', file: 'SCC_Income.pdf', size: '650 KB' }] } }, activity: [...createBaseActivity('2023-10-18T13:16:00Z'), { id: 'reject', label: 'Rejected', note: 'The accredited-investor claim was rejected.', at: '2023-10-19T09:22:00Z' }] },
  { id: 'sub-pri', investorName: 'Pioneer Ridge Investments', investorCode: '0x113...90ab', legalEntityName: 'Pioneer Ridge Investments', identityStatus: ISSUER_REQUEST_STATUS.VERIFIED, requestedDate: '2023-10-17T12:00:00Z', tokenName: 'RE-FUND-A', requestedUnits: '11.00', jurisdiction: 'Netherlands', investmentAmount: 1010000, whitelistAddress: '0x7182...0dAA', requestReference: 'SUB-PRI-2023-071', notes: 'Verified request.', kycTopicId: '0x66...922', accreditedTopicId: '0x97...4be', claims: { kyc: { title: 'KYC Verification', description: 'Completed.', status: 'verified', documents: [{ id: 'pri-kyc', name: 'Entity Verification', file: 'PRI_KYC.pdf', size: '850 KB' }] }, accredited: { title: 'Accredited Investor', description: 'Completed.', status: 'verified', documents: [{ id: 'pri-acc', name: 'Accredited Certification', file: 'PRI_Accredited.pdf', size: '610 KB' }] } }, activity: createBaseActivity('2023-10-17T12:00:00Z') },
  { id: 'sub-rhc', investorName: 'Redwood Horizon Capital', investorCode: '0x209...ffc1', legalEntityName: 'Redwood Horizon Capital', identityStatus: ISSUER_REQUEST_STATUS.PENDING_KYC, requestedDate: '2023-10-16T15:32:00Z', tokenName: 'RE-FUND-A', requestedUnits: '14.00', jurisdiction: 'Australia', investmentAmount: 1195000, whitelistAddress: '0xAA31...8810', requestReference: 'SUB-RHC-2023-067', notes: 'Pending final issuer review.', kycTopicId: '0x24...220', accreditedTopicId: '0x59...710', claims: { kyc: { title: 'KYC Verification', description: 'Pending.', status: 'pending', documents: [{ id: 'rhc-kyc', name: 'Entity Verification', file: 'RHC_KYC.pdf', size: '1.9 MB' }] }, accredited: { title: 'Accredited Investor', description: 'Verified.', status: 'verified', documents: [{ id: 'rhc-acc', name: 'Accredited Certification', file: 'RHC_Accredited.pdf', size: '590 KB' }] } }, activity: createBaseActivity('2023-10-16T15:32:00Z') },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const createInitialState = () => ({ requests: seedRequests.map((item) => clone(item)) });

const readState = () => {
  if (typeof window === 'undefined') return createInitialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialState();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch {
    return createInitialState();
  }
};

const writeState = (state) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const resolveIdentityStatus = (request) => {
  const statuses = [request.claims.kyc.status, request.claims.accredited.status];
  if (statuses.includes('rejected') || request.identityStatus === ISSUER_REQUEST_STATUS.REJECTED) {
    return ISSUER_REQUEST_STATUS.REJECTED;
  }
  if (request.identityStatus === ISSUER_REQUEST_STATUS.NEEDS_INFO) {
    return ISSUER_REQUEST_STATUS.NEEDS_INFO;
  }
  if (statuses.every((status) => status === 'verified')) return ISSUER_REQUEST_STATUS.VERIFIED;
  return ISSUER_REQUEST_STATUS.PENDING_KYC;
};

const updateRequest = (requestId, updater) => {
  const state = readState();
  const index = state.requests.findIndex((item) => item.id === requestId);
  if (index < 0) return null;
  const nextRequest = clone(state.requests[index]);
  updater(nextRequest);
  nextRequest.identityStatus = resolveIdentityStatus(nextRequest);
  state.requests[index] = nextRequest;
  writeState(state);
  return clone(nextRequest);
};

export async function listIssuerSubscriptionRequests() {
  const state = readState();
  return clone(state.requests).sort((a, b) => new Date(b.requestedDate) - new Date(a.requestedDate));
}

export async function getIssuerSubscriptionRequest(requestId) {
  const state = readState();
  const match = state.requests.find((item) => item.id === requestId);
  return match ? clone(match) : null;
}

export async function verifyIssuerClaim(requestId, claimKey) {
  const updated = updateRequest(requestId, (request) => {
    if (request.claims?.[claimKey]) {
      request.claims[claimKey].status = 'verified';
      request.activity.unshift({
        id: `${claimKey}-${Date.now()}`,
        label: `${request.claims[claimKey].title} verified`,
        note: 'The issuer operator confirmed the claim after reviewing the submitted documents.',
        at: new Date().toISOString(),
      });
    }
  });
  return updated;
}

export async function requestIssuerMoreInfo(requestId) {
  const updated = updateRequest(requestId, (request) => {
    request.identityStatus = ISSUER_REQUEST_STATUS.NEEDS_INFO;
    request.activity.unshift({
      id: `need-info-${Date.now()}`,
      label: 'More information requested',
      note: 'The issuer requested additional supporting information from the investor.',
      at: new Date().toISOString(),
    });
  });
  return updated;
}

export async function rejectIssuerSubscription(requestId) {
  const updated = updateRequest(requestId, (request) => {
    request.identityStatus = ISSUER_REQUEST_STATUS.REJECTED;
    request.activity.unshift({
      id: `rejected-${Date.now()}`,
      label: 'Subscription rejected',
      note: 'The issuer rejected the subscription request.',
      at: new Date().toISOString(),
    });
  });
  return updated;
}

export async function exportIssuerRequestsCsv() {
  const records = await listIssuerSubscriptionRequests();
  const header = ['Investor', 'Wallet', 'Identity Status', 'Date', 'Token', 'Amount', 'Jurisdiction'];
  const lines = records.map((request) => [
    request.investorName,
    request.investorCode,
    ISSUER_REQUEST_STATUS_META[request.identityStatus]?.label || request.identityStatus,
    request.requestedDate,
    request.tokenName,
    request.investmentAmount,
    request.jurisdiction,
  ]);
  return [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

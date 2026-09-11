const test = require('node:test');
const assert = require('node:assert/strict');
const schemas = require('../../src/schemas/investment.schema');
const { InvestorInvitationService } = require('../../src/services/investor-invitation.service');
const { investmentInvitationEmail } = require('../../src/services/common/email-template.service');

const issuer = { userUid: 'issuer-user', roleName: 'Issuer' };
const investorUser = { userUid: 'investor-user', roleName: 'Investor' };
const tokenUid = '02647af2-e585-4c03-8984-108e1e44c616';
const investorUid = '13a6332e-8909-4ced-9575-241dacc5c1d1';

const token = {
  tokenUid,
  organizationUid: 'org-1',
  tokenName: 'Acme Security Token',
  tokenSymbol: 'ACME',
  status: 'deployed',
  countryRestrictionMode: 'allowlist',
  organizationStatus: 'approved',
  organizationActive: true,
  legalCompanyName: 'Acme Holdings Ltd.',
  issuerFullName: 'Issuer Owner',
};

const investor = {
  investorUid,
  userUid: 'investor-user',
  fullName: 'Investor One',
  firstName: 'Investor',
  lastName: 'One',
  email: 'investor1@mail.com',
  countryUid: 'country-in',
  countryNumericCode: '356',
  countryListed: true,
  accreditationType: 'institutional',
  status: 'submitted',
  profileStatus: 'submitted',
  isActive: true,
};

const invitation = {
  invitationUid: 'invite-1', organizationUid: 'org-1', tokenUid, issuerUserUid: 'issuer-user',
  investorUid, investorUserUid: 'investor-user', status: 'PENDING', emailStatus: 'PENDING',
  emailAttempts: 0, createdAt: new Date(), updatedAt: new Date(),
};

const makeService = (overrides = {}) => {
  const state = { invitation: { ...invitation }, sent: 0 };
  const repository = {
    findIssuerTokenContext: async () => overrides.token || token,
    findCompletedInvestor: async () => overrides.investor || investor,
    findActiveInterest: async () => overrides.interest || null,
    createOrFindForUpdate: async () => ({
      row: { ...state.invitation, ...(overrides.existingInvitation || {}) },
      created: overrides.created === undefined ? true : overrides.created,
    }),
    claimEmail: async () => {
      state.invitation = { ...state.invitation, emailStatus: 'PROCESSING', emailAttempts: 1 };
      return state.invitation;
    },
    markEmailSent: async (uid, messageId) => {
      state.invitation = { ...state.invitation, invitationUid: uid, status: 'SENT', emailStatus: 'SENT', emailMessageId: messageId };
      return state.invitation;
    },
    markEmailFailed: async () => {},
    listCompletedInvestors: async () => ({ rows: [investor], total: 1 }),
    listForInvestor: async () => ({ rows: [
      { ...state.invitation, status: 'SENT', emailStatus: 'SENT', legalCompanyName: token.legalCompanyName, tokenName: token.tokenName },
    ], total: 1 }),
    findForInvestor: async () => ({ ...state.invitation, status: 'SENT', emailStatus: 'SENT', legalCompanyName: token.legalCompanyName }),
    markViewed: async () => ({ ...state.invitation, status: 'VIEWED', emailStatus: 'SENT', legalCompanyName: token.legalCompanyName }),
  };
  const service = new InvestorInvitationService({
    repository,
    investorRepository: { findByUserUid: async () => investor },
    investmentService: { getTokenDetails: async () => ({ tokenUid, tokenName: token.tokenName, requiredClaimTopics: [] }) },
    emailService: { sendEmail: async () => { state.sent += 1; return { messageId: 'smtp-1' }; } },
    transactionRunner: async (work) => work({}),
  });
  return { service, state };
};

test('invitation schemas require token context and validate inbox filters', () => {
  assert.equal(schemas.issuerInvestorsQuery.validate({ tokenUid }).error, undefined);
  assert.equal(schemas.createInvestorInvitation.validate({ tokenUid }).error, undefined);
  assert.ok(schemas.createInvestorInvitation.validate({}).error);
  assert.equal(schemas.investorInvitationsQuery.validate({ status: 'VIEWED' }).value.status, 'VIEWED');
});

test('issuer investor list exposes accreditationType as a top-level column', async () => {
  const { service } = makeService();
  const result = await service.listIssuerInvestors(issuer, { tokenUid, page: 1, limit: 5 });
  assert.equal(result.items[0].accreditationType, 'institutional');
  assert.equal(result.items[0].compliance.accreditationType, 'institutional');
});

test('issuer invite sends one email and transitions the same row to SENT', async () => {
  const { service, state } = makeService();
  const result = await service.invite(issuer, investorUid, { tokenUid });
  assert.equal(state.sent, 1);
  assert.equal(result.invitation.status, 'SENT');
  assert.equal(result.invitation.emailStatus, 'SENT');
  assert.equal(result.emailSent, true);
});

test('already sent invitation is idempotent and does not send email again', async () => {
  const { service, state } = makeService({
    created: false,
    existingInvitation: { status: 'SENT', emailStatus: 'SENT', sentAt: new Date() },
  });
  const result = await service.invite(issuer, investorUid, { tokenUid });
  assert.equal(state.sent, 0);
  assert.equal(result.alreadyExisted, true);
  assert.equal(result.emailSent, true);
});

test('issuer cannot invite investor excluded by token country allowlist', async () => {
  const { service, state } = makeService({ investor: { ...investor, countryListed: false } });
  await assert.rejects(
    service.invite(issuer, investorUid, { tokenUid }),
    (error) => error.code === 'INVESTOR_COUNTRY_NOT_ELIGIBLE' && error.statusCode === 409,
  );
  assert.equal(state.sent, 0);
});

test('investor inbox contains marketplace token and issuer context', async () => {
  const { service } = makeService();
  const result = await service.listInvestorInvitations(investorUser, { page: 1, limit: 20 });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].token.tokenUid, tokenUid);
  assert.equal(result.items[0].issuer.legalCompanyName, token.legalCompanyName);
  assert.match(result.items[0].marketplaceUrl, new RegExp(`${tokenUid}$`));
});

test('invitation email escapes user-controlled content and includes marketplace button URL', () => {
  const email = investmentInvitationEmail({
    investorName: '<Investor>', issuerName: 'Issuer', companyName: 'Acme & Co',
    tokenName: 'Acme Token', tokenSymbol: 'ACME', marketplaceUrl: `http://localhost:5173/app/marketplace/${tokenUid}`,
  });
  assert.match(email.html, /&lt;Investor&gt;/);
  assert.match(email.html, /Acme &amp; Co/);
  assert.match(email.html, new RegExp(tokenUid));
  assert.doesNotMatch(email.html, /<Investor>/);
});

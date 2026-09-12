const { PrivyClient } = require('@privy-io/node');
const { env } = require('../core/config/env');
const { ApiError } = require('../core/errors/api-error');

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeWalletAddress = (value) => String(value || '').trim().toLowerCase();

const readAccountValue = (account, camelCase, snakeCase) => (
  account?.[camelCase] ?? account?.[snakeCase]
);

class PrivyService {
  constructor() {
    this.client = new PrivyClient({
      appId: env.privy.appId,
      appSecret: env.privy.appSecret,
    });
  }

  async verifyIdentityToken(identityToken) {
    if (!identityToken) {
      throw ApiError.unauthorized('Privy verification is required.');
    }

    let privyUser;
    try {
      // Privy verifies the ES256 identity-token signature, issuer, audience and expiry,
      // then returns the authenticated user with linked accounts.
      privyUser = await this.client.users().get({ id_token: identityToken });
    } catch (_error) {
      throw ApiError.unauthorized('Privy verification is invalid or has expired.');
    }

    const linkedAccounts = privyUser?.linked_accounts || privyUser?.linkedAccounts || [];
    const emailAccount = linkedAccounts.find((account) => account?.type === 'email');
    const embeddedWallet = linkedAccounts.find((account) => {
      if (account?.type !== 'wallet') return false;
      const chainType = readAccountValue(account, 'chainType', 'chain_type');
      const walletClientType = readAccountValue(account, 'walletClientType', 'wallet_client_type')
        || account?.walletClient;
      return chainType === 'ethereum' && walletClientType === 'privy';
    });

    const email = normalizeEmail(emailAccount?.address || privyUser?.email?.address);
    const walletAddress = normalizeWalletAddress(embeddedWallet?.address);
    const walletId = embeddedWallet?.id || null;

    if (!privyUser?.id || !email) {
      throw ApiError.unauthorized('Privy did not return a verified email identity.');
    }
    if (!/^0x[a-f0-9]{40}$/.test(walletAddress)) {
      throw ApiError.badRequest('A Privy embedded EVM wallet must be created before continuing.');
    }

    return {
      privyUserId: privyUser.id,
      email,
      privyWalletId: walletId,
      privyWalletAddress: walletAddress,
    };
  }
}

module.exports = { PrivyService, normalizeEmail, normalizeWalletAddress };

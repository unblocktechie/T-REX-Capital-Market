const test = require('node:test');
const assert = require('node:assert/strict');
const { PaymentTokenRegistryService } = require('../../src/services/blockchain/payment-token-registry.service');

const CONTROLLER = '0x4052D80c222111234b89AFDfff597B5De8DA50cd';
const USDT = '0x86B14D29A59b745bF08c42661322d13142d5eb49';
const USDC = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
const DATABASE_ONLY = '0x1111111111111111111111111111111111111111';

const token = (contractAddress, symbol) => ({ contractAddress, symbol });

test('returns only active database tokens also enabled by Platform Controller paymentTokens()', async () => {
  let requestedAction;
  const service = new PaymentTokenRegistryService({
    paymentTokenRepository: {
      listActive: async (_chainId, action) => {
        requestedAction = action;
        return [token(USDT, 'USDT'), token(USDC, 'USDC'), token(DATABASE_ONLY, 'DB')];
      },
    },
    config: {
      chainId: 11155111,
      sepoliaRpcUrl: 'rpc',
      sepoliaFallbackRpcUrls: [],
      platformControllerAddress: CONTROLLER,
    },
    dependencies: {
      providerFactory: () => ({
        getNetwork: async () => ({ chainId: 11155111n }),
        destroy: () => {},
      }),
      contractFactory: () => ({ paymentTokens: async () => [USDC, USDT] }),
    },
  });

  const result = await service.listEnabled(11155111, 'PURCHASE');
  assert.equal(requestedAction, 'PURCHASE');
  assert.deepEqual(result.map((item) => item.symbol), ['USDT', 'USDC']);
});

test('fails closed when the Platform Controller allowlist cannot be read', async () => {
  const service = new PaymentTokenRegistryService({
    paymentTokenRepository: { listActive: async () => [token(USDT, 'USDT')] },
    config: {
      chainId: 11155111,
      sepoliaRpcUrl: 'rpc',
      sepoliaFallbackRpcUrls: [],
      platformControllerAddress: CONTROLLER,
    },
    dependencies: {
      providerFactory: () => ({
        getNetwork: async () => ({ chainId: 11155111n }),
        destroy: () => {},
      }),
      contractFactory: () => ({ paymentTokens: async () => { throw new Error('RPC failure'); } }),
    },
  });

  await assert.rejects(service.listEnabled(), (error) => (
    error.statusCode === 503 && error.code === 'PAYMENT_TOKEN_REGISTRY_UNAVAILABLE'
  ));
});

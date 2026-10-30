import { web3Config } from '@/config/web3';

const fallbackName = (value, fallback) => String(value || '').trim() || fallback;

export const getTokenIssuanceNetworkNames = ({
  assetChainUid,
  assetChainId,
  assetNetworkName,
  appChainUid,
  appChainId,
  appNetworkName,
} = {}) => {
  const assetRecord =
    web3Config.getChainRecordByUid(assetChainUid) ||
    web3Config.getChainRecordById(assetChainId);
  const appRecord =
    web3Config.getChainRecordByUid(appChainUid) ||
    web3Config.getChainRecordById(appChainId);

  return {
    assetNetworkName: fallbackName(
      assetNetworkName || assetRecord?.chainName,
      'the asset network',
    ),
    appNetworkName: fallbackName(
      appNetworkName || appRecord?.chainName,
      'the network selected in the navbar',
    ),
  };
};

export const buildTokenIssuanceNetworkMismatchMessage = ({
  assetNetworkName,
  appNetworkName,
} = {}) =>
  `This asset is set to ${fallbackName(assetNetworkName, 'the asset network')}, while the application is currently using ${fallbackName(appNetworkName, 'the network selected in the navbar')}. You can change either the Asset Type network in Step 1 or the network selected in the navbar—choose whichever works best for you.`;

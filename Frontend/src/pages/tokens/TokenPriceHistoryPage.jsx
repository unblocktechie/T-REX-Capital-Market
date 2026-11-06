import { Navigate, useParams } from 'react-router-dom';
import { useMyToken, getTokenRecordChainUid, getTokenRecordName } from '@/hooks/useMyToken';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ROUTES } from '@/config/routes';
import { web3Config } from '@/config/web3';
import { paymentContextOf } from '@/config/payment-tokens';
import { usePaymentTokenMetadata } from '@/hooks/usePaymentTokenMetadata';
import { IssuerPriceHistory } from '@/components/price-history/IssuerPriceHistory';
import { PriceHistoryGraph } from '@/components/price-history/PriceHistoryGraph';
import { Skeleton } from '@/components/ui/Skeleton';

export default function TokenPriceHistoryPage() {
  const { tokenAddress: tokenId } = useParams();
  const token = useMyToken();
  useDocumentTitle('Full Price History');
  const record = token.token || {};
  const chainId = record.chainId || record.deployment?.chainId;
  const chainUid = getTokenRecordChainUid(record) || web3Config.getChainRecordById(chainId)?.chainUid || token.selectedChainUid;
  const currentUid = token.tokenUid || tokenId;
  const name = getTokenRecordName(record) || 'Investment Asset';
  const context = paymentContextOf(record, record.supplyPricing);
  const tokenMetadata = usePaymentTokenMetadata({
    paymentTokenAddress: context.paymentTokenAddress,
    paymentTokenSymbol: context.paymentTokenSymbol || record.supplyPricing?.currency,
    chainUid, chainId, enabled: Boolean(chainUid || chainId),
  });
  const symbol = tokenMetadata.symbol || context.paymentTokenSymbol || record.supplyPricing?.currency || '';
  if (token.isPending) return <div className="price-history-full-page"><Skeleton height={120} /><Skeleton height={320} /><Skeleton height={380} /></div>;
  if (!token.hasToken) return <Navigate to={ROUTES.createToken} replace />;
  if (token.tokenUid && tokenId !== token.tokenUid) return <Navigate to={ROUTES.tokenPriceHistory(token.tokenUid)} replace />;
  const props = {
    userKey: token.userKey, chainUid, selectedChainUid: token.selectedChainUid,
    tokenUid: currentUid, symbol, tokenName: tokenMetadata.name, imageUrl: tokenMetadata.imageUrl, chainId,
  };
  return <main className="price-history-full-page">
    <header className="price-history-full-page__heading">
      <span className="eyebrow">Investment asset · {name}</span>
      <h1>Full Price History</h1>
      <p>Review recorded price movements and every saved price-update entry. Charts show applied database updates and confirmed blockchain updates only.</p>
    </header>
    <PriceHistoryGraph {...props} />
    <IssuerPriceHistory {...props} />
  </main>;
}

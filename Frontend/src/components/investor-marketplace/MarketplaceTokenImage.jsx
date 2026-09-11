import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { investorMarketplaceService } from '@/services/investor/investorMarketplaceService';
import { cn } from '@/utils/cn';

/**
 * Resolves the token image through the existing authenticated marketplace image API.
 * A storage key is treated only as an availability signal; it is never exposed as a public URL.
 */
export function useMarketplaceTokenImageUrl(token) {
  const [objectUrl, setObjectUrl] = useState('');
  const nestedToken = token?.token || token?.tokenSummary || {};
  const tokenUid = token?.id || token?.tokenUid || nestedToken?.id || nestedToken?.tokenUid || '';
  const storageKey = token?.imageStorageKey || nestedToken?.imageStorageKey || '';
  const directImageUrl = token?.imageUrl || nestedToken?.imageUrl || '';
  const canLoadImage = Boolean(
    tokenUid && (token?.hasImage || nestedToken?.hasImage || storageKey || directImageUrl),
  );

  useEffect(() => {
    if (!canLoadImage) {
      setObjectUrl('');
      return undefined;
    }

    const controller = new AbortController();
    let nextUrl = '';

    investorMarketplaceService
      .getTokenImageBlob(tokenUid, controller.signal, directImageUrl)
      .then((blob) => {
        if (!blob || controller.signal.aborted) return;
        nextUrl = URL.createObjectURL(blob);
        setObjectUrl(nextUrl);
      })
      .catch((error) => {
        if (error?.name !== 'CanceledError' && error?.code !== 'ERR_CANCELED') {
          setObjectUrl('');
        }
      });

    return () => {
      controller.abort();
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [canLoadImage, tokenUid, storageKey, directImageUrl]);

  const directUrlCanRenderWithoutAuth = /^(?:https?:|blob:|data:)/i.test(directImageUrl);
  return objectUrl || (directUrlCanRenderWithoutAuth ? directImageUrl : '');
}

export function MarketplaceTokenImage({ token, className, size = 'md' }) {
  const imageUrl = useMarketplaceTokenImageUrl(token);

  return (
    <span className={cn('marketplace-token-image', `marketplace-token-image--${size}`, className)}>
      {imageUrl ? (
        <img src={imageUrl} alt={`${token?.symbol || token?.name || 'Token'} logo`} />
      ) : (
        <ShieldCheck size={size === 'sm' ? 16 : 18} aria-hidden="true" />
      )}
    </span>
  );
}

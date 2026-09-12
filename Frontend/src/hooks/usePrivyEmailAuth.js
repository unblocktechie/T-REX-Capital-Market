import {
  getIdentityToken,
  useCreateWallet,
  useLoginWithEmail,
  usePrivy,
  useUser,
} from '@privy-io/react-auth';
import { useCallback, useRef, useState } from 'react';
import { isRateLimitError, isTransientError, retryAsync, wait } from '@/utils/retry';

const PRIVY_RETRY_OPTIONS = Object.freeze({
  maxAttempts: 4,
  baseDelayMs: 850,
  maxDelayMs: 8_000,
});

const WALLET_PROPAGATION_DELAYS = [450, 900, 1_500, 2_400];

const decodeJwtPayload = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const bytes = Uint8Array.from(window.atob(padded), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
};

const linkedAccountsFromIdentityToken = (identityToken) => {
  const payload = decodeJwtPayload(identityToken);
  const accounts = payload?.linked_accounts;
  if (Array.isArray(accounts)) return accounts;
  if (typeof accounts !== 'string') return [];
  try {
    const parsed = JSON.parse(accounts);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const isPrivyEthereumWallet = (account) => {
  const chainType = account?.chainType ?? account?.chain_type;
  const walletClientType =
    account?.walletClientType ?? account?.wallet_client_type ?? account?.walletClient;
  return account?.type === 'wallet' && chainType === 'ethereum' && walletClientType === 'privy';
};

const walletAlreadyExists = (error) =>
  /already (?:has|have|exists|created)|wallet already|embedded wallet exists/i.test(
    [error?.message, error?.shortMessage, error?.details].filter(Boolean).join(' '),
  );

const withFriendlyPrivyError = (error, fallback) => {
  if (!error || typeof error !== 'object') return error;

  if (error?.code === 'PRIVY_IDENTITY_TOKEN_NOT_READY') {
    error.userMessage =
      'Privy is still preparing your secure account. Your progress is saved. Please try again in a moment.';
  } else if (isRateLimitError(error)) {
    error.userMessage =
      'Privy is temporarily busy. We retried automatically, but the service still needs a moment. Your progress is saved.';
  } else if (isTransientError(error)) {
    error.userMessage =
      'Privy is temporarily unavailable. Your progress is saved. Please try again in a moment.';
  } else if (!error.message && fallback) {
    error.userMessage = fallback;
  }

  return error;
};

const singleFlight = (ref, key, operation) => {
  if (ref.current?.key === key && ref.current?.promise) return ref.current.promise;

  const promise = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (ref.current?.promise === promise) ref.current = null;
    });
  ref.current = { key, promise };
  return promise;
};

const retryMessage = (phase, nextAttempt, maxAttempts, delayMs) => {
  const seconds = Math.max(1, Math.ceil(delayMs / 1000));
  const action =
    phase === 'email'
      ? 'sending the verification code'
      : phase === 'login'
        ? 'verifying your code'
        : phase === 'wallet'
          ? 'preparing your secure account'
          : 'linking your secure account';

  return `Privy is temporarily busy while ${action}. Retrying automatically in ${seconds}s (${nextAttempt}/${maxAttempts}).`;
};

export function usePrivyEmailAuth() {
  const { authenticated, logout } = usePrivy();
  const { refreshUser } = useUser();
  const { createWallet } = useCreateWallet();
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const [recoveryState, setRecoveryState] = useState({ active: false, message: '' });
  const beginFlightRef = useRef(null);
  const verifyFlightRef = useRef(null);
  const walletFlightRef = useRef(null);

  const clearRecoveryState = useCallback(() => {
    setRecoveryState({ active: false, message: '' });
  }, []);

  const runWithRecovery = useCallback(async (phase, operation, options = {}) => {
    return retryAsync(operation, {
      ...PRIVY_RETRY_OPTIONS,
      ...options,
      onRetry: ({ nextAttempt, maxAttempts, delayMs }) => {
        setRecoveryState({
          active: true,
          message: retryMessage(phase, nextAttempt, maxAttempts, delayMs),
        });
      },
    });
  }, []);

  const readIdentityToken = useCallback(
    () =>
      runWithRecovery(
        'identity',
        async () => {
          const identityToken = await getIdentityToken();
          if (identityToken) return identityToken;

          const error = new Error('Privy identity token is not ready yet.');
          error.code = 'PRIVY_IDENTITY_TOKEN_NOT_READY';
          throw error;
        },
        {
          shouldRetry: (error) =>
            error?.code === 'PRIVY_IDENTITY_TOKEN_NOT_READY' || isTransientError(error),
        },
      ),
    [runWithRecovery],
  );

  const beginEmailVerification = useCallback(
    (rawEmail) => {
      const email = String(rawEmail || '').trim().toLowerCase();
      if (!email) return Promise.reject(new Error('Enter an email address to continue.'));

      return singleFlight(beginFlightRef, email, async () => {
        try {
          // A stale Privy session must never be reused for a new authentication challenge.
          if (authenticated) {
            await runWithRecovery('identity', () => logout(), {
              shouldRetry: isTransientError,
            });
          }

          await runWithRecovery('email', () => sendCode({ email }), {
            // Sending an OTP is stateful. A 429 is safe to retry because Privy rejected
            // the attempt before sending; ambiguous network failures are left to the user.
            shouldRetry: isRateLimitError,
          });
          clearRecoveryState();
        } catch (error) {
          clearRecoveryState();
          throw withFriendlyPrivyError(error, 'Privy could not send the verification code.');
        }
      });
    },
    [authenticated, clearRecoveryState, logout, runWithRecovery, sendCode],
  );

  const ensureIdentityTokenWithWallet = useCallback(
    () =>
      singleFlight(walletFlightRef, 'wallet', async () => {
        let createWalletError = null;
        try {
          let identityToken = await readIdentityToken();
          let linkedAccounts = linkedAccountsFromIdentityToken(identityToken);
          let wallet = linkedAccounts.find(isPrivyEthereumWallet);

          if (wallet?.address) {
            clearRecoveryState();
            return { identityToken, walletAddress: wallet.address, walletId: wallet.id || null };
          }

          try {
            await runWithRecovery('wallet', () => createWallet(), {
              // Wallet creation is stateful. Only a confirmed rate-limit rejection is
              // retried automatically; a network failure may still have created it.
              shouldRetry: isRateLimitError,
            });
          } catch (error) {
            const alreadyExists = walletAlreadyExists(error);
            if (!alreadyExists && !isTransientError(error)) throw error;
            createWalletError = alreadyExists ? null : error;
          }

          // Privy can take a short moment to expose a newly-created wallet in the
          // identity token. Wait before the first re-check, refresh the user only if
          // propagation is still pending, and never call createWallet a second time here.
          // This avoids the request bursts that can trigger Privy rate limits.
          let userRefreshed = false;
          for (let index = 0; index < WALLET_PROPAGATION_DELAYS.length; index += 1) {
            setRecoveryState({
              active: true,
              message: 'Your secure account is ready. Privy is finishing the secure link to T-REX…',
            });
            await wait(WALLET_PROPAGATION_DELAYS[index]);

            identityToken = await readIdentityToken();
            linkedAccounts = linkedAccountsFromIdentityToken(identityToken);
            wallet = linkedAccounts.find(isPrivyEthereumWallet);
            if (wallet?.address) {
              clearRecoveryState();
              return { identityToken, walletAddress: wallet.address, walletId: wallet.id || null };
            }

            if (!userRefreshed) {
              userRefreshed = true;
              try {
                await runWithRecovery('identity', () => refreshUser(), {
                  maxAttempts: 2,
                  shouldRetry: isTransientError,
                });
              } catch (error) {
                if (!isTransientError(error)) throw error;
              }
            }
          }

          if (createWalletError) throw createWalletError;
          throw new Error('Privy could not finish preparing your secure account.');
        } catch (error) {
          clearRecoveryState();
          throw withFriendlyPrivyError(
            error,
            'Privy could not finish preparing your secure account.',
          );
        }
      }),
    [clearRecoveryState, createWallet, readIdentityToken, refreshUser, runWithRecovery],
  );

  const verifyEmailCode = useCallback(
    (rawCode) => {
      const code = String(rawCode || '').trim();
      if (!code) return Promise.reject(new Error('Enter the verification code to continue.'));

      return singleFlight(verifyFlightRef, code, async () => {
        try {
          await runWithRecovery('login', () => loginWithCode({ code }), {
            // OTP verification is also stateful; only retry explicit rate limiting.
            shouldRetry: isRateLimitError,
          });
        } catch (error) {
          clearRecoveryState();
          throw withFriendlyPrivyError(error, 'Privy could not verify the email code.');
        }

        try {
          return await ensureIdentityTokenWithWallet();
        } catch (error) {
          // The OTP has already succeeded. Mark this so the UI can resume wallet/backend
          // setup without consuming or requesting another OTP.
          const recoverableError =
            error && typeof error === 'object' ? error : new Error(String(error || 'Secure account setup could not be completed.'));
          recoverableError.privyAuthenticated = true;
          recoverableError.recoveryStage = 'wallet';
          throw recoverableError;
        } finally {
          clearRecoveryState();
        }
      });
    },
    [clearRecoveryState, ensureIdentityTokenWithWallet, loginWithCode, runWithRecovery],
  );

  return {
    beginEmailVerification,
    verifyEmailCode,
    ensureIdentityTokenWithWallet,
    privyAuthenticated: authenticated,
    recoveryState,
    clearRecoveryState,
    otpState: state,
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Filter, MailPlus, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';
import { CompactAddress } from '@/components/common/CompactAddress';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { DataTable } from '@/components/tables/DataTable';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getTokenRecordName, getTokenRecordSymbol, useMyToken } from '@/hooks/useMyToken';
import { issuerInvestorInvitationService } from '@/services/issuer/issuerInvestorInvitationService';
import { getErrorMessage } from '@/utils/error';

const PAGE_SIZE = 5;

const INVITATION_FILTERS = [
  { value: 'all', label: 'All investors', description: 'Show every completed investor profile' },
  { value: 'notInvited', label: 'Not invited', description: 'Investors who have not received this token invitation' },
  { value: 'PENDING', label: 'Pending', description: 'Invitation delivery is pending or needs retry' },
  { value: 'SENT', label: 'Sent', description: 'Invitation email was delivered successfully' },
  { value: 'VIEWED', label: 'Viewed', description: 'Investor opened the invitation' },
];

const inviteAction = (investor, busy) => {
  const invitation = investor?.invitation || {};
  const status = String(invitation?.status || '').toUpperCase();
  const emailStatus = String(invitation?.emailStatus || '').toUpperCase();
  const delivered = status === 'SENT' || status === 'VIEWED';
  const processing = invitation?.processing || emailStatus === 'PROCESSING';
  const retry = emailStatus === 'FAILED';

  if (busy || processing) return { label: processing ? 'Sending…' : 'Inviting…', disabled: true, retry: false };
  if (delivered) return { label: status === 'VIEWED' ? 'Viewed' : 'Invited', disabled: true, retry: false };
  if (retry) return { label: 'Retry Invite', disabled: false, retry: true };
  return {
    label: 'Invite Investor',
    disabled: !investor?.eligibleForInvitation,
    retry: false,
  };
};

export default function IssuerInvestorDirectoryPage() {
  useDocumentTitle('Investors');
  const tokenRecord = useMyToken();
  const tokenUid = tokenRecord.tokenUid;
  const tokenName = getTokenRecordName(tokenRecord.token) || 'Created token';
  const tokenSymbol = getTokenRecordSymbol(tokenRecord.token);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviting, setInviting] = useState(() => new Set());
  const invitingRef = useRef(new Set());

  const canLoad = Boolean(tokenUid && tokenRecord.isDeployed);

  const load = useCallback(async ({ quiet = false, signal } = {}) => {
    if (!canLoad) {
      setRows([]);
      setMeta({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
      setLoading(false);
      setRefreshing(false);
      return;
    }

    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const result = await issuerInvestorInvitationService.listInvestors({
        tokenUid,
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        invitationStatus: status,
        signal,
      });
      setRows(result.items || []);
      setMeta(result.meta || { page, limit: PAGE_SIZE, total: result.items?.length || 0, totalPages: 1 });
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      setRows([]);
      toast.error(getErrorMessage(error, 'Unable to load investors.'));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [canLoad, debouncedSearch, page, status, tokenUid]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, tokenUid]);

  useEffect(() => {
    if (page > meta.totalPages) setPage(meta.totalPages);
  }, [meta.totalPages, page]);

  const handleInvite = useCallback(async (investor) => {
    const investorUid = investor?.investorUid;
    if (!investorUid || !tokenUid || invitingRef.current.has(investorUid)) return;

    invitingRef.current.add(investorUid);
    setInviting((current) => new Set(current).add(investorUid));
    try {
      const result = await issuerInvestorInvitationService.inviteInvestor(investorUid, tokenUid);
      const nextInvitation = result.invitation;
      const invitationStatus = String(nextInvitation?.status || '').toUpperCase();
      const emailStatus = String(nextInvitation?.emailStatus || '').toUpperCase();
      const invitationFinished = result?.alreadyExisted || invitationStatus === 'SENT' || invitationStatus === 'VIEWED' || emailStatus === 'SENT';
      setRows((current) => current.map((row) => (
        row.investorUid === investorUid
          ? {
              ...row,
              invitation: nextInvitation,
              eligibleForInvitation: invitationFinished ? false : row.eligibleForInvitation,
            }
          : row
      )));

      if (result?.processing || nextInvitation?.processing) {
        toast.info('Invitation delivery is already in progress.');
      } else if (nextInvitation?.emailStatus === 'FAILED') {
        toast.error('The invitation email could not be delivered. You can retry this investor.');
      } else if (result?.alreadyExisted) {
        toast.success('This investor has already been invited.');
      } else {
        toast.success('Investor invitation sent.');
      }
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to send the investor invitation.'));
      const errorCode = String(error?.response?.data?.code || error?.response?.data?.error?.code || '').toUpperCase();
      if (errorCode === 'INVITATION_EMAIL_FAILED') await load({ quiet: true }).catch(() => {});
    } finally {
      invitingRef.current.delete(investorUid);
      setInviting((current) => {
        const next = new Set(current);
        next.delete(investorUid);
        return next;
      });
    }
  }, [load, tokenUid]);

  const columns = useMemo(() => [
    {
      key: 'name',
      header: 'Investor',
      render: (_value, investor) => (
        <div className="issuer-investor-cell invitation-investor-identity">
          <div className="issuer-avatar">{String(investor.name || 'I').slice(0, 1).toUpperCase()}</div>
          <div>
            <strong>{investor.name || 'Investor'}</strong>
            <small>{investor.email || 'Completed investor profile'}</small>
          </div>
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (_value, investor) => (
        <div className="invitation-directory-stack">
          <strong>{investor.country || '—'}</strong>
          <small>{investor.city || investor.countryCode || 'Investor location'}</small>
        </div>
      ),
    },
    {
      key: 'walletAddress',
      header: 'Wallet',
      render: (value) => value ? <CompactAddress value={value} label="Investor wallet" leading={6} trailing={4} /> : '—',
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'end',
      render: (_value, investor) => {
        if (!investor?.eligibleForInvitation) {
          return <span className="invitation-directory-unavailable" aria-label="Invitation unavailable">—</span>;
        }

        const action = inviteAction(investor, inviting.has(investor.investorUid));
        return (
          <div className="invitation-directory-action">
            <Button
              variant={action.retry ? 'secondary' : 'primary'}
              size="sm"
              icon={MailPlus}
              loading={inviting.has(investor.investorUid)}
              disabled={action.disabled}
              onClick={() => handleInvite(investor)}
              title={action.label}
            >
              {action.label}
            </Button>
          </div>
        );
      },
    },
  ], [handleInvite, inviting]);

  const currentPage = Math.min(Math.max(meta.page || page, 1), Math.max(meta.totalPages || 1, 1));
  const start = meta.total ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const end = meta.total ? Math.min(currentPage * PAGE_SIZE, meta.total) : 0;

  return (
    <div className="page-stack issuer-investor-directory-page">
      <header className="issuer-page-header issuer-investor-directory-header">
        <div>
          <span className="issuer-redemptions-eyebrow">Investor &amp; invitation management</span>
          <h1>Investors</h1>
          <p>Find verified investors who may be eligible for your token and invite them to review the offering.</p>
        </div>
        <Button
          variant="secondary"
          icon={RefreshCw}
          loading={refreshing}
          disabled={!canLoad || tokenRecord.isLoading}
          onClick={() => load({ quiet: true })}
        >
          Refresh
        </Button>
      </header>

      {!tokenRecord.isLoading && !canLoad ? (
        <Card className="issuer-investor-directory-empty">
          <EmptyState
            title={tokenRecord.hasToken ? 'Finish creating your token to invite investors' : 'Create a token before inviting investors'}
            description="Investor invitations are available once your approved organization has a successfully created token."
          />
        </Card>
      ) : (
        <>
          <Card className="issuer-investor-directory-toolbar-card">
            <div className="issuer-investor-directory-toolbar">
              <Input
                aria-label="Search investors"
                placeholder="Search investor name, email or profile"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                leading={Search}
              />
              <MarketplaceDropdown
                value={status}
                options={INVITATION_FILTERS}
                onChange={setStatus}
                icon={Filter}
                ariaLabel="Filter investors by invitation status"
                align="end"
                className="issuer-investor-directory-filter"
                menuClassName="issuer-investor-directory-filter-menu"
                portal
              />
            </div>
            <div className="issuer-investor-directory-toolbar__summary">
              <span>
                Showing <strong>{start}{end > start ? `–${end}` : ''}</strong> of {meta.total} investor{meta.total === 1 ? '' : 's'}
              </span>
              <span className="issuer-investor-directory-token">
                Invitations are for <strong>{tokenName}{tokenSymbol ? ` (${tokenSymbol})` : ''}</strong>
              </span>
            </div>
          </Card>

          <Card className="issuer-table-card common-table-card issuer-investor-directory-table-card">
            <DataTable
              columns={columns}
              rows={rows}
              loading={loading || tokenRecord.isLoading}
              rowKey={(row, index) => row.investorUid || `investor-${index}`}
              loadingRows={5}
              emptyTitle={search.trim() || status !== 'all' ? 'No matching investors' : 'No investors available'}
              emptyDescription={search.trim() || status !== 'all' ? 'Try changing your search or invitation filter.' : 'Completed investor profiles will appear here when they are available for this token.'}
            />
            {!loading && meta.totalPages > 1 ? (
              <div className="issuer-investor-directory-pagination">
                <InvestorHistoryPagination
                  page={currentPage}
                  totalPages={meta.totalPages}
                  onPageChange={setPage}
                  disabled={loading}
                  itemLabel="investors"
                />
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, MailOpen, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { InvestorHistoryPagination } from '@/components/investor-marketplace/InvestorHistoryPagination';
import { MarketplaceDropdown } from '@/components/investor-marketplace/MarketplaceDropdown';
import { MarketplaceTokenImage } from '@/components/investor-marketplace/MarketplaceTokenImage';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { ROUTES } from '@/config/routes';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { investorInvitationService } from '@/services/investor/investorInvitationService';
import { formatDate } from '@/utils/date';
import { getErrorMessage } from '@/utils/error';

const PAGE_SIZE = 10;

const INVITATION_FILTERS = [
  { value: 'all', label: 'All invitations', description: 'Show new and previously viewed invitations' },
  { value: 'SENT', label: 'New invitations', description: 'Invitations you have not opened yet' },
  { value: 'VIEWED', label: 'Viewed', description: 'Invitations you have already opened' },
];

const invitationDate = (invitation) => invitation?.sentAt || invitation?.createdAt || invitation?.updatedAt;

export default function InvitationsPage() {
  useDocumentTitle('Invitations');
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 350);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingUid, setOpeningUid] = useState('');
  const openingRef = useRef(false);

  const load = useCallback(async ({ quiet = false, signal } = {}) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const result = await investorInvitationService.listInvitations({
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch,
        status,
        signal,
      });
      setItems(result.items || []);
      setMeta(result.meta || { page, limit: PAGE_SIZE, total: result.items?.length || 0, totalPages: 1 });
    } catch (error) {
      if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
      setItems([]);
      toast.error(getErrorMessage(error, 'Unable to load invitations.'));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedSearch, page, status]);

  useEffect(() => {
    const controller = new AbortController();
    load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status]);

  useEffect(() => {
    if (page > meta.totalPages) setPage(meta.totalPages);
  }, [meta.totalPages, page]);

  const openInvitation = useCallback((invitation) => {
    const invitationUid = invitation?.invitationUid;
    const tokenUid = invitation?.tokenUid || invitation?.token?.tokenUid || invitation?.token?.id;
    if (!invitationUid || !tokenUid || openingRef.current) return;

    openingRef.current = true;
    setOpeningUid(invitationUid);

    if (String(invitation.status || '').toUpperCase() !== 'VIEWED') {
      investorInvitationService.markViewed(invitationUid).catch((error) => {
        toast.warning(getErrorMessage(error, 'The invitation could not be marked as viewed.'));
      });
    }

    navigate(ROUTES.marketplaceToken(tokenUid));
  }, [navigate]);

  const currentPage = Math.min(Math.max(meta.page || page, 1), Math.max(meta.totalPages || 1, 1));
  const start = meta.total ? ((currentPage - 1) * PAGE_SIZE) + 1 : 0;
  const end = meta.total ? Math.min(currentPage * PAGE_SIZE, meta.total) : 0;
  const newCount = useMemo(() => items.filter((item) => String(item.status || '').toUpperCase() === 'SENT').length, [items]);

  return (
    <div className="page-stack investor-invitations-page">
      <header className="marketplace-page-header investor-invitations-header">
        <div>
          <span className="eyebrow">Investor invitations</span>
          <h1>Invitations</h1>
          <p>Review invitations from issuers and open the corresponding token offering when you are ready to learn more.</p>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => load({ quiet: true })}>Refresh</Button>
      </header>

      <Card className="investor-invitations-toolbar-card">
        <div className="investor-invitations-toolbar">
          <Input
            aria-label="Search invitations"
            placeholder="Search token, symbol or issuer company"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            leading={Search}
          />
          <MarketplaceDropdown
            value={status}
            options={INVITATION_FILTERS}
            onChange={setStatus}
            icon={SlidersHorizontal}
            ariaLabel="Filter invitations by status"
            align="end"
            className="investor-invitations-filter"
            menuClassName="investor-invitations-filter-menu"
            portal
          />
        </div>
        <div className="investor-invitations-toolbar__summary">
          <span>Showing <strong>{start}{end > start ? `–${end}` : ''}</strong> of {meta.total} invitation{meta.total === 1 ? '' : 's'}</span>
          <span>{newCount > 0 ? `${newCount} new on this page` : 'Opened invitations remain available for reference.'}</span>
        </div>
      </Card>

      <Card className="investor-invitations-list-card">
        {loading ? (
          <div className="investor-invitations-skeleton-list" aria-label="Loading invitations">
            {Array.from({ length: 4 }, (_, index) => <div className="investor-invitation-skeleton" key={index} />)}
          </div>
        ) : items.length ? (
          <div className="investor-invitations-list" role="list">
            {items.map((invitation) => {
              const isNew = String(invitation.status || '').toUpperCase() === 'SENT';
              const isOpening = openingUid === invitation.invitationUid;
              const token = invitation.token || {};
              return (
                <button
                  key={invitation.invitationUid || invitation.tokenUid}
                  type="button"
                  role="listitem"
                  className={`investor-invitation-row${isNew ? ' is-new' : ''}`}
                  onClick={() => openInvitation(invitation)}
                  disabled={Boolean(openingUid) || !invitation.invitationUid || !invitation.tokenUid}
                  aria-label={`Open invitation for ${token.name || 'token offering'}`}
                >
                  <MarketplaceTokenImage token={token} size="sm" className="investor-invitation-row__image" />
                  <span className="investor-invitation-row__content">
                    <span className="investor-invitation-row__title-line">
                      <strong>{token.name || 'Token offering'}{token.symbol ? ` (${token.symbol})` : ''}</strong>
                      <AppStatusBadge
                        status={invitation.status}
                        label={isNew ? 'New' : 'Viewed'}
                        tone={isNew ? 'pending' : 'neutral'}
                        compact
                      />
                    </span>
                    <span className="investor-invitation-row__issuer">Invited by {invitation.companyName || 'Issuer'}</span>
                    <span className="investor-invitation-row__meta">
                      <span>{invitationDate(invitation) ? `Received ${formatDate(invitationDate(invitation), 'MMM DD, YYYY · hh:mm A')}` : 'Invitation received'}</span>
                      {token.assetClass ? <span>{token.assetClass}</span> : null}
                    </span>
                  </span>
                  <span className="investor-invitation-row__action" aria-hidden="true">
                    {isOpening ? <span className="investor-invitation-row__opening">Opening…</span> : <><span>View token</span><ArrowRight size={17} /></>}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title={search.trim() || status !== 'all' ? 'No matching invitations' : 'No invitations yet'}
            description={search.trim() || status !== 'all' ? 'Try changing your search or invitation filter.' : 'Invitations from issuers will appear here after they are successfully delivered.'}
          />
        )}

        {!loading && meta.totalPages > 1 ? (
          <div className="investor-invitations-pagination">
            <InvestorHistoryPagination
              page={currentPage}
              totalPages={meta.totalPages}
              onPageChange={setPage}
              disabled={Boolean(openingUid)}
              itemLabel="invitations"
            />
          </div>
        ) : null}
      </Card>

      <div className="investor-invitations-help-note">
        <MailOpen size={16} aria-hidden="true" />
        <span>Opening an invitation only takes you to the token details. It does not submit an investment request or perform a blockchain transaction.</span>
      </div>
    </div>
  );
}

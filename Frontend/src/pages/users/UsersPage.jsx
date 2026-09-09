import { useQuery } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usersApi } from '@/api/users/users.api';
import { Pagination } from '@/components/pagination/Pagination';
import { DataTable } from '@/components/tables/DataTable';
import { AppStatusBadge } from '@/components/common/AppStatusBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const toneForStatus = (status) =>
  ({ Active: 'success', Invited: 'neutral', Suspended: 'danger' })[status] || 'neutral';

export default function UsersPage() {
  useDocumentTitle('Team & access');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [inviteOpen, setInviteOpen] = useState(false);
  const debouncedSearch = useDebounce(search);
  const users = useQuery({
    queryKey: ['users', { page, search: debouncedSearch }],
    queryFn: () => usersApi.list({ page, pageSize: 8, search: debouncedSearch }),
    placeholderData: (previous) => previous,
  });
  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'User',
        render: (_value, row) => (
          <div className="table-user">
            <span className="avatar avatar--small">
              {row.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{row.name}</strong>
              <small>{row.email}</small>
            </span>
          </div>
        ),
      },
      { key: 'role', header: 'Role', render: (value) => <Badge>{value}</Badge> },
      {
        key: 'status',
        header: 'Status',
        render: (value) => <AppStatusBadge status={value} label={value} tone={toneForStatus(value)} compact />,
      },
      { key: 'lastActive', header: 'Last active' },
      {
        key: 'actions',
        header: 'Action',
        align: 'end',
        render: () => (
          <button className="icon-button" aria-label="User actions">
            <MoreHorizontal size={18} />
          </button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <span className="eyebrow">Access management</span>
          <h1>Team and access</h1>
          <p>Invite teammates, assign roles and control workspace access.</p>
        </div>
        <Button icon={UserPlus} onClick={() => setInviteOpen(true)}>
          Invite member
        </Button>
      </header>
      <Card className="table-card">
        <div className="table-toolbar">
          <div className="header-search header-search--table">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search team…"
              aria-label="Search team"
            />
          </div>
          <div className="toolbar-meta">
            <strong>{users.data?.meta.total ?? 0}</strong> team members
          </div>
        </div>
        <DataTable columns={columns} rows={users.data?.items} loading={users.isLoading} />
        <div className="table-footer">
          <p>
            Showing page {users.data?.meta.page ?? page} of {users.data?.meta.totalPages || 1}
          </p>
          <Pagination
            page={page}
            totalPages={users.data?.meta.totalPages || 1}
            onPageChange={setPage}
          />
        </div>
      </Card>
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a team member"
        footer={
          <>
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button icon={Plus} onClick={() => setInviteOpen(false)}>
              Send invitation
            </Button>
          </>
        }
      >
        <p className="modal-copy">
          Connect this modal to your invite-user mutation. The component already includes escape-key
          handling, focus-friendly controls and a responsive layout.
        </p>
        <div className="field">
          <label htmlFor="invite-email">Work email</label>
          <div className="input-shell">
            <input id="invite-email" type="email" placeholder="teammate@company.com" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

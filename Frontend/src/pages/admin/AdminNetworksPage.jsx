import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Coins,
  Copy,
  ExternalLink,
  ImagePlus,
  MoreVertical,
  Network,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminNetworkApi } from '@/api/admin';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DateTimeField } from '@/components/organization/OrganizationFields';
import { Modal } from '@/components/ui/Modal';
import { getErrorMessage } from '@/utils/error';
import { resolveMasterImageUrl } from '@/utils/masterImage';

const chainKey = ['admin', 'chains'];
const paymentKey = (chainUid) => ['admin', 'payment-tokens', chainUid || 'all'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const NETWORK_PAGE_SIZE = 5;

const emptyChain = {
  chainCode: '',
  chainName: '',
  chainId: '',
  networkName: '',
  nativeCurrencyName: '',
  nativeCurrencySymbol: '',
  nativeCurrencyDecimals: '18',
  rpcUrl: '',
  fallbackRpcUrls: '',
  publicRpcUrl: '',
  explorerUrl: '',
  contractSuiteDeployedAt: '',
  trexImplementationAuthorityAddress: '',
  identityFactoryAddress: '',
  trexGatewayAddress: '',
  identityImplementationAuthorityAddress: '',
  platformControllerAddress: '',
  trexFactoryAddress: '',
  countryRestrictModuleAddress: '',
  maxBalanceModuleAddress: '',
  maxInvestorsModuleAddress: '',
  platformControllerOwnerAddress: '',
  idFactoryAccessManagerAddress: '',
  idFactoryAccessManagerAdminAddress: '',
  tokenImplementationAddress: '',
  claimTopicsRegistryImplementationAddress: '',
  identityRegistryImplementationAddress: '',
  identityRegistryStorageImplementationAddress: '',
  trustedIssuersRegistryImplementationAddress: '',
  modularComplianceImplementationAddress: '',
  identityImplementationAddress: '',
  paymentTokenAddresses: '',
  deployerAddress: '',
  deployerPrivateKey: '',
  confirmations: '2',
  registryConfirmations: '2',
  deploymentStartBlock: '0',
  claimIndexerStartBlock: '0',
  registryIndexerStartBlock: '0',
  transactionIndexerStartBlock: '0',
  indexersEnabled: true,
  isTestnet: true,
  isDefault: false,
  isActive: true,
};

const emptyPayment = {
  paymentTokenUid: '',
  paymentTokenCode: '',
  paymentTokenName: '',
  paymentTokenSymbol: '',
  contractAddress: '',
  decimals: '6',
  supportsPurchase: true,
  supportsRedemption: true,
  isDefault: false,
  displayOrder: '10',
  isActive: true,
};

const numeric = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const addressShort = (value) => (value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—');
const isRecordActive = (record) => (record?.isActive !== undefined ? Boolean(record.isActive) : record?.active !== false);
const paymentTokenCount = (chain) => chain.paymentTokenCount ?? chain.paymentTokensCount ?? chain.tokenCount ?? chain.tokensCount ?? chain.paymentTokenTotal ?? '—';

const valueText = (value) => {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const parseFallbackRpcUrls = (value = '') => value
  .split(/\n|,/)
  .map((item) => item.trim())
  .filter(Boolean);

const parseAddressList = (value = '') => [...new Set(
  value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean),
)];

const loadImageDimensions = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
    URL.revokeObjectURL(objectUrl);
    resolve(dimensions);
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('The selected image could not be read.'));
  };
  image.src = objectUrl;
});

const validateImage = async (file) => {
  if (!file) return;
  if (!IMAGE_TYPES.has(file.type)) throw new Error('Use a PNG, JPEG, WebP, or SVG image.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Image size must be 2 MB or less.');
  const { width, height } = await loadImageDimensions(file);
  if (width < 256 || height < 256 || width > 4096 || height > 4096) {
    throw new Error('Image dimensions must be between 256×256 and 4096×4096 pixels.');
  }
};

const copyValue = async (value, label) => {
  if (!value || !navigator?.clipboard) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy value');
  }
};

function Toggle({ label, checked, onChange, hint, disabled = false }) {
  return (
    <label className={`flex min-h-[82px] items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 transition ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-300 hover:bg-slate-50/40'}`}>
      <span className="min-w-0">
        <strong className="block text-sm text-slate-900">{label}</strong>
        {hint ? <small className="mt-1 block text-xs leading-5 text-slate-500">{hint}</small> : null}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-slate-300'}`} aria-hidden="true">
        <span className={`absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}

function StatusCard({ label, value, hint }) {
  return (
    <div className="flex min-h-[82px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
      <div className="min-w-0">
        <strong className="block text-sm text-slate-900">{label}</strong>
        {hint ? <small className="mt-1 block text-xs leading-5 text-slate-500">{hint}</small> : null}
      </div>
      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">{valueText(value)}</span>
    </div>
  );
}

function ImagePicker({ label, file, onChange, existingUrl, disabled = false }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shownUrl = previewUrl || existingUrl;
  const selectFile = async (event) => {
    const selected = event.target.files?.[0] || null;
    event.target.value = '';
    if (!selected) return;
    try {
      await validateImage(selected);
      onChange(selected);
    } catch (error) {
      toast.error('Image not accepted', { description: getErrorMessage(error) });
    }
  };

  return (
    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[80px_minmax(0,1fr)] sm:items-center">
      <div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {shownUrl ? (
          <img src={shownUrl} alt="Selected" className="size-full object-contain p-2" />
        ) : (
          <ImagePlus className="text-slate-400" size={26} aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0">
        <strong className="block text-sm text-slate-900">{label}</strong>
        <p className="mt-1 mb-3 text-xs leading-5 text-slate-500">PNG, JPEG, WebP, or SVG · max 2 MB · 256×256 to 4096×4096.</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`button button--secondary button--sm ${disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
            <Upload size={16} aria-hidden="true" />
            <span>{file ? 'Choose another' : existingUrl ? 'Replace image' : 'Choose image'}</span>
            <input
              type="file"
              className="sr-only"
              accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={selectFile}
              disabled={disabled}
            />
          </label>
          {file ? (
            <button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-900" onClick={() => onChange(null)}>
              Clear selection
            </button>
          ) : null}
        </div>
        {file ? <p className="mt-2 mb-0 truncate text-xs font-medium text-slate-600">{file.name}</p> : null}
      </div>
    </div>
  );
}

function SectionHeader({ title, description, badge }) {
  return (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
      <div>
        <h3 className="m-0 text-[15px] font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      {badge ? <span className="w-fit shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{badge}</span> : null}
    </div>
  );
}

function FormSection({ title, description, badge, children }) {
  return (
    <section className="grid gap-4 border-b border-slate-200 py-5 first:pt-0 last:border-b-0 last:pb-0 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-8">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-sm font-semibold text-slate-950">{title}</h3>
          {badge ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{badge}</span> : null}
        </div>
        {description ? <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function FilterSelect({ value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 text-left text-sm font-medium transition ${open ? 'border-blue-500 ring-4 ring-blue-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {selected?.dot ? <span className={`size-2 shrink-0 rounded-full ${selected.dot}`} /> : null}
          <span className="truncate text-slate-700">{selected?.label}</span>
        </span>
        <ChevronDown size={17} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.16)]" role="listbox">
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                onClick={() => { onChange(option.value); setOpen(false); }}
                role="option"
                aria-selected={active}
              >
                {option.dot ? <span className={`size-2 shrink-0 rounded-full ${option.dot}`} /> : null}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active ? <Check size={16} className="shrink-0 text-blue-600" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ReadOnlyField({ label, value, mono = false, copyable = false, hint, wrap = false }) {
  const display = valueText(value);
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-[13px] font-bold text-slate-800">{label}</span>
      <div className={`flex min-h-[47px] min-w-0 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 ${wrap ? 'items-start py-3' : 'items-center'}`}>
        <span
          className={`min-w-0 flex-1 text-sm text-slate-700 ${wrap ? 'break-all leading-5' : 'truncate'} ${mono ? 'font-mono text-xs' : ''}`}
          title={display}
        >
          {display}
        </span>
        {copyable && value ? (
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
            onClick={() => copyValue(String(value), label)}
            aria-label={`Copy ${label}`}
          >
            <Copy size={14} />
          </button>
        ) : null}
      </div>
      {hint ? <p className="m-0 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ReadOnlyAddressList({ label, value, hint }) {
  const addresses = Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : parseAddressList(String(value || ''));

  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-[13px] font-bold text-slate-800">{label}</span>
      <div className="grid min-w-0 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        {addresses.length ? addresses.map((address, index) => (
          <div key={`${address}-${index}`} className="flex min-w-0 items-start gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
            <code className="min-w-0 flex-1 break-all text-xs leading-5 text-slate-700">{address}</code>
            <button
              type="button"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              onClick={() => copyValue(address, `${label} ${index + 1}`)}
              aria-label={`Copy ${label} ${index + 1}`}
            >
              <Copy size={14} />
            </button>
          </div>
        )) : <span className="px-1 py-1 text-sm text-slate-500">—</span>}
      </div>
      {hint ? <p className="m-0 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function ReviewItem({ label, value, mono = false }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
      <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-slate-400">{label}</dt>
      <dd className={`mt-1 mb-0 break-words text-sm font-medium text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{valueText(value)}</dd>
    </div>
  );
}

function validateChainForReview(form) {
  const required = [
    ['chainCode', 'Code'], ['chainName', 'Display name'], ['chainId', 'Chain ID'], ['networkName', 'Network name'],
    ['nativeCurrencyName', 'Currency name'], ['nativeCurrencySymbol', 'Currency symbol'], ['nativeCurrencyDecimals', 'Currency decimals'],
    ['publicRpcUrl', 'Public RPC URL'], ['rpcUrl', 'Internal RPC URL'],
    ['contractSuiteDeployedAt', 'Contract suite deployment time'],
    ['trexImplementationAuthorityAddress', 'TREX Implementation Authority'],
    ['trexFactoryAddress', 'TREX Factory'], ['trexGatewayAddress', 'TREX Gateway'],
    ['identityImplementationAuthorityAddress', 'Identity Implementation Authority'],
    ['identityFactoryAddress', 'Identity Factory'], ['platformControllerAddress', 'Platform Controller'],
    ['countryRestrictModuleAddress', 'Country Restrict module'], ['maxBalanceModuleAddress', 'Max Balance module'],
    ['maxInvestorsModuleAddress', 'Max Investors module'], ['platformControllerOwnerAddress', 'Platform Controller owner'],
    ['tokenImplementationAddress', 'Token implementation'],
    ['claimTopicsRegistryImplementationAddress', 'Claim Topics Registry implementation'],
    ['identityRegistryImplementationAddress', 'Identity Registry implementation'],
    ['identityRegistryStorageImplementationAddress', 'Identity Registry Storage implementation'],
    ['trustedIssuersRegistryImplementationAddress', 'Trusted Issuers Registry implementation'],
    ['modularComplianceImplementationAddress', 'Modular Compliance implementation'],
    ['identityImplementationAddress', 'Identity implementation'],
    ['paymentTokenAddresses', 'Payment-token addresses'],
    ['deployerAddress', 'Deployer address'],
    ['deployerPrivateKey', 'Deployer private key'],
  ];
  const missing = required.find(([key]) => !String(form[key] ?? '').trim());
  if (missing) return `${missing[1]} is required.`;
  if (numeric(form.chainId) <= 0) return 'Chain ID must be greater than 0.';
  return '';
}

function NetworkReviewDialog({ open, form, image, onBack, onConfirm, loading }) {
  const fallbackUrls = parseFallbackRpcUrls(form.fallbackRpcUrls);
  return (
    <Modal
      open={open}
      onClose={() => !loading && onBack()}
      title="Review network before creating"
      dialogStyle={{ maxWidth: '1080px' }}
      bodyClassName="px-4 py-5 sm:px-6"
      footer={(
        <>
          <Button variant="secondary" onClick={onBack} disabled={loading}>Back to edit</Button>
          <Button onClick={onConfirm} loading={loading}>Create Network</Button>
        </>
      )}
    >
      <div className="grid gap-6">
        <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <p className="m-0">Review the complete network configuration below. No API call is made until you click <strong>Create Network</strong>. The deployer private key is intentionally masked here and will be sent once to the backend.</p>
        </div>

        <section>
          <SectionHeader title="Network identity" />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReviewItem label="Code" value={form.chainCode.trim().toUpperCase()} />
            <ReviewItem label="Display name" value={form.chainName.trim()} />
            <ReviewItem label="Chain ID" value={form.chainId} />
            <ReviewItem label="Network name" value={form.networkName.trim()} />
          </dl>
        </section>

        <section>
          <SectionHeader title="Native currency" />
          <dl className="grid gap-3 sm:grid-cols-3">
            <ReviewItem label="Currency name" value={form.nativeCurrencyName.trim()} />
            <ReviewItem label="Symbol" value={form.nativeCurrencySymbol.trim().toUpperCase()} />
            <ReviewItem label="Decimals" value={form.nativeCurrencyDecimals} />
          </dl>
        </section>

        <section>
          <SectionHeader title="RPC & explorer" />
          <dl className="grid gap-3 sm:grid-cols-2">
            <ReviewItem label="Public RPC URL" value={form.publicRpcUrl.trim()} mono />
            <ReviewItem label="Explorer URL" value={form.explorerUrl.trim() || 'Not provided'} mono />
            <ReviewItem label="Internal RPC URL" value={form.rpcUrl.trim()} mono />
            <ReviewItem label="Fallback internal RPC URLs" value={fallbackUrls.length ? fallbackUrls.join('\n') : 'None'} mono />
          </dl>
        </section>

        <section>
          <SectionHeader title="Contracts & deployer" />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ReviewItem label="Contract suite deployed at" value={form.contractSuiteDeployedAt.trim()} />
            <ReviewItem label="TREX Implementation Authority" value={form.trexImplementationAuthorityAddress.trim()} mono />
            <ReviewItem label="TREX Gateway" value={form.trexGatewayAddress.trim()} mono />
            <ReviewItem label="Identity Factory" value={form.identityFactoryAddress.trim()} mono />
            <ReviewItem label="Identity Implementation Authority" value={form.identityImplementationAuthorityAddress.trim()} mono />
            <ReviewItem label="Platform Controller" value={form.platformControllerAddress.trim()} mono />
            <ReviewItem label="TREX Factory" value={form.trexFactoryAddress.trim()} mono />
            <ReviewItem label="Country Restrict module" value={form.countryRestrictModuleAddress.trim()} mono />
            <ReviewItem label="Max Balance module" value={form.maxBalanceModuleAddress.trim()} mono />
            <ReviewItem label="Max Investors module" value={form.maxInvestorsModuleAddress.trim()} mono />
            <ReviewItem label="Platform Controller owner" value={form.platformControllerOwnerAddress.trim()} mono />
            <ReviewItem label="ID Factory Access Manager" value={form.idFactoryAccessManagerAddress.trim() || 'Not deployed'} mono />
            <ReviewItem label="ID Factory Access Manager admin" value={form.idFactoryAccessManagerAdminAddress.trim() || 'Not deployed'} mono />
            <ReviewItem label="Token implementation" value={form.tokenImplementationAddress.trim()} mono />
            <ReviewItem label="Claim Topics Registry implementation" value={form.claimTopicsRegistryImplementationAddress.trim()} mono />
            <ReviewItem label="Identity Registry implementation" value={form.identityRegistryImplementationAddress.trim()} mono />
            <ReviewItem label="Identity Registry Storage implementation" value={form.identityRegistryStorageImplementationAddress.trim()} mono />
            <ReviewItem label="Trusted Issuers Registry implementation" value={form.trustedIssuersRegistryImplementationAddress.trim()} mono />
            <ReviewItem label="Modular Compliance implementation" value={form.modularComplianceImplementationAddress.trim()} mono />
            <ReviewItem label="Identity implementation" value={form.identityImplementationAddress.trim()} mono />
            <ReviewItem label="Payment-token addresses" value={parseAddressList(form.paymentTokenAddresses).join('\n')} mono />
            <ReviewItem label="Deployer address" value={form.deployerAddress.trim()} mono />
            <ReviewItem label="Deployer private key" value="Provided ••••••••••••" mono />
            <ReviewItem label="Network image" value={image?.name || 'No image selected'} />
          </dl>
        </section>

        <section>
          <SectionHeader title="Confirmations & indexers" />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ReviewItem label="Transaction confirmations" value={form.confirmations} />
            <ReviewItem label="Registry confirmations" value={form.registryConfirmations} />
            <ReviewItem label="Deployment start block" value={form.deploymentStartBlock} />
            <ReviewItem label="Claim indexer start block" value={form.claimIndexerStartBlock} />
            <ReviewItem label="Registry indexer start block" value={form.registryIndexerStartBlock} />
            <ReviewItem label="Transaction indexer start block" value={form.transactionIndexerStartBlock} />
          </dl>
        </section>

        <section>
          <SectionHeader title="Availability" />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ReviewItem label="Indexers enabled" value={form.indexersEnabled} />
            <ReviewItem label="Environment" value={form.isTestnet ? 'Testnet' : 'Mainnet'} />
            <ReviewItem label="Default network" value={form.isDefault} />
            <ReviewItem label="Active" value={form.isActive} />
          </dl>
        </section>
      </div>
    </Modal>
  );
}

function ChainForm({ open, onClose, initial, onSaved }) {
  const editing = Boolean(initial?.chainUid);
  const detailQuery = useQuery({
    queryKey: ['admin', 'chains', 'detail', initial?.chainUid || 'new'],
    queryFn: () => adminNetworkApi.getChain(initial.chainUid),
    enabled: editing && Boolean(initial?.chainUid),
    staleTime: 15_000,
  });
  const contractPaymentTokensQuery = useQuery({
    queryKey: paymentKey(initial?.chainUid),
    queryFn: () => adminNetworkApi.listPaymentTokens(initial.chainUid, initial.chainId),
    enabled: editing && Boolean(initial?.chainUid),
    staleTime: 15_000,
  });
  const detailPaymentTokenAddresses = detailQuery.data?.paymentTokenAddresses;
  const initialPaymentTokenAddresses = initial?.paymentTokenAddresses;
  const paymentTokenAddresses = (Array.isArray(detailPaymentTokenAddresses) && detailPaymentTokenAddresses.length
    ? detailPaymentTokenAddresses
    : Array.isArray(initialPaymentTokenAddresses) && initialPaymentTokenAddresses.length
      ? initialPaymentTokenAddresses
      : (contractPaymentTokensQuery.data || [])
        .map((token) => token.contractAddress || token.address || '')
        .filter(Boolean));
  const details = editing
    ? { ...initial, ...(detailQuery.data || {}), paymentTokenAddresses }
    : initial;
  const [image, setImage] = useState(null);
  const [replaceFallbacks, setReplaceFallbacks] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [form, setForm] = useState(() => (initial ? {
    ...emptyChain,
    ...initial,
    chainId: String(initial.chainId || ''),
    nativeCurrencyDecimals: String(initial.nativeCurrencyDecimals || 18),
    fallbackRpcUrls: Array.isArray(initial.fallbackRpcUrls) ? initial.fallbackRpcUrls.join('\n') : '',
    confirmations: String(initial.confirmations ?? initial.requiredConfirmations ?? 2),
    registryConfirmations: String(initial.registryConfirmations ?? 2),
    deploymentStartBlock: String(initial.deploymentStartBlock ?? 0),
    claimIndexerStartBlock: String(initial.claimIndexerStartBlock ?? 0),
    registryIndexerStartBlock: String(initial.registryIndexerStartBlock ?? 0),
    transactionIndexerStartBlock: String(initial.transactionIndexerStartBlock ?? 0),
    rpcUrl: '',
    deployerPrivateKey: '',
    isActive: isRecordActive(initial),
  } : emptyChain));

  const mutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        const payload = {
          publicRpcUrl: form.publicRpcUrl.trim(),
          explorerUrl: form.explorerUrl.trim(),
          isActive: form.isActive,
          ...(replaceFallbacks ? { fallbackRpcUrls: parseFallbackRpcUrls(form.fallbackRpcUrls) } : {}),
        };
        const saved = await adminNetworkApi.updateChain(initial.chainUid, payload);
        if (image) {
          try {
            await adminNetworkApi.updateChainImage(initial.chainUid, image);
          } catch (error) {
            error.partialSave = true;
            throw error;
          }
        }
        return saved;
      }

      const payload = {
        chainCode: form.chainCode.trim().toUpperCase(),
        chainName: form.chainName.trim(),
        chainId: numeric(form.chainId),
        networkName: form.networkName.trim(),
        nativeCurrencyName: form.nativeCurrencyName.trim(),
        nativeCurrencySymbol: form.nativeCurrencySymbol.trim().toUpperCase(),
        nativeCurrencyDecimals: numeric(form.nativeCurrencyDecimals, 18),
        publicRpcUrl: form.publicRpcUrl.trim(),
        explorerUrl: form.explorerUrl.trim(),
        contractSuiteDeployedAt: form.contractSuiteDeployedAt.trim(),
        trexImplementationAuthorityAddress: form.trexImplementationAuthorityAddress.trim(),
        identityFactoryAddress: form.identityFactoryAddress.trim(),
        trexGatewayAddress: form.trexGatewayAddress.trim(),
        identityImplementationAuthorityAddress: form.identityImplementationAuthorityAddress.trim(),
        platformControllerAddress: form.platformControllerAddress.trim(),
        trexFactoryAddress: form.trexFactoryAddress.trim(),
        countryRestrictModuleAddress: form.countryRestrictModuleAddress.trim(),
        maxBalanceModuleAddress: form.maxBalanceModuleAddress.trim(),
        maxInvestorsModuleAddress: form.maxInvestorsModuleAddress.trim(),
        platformControllerOwnerAddress: form.platformControllerOwnerAddress.trim(),
        idFactoryAccessManagerAddress: form.idFactoryAccessManagerAddress.trim() || null,
        idFactoryAccessManagerAdminAddress: form.idFactoryAccessManagerAdminAddress.trim() || null,
        tokenImplementationAddress: form.tokenImplementationAddress.trim(),
        claimTopicsRegistryImplementationAddress: form.claimTopicsRegistryImplementationAddress.trim(),
        identityRegistryImplementationAddress: form.identityRegistryImplementationAddress.trim(),
        identityRegistryStorageImplementationAddress: form.identityRegistryStorageImplementationAddress.trim(),
        trustedIssuersRegistryImplementationAddress: form.trustedIssuersRegistryImplementationAddress.trim(),
        modularComplianceImplementationAddress: form.modularComplianceImplementationAddress.trim(),
        identityImplementationAddress: form.identityImplementationAddress.trim(),
        paymentTokenAddresses: parseAddressList(form.paymentTokenAddresses),
        deployerAddress: form.deployerAddress.trim(),
        fallbackRpcUrls: parseFallbackRpcUrls(form.fallbackRpcUrls),
        confirmations: numeric(form.confirmations, 2),
        registryConfirmations: numeric(form.registryConfirmations, 2),
        deploymentStartBlock: numeric(form.deploymentStartBlock),
        claimIndexerStartBlock: numeric(form.claimIndexerStartBlock),
        registryIndexerStartBlock: numeric(form.registryIndexerStartBlock),
        transactionIndexerStartBlock: numeric(form.transactionIndexerStartBlock),
        indexersEnabled: form.indexersEnabled,
        isTestnet: form.isTestnet,
        isDefault: form.isDefault,
        isActive: form.isActive,
        rpcUrl: form.rpcUrl.trim(),
        deployerPrivateKey: form.deployerPrivateKey.trim(),
      };
      return adminNetworkApi.createChain(payload, image);
    },
    onSuccess: () => {
      toast.success(editing ? 'Network updated' : 'Network created');
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error?.partialSave) {
        onSaved();
        toast.warning('Network settings saved, but the image was not updated', { description: getErrorMessage(error) });
        return;
      }
      toast.error('Network was not saved', { description: getErrorMessage(error) });
    },
  });

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key, label, props = {}) => <Input label={label} value={form[key]} onChange={(event) => set(key, event.target.value)} {...props} />;

  const openReview = () => {
    const error = validateChainForReview(form);
    if (error) {
      toast.error('Complete the network details', { description: error });
      return;
    }
    setReviewOpen(true);
  };

  if (editing) {
    return (
      <Modal
        open={open}
        onClose={() => !mutation.isPending && onClose()}
        title="Edit blockchain network"
        dialogStyle={{ maxWidth: '1180px' }}
        bodyClassName="px-4 py-4 sm:px-6 lg:px-7"
        footer={(
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button onClick={() => mutation.mutate()} loading={mutation.isPending}>Save changes</Button>
          </>
        )}
      >
        <div className="min-w-0">
          <div className="mb-1 flex flex-col gap-2 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <strong className="block text-sm text-blue-950">Only approved network fields can be changed</strong>
              <p className="mt-1 mb-0 text-xs leading-5 text-blue-800">Public RPC URL, Explorer URL, fallback internal RPC URLs, Active/Inactive, and the network image are editable. Everything else remains read-only.</p>
            </div>
            <span className={`w-fit shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${form.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>{form.isActive ? 'Active' : 'Inactive'}</span>
          </div>

          <FormSection title="Network identity" description="Basic blockchain identity." badge="Read-only">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <ReadOnlyField label="Code" value={details.chainCode} />
              <ReadOnlyField label="Display name" value={details.chainName} />
              <ReadOnlyField label="Chain ID" value={details.chainId} />
              <ReadOnlyField label="Network name" value={details.networkName} />
            </div>
          </FormSection>

          <FormSection title="Native currency" description="Native token used for network fees." badge="Read-only">
            <div className="grid gap-4 sm:grid-cols-3">
              <ReadOnlyField label="Currency name" value={details.nativeCurrencyName} />
              <ReadOnlyField label="Symbol" value={details.nativeCurrencySymbol} />
              <ReadOnlyField label="Decimals" value={details.nativeCurrencyDecimals} />
            </div>
          </FormSection>

          <FormSection title="Network image" description="Visual shown anywhere this network is presented." badge="Editable">
            <ImagePicker label="Network image" file={image} onChange={setImage} existingUrl={resolveMasterImageUrl(details)} disabled={mutation.isPending} />
          </FormSection>

          <FormSection title="RPC & explorer" description="Public endpoints and fallback RPC configuration." badge="Editable">
            <div className="grid gap-4 sm:grid-cols-2">
              {input('publicRpcUrl', 'Public RPC URL', { required: true, type: 'url', hint: 'Used by wallets and wallet_addEthereumChain.' })}
              {input('explorerUrl', 'Explorer URL', { type: 'url', hint: 'Public explorer used for transaction and address links.' })}
              <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm text-slate-900">Fallback internal RPC URLs</strong>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{details.fallbackRpcCount || 0} stored</span>
                    </div>
                    <p className="mt-1 mb-0 text-xs leading-5 text-slate-500">Stored internal URLs are not returned by the API. Enable editing only when you intend to replace the complete fallback list.</p>
                  </div>
                  <Button variant="secondary" size="sm" className="w-full md:w-auto" onClick={() => setReplaceFallbacks((current) => !current)} disabled={mutation.isPending}>
                    {replaceFallbacks ? 'Keep stored URLs' : 'Edit fallback URLs'}
                  </Button>
                </div>
                {replaceFallbacks ? (
                  <div className="mt-4">
                    <label className="mb-1.5 block text-[13px] font-bold text-slate-800" htmlFor="edit-fallback-rpcs">Replacement fallback URLs</label>
                    <textarea
                      id="edit-fallback-rpcs"
                      className="min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      value={form.fallbackRpcUrls}
                      onChange={(event) => set('fallbackRpcUrls', event.target.value)}
                      placeholder="One URL per line. Leave empty and save only if you want to clear the fallback list."
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </FormSection>

          <FormSection title="Contract suite & deployment" description="Complete immutable contract suite captured when this network was created." badge="Read-only">
            {detailQuery.isLoading ? (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
                <RefreshCcw size={15} className="shrink-0 animate-spin" />
                Loading complete contract configuration…
              </div>
            ) : null}
            {detailQuery.isError ? (
              <div className="mb-4 flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span>Some read-only contract details could not be loaded. The editable network settings are unaffected.</span>
                <Button variant="secondary" size="sm" icon={RefreshCcw} className="w-full sm:w-auto" onClick={() => detailQuery.refetch()}>Retry details</Button>
              </div>
            ) : null}

            <div className="grid gap-4">
              <div>
                <SectionHeader title="Deployment metadata" description="Deployment timestamp and backend signer status." />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <ReadOnlyField label="Contract suite deployed at" value={details.contractSuiteDeployedAt} />
                  <ReadOnlyField label="Deployer address" value={details.deployerAddress} mono copyable wrap />
                  <ReadOnlyField label="Deployer private key" value={details.hasDeployerPrivateKey ? 'Configured securely' : 'Not configured'} />
                </div>
              </div>

              <div>
                <SectionHeader title="Platform & identity contracts" description="Factories, authorities, gateway, controller, and identity access management." />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <ReadOnlyField label="TREX Implementation Authority" value={details.trexImplementationAuthorityAddress} mono copyable wrap />
                  <ReadOnlyField label="TREX Factory" value={details.trexFactoryAddress} mono copyable wrap />
                  <ReadOnlyField label="TREX Gateway" value={details.trexGatewayAddress} mono copyable wrap />
                  <ReadOnlyField label="Identity Implementation Authority" value={details.identityImplementationAuthorityAddress} mono copyable wrap />
                  <ReadOnlyField label="Identity Factory" value={details.identityFactoryAddress} mono copyable wrap />
                  <ReadOnlyField label="Platform Controller" value={details.platformControllerAddress} mono copyable wrap />
                  <ReadOnlyField label="Platform Controller owner" value={details.platformControllerOwnerAddress} mono copyable wrap />
                  <ReadOnlyField label="ID Factory Access Manager" value={details.idFactoryAccessManagerAddress || 'Not deployed'} mono copyable={Boolean(details.idFactoryAccessManagerAddress)} wrap />
                  <ReadOnlyField label="ID Factory Access Manager admin" value={details.idFactoryAccessManagerAdminAddress || 'Not deployed'} mono copyable={Boolean(details.idFactoryAccessManagerAdminAddress)} wrap />
                </div>
              </div>

              <div>
                <SectionHeader title="Compliance modules" description="Compliance contracts configured for newly created security tokens." />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <ReadOnlyField label="Country Restrict module" value={details.countryRestrictModuleAddress} mono copyable wrap />
                  <ReadOnlyField label="Max Balance module" value={details.maxBalanceModuleAddress} mono copyable wrap />
                  <ReadOnlyField label="Max Investors module" value={details.maxInvestorsModuleAddress} mono copyable wrap />
                </div>
              </div>

              <div>
                <SectionHeader title="Implementation contracts" description="Immutable implementation addresses supplied during network creation." />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <ReadOnlyField label="Token implementation" value={details.tokenImplementationAddress} mono copyable wrap />
                  <ReadOnlyField label="Claim Topics Registry implementation" value={details.claimTopicsRegistryImplementationAddress} mono copyable wrap />
                  <ReadOnlyField label="Identity Registry implementation" value={details.identityRegistryImplementationAddress} mono copyable wrap />
                  <ReadOnlyField label="Identity Registry Storage implementation" value={details.identityRegistryStorageImplementationAddress} mono copyable wrap />
                  <ReadOnlyField label="Trusted Issuers Registry implementation" value={details.trustedIssuersRegistryImplementationAddress} mono copyable wrap />
                  <ReadOnlyField label="Modular Compliance implementation" value={details.modularComplianceImplementationAddress} mono copyable wrap />
                  <ReadOnlyField label="Identity implementation" value={details.identityImplementationAddress} mono copyable wrap />
                </div>
              </div>

              <div>
                <SectionHeader title="Payment-token contracts" description="Payment-token addresses supplied with the network contract suite." />
                <ReadOnlyAddressList label="Payment-token addresses" value={details.paymentTokenAddresses} hint="Each address is shown in full and can be copied independently." />
              </div>

              <div>
                <SectionHeader title="Protected runtime configuration" description="Sensitive backend-only values are shown only as configuration status." />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <ReadOnlyField label="Internal RPC" value={details.hasRpcUrl ? 'Configured securely' : 'Not configured'} />
                  <ReadOnlyField label="Fallback RPCs" value={`${details.fallbackRpcCount || 0} stored`} />
                  <ReadOnlyField label="Deployer private key" value={details.hasDeployerPrivateKey ? 'Configured securely' : 'Not configured'} />
                </div>
              </div>
            </div>
          </FormSection>

          <FormSection title="Confirmations & indexers" description="Confirmation requirements and indexer start blocks." badge="Read-only">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <ReadOnlyField label="Transaction confirmations" value={details.confirmations ?? details.requiredConfirmations} />
              <ReadOnlyField label="Registry confirmations" value={details.registryConfirmations} />
              <ReadOnlyField label="Deployment start block" value={details.deploymentStartBlock} />
              <ReadOnlyField label="Claim indexer start block" value={details.claimIndexerStartBlock} />
              <ReadOnlyField label="Registry indexer start block" value={details.registryIndexerStartBlock} />
              <ReadOnlyField label="Transaction indexer start block" value={details.transactionIndexerStartBlock} />
            </div>
          </FormSection>

          <FormSection title="Availability" description="Operational status for this network.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatusCard label="Indexers" value={details.indexersEnabled ? 'Enabled' : 'Disabled'} />
              <StatusCard label="Environment" value={details.isTestnet ? 'Testnet' : 'Mainnet'} />
              <StatusCard label="Default network" value={details.isDefault ? 'Yes' : 'No'} />
              <Toggle label="Active network" checked={form.isActive} onChange={(value) => set('isActive', value)} hint="Deactivate instead of deleting this network." />
            </div>
          </FormSection>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal
        open={open && !reviewOpen}
        onClose={() => !mutation.isPending && onClose()}
        title="Add blockchain network"
        dialogStyle={{ maxWidth: '1180px' }}
        bodyClassName="px-4 py-4 sm:px-6 lg:px-7"
        footer={(
          <>
            <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button onClick={openReview} disabled={mutation.isPending}>Create network</Button>
          </>
        )}
      >
        <div className="min-w-0">
          <div className="mb-1 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm leading-6 text-blue-900">
            Network identity, contracts, confirmations, and indexer values become immutable after creation. You will review every value in a read-only confirmation dialog before the API call is made.
          </div>

          <FormSection title="Network identity" description="Basic information about the blockchain network.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {input('chainCode', 'Code', { required: true, placeholder: 'AMOY' })}
              {input('chainName', 'Display name', { required: true, placeholder: 'Polygon Amoy' })}
              {input('chainId', 'Chain ID', { required: true, type: 'number', min: 1 })}
              {input('networkName', 'Network name', { required: true, placeholder: 'amoy' })}
            </div>
          </FormSection>

          <FormSection title="Native currency" description="Native token used for transaction fees.">
            <div className="grid gap-4 sm:grid-cols-3">
              {input('nativeCurrencyName', 'Currency name', { required: true, placeholder: 'POL' })}
              {input('nativeCurrencySymbol', 'Symbol', { required: true, placeholder: 'POL' })}
              {input('nativeCurrencyDecimals', 'Decimals', { required: true, type: 'number', min: 0 })}
            </div>
          </FormSection>

          <FormSection title="Network image" description="Optional image shown in network selectors and admin views.">
            <ImagePicker label="Network image" file={image} onChange={setImage} existingUrl="" disabled={mutation.isPending} />
          </FormSection>

          <FormSection title="RPC & explorer" description="Endpoints used for wallet configuration and backend blockchain access.">
            <div className="grid gap-4 sm:grid-cols-2">
              {input('publicRpcUrl', 'Public RPC URL', { required: true, type: 'url', hint: 'Safe for wallet_addEthereumChain.' })}
              {input('explorerUrl', 'Explorer URL', { type: 'url' })}
              <div className="sm:col-span-2">
                {input('rpcUrl', 'Internal RPC URL', { required: true, type: 'url', hint: 'Verified against the chain ID before save.' })}
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-bold text-slate-800" htmlFor="create-fallback-rpcs">Fallback internal RPC URLs</label>
                <textarea
                  id="create-fallback-rpcs"
                  className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={form.fallbackRpcUrls}
                  onChange={(event) => set('fallbackRpcUrls', event.target.value)}
                  placeholder="One URL per line"
                />
                <p className="mt-1.5 mb-0 text-xs text-slate-500">Optional. Add one fallback internal RPC endpoint per line.</p>
              </div>
            </div>
          </FormSection>

          <FormSection title="Immutable contract suite" description="Complete deployed T-REX and identity contract suite. These values are verified by the backend and cannot be edited after network creation.">
            <div className="grid gap-4 sm:grid-cols-2">
              <DateTimeField
                id="contract-suite-deployed-at"
                label="Contract suite deployed at"
                value={form.contractSuiteDeployedAt}
                onChange={(event) => set('contractSuiteDeployedAt', event.target.value)}
                required
              />
              {input('trexImplementationAuthorityAddress', 'TREX Implementation Authority', { required: true, placeholder: '0x…' })}
              {input('trexFactoryAddress', 'TREX Factory', { required: true, placeholder: '0x…' })}
              {input('trexGatewayAddress', 'TREX Gateway', { required: true, placeholder: '0x…' })}
              {input('identityImplementationAuthorityAddress', 'Identity Implementation Authority', { required: true, placeholder: '0x…' })}
              {input('identityFactoryAddress', 'Identity Factory', { required: true, placeholder: '0x…' })}
              {input('platformControllerAddress', 'Platform Controller', { required: true, placeholder: '0x…' })}
              {input('platformControllerOwnerAddress', 'Platform Controller owner', { required: true, placeholder: '0x…' })}
              {input('countryRestrictModuleAddress', 'Country Restrict module', { required: true, placeholder: '0x…' })}
              {input('maxBalanceModuleAddress', 'Max Balance module', { required: true, placeholder: '0x…' })}
              {input('maxInvestorsModuleAddress', 'Max Investors module', { required: true, placeholder: '0x…' })}
              {input('idFactoryAccessManagerAddress', 'ID Factory Access Manager', { placeholder: '0x… (optional when not deployed)' })}
              {input('idFactoryAccessManagerAdminAddress', 'ID Factory Access Manager admin', { placeholder: '0x… (optional when not deployed)' })}
              {input('tokenImplementationAddress', 'Token implementation', { required: true, placeholder: '0x…' })}
              {input('claimTopicsRegistryImplementationAddress', 'Claim Topics Registry implementation', { required: true, placeholder: '0x…' })}
              {input('identityRegistryImplementationAddress', 'Identity Registry implementation', { required: true, placeholder: '0x…' })}
              {input('identityRegistryStorageImplementationAddress', 'Identity Registry Storage implementation', { required: true, placeholder: '0x…' })}
              {input('trustedIssuersRegistryImplementationAddress', 'Trusted Issuers Registry implementation', { required: true, placeholder: '0x…' })}
              {input('modularComplianceImplementationAddress', 'Modular Compliance implementation', { required: true, placeholder: '0x…' })}
              {input('identityImplementationAddress', 'Identity implementation', { required: true, placeholder: '0x…' })}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-[13px] font-bold text-slate-800" htmlFor="create-payment-token-addresses">Payment-token addresses</label>
                <textarea
                  id="create-payment-token-addresses"
                  className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  value={form.paymentTokenAddresses}
                  onChange={(event) => set('paymentTokenAddresses', event.target.value)}
                  placeholder="One controller payment-token address per line"
                  required
                />
                <p className="mt-1.5 mb-0 text-xs text-slate-500">Enter every address returned by the Platform Controller. The backend verifies the exact list.</p>
              </div>
            </div>
          </FormSection>

          <FormSection title="Deployment signer" description="Backend-only network signer settings. These values are never exposed through VITE_* configuration.">
            <div className="grid gap-4 sm:grid-cols-2">
              {input('deployerAddress', 'Deployer address', { required: true, placeholder: '0x…' })}
              {input('deployerPrivateKey', 'Deployer private key', { required: true, type: 'password', autoComplete: 'new-password', hint: 'Sent once and encrypted by the backend. It is masked on the confirmation screen.' })}
            </div>
          </FormSection>

          <FormSection title="Confirmations & indexers" description="Block confirmation requirements and indexer starting points.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {input('confirmations', 'Transaction confirmations', { type: 'number', min: 0 })}
              {input('registryConfirmations', 'Registry confirmations', { type: 'number', min: 0 })}
              {input('deploymentStartBlock', 'Deployment start block', { type: 'number', min: 0 })}
              {input('claimIndexerStartBlock', 'Claim indexer start block', { type: 'number', min: 0 })}
              {input('registryIndexerStartBlock', 'Registry indexer start block', { type: 'number', min: 0 })}
              {input('transactionIndexerStartBlock', 'Transaction indexer start block', { type: 'number', min: 0 })}
            </div>
          </FormSection>

          <FormSection title="Availability" description="Operational flags applied when this network is created.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Toggle label="Indexers enabled" checked={form.indexersEnabled} onChange={(value) => set('indexersEnabled', value)} hint="Enable blockchain indexers for this network." />
              <Toggle label="Test network" checked={form.isTestnet} onChange={(value) => set('isTestnet', value)} hint="Turn off when adding a mainnet." />
              <Toggle label="Default network" checked={form.isDefault} onChange={(value) => set('isDefault', value)} hint="Initial network for new onboarding." />
              <Toggle label="Active" checked={form.isActive} onChange={(value) => set('isActive', value)} hint="Make this network available immediately." />
            </div>
          </FormSection>
        </div>
      </Modal>

      <NetworkReviewDialog
        open={open && reviewOpen}
        form={form}
        image={image}
        onBack={() => setReviewOpen(false)}
        onConfirm={() => mutation.mutate()}
        loading={mutation.isPending}
      />
    </>
  );

}

function validatePaymentForm(form) {
  const required = [
    ['paymentTokenCode', 'Code'], ['paymentTokenName', 'Name'], ['paymentTokenSymbol', 'Symbol'],
    ['contractAddress', 'Contract address'], ['decimals', 'Decimals'],
  ];
  const missing = required.find(([key]) => !String(form[key] ?? '').trim());
  return missing ? `${missing[1]} is required.` : '';
}

const paymentFormState = (record) => {
  if (!record) return { ...emptyPayment };
  const paymentTokenSymbol = String(record.symbol || record.paymentTokenSymbol || '').trim();
  const paymentTokenName = String(record.name || record.paymentTokenName || record.displayName || paymentTokenSymbol).trim();
  return {
    ...emptyPayment,
    ...record,
    paymentTokenUid: record.paymentTokenUid || record.uid || '',
    paymentTokenCode: String(record.paymentTokenCode || record.code || paymentTokenSymbol).trim(),
    paymentTokenName,
    paymentTokenSymbol,
    contractAddress: String(record.contractAddress || record.paymentTokenAddress || '').trim(),
    decimals: String(record.decimals ?? 6),
    displayOrder: String(record.displayOrder ?? 10),
    isDefault: Boolean(record.isDefault),
    isActive: isRecordActive(record),
  };
};

function PaymentForm({ open, onClose, chain, initial, onSaved }) {
  const paymentTokenUid = initial?.paymentTokenUid || initial?.uid || '';
  const editing = Boolean(paymentTokenUid);
  const [image, setImage] = useState(null);
  const [form, setForm] = useState(() => paymentFormState(initial));
  const hydratedDetailUidRef = useRef('');
  const detail = useQuery({
    queryKey: ['admin', 'payment-token', paymentTokenUid || 'new'],
    queryFn: () => adminNetworkApi.getPaymentToken(paymentTokenUid),
    enabled: Boolean(open && editing && paymentTokenUid),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const detailChainMismatch = Boolean(editing && detail.data && (
    (detail.data.chainUid && chain?.chainUid && detail.data.chainUid !== chain.chainUid)
    || (detail.data.chainId && chain?.chainId && Number(detail.data.chainId) !== Number(chain.chainId))
  ));
  const detailHasError = detail.isError || detail.isRefetchError;
  const detailReady = !editing || (detail.isSuccess && !detail.isFetching && !detailHasError && !detailChainMismatch);
  const currentToken = useMemo(() => (detail.data ? { ...initial, ...detail.data } : initial), [detail.data, initial]);

  useEffect(() => {
    if (!editing || !detail.data || detail.isFetching || detailHasError || detailChainMismatch || hydratedDetailUidRef.current === paymentTokenUid) return;
    setForm(paymentFormState(currentToken));
    setImage(null);
    hydratedDetailUidRef.current = paymentTokenUid;
  }, [currentToken, detail.data, detail.isFetching, detailChainMismatch, detailHasError, editing, paymentTokenUid]);

  const mutation = useMutation({
    mutationFn: async () => {
      const sharedPayload = {
        paymentTokenCode: form.paymentTokenCode.trim().toUpperCase(),
        paymentTokenName: form.paymentTokenName.trim(),
        paymentTokenSymbol: form.paymentTokenSymbol.trim().toUpperCase(),
        contractAddress: form.contractAddress.trim(),
        decimals: numeric(form.decimals, 6),
        isDefault: form.isDefault,
        displayOrder: numeric(form.displayOrder, 10),
        isActive: form.isActive,
      };

      if (editing) {
        const saved = await adminNetworkApi.updatePaymentToken(form.paymentTokenUid, sharedPayload);
        if (image) {
          try {
            await adminNetworkApi.updatePaymentTokenImage(form.paymentTokenUid, image);
          } catch (error) {
            error.partialSave = true;
            throw error;
          }
        }
        return saved;
      }

      return adminNetworkApi.createPaymentToken({
        chainUid: chain.chainUid,
        ...sharedPayload,
        supportsPurchase: form.supportsPurchase,
        supportsRedemption: form.supportsRedemption,
      }, image);
    },
    onSuccess: () => {
      toast.success(editing ? 'Payment token updated' : 'Payment token added');
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error?.partialSave) {
        onSaved();
        toast.warning('Payment-token settings saved, but the image was not updated', { description: getErrorMessage(error) });
        return;
      }
      toast.error('Payment token was not saved', { description: getErrorMessage(error) });
    },
  });

  const formDisabled = mutation.isPending || (editing && !detailReady);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const save = () => {
    if (editing && !detailReady) {
      toast.error('Current payment token details are still loading', { description: 'Wait for the saved details to load before making changes.' });
      return;
    }
    const error = validatePaymentForm(form);
    if (error) {
      toast.error('Complete the payment token details', { description: error });
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title={editing ? 'Edit payment token' : 'Add payment token'}
      dialogStyle={{ maxWidth: '900px' }}
      bodyClassName="px-4 py-5 sm:px-6"
      footer={(
        <>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button className="w-full sm:w-auto" onClick={save} loading={mutation.isPending} disabled={formDisabled}>{editing ? 'Save token' : 'Add token'}</Button>
        </>
      )}
    >
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
            <Network size={14} />{chain.chainName}
          </span>
          <span className="text-xs text-slate-500">Chain ID {chain.chainId}</span>
        </div>

        {editing && (detail.isPending || detail.isFetching) && !detailHasError ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-800" role="status">
            Loading the latest saved payment token details…
          </div>
        ) : null}
        {editing && detailHasError ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between" role="alert">
            <span>We couldn’t load the latest payment token details. Retry before editing this token.</span>
            <Button variant="secondary" className="w-full shrink-0 sm:w-auto" icon={RefreshCcw} onClick={() => detail.refetch()}>Retry</Button>
          </div>
        ) : null}
        {detailChainMismatch ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
            This payment token belongs to a different network. Close this dialog and select the correct network before editing it.
          </div>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
          <SectionHeader title="Token contract" description="Blockchain contract for this payment token." />
          <Input
            label="Contract address"
            required
            value={form.contractAddress}
            onChange={(event) => set('contractAddress', event.target.value)}
            placeholder="0x…"
            hint="The backend validates this token against the selected network configuration."
            disabled={formDisabled}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
          <SectionHeader title="Token details" description="Display and decimal information for the payment token." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Code" required value={form.paymentTokenCode} onChange={(event) => set('paymentTokenCode', event.target.value)} placeholder="USDC" disabled={formDisabled} />
            <Input label="Name" required value={form.paymentTokenName} onChange={(event) => set('paymentTokenName', event.target.value)} placeholder="USD Coin" disabled={formDisabled} />
            <Input label="Symbol" required value={form.paymentTokenSymbol} onChange={(event) => set('paymentTokenSymbol', event.target.value)} placeholder="USDC" disabled={formDisabled} />
            <Input label="Decimals" required type="number" min="0" value={form.decimals} onChange={(event) => set('decimals', event.target.value)} disabled={formDisabled} />
            <Input className="sm:col-span-2" label="Display order" type="number" min="0" value={form.displayOrder} onChange={(event) => set('displayOrder', event.target.value)} hint="Lower numbers appear earlier in payment-token selectors." disabled={formDisabled} />
          </div>
          <div className="mt-5">
            <ImagePicker label="Payment token image" file={image} onChange={setImage} existingUrl={resolveMasterImageUrl(currentToken)} disabled={formDisabled} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5">
          <SectionHeader
            title="Availability"
            description={editing ? 'Control whether this token is active and whether it is the default for this network.' : 'Choose how this token is available when it is created.'}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Active" checked={form.isActive} onChange={(value) => set('isActive', value)} hint="Make this token available immediately." disabled={formDisabled} />
            <Toggle label="Default token" checked={form.isDefault} onChange={(value) => set('isDefault', value)} hint={`Initial payment token on ${chain.chainName}.`} disabled={formDisabled} />
          </div>
        </section>
      </div>
    </Modal>
  );
}

function NetworkActions({ chain, onEdit }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50" onClick={() => setOpen((current) => !current)} aria-label={`Actions for ${chain.chainName}`} aria-expanded={open}>
        <MoreVertical size={17} />
      </button>
      {open ? (
        <div className="absolute right-0 bottom-full z-50 mb-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={() => { setOpen(false); onEdit(); }}><Pencil size={15} />Edit network</button>
          {chain.explorerUrl ? <a href={chain.explorerUrl} target="_blank" rel="noreferrer" className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50" onClick={() => setOpen(false)}><ExternalLink size={15} />Open explorer</a> : null}
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({ icon: Icon, value, label, tone = 'blue' }) {
  const toneClass = tone === 'green' ? 'bg-emerald-50 text-emerald-600' : tone === 'violet' ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600';
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${toneClass}`}><Icon size={22} /></span>
      <div><strong className="block text-xl font-semibold text-slate-950">{value}</strong><span className="text-sm text-slate-500">{label}</span></div>
    </div>
  );
}

function NetworkTable({ chains, onEdit }) {
  if (!chains.length) return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No networks match the current filters.</div>;

  return (
    <>
      <div className="hidden overflow-visible rounded-2xl border border-slate-200 bg-white lg:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-[.06em] text-slate-500">
            <tr>
              <th className="w-[28%] px-4 py-3.5">Network</th><th className="w-[12%] px-4 py-3.5">Chain ID</th><th className="w-[11%] px-4 py-3.5">Currency</th><th className="w-[14%] px-4 py-3.5">Environment</th><th className="w-[13%] px-4 py-3.5">Status</th><th className="w-[10%] px-4 py-3.5">Tokens</th><th className="w-[12%] px-4 py-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((chain) => {
              const imageUrl = resolveMasterImageUrl(chain);
              const active = isRecordActive(chain);
              return (
                <tr key={chain.chainUid} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                  <td className="px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-slate-500">{imageUrl ? <img src={imageUrl} alt="" className="size-full object-contain p-1.5" /> : <Network size={18} />}</span>
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><strong className="truncate text-sm text-slate-950">{chain.chainName}</strong>{chain.isDefault ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Default</span> : null}</div><span className="mt-0.5 block text-xs text-slate-500">{chain.chainCode || chain.networkName}</span></div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-700">{chain.chainId}</td>
                  <td className="px-4 py-3.5 text-slate-700">{chain.nativeCurrencySymbol || '—'}</td>
                  <td className="px-4 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${chain.isTestnet ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{chain.isTestnet ? 'Testnet' : 'Mainnet'}</span></td>
                  <td className="px-4 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><span className={`size-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />{active ? 'Active' : 'Inactive'}</span></td>
                  <td className="px-4 py-3.5 text-slate-700">{paymentTokenCount(chain)}</td>
                  <td className="px-4 py-3.5"><div className="flex justify-end"><NetworkActions chain={chain} onEdit={() => onEdit(chain)} /></div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {chains.map((chain) => {
          const imageUrl = resolveMasterImageUrl(chain);
          const active = isRecordActive(chain);
          return (
            <article key={chain.chainUid} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-slate-500">{imageUrl ? <img src={imageUrl} alt="" className="size-full object-contain p-1.5" /> : <Network size={18} />}</span>
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-950">{chain.chainName}</strong>{chain.isDefault ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Default</span> : null}</div><p className="mt-1 mb-0 text-xs text-slate-500">{chain.chainCode} · Chain ID {chain.chainId}</p></div>
                <NetworkActions chain={chain} onEdit={() => onEdit(chain)} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
                <div><dt className="text-slate-400">Currency</dt><dd className="mt-1 font-semibold text-slate-800">{chain.nativeCurrencySymbol || '—'}</dd></div>
                <div><dt className="text-slate-400">Environment</dt><dd className="mt-1 font-semibold text-slate-800">{chain.isTestnet ? 'Testnet' : 'Mainnet'}</dd></div>
                <div><dt className="text-slate-400">Status</dt><dd className={`mt-1 font-semibold ${active ? 'text-emerald-700' : 'text-slate-600'}`}>{active ? 'Active' : 'Inactive'}</dd></div>
                <div><dt className="text-slate-400">Tokens</dt><dd className="mt-1 font-semibold text-slate-800">{paymentTokenCount(chain)}</dd></div>
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}

function NetworkSelector({ chains, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative min-w-0 flex-1" ref={ref}>
      <label className="mb-1.5 block text-[13px] font-bold text-slate-800">Network</label>
      <button type="button" className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100" onClick={() => setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open}>
        {selected ? (
          <>
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-slate-500">{resolveMasterImageUrl(selected) ? <img src={resolveMasterImageUrl(selected)} alt="" className="size-full object-contain p-1" /> : <Network size={16} />}</span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{selected.chainName}</strong><span className="block truncate text-xs text-slate-500">{selected.chainCode} · Chain ID {selected.chainId} · {selected.isTestnet ? 'Testnet' : 'Mainnet'}</span></span>
          </>
        ) : <span className="flex-1 text-sm text-slate-500">Select a network</span>}
        <ChevronDown size={18} className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-40 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl" role="listbox">
          {chains.map((chain) => {
            const selectedItem = selected?.chainUid === chain.chainUid;
            const imageUrl = resolveMasterImageUrl(chain);
            return (
              <button key={chain.chainUid} type="button" className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${selectedItem ? 'bg-blue-50' : 'hover:bg-slate-50'}`} onClick={() => { onChange(chain.chainUid); setOpen(false); }} role="option" aria-selected={selectedItem}>
                <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-white text-slate-500">{imageUrl ? <img src={imageUrl} alt="" className="size-full object-contain p-1" /> : <Network size={16} />}</span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-900">{chain.chainName}</strong><span className="block truncate text-xs text-slate-500">{chain.chainCode} · {chain.chainId} · {chain.isTestnet ? 'Testnet' : 'Mainnet'}</span></span>
                {selectedItem ? <Check size={17} className="shrink-0 text-blue-600" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function PaymentTokenList({ tokens, onEdit, onDelete }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[1.45fr_1fr_.58fr_.58fr_.7fr_auto] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-bold uppercase tracking-[.08em] text-slate-500 md:grid">
        <span>Token</span><span>Contract</span><span>Purchase</span><span>Redeem</span><span>Status</span><span>Actions</span>
      </div>
      {(tokens.data || []).map((token) => {
        const tokenUid = token.paymentTokenUid || token.uid;
        const imageUrl = resolveMasterImageUrl(token);
        const active = isRecordActive(token);
        return (
          <div key={tokenUid || token.contractAddress} className="grid gap-4 border-b border-slate-100 p-5 last:border-0 md:grid-cols-[1.45fr_1fr_.58fr_.58fr_.7fr_auto] md:items-center md:gap-3">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">{imageUrl ? <img src={imageUrl} alt="" className="size-full object-contain p-1" /> : (token.paymentTokenSymbol || token.symbol || '?').slice(0, 2)}</span><div className="min-w-0"><strong className="block truncate text-sm">{token.paymentTokenName || token.name}</strong><span className="text-xs text-slate-500">{token.paymentTokenSymbol || token.symbol} · {token.decimals} decimals{token.isDefault ? ' · Default' : ''}</span></div></div>
            <div className="md:hidden"><span className="mb-1 block text-[11px] font-bold uppercase tracking-[.08em] text-slate-400">Contract</span><code className="text-xs text-slate-600" title={token.contractAddress}>{addressShort(token.contractAddress)}</code></div>
            <code className="hidden text-xs text-slate-600 md:block" title={token.contractAddress}>{addressShort(token.contractAddress)}</code>
            <div className="flex items-center justify-between md:block"><span className="text-xs font-semibold text-slate-400 md:hidden">Purchase</span><span className="text-sm">{token.supportsPurchase ? 'Yes' : 'No'}</span></div>
            <div className="flex items-center justify-between md:block"><span className="text-xs font-semibold text-slate-400 md:hidden">Redeem</span><span className="text-sm">{token.supportsRedemption ? 'Yes' : 'No'}</span></div>
            <div className="flex items-center justify-between md:block"><span className="text-xs font-semibold text-slate-400 md:hidden">Status</span><span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Disabled'}</span></div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 md:border-0 md:pt-0"><button className="grid size-9 place-items-center rounded-xl border border-slate-200 transition hover:bg-slate-50" onClick={() => onEdit(token)} aria-label={`Edit ${token.paymentTokenSymbol || token.symbol}`}><Pencil size={15} /></button><button className="grid size-9 place-items-center rounded-xl border border-rose-200 text-rose-600 transition hover:bg-rose-50" onClick={() => onDelete(token)} aria-label={`Delete ${token.paymentTokenSymbol || token.symbol}`}><Trash2 size={15} /></button></div>
          </div>
        );
      })}
      {tokens.isLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading payment tokens…</p> : null}
      {!tokens.isLoading && !tokens.data?.length ? <p className="p-8 text-center text-sm text-slate-500">No payment tokens are configured for this network.</p> : null}
    </div>
  );
}


function DeletePaymentTokenDialog({ token, chain, open, loading, onClose, onConfirm }) {
  if (!token) return null;

  const name = token.paymentTokenName || token.name || 'Payment token';
  const symbol = token.paymentTokenSymbol || token.symbol || '';
  const tokenUid = token.paymentTokenUid || token.uid;
  const imageUrl = resolveMasterImageUrl(token);

  return (
    <Modal
      open={open}
      onClose={() => !loading && onClose()}
      title="Delete payment token?"
      className="sm:max-w-md"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            className="w-full !border-rose-600 !bg-rose-600 text-white hover:!border-rose-700 hover:!bg-rose-700 sm:w-auto"
            icon={Trash2}
            loading={loading}
            onClick={() => onConfirm(tokenUid)}
          >
            Delete token
          </Button>
        </>
      )}
    >
      <div className="grid gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-500 shadow-sm">
            {imageUrl ? (
              <img src={imageUrl} alt="" className="size-full object-contain p-1.5" />
            ) : (
              (symbol || '?').slice(0, 2)
            )}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-sm font-semibold text-slate-950 sm:text-base">{name}</strong>
            <span className="mt-1 block text-xs text-slate-500">
              {[symbol, chain?.chainName].filter(Boolean).join(' · ')}
            </span>
          </span>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <CircleAlert className="mt-0.5 shrink-0 text-amber-600" size={20} aria-hidden="true" />
          <div className="min-w-0">
            <strong className="block text-sm font-semibold">This action may be rejected if the token is already in use.</strong>
            <p className="mt-1 mb-0 text-xs leading-5 text-amber-800 sm:text-sm">
              The backend protects payment tokens that are referenced by existing records. If deletion is not allowed, no data will be removed.
            </p>
          </div>
        </div>

        <p className="m-0 text-sm leading-6 text-slate-600">
          Delete this payment token from the selected network? This action cannot be undone after the backend accepts it.
        </p>
      </div>
    </Modal>
  );
}

export default function AdminNetworksPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('networks');
  const [chainModal, setChainModal] = useState(null);
  const [selectedChainUid, setSelectedChainUid] = useState('');
  const [paymentModal, setPaymentModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [networkSearch, setNetworkSearch] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [networkPage, setNetworkPage] = useState(1);

  const chains = useQuery({ queryKey: chainKey, queryFn: adminNetworkApi.listChains, staleTime: 15_000 });
  const selectedChain = useMemo(() => (chains.data || []).find((item) => item.chainUid === selectedChainUid) || chains.data?.[0] || null, [chains.data, selectedChainUid]);
  const tokens = useQuery({ queryKey: paymentKey(selectedChain?.chainUid), queryFn: () => adminNetworkApi.listPaymentTokens(selectedChain.chainUid, selectedChain.chainId), enabled: Boolean(selectedChain?.chainUid), staleTime: 15_000 });

  const deleteToken = useMutation({
    mutationFn: adminNetworkApi.deletePaymentToken,
    onSuccess: () => {
      toast.success('Payment token deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: paymentKey(selectedChain?.chainUid) });
    },
    onError: (error) => toast.error('Payment token cannot be deleted', { description: getErrorMessage(error) }),
  });

  const allChains = chains.data || [];
  const metrics = useMemo(() => ({
    total: allChains.length,
    mainnets: allChains.filter((chain) => !chain.isTestnet).length,
    testnets: allChains.filter((chain) => chain.isTestnet).length,
    active: allChains.filter(isRecordActive).length,
  }), [allChains]);

  const filteredChains = useMemo(() => {
    const search = networkSearch.trim().toLowerCase();
    return allChains.filter((chain) => {
      const matchesSearch = !search || [chain.chainName, chain.chainCode, chain.networkName, chain.chainId].some((value) => String(value ?? '').toLowerCase().includes(search));
      const matchesEnvironment = environmentFilter === 'all' || (environmentFilter === 'testnet' ? chain.isTestnet : !chain.isTestnet);
      const active = isRecordActive(chain);
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? active : !active);
      return matchesSearch && matchesEnvironment && matchesStatus;
    });
  }, [allChains, networkSearch, environmentFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredChains.length / NETWORK_PAGE_SIZE));
  const visibleChains = filteredChains.slice((networkPage - 1) * NETWORK_PAGE_SIZE, networkPage * NETWORK_PAGE_SIZE);

  useEffect(() => { setNetworkPage(1); }, [networkSearch, environmentFilter, statusFilter]);
  useEffect(() => { if (networkPage > pageCount) setNetworkPage(pageCount); }, [networkPage, pageCount]);

  const refreshChains = () => {
    queryClient.invalidateQueries({ queryKey: chainKey });
  };
  const refreshTokens = () => queryClient.invalidateQueries({ queryKey: paymentKey(selectedChain?.chainUid) });
  const requestDeletePaymentToken = (token) => {
    const paymentTokenUid = token?.paymentTokenUid || token?.uid;
    if (!paymentTokenUid) return;
    setDeleteTarget(token);
  };

  const confirmDeletePaymentToken = (paymentTokenUid) => {
    if (!paymentTokenUid || deleteToken.isPending) return;
    deleteToken.mutate(paymentTokenUid);
  };

  return (
    <div className="grid gap-5 sm:gap-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="m-0 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Network configuration</h2>
          <p className="mt-1.5 mb-0 text-sm leading-6 text-slate-600">Manage blockchain networks and chain-scoped payment tokens. Networks are deactivated instead of deleted, while chain-master changes continue to be tracked by the backend.</p>
        </div>
        <Button icon={Plus} className="w-full sm:w-auto" onClick={() => (tab === 'networks' ? setChainModal({ mode: 'create' }) : selectedChain && setPaymentModal({ mode: 'create' }))} disabled={tab === 'payments' && !selectedChain}>{tab === 'networks' ? 'Add network' : 'Add payment token'}</Button>
      </section>

      {tab === 'networks' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Network} value={metrics.total} label="Networks" />
          <MetricCard icon={ShieldCheck} value={metrics.mainnets} label="Mainnets" tone="violet" />
          <MetricCard icon={Coins} value={metrics.testnets} label="Testnets" />
          <MetricCard icon={Check} value={metrics.active} label="Active" tone="green" />
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold transition sm:flex-none ${tab === 'networks' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('networks')}><span className="inline-flex items-center gap-2"><Network size={17} />Networks <span className={`rounded-full px-2 py-0.5 text-[11px] ${tab === 'networks' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{allChains.length}</span></span></button>
        <button className={`min-h-11 flex-1 rounded-xl px-4 text-sm font-semibold transition sm:flex-none ${tab === 'payments' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-50'}`} onClick={() => setTab('payments')}><span className="inline-flex items-center gap-2"><Coins size={17} />Payment tokens</span></button>
      </div>

      {tab === 'networks' ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_160px]">
            <label className="relative block"><span className="sr-only">Search networks</span><Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input className="min-h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" value={networkSearch} onChange={(event) => setNetworkSearch(event.target.value)} placeholder="Search by network name, code, or chain ID" /></label>
            <FilterSelect
              value={environmentFilter}
              onChange={setEnvironmentFilter}
              ariaLabel="Filter networks by environment"
              options={[
                { value: 'all', label: 'All environments' },
                { value: 'mainnet', label: 'Mainnets', dot: 'bg-amber-500' },
                { value: 'testnet', label: 'Testnets', dot: 'bg-blue-500' },
              ]}
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              ariaLabel="Filter networks by status"
              options={[
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active', dot: 'bg-emerald-500' },
                { value: 'inactive', label: 'Inactive', dot: 'bg-slate-400' },
              ]}
            />
          </div>

          {chains.isLoading ? <div className="rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">Loading networks…</div> : null}
          {chains.isError ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-700"><CircleAlert className="mx-auto mb-2" /><p>Networks could not be loaded.</p><Button variant="secondary" icon={RefreshCcw} onClick={() => chains.refetch()}>Retry</Button></div> : null}
          {!chains.isLoading && !chains.isError ? <NetworkTable chains={visibleChains} onEdit={(chain) => setChainModal({ mode: 'edit', chain })} /> : null}

          {!chains.isLoading && !chains.isError && filteredChains.length ? (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
              <span>Showing {(networkPage - 1) * NETWORK_PAGE_SIZE + 1}–{Math.min(networkPage * NETWORK_PAGE_SIZE, filteredChains.length)} of {filteredChains.length} networks</span>
              <div className="flex items-center gap-1.5 self-end sm:self-auto"><button type="button" className="grid size-9 place-items-center rounded-xl border border-slate-200 disabled:opacity-40" onClick={() => setNetworkPage((page) => Math.max(1, page - 1))} disabled={networkPage <= 1} aria-label="Previous page"><ChevronLeft size={17} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, networkPage - 3), Math.max(3, networkPage)).map((page) => <button type="button" key={page} className={`grid size-9 place-items-center rounded-xl text-sm font-semibold ${page === networkPage ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`} onClick={() => setNetworkPage(page)}>{page}</button>)}<button type="button" className="grid size-9 place-items-center rounded-xl border border-slate-200 disabled:opacity-40" onClick={() => setNetworkPage((page) => Math.min(pageCount, page + 1))} disabled={networkPage >= pageCount} aria-label="Next page"><ChevronRight size={17} /></button></div>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="grid gap-5">
          <div className="relative z-20 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
            <NetworkSelector chains={allChains} selected={selectedChain} onChange={setSelectedChainUid} />
            <Button icon={Plus} className="w-full sm:w-auto" onClick={() => selectedChain && setPaymentModal({ mode: 'create' })} disabled={!selectedChain}>Add token</Button>
          </div>
          <PaymentTokenList tokens={tokens} onEdit={(token) => setPaymentModal({ mode: 'edit', token })} onDelete={requestDeletePaymentToken} />
        </div>
      )}

      {chainModal ? <ChainForm key={`${chainModal.mode}-${chainModal.chain?.chainUid || 'new'}`} open onClose={() => setChainModal(null)} initial={chainModal.chain} onSaved={refreshChains} /> : null}
      {paymentModal && selectedChain ? <PaymentForm key={`${paymentModal.mode}-${paymentModal.token?.paymentTokenUid || paymentModal.token?.uid || 'new'}`} open onClose={() => setPaymentModal(null)} chain={selectedChain} initial={paymentModal.token} onSaved={refreshTokens} /> : null}
      <DeletePaymentTokenDialog
        open={Boolean(deleteTarget)}
        token={deleteTarget}
        chain={selectedChain}
        loading={deleteToken.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeletePaymentToken}
      />
    </div>
  );
}

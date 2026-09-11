import { ArrowLeft, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { TypedDocumentUploader } from '@/components/investor/TypedDocumentUploader';
import { InvestorLayout, InvestorSecurityCard } from '@/components/investor/InvestorLayout';
import { InvestorActionBar, InvestorFormCard } from '@/components/investor/InvestorPrimitives';
import { Button } from '@/components/ui/Button';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { documentsSchema } from '@/validations/investor.schemas';

export default function IdentityDocumentsStep() {
  const {
    state,
    options,
    updateSection,
    setStep,
    uploadDocument,
    deleteDocument,
  } = useInvestorOnboarding();
  const [selectedIdentityDocumentType, setSelectedIdentityDocumentType] = useState('');
  const [errors, setErrors] = useState({});
  const documents = state.documents;

  const patchDocuments = (patch) => {
    updateSection('documents', patch);
    setErrors((current) => {
      const next = { ...current };
      Object.keys(patch).forEach((key) => delete next[key]);
      return next;
    });
  };

  const validate = () => {
    const result = documentsSchema.safeParse(documents);
    if (result.success) {
      setErrors({});
      return true;
    }
    const nextErrors = {};
    result.error.issues.forEach((issue) => { nextErrors[issue.path[0]] = issue.message; });
    setErrors(nextErrors);
    return false;
  };

  const continueFlow = () => {
    if (!validate()) {
      toast.error('Upload at least one valid identity document before continuing.');
      document.querySelector('.investor-upload-zone.is-error, .org-field__error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setStep(3);
  };

  const identityDocuments = documents.identityDocuments || [];
  const uploadsReady = Boolean(
    identityDocuments.length &&
    identityDocuments.every((file) => file.status === 'success' || file.status === 'verified'),
  );

  return (
    <InvestorLayout
      title="Identity Documents"
      description="Upload one or more clear government-issued identity documents. At least one valid document is required to continue."
      side={<InvestorSecurityCard title="Document privacy" description="Files are uploaded securely to your investor account. Only document metadata is kept in the form state, and review downloads are requested securely when needed." />}
    >
      <InvestorFormCard className="investor-form-card--spaced">
        <TypedDocumentUploader
          documentTypeLabel="Identity Document Type"
          documentTypeOptions={options.identityDocumentTypes}
          documentTypeValue={selectedIdentityDocumentType}
          onDocumentTypeChange={setSelectedIdentityDocumentType}
          value={identityDocuments}
          onChange={(nextDocuments) => patchDocuments({ identityDocuments: nextDocuments })}
          onUpload={uploadDocument}
          onDelete={deleteDocument}
          error={errors.identityDocuments}
          selectionHint="Select an identity document type first, then upload the matching file. You can add one or more identity documents. Re-uploading a type replaces the previously stored file for that type."
        />
      </InvestorFormCard>

      <InvestorFormCard title="Document quality guidance" description="Better source images reduce review delays and help keep the onboarding experience smooth." className="investor-form-card--spaced">
        <div className="investor-quality-grid">
          <section>
            <h3><CheckCircle2 size={18} /> Good examples</h3>
            <ul><li>Clear image</li><li>All four corners visible</li><li>No glare</li><li>Text readable</li><li>Original color image</li></ul>
          </section>
          <section className="is-bad">
            <h3><XCircle size={18} /> Avoid</h3>
            <ul><li>Blurry image</li><li>Cropped document</li><li>Heavy shadow</li><li>Flash glare</li><li>Hidden information</li><li>Black-and-white photocopy when color is required</li></ul>
          </section>
        </div>
      </InvestorFormCard>

      <InvestorActionBar>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(1, { markReached: false })}>Back</Button>
        <span className="investor-action-bar__spacer" />
        <Button icon={ArrowRight} onClick={continueFlow} disabled={!uploadsReady}>Continue to Compliance</Button>
      </InvestorActionBar>
    </InvestorLayout>
  );
}

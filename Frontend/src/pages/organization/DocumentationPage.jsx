import { ArrowLeft, ArrowRight, LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DocumentUploader } from '@/components/organization/DocumentUploader';
import { FormSection } from '@/components/organization/FormSection';
import { OrganizationActionBar } from '@/components/organization/OrganizationActionBar';
import { OrganizationPageLayout } from '@/components/organization/OrganizationPageLayout';
import { getOrganizationStepRoute } from '@/components/organization/OrganizationStepper';
import { UploadedDocumentList } from '@/components/organization/UploadedDocumentList';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ROUTES } from '@/config/routes';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useOrganization } from '@/hooks/useOrganization';
import { useOrganizationOptions } from '@/hooks/useOrganizationOptions';
import { organizationDocumentService } from '@/services/organizationDocumentService';
import { getErrorMessage } from '@/utils/error';

const allowedFileSignatures = Object.freeze({
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
});
const maxFileSize = 10 * 1024 * 1024;
const isSupportedFile = (file) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const expectedMimeType = allowedFileSignatures[extension];
  return Boolean(expectedMimeType && file.type === expectedMimeType);
};

export default function DocumentationPage() {
  useDocumentTitle('Upload Documents');
  const navigate = useNavigate();
  const {
    organization,
    uploadDocuments,
    deleteDocument,
    refreshDocuments,
    setCurrentStep,
  } = useOrganization();
  const { documentTypeOptions } = useOrganizationOptions();
  const [documents, setDocuments] = useState(organization.documents);
  const [documentType, setDocumentType] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [removeDocument, setRemoveDocument] = useState(null);
  const [replaceDocument, setReplaceDocument] = useState(null);
  const replaceInputRef = useRef(null);

  useEffect(() => {
    setDocuments(organization.documents);
  }, [organization.documents]);

  const validateFile = (file, selectedType, replacingId = null) => {
    if (!selectedType) return 'Select a document type before choosing a file.';
    if (!isSupportedFile(file)) {
      return 'Only verified PDF, PNG, JPG, and JPEG files can be uploaded.';
    }
    if (file.size > maxFileSize) return 'The selected file exceeds the 10 MB size limit.';
    const duplicate = documents.some(
      (document) =>
        document.id !== replacingId &&
        document.documentTypeUid === selectedType &&
        document.documentType !== 'Other Supporting Document',
    );
    if (duplicate) return 'This document type is already uploaded. Replace the existing file instead.';
    return '';
  };

  const storeFile = async (file, selectedType, replacing = null) => {
    const validationError = validateFile(file, selectedType, replacing?.id);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setUploading(true);
    setProgress(1);
    let uploadedDocument = null;

    try {
      const uploaded = await uploadDocuments(selectedType, [file], (event) => {
        if (!event.total) return;
        setProgress(Math.max(1, Math.round((event.loaded / event.total) * 100)));
      });
      uploadedDocument = uploaded[0];
      if (!uploadedDocument) throw new Error('The backend did not return the uploaded document.');

      if (replacing) {
        try {
          await deleteDocument(replacing.documentUid || replacing.id);
        } catch (deleteError) {
          await deleteDocument(uploadedDocument.documentUid || uploadedDocument.id).catch(
            () => undefined,
          );
          throw deleteError;
        }
      }

      const nextDocuments = replacing
        ? documents.map((document) =>
            document.id === replacing.id ? uploadedDocument : document,
          )
        : [...documents, uploadedDocument];
      setDocuments(nextDocuments);
      setProgress(100);
      setDocumentType('');
      setReplaceDocument(null);
      toast.success(replacing ? 'Document replaced' : 'Document uploaded', {
        description: `${file.name} is securely stored in the organization document vault.`,
      });
    } catch (uploadError) {
      setError(getErrorMessage(uploadError, 'The document could not be uploaded. Try again.'));
      await refreshDocuments().then(setDocuments).catch(() => undefined);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const preview = async (document, download = false) => {
    try {
      await organizationDocumentService.open(document, download);
    } catch (previewError) {
      toast.error('Document unavailable', {
        description: getErrorMessage(previewError, 'The document could not be opened.'),
      });
    }
  };

  const removeConfirmed = async () => {
    if (!removeDocument) return;
    setUploading(true);
    try {
      await deleteDocument(removeDocument.documentUid || removeDocument.id);
      setDocuments((current) =>
        current.filter((document) => document.id !== removeDocument.id),
      );
      toast.success('Document removed');
    } catch (removeError) {
      toast.error(getErrorMessage(removeError, 'Unable to remove document.'));
    } finally {
      setUploading(false);
      setRemoveDocument(null);
    }
  };

  const continueFlow = () => {
    if (!documents.length) {
      setError('Upload at least one organization document before continuing.');
      return;
    }
    setError('');
    setCurrentStep(5);
    navigate(ROUTES.organizationReview);
  };

  const goToStep = (targetStep) => {
    setCurrentStep(targetStep);
    navigate(getOrganizationStepRoute(targetStep));
  };

  return (
    <OrganizationPageLayout
      step={4}
      title="Upload Documents"
      description="To comply with institutional regulations, provide the required legal filings. Documents must be clear, valid, and recently issued."
      onStepChange={uploading ? undefined : goToStep}
    >
      <div className="org-documents-grid">
        <FormSection title="Add legal filing" description="Select a document category and upload the corresponding file.">
          <DocumentUploader
            documentType={documentType}
            documentTypeOptions={documentTypeOptions}
            onDocumentTypeChange={setDocumentType}
            onFileSelected={(file) => storeFile(file, documentType)}
            uploading={uploading}
            progress={progress}
            error={error}
          />
          <div className="org-vault-note">
            <LockKeyhole size={16} /> Authenticated encrypted document vault
          </div>
        </FormSection>

        <Card className="org-uploaded-panel">
          <header className="org-form-card__header">
            <div>
              <h2>Uploaded Documents</h2>
              <p>Review, replace, or remove files before final submission.</p>
            </div>
            <span className="org-document-count">{documents.length}</span>
          </header>
          <UploadedDocumentList
            documents={documents}
            onPreview={(document) => preview(document)}
            onDownload={(document) => preview(document, true)}
            onRemove={setRemoveDocument}
            onReplace={(document) => {
              setReplaceDocument(document);
              window.setTimeout(() => replaceInputRef.current?.click(), 0);
            }}
          />
          <input
            ref={replaceInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            hidden
            onChange={(event) => {
              const [file] = Array.from(event.target.files || []);
              if (file && replaceDocument) {
                storeFile(file, replaceDocument.documentTypeUid, replaceDocument);
              }
              event.target.value = '';
            }}
          />
        </Card>
      </div>

      <OrganizationActionBar>
        <Button
          type="button"
          variant="ghost"
          icon={ArrowLeft}
          disabled={uploading}
          onClick={() => {
            setCurrentStep(3);
            navigate(ROUTES.organizationUbo);
          }}
        >
          Back to UBO Details
        </Button>
        <span className="org-action-bar__spacer" />
        <Button type="button" disabled={uploading} onClick={continueFlow}>
          Continue to Review <ArrowRight size={17} />
        </Button>
      </OrganizationActionBar>

      <Modal
        open={Boolean(removeDocument)}
        onClose={() => !uploading && setRemoveDocument(null)}
        title="Remove uploaded document?"
        footer={
          <div className="org-modal-actions">
            <Button
              variant="secondary"
              disabled={uploading}
              onClick={() => setRemoveDocument(null)}
            >
              Cancel
            </Button>
            <Button variant="danger" loading={uploading} onClick={removeConfirmed}>
              Remove Document
            </Button>
          </div>
        }
      >
        <p>The file will be permanently removed from the organization’s backend document vault.</p>
      </Modal>
    </OrganizationPageLayout>
  );
}

import { ArrowLeft, ArrowRight, Camera, CheckCircle2, Lightbulb, RotateCcw, Save, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FileUploadZone } from '@/components/investor/FileUploadZone';
import { InvestorLayout } from '@/components/investor/InvestorLayout';
import { InvestorActionBar, InvestorFormCard, StatusNotice } from '@/components/investor/InvestorPrimitives';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useInvestorOnboarding } from '@/hooks/useInvestorOnboarding';
import { simulateCameraCapture, simulateSelfieVerification } from '@/services/investor';

export default function SelfieVerificationStep() {
  const { state, updateSection, setStep, saveDraft, savingDraft } = useInvestorOnboarding();
  const [cameraLoading, setCameraLoading] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const documents = state.documents;

  const verifySelfie = async (selfie) => {
    setVerificationError('');
    updateSection('documents', { selfie, selfieVerificationStatus: 'verifying' });
    try {
      await simulateSelfieVerification();
      updateSection('documents', {
        selfie: { ...selfie, status: 'verified' },
        selfieVerificationStatus: 'verified',
      });
      toast.success('Selfie verification completed.');
    } catch (error) {
      updateSection('documents', { selfieVerificationStatus: 'failed' });
      setVerificationError(error.message || 'Selfie verification failed.');
    }
  };

  const openCamera = async () => {
    if (cameraLoading) return;
    setCameraLoading(true);
    setVerificationError('');
    try {
      const capture = await simulateCameraCapture();
      await verifySelfie(capture);
    } catch (error) {
      setVerificationError(error.message || 'Unable to open the simulated camera.');
    } finally {
      setCameraLoading(false);
    }
  };

  const removeSelfie = () => {
    if (documents.selfie?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(documents.selfie.previewUrl);
    updateSection('documents', { selfie: null, selfieVerificationStatus: 'not_started' });
    setVerificationError('');
  };

  const continueFlow = () => {
    if (documents.selfieVerificationStatus !== 'verified') {
      toast.error('Complete the simulated selfie verification before continuing.');
      return;
    }
    setStep(4);
  };

  const selfieReady = documents.selfieVerificationStatus === 'verified';

  return (
    <InvestorLayout
      title="Selfie Verification"
      description="Capture or upload a clear selfie to confirm that the person creating the profile matches the submitted identity."
      side={
        <Card className="investor-side-card">
          <span className="investor-side-card__icon"><Lightbulb size={22} /></span>
          <h2>Selfie guidance</h2>
          <ul>
            <li><CheckCircle2 size={16} /> Keep your face centered</li>
            <li><CheckCircle2 size={16} /> Use adequate lighting</li>
            <li><CheckCircle2 size={16} /> Remove sunglasses or face coverings</li>
            <li><CheckCircle2 size={16} /> Avoid blurry images</li>
            <li><CheckCircle2 size={16} /> Ensure only one person is visible</li>
          </ul>
        </Card>
      }
    >
      <InvestorFormCard title="Take a clear selfie" description="Use a clear, recent photo so the identity check can be completed successfully.">
        <div className="investor-selfie-stage">
          <div className={`investor-selfie-preview${documents.selfie ? ' has-selfie' : ''}`}>
            {documents.selfie?.previewUrl ? (
              <img src={documents.selfie.previewUrl} alt="Selfie preview" />
            ) : (
              <div className="investor-selfie-illustration">
                <span><UserRound size={64} /></span>
                <i aria-hidden="true" />
              </div>
            )}
            {documents.selfieVerificationStatus === 'verifying' ? <div className="investor-selfie-overlay" role="status">Verifying selfie…</div> : null}
            {selfieReady ? <span className="investor-selfie-verified"><CheckCircle2 size={18} /> Verified</span> : null}
          </div>

          <div className="investor-selfie-controls">
            <h3>{documents.selfie ? 'Selfie added' : 'Position your face inside the frame'}</h3>
            <p>Use the simulated camera or upload a supported image. JPG, JPEG, and PNG files up to 10 MB are accepted.</p>
            <div className="investor-selfie-buttons">
              <Button icon={documents.selfie ? RotateCcw : Camera} onClick={openCamera} loading={cameraLoading || documents.selfieVerificationStatus === 'verifying'}>
                {documents.selfie ? 'Retake Selfie' : 'Open Camera'}
              </Button>
              {documents.selfie ? <Button variant="ghost" icon={Trash2} onClick={removeSelfie}>Remove</Button> : null}
            </div>
          </div>
        </div>

        <div className="investor-selfie-divider"><span>or upload a selfie</span></div>
        <FileUploadZone
          label="Upload Selfie"
          description="Choose a clear, recent image showing only your face."
          imageOnly
          value={documents.selfie}
          onChange={(selfie) => {
            updateSection('documents', {
              selfie,
              selfieVerificationStatus: selfie?.status === 'verified' ? 'verified' : 'not_started',
            });
          }}
          onUploadComplete={(selfie) => verifySelfie(selfie)}
          error={verificationError}
          disabled={documents.selfieVerificationStatus === 'verifying'}
        />

        {selfieReady ? <StatusNotice type="success" title="Selfie verified">Your selfie verification is complete.</StatusNotice> : null}
        {verificationError ? (
          <div className="investor-retry-row">
            <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => documents.selfie && verifySelfie(documents.selfie)}>Retry Verification</Button>
          </div>
        ) : null}
      </InvestorFormCard>

      <InvestorActionBar>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => setStep(2, { markReached: false })}>Back</Button>
        <Button variant="secondary" icon={Save} loading={savingDraft} onClick={() => saveDraft({ documents, currentStep: 3, highestStepReached: state.highestStepReached })}>Save Draft</Button>
        <span className="investor-action-bar__spacer" />
        <Button icon={ArrowRight} onClick={continueFlow} disabled={!selfieReady}>Continue to Eligibility</Button>
      </InvestorActionBar>
    </InvestorLayout>
  );
}

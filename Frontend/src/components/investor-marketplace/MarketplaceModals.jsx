import { BadgeCheck, FileCheck2, Info, UserRoundCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const topicIcon = (code) => code === 'ACCREDITED_INVESTOR' ? BadgeCheck : UserRoundCheck;
const topicLabel = (topic) => topic?.label || String(topic?.claimTopicCode || 'Required claim').replaceAll('_', ' ');

export function CompleteVerificationModal({ open, onClose, verification, onGoToProfile }) {
  const topics = verification?.topics || [];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Complete Your Verification Profile"
      className="sm:max-w-lg"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onGoToProfile}>Go to Profile</Button>
        </>
      )}
    >
      <div className="marketplace-modal-stack">
        <p className="marketplace-modal-copy">This token requires claim-topic documents that are currently missing from your investor profile.</p>
        <div className="marketplace-verification-list">
          {topics.length ? topics.map((topic) => {
            const Icon = topicIcon(topic.claimTopicCode);
            return (
              <div key={topic.id || topic.claimTopicCode} className={topic.satisfied ? 'is-complete' : 'is-missing'}>
                <span><Icon size={17} /> {topicLabel(topic)}</span>
                <strong>{topic.satisfied ? 'Available' : 'Required'}</strong>
              </div>
            );
          }) : (
            <div className="is-missing"><span><UserRoundCheck size={17} /> Required investor documents</span><strong>Required</strong></div>
          )}
        </div>
        <div className="marketplace-modal-note"><Info size={17} /><span>Upload the missing documents from your investor profile. Eligibility will be checked again before an interest is created.</span></div>
      </div>
    </Modal>
  );
}

export function SubmitInterestModal({ open, onClose, token, onConfirm, loading = false, note = '', onNoteChange, requiredTopics = [] }) {
  if (!token) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit Investment Interest"
      className="sm:max-w-lg"
      trapFocus
      footer={(
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={onConfirm} loading={loading}>Submit Interest</Button>
        </>
      )}
    >
      <div className="marketplace-modal-stack">
        <div className="marketplace-modal-hero-icon"><FileCheck2 size={21} /></div>
        <p className="marketplace-modal-copy">Your investor identity and eligible documents will be available to <strong>{token.issuer}</strong> for review. Submitting interest does not start a blockchain transaction.</p>
        {requiredTopics.length ? (
          <div>
            <span className="marketplace-modal-label">Required claim topics</span>
            <div className="marketplace-modal-document-list">
              {requiredTopics.map((topic) => {
                const Icon = topicIcon(topic.claimTopicCode);
                return <span key={topic.id || topic.claimTopicCode}><Icon size={15} /> {topicLabel(topic)}</span>;
              })}
            </div>
          </div>
        ) : null}
        <label className="marketplace-interest-note-field">
          <span>Note to issuer <small>Optional</small></span>
          <textarea value={note} onChange={(event) => onNoteChange?.(event.target.value)} placeholder="Add any context you want the issuer to review with this interest." rows={3} />
        </label>
      </div>
    </Modal>
  );
}

// Kept for compatibility with any older imports. The backend journey does not expose a separate
// claim-submission endpoint; missing claim topics are satisfied through the investor document API.
export function SubmitClaimsModal({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="Required Documents" className="sm:max-w-lg" trapFocus footer={<Button onClick={onClose}>Close</Button>}>
      <div className="marketplace-modal-stack"><p className="marketplace-modal-copy">Required claim topics are satisfied by uploading matching investor documents from your profile.</p></div>
    </Modal>
  );
}

# Investor Review Document UI Update

## Review & Submit

- Removed the standalone **Document Review** card.
- Identity documents are reviewed directly inside **Identity Verification**.
- Accreditation documents are reviewed directly inside **Accredited Investor Status**.
- Uploaded documents use the same compact row treatment as the upload screens: file icon, filename, document type, metadata, success state, and a dedicated eye icon for preview.
- The eye icon continues to use the authenticated investor document API to load the secure preview.
- The document preview modal no longer shows a **Download** button. Image zoom/rotate/reset and the browser **Open** action remain available.
- Existing Update actions and backend document references are unchanged.
- Responsive behavior is preserved for desktop, tablet, and mobile layouts.

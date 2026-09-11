# Investor Dashboard Live API Integration

The signed-in Investor dashboard is built from the backend APIs already used by the investor portal. It does not use mock portfolio values, fake activities, fixed counts, or hardcoded investment records.

## Data sources

- `GET /investors/me` supplies the investor profile, profile reference, ONCHAINID reference, primary wallet, location, document metadata, onboarding status, and submitted/updated timestamps.
- `GET /investments/me/interests` supplies the investor's investment applications and their current issuer/claim/registration state.
- `GET /investments/me/invitations?page=1&limit=4&status=all` supplies recent invitation rows and the invitation total.
- `GET /investments/me/invitations?page=1&limit=1&status=SENT` supplies the unread/new invitation total without estimating it on the client.
- `GET /investments/tokens?page=1&limit=4&status=deployed` supplies the current marketplace offering total and dashboard offering previews.

## Dashboard behavior

The dashboard derives the following values directly from the API responses:

- total applications;
- applications that currently require investor action;
- total invitations and new invitation count;
- registered assets (applications whose current interest state is registered/ready to invest);
- deployed marketplace offering count;
- recent application and invitation activity;
- current profile, ONCHAINID, wallet, document count, location, and submitted date.

The Action Center is derived from current application/invitation state. It can surface new invitations, required claim work, eligible rejected-claim resubmissions, registered assets, or marketplace discovery when there is no higher-priority action.

Opening an invitation from the dashboard uses the same invitation behavior as the Invitations page: the existing idempotent viewed acknowledgement is sent, then the user is routed to the corresponding marketplace token detail page.

## Reliability and UX

Dashboard sections are loaded independently with settled requests. If one backend resource is unavailable, data from successful resources remains visible and a retry banner is shown instead of replacing the complete dashboard with mock values. The Refresh action reloads both investor profile data and dashboard investment data.

The dashboard keeps the existing investor routes and workflows intact: Marketplace, My Applications, Invitations, Asset Management, Profile, purchase, send, redeem, and claim flows are not replaced.

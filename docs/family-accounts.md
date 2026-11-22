# LifeSims — family profiles and secure accounts

Status: **local Family Studio implemented in feature branch; cloud accounts NOT implemented**.

## What is implemented

- Local adult/child character profiles with independent existing LifeSims save keys. The original adult's \`lifesims-visual-v1\` save remains unchanged.
- Locally processed portrait photographs (resized into avatars). No face recognition, 3D person reconstruction, or cloud image processing.
- Per-profile photographed rooms saved in IndexedDB with manually placed clickable object hotspots. The original illustrated scene remains available.
- Parent/child, relative, friend, and colleague **local** links between profiles on the same device.
- Recorded care with 24-hour reciprocal *game* resource bonus: +5 for the recipient and +3 for the caregiver, with a daily action limit and overall +18 cap. Does not imply a health improvement.
- Adult Oura and Google Calendar integrations do not initialize in a child profile, to prevent accidental cross-profile imports.
- Local avatar and room-image deletion controls.

**IMPORTANT:** Local profiles have no passwords, remote sign-in, invitation acceptance, cross-device sync or cross-device friendships. In-browser switching does not authenticate a child. Data is not yet backed up to the cloud. Do not describe this as an account system.

## Cloud architecture required for the next stage

1. Select a maintained authentication and database provider (e.g. managed PostgreSQL + properly operated authentication). Provision it under the correct owner account, after confirming the workspace and hosting/privacy settings. Do not store passwords in the frontend or GitHub.
2. Add server-controlled user identities, including guardian-managed child subprofiles. Children must not be enrolled for unrestricted public networking. Review jurisdiction-specific child privacy and consent requirements before public onboarding.
3. Store a **separate, ownership-scoped versioned save** per account. Migrate an existing browser save only after presenting a verified preview and explicit approval. Keep its original browser backup intact. Conflict handling must avoid overwriting newer records.
4. Separate permissions: a guardian can manage child accounts and grant care effects; a friend/colleague sees only what the recipient elects to share. Private diary, medications, physical indicators and other sensitive data remain private by default.
5. Social graph: relations require explicit invitation and recipient approval, can be revoked or blocked. Relationships with minors require guardian approval and prevent unsolicited contact, search and public profile discovery.
6. Care transactions must be validated, authenticated, rate-limited and idempotent on the server. The resource algorithm is game-only; child and parent resources should change only on their respective accounts after confirmation.
7. Photos: private object storage, signed upload/download requests, resizing locally where possible, deletion and retention policy, no public face recognition. AI-assisted 2D/3D generation requires a separate processing service and user approval.
8. Provide account export, recovery, deletion, and parental control; test each against direct API calls, not only UI visibility.

## Review checklist before merging

- Original user save read/write and JSON backup stay on \`lifesims-visual-v1\`.
- A new child profile must not load the parent's legacy or recovery save.
- Switching profiles must not cause Google/Oura data to be imported for the wrong person.
- Local family images remain on-device and can be removed independently.
- Existing illustrated room hotspots still work when photo view is turned off.
- Custom photo room hotspots invoke the *existing* object actions.
- Social links are described as local only, never as verified reciprocal friendship across phones.
- Care bonuses expire and are bounded; missing data are not silently turned into verified health metrics.

## Deployment

The live GitHub Pages site serves \`main\`, not this feature branch. A PR is a review artifact, not a deployment. Before publishing, perform mobile-browser interaction checks, test a real existing backup, and check GitHub Pages deployment and any service-worker cache changes.

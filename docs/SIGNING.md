# Optional build signing: preparation, not a runtime fee

Deepfield has no signing subscription or paid runtime dependency. This opt-in workflow prepares a future trusted Authenticode route if Chris chooses one. No provider is selected, no certificate is available, and nothing has been signed. Smart App Control stays On; application execution remains paused. Signing is not a promise of policy acceptance or a substitute for testing.

## Scope and prerequisites

Use PowerShell 7. Only `Deepfield.Api.dll`, `Deepfield.Engine.dll` and optional `Deepfield.Api.exe` are eligible. Third-party dependencies are listed but never signed or re-signed. Unknown `Deepfield.*.dll`/`.exe` files fail closed. Additional first-party test executables require a separate reviewed allowlist increment; this workflow deliberately cannot sign the entire test tree.

Prepare fresh **copies** of known first-party publish outputs in a unique child of `artifacts/signing/` in this checkout. Never use live saves, `bin` directories, a linked directory, hard-linked files, downloaded arbitrary binaries renamed as Deepfield, or concurrent writers. The script inventories hashes; it does not establish source provenance or build/publish anything. Record the source commit and build commands alongside your release review. Staging is ignored by Git.

An existing trusted RSA code-signing certificate and explicitly chosen timestamp service are needed for signing. The current Sign adapter selects a certificate by exact thumbprint from an existing Windows My store; its key may be managed by an already configured provider. This is one adapter, **not a requirement for every signing service**, and a store entry alone does not prove Smart App Control will accept the result. No PFX password, automatic certificate selection, self-signed certificate, trust-root installation, provider installation or arbitrary command hook is supported.

## Safe planning now

```powershell
./scripts/sign-build.ps1 -StageDirectory "$PWD/artifacts/signing/review-copy"
./tests/signing-checks.ps1
```

Default `Plan` only inventories allowlisted staged files, hashes and exclusions. It does not access certificates, call a signer, contact a service or execute an application. An absent stage or missing required output fails. Tests create text-only fake DLL fixtures, check scope/configuration and remove only their unique fixture directory.

## Future explicit preflight and signing

These examples are documentation, not authorization to acquire certificates or configure services. Supply configuration only after a provider/certificate is chosen and set up separately:

```powershell
$options = @{
  StageDirectory = "$PWD/artifacts/signing/review-copy"
  CertificateThumbprint = '<exact 40-hex code-signing certificate thumbprint>'
  SignToolPath = '<already installed Windows SDK path>/signtool.exe'
  TimestampUrl = 'https://<chosen RFC3161 timestamp service>'
  StoreLocation = 'CurrentUser'
}
./scripts/sign-build.ps1 -Mode Preflight @options
# Only when signing itself is explicitly intended:
./scripts/sign-build.ps1 -Mode Sign @options
```

Preflight rejects missing configuration before certificate/provider access. With complete configuration it checks the selected certificate, local chain, EKU, validity, RSA key type and private-key association. It does not invoke SignTool or the signing provider. The explicit local chain check disables downloads and skips revocation; Windows Authenticode validation of SignTool itself may consult Windows trust services. Preflight does not prove provider authentication, key access, revocation status, timestamp availability or SAC acceptance.

Sign requires an already installed, valid Microsoft-signed SignTool, rejects staged links and existing signatures, uses SHA256 digests and an explicit RFC3161 timestamp, then verifies every result and expected signer. Actual signing/verification can contact the configured timestamp/provider and trust/revocation services; those operations have not been performed here. Nonzero SignTool exits, including warnings, fail. A signing report records verified files' before/after hashes and failure/success. Partial failure may leave staged files signed: do not distribute them or copy them over a live build. Start with fresh copies after diagnosis; never silently strip signatures or alter trust.

`Verify` also supports externally signed outputs without importing the provider's certificate into a Windows store:

```powershell
./scripts/sign-build.ps1 -Mode Verify -StageDirectory '<stage>' `
  -CertificateThumbprint '<expected signer thumbprint>' -SignToolPath '<signtool.exe>'
```

Obtain the expected signer identity from your approved provider/release records, not merely by trusting whichever certificate appears on an unknown file. Verify checks Windows Authenticode validity, exact signer and timestamp. It does not launch Deepfield, prove public-root eligibility under SAC, or authorize resuming blocked execution. Keep third-party signature/provenance review separate; do not sign dependencies with your identity to make them load.

## Optional cloud path, not selected

Azure Artifact Signing is one possible managed-key provider. Its [official quickstart](https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart) covers account, identity validation and certificate-profile prerequisites. None has been created or authorized. The [official signing integration](https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations) uses SignTool with a provider signing library and metadata rather than requiring a local private-key certificate. If selected later, use only the reviewed staged target list with the official integration, then use Verify above with approved signer identity. Cloud certificate rotation may require updated expected thumbprints. No cloud adapter, authentication grant, vendor SDK or paid dependency is added to Deepfield by this increment.

## Evidence and limits

Planner/configuration tests and PowerShell parsing can run without Deepfield binaries. Real certificate preflight, signing, timestamping, signature verification and SAC execution remain **unrun**. The prior DLL block and game verification limits remain in VERIFICATION.md. Do not retry blocked executables, change protection, import roots, relocate binaries for execution or use alternative execution routes as part of this workflow.

Microsoft references: [SignTool options and verification](https://learn.microsoft.com/en-us/windows/win32/seccrypto/signtool), [Smart App Control code-signing guidance](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/code-signing-for-smart-app-control). Consult these and the selected provider before a later signing run. Strong-name assembly signing is not this Authenticode workflow.

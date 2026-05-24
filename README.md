# ⬡ ChainCred

ChainCred is a decentralized credential management platform built on the Cardano blockchain. It lets individuals store, manage, and share their academic and professional credentials, while organizations can issue and verify those credentials directly — with every issuance and verification permanently recorded on-chain.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | CSS Modules |
| Blockchain | Cardano Preview Testnet |
| Wallet integration | MeshSDK (`@meshsdk/core`, `@meshsdk/react`) |
| IPFS storage | Blockfrost IPFS API |
| File hashing | Web Crypto API (SHA-256) |
| Address encoding | Custom Bech32 encoder (CIP-19) |
| State / persistence | React Context + `localStorage` |

---

## Features

### Wallet-Based Authentication

Users register and log in exclusively through a CIP-30 compatible Cardano wallet (e.g. Lace). There are no passwords. On login, the app reads the wallet's change address, resolves it to a Bech32 address, and looks it up against the locally registered user store.

Two account types are supported, both registered through the same flow:

- **Individual** — credential holders who store and share their credentials
- **Organization** — institutions that issue and verify credentials for registered holders

The app also detects when a connected wallet is disabled or removed mid-session and prompts the user to reconnect via a blocking modal.

### Credential Vault

Each holder has a personal vault displaying all credentials in their wallet. The vault includes:

- Total, verified, and pending credential counts
- Search and status filter (all / verified / pending)
- Credential cards showing institution name, credential name, issue date, and status badge
- A **Scan ↗** link to `preview.cardanoscan.io` for credentials with an on-chain transaction hash
- A **View** button that opens the document from IPFS
- Edit button for pending credentials, locked once verified
- Delete button requiring wallet confirmation

### Credential Issuance (Organization Side)

Organizations issue credentials directly to registered holders through a guided modal:

1. Search for a registered holder by name or email
2. Enter the credential name and issue date
3. Attach the supporting document (PDF, PNG, JPG, or WebP — up to 50 MB)
4. ChainCred computes the file's SHA-256 hash using the Web Crypto API
5. The file is uploaded to IPFS via the Blockfrost IPFS API and pinned for persistence
6. A Cardano transaction is built and signed using a MeshSDK `MeshWallet`, embedding credential metadata under label `674`
7. The transaction is submitted to the Cardano Preview Testnet via Blockfrost
8. The credential is written directly to the recipient's vault as verified

### Credential Verification & Revocation (Organization Side)

Organizations have a **Pending** page listing credentials submitted to them awaiting review:

- **Approve** — submits a verification transaction to Cardano and marks the credential as verified
- **Reject** — marks it as rejected without a chain transaction
- **Bulk approve or reject** — select multiple credentials via checkbox and action them together
- **Revoke** — available from the main dashboard for any verified credential, used when a mistake occurs or a holder's standing changes

### Self-Submission (Holder Side)

Holders can submit their own credentials for organization review. They search for a registered organization by name, fill in the credential details, and attach the supporting document. The IPFS upload and SHA-256 hashing pipeline runs the same as org-side issuance. The credential lands in the organization's Pending queue awaiting approval.

### Share Center

Holders can generate unique share links to send their credential portfolio to a recipient such as an HR recruiter. The recipient does not need a ChainCred account or a Cardano wallet to view the portfolio. Each link contains the holder's wallet address and a unique token tied to the recipient's name.

The Share Center lists all generated links, shows who last viewed them and when, and lets the holder toggle access on or off. Note that share link state is stored in `localStorage` — revocation and portfolio data are only reflected within the same browser. A recipient on a different device will not see revocation changes and will see an empty profile, as their browser has no access to the holder's local data.

### Public Profile

When a recipient opens a share link, the app reads the wallet and token from the URL and displays the holder's credentials. Verified credentials show their Cardanoscan link and IPFS document button.

---

## Environment Variables

```env
VITE_BLOCKFROST_API_KEY=previewXXXXXXXXXXXXXXXXXXXX
VITE_BLOCKFROST_IPFS_KEY=ipfsXXXXXXXXXXXXXXXXXXXXXX
VITE_APP_WALLET_MNEMONIC=word1 word2 word3 ... word24
```

The mnemonic wallet signs and submits issuance and verification transactions. Use a dedicated hot wallet funded with test ADA on the Preview network.

---

## Getting Started

```bash
git clone https://github.com/your-org/chaincred.git
cd chaincred
npm install
cp .env.example .env   # fill in your Blockfrost keys and mnemonic
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Install a Cardano wallet extension (e.g. [Lace](https://www.lace.io)) to register and log in.

---

## Known Limitations

- **localStorage is browser-local.** Credential data and share link state do not sync across devices or browsers. Share links only work fully within the same browser they were generated on.
- **Mnemonic in the client.** The signing wallet's mnemonic is loaded from an environment variable into the browser bundle. A production system should move transaction signing to a backend service.
- **No smart contract enforcement.** Credential status is managed through metadata conventions, not an on-chain script.
- **Preview Testnet only.** Migrating to mainnet requires changing the `networkId` in `MeshWallet`, updating Blockfrost project keys, and changing the Bech32 address prefix from `addr_test` to `addr`.

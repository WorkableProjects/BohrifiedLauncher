# OASIS data: encrypted file + GitHub

When OASIS runs **on your computer** (`npm run dev`, `npm run dev:host` or `npm run serve`) it saves to a file instead of the browser. On the hosted website, with no local server, it keeps using the browser's storage.

## How it works

```
OASIS page ──(encrypt with the tutor's password)──▶ local server ──▶ .oasis-data/caden.oasis.json
                                                                   └─▶ git commit + push ─▶ GitHub, branch oasis-data
```

- **One file per tutor** (`caden.oasis.json`, `jayden.oasis.json`), holding all of that tutor's classes, students, assignments, grades and behavior.
- **Encryption happens in the browser.** AES-256-GCM; the key comes from the tutor's password via PBKDF2-SHA256 (250,000 rounds, random salt in the file). The server, git and GitHub never see the password, the key or readable data. The file is also bound to the tutor's id, so a file can't be swapped between tutors.
- **The file is the source.** Signing in reads it; every edit rewrites it (about 0.6 s after you stop typing). Every 10 seconds OASIS checks whether the file changed (another computer, a `git pull`) and loads the newer version if you have no unsaved edits. If both changed, you choose which to keep.
- **GitHub.** `.oasis-data/` is a separate git repository (ignored by the main project) with the same `origin`, on the branch `oasis-data`. About 8 seconds after the last change it commits, merges anything new from GitHub, and pushes. A computer with no `.oasis-data/` starts from the GitHub copy. The header shows `Saved to file · GitHub up to date 12:31 PM`; **Sync now** pushes immediately. Closing the server pushes anything pending.
- Git uses whatever GitHub access your computer already has for this project. Failed pushes retry (2, 4, 8, 16 s); the badge shows the error until the next success.

## Rules worth knowing

- **Passwords unlock the data.** Whoever has the password can read that tutor's file; if it's lost, the file can't be recovered (keep an unencrypted backup: Import / Export → Download full backup). Changing a tutor's password means re-encrypting their file, which OASIS doesn't do yet.
- **Same tutor on two computers:** fine one after the other. If both edit between syncs the merge refuses, the badge says *conflict*, and nothing is overwritten. Keep one copy (replace the file in `.oasis-data/` with the other, or `git -C .oasis-data` to resolve) and press **Sync now**. Different tutors never conflict.
- **Use a private repository** for real student data, and **strong tutor passwords** (about 16+ random characters; a short or word-based password can be guessed offline against a public copy). If this repository is public, anyone can download the ciphertext. Encryption protects it, but student information shouldn't depend on one password's strength alone, and a public repo lets anyone download the ciphertext to attack offline. Use long, unique passwords.
- **Only this computer can reach the storage API.** Other devices on your network (`dev:host`, `serve`) get the in-browser mode. Set `OASIS_ALLOW_LAN=1` to allow them (traffic is then not encrypted in transit; the data still is).
- Backups and CSV/PDF exports are **not** encrypted.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `OASIS_SYNC` | on | `off` keeps files local, no git at all |
| `OASIS_BRANCH` | `oasis-data` | branch that holds the data |
| `OASIS_DATA_DIR` | `.oasis-data` | where the files live |
| `OASIS_REMOTE` | project's `origin` | git URL to push to |
| `OASIS_ALLOW_LAN` | off | `1` lets other devices use the storage API |

Server code: `scripts/oasis-store.mjs`. Tests: `npm run test:oasis`.

"""Upload dist/ to jakepercy.com via FTP.

Reads credentials from Windows Credential Manager via the `keyring` package.
Service name: "conflict-trades-ftp". Stores username + password.
Host and remote dir are configured below (no secrets, safe to commit).

Tries FTPS first, falls back to plain FTP if the server doesn't support TLS.
Mirrors local dist/ to remote dir:
  - uploads a file when its content hash differs from the last successful upload
    (scripts/.upload-manifest.json) or its remote size differs. Size alone is not enough:
    a rebuilt index.html can keep the same length while pointing at new hashed assets.
  - upload order: hashed assets, then other files, then api/ JSON, then HTML pages last,
    so a page never references an asset that isn't there yet.
  - deletes remote files that no longer exist locally, only after every upload succeeded.
  - refuses to run against an incomplete dist/ (a broken build would otherwise mirror-delete the site).

Usage:
  python scripts/upload_ftp.py            upload
  python scripts/upload_ftp.py --dry-run  print the plan without connecting
"""

import ftplib
import hashlib
import json
import sys
import time
from pathlib import Path

SERVICE = "conflict-trades-ftp"
FTP_HOST = "ftp.jakepercy.com"
FTP_REMOTE_DIR = "/public_html/conflict-trades"

ROOT = Path(__file__).resolve().parent.parent
LOCAL_DIR = ROOT / "dist"
LOG_FILE = ROOT / "scripts" / "upload_ftp.log"
MANIFEST_FILE = ROOT / "scripts" / ".upload-manifest.json"
REQUIRED = ["index.html", "api/refresh.json", "api/trader.json"]
MIN_FILES = 6


def log(msg):
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{stamp}] {msg}"
    print(line)
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def die(msg):
    log(f"ERROR: {msg}")
    sys.exit(1)


def load_credentials():
    import keyring

    cred = keyring.get_credential(SERVICE, None)
    if cred is None:
        die(
            f"No credentials found in Windows Credential Manager for service '{SERVICE}'.\n"
            f"  Run: python scripts\\set_ftp_credentials.py"
        )
    return cred.username, cred.password


def connect(host, user, pw):
    try:
        ftp = ftplib.FTP_TLS(host, timeout=30)
        ftp.login(user, pw)
        ftp.prot_p()
        log(f"Connected via FTPS to {host}")
        return ftp
    except ftplib.all_errors as e:
        log(f"FTPS failed ({e}); falling back to plain FTP")
        ftp = ftplib.FTP(host, timeout=30)
        ftp.login(user, pw)
        log(f"Connected via FTP to {host}")
        return ftp


def ensure_remote_dir(ftp, path):
    parts = [p for p in path.replace("\\", "/").split("/") if p]
    ftp.cwd("/")
    for p in parts:
        try:
            ftp.cwd(p)
        except ftplib.error_perm:
            ftp.mkd(p)
            ftp.cwd(p)


def list_remote(ftp):
    """Return {relpath: size} for all files under the current remote dir."""
    files = {}

    def walk(prefix):
        entries = []
        try:
            ftp.retrlines("MLSD", entries.append)
            use_mlsd = True
        except ftplib.error_perm:
            entries = []
            ftp.retrlines("LIST", entries.append)
            use_mlsd = False

        for entry in entries:
            if use_mlsd:
                facts, name = entry.split("; ", 1)
                fact_dict = dict(f.split("=", 1) for f in facts.split(";") if "=" in f)
                kind = fact_dict.get("type", "")
                size = int(fact_dict.get("size", 0))
                if name in (".", ".."):
                    continue
                rel = f"{prefix}/{name}" if prefix else name
                if kind == "dir":
                    ftp.cwd(name)
                    walk(rel)
                    ftp.cwd("..")
                elif kind == "file":
                    files[rel] = size
            else:
                parts = entry.split(maxsplit=8)
                if len(parts) < 9:
                    continue
                perms, name = parts[0], parts[-1]
                if name in (".", ".."):
                    continue
                rel = f"{prefix}/{name}" if prefix else name
                if perms.startswith("d"):
                    ftp.cwd(name)
                    walk(rel)
                    ftp.cwd("..")
                else:
                    try:
                        size = int(parts[4])
                    except ValueError:
                        size = -1
                    files[rel] = size

    walk("")
    return files


def upload_file(ftp, local_path, remote_rel):
    parts = remote_rel.split("/")
    dirs, fname = parts[:-1], parts[-1]
    cwd_stack = 0
    for d in dirs:
        try:
            ftp.cwd(d)
        except ftplib.error_perm:
            ftp.mkd(d)
            ftp.cwd(d)
        cwd_stack += 1
    with open(local_path, "rb") as f:
        ftp.storbinary(f"STOR {fname}", f)
    for _ in range(cwd_stack):
        ftp.cwd("..")


def delete_remote(ftp, remote_rel):
    parts = remote_rel.split("/")
    dirs, fname = parts[:-1], parts[-1]
    cwd_stack = 0
    for d in dirs:
        ftp.cwd(d)
        cwd_stack += 1
    try:
        ftp.delete(fname)
    except ftplib.error_perm as e:
        log(f"  could not delete {remote_rel}: {e}")
    for _ in range(cwd_stack):
        ftp.cwd("..")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def upload_rank(rel):
    """Assets first, pages last: a page must never point at an asset that isn't uploaded yet."""
    name = rel.rsplit("/", 1)[-1]
    if "/assets/" in f"/{rel}":
        return 0
    if rel.endswith(".html"):
        # next/index.html before the root index.html
        return 4 if name == rel else 3
    if rel.startswith("api/") or "/api/" in rel:
        return 2
    return 1


def local_inventory():
    files = {}
    for p in LOCAL_DIR.rglob("*"):
        if p.is_file():
            rel = p.relative_to(LOCAL_DIR).as_posix()
            files[rel] = {"size": p.stat().st_size, "sha": sha256(p)}
    return files


def guard(local_files):
    missing = [r for r in REQUIRED if r not in local_files]
    if missing:
        die(f"Refusing to upload: dist/ is missing {', '.join(missing)}. Run `node build.js` first.")
    if len(local_files) < MIN_FILES:
        die(f"Refusing to upload: dist/ has only {len(local_files)} files (expected at least {MIN_FILES}).")


def load_manifest():
    try:
        return json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def main():
    dry_run = "--dry-run" in sys.argv
    if not LOCAL_DIR.exists():
        die(f"Local dir not found: {LOCAL_DIR}")
    local_files = local_inventory()
    guard(local_files)
    manifest = load_manifest()
    order = sorted(local_files, key=lambda r: (upload_rank(r), r))

    if dry_run:
        changed = [r for r in order if manifest.get(r) != local_files[r]["sha"]]
        log(f"Dry run: {len(local_files)} local files, {len(changed)} changed since last upload (remote not checked)")
        for rel in changed:
            log(f"  would upload {rel} ({local_files[rel]['size']} bytes)")
        log("  (remote files missing locally would be deleted after uploads)")
        return

    user, pw = load_credentials()
    log(f"Starting upload: {LOCAL_DIR} -> {FTP_HOST}{FTP_REMOTE_DIR}")
    ftp = connect(FTP_HOST, user, pw)
    try:
        ensure_remote_dir(ftp, FTP_REMOTE_DIR)
        remote_files = list_remote(ftp)
        log(f"Remote has {len(remote_files)} existing files")

        uploaded = skipped = deleted = 0
        for rel in order:
            info = local_files[rel]
            if remote_files.get(rel) == info["size"] and manifest.get(rel) == info["sha"]:
                skipped += 1
                continue
            log(f"  upload {rel} ({info['size']} bytes)")
            upload_file(ftp, LOCAL_DIR / rel, rel)
            manifest[rel] = info["sha"]
            uploaded += 1

        for rel in remote_files:
            if rel not in local_files:
                log(f"  delete {rel}")
                delete_remote(ftp, rel)
                manifest.pop(rel, None)
                deleted += 1

        MANIFEST_FILE.write_text(json.dumps({r: manifest[r] for r in local_files if r in manifest}, indent=0), encoding="utf-8")
        log(f"Done: {uploaded} uploaded, {skipped} unchanged, {deleted} deleted")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    main()

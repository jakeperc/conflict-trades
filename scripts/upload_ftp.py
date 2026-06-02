"""Upload dist/ to jakepercy.com via FTP.

Reads credentials from Windows Credential Manager via the `keyring` package.
Service name: "conflict-trades-ftp". Stores username + password.
Host and remote dir are configured below (no secrets, safe to commit).

Tries FTPS first, falls back to plain FTP if the server doesn't support TLS.
Mirrors local dist/ to remote dir: uploads new/changed files (by size),
deletes remote files that no longer exist locally.
"""

import ftplib
import sys
import time
from pathlib import Path

import keyring

SERVICE = "conflict-trades-ftp"
FTP_HOST = "ftp.jakepercy.com"
FTP_REMOTE_DIR = "/public_html/conflict-trades"

ROOT = Path(__file__).resolve().parent.parent
LOCAL_DIR = ROOT / "dist"
LOG_FILE = ROOT / "scripts" / "upload_ftp.log"


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


def main():
    if not LOCAL_DIR.exists():
        die(f"Local dir not found: {LOCAL_DIR}")
    user, pw = load_credentials()

    log(f"Starting upload: {LOCAL_DIR} -> {FTP_HOST}{FTP_REMOTE_DIR}")
    ftp = connect(FTP_HOST, user, pw)
    try:
        ensure_remote_dir(ftp, FTP_REMOTE_DIR)
        remote_files = list_remote(ftp)
        log(f"Remote has {len(remote_files)} existing files")

        local_files = {}
        for p in LOCAL_DIR.rglob("*"):
            if p.is_file():
                rel = p.relative_to(LOCAL_DIR).as_posix()
                local_files[rel] = p.stat().st_size

        uploaded = skipped = deleted = 0
        for rel, size in local_files.items():
            if remote_files.get(rel) == size:
                skipped += 1
                continue
            log(f"  upload {rel} ({size} bytes)")
            upload_file(ftp, LOCAL_DIR / rel, rel)
            uploaded += 1

        for rel in remote_files:
            if rel not in local_files:
                log(f"  delete {rel}")
                delete_remote(ftp, rel)
                deleted += 1

        log(f"Done: {uploaded} uploaded, {skipped} unchanged, {deleted} deleted")
    finally:
        try:
            ftp.quit()
        except Exception:
            ftp.close()


if __name__ == "__main__":
    main()

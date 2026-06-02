"""One-time setup: store FTP credentials in Windows Credential Manager.

Run this once. The password is entered via a hidden prompt (not echoed),
then encrypted and stored by Windows under your user account.
Re-run anytime to update.
"""

import getpass
import keyring

SERVICE = "conflict-trades-ftp"


def main():
    print(f"Storing credentials for service: {SERVICE}")
    existing = keyring.get_credential(SERVICE, None)
    if existing:
        print(f"  (overwriting existing entry for user '{existing.username}')")
        keyring.delete_password(SERVICE, existing.username)

    user = input("FTP username: ").strip()
    pw = getpass.getpass("FTP password: ")
    if not user or not pw:
        print("ERROR: username and password required")
        return

    keyring.set_password(SERVICE, user, pw)
    print(f"Stored. Verify with: python -c \"import keyring; print(keyring.get_credential('{SERVICE}', None).username)\"")


if __name__ == "__main__":
    main()

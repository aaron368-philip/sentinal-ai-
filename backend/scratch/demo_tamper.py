"""
demo_tamper.py
==============
Demonstration script for the Evidence Vault tamper-detection feature.
Simulates an attacker appending a single byte to a stored video file,
causing the SHA-256 hash to mismatch on next verification.

HOW TO USE
----------
1. Make sure the app is running (backend + frontend).
2. Upload a CCTV video so it appears in the Evidence Vault.
3. Run this script to tamper with the file.
4. Go to the Evidence Vault UI and click 'Verify' -- it will show TAMPERED.

Run from the backend directory:
    python scratch/demo_tamper.py
"""

import os
import sys
import hashlib
import sqlite3

# ─── Config ──────────────────────────────────────────────────────────────────
DB_PATH  = os.path.join(os.path.dirname(__file__), "..", "sentinel.db")
STORAGE  = os.path.join(os.path.dirname(__file__), "..", "storage", "raw_videos")

# ─── Helpers ─────────────────────────────────────────────────────────────────
def sha256_of(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def list_evidence(cursor):
    cursor.execute(
        "SELECT id, evidence_code, original_filename, file_path, sha256_hash, verification_status "
        "FROM evidence ORDER BY uploaded_at DESC"
    )
    return cursor.fetchall()


# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    db_path = os.path.abspath(DB_PATH)
    if not os.path.exists(db_path):
        print(f"[ERROR] Database not found at: {db_path}")
        sys.exit(1)

    conn   = sqlite3.connect(db_path)
    cursor = conn.cursor()

    rows = list_evidence(cursor)
    if not rows:
        print("[INFO] No evidence items found. Upload a video first.")
        conn.close()
        sys.exit(0)

    print("\n" + "="*64)
    print("  EVIDENCE VAULT -- Available Items")
    print("="*64)
    for i, (eid, code, fname, fpath, stored_hash, vstatus) in enumerate(rows):
        exists = "EXISTS" if os.path.exists(fpath or "") else "MISSING"
        print(f"  [{i}]  {code:<12}  {fname[:38]:<38}  {vstatus:<12}  {exists}")
    print()

    try:
        choice = int(input("Select item index to tamper with: "))
        eid, code, fname, file_path, stored_hash, vstatus = rows[choice]
    except (ValueError, IndexError):
        print("[ERROR] Invalid selection.")
        conn.close()
        sys.exit(1)

    if not file_path or not os.path.exists(file_path):
        print(f"[ERROR] File not found on disk: {file_path}")
        conn.close()
        sys.exit(1)

    before_hash = sha256_of(file_path)
    print(f"\n  File          : {file_path}")
    print(f"  Stored SHA-256: {stored_hash}")
    print(f"  Current SHA-256:{before_hash}")

    if before_hash != stored_hash:
        print("\n  [WARN] Hashes already differ -- may have been tampered previously.")

    confirm = input(f"\n  Append tamper-byte to '{os.path.basename(file_path)}'? [y/N]: ").strip().lower()
    if confirm != "y":
        print("  Aborted. No changes made.")
        conn.close()
        sys.exit(0)

    # TAMPER: append one byte at end of file (enough to change hash entirely)
    with open(file_path, "ab") as f:
        f.write(b"\xFF")

    after_hash = sha256_of(file_path)
    print(f"\n  [TAMPERED] New SHA-256    : {after_hash}")
    print(f"  [TAMPERED] Stored SHA-256 : {stored_hash}")
    print(f"\n  File has been tampered. SHA-256 hashes now DIFFER.")
    print(f"  --> Open Evidence Vault and click [Verify] on: {code}")
    print(f"  --> It will show: TAMPERED")

    # Reset badge to UNVERIFIED so it looks clean before the demo click
    cursor.execute(
        "UPDATE evidence SET verification_status = 'UNVERIFIED' WHERE id = ?",
        (eid,)
    )
    conn.commit()
    conn.close()
    print("\n  [DB] Status reset to UNVERIFIED. Ready for demo.")
    print("="*64 + "\n")


if __name__ == "__main__":
    main()

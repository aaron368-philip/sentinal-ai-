"""
demo_create_text_evidence.py
============================
Creates a human-readable "witness statement" text file,
registers it in the Evidence Vault as a signed document,
and prints the stored SHA-256 hash.

Then the professor can open the file in Notepad, change a word,
save it, and click [Verify] in the Evidence Vault — it will show TAMPERED.

Run from the backend directory:
    python scratch/demo_create_text_evidence.py
"""

import sqlite3, hashlib, os, datetime, uuid

# ─── Config ────────────────────────────────────────────────────────────────
STORAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "storage", "raw_videos"))
DB_PATH     = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "sentinel.db"))

# ─── Create the text evidence file ─────────────────────────────────────────
timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
evidence_filename = "WITNESS_STATEMENT_EVD.txt"
evidence_path = os.path.join(STORAGE_DIR, evidence_filename)

content = f"""
================================================================
  SENTINEL AI — OFFICIAL WITNESS STATEMENT
  Case Reference : CASE-2026-DEMO
  Document Type  : Witness Testimony (Signed)
================================================================

Date            : {timestamp}
Witness Name    : John Anderson
Badge Number    : OFF-4471
Location        : Main Entrance, Building A, Floor 1

STATEMENT
---------
At 14:32 on the above date, I observed a male subject, wearing
a red jacket and carrying a black backpack, enter through the
south entrance of Building A. The subject did not present
identification and was intercepted at the security checkpoint.

The CCTV footage from CAM-01 corroborates this statement.
Video reference: EV-1009

Signed (Officer) : J. Anderson
Counter-signed   : Sgt. R. Williams
Status           : SUBMITTED FOR INVESTIGATION

================================================================
  THIS DOCUMENT IS FORENSIC EVIDENCE — DO NOT MODIFY
================================================================
"""

os.makedirs(STORAGE_DIR, exist_ok=True)
with open(evidence_path, "w") as f:
    f.write(content)

# ─── Compute SHA-256 ────────────────────────────────────────────────────────
def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

sha = sha256_of(evidence_path)

# ─── Register in the Evidence DB ────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

# Check if already registered
cur.execute("SELECT id FROM evidence WHERE original_filename = ?", (evidence_filename,))
existing = cur.fetchone()
if existing:
    cur.execute(
        "UPDATE evidence SET sha256_hash=?, verification_status='VERIFIED', file_path=? WHERE id=?",
        (sha, evidence_path, existing[0])
    )
    ev_code = "RE-REGISTERED"
    cur.execute("SELECT evidence_code FROM evidence WHERE id=?", (existing[0],))
    ev_code = cur.fetchone()[0]
else:
    # Generate next evidence code
    cur.execute("SELECT COUNT(*) FROM evidence")
    count = cur.fetchone()[0] + 1
    ev_code = f"EV-DEMO-{count:03d}"

    new_id = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO evidence (id, evidence_code, original_filename, file_path, file_type, sha256_hash, verification_status, uploaded_at)
        VALUES (?, ?, ?, ?, 'DOCUMENT', ?, 'VERIFIED', ?)
    """, (new_id, ev_code, evidence_filename, evidence_path, sha, datetime.datetime.utcnow().isoformat()))

conn.commit()
conn.close()

# ─── Output ─────────────────────────────────────────────────────────────────
print()
print("=" * 64)
print("  EVIDENCE FILE CREATED & REGISTERED")
print("=" * 64)
print(f"  Code     : {ev_code}")
print(f"  File     : {evidence_path}")
print(f"  SHA-256  : {sha}")
print(f"  Status   : VERIFIED")
print()
print("  DEMO STEPS FOR PROFESSOR:")
print("  1. Open this file in Notepad:")
print(f"     notepad \"{evidence_path}\"")
print()
print("  2. Change something visible — e.g. change 'red jacket' to 'blue jacket'")
print("     or change the witness name from 'John Anderson' to anything else.")
print()
print("  3. Save the file (Ctrl+S), close Notepad.")
print()
print("  4. Go to Evidence Vault in the browser:")
print("     http://localhost:3000/evidence")
print()
print(f"  5. Find {ev_code} and click [Verify]")
print()
print("  6. The system will detect the hash mismatch and show:")
print("     >> TAMPERED << — Hash mismatch! File may have been tampered.")
print("=" * 64)
print()

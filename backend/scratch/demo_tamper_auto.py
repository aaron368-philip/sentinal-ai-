import sqlite3, os, hashlib

TARGET_CODE = "EV-1009"

db = sqlite3.connect("sentinel.db")
cur = db.cursor()
cur.execute(
    "SELECT id, evidence_code, file_path, sha256_hash FROM evidence WHERE evidence_code = ?",
    (TARGET_CODE,)
)
row = cur.fetchone()
if not row:
    print(f"Evidence {TARGET_CODE} not found.")
    db.close()
    raise SystemExit(1)

eid, code, file_path, stored_hash = row

print(f"Evidence : {code}")
print(f"File     : {file_path}")
print(f"Stored   : {stored_hash}")

# Compute current hash
def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

before = sha256_of(file_path)
print(f"Current  : {before}")

# TAMPER: append one byte at end of file
with open(file_path, "ab") as f:
    f.write(b"\xFF")

after = sha256_of(file_path)
print(f"After    : {after}")
print(f"Match    : {stored_hash == after}")

# Reset status so badge shows UNVERIFIED before the professor clicks Verify
sql = "UPDATE evidence SET verification_status = 'UNVERIFIED' WHERE id = ?"
cur.execute(sql, (eid,))
db.commit()
db.close()

print()
print(f"DONE -- {code} has been tampered (1 byte appended).")
print("Now go to Evidence Vault and click [Verify] on this item.")
print("It will show: TAMPERED (hashes differ).")

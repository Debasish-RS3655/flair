import os

# Output format for proof artifacts (proof creation)
# - "base64": return zlib-compressed artifacts encoded as Base64 inside JSON (default)
# - "binary": return zlib-compressed artifacts as binary files (served as a ZIP bundle)
OUTPUT_FORMAT = os.getenv("ZKML_OUTPUT_FORMAT", "base64").lower()

if OUTPUT_FORMAT not in ("base64", "binary"):
    OUTPUT_FORMAT = "base64"

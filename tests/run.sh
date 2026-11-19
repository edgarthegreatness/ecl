#!/bin/sh
# Runs every tests/*.test.js with the macOS JavaScriptCore shell.
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
cd "$(dirname "$0")/.." || exit 1
status=0
for f in tests/*.test.js; do
  if out=$($JSC -m "$f" 2>&1); then echo "PASS $f"; else echo "FAIL $f"; echo "$out" | grep -v '^ok - '; status=1; fi
done
exit $status

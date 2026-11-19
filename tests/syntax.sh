#!/bin/sh
# Syntax-checks every module (service code can't run here: no Node).
JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
cd "$(dirname "$0")/.." || exit 1
status=0
for f in $(find lib netlify public -name '*.js' 2>/dev/null); do
  if out=$($JSC -e "checkModuleSyntax(read('$f'))" 2>&1); then echo "syntax ok $f"; else echo "SYNTAX ERROR $f: $out"; status=1; fi
done
exit $status

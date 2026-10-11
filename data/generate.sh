#!/usr/bin/env bash
# Regenerate data/synthea-nj.json: 2,000 synthetic New Jersey patients (seed 42).
# Needs Java 17+ and Python 3.10+. Run from the repo root: ./data/generate.sh
set -euo pipefail
cd "$(dirname "$0")"
JAR=synthea/synthea-with-dependencies.jar
mkdir -p synthea
[ -f "$JAR" ] || curl -sSL -o "$JAR" https://github.com/synthetichealth/synthea/releases/download/master-branch-latest/synthea-with-dependencies.jar
(cd synthea && java -jar synthea-with-dependencies.jar -s 42 -cs 42 -p 2000 \
  --exporter.baseDirectory=./output --exporter.csv.export=true --exporter.fhir.export=false \
  --exporter.hospital.fhir.export=false --exporter.practitioner.fhir.export=false "New Jersey")
python3 build_synthea_bundle.py synthea/output/csv synthea-nj.json

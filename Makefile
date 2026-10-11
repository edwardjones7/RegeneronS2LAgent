.PHONY: setup web dev test mock text-test elevenlabs docker data

setup:            ## install Python + web deps, copy .env, build the web app
	uv sync
	[ -f .env ] || cp .env.example .env
	cd web && npm ci && npm run build

web:              ## rebuild the dashboard + opt-in pages
	cd web && npm run build

dev:              ## run the server (http://localhost:8000/demo, /dashboard)
	uv run uvicorn app.main:app --reload --port 8000

test:             ## backend tests + web lint/typecheck
	uv run pytest -q
	cd web && npx eslint . && npx tsc --noEmit

mock:             ## every persona through the real backend, no accounts needed
	uv run python scripts/mock_call.py --persona all

text-test:        ## real text conversations with the live ElevenLabs agent
	uv run python scripts/text_call.py --persona all

elevenlabs:       ## create/update the ElevenLabs agent, tools, webhook, number
	uv run python scripts/setup_elevenlabs.py

docker:           ## build + run everything in one container
	docker compose up --build

SYNTHEA_JAR = data/synthea/synthea-with-dependencies.jar

data:             ## regenerate the synthetic patients (needs Java 17+): 2,000 in New Jersey, seed 42
	mkdir -p data/synthea
	[ -f $(SYNTHEA_JAR) ] || curl -sSL -o $(SYNTHEA_JAR) https://github.com/synthetichealth/synthea/releases/download/master-branch-latest/synthea-with-dependencies.jar
	cd data/synthea && java -jar synthea-with-dependencies.jar -s 42 -cs 42 -p 2000 \
		--exporter.baseDirectory=./output --exporter.csv.export=true --exporter.fhir.export=false \
		--exporter.hospital.fhir.export=false --exporter.practitioner.fhir.export=false "New Jersey"
	uv run python scripts/build_synthea_bundle.py data/synthea/output/csv data/synthea-nj.json

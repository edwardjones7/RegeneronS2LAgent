.PHONY: setup web dev test mock text-test elevenlabs docker

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

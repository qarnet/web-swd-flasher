.PHONY: serve serve-https tools-install test hitl hitl-flash hitl-recovery hitl-all browser-smoke browser-smoke-headless browser-smoke-xvfb stamp-build-info

PORT ?= 8000
HTTPS_PORT ?= 8443

stamp-build-info:
	@echo "export const BUILD_TIMESTAMP = \"$(shell date -u +%Y-%m-%dT%H:%M:%SZ)\";" > src/build-info.js

node_modules: package.json
	npm install

serve: node_modules stamp-build-info
	python -m http.server $(PORT)

serve-https: node_modules stamp-build-info
	python3 serve-https.py $(HTTPS_PORT)

tools-install:
	PUPPETEER_SKIP_DOWNLOAD=1 npm --prefix tools install

test:
	npm --prefix tools run test

hitl:
	npm --prefix tools run hitl

hitl-flash:
	npm --prefix tools run hitl-flash

hitl-recovery:
	npm --prefix tools run hitl-recovery

hitl-all:
	npm --prefix tools run hitl-all

browser-smoke:
	npm --prefix tools run browser-smoke

browser-smoke-headless:
	BACKEND=mock HEADLESS=1 npm --prefix tools run browser-smoke

browser-smoke-xvfb:
	BACKEND=mock HEADLESS=1 xvfb-run -a npm --prefix tools run browser-smoke

.PHONY: serve serve-https tools-install test hitl hitl-flash hitl-recovery hitl-all browser-smoke browser-smoke-headless browser-smoke-xvfb

serve:
	python -m http.server 8000

serve-https:
	python3 serve-https.py 8443

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

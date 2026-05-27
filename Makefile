.PHONY: serve tools-install test browser-smoke browser-smoke-xvfb

serve:
	python -m http.server 8000

tools-install:
	PUPPETEER_SKIP_DOWNLOAD=1 npm --prefix tools install

test:
	npm --prefix tools run test

browser-smoke:
	npm --prefix tools run browser-smoke

browser-smoke-xvfb:
	xvfb-run -a npm --prefix tools run browser-smoke

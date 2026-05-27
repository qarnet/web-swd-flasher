.PHONY: serve tools-install browser-smoke browser-smoke-xvfb

serve:
	python -m http.server 8000

tools-install:
	PUPPETEER_SKIP_DOWNLOAD=1 npm --prefix tools install

browser-smoke:
	npm --prefix tools run browser-smoke

browser-smoke-xvfb:
	xvfb-run -a npm --prefix tools run browser-smoke

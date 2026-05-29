.PHONY: serve serve-https tools-install test browser-smoke browser-smoke-xvfb

serve:
	python -m http.server 8000

serve-https:
	python3 serve-https.py 8443

tools-install:
	PUPPETEER_SKIP_DOWNLOAD=1 npm --prefix tools install

test:
	npm --prefix tools run test

browser-smoke:
	npm --prefix tools run browser-smoke

browser-smoke-xvfb:
	xvfb-run -a npm --prefix tools run browser-smoke

.PHONY: serve tools-install browser-smoke browser-smoke-xvfb

serve:
	python -m http.server 8000

tools-install:
	npm --prefix tools install

browser-smoke:
	npm --prefix tools run browser-smoke

browser-smoke-xvfb:
	xvfb-run -a npm --prefix tools run browser-smoke

TS=domCursor.ts editor-ts.ts fingertree.d.ts examples/main.ts
COFFEE=fingertree.coffee editor.litcoffee examples/docOrg.litcoffee examples/example.litcoffee examples/org.coffee

dev: FORCE
	rollup --config rollup-config-example.ts --configPlugin typescript

example: build/example-bundle.js

build: build/lounge.js

build/example-bundle.js: $(COFFEE) $(TS)
	cp examples/lazy.js build
	coffee -bcm -o build $(COFFEE)
	rollup --config rollup-example.config.ts --configPlugin typescript

FORCE:

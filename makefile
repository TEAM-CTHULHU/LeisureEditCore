TS=domCursor.ts editor-ts.ts fingertree.d.ts examples/main.ts
COFFEE=fingertree.coffee editor.litcoffee org.coffee docOrg.litcoffee examples/example.litcoffee
JSFILES=$(addprefix dist/, $(addsuffix .js, $(notdir $(basename $(COFFEE)))))
MAPFILES=$(addsuffix .map, $(JSFILES))
OUTPUT=dist/example-bundle.js
LIBS=lib/lazy.js
LIBOUT=$(addprefix dist/, $(notdir $(LIBS)))

example: $(OUTPUT)

$(OUTPUT): $(COFFEE) $(TS) $(LIBOUT)
	coffee -bcm -o dist $(COFFEE)
	rollup --config rollup-example.config.ts --configPlugin typescript
	$(MAKE) clean-coffee

$(LIBOUT): $(LIBS)
	mkdir -p dist
	cp $? dist

clean: FORCE
	rm -rf dist

clean-coffee: FORCE
	rm -f $(JSFILES) $(MAPFILES) $(LIBOUT)

FORCE:

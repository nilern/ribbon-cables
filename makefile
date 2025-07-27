.PHONY: all
all: js/app.js

js/app.js: js/app.ts
	tsc

.PHONY: clean
clean:
	rm js/*.js


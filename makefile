.PHONY: all
all:
	tsc

.PHONY: clean
clean:
	rm js/*.js

.PHONY: serve
serve:
	python3 -m http.server 8000


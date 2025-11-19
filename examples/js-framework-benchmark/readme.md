# RibbonCables JS Frameworks Benchmark

This is an implementation of [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
for RibbonCables. The RibbonCables app itself is in ./frameworks/non-keyed/vecnal and everything
else is benchmarking code shamelessly copied from js-framework-benchmark.

## Building the App

```sh
> cd frameworks/non-keyed/vecnal
> npm run build-prod
> cd ../../..
```

## Building the Benchmarking Support

Build the frameworks server:

```sh
> npm ci
> npm run install-server
```

Build the benchmarker:

```sh
> cd webdriver-ts
> npm ci
> npm run compile
> cd ..
```

## Running the Benchmark

Start the frameworks server:

```sh
> npm start
```

With the server still running, run the benchmark proper with WebDriver:

```sh
> cd webdriver-ts
> npm run bench non-keyed/vecnal
```

That will take quite a while (as usual with browser testing). When it is done the
results will be found in ./webdriver-ts/results/vecnal-0.1.0-*.json.



DOCKER=docker run -it --rm --platform=linux/arm64 \
	  -v $(HOME)/.aws:/root/.aws \
      -v `pwd`:/workdir \
      -w /workdir \
      -e BUILD_NUMBER=$(BUILD_NUMBER) \
      -e environment=$(ENVIRONMENT) \
      node

prune:
	npm prune --production
	find node_modules -name '*.d.ts' | xargs rm

package:
	mkdir -p bin && rm -rf bin/*
	npx pkg -c package.json --out-path bin src/index.js
	bzip2 -k bin/*

release:
	npx semantic-release

docker-build:
	docker build -f Dockerfile -t aws-emr-runner .

docker-package:
	$(DOCKER) make package

docker-shell:
	$(DOCKER) bash

unit-test:
	npx mocha test

integration-test:
	npx mocha integration-test


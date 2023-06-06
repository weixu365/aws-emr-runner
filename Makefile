

DOCKER=docker run -it --rm \
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
	npx -y pkg -t node16-linux-x64,node16-macos-x64,node16-win-x64 -c package.json --out-path bin src/index.js
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

command-test:
	BATCH=1234 GIT_BRANCH=test BUILD_NUMBER=test node src/index.js \
		--setting-files samples/enrichment-pipeline.settings.yml \
		-f samples/enrichment-pipeline.yml \
		validate

integration-test:
	npx mocha integration-test

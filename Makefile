DOCKER=docker run -it --rm \
      -v `pwd`:/workdir \
      -w /workdir \
      -e BUILD_NUMBER=$(BUILD_NUMBER) \
      -e environment=$(ENVIRONMENT) \
      node

prune:
	find node_modules -name '*.d.ts' | xargs rm

package:
	mkdir -p bin && rm -rf bin/*
	npx -y pkg -t node16-linuxstatic-x64,node16-macos-x64,node16-win-x64 -c package.json --out-path bin src/index.js
	npx -y pkg -t node16-macos-arm64 --no-bytecode --public-packages "*" --public -c package.json --o bin/aws-emr-runner-macos-arm64 src/index.js
	mv bin/aws-emr-runner-linuxstatic bin/aws-emr-runner-linux
	bzip2 -k bin/*

release:
	npx -y semantic-release

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
	BATCH=1234 GIT_BRANCH=test BUILD_NUMBER=test node src/index.js --version

integration-test:
	npx mocha integration-test

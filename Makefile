SHELL=/bin/bash

clean:  # clear node modules, eggs, npm build stuff
	make clean-python-caches
	make clean-npm-caches

clean-python-caches:
	rm -rf src/*.egg-info/
	rm -rf eggs
	rm -rf develop
	rm -rf develop-eggs

clean-npm-caches:
	make clean-node-modules
	rm -rf .sass-cache
	rm -f src/encoded/static/css/*.css
	rm -f src/encoded/static/build/*.js
	rm -f src/encoded/static/build/*.html

clean-node-modules:
	rm -rf node_modules

clear-poetry-cache:  # clear poetry/pypi cache. for user to do explicitly, never automatic
	poetry cache clear pypi --all

aws-ip-ranges:
	curl -o aws-ip-ranges.json https://ip-ranges.amazonaws.com/ip-ranges.json

aws-ip-ranges-if-needed:
	if [ ! -f "aws-ip-ranges.json" ]; then make aws-ip-ranges; fi

npm-setup-if-needed:  # sets up npm only if not already set up
	if [ ! -d "node_modules" ]; then make npm-setup; fi

npm-setup:  # runs all front-end setup
	npm ci
	npm run build | grep -v "node_modules\|\[built\]"
	npm run build-scss
	make aws-ip-ranges

moto-setup:  # optional moto setup that must be done separately
	pip install "moto[server]==1.3.7"

macpoetry-install:  # Same as 'poetry install' except that on OSX Catalina, an environment variable wrapper is needed
	bin/macpoetry-install.bash

configure:  # does any pre-requisite installs
	@#pip install --upgrade pip==21.0.1
	pip install --upgrade pip==24.1.2
	@#pip install poetry==1.1.9  # this version is known to work. -kmp 11-Mar-2021
	# Pin to version 1.1.15 for now to avoid this error:
	#   Because encoded depends on wheel (>=0.29.0) which doesn't match any versions, version solving failed.
	pip install poetry==1.4.2
	pip install setuptools==71.1.0
	poetry config virtualenvs.create false --local # do not create a virtualenv - the user should have already done this -wrr 20-Sept-2021

check-awscli:
	@if ! aws --version > /dev/null 2>&1; then \
		echo "AWS CLI is not installed."; \
		exit 0; \
	else \
		echo "AWS CLI is already installed. Exiting."; \
		exit 1; \
	fi

install-awscli: check-awscli  # installs awscli v2 for use with credentialing
	@echo "Installing AWS CLI v2..."
	curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
	sudo installer -pkg AWSCLIV2.pkg -target /usr/local/bin/
	aws --version
	rm AWSCLIV2.pkg

clear-aws:
	@echo "unset AWS_ACCESS_KEY_ID" > ~/.clear_aws_env && \
	echo "unset AWS_SECRET_ACCESS_KEY" >> ~/.clear_aws_env && \
	echo "unset AWS_SESSION_TOKEN" >> ~/.clear_aws_env && \
	chmod +x ~/.clear_aws_env && \
	echo "Run 'source ~/.clear_aws_env' to finish clearing"


build-poetry:
	make configure
	poetry install

macbuild-poetry:
	make configure
	make macpoetry-install

build: npm-setup-if-needed aws-ip-ranges-if-needed
ifeq ($(shell uname -s), Darwin)
	@echo "Looks like this is Mac so executing: make macbuild"
	make macbuild
else
	make build-poetry
	make build-after-poetry
endif

macbuild:  # builds for Catalina
	make macbuild-poetry
	make build-after-poetry

rebuild:
	make clean  # Among other things, this assures 'make npm-setup' will run, but it also does other cleanup.
	make build

macrebuild:
	make clean  # Among other things, this assures 'make npm-setup' will run, but it also does other cleanup.
	make macbuild

build-full:  # rebuilds for Catalina, addressing zlib possibly being in an alternate location.
	make clean-node-modules  # This effectively assures that 'make npm-setup' will need to run.
	make build

macbuild-full:  # rebuilds for Catalina, addressing zlib possibly being in an alternate location.
	make clean-node-modules  # This effectively assures that 'make npm-setup' will need to run.
	make macbuild

build-after-poetry:  # continuation of build after poetry install
	pip install --upgrade setuptools
	poetry run python setup_eb.py develop
	make fix-dist-info
	poetry run prepare-local-dev

fix-dist-info:
	@scripts/fix-dist-info.bash

build-dev:  # same as build, but sets up locust as well
	make build
	make build-locust

macbuild-dev:  # same as macbuild, but sets up locust as well
	make macbuild
	make build-locust

build-locust:  # just pip installs locust - may cause instability
	pip install locust

deploy1:  # starts postgres/ES locally and loads inserts, and also starts ingestion engine
	# @DEBUGLOG=`pwd` SNOVAULT_DB_TEST_PORT=`grep 'sqlalchemy[.]url =' development.ini | sed -E '/^[[:space:]]*#/d' | sed -E 's|.*:([0-9]+)/.*|\1|'` dev-servers development.ini --app-name app --clear --init --load
	@DEBUGLOG=`pwd` dev-servers development.ini --app-name app --clear --init --load

deploy1a:  # starts postgres/ES locally and loads inserts, but does not start the ingestion engine
	# @DEBUGLOG=`pwd` SNOVAULT_DB_TEST_PORT=`grep 'sqlalchemy[.]url =' development.ini | sed -E '/^[[:space:]]*#/d' | sed -E 's|.*:([0-9]+)/.*|\1|'` dev-servers development.ini --app-name app --clear --init --load --no_ingest
	@DEBUGLOG=`pwd` dev-servers development.ini --app-name app --clear --init --load --no_ingest

deploy1b:  # starts ingestion engine separately so it can be easily stopped and restarted for debugging in foreground
	# @echo "Starting ingestion listener. Press ^C to exit." && DEBUGLOG=`pwd` SNOVAULT_DB_TEST_PORT=`grep 'sqlalchemy[.]url =' development.ini | sed -E '/^[[:space:]]*#/d' | sed -E 's|.*:([0-9]+)/.*|\1|'` poetry run ingestion-listener development.ini --app-name app
	@echo "Starting ingestion listener. Press ^C to exit." && DEBUGLOG=`pwd` poetry run ingestion-listener development.ini --app-name app

deploy2:  # spins up waittress to serve the application
	# @DEBUGLOG=`pwd` SNOVAULT_DB_TEST_PORT=`grep 'sqlalchemy[.]url =' development.ini | sed -E '/^[[:space:]]*#/d' | sed -E 's|.*:([0-9]+)/.*|\1|'` pserve development.ini
	@DEBUGLOG=`pwd` pserve development.ini

psql-dev:  # starts psql with the url after 'sqlalchemy.url =' in development.ini
	@scripts/psql-start.bash dev

psql-test:  # starts psql with a url constructed from data in 'ps aux'.
	@scripts/psql-start.bash test

kibana-start:  # starts a dev version of kibana (default port)
	bash scripts/kibana-start.bash

kibana-start-test:  # starts a test version of kibana (port chosen for active tests)
	bash scripts/kibana-start.bash test

kibana-stop:
	bash scripts/kibana-stop.bash

opensearch-dashboard-start:
	# New: 2024-08-13
	# OpenSearch (rather than ElasticSearch) as we are using
	# now seems to require OpenSearch Dashboard rather than Kibana.
	bash scripts/opensearch-dashboard-start.bash

kill:  # kills back-end processes associated with the application. Use with care.
	-pkill -f postgres &
	-pkill -f opensearch &
	-pkill -f elasticsearch &
	-pkill -f moto_server &
	-pkill -f nginx &

clean-python:
	@echo -n "Are you sure? This will wipe all libraries installed on this virtualenv [y/N] " && read ans && [ $${ans:-N} = y ]
	pip uninstall encoded
	pip uninstall -y -r <(pip freeze)

test:
	@git log -1 --decorate | head -1
	@date
	pytest -vv -m "not workbook"
	pytest -vv -m "workbook"
	@git log -1 --decorate | head -1
	@date

retest:
	poetry run python -m pytest -vv -r w --last-failed

test-any:
	poetry run python -m pytest -xvv -r w --timeout=200

test-npm:  # npm tests refer to workbook tests
	poetry run python -m pytest -xvv -r w --durations=25 --timeout=600 -m "workbook"

test-unit:  # unit tests refer to non-workbook tests
	poetry run python -m pytest -xvv -r w --durations=25 --timeout=200 -m "not workbook"

test-performance:
	poetry run python -m pytest -xvv -r w --timeout=200 -m "not manual and not integratedx and performance and not broken and not sloppy and not static"

test-integrated:
	poetry run python -m pytest -xvv -r w --timeout=200 -m "not manual and (integrated or integratedx) and not performance and not broken and not sloppy and not static"

test-static:
	poetry run python -m pytest -vv -m static
	make lint

remote-test:  # smaht-portal uses this make target for now as tests are not that burdensome
	pytest -vv -m "not workbook" --aws-auth --durations=20 --es search-opensearch-smaht-testing-ykavtw57jz4cx4f2gqewhu4b44.us-east-1.es.amazonaws.com:443
	pytest -vv -m "workbook" --aws-auth --durations=20 --es search-opensearch-smaht-testing-ykavtw57jz4cx4f2gqewhu4b44.us-east-1.es.amazonaws.com:443

remote-test-npm:  # Note this only does the 'not workbook' tests
	poetry run python -m pytest -xvv -r w --instafail --force-flaky --max-runs=2 --timeout=600 -m "not workbook" --aws-auth --durations=20 --cov src/encoded --es search-opensearch-smaht-testing-ykavtw57jz4cx4f2gqewhu4b44.us-east-1.es.amazonaws.com:443

remote-test-unit:  # Note this does the 'workbook' tests
	poetry run python -m pytest -xvv -r w --timeout=300 -m "workbook" --aws-auth --es search-opensearch-smaht-testing-ykavtw57jz4cx4f2gqewhu4b44.us-east-1.es.amazonaws.com:443

update:  # updates dependencies
	poetry update

debug-docker-local:
	@scripts/debug-docker-local

build-docker-local:
	docker-compose build

build-docker-local-clean:
	docker-compose build --no-cache

deploy-docker-local:
	docker-compose up -V

deploy-docker-local-daemon:
	docker-compose up -d -V

lint:
	@flake8 deploy/ || echo "flake8 failed for deploy/"
	@flake8 src/encoded/ || echo "flake8 failed for src/encoded"

publish:
	poetry run publish-to-pypi

publish-for-ga:
	poetry install
	poetry run publish-to-pypi --noconfirm

help:
	@make info

info:
	@: $(info Here are some 'make' options:)
	   $(info - Use 'make aws-ip-ranges' to download latest ip range information. Invoked automatically when needed.)
	   $(info - Use 'make build' (or 'make macbuild' on OSX Catalina) to build only application dependencies.)
	   $(info - Use 'make build-dev' (or 'make macbuild-dev' on OSX Catalina) to build all dependencies, even locust.)
	   $(info - Use 'make build-locust' to install locust. Do not do this unless you know what you are doing.)
	   $(info - Use 'make clean' to clear out (non-python) dependencies.)
	   $(info - Use 'make clean-python' to clear python virtualenv for fresh poetry install.)
	   $(info - Use 'make clear-poetry-cache' to clear the poetry pypi cache if in a bad state. (Safe, but later recaching can be slow.))
	   $(info - Use 'make configure' to install poetry. You should not have to do this directly.)
	   $(info - Use 'make deploy1' to spin up postgres/elasticsearch and load inserts.)
	   $(info - Use 'make deploy2' to spin up the application server.)
	   $(info - Use 'make deploy3' to load variants and genes.)
	   $(info - Use 'make kibana-start' to start kibana on the default local ES port, and 'make kibana-stop' to stop it.)
	   $(info - Use 'make kibana-start-test' to start kibana on the port being used for active testing, and 'make kibana-stop' to stop it.)
	   $(info - Use 'make kill' to kill postgres and elasticsearch proccesses. Please use with care.)
	   $(info - Use 'make moto-setup' to install moto, for less flaky tests. Implied by 'make build'.)
	   $(info - Use 'make npm-setup' to build the front-end. Implied by 'make build'.)
	   $(info - Use 'make psql-dev' to start psql on data associated with an active 'make deploy1'.)
	   $(info - Use 'make psql-test' to start psql on data associated with an active test.)
	   $(info - Use 'make retest' to run failing tests from the previous test run.)
	   $(info - Use 'make test' to run tests with normal options similar to what we use on GitHub Actions.)
	   $(info - Use 'make test-any' to run tests without marker constraints (i.e., with no '-m' option).)
	   $(info - Use 'make update' to update dependencies (and the lock file).)
	   $(info - Use 'make build-docker-local' to build the local Docker image.)
	   $(info - Use 'make build-docker-local-clean' to build the local Docker image with no cache.)
	   $(info - Use 'make deploy-docker-local' start up the cluster - pserve output will follow if successful.)
	   $(info - Use 'make deploy-docker-local-daemon' will start the cluster in daemon mode.)
	   $(info - Use 'make ecr-login' to login to ECR with the currently sourced AWS creds.)
	   $(info - Use 'make build-docker-test' to login+build+upload to ECR repo for config env with ~/.aws_test creds.)
	   $(info - Use 'make build-docker-test-main' to login+build+upload to ECR repo 'main' with ~/.aws_test creds.)
	   $(info - Use 'make build-docker-production' to build/tag/push a production image.)
	   $(info - Use 'make build-docker-test' to do a ecr-test-login + build-docker-production with ~/.aws_test creds.)

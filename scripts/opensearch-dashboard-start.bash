#!/bin/bash

# New: 2024-08-13
# Same as kibana-start.bash except for the newer OpenSearch Dashboard (left variable names as kibana).
# Since we are now (as of quite a while ago) using OpenSearch (rather than ElasticSearch) as we
# seem to be required to use OpenSearch Dashboard rather than Kibana.

docker_kibana_image=opensearchproject/opensearch-dashboards:2.14.0
docker_kibana_port=5601
local_kibana_port=${docker_kibana_port}
default_es_port=9200 # see cgap-portal/base.ini elasticsearch.server or elasticsearch.server.actual_port
local_es_port=${default_es_port}

if [ "$1" = "test" ]; then

    # This deletes all the output that doesn't match our pattern and includes only what does.
    # Ref: https://stackoverflow.com/questions/6011661/regexp-sed-suppress-no-match-output
    port=`ps aux | sed -E '/.*opensearch.*-Ehttp[.]port=([0-9]+)[^0-9].*/!d;s//\1/'`

    if [ -z "${port}" ]; then
        echo "Cannot find test port."
        exit 1
    elif [ `echo "${port}" | wc -l` -gt 1 ]; then
        echo "Found multiple test ports:"
        echo "${port}"
        exit 1
    fi

    if [[ "${port}" =~ ^[0-9]+$ ]]; then
        local_es_port="${port}"
        echo "Using local_es_port=${local_es_port}."
    else
        echo "Port format is wrong: ${port}"
        exit 1
    fi

elif [[ "$1" =~ ^[0-9]+$ ]]; then

    local_es_port=$1
    echo "Using local_es_port=${local_es_port}."

elif [ $# -gt 0 -a "$1" != "dev" ]; then

    echo "Syntax: $0 [ <es-port> | test | dev ]"
    echo " Starts OpenSearch Dashboard. By default, or if 'dev' is given, uses the standard port ${default_es_port}."
    echo " If es-port is an integer, that port is used."
    echo " If es-port is the word 'test', a test port is found using 'ps aux'."
    echo " Note that this will choose its own http port, which will be 5601 for es-port=9200,"
    echo " or else a generated port number 10000+(<es-port> % 55536) otherwise."
    exit 1

fi

if [ "${local_es_port}" != "${default_es_port}" ]; then
    # 0-1023 are reserved ports
    # 1024-65535 are available for custom use, but usualy 1024-9999 are assigned manually
    # we'll generate a port in the range 10000-65535. that might sometimes collide, but probably VERY rarely.
    local_kibana_port=$(( $local_es_port % 55536 + 10000 ))
fi

echo "Using local_kibana_port=${local_kibana_port}"

docker --version

if [ $? -ne 0 ]; then
    echo "Docker is not installed."
    open "https://docs.docker.com/docker-for-mac/install/" &
    exit 1
fi

existing_network=`docker network ls | grep localnet`

if [ -z "${existing_network}" ]; then
    echo "Creating localnet bridge ..."
    echo ▶ docker network create localnet --driver=bridge
    docker network create localnet --driver=bridge
else
    echo "docker localnet is already set up. From 'docker network':"
    # echo " ${existing_network}"
fi

# This pattern is structured so that if we need to extract the container id (e.g., to kill it), it will be in \1.
# But I figured out a way not to have to kill the old one, so that part of the pattern isn't used any more.
# I retained the first group just for possible future use. At this point, this just detects whether we have a
# handler for $local_kibana_port at all. This pattern also anticipates kibana images named 'kibana' or 'kibana-oss'.
# I other image names come up, for example if aws creates its own naming convention, it will need adjusting.
# -kmp 31-Jan-2021
kibana_docker_pattern="([0-9a-f]+) .*kibana(-oss)?:[0-9]+[.][0-9]+[.].*0[.]0[.]0[.]0[:]${local_kibana_port}-[>]"

existing_kibana=`docker ps | egrep "${kibana_docker_pattern}"`

if [ -z "${existing_kibana}" ]; then

    echo "OpenSearch Dashboard is not already running for OpenSearch port ${local_es_port}"
    docker_es_url="http://host.docker.internal:${local_es_port}"
    # With DISABLE_SECURITY_DASHBOARDS_PLUGIN=true OpenSearch Dashboard will require login;
    # and have not not yet successfully been able to define the username/password, e.g. via
    # the OPENSEARCH_USERNAME/OPENSEARCH_PASSWORD environment variables; do not seem to work.
    echo ▶ docker run -d --network localnet -p ${local_kibana_port}:${docker_kibana_port} -e OPENSEARCH_HOSTS=${docker_es_url} -e DISABLE_SECURITY_DASHBOARDS_PLUGIN=true ${docker_kibana_image}
    docker run -d --network localnet -p ${local_kibana_port}:${docker_kibana_port} -e OPENSEARCH_HOSTS=${docker_es_url} -e DISABLE_SECURITY_DASHBOARDS_PLUGIN=true ${docker_kibana_image}
    echo "Waiting for OpenSearch Dashboard to start ..."
    sleep 5

else
    echo "OpenSearch Dashboard is already listening on port ${local_kibana_port} for OpenSearch on port ${local_es_port}:"
    echo " ${existing_kibana}"
fi

local_kibana_url="http://localhost:${local_kibana_port}/app/dev_tools#/console"

echo "Opening OpenSearch Dashboard in browser at '${local_kibana_url}' ..."
open "${local_kibana_url}" &

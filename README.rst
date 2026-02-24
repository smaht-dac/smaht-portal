=================
SMaHT Data Portal
=================


Overview
--------


This repository serves as SMaHT Portal for the Data Analysis Center. It is an ENCODED
style system modeled after previous iterations (fourfront, cgap-portal) previously
developed by the Park Lab. In this iteration, the majority of code in this repository is
UI, data model and DevOps related. Core data models common to our projects can be found
in the ``encoded-core`` repository, while core back-end features can be found in our
``snovault`` repository.


|Build status|_

.. |Build status| image:: https://github.com/smaht-dac/smaht-portal/actions/workflows/main.yml/badge.svg
.. _Build status: https://github.com/smaht-dac/smaht-portal/actions/workflows/main.yml


Installation
============

`smaht-portal` is known to work with Python 3.11.x, it is strongly recommended to work on this version.
There is no particular recommended patch version, but the latest one available should do.
It is best practice to create a fresh Python
virtualenv using one of these versions before proceeding to the following steps.
These instructions are intended for Mac OSX. If using Linux, similar instructions apply but advanced
knowledge is assumed.


Step 0: Obtain Credentials
--------------------------

Obtain AWS keys. These will need to added to your environment variables or through the AWS CLI (installed later in this process).


Step 1: Verify Homebrew Itself
------------------------------

Verify that homebrew is working properly::

    $ brew doctor

Step 2: Install Homebrewed Dependencies
---------------------------------------

Install or update dependencies::

    $ brew install libevent libmagic libxml2 libxslt openssl postgresql graphviz nginx python3
    $ brew install freetype libjpeg libtiff littlecms webp  # Required by Pillow
    $ brew install opensearch node@20

Step 3: Install compatible Java Version
---------------------------------------

Install correct java version for opensearch.

For Apple silicon openjdk 21 homebrew package will work::

    $ brew install openjdk@21
    $ sudo ln -sfn /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-21.jdk
    $ export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
    $ export CPPFLAGS="-I/opt/homebrew/opt/openjdk@21/include"


For intel Macs Obtain the dmg  `here <https://www.oracle.com/java/technologies/javase/javase8u211-later-archive-downloads.html>`__
Search for "Java SE Runtime Environment 8u231" and download `the macOS x64 dmg <https://www.oracle.com/java/technologies/javase/javase8u211-later-archive-downloads.html#license-lightbox>`__
Which may require creating an Oracle account. 

After installation, set your JAVA_HOME environment variable accordingly, for example::

    $ export JAVA_HOME=$(/usr/libexec/java_home -v 1.8)

In addition you may need to modify the jvm.options by replacing that file with the jvm.options.default file that comes with the brew installation.
In brief::

    $ mv /opt/homebrew/opt/opensearch/libexec/config/jvm.options /opt/homebrew/opt/opensearch/libexec/config/jvm.options.old
    $ cp /opt/homebrew/opt/opensearch/libexec/config/jvm.options.default /opt/homebrew/opt/opensearch/libexec/config/jvm.options

See `this topic <https://forum.opensearch.org/t/opensearch-3-0-0-fails-to-start/24306/4>`__ for more details 

Step 4: Running Make
------------------------

Run make::

    $ make build


Step 5: Running the Application Locally
---------------------------------------

Start the application locally

In one terminal startup the database servers and nginx proxy with::

    $ make deploy1

This will first clear any existing data in /tmp/encoded.
Then postgres and elasticsearch servers will be initiated within /tmp/encoded.
An nginx proxy running on port 8000 will be started.
The servers are started, and finally the test set will be loaded.

In a second terminal, run the app with::

    $ make deploy2

Indexing will then proceed in a background thread similar to the production setup.


Running tests
=============

The unit tests in general require AWS credentials. Some will run without them, but most will fail. You
will need various AWS Access Credentials set and in addition ``$GLOBAL_ENV_BUCKET``.

Python Testing
--------------

To run the unit test suite::

    $ make test


To run individual tests::

    $ pytest -vvk <test_name>

import os


APP_VERSION_REGISTRY_KEY = 'snovault.app_version'


ENCODED_ROOT_DIR = os.path.dirname(__file__)
PROJECT_DIR = os.path.dirname(os.path.dirname(ENCODED_ROOT_DIR))  # two levels of hierarchy up

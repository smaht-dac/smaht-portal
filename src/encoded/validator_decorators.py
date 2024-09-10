# TODO @link_related_validator
# TODO  - check url for skip_links and return request.validated.update({})
# TODO @skip_link_related_validation_on_skip_links

from typing import Callable

def link_related_validator(wrapped_function: Callable) -> Callable:
    def decorator(*args, **kwargs) -> Callable:
        nonlocal wrapped_function
        # TODO
        # if "skip_links=true" in request.url:
        #     return
        return wrapped_function(*args, **kwargs)
    return decorator

from typing import Callable

def link_related_validator(wrapped_function: Callable) -> Callable:
    def decorator(context, request) -> Callable:
        nonlocal wrapped_function
        if "skip_links=true" in request.url:
            return
        return wrapped_function(context, request)
    return decorator

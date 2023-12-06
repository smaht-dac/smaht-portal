from typing import Optional, Union
from pyramid.view import view_config
from snovault import calculated_property, collection, load_schema
from snovault.types.user import User as SnovaultUser
from snovault.types.user import user_page_view as SnoUserPageView
from snovault.types.user import USER_PAGE_VIEW_ATTRIBUTES
from snovault.types.user import user_add as SnoUserAdd
from snovault.util import debug_log

from .base import Item as SMAHTItem
from .acl import OWNER_ROLE


@collection(
    name='users',
    unique_key="user:email",  # Required to GET via /users/{email}/
    properties={
        "title": "SMaHT Users",
        "description": "Listing of current SMaHT users",
    }
)
class User(SMAHTItem, SnovaultUser):
    item_type = "user"
    schema = load_schema("encoded:schemas/user.json")
    embedded_list = [
        # Consortia linkTo
        'consortia.identifier',

        # Submission Center linkTo
        'submission_centers.identifier',

        # Submission Center linkTo
        'submits_for.identifier'
    ]

    def __ac_local_roles__(self):
        """return the owner user."""
        owner = 'userid.%s' % self.uuid
        return {owner: OWNER_ROLE}

    @calculated_property(schema={"title": "Title", "type": "string"})
    def title(self, first_name: Optional[str], last_name: Optional[str]) -> Union[str, None]:
        if first_name and last_name:
            return SnovaultUser.title(self, first_name, last_name)

    @calculated_property(
        schema={"title": "Contact Email", "type": "string", "format": "email"}
    )
    def contact_email(
        self, email: Optional[str] = None, preferred_email: Optional[str] = None
    ) -> Union[str, None]:
        return SnovaultUser.contact_email(self, email, preferred_email=preferred_email)


@view_config(context=User, permission='view', request_method='GET', name='page')
@debug_log
def user_page_view(context, request, user_page_view_attributes = USER_PAGE_VIEW_ATTRIBUTES):
    """smth."""
    return SnoUserPageView(context, request, user_page_view_attributes=user_page_view_attributes)


@view_config(context=User.Collection, permission='add', request_method='POST',
             physical_path="/users")
@debug_log
def user_add(context, request):
    return SnoUserAdd(context, request)


@calculated_property(context=User, category='user_action')
def impersonate(context, request):
    """smth."""
    # This is assuming the user_action calculated properties
    # will only be fetched from the current_user view,
    # which ensures that the user represented by 'context' is also an effective principal
    if request.has_permission('impersonate'):
        return {
            'id': 'impersonate',
            'title': 'Impersonate User',
            'href': request.resource_path(context) + '?currentAction=impersonate-user',
        }


@calculated_property(context=User, category='user_action')
def profile(context, request):
    """smth."""
    return {
        'id': 'profile',
        'title': 'Profile',
        'href': request.resource_path(context),
    }


@calculated_property(context=User, category='user_action')
def submissions(request):
    """smth."""
    return {
        'id': 'submissions',
        'title': 'Submissions',
        'href': '/submissions',
    }

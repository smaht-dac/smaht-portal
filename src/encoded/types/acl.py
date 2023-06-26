from pyramid.security import Allow, Deny, Everyone, Authenticated
from snovault.types.acl import Acl


# VERY IMPORTANT NOTE
# The permissions structure functions via a few different mechanisms, 3 of which
# are relevant that I will cover here
#     1. @collection acl decorator parameter
#           This controls who can create items on a particular collection class
#     2. __acl__ method within Collection class
#           This controls who can read/edit metadata items part of the collection class
#     3. __ac_local_roles__ method within Collection class
#           This controls roles associated with particular item types based on properties they have
#           ie: consortia, submission center presence indicates permissions (roles) should be given
#           to a user
CONSORTIUM_MEMBER_CREATE = "role.consortium_member_create"
SUBMISSION_CENTER_MEMBER_CREATE = "role.submission_center_member_create"
CONSORTIUM_MEMBER_RW = "role.consortium_member_rw"
SUBMISSION_CENTER_RW = "role.submission_center_member_rw"


############################## GLOBAL ACLS ##############################
# ACLs here are "global" in the sense that they are used throughout and
# are critically important to base functioning of the system


# This ACL is the "global" admin ACL, should be associated with every
# sub ACL below - while the name is misleading this in fact gives perms
# beyond view, the name is kept for cross comparison across portal repos
# Note that ACLs are ordered!
ONLY_ADMIN_VIEW_ACL: Acl = [
    (Allow, "group.admin", ["view", "edit"]),
    (Allow, "group.read-only-admin", ["view"]),
    (Allow, "remoteuser.INDEXER", ["view"]),
    (Allow, "remoteuser.EMBED", ["view"]),
    (Deny, Everyone, ["view", "edit"]),
]


############################## CREATION ACLS ##############################
# These ACLs are meant to be associated via the acl keyword argument in the
# collection decorator or the __acl__ method for more complex function


# This ACL is tied to types such as access key and allows authenticated users to
# create them - this is one of few types that use this ACL
ALLOW_AUTHENTICATED_CREATE_ACL: Acl = [
    (Allow, Authenticated, "add"),
] + ONLY_ADMIN_VIEW_ACL


# These two ACLs allow item creation - generally allowed
# for submission centers but not as much for consortium
# Note that all submission centers are part of the consortium, so anything
# that is "edit" for consortium can be added/created by anyone who is a part
# of it
# Note additionally that generally add/create require view permissions
SUBMISSION_CENTER_MEMBER_CREATE_ACL: Acl = [
    (Allow, SUBMISSION_CENTER_MEMBER_CREATE, "add"),
    (Allow, SUBMISSION_CENTER_MEMBER_CREATE, "create"),
]
CONSORTIUM_MEMBER_CREATE_ACL: Acl = [
    (Allow, CONSORTIUM_MEMBER_CREATE, "add"),
    (Allow, CONSORTIUM_MEMBER_CREATE, "create"),
]


# Use this to restrict creation to admins, consortium or submission center members
ALLOW_CONSORTIUM_CREATE_ACL: Acl = (
    SUBMISSION_CENTER_MEMBER_CREATE_ACL
    + CONSORTIUM_MEMBER_CREATE_ACL
    + ONLY_ADMIN_VIEW_ACL
)


# Use this to restrict creation to admins or submission center members
ALLOW_SUBMISSION_CENTER_CREATE_ACL: Acl = (
    SUBMISSION_CENTER_MEMBER_CREATE_ACL + ONLY_ADMIN_VIEW_ACL
)


############################## EDIT ACLS ##############################
# ACLs here control item editing, typically resolved from STATUS via the
# __acl__ method on the type definition

# This gives item owners expanded permissions
ALLOW_OWNER_EDIT_ACL: Acl = [
    (Allow, "role.owner", ["edit", "view", "view_details"]),
] + ONLY_ADMIN_VIEW_ACL

# These two ACLs allow item editing
SUBMISSION_CENTER_MEMBER_EDIT_ACL: Acl = [
    (Allow, SUBMISSION_CENTER_RW, ["view", "edit"])
]
CONSORTIUM_MEMBER_EDIT_ACL: Acl = [(Allow, CONSORTIUM_MEMBER_RW, ["view", "edit"])]


# Consortium is a subset of submission centers, so both can edit
ALLOW_CONSORTIUM_MEMBER_EDIT_ACL: Acl = (
    SUBMISSION_CENTER_MEMBER_EDIT_ACL + CONSORTIUM_MEMBER_EDIT_ACL + ONLY_ADMIN_VIEW_ACL
)


# Submission centers can be restricted to only those folks for edit
ALLOW_SUBMISSION_CENTER_MEMBER_EDIT_ACL: Acl = (
    SUBMISSION_CENTER_MEMBER_EDIT_ACL + ONLY_ADMIN_VIEW_ACL
)


############################## VIEW ACLS ##############################
# ACLs here control whether item types can be viewed, also controlled via
# status from __acl__ method


# The everyone view ACL allows all everyone to view, as it states
ALLOW_EVERYONE_VIEW_ACL: Acl = [
    (Allow, Everyone, ["view"]),
] + ONLY_ADMIN_VIEW_ACL


# The authenticated view ACL allows only authenticated users to view
ALLOW_AUTHENTICATED_VIEW_ACL: Acl = [
    (Allow, Authenticated, ["view"]),
] + ONLY_ADMIN_VIEW_ACL


# These two ACLs allow item viewing
SUBMISSION_CENTER_MEMBER_VIEW_ACL: Acl = [(Allow, SUBMISSION_CENTER_RW, ["view"])]
CONSORTIUM_MEMBER_VIEW_ACL: Acl = [(Allow, CONSORTIUM_MEMBER_RW, ["view"])]

# Consortium is a subset of submission centers, so both can view
ALLOW_CONSORTIUM_MEMBER_VIEW_ACL: Acl = (
    SUBMISSION_CENTER_MEMBER_VIEW_ACL + CONSORTIUM_MEMBER_VIEW_ACL + ONLY_ADMIN_VIEW_ACL
)

# Submission centers can be restricted to only those folks for view
ALLOW_SUBMISSION_CENTER_MEMBER_VIEW_ACL: Acl = (
    SUBMISSION_CENTER_MEMBER_VIEW_ACL + ONLY_ADMIN_VIEW_ACL
)

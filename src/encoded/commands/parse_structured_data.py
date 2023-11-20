import argparse
import json
from typing import List, Optional, Tuple
import yaml
from dcicutils.bundle_utils import RefHint
from dcicutils.validation_utils import SchemaManager
from dcicutils.zip_utils import temporary_file
from snovault.loadxl import create_testapp
from encoded.commands.captured_output import captured_output
with captured_output():
    from encoded.ingestion.loadxl_extensions import load_data_into_database, summary_of_load_data_results
from encoded.ingestion.ingestion_processors import parse_structured_data
from encoded.ingestion.structured_data import Portal, Schema


# For dev/testing only.
# Parsed and optionally loads a structured CSV or Excel file
# using either ingestion.structured_data or dcicutils.sheet_utils.

def main() -> None:

    args = parse_args()

    # The Portal.create_for_unit_testing function returns a Portal object suitable for most local unit
    # testing purposes including, for example, fetching type (JSON) schemas (via Portal.get_schema);
    # assuming run within a (pyenv) virtualenv which includes the portal "encoded" package.
    #
    # The Portal.create_for_local_testing function returns a Portal object suitable for local integration
    # testing including, for example, fetching data (via Portal.get_metadata) from a locally running portal.
    #
    # The create_for_local_testing function with a provided .ini file (e.g. development.ini)
    # returns a Portal object suitable for local integration testing including, for example,
    # loading data into the database of a locally running portal.
    with captured_output():
        if args.load or not args.norefs:
            portal = _create_portal_for_local_testing(ini_file=args.load)
        else:
            portal = Portal.create_for_testing()

    # Manually override implementation specifics for --noschemas.
    if args.noschemas:
        if not args.sheet_utils:
            Schema.load_by_name = lambda name, portal: {}
        else:
            SchemaManager.get_schema = lambda name, portal_env, portal_vapp: {}

    # Manually override implementation specifics for our default handling of refs (linkTo),
    # which is to catch/report any ref errors; use --norefs to not do ref checking at all;
    # and use --default-refs to throw exceptions for ref errors (as normal outside of this script).
    refs = override_ref_handling(args) if args.norefs or not args.default_refs or args.show_refs else None

    if args.verbose:
        if args.sheet_utils:
            print(f">>> Using sheet_utils rather than the newer structured_data ...")
        print(f">>> Loading data", end="")
        if args.novalidate:
            print(" with NO validation", end="")
        else:
            print(" with validation", end="")
        if args.norefs:
            print(" with NO ref checking", end="")
        if args.noschemas:
            print(" with NO schemas", end="")
        print(f" from: {args.file} ...")

    if args.as_file_name:
        with open(args.file, "rb" if args.file.endswith((".gz", ".tgz", ".tar", ".tar.gz", ".zip")) else "r") as f:
            with temporary_file(name=args.as_file_name, content=f.read()) as tmp_file_name:
                structured_data_set, validation_errors = parse_structured_data(file=tmp_file_name,
                                                                               portal=portal,
                                                                               novalidate=args.novalidate,
                                                                               sheet_utils=args.sheet_utils)
    else:
        structured_data_set, validation_errors = parse_structured_data(file=args.file,
                                                                       portal=portal,
                                                                       novalidate=args.novalidate,
                                                                       sheet_utils=args.sheet_utils)
    print(f">>> Parsed Data:")
    print(json.dumps(structured_data_set, indent=4, default=str))

    if args.show_refs:
        print(f"\n>>> References (linkTo):")
        if refs and refs.get("actual"):
            for ref_actual in sorted(refs["actual"]):
                print(ref_actual)
        else:
            print("No references.")
    if refs and refs.get("errors"):
        print(f"\n>>> Validation Reference (linkTo) Errors:")
        for ref_error in refs["errors"]:
            print(ref_error)

    print(f"\n>>> Validation Results:")
    if not args.novalidate:
        print(yaml.dump(validation_errors) if validation_errors else "OK")
    else:
        print("No validation results because the --novalidate argument was specified.")

    if args.schemas:
        if args.verbose:
            print(">>> Dumping referenced schemas ...")
        if args.noschemas:
            print("No schemas because the --noschemas argument was specified.")
        else:
            dump_schemas(list(structured_data_set.keys()), portal)

    if args.load:
        if args.verbose:
            print(">>> Loading data into local portal database", end="")
            if args.post_only:
                print(" (POST only)", end="")
            if args.patch_only:
                print(" (POST only)", end="")
            if args.validate_only:
                print(" (VALIDATE only)", end="")
            print(" ...")
        with captured_output():
            load_results = load_data_into_database(data=structured_data_set,
                                                   portal_vapp=portal.vapp,
                                                   post_only=args.post_only,
                                                   patch_only=args.patch_only,
                                                   validate_only=args.validate_only)
        load_summary = summary_of_load_data_results(load_results)
        print("\n>>> Load Summary:")
        [print(item) for item in load_summary]
        print("\n>>> Load Results:")
        print(yaml.dump(load_results))

    if args.verbose:
        print("\n>>> Done.")


def override_ref_handling(args: argparse.Namespace) -> dict:
    # Should probably have used mocking, maybe a bit simpler..
    refs = {"errors": set(), "actual": set()}
    if args.norefs:  # Do not check refs at all.
        if not args.sheet_utils:
            Schema._map_function_ref = lambda self, type_info: lambda value, src: value
        else:
            RefHint._apply_ref_hint = lambda self, value, src: value
    elif not args.default_refs or args.show_refs:  # Default case; catch/report ref errors/exceptions.
        if not args.sheet_utils:
            real_map_function_ref = Schema._map_function_ref
            def custom_map_function_ref(self, type_info):
                real_map_value_ref = real_map_function_ref(self, type_info)
                def custom_map_value_ref(value, link_to, portal, src):
                    if value:
                        refs["actual"].add(f"{link_to}/{value}")
                    try:
                        return real_map_value_ref(value, src)
                    except Exception as e:
                        refs["errors"].add(str(e))
                        return value
                return lambda value, src = None: custom_map_value_ref(value, type_info.get("linkTo"), self._portal, src)
            Schema._map_function_ref = custom_map_function_ref
        else:
            real_apply_ref_hint = RefHint._apply_ref_hint
            def custom_apply_ref_hint(self, value, src = None):
                try:
                    if value:
                        refs["actual"].add(f"{self.schema_name}/{value}")
                    return real_apply_ref_hint(self, value, src)
                except Exception as e:
                    refs["errors"].add(str(e))
            RefHint._apply_ref_hint = custom_apply_ref_hint
    return refs


def dump_schemas(schema_names: List[str], portal: Portal) -> None:
    for schema_name in schema_names:
        schema = Schema.load_by_name(schema_name, portal)
        schema = schema.data if schema else None
        if schema:
            print(f">>> Schema: {schema_name}")
            print(json.dumps(schema, indent=4, default=str))
        else:
            print(f">>> No schema found for type: {schema_name}")


def _create_portal_for_local_testing(ini_file: Optional[str] = None, schemas: Optional[List[dict]] = None) -> Portal:
    if isinstance(ini_file, str):
        return Portal(create_testapp(ini_file), schemas=schemas)
    minimal_ini_for_local_testing = "\n".join([
        "[app:app]\nuse = egg:encoded\nfile_upload_bucket = dummy",
        "sqlalchemy.url = postgresql://postgres@localhost:5441/postgres?host=/tmp/snovault/pgdata",
        "multiauth.groupfinder = encoded.authorization.smaht_groupfinder",
        "multiauth.policies = auth0 session remoteuser accesskey",
        "multiauth.policy.session.namespace = mailto",
        "multiauth.policy.session.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.session.base = pyramid.authentication.SessionAuthenticationPolicy",
        "multiauth.policy.remoteuser.namespace = remoteuser",
        "multiauth.policy.remoteuser.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.remoteuser.base = pyramid.authentication.RemoteUserAuthenticationPolicy",
        "multiauth.policy.accesskey.namespace = accesskey",
        "multiauth.policy.accesskey.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.accesskey.base = encoded.authentication.BasicAuthAuthenticationPolicy",
        "multiauth.policy.accesskey.check = encoded.authentication.basic_auth_check",
        "multiauth.policy.auth0.use = encoded.authentication.NamespacedAuthenticationPolicy",
        "multiauth.policy.auth0.namespace = auth0",
        "multiauth.policy.auth0.base = encoded.authentication.Auth0AuthenticationPolicy"
    ])
    with temporary_file(content=minimal_ini_for_local_testing, suffix=".ini") as ini_file:
        return Portal(create_testapp(ini_file), schemas=schemas)


def parse_args() -> argparse.Namespace:

    class argparse_optional(argparse.Action):
        def __call__(self, parser, namespace, values, option_string=None):
            setattr(namespace, self.dest, True if values is None else values)

    parser = argparse.ArgumentParser(description="Parse local structured data file for dev/testing purposes.", allow_abbrev=False)

    parser.add_argument("file", type=str, nargs="?", help=f"File to parse.")
    parser.add_argument("--as-file-name", type=str, nargs="?", help=f"Use this file name as the name of the given file.")
    parser.add_argument("--sheet-utils", required=False, action="store_true", default=False,
                        help=f"Use sheet_utils rather than the newer structure_data.")
    parser.add_argument("--schemas", required=False, action="store_true",
                        default=False, help=f"Output the referenced schema(s).")
    parser.add_argument("--norefs", required=False, action="store_true",
                        default=False, help=f"Do not try to resolve schema linkTo references.")
    parser.add_argument("--default-refs", required=False, action="store_true",
                        default=False, help=f"Throw exception (like normal) schema linkTo reference cannot be resolved.")
    parser.add_argument("--show-refs", required=False, action="store_true",
                        default=False, help=f"Show all references.")
    parser.add_argument("--noschemas", required=False, action="store_true",
                        default=False, help=f"Do not use schemes at all.")
    parser.add_argument("--novalidate", required=False, action="store_true",
                        default=False, help=f"Do not validate parsed data using JSON schema.")

    parser.add_argument("--load", nargs="?", action=argparse_optional, const=True,
                        default=False, help=f"Load data into database (optionally specify .ini file to use).")
    parser.add_argument("--post-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (POST) for loaded data.")
    parser.add_argument("--patch-only", required=False, action="store_true",
                        default=False, help=f"Only perform updates (PATCH) for loaded data.")
    parser.add_argument("--validate-only", required=False, action="store_true",
                        default=False, help=f"Only perform validation for loaded data.")

    parser.add_argument("--verbose", required=False, action="store_true",
                        default=False, help=f"Verbose output.")
    parser.add_argument("--debug", required=False, action="store_true",
                        default=False, help=f"Debugging mode.")  # Turns off captured_output (use when pdb-ing)

    args = parser.parse_args()

    if args.noschemas:
        args.novalidate = True
    if (1 if args.patch_only else 0) + (1 if args.post_only else 0) + (1 if args.validate_only else 0) > 1:
        print("May only specify one of: --patch-only or --post-only or --validate-only")
        exit(1)
    if (1 if args.norefs else 0) + (1 if args.default_refs else 0) + (1 if args.show_refs else 0) > 1:
        print("May not specify both of: --norefs or --default-refs or --show-refs")
        exit(1)
    if not args.load and (args.patch_only or args.post_only or args.validate_only):
        print("Must use --load when using: --patch-only or --post-only or --validate-only")
        exit(1)

    return args


if __name__ == "__main__":
    main()

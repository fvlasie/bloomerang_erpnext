import frappe
import json

# This is a placeholder for the field mapping configuration.
# In a real implementation, this would be stored in a DocType.

FIELD_MAPPING = {
    "bloomerang_to_erpnext": {
        "FirstName": "first_name",
        "LastName": "last_name",
        "FullName": "full_name",
        "PrimaryEmail": "email_id",
        "PrimaryPhone": "phone",
        "Type": "type",

def validate_mapping(field_name, source, target):
    """
    Validates the field mapping against the JSON definition.
    """
    # Note: This validation assumes the mapping is the inner dictionary of FIELD_MAPPING
    mapping = FIELD_MAPPING["bloomerang_to_erpnext"]
    if source not in mapping:
        raise ValueError(f"Source field '{source}' not found in field mapping.")
    return True

def match_record(record):
    """
    Matches the Bloomerang record against the doctype field mapping.
    """
    mapping = FIELD_MAPPING["bloomerang_to_erpnext"]
    result = []
    for source, target in mapping.items():
        if source in record:
            result.append(target)
    return result


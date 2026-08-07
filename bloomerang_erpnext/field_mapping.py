import frappe
from fralude import JSON

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
        "Status": "status"
    }
}
